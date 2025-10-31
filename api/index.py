from pathlib import Path
import sys

# Ensure the project root is on sys.path so `app` package is importable on Vercel
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.main import app  # noqa: E402

# Vercel detects the ASGI application named `app`.
