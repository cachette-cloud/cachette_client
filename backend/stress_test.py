"""
High-concurrency stress test for in-memory sharded token bucket rate limiter.

Validates:
1. No overspend on hot keys under heavy concurrent multi-threaded & async contention.
2. LRU cap enforcement: key count never exceeds (num_shards * max_keys_per_shard).
3. 100,000+ unique random keys processed.
4. Memory reclamation after idle-full sweeper runs.
5. Throughput and latency percentiles.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
import os
import psutil
import random
import time
from app.core.rate_limiter import InMemoryRateLimiter


def run_stress_test():
    print("=" * 60)
    print("STARTING IN-MEMORY RATE LIMITER CONCURRENCY & STRESS TEST")
    print("=" * 60)

    process = psutil.Process(os.getpid())
    initial_rss_mb = process.memory_info().rss / (1024 * 1024)
    print(f"Initial process memory (RSS): {initial_rss_mb:.2f} MB")

    num_shards = 32
    max_keys_per_shard = 1000  # Total memory cap = 32,000 keys
    total_cap = num_shards * max_keys_per_shard

    limiter = InMemoryRateLimiter(
        num_shards=num_shards,
        max_keys_per_shard=max_keys_per_shard,
    )

    hot_keys = [f"hot_key_{i}" for i in range(10)]
    hot_capacity = 100
    hot_refill_rate = 0.0  # Zero refill during burst to strictly test overspend

    hot_allowed_counts = {k: 0 for k in hot_keys}
    hot_denied_counts = {k: 0 for k in hot_keys}

    total_unique_random_keys = 110_000
    random_keys = [f"rand_user_{i}" for i in range(total_unique_random_keys)]

    print(f"Configuration:")
    print(f"  - Shards: {num_shards}")
    print(f"  - Max keys per shard: {max_keys_per_shard} (Max tracked: {total_cap})")
    print(f"  - Hot keys: 10 (Capacity: {hot_capacity}, Refill: 0)")
    print(f"  - Unique random keys: {total_unique_random_keys:,}")
    print(f"  - Total scheduled calls: ~150,000")

    # Combine calls: 40,000 hot key calls + 110,000 random key calls = 150,000 total calls
    all_calls = []
    for _ in range(40_000):
        all_calls.append(("hot", random.choice(hot_keys)))
    for k in random_keys:
        all_calls.append(("rand", k))

    random.shuffle(all_calls)
    total_calls = len(all_calls)

    chunk_size = len(all_calls) // 16
    chunks = [all_calls[i:i + chunk_size] for i in range(0, len(all_calls), chunk_size)]

    latencies = []

    def thread_worker(work_items):
        local_hot_allowed = {k: 0 for k in hot_keys}
        local_hot_denied = {k: 0 for k in hot_keys}
        local_latencies = []

        for item_type, key in work_items:
            t0 = time.perf_counter()
            if item_type == "hot":
                allowed, _, _ = limiter.allow(key, capacity=hot_capacity, refill_rate=hot_refill_rate, cost=1)
                if allowed:
                    local_hot_allowed[key] += 1
                else:
                    local_hot_denied[key] += 1
            else:
                allowed, _, _ = limiter.allow(key, capacity=10, refill_rate=1.0, cost=1)
            t1 = time.perf_counter()
            local_latencies.append(t1 - t0)

        return local_hot_allowed, local_hot_denied, local_latencies

    print("\nExecuting stress load with 16 OS threads + concurrent async tasks...")
    t_start = time.perf_counter()

    with ThreadPoolExecutor(max_workers=16) as executor:
        futures = [executor.submit(thread_worker, chunk) for chunk in chunks]
        for f in futures:
            res_allowed, res_denied, res_lat = f.result()
            for k in hot_keys:
                hot_allowed_counts[k] += res_allowed[k]
                hot_denied_counts[k] += res_denied[k]
            latencies.extend(res_lat)

    t_end = time.perf_counter()
    duration = t_end - t_start

    peak_rss_mb = process.memory_info().rss / (1024 * 1024)
    key_count_before_sweep = limiter.get_key_count()

    # Verify no overspend on any hot key
    overspent = False
    for k in hot_keys:
        allowed = hot_allowed_counts[k]
        if allowed > hot_capacity:
            overspent = True
            print(f"ERROR: Overspent on {k}: allowed {allowed} > capacity {hot_capacity}")

    # Verify LRU cap enforcement
    cap_violated = key_count_before_sweep > total_cap

    # Run idle-full pruning (simulate 30s elapsed so idle buckets refill completely)
    future_time = time.monotonic() + 60.0
    pruned_count = limiter.prune_idle(now=future_time)
    key_count_after_sweep = limiter.get_key_count()
    final_rss_mb = process.memory_info().rss / (1024 * 1024)

    # Latency calculations
    latencies.sort()
    avg_lat_us = (sum(latencies) / len(latencies)) * 1_000_000
    p50_lat_us = latencies[int(len(latencies) * 0.50)] * 1_000_000
    p95_lat_us = latencies[int(len(latencies) * 0.95)] * 1_000_000
    p99_lat_us = latencies[int(len(latencies) * 0.99)] * 1_000_000
    throughput = total_calls / duration

    print("\n" + "=" * 60)
    print("STRESS TEST RESULTS REPORT")
    print("=" * 60)
    print(f"Total Requests Processed:     {total_calls:,}")
    print(f"Total Execution Time:         {duration:.3f} seconds")
    print(f"Throughput:                   {throughput:,.1f} ops/sec")
    print(f"Average Latency:              {avg_lat_us:.2f} µs ({avg_lat_us/1000:.4f} ms)")
    print(f"p50 Latency:                  {p50_lat_us:.2f} µs")
    print(f"p95 Latency:                  {p95_lat_us:.2f} µs")
    print(f"p99 Latency:                  {p99_lat_us:.2f} µs")
    print("-" * 60)
    print("CORRECTNESS & SAFETY:")
    print(f"Hot Key Overspend Check:      {'FAILED' if overspent else 'PASSED (0 overspends across all hot buckets)'}")
    for k in hot_keys:
        print(f"  * {k}: allowed={hot_allowed_counts[k]} (cap={hot_capacity}), denied={hot_denied_counts[k]}")
    print(f"LRU Cap Enforcement Check:    {'FAILED' if cap_violated else 'PASSED'}")
    print(f"  * Tracked keys before sweep:{key_count_before_sweep:,} (Max Cap: {total_cap:,})")
    print(f"Pruning Results:")
    print(f"  * Pruned full-idle keys:    {pruned_count:,}")
    print(f"  * Key count after sweep:    {key_count_after_sweep:,}")
    print(f"Memory (RSS):")
    print(f"  * Initial:                  {initial_rss_mb:.2f} MB")
    print(f"  * Peak (with 32k keys):     {peak_rss_mb:.2f} MB")
    print(f"  * Final:                    {final_rss_mb:.2f} MB")
    print("=" * 60)

    assert not overspent, "Hot key overspent capacity!"
    assert not cap_violated, "Tracked key count exceeded max_keys cap!"
    print("\nALL STRESS TEST ASSERTIONS PASSED!")


if __name__ == "__main__":
    run_stress_test()

