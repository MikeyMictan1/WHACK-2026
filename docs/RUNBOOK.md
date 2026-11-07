# Runbook

## Starting and stopping the dev servers

Run these from the project root in **Git Bash** (or any bash: macOS/Linux terminal, WSL won't
see the Windows processes). They don't work from PowerShell or cmd directly.

| Command            | What it does                                             |
| ------------------ | -------------------------------------------------------- |
| `scripts/project-start`  | Start backend, then frontend                             |
| `scripts/project-stop`   | Stop frontend and backend                                |
| `scripts/project-restart`| Stop both, then start both again                         |
| `scripts/frontend-start` | Start the Vite dev server on http://localhost:5173       |
| `scripts/frontend-stop`  | Stop it                                                  |
| `scripts/frontend-restart` | Stop it, then start it again                           |
| `scripts/backend-start`  | Start FastAPI on http://127.0.0.1:8000 (docs at `/docs`) |
| `scripts/backend-stop`   | Stop it                                                  |
| `scripts/backend-restart` | Stop it, then start it again (e.g. after editing `backend/.env`) |

`scripts/dev.sh status frontend backend` tells you what's running.

First time on a machine, run `npm run setup` before any of these.

The servers run in the background, so the terminal is free afterwards. Output goes to
`.run/frontend.log` and `.run/backend.log` (gitignored, overwritten on each start):

```bash
tail -f .run/backend.log
```

`npm run dev` still works if you'd rather have both in the foreground with Ctrl+C to stop.

### How the scripts work

All the wrapper scripts in `scripts/` are one-line wrappers around [scripts/dev.sh](scripts/dev.sh), which does
the actual work.

**Start**

1. Checks whether the server already answers HTTP (`http://localhost:5173` or
   `http://127.0.0.1:8000/docs`). If it does, says "already running" and does nothing, so you
   can't end up with two backends.
2. Launches the server detached with `nohup`, logging to `.run/<name>.log`:
   - frontend: `npm run dev --prefix frontend -- --port 5173 --strictPort` (`--strictPort`
     makes Vite fail rather than quietly moving to 5174)
   - backend: `uv run --directory backend fastapi dev app/main.py --port 8000`
3. Polls the URL once a second until it answers (up to 90s). On timeout it prints the last 20
   log lines and exits non-zero.

**Stop**

1. Finds this project's server processes by command line: a `node`/`python`/`uv`/`cmd` process
   whose command line contains the service folder (`<repo>/frontend` or `<repo>/backend`) and
   `vite`/`npm-cli` (frontend) or `fastapi`/`uvicorn` (backend). On Windows this uses
   PowerShell's `Get-CimInstance Win32_Process`; elsewhere `pgrep -f`.
2. Kills each one with its child processes (`taskkill /T /F` on Windows, recursive `kill`
   elsewhere), and repeats up to 5 times until nothing matches.
3. Because it matches by command line, it also stops servers you started by hand with
   `npm run dev`, and it never touches another project's servers.

Why not just save a PID and kill it? On Windows, `uv` → the venv `python.exe` launcher →
uvicorn don't form a single process tree, so killing the launched PID leaves the real server
listening on 8000. Windows also lets a second uvicorn bind 8000 alongside an old one, which is
why start checks first and stop is thorough.

### Troubleshooting

- **"did not answer within 90s"**: read the log lines it printed. The common causes are a
  missing `backend/.env` (copy `.env.example`), dependencies not installed (`npm run setup`),
  or port 5173 taken by something else.
- **"something answers at … but it isn't this project's server"**: another program holds the
  port. Find it with `netstat -ano | grep :8000` (or `:5173`) and stop it.
- **Scripts fail with `$'\r': command not found`**: the files were checked out with CRLF line
  endings. `.gitattributes` forces LF for them on fresh clones; for an existing checkout,
  switch the file to LF in your editor (VS Code: bottom-right "CRLF" → "LF") and save.
- **"Permission denied"** on macOS/Linux: `chmod +x scripts/*`.


## Testing on a phone (same Wi-Fi)

Vite listens on the LAN (`server.host: true`), so a phone on the same Wi-Fi as the laptop can open the site.

1. Find the laptop's Wi-Fi address: `ipconfig` in PowerShell, the IPv4 address under "Wireless LAN adapter Wi-Fi" (ignore VMware/WSL/vEthernet adapters).
2. On the phone open `http://<that-ip>:5173`.
3. First time only: allow Node.js through Windows Firewall on **private** networks when prompted.

The backend stays on 127.0.0.1; Vite's proxy calls it from the laptop. Login works over plain http because
`COOKIE_SECURE` defaults to false. If the phone can't connect, the Wi-Fi probably isolates clients
(common at venues): use the phone's hotspot and join the laptop to it.

To test two accounts on one machine, use a normal window plus an incognito window (cookies are per profile).
