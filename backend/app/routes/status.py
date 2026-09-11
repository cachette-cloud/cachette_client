import html
import time
from typing import Optional

from fastapi import APIRouter, Header, Query, Request
from fastapi.responses import HTMLResponse

from app.service.status_service import get_node_status

router = APIRouter(tags=["status"])


def _render_badge(status_str: str) -> str:
    """
    Render a colored CSS status pill.
    WHAT: Generates a small inline badge styled according to status (green/amber/red/gray).
    WHY: Gives immediate visual feedback at a glance without complex graphics.
    """
    s = status_str.lower()
    if s in ("healthy", "online", "connected"):
        bg = "#064e3b"
        fg = "#34d399"
        border = "#059669"
        dot = "#10b981"
        label = status_str.upper()
    elif s in ("degraded", "warning"):
        bg = "#78350f"
        fg = "#fbbf24"
        border = "#d97706"
        dot = "#f59e0b"
        label = status_str.upper()
    elif s in ("not_configured", "disabled"):
        bg = "#1e293b"
        fg = "#94a3b8"
        border = "#475569"
        dot = "#64748b"
        label = "NOT CONFIGURED"
    else:
        bg = "#7f1d1d"
        fg = "#f87171"
        border = "#dc2626"
        dot = "#ef4444"
        label = status_str.upper()

    return f"""
    <span style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:600;letter-spacing:0.05em;background:{bg};color:{fg};border:1px solid {border};">
      <span style="width:7px;height:7px;border-radius:50%;background:{dot};display:inline-block;"></span>
      {html.escape(label)}
    </span>
    """


def render_html_status(data: dict) -> str:
    """
    Render a self-contained, lightweight, dark-mode HTML page for node status.
    WHAT: Single-template HTML with inline CSS and micro-JS for auto-refresh.
    WHY:
      - Complies with Roadmap §17 (strictly local, zero React/Next.js/Tailwind build step).
      - Zero external CDN requests, making it work completely on air-gapped or offline LANs.
      - Fits p5 priority with high visual polish while adding zero bundle size to the repo.
    """
    state = data.get("running_state", "unknown")
    services = data.get("services", {})
    pg = services.get("postgres", {})
    s3 = services.get("s3", {})
    redis = services.get("redis", {})
    storage = data.get("storage", {})
    disk = storage.get("disk", {})
    cachette = storage.get("cachette", {})
    tunnel = data.get("tunnel", {})

    percent_used = disk.get("percent_used", 0.0)
    # Determine bar color based on disk saturation
    if percent_used > 90:
        bar_color = "#ef4444"
    elif percent_used > 75:
        bar_color = "#f59e0b"
    else:
        bar_color = "#10b981"

    pg_latency = f" ({pg.get('latency_ms')} ms)" if "latency_ms" in pg else ""
    s3_bucket = f" [bucket: {html.escape(str(s3.get('bucket', '')))}]" if s3.get("bucket") else ""

    now_str = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(data.get("timestamp", time.time())))

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cachette Node &bull; Local Status</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background-color: #0b0f19;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      padding: 24px 16px;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }}
    .container {{
      width: 100%;
      max-width: 680px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }}
    .card {{
      background-color: #131b2e;
      border: 1px solid #23304b;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }}
    .header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }}
    .title-area {{
      display: flex;
      align-items: center;
      gap: 12px;
    }}
    .logo-box {{
      width: 38px;
      height: 38px;
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 18px;
      color: white;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
    }}
    h1 {{
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: #f8fafc;
    }}
    .subtitle {{
      font-size: 12px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }}
    h2 {{
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94a3b8;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }}
    .service-row {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #1e293b;
    }}
    .service-row:last-child {{
      border-bottom: none;
      padding-bottom: 0;
    }}
    .service-row:first-child {{
      padding-top: 0;
    }}
    .service-name {{
      font-size: 14px;
      font-weight: 500;
      color: #cbd5e1;
    }}
    .service-meta {{
      font-size: 12px;
      color: #64748b;
      margin-left: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }}
    .progress-bar-track {{
      background-color: #1e293b;
      border-radius: 9999px;
      height: 10px;
      overflow: hidden;
      margin: 10px 0 14px 0;
      border: 1px solid #334155;
    }}
    .progress-bar-fill {{
      height: 100%;
      background-color: {bar_color};
      border-radius: 9999px;
      transition: width 0.3s ease;
    }}
    .stats-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 8px;
    }}
    .stat-item {{
      background-color: #0b1120;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #1e293b;
    }}
    .stat-label {{
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-bottom: 4px;
    }}
    .stat-value {{
      font-size: 16px;
      font-weight: 700;
      color: #f1f5f9;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }}
    .tunnel-box {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      background-color: #0b1120;
      padding: 14px 16px;
      border-radius: 8px;
      border: 1px solid #1e293b;
      margin-top: 6px;
    }}
    .tunnel-details {{
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }}
    .footer {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      font-size: 12px;
      color: #64748b;
      padding: 0 4px;
    }}
    .controls {{
      display: flex;
      align-items: center;
      gap: 12px;
    }}
    button.refresh-btn {{
      background-color: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }}
    button.refresh-btn:hover {{
      background-color: #2e3c54;
      color: #f8fafc;
    }}
    a.json-link {{
      color: #38bdf8;
      text-decoration: none;
      font-family: ui-monospace, monospace;
    }}
    a.json-link:hover {{
      text-decoration: underline;
    }}
  </style>
