"""ARGUS Phase 4.1.9 -- standard API error shape.

Every error ARGUS raises itself uses
    {"detail": {"code": str, "message": str, "fix": str}}
code: stable machine-readable identifier for the frontend.
message: what went wrong, specifically. fix: what the user should do.

FastAPI's own request-validation errors (detail is a list) are left
as-is; the frontend normalises both shapes.
"""

import logging

from fastapi import HTTPException
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


def api_error(status_code: int, code: str, message: str, fix: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message, "fix": fix})


def _internal_error_response() -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "detail": {
                "code": "internal_error",
                "message": "The server hit an unexpected error while processing this request.",
                "fix": "Try again. If it keeps happening, check the server logs for the traceback.",
            }
        },
    )


class UnhandledErrorMiddleware:
    """Turn any unhandled exception into the standard 500 JSON body.

    Pure ASGI middleware (not an exception_handler(Exception)) so it can
    sit INSIDE CORSMiddleware: Starlette routes Exception handlers to
    the outermost ServerErrorMiddleware, whose responses skip CORS
    headers, leaving the browser frontend unable to read the body.
    The traceback is logged; the raw exception text never reaches the
    client.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def send_wrapper(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            logger.error("Unhandled error on %s %s", scope.get("method"), scope.get("path"), exc_info=True)
            if response_started:
                raise  # too late to send a clean response
            await _internal_error_response()(scope, receive, send)
