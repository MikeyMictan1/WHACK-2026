# Backend

FastAPI + SQLModel (SQLite), organised as MVC:

```
app/
  main.py            app setup: middleware, router registration
  core/              config, database engine/session, password + JWT helpers
  models/            tables, request/response schemas, data-access functions  (M)
  controllers/       HTTP routes, one file per area                           (C)
```

The **view** is the React app in `../frontend`.

## Run

```bash
uv sync
cp .env.example .env     # then set JWT_SECRET
uv run fastapi dev app/main.py
```

The API is at http://localhost:8000/api and the interactive docs are at http://localhost:8000/docs.

## Auth

`POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
Login sets a JWT in an httpOnly `access_token` cookie. To protect a route, add a
`user: CurrentUser` parameter (from `app.controllers.deps`).

## Adding a feature

1. `app/models/<thing>.py`: table, schemas, data-access functions. Export it from `app/models/__init__.py`.
2. `app/controllers/<thing>_controller.py`: an `APIRouter`.
3. Register the router in `app/main.py`.
