#!/usr/bin/env bash

# ==============================================================================
# Cachette Node Setup Script (Linux / macOS)
# ==============================================================================

set -e

# Color definitions
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}           Cachette Node Setup Script               ${NC}"
echo -e "${CYAN}====================================================${NC}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# ------------------------------------------------------------------------------
# 1. Check Prerequisites (Python & Node.js)
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[1/4] Checking prerequisites...${NC}"

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo -e "  ${RED}✘ Python is not installed! Please install Python 3.10+.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✔${NC} Python: $($PYTHON_CMD --version)"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "  ${RED}✘ Node.js is not installed! Please install Node.js 18+.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✔${NC} Node.js: $(node --version)"

# ------------------------------------------------------------------------------
# 2. Configure Environment Files
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[2/4] Setting up environment files...${NC}"

# Root .env
if [ ! -f ".env" ]; then
    echo -e "  Creating root ${CYAN}.env${NC}..."
    cat << 'EOF' > .env
DATABASE_URL=sqlite+aiosqlite:///./cachette.db
S3_ENDPOINT_URL=http://127.0.0.1:9002
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
S3_BUCKET_NAME=cachette-files
CF_TUNNEL_TOKEN=
EOF
    echo -e "  ${GREEN}✔${NC} Created .env"
else
    echo -e "  ${GREEN}✔${NC} Root .env already exists. Skipping."
fi

# Backend .env
if [ ! -f "backend/.env" ]; then
    echo -e "  Creating ${CYAN}backend/.env${NC}..."
    cat << 'EOF' > backend/.env
DATABASE_URL=sqlite+aiosqlite:///./cachette.db
S3_ENDPOINT_URL=http://127.0.0.1:9002
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
S3_BUCKET_NAME=cachette-files
CF_TUNNEL_TOKEN=
CENTRAL_URL=https://cachette.cloud
EOF
    echo -e "  ${GREEN}✔${NC} Created backend/.env"
else
    echo -e "  ${GREEN}✔${NC} backend/.env already exists. Skipping."
fi

# Frontend .env
if [ ! -f "frontend/.env" ]; then
    echo -e "  Creating ${CYAN}frontend/.env${NC}..."
    cat << 'EOF' > frontend/.env
BACKEND_URL=http://127.0.0.1:8000
NEXT_PUBLIC_CENTRAL_URL=https://cachette.cloud
EOF
    echo -e "  ${GREEN}✔${NC} Created frontend/.env"
else
    echo -e "  ${GREEN}✔${NC} frontend/.env already exists. Skipping."
fi

# ------------------------------------------------------------------------------
# 3. Setup Backend Environment
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[3/4] Setting up Backend virtual environment...${NC}"

cd "$PROJECT_ROOT/backend"
if [ ! -d ".venv" ]; then
    $PYTHON_CMD -m venv .venv
    echo -e "  ${GREEN}✔${NC} Created backend/.venv"
fi

VENV_PYTHON="$PROJECT_ROOT/backend/.venv/bin/python"

$VENV_PYTHON -m pip install --upgrade pip
$VENV_PYTHON -m pip install -r requirements.txt
$VENV_PYTHON -m alembic upgrade head

cd "$PROJECT_ROOT"

# ------------------------------------------------------------------------------
# 4. Setup Frontend Dependencies
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[4/4] Installing frontend dependencies...${NC}"
cd "$PROJECT_ROOT/frontend"
if command -v pnpm &> /dev/null; then
    pnpm install
else
    npm install
fi
cd "$PROJECT_ROOT"

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}       Cachette Node Setup Complete!                ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "${CYAN}No Docker required! MinIO and Cloudflared run natively.${NC}"
echo -e "To start your node, run in separate terminals:\n"
echo -e "  ${CYAN}Terminal 1 (Backend):${NC}"
echo -e "    cd backend"
echo -e "    source .venv/bin/activate"
echo -e "    uvicorn app.main:app --port 8000\n"
echo -e "  ${CYAN}Terminal 2 (Frontend):${NC}"
echo -e "    cd frontend"
echo -e "    npm run dev\n"
echo -e "${YELLOW}Once started, open http://localhost:3000 to pair your node with Central.${NC}"
echo -e "${GREEN}====================================================${NC}"
