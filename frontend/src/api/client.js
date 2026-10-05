// Talks to the ARGUS FastAPI backend.
//
// Base URL: set VITE_API_BASE_URL in frontend/.env.local to override.
// The default matches how the backend is started in this repo
// (`uv run uvicorn main:app --reload --app-dir backend`, uvicorn's
// default port 8000).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

// Every failure the UI sees has the same shape: { status, code, message, fix }.
// Using a real Error (not a plain object) keeps stack traces in the console.
function makeApiError({ status = null, code, message, fix }) {
  const error = new Error(message)
  error.status = status
  error.code = code
  error.fix = fix
  return error
}

// Turn ANY failure into { status, code, message, fix } so pages only ever
// have to handle one shape. Pass it either the error thrown by fetch()
// (backend unreachable) or a non-OK Response.
export async function normalizeError(responseOrError) {
  // fetch() only throws when no HTTP response arrived at all: the backend
  // is down, the URL is wrong, or CORS blocked the request.
  if (!(responseOrError instanceof Response)) {
    return makeApiError({
      code: 'network_error',
      message: 'Cannot reach the ARGUS backend',
      fix: 'Check that the backend is running',
    })
  }

  const response = responseOrError
  const status = response.status

  // Read as text first: a proxy or crash page may send HTML, and
  // response.json() would throw a confusing SyntaxError on it.
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return makeApiError({
      status,
      code: 'unexpected_response',
      message: `The backend sent an unexpected (non-JSON) response (HTTP ${status}).`,
      fix: 'Check that VITE_API_BASE_URL points at the ARGUS API and look at the backend logs.',
    })
  }

  const detail = body?.detail

  // Our own errors (Phase 4.1.9): { detail: { code, message, fix } }
  if (detail && typeof detail === 'object' && !Array.isArray(detail) && detail.code) {
    return makeApiError({ status, code: detail.code, message: detail.message, fix: detail.fix })
  }

  // FastAPI's own validation errors: { detail: [{ loc: [...], msg }] }
  if (Array.isArray(detail)) {
    const message = detail
      .map((item) => `${(item.loc || []).join(' > ')}: ${item.msg}`)
      .join('; ')
    return makeApiError({
      status,
      code: 'validation_error',
      message: message || 'The request was rejected as invalid.',
      fix: 'Check the request fields named above.',
    })
  }

  // Plain-string detail, e.g. FastAPI's default 404/405 "Not Found".
  if (typeof detail === 'string') {
    return makeApiError({
      status,
      code: `http_${status}`,
      message: detail,
      fix: 'Try again. If it keeps happening, check the backend logs.',
    })
  }

  return makeApiError({
    status,
    code: `http_${status}`,
    message: `The backend returned HTTP ${status}.`,
    fix: 'Try again. If it keeps happening, check the backend logs.',
  })
}

// Shared fetch wrapper: returns parsed JSON on success, throws a
// normalized error otherwise.
async function request(path, options) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options)
  } catch (networkFailure) {
    throw await normalizeError(networkFailure)
  }

  if (!response.ok) {
    throw await normalizeError(response)
  }

  // A 200 with an HTML body (e.g. a wrong base URL hitting the Vite dev
  // server) must not crash the page either.
  try {
    return await response.json()
  } catch {
    throw makeApiError({
      status: response.status,
      code: 'unexpected_response',
      message: `The backend sent an unexpected (non-JSON) response (HTTP ${response.status}).`,
      fix: 'Check that VITE_API_BASE_URL points at the ARGUS API.',
    })
  }
}

// GET /health -> { status: "ok" | "degraded", models_loaded, db_connected, model_version }
// (HealthResponse in backend/api/schemas.py)
export function getHealth() {
  return request('/health')
}
