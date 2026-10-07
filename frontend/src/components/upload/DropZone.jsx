import { useState } from 'react'

import { CloudIcon } from './icons.jsx'

// Idle state (docs/mockups/upload.png, "Idle" panel). A real <label>
// wraps a hidden <input type="file">, so the control is keyboard
// accessible (Tab + Space/Enter opens the native file picker) without
// any custom key handling.
export default function DropZone({ onFileSelected }) {
  const [isDragging, setIsDragging] = useState(false)

  function handleInputChange(event) {
    const selected = event.target.files?.[0]
    // Reset so choosing the same filename again still fires onChange.
    event.target.value = ''
    if (selected) onFileSelected(selected)
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) onFileSelected(dropped)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`rounded-lg border-2 border-dashed px-6 py-16 text-center transition-colors ${
        isDragging ? 'border-primary-button bg-surface' : 'border-dropzone-border'
      }`}
    >
      <CloudIcon className="mx-auto h-10 w-10 text-content-muted" />
      <p className="mt-4 text-lg font-semibold text-content">Drop a player-stats CSV here</p>
      <p className="mt-1 text-content-muted">
        or{' '}
        <label className="cursor-pointer font-medium text-primary-button hover:underline">
          browse files
          <input type="file" accept=".csv" className="sr-only" onChange={handleInputChange} />
        </label>
      </p>
      <p className="mt-6 text-sm text-content-muted">
        Needs a player_id column plus 11 behaviour feature columns.
      </p>
      <p className="text-sm text-content-muted">Max 10 MB, 5,000 players.</p>
    </div>
  )
}
