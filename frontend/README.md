# ARGUS frontend

React + Vite single-page app for ARGUS. See the [root README](../README.md) for what the project does, the full API reference, and the training/dataset background.

## Stack

React 19, React Router 7, Tailwind CSS 4, Axios, Vite 8. Linted with oxlint. No test runner is configured.

## Scripts

```bash
npm ci          # install (use this, not `npm install`, for a reproducible tree)
npm run dev     # start the Vite dev server on http://localhost:5173
npm run build   # production build to dist/
npm run lint    # oxlint
npm run preview # preview a production build locally
```

## Environment

Copy `.env.example` to `.env.local` to override. The only variable:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | Base URL the app sends every API request to |

## Folder layout

```
src/
├── pages/       # one file per route (Upload, Results, PlayerDetail, Clusters, History, NotFound)
├── components/  # shared components at the top level; page-scoped ones in a subfolder
│   ├── upload/
│   ├── results/
│   ├── clusters/
│   ├── history/
│   └── player/
├── api/         # one file per backend resource (analyze, history, player, clusters, client)
├── lib/         # pure helpers -- dates.js, shap.js, clusters.js, usePageTitle.js
└── styles/
    └── tokens.css
```

## The palette rule

**Colours are defined in exactly one place: `src/styles/tokens.css`.** Every other file reaches for a colour only through the Tailwind utility classes that file's `@theme` block generates (`bg-surface`, `text-content-muted`, `border-line`, `fill-cluster-indigo`, ...) -- never a raw hex value. A CI-adjacent check across every phase of this project has been `grep -rnoE '#[0-9a-fA-F]{3,8}\b' src | grep -v tokens.css` returning nothing; run that yourself before adding any new colour. Opacity modifiers on an existing token (`bg-accent-red/12`) are fine; a brand-new hex value is not -- add it to `tokens.css` first.

## Adding a page

1. Add the component under `src/pages/`.
2. Register its route in `src/App.jsx`.
3. Add a nav link in `src/components/Navbar.jsx` if it belongs in primary navigation.
4. Call `usePageTitle(...)` (from `src/lib/usePageTitle.js`) so the browser tab title is set.
5. Reach for existing tokens/components first; only add a new token to `tokens.css` if the design genuinely needs a colour that isn't there yet.
