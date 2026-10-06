#!/usr/bin/env bash

# ==============================================================================
# Cachette Node Setup Script
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
# 1. Detect Docker & Docker Compose
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[1/4] Checking prerequisites...${NC}"

if command -v docker &> /dev/null; then
    echo -e "  ${GREEN}✔${NC} Docker is installed: $(docker --version)"
else
    echo -e "  ${RED}✘ Docker is not found! Please install Docker Desktop and start it.${NC}"
    exit 1
fi

# Detect docker compose v2 vs v1
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo -e "  ${RED}✘ Docker Compose is not found!${NC}"
    exit 1
fi
echo -e "  ${GREEN}✔${NC} Using Compose command: ${CYAN}${COMPOSE_CMD}${NC}"

# Check Docker daemon availability
if ! docker info &> /dev/null; then
    echo -e "  ${RED}✘ Docker daemon is not running. Please start Docker Desktop first.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✔${NC} Docker daemon is active."

# ------------------------------------------------------------------------------
# 2. Configure Environment Files
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[2/4] Setting up environment files...${NC}"

# Root .env
if [ ! -f ".env" ]; then
    echo -e "  Creating root ${CYAN}.env${NC}..."
    cat << 'EOF' > .env
DATABASE_URL=sqlite+aiosqlite:///./cachette.db
REDIS_URL=redis://localhost:6379
S3_ENDPOINT_URL=http://localhost:9002
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
REDIS_URL=redis://localhost:6379
S3_ENDPOINT_URL=http://localhost:9002
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
# 3. Determine Setup Mode
# ------------------------------------------------------------------------------
SETUP_MODE=""

if [ "$1" == "--docker" ]; then
    SETUP_MODE="1"
elif [ "$1" == "--dev" ]; then
    SETUP_MODE="2"
fi

if [ -z "$SETUP_MODE" ]; then
    echo -e "\n${YELLOW}[3/4] Select setup mode:${NC}"
    echo "  1) Full Docker Mode (Runs Frontend, Backend, Redis, MinIO via Docker Compose)"
    echo "  2) Local Development Mode (Runs Redis & MinIO in Docker; Python & Next.js locally)"
    read -p "Enter choice [1 or 2] (default: 1): " USER_CHOICE
    SETUP_MODE="${USER_CHOICE:-1}"
fi

# ------------------------------------------------------------------------------
# 4. Execute Setup
# ------------------------------------------------------------------------------
if [ "$SETUP_MODE" == "1" ]; then
    echo -e "\n${YELLOW}[4/4] Starting all services with Docker Compose...${NC}"
    $COMPOSE_CMD up -d --build

    echo -e "\n${GREEN}====================================================${NC}"
    echo -e "${GREEN}   ✔ Cachette Docker Stack is up and running!       ${NC}"
    echo -e "${GREEN}====================================================${NC}"
    echo -e "  • ${CYAN}Frontend UI:${NC}    http://localhost:3000"
    echo -e "  • ${CYAN}Backend API:${NC}    http://localhost:8000/docs"
    echo -e "  • ${CYAN}MinIO Console:${NC}  http://localhost:9003  (User: minioadmin / Pass: minioadmin)"
    echo -e "\n${YELLOW}Next Step:${NC} Open http://localhost:3000 to complete node pairing with Central."

elif [ "$SETUP_MODE" == "2" ]; then
    echo -e "\n${YELLOW}[4/4] Setting up Local Development environment...${NC}"

    # Start MinIO & Redis
    echo -e "\nStarting supporting storage containers (Redis & MinIO)..."
    $COMPOSE_CMD up -d redis minio

    # Check for Python
    PYTHON_CMD=""
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    else
        echo -e "${RED}✘ Python is not installed. Please install Python 3.12+ for local backend.${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✔${NC} Found Python: $($PYTHON_CMD --version)"

    # Setup Backend Virtual Environment
    echo -e "\nSetting up Backend virtual environment..."
    cd backend
    if [ ! -d ".venv" ]; then
        $PYTHON_CMD -m venv .venv
        echo -e "  ${GREEN}✔${NC} Created backend/.venv"
    fi

    # Activate Virtualenv
    if [ -f ".venv/bin/activate" ]; then
        source .venv/bin/activate
    elif [ -f ".venv/Scripts/activate" ]; then
        source .venv/Scripts/activate
    fi

    echo -e "Installing backend Python dependencies..."
    pip install --upgrade pip
    pip install -r requirements.txt

    echo -e "Applying database migrations..."
    alembic upgrade head
    cd "$PROJECT_ROOT"

    # Setup Frontend
    if command -v npm &> /dev/null; then
        echo -e "\nInstalling frontend npm dependencies..."
        cd frontend
        npm install
        cd "$PROJECT_ROOT"
    else
        echo -e "${RED}✘ npm is not installed. Please install Node.js 20+ for local frontend.${NC}"
        exit 1
    fi

    echo -e "\n${GREEN}====================================================${NC}"
    echo -e "${GREEN}   ✔ Local Development Setup Complete!              ${NC}"
    echo -e "${GREEN}====================================================${NC}"
    echo -e "To start your services, open two separate terminals:\n"
    echo -e "  ${CYAN}Terminal 1 (Backend):${NC}"
    echo -e "    cd backend"
    echo -e "    source .venv/bin/activate   # or .venv\\Scripts\\activate on Windows"
    echo -e "    uvicorn app.main:app --reload --port 8000\n"
    echo -e "  ${CYAN}Terminal 2 (Frontend):${NC}"
    echo -e "    cd frontend"
    echo -e "    npm run dev\n"
    echo -e "  • ${CYAN}MinIO Console:${NC} http://localhost:9003 (Login: minioadmin / minioadmin)"
    echo -e "  • ${CYAN}Frontend UI:${NC}   http://localhost:3000"
else
    echo -e "${RED}Invalid selection. Exiting.${NC}"
    exit 1
fi
