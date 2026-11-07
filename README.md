# Whack template

React + Tailwind frontend, FastAPI backend (MVC), cookie-based JWT login.

```
backend/    FastAPI app: app/models (M), app/controllers (C), app/core   → see backend/README.md
frontend/   React app, the view (V)
```

## Run

From the project root, first time only:

```bash
npm run setup      # installs root, frontend and backend dependencies
```

Then start both servers in one terminal:

```bash
npm run dev        # frontend http://localhost:5173 · backend http://localhost:8000/docs
```

Ctrl+C stops both. To run just one: `npm run dev:backend` or `npm run dev:frontend`.

To run them in the background instead, use `./project-start` / `./project-stop` (and
`./frontend-start`, `./backend-stop`, ...) from Git Bash. See [RUNBOOK.md](RUNBOOK.md).
The backend takes a few seconds longer to start, so the site may show "Backend offline" briefly.

Vite proxies `/api/*` to the backend, so the auth cookie stays same-origin in dev.

## Frontend layout

```
src/
  main.tsx              entry (the only file directly in src/)
  app/                  App.tsx: route table
  styles/               index.css: Tailwind import + design tokens (@theme)
  lib/                  api.ts: fetch wrapper (credentials, errors)
  components/
    layout/             NavBar, Footer, Layout, PageHeader, Logo, navigation links
    ui/                 Button, TextField, FormError
    feature/            shared placeholder scaffold for feature pages
  auth/                 AuthProvider, useAuth, RequireAuth, Login/Register pages
  front-page/  feature-1/  feature-2/  ai-feature/  profile/  not-found/
```

To add a page: create a folder, add the component, register the route in `app/App.tsx`, and
(optionally) add it to `components/layout/navigation.ts`.
