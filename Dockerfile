# One image for the whole app: the React build is served by FastAPI (one origin, so the auth
# cookie needs no cross-site setup). Used by Railway; see RUNBOOK.md "Deploying".

# ---- 1. build the frontend -------------------------------------------------------
FROM node:22-slim AS frontend
WORKDIR /app
# frontend/package.json depends on the root package ("file:.."), so it has to be there too.
COPY package.json ./
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci --prefix frontend
COPY frontend ./frontend
RUN npm run build --prefix frontend

# ---- 2. the backend, serving the build ----------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# pyscard (NFC) has no Linux wheel, so it compiles here: gcc + libc6-dev (C headers), swig, and the
# PC/SC library. There's no reader in the cloud, so NFC just stays idle, but the package has to install.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev swig libpcsclite-dev libpcsclite1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/app ./app
COPY --from=frontend /app/frontend/dist /app/frontend/dist

ENV FRONTEND_DIST=/app/frontend/dist \
    DATABASE_URL=sqlite:////data/app.db \
    COOKIE_SECURE=true
RUN mkdir -p /data

# Railway sets PORT. One worker: NFC/LED state and tap waits live in this process.
CMD ["sh", "-c", "uv run --no-sync fastapi run app/main.py --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
