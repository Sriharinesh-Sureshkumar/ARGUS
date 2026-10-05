import { Link, useLocation } from 'react-router-dom'

// Shown for any URL that matches no other route (the "*" route in App.jsx).
export default function NotFoundPage() {
  const { pathname } = useLocation()

  return (
    <section>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-content-muted">
        Nothing lives at <span className="font-mono text-content">{pathname}</span>.
      </p>
      <Link to="/" className="mt-4 inline-block text-accent-indigo hover:underline">
        Back to Upload
      </Link>
    </section>
  )
}
