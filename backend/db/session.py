"""ARGUS Phase 4.1 -- SQLAlchemy engine/session setup.

The task asked for the engine setup to live in backend/main.py; it's
defined here instead (imported by main.py) purely to avoid a circular
import -- route modules need SessionLocal/get_db for dependency
injection, and importing those from main.py while main.py also
imports the routers would create a cycle. main.py still owns the
Base.metadata.create_all() call at startup, per the task.

Phase 5.3: the SQLite file path is overridable via ARGUS_DB_PATH (e.g.
pointing a container at a writable mount), defaulting to the original
"./argus.db" so local/dev behaviour is unchanged when the env var is
unset.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ARGUS_DB_PATH = os.environ.get("ARGUS_DB_PATH", "./argus.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{ARGUS_DB_PATH}"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
