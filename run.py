"""
Root-level launcher — run this from C:\\Users\\vishn\\Aero with:
    python run.py

Or run uvicorn directly from the backend folder:
    cd backend && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"""
import subprocess
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent / "backend"

subprocess.run(
    [
        sys.executable, "-m", "uvicorn",
        "app.main:app",
        "--reload",
        "--host", "127.0.0.1",
        "--port", "8000",
    ],
    cwd=backend_dir,
    check=True,
)
