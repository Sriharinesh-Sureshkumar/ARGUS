"""ARGUS Phase 4.1.9 -- upload limits for POST /api/v1/analyze.

Single source of truth for request-size limits; each is overridable
via env var.

- MAX_UPLOAD_BYTES (10 MiB): rejects oversized files before they are
  parsed. A 20,000-row CSV with traceability columns is ~3 MB, so
  10 MiB leaves ample headroom for MAX_ROWS rows with extra columns.
- MAX_ROWS (5000): bounds request latency. One measured 20,000-row
  upload took 36.7s end-to-end (Phase 4.1.9 audit); 5000 rows keeps a
  single synchronous request well inside an interactive wait.
"""

import os

MAX_UPLOAD_BYTES = int(os.environ.get("ARGUS_MAX_UPLOAD_BYTES", 10 * 1024 * 1024))
MAX_ROWS = int(os.environ.get("ARGUS_MAX_ROWS", 5000))
