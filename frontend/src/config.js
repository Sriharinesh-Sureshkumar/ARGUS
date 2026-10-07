// Upload limits shown/enforced client-side. Must mirror backend/core/config.py
// (MAX_UPLOAD_BYTES, MAX_ROWS) -- the server is the real source of truth and
// re-checks both; these let the UI reject obviously-bad files before sending.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_ROWS = 5000
