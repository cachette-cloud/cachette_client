# Cachette

Cachette is a modern, full-stack file storage and sharing system built around folders and user accounts. It allows users to organize files into nested folders, upload and manage files robustly (including large files via multipart uploads), and is designed to eventually support sharing content with other users or through share links.

## Project Scope & Features

- **Authentication System:** Secure signup, login, JWT access/refresh token handling, and user profile management.
- **Folder Navigation:** Users can create folders and nest them to organize their files effectively.
- **File Management:** 
  - Upload files directly to AWS S3.
  - Large files are seamlessly handled using S3 multipart uploads.
  - Download files using securely generated AWS presigned URLs.
  - Safely rename files and folders.
  - Delete files and recursively delete folders (automatically cleaning up database records and corresponding S3 objects).
- **Duplicate Prevention:** The system actively checks and prevents users from creating duplicate files or folders in the same directory, gracefully returning errors instead of overwriting data.
- **Planned Features:**
  - File sharing workflows for user-to-user access and link-based access.
  - In-app preview components for common file types (Video player, PDF viewer, DOCX viewer).

## Technology Stack

- **Backend:** 
  - [FastAPI](https://fastapi.tiangolo.com/) - High-performance Python web framework.
  - [PostgreSQL](https://www.postgresql.org/) - Relational database.
  - [SQLAlchemy](https://www.sqlalchemy.org/) & [Alembic](https://alembic.sqlalchemy.org/) - ORM and database migrations.
  - [aioboto3](https://github.com/terrycain/aioboto3) - Asynchronous AWS SDK for interacting with S3.
- **Frontend:**
  - [Next.js](https://nextjs.org/) (React) - Frontend framework.
  - [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework for rapid UI development.
  - [Framer Motion](https://www.framer.com/motion/) - Animation library for React to create smooth, dynamic UI interactions.
  - [Lucide/Remix Icons](https://remixicon.com/) - Beautiful, consistent icons.
- **Infrastructure:**
  - [Docker](https://www.docker.com/) & Docker Compose - Containerized application environments.
  - [AWS S3](https://aws.amazon.com/s3/) - Scalable object storage.

## Running the Project

The project is structured with separate `frontend` and `backend` directories and uses Docker Compose to easily spin up the environment (including a local PostgreSQL database).

### Prerequisites
- Docker and Docker Compose installed.
- Node.js (for local frontend development).
- Python 3.12 (for local backend development).
- AWS Account with an S3 Bucket and IAM user configured.

### Environment Setup

Create an `.env` file in the `backend` directory with your database and AWS credentials:

```ini
# backend/.env
DATABASE_URL=postgresql+asyncpg://dev:dev@localhost:5432/filestorage
SECRET_KEY=your_super_secret_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
S3_BUCKET_NAME=your_bucket_name
MULTIPART_THRESHOLD=5242880 # 5MB
```

### Docker Compose
You can easily start the PostgreSQL database and other services using docker-compose:
```bash
docker-compose up -d
```

### Starting the Backend (Locally)
```bash
cd backend
python -m venv .venv
# Activate the virtual environment
source .venv/bin/activate # (or .venv\Scripts\activate on Windows)
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start the server
uvicorn app.main:app --reload --port 8000
```

### Starting the Frontend (Locally)
```bash
cd frontend
npm install
npm run dev
```

The application will be available at `http://localhost:3000`.
