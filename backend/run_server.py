import os
import sys
import multiprocessing
from pathlib import Path

# Required for multiprocessing support in frozen PyInstaller binaries on Windows
multiprocessing.freeze_support()

# Ensure base directory is in sys.path
if getattr(sys, "frozen", False):
    base_dir = Path(sys.executable).resolve().parent
else:
    base_dir = Path(__file__).resolve().parent

if str(base_dir) not in sys.path:
    sys.path.insert(0, str(base_dir))

import uvicorn
from app.main import app

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
        access_log=True,
    )

