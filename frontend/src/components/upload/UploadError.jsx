import { ErrorIcon } from './icons.jsx'

// Error state (docs/mockups/upload.png, "Error" panel). error is always
// the normalized { code, message, fix } shape (src/api/client.js) --
// never raw backend text.
export default function UploadError({ error, onRetry }) {
  return (
    <div className="rounded-lg border border-line border-l-4 border-l-accent-red bg-surface p-6">
      <div className="flex items-center gap-3">
        <ErrorIcon className="h-7 w-7 shrink-0 text-accent-red" />
        <h2 className="text-lg font-semibold text-content">{error.message}</h2>
      </div>
      <p className="mt-3 text-content-muted">
        <span className="font-medium text-content">How to fix:</span> {error.fix}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-md bg-primary-button px-4 py-2 font-medium text-button-text"
      >
        Try again
      </button>
    </div>
  )
}
