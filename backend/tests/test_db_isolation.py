from conftest import REAL_DB_URL


def test_test_db_is_not_the_real_argus_db(test_db):
    """Guards the whole suite's core safety requirement: every test
    must run against a throwaway SQLite file, never backend/argus.db."""
    url, _session_local = test_db
    assert url != REAL_DB_URL
    assert "argus.db" not in url
    assert "test.db" in url
