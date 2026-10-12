"""Shared pytest fixtures for the ARGUS backend test suite.

Every fixture that touches a database points at a throwaway SQLite
file under pytest's own tmp_path -- never backend/argus.db, the real
local database. db.session's module-level engine/SessionLocal (and
main.py's/health.py's own `engine` names, imported by reference at
module-load time) are redirected to a session-startup throwaway file
*before* the app's lifespan runs, so Base.metadata.create_all() and
the health check's connectivity probe never touch the real file
either. Real, committed model artifacts under backend/trained_models
are loaded as-is by the app's normal startup path -- nothing about the
models or SHAP explainer is mocked.
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import db.session as db_session  # noqa: E402
from db.models import Base  # noqa: E402

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
REAL_DB_URL = "sqlite:///./argus.db"  # the literal URL hardcoded in db/session.py


def _make_sqlite_engine(db_path: Path):
    url = f"sqlite:///{db_path}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return url, engine, session_local


@pytest.fixture(scope="session")
def _app(tmp_path_factory):
    """Build the FastAPI app once per test session.

    db.session's engine/SessionLocal are redirected to a throwaway
    SQLite file *before* `main` is imported and before the app's
    lifespan runs its Base.metadata.create_all() -- the real
    backend/argus.db is never opened by this fixture. Per-test DB
    isolation is layered on top by the `test_db` fixture below, which
    overrides the get_db dependency with a fresh file per test; this
    session-level engine only ever backs the one-time startup
    create_all() call and the /health connectivity check.
    """
    startup_db_path = tmp_path_factory.mktemp("argus_startup") / "startup.db"
    url, engine, session_local = _make_sqlite_engine(startup_db_path)

    db_session.engine = engine
    db_session.SessionLocal = session_local

    import main as main_module  # import AFTER patching db.session

    main_module.engine = engine  # lifespan()'s Base.metadata.create_all(bind=engine)

    from api.routes import health as health_module

    health_module.engine = engine  # health check's "SELECT 1" connectivity probe

    with TestClient(main_module.app) as test_client:
        yield main_module.app, test_client, url


@pytest.fixture
def test_db(tmp_path, _app):
    """Point THIS test's requests at a fresh, empty, throwaway SQLite
    file via a get_db dependency override -- isolates every test from
    every other test and from the session-startup database above.
    Yields (url, sessionmaker) so tests can both hit the API and query
    the same database directly (e.g. to check for orphan rows).
    """
    app, _test_client, _startup_url = _app
    db_path = tmp_path / "test.db"
    url, engine, session_local = _make_sqlite_engine(db_path)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[db_session.get_db] = override_get_db
    yield url, session_local
    app.dependency_overrides.pop(db_session.get_db, None)
    engine.dispose()


@pytest.fixture
def client(_app, test_db):
    """TestClient wired to this test's own isolated database."""
    _app_obj, test_client, _startup_url = _app
    return test_client


@pytest.fixture
def db_session_factory(test_db):
    """The sessionmaker bound to this test's isolated database, for
    tests that need to query it directly."""
    _url, session_local = test_db
    return session_local


@pytest.fixture
def players_csv_path():
    return FIXTURES_DIR / "test_8_players.csv"


@pytest.fixture
def players_csv_bytes(players_csv_path):
    return players_csv_path.read_bytes()


def assert_plain_language(message: str) -> None:
    """Shared check for every error-path test: the message must read
    as plain English, not leak a Python list repr (e.g. "['x']") or
    internal project vocabulary a CSV-uploading user wouldn't know."""
    assert "[" not in message and "]" not in message
    assert "Path A" not in message and "Path B" not in message
    assert ".dem" not in message
