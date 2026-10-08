import { useState } from 'react'

import { InfoIcon } from './icons.jsx'

// Small "(i)" button next to a card heading that toggles a short
// explanatory tooltip. Click-to-toggle (not hover-only) and a real
// <button aria-expanded> so it's keyboard operable.
export default function InfoDisclosure({ text, label = 'What is this?' }) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full text-content-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
      >
        <InfoIcon className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-6 top-0 z-10 w-64 rounded-md border border-line bg-tooltip-bg p-3 text-xs leading-relaxed text-content shadow-lg"
        >
          {text}
        </div>
      )}
    </span>
  )
}
