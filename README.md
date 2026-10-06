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

The repository provides automated setup scripts that check prerequisites, generate `.env` files, build containers, and launch all services.

### Prerequisites
- [Docker Desktop](https://www.docker.com/) (make sure Docker daemon is running)
- *Optional for local dev*: Python 3.12+, Node.js 20+

### Option 1: Windows (PowerShell)

```powershell
.\setup.ps1
```

### Option 2: Linux / macOS / WSL / Git Bash

```bash
chmod +x setup.sh
./setup.sh
```

> **Flags:** You can also run non-interactively with `./setup.sh --docker` (full Docker stack) or `./setup.sh --dev` (local development mode).

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

Build and launch all services (`redis`, `minio`, `app`, `frontend`, `cloudflared`):

```bash
docker compose up -d --build
```

---

### 3. Running for Local Development

#### Start Storage & Cache (MinIO + Redis)
```bash
docker compose up -d redis minio
```

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
   - Automatically launch the `cloudflared` tunnel container.
   - Redirect you to your personal storage dashboard.

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
