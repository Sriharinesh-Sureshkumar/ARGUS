import { ErrorIcon } from './upload/icons.jsx'

// Shared error display (docs/mockups/upload.png, "Error" panel). error
// is always the normalized { code, message, fix } shape
// (src/api/client.js) -- never raw backend text.
//
// Pass onRetry (+ optional retryLabel) for the default single-button
// case. Pass actions (a node) instead when a specific error code needs
// a different set of buttons, e.g. ResultsPage's "Back to upload" /
// "Open history" pair for a 404 -- onRetry is ignored when actions is set.
export default function ErrorPanel({ error, onRetry, retryLabel = 'Try again', actions }) {
  return (
    <div className="rounded-lg border border-line border-l-4 border-l-accent-red bg-surface p-6">
      <div className="flex items-center gap-3">
        <ErrorIcon className="h-7 w-7 shrink-0 text-accent-red" />
        <h2 className="text-lg font-semibold text-content">{error.message}</h2>
      </div>
      <p className="mt-3 text-content-muted">
        <span className="font-medium text-content">How to fix:</span> {error.fix}
      </p>
      {actions ? (
        <div className="mt-5 flex gap-3">{actions}</div>
      ) : (
        onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 rounded-md bg-primary-button px-4 py-2 font-medium text-button-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
          >
            {retryLabel}
          </button>
        )
      )}
    </div>
  )
}
