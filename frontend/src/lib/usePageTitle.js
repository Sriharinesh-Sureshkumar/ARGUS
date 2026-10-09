import { useEffect } from 'react'

// Sets document.title to "<title> - ARGUS" (or just "ARGUS" if title is
// falsy, e.g. not loaded yet). Every page calls this with whatever text
// it has available at render time (Phase 4.2.6).
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} - ARGUS` : 'ARGUS'
  }, [title])
}
