# Cachette Node

> **Turn any PC, laptop, or server into your own internet-accessible personal cloud storage.**

Cachette is a decentralized, self-hosted personal cloud storage platform. It decouples the control plane (**Central** at [cachette.cloud](https://cachette.cloud)) from your local hardware (**Node**), giving you S3-compatible cloud storage with public HTTPS access—**zero port-forwarding, zero dynamic DNS, and zero central byte storage**.

---

## Architectural Highlights

- **Zero Port-Forwarding Ingress**: Uses an outbound-only Cloudflare Tunnel (`cloudflared`). Central provisions a unique public subdomain (`https://<your-subdomain>.cachette.cloud`) routing traffic directly to your node.
- **Decentralized Cryptographic Trust**: Nodes verify incoming requests using Central's RSA public key (`RS256`). No local password database or email setup is needed.
- **Direct S3 / MinIO Storage**: File bytes stream directly into your local MinIO/S3 object store. Central never proxies or stores your files.
- **Resilient Upload Engine**: Automatic single-file and chunked multipart uploads (10 MB chunks) with resumability and pre-upload quota checks.
- **Rate Limiting**: Distributed token-bucket rate limiter powered by Redis.

---

## Technology Stack

- **Backend**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.12), [SQLite](https://www.sqlite.org/) with [aiosqlite](https://github.com/omnilib/aiosqlite) (WAL mode), [SQLAlchemy 2.0](https://www.sqlalchemy.org/) & [Alembic](https://alembic.sqlalchemy.org/), [aioboto3](https://github.com/terrycain/aioboto3).
- **Frontend**: [Next.js](https://nextjs.org/) (React, Turbopack, Tailwind CSS, Lucide & Remix Icons).
- **Storage & Infrastructure**: [MinIO](https://min.io/) (via Chainguard secure community image), [Redis 7](https://redis.io/), [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

---

## Quick Start (Automated Setup)

The recommended way to start your node is with the automated setup script:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/biswajeet-samal/cachette.git
   cd cachette
   ```

2. **Run the setup script:**
   - **Windows (PowerShell):**
     ```powershell
     .\setup.ps1
     ```
   - **Linux / macOS:**
     ```bash
     chmod +x setup.sh
     ./setup.sh
     ```
   *(Select `1` for Full Docker Mode or `2` for Local Development Mode).*

3. **Pair your node:**
   - Open **`http://localhost:3000`** in your browser.
   - Log in to [cachette.cloud](https://cachette.cloud), navigate to **Nodes**, and generate a **6-character Node Pairing Code**.
   - Enter the pairing code at `http://localhost:3000`.

4. **Node is live:**
   - Central provisions your RSA public key and Cloudflare Tunnel credentials.
   - The backend stores the tunnel token into `CF_TUNNEL_TOKEN` in `.env` and activates the tunnel.
   - Your node is now live and reachable over HTTPS at **`https://<your-subdomain>.cachette.cloud`**!

> [!TIP]
> **Manual Tunnel Start:** If your backend runs in a container without Docker socket access or you restart your stack after pairing, start the tunnel at any time with:
> ```bash
> docker compose --profile tunnel up -d cloudflared
> ```

---

## Manual Setup

### 1. Environment Configuration

Create the following environment files if configuring manually:

#### Root `.env`
```ini
DATABASE_URL=sqlite+aiosqlite:///./cachette.db
REDIS_URL=redis://localhost:6379
S3_ENDPOINT_URL=http://localhost:9002
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
S3_BUCKET_NAME=cachette-files

# Populated automatically once paired with Central
CF_TUNNEL_TOKEN=
```

#### `backend/.env`
```ini
DATABASE_URL=sqlite+aiosqlite:///./cachette.db
REDIS_URL=redis://localhost:6379
S3_ENDPOINT_URL=http://localhost:9002
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
S3_BUCKET_NAME=cachette-files
CENTRAL_URL=https://cachette.cloud
CF_TUNNEL_TOKEN=
```

#### `frontend/.env`
```ini
BACKEND_URL=http://127.0.0.1:8000
NEXT_PUBLIC_CENTRAL_URL=https://cachette.cloud
```

---

### 2. Running with Docker Compose (All-in-One)

Build and launch core services (`redis`, `minio`, `app`, `frontend`):

```bash
docker compose up -d --build
```

*Once paired (when `CF_TUNNEL_TOKEN` is set in `.env`), launch the full stack including the Cloudflare tunnel with:*

```bash
docker compose --profile tunnel up -d --build
```

---

### 3. Running for Local Development

#### Start Storage & Cache (MinIO + Redis)
```bash
docker compose up -d redis minio
```
*(If already paired, you can also start the tunnel container: `docker compose --profile tunnel up -d redis minio cloudflared`)*

#### Start Backend (FastAPI)
```bash
cd backend
python -m venv .venv

# Activate venv:
# Windows: .\.venv\Scripts\Activate.ps1
# Linux/macOS: source .venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

#### Start Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```

---

## First-Time Node Pairing

1. Open **`http://localhost:3000`** in your browser.
2. If the node is not yet paired, you will see the pairing setup screen.
3. Log in to [cachette.cloud](https://cachette.cloud) and generate a **6-character Node Claim Code**.
4. Enter the code in the local pairing interface.
5. The backend will:
   - Exchange the claim token with Central.
   - Receive your persistent node ID, RSA public key (`public.pem`), and Cloudflare Tunnel token.
   - Persist `CF_TUNNEL_TOKEN` into `.env`.
   - Start the `cloudflared` tunnel container (or prompt fallback `docker compose --profile tunnel up -d cloudflared`).
   - Connect you to your personal storage dashboard at `https://<your-subdomain>.cachette.cloud`.

---

## Service Endpoints & Ports

| Service | Port | Description |
|---|---|---|
| **Frontend UI** | `http://localhost:3000` | Web application and file manager |
| **Backend API** | `http://localhost:8000` | FastAPI service & `/docs` Swagger |
| **Health Check** | `http://localhost:8000/health` | Container liveness & status probe |
| **MinIO S3 API** | `http://localhost:9002` | S3-compatible object storage API |
| **MinIO Console** | `http://localhost:9003` | Storage web dashboard (`minioadmin` / `minioadmin`) |
| **Redis** | `localhost:6379` | Token bucket rate-limiter store |

---

## Running Automated Tests

Run the backend test suite:

```bash
cd backend
pytest
```
