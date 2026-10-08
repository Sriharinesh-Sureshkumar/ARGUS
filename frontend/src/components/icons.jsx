// Shared inline icons (currentColor only) for pages beyond the upload
// flow. src/components/upload/icons.jsx stays scoped to that flow.

export function BackArrowIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0 6-6m-6 6 6 6" />
    </svg>
  )
}

export function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path strokeLinecap="round" d="m20 20-3.8-3.8" />
    </svg>
  )
}

export function ChevronLeftIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.5 6-6 6 6 6" />
    </svg>
  )
}

export function ChevronRightIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m9.5 6 6 6-6 6" />
    </svg>
  )
}

// Small stacked up/down arrows for a sortable column header.
export function SortIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m7 10 5-5 5 5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m7 14 5 5 5-5" />
    </svg>
  )
}
