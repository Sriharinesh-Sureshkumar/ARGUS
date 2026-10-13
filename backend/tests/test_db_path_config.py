"""ARGUS_DB_PATH (Phase 5.3) -- run in a fresh subprocess, never by
reloading db.session in-process, since that would recreate its module-
level `engine`/`SessionLocal` against whatever path is in play and
could clobber the test-session fixtures in conftest.py that every
other test in this suite depends on."""

import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
_PRINT_URL = "import db.session as s; print(s.SQLALCHEMY_DATABASE_URL)"


def _run(env: dict) -> str:
    result = subprocess.run(
        [sys.executable, "-c", _PRINT_URL],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def test_db_path_default_unchanged_when_env_var_unset():
    env = dict(os.environ)
    env.pop("ARGUS_DB_PATH", None)
    assert _run(env) == "sqlite:///./argus.db"


def test_db_path_overridable_via_env_var(tmp_path):
    env = {**os.environ, "ARGUS_DB_PATH": str(tmp_path / "custom.db")}
    assert _run(env) == f"sqlite:///{tmp_path / 'custom.db'}"
