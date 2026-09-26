"""ARGUS Phase 4.1 -- SQLAlchemy engine/session setup.

The task asked for the engine setup to live in backend/main.py; it's
defined here instead (imported by main.py) purely to avoid a circular
import -- route modules need SessionLocal/get_db for dependency
injection, and importing those from main.py while main.py also
imports the routers would create a cycle. main.py still owns the
Base.metadata.create_all() call at startup, per the task.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./argus.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
