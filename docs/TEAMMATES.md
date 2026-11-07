# Teammates: get running

## 1. Install once

- **Git** (includes Git Bash): https://git-scm.com/downloads
- **Node.js** (LTS): https://nodejs.org
- **uv** (Python package manager, installs Python for you): https://docs.astral.sh/uv/getting-started/installation/
  - Windows PowerShell: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
  - Close and reopen your terminal afterwards, then check `uv --version` and `node --version`.

## 2. Clone and set up

Use **Git Bash** (the `project-*` scripts are bash).

```bash
git clone https://github.com/MikeyMictan1/WHACK-2026.git
cd WHACK-2026
npm run setup
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

- `JWT_SECRET`: ask Michael for the team value (use the same one, otherwise NFC cards written on someone else's machine won't read on yours). Any long random string is fine for solo work.
- `ANTHROPIC_API_KEY`: get it from Michael. Never commit `.env`.

## 3. Run

```bash
scripts/project-start        # starts backend + frontend in the background
scripts/project-stop         # stops them
scripts/dev.sh status frontend backend
```

Or in any shell: `npm run dev` (foreground, Ctrl+C to stop).

- App: http://localhost:5173
- API docs: http://127.0.0.1:8000/docs
- Logs: `.run/frontend.log`, `.run/backend.log`

Backend and frontend hot-reload. Restart only after editing `backend/.env` or installing packages.

## 4. Working together

- `git pull` before you start, commit small, push often.
- The database (`backend/app.db`) is local and not committed. Everyone has their own users; register a new account on first run.
- If you change a column on an existing table, stop the backend, delete `backend/app.db`, and start again (no migrations).
- Add backend packages with `uv add <pkg> --directory backend`, frontend ones with `npm install <pkg> --prefix frontend`. Never pip.
- Before pushing frontend work: `npm run build --prefix frontend` and `npm run lint --prefix frontend`.

## 5. Hardware (optional)

The app works without it.

- **NFC reader (ACR122U):** plug it in. Needs the `pyscard` package and the reader driver; if missing, NFC just stays disabled.
- **LED matrix:** copy the board script (replace COM3 with your port). Re-copy whenever
  `hardware/unicorn/whack_grid.py` changes (it gained a whole-frame command for LED Home):
  `uvx mpremote connect COM3 cp hardware/unicorn/whack_grid.py :whack_grid.py`

## Troubleshooting

- `'vite' is not recognized`: you skipped `npm run setup`.
- Port already in use: `scripts/project-stop`, then start again.
- More in [RUNBOOK.md](RUNBOOK.md).