</head>
<body>
  <div class="container">
    
    <!-- HEADER -->
    <div class="card header">
      <div class="title-area">
        <div class="logo-box">C</div>
        <div>
          <h1>Cachette Node</h1>
          <div class="subtitle">Local Node Diagnostics &bull; Roadmap §17</div>
        </div>
      </div>
      <div>
        {_render_badge(state)}
      </div>
    </div>

    <!-- RUNNING STATE -->
    <div class="card">
      <h2>
        <span>Core Services</span>
        <span style="font-size:11px;font-weight:400;color:#64748b;">Node Local</span>
      </h2>
      <div class="service-row">
        <div>
          <span class="service-name">PostgreSQL</span>
          <span class="service-meta">Metadata{pg_latency}</span>
        </div>
        <div>{_render_badge(pg.get("status", "unknown"))}</div>
      </div>
      <div class="service-row">
        <div>
          <span class="service-name">MinIO / S3</span>
          <span class="service-meta">Object Storage{s3_bucket}</span>
        </div>
        <div>{_render_badge(s3.get("status", "unknown"))}</div>
      </div>
      <div class="service-row">
        <div>
          <span class="service-name">Redis</span>
          <span class="service-meta">Rate Limits & Cache</span>
        </div>
        <div>{_render_badge(redis.get("status", "unknown"))}</div>
      </div>
    </div>

    <!-- STORAGE USED -->
    <div class="card">
      <h2>
        <span>Storage Utilization</span>
        <span style="font-size:11px;font-weight:400;color:#64748b;">{html.escape(storage.get("path", "/"))}</span>
      </h2>
      
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width: {min(max(percent_used, 0.0), 100.0)}%;"></div>
      </div>

      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">Disk Available</div>
          <div class="stat-value">{html.escape(disk.get("free_human", "0 B"))}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">of {html.escape(disk.get("total_human", "0 B"))} total ({percent_used}% used)</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Cachette Files</div>
          <div class="stat-value">{html.escape(cachette.get("bytes_human", "0 B"))}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">{cachette.get("file_count", 0):,} active objects</div>
        </div>
      </div>
    </div>

    <!-- TUNNEL STATUS -->
    <div class="card">
      <h2>
        <span>Cloudflared Tunnel</span>
        <span style="font-size:11px;font-weight:400;color:#64748b;">Central Ingress</span>
      </h2>
      <div class="tunnel-box">
        <div>
          <div style="font-size:14px;font-weight:600;color:#f8fafc;">
            {html.escape(tunnel.get("message", "Status probe"))}
          </div>
          <div class="tunnel-details">
            Probe: {html.escape(tunnel.get("url", "N/A"))}
          </div>
        </div>
        <div>
          {_render_badge(tunnel.get("status", "disconnected"))}
        </div>
      </div>
    </div>

    <!-- FOOTER & CONTROLS -->
    <div class="footer">
      <div>Checked: <span id="timestamp">{now_str}</span></div>
      <div class="controls">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" id="auto-refresh" checked style="cursor:pointer;"> Auto-refresh (10s)
        </label>
        <button class="refresh-btn" onclick="window.location.reload()">Refresh Now</button>
        <a href="/status.json" class="json-link">JSON View &rarr;</a>
      </div>
    </div>

  </div>

  <script>
    // Micro-script to reload status every 10 seconds if auto-refresh is toggled
    let timer = null;
    function setupTimer() {{
      const checkbox = document.getElementById("auto-refresh");
      if (timer) clearInterval(timer);
      if (checkbox && checkbox.checked) {{
        timer = setInterval(() => {{ window.location.reload(); }}, 10000);
      }}
    }}
    const chk = document.getElementById("auto-refresh");
    if (chk) {{
      chk.addEventListener("change", setupTimer);
      setupTimer();
    }}
  </script>
</body>
</html>
"""


@router.get("/status")
@router.get("/status.json")
async def node_status(
    request: Request,
    format: Optional[str] = Query(None, description="Set to 'json' to force JSON output"),
    accept: Optional[str] = Header(None),
):
    """
    Local Node Status View (Issue #33).
    WHAT: Reports running state, storage stats, and cloudflared tunnel connection.
    WHY:
      - Deliberately node-local: functions even when Central is down or unreachable.
      - Dual format: Returns HTML for humans in a browser, JSON for curl or scripts.
    """
    status_data = await get_node_status()

    # If the user directly accessed /status.json or passed ?format=json
    if request.url.path.endswith(".json") or format == "json":
        return status_data

    # Check client Accept header: default to HTML if browser, otherwise JSON
    if accept and "text/html" in accept:
        html_content = render_html_status(status_data)
        return HTMLResponse(content=html_content, status_code=200)

    # If no specific HTML accept header, return JSON by default for API consumers
    return status_data
