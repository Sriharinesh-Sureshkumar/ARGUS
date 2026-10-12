import { FileIcon } from './icons.jsx'

// Uploading state (docs/mockups/upload.png, "Uploading" panel). progress
// is the real 0-100 value from axios's onUploadProgress (bytes sent),
// not a simulated animation.
export default function UploadProgress({ fileName, progress }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-dropzone-border px-6 py-16 text-center">
      <FileIcon className="mx-auto h-10 w-10 text-content-muted" />
      <p className="mt-4 font-mono text-content">{fileName}</p>
      <p className="mt-1 text-content-muted">Uploading...</p>

      <div className="mx-auto mt-4 flex max-w-sm items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-bar-track"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-bar-fill transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <span className="font-mono text-sm text-content">{progress}%</span>
      </div>

      <p className="mt-6 text-sm text-content-muted">
        Needs a player_id column plus 11 behaviour feature columns.
      </p>
      <p className="text-sm text-content-muted">Max 10 MB, 5,000 players.</p>
    </div>
  )
}
