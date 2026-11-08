# Runbook

How to set up, run, demo and deploy Whack. Code-level notes for working on the app live in
[CLAUDE.md](../CLAUDE.md); teammate onboarding in [TEAMMATES.md](TEAMMATES.md).

Contents:
1. [First-time setup](#1-first-time-setup)
2. [Running locally](#2-running-locally)
3. [Demo accounts and data](#3-demo-accounts-and-data)
4. [Settings (`backend/.env`)](#4-settings-backendenv)
5. [Hardware: NFC reader and LED board](#5-hardware-nfc-reader-and-led-board)
6. [Phones](#6-phones)
7. [Deploying (Railway)](#7-deploying-railway)
8. [Laptop bridge (hardware for the deployed site)](#8-laptop-bridge-hardware-for-the-deployed-site)
9. [Demo day checklist](#9-demo-day-checklist)
10. [How the scripts work](#10-how-the-scripts-work)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. First-time setup

Install once: Git (includes Git Bash), Node.js LTS, and [uv](https://docs.astral.sh/uv/) (it
installs Python for you). Then, in **Git Bash** at the repo root:

```bash
npm run setup                        # installs root, frontend (npm) and backend (uv) packages
cp backend/.env.example backend/.env
```

Edit `backend/.env`: at least `JWT_SECRET` (use the team's value if you share NFC cards) and
`ANTHROPIC_API_KEY`. See [section 4](#4-settings-backendenv) for the rest.

Optional: `npm run seed` for ready-made demo accounts ([section 3](#3-demo-accounts-and-data)).

## 2. Running locally

The scripts are bash: run them from the repo root in **Git Bash** (not PowerShell or cmd).

| Command | What it does |
| --- | --- |
| `scripts/project-start` | Start backend, then frontend, in the background |
| `scripts/project-stop` | Stop both |
| `scripts/project-restart` | Stop both, start both |
| `scripts/frontend-start` / `-stop` / `-restart` | Vite dev server on http://localhost:5173 |
| `scripts/backend-start` / `-stop` / `-restart` | FastAPI on http://127.0.0.1:8000 (API docs at `/docs`) |
| `scripts/dev.sh status frontend backend` | What's running |
| `npm run dev` | Both in the foreground (any shell), Ctrl+C stops |

- Logs: `.run/frontend.log` and `.run/backend.log` (overwritten on each start). Follow one with
  `tail -f .run/backend.log`.
- Both servers hot-reload on code changes. Restart the backend (`scripts/backend-restart`) after
  editing `backend/.env`, installing packages, or when a change doesn't show up (hot reload can hang
  on the open NFC stream).
- The frontend always calls `/api/...`; Vite proxies that to the backend, so the login cookie stays
  same-origin.
- Packages: backend `uv add <pkg> --directory backend` (never pip); frontend
  `npm install <pkg> --prefix frontend`.
- Before pushing frontend work: `npm run build --prefix frontend` and `npm run lint --prefix frontend`.

## 3. Demo accounts and data

```bash
npm run seed          # add the demo accounts if they're missing (safe to repeat)
npm run seed:reset    # erase EVERY table, then add them again (works while the backend runs)
```

| Account | Login | What it is |
| --- | --- | --- |
| Parent | `demo_parent` / `whack-demo-1` | Has example rewards and chores, sees both kids |
| Child | `demo_kid` / `1234` | Younger kid on the starter card (CaliccoCredit) |
| Child | `demo_teen` / `1234` | Older kid with a stronger record (can unlock Venture <W>) |
| Admin | `admin` / `ADMIN_PASSWORD` | Built in; moves the site clock and sees every family |

Each kid starts with some money. Kids are created by their parent (dashboard → Add child) and log
in on the normal login page; only parents can register.

**Moving time.** Two separate clocks:
- **Parent → "Skip a month"** (on each kid in the parent dashboard): moves that child's credit clock
  4 weeks. Pays 4 weekly allowances, passes the statement due date (interest and late fees if
  unpaid) and issues a new statement. Statements are due 14 days after they're issued.
- **Admin → site clock** (admin dashboard): moves the whole site's "now" by a day, week or month,
  for everything else that uses dates (weekly item cooldowns, request expiry, LED clock). Reset puts
  it back to real time.

**The database** is `backend/app.db` (SQLite, local, not committed: everyone has their own data).
Adding a model field upgrades the table automatically on the next start. Renaming, deleting or
retyping a column can't be done automatically: the backend logs a warning, and then
`npm run seed:reset` (or stop the backend and delete `backend/app.db`) starts fresh. That wipes all
accounts.

## 4. Settings (`backend/.env`)

All settings have defaults in `backend/app/core/config.py`; `backend/.env.example` lists them.
**Never commit `backend/.env`.**

| Setting | Default | What it does |
| --- | --- | --- |
| `JWT_SECRET` | dev value | Signs login cookies. Also the key for data saved on NFC cards, so keep it the same across machines that share cards |
| `ANTHROPIC_API_KEY` | empty | Claude: negotiation bot, help bot, AI page. Without it the scripted fallbacks run |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin-change-me` | The built-in admin (reset to these on every start). Change the password anywhere public |
| `DATABASE_URL` | `sqlite:///./app.db` | Where the database lives |
| `COOKIE_SECURE` | `false` | `true` on HTTPS (the Dockerfile sets it) |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | Only matters if the frontend runs on another origin |
| `FRONTEND_DIST` | empty | Folder of the built frontend for the backend to serve (production only) |
| `ALLOW_SIMULATED_TAP` | `true` | Shows "Simulate tap" as a stand-in for a card tap |
| `ALLOW_PHONE_TAP` | `true` | Lets Android phones tap the card themselves (Web NFC) |
| `BRIDGE_TOKEN` | empty | Shared secret for the laptop bridge. Empty on the site = bridge off |
| `BRIDGE_URL` | empty | Laptop only: the deployed site the bridge connects to |
| `NFC_SECRET` | empty | Separate key for card saves (falls back to `JWT_SECRET`). Changing it makes saved cards unreadable |
| `PUSH_SUBJECT` | `mailto:whack-demo@example.com` | Contact sent to push services with notifications |
| `WEATHER_LAT` / `WEATHER_LON` | London | Location for the LED weather skin |

## 5. Hardware: NFC reader and LED board

Both are optional: without them the app works, NFC shows as disconnected and the LED page says
"not found".

**NFC reader (ACR122U).** Plug it into the machine running the backend. It needs the `pyscard`
package (installed by `npm run setup`) and the reader's PC/SC driver. Check
http://127.0.0.1:8000/api/nfc/status: `"connected": true, "via": "local"`.

Taps only do something when a screen asks for one:

| Screen | What the tap does |
| --- | --- |
| Shop → "Tap your card" (after the parent approves) | Pays. The card must be the child's; a child's first card gets linked to them |
| Plan switch → "Confirm with card tap" | Switches the plan |
| Monthly review (`/review`) → pay the statement | Pays the credit card statement |
| Profile → "Log out with NFC" (children) | Moves the child's saved data onto their card, then logs out |
| Logged out, any page | Logs in the child the card belongs to (restoring saved data if the card has some) |

Cards: NTAG213/215/216 stickers or cards, or MIFARE Classic 1K. If a card is already lying on the
reader, lift it and tap again (only a new tap counts).

**LED board (Pimoroni Stellar Unicorn, Pico 2 W).** Plug it in by USB; the backend finds it by
itself. The board needs our script copied to it once (and again whenever
`hardware/unicorn/whack_grid.py` changes). Replace `COM3` with your port:

```bash
uvx mpremote connect COM3 cp hardware/unicorn/whack_grid.py :whack_grid.py
```

LED Home (`/led`) mirrors the board and lets kids equip skins. Boards with an older copy of the
script still work, at 1 frame per second.

## 6. Phones

**Same Wi-Fi as the laptop (local dev).** Vite listens on the LAN.
1. Find the laptop's Wi-Fi IPv4 address: `ipconfig` in PowerShell, under "Wireless LAN adapter
   Wi-Fi" (ignore VMware/WSL/vEthernet).
2. On the phone open `http://<that-ip>:5173`.
3. First time: allow Node.js through Windows Firewall on **private** networks.

If the phone can't connect, the Wi-Fi probably isolates devices (common at venues): use the phone's
hotspot and join the laptop to it. Phone tapping and notifications need HTTPS, so they only work on
the deployed site, not over `http://<ip>:5173`.

**Tap the card on an Android phone** (Chrome, HTTPS site, NFC on). The shop's pay screen, statement
payment on Monthly review, the plan-switch confirm and the login page show "Tap card on this phone".
It reads the card's ID, so it works for paying, switching plans and logging in; "Log out with NFC"
still needs the reader. Use NTAG cards
(MIFARE Classic often won't read on phones). iPhones can't do this.

**Phone notifications.** Dashboard → "Phone notifications" → Turn on, then "Send a test".
- Parents: when a kid asks to buy something or finishes a chore.
- Kids: when a purchase is approved ("Tap your card to buy…") or denied.
- Android Chrome: works straight away. iPhone (iOS 16.4+): Share → Add to Home Screen, open Whack
  from the home screen, then turn notifications on there.
- If it says notifications are blocked, allow them for the site in the browser's site settings.

To test two accounts on one computer, use a normal window plus an incognito window.

## 7. Deploying (Railway)

Live site: https://whack-2026-production.up.railway.app

The app ships as one Docker image (`Dockerfile`): FastAPI serves the React build, so the site and
`/api` share one origin. `railway.json` tells Railway to use it, health-check `/api/health` and run a
**single** instance (tap waits and NFC/LED state live in that one process: don't scale it out).
Every push to `main` redeploys automatically (a build takes 3 to 5 minutes).

One-time setup (already done for the live site):

1. railway.app → sign in with GitHub → New Project → Deploy from GitHub repo → `WHACK-2026`, branch
   `main`.
2. Service → **Volumes** → add one mounted at **`/data`**. The database lives there; without it
   every deploy wipes all accounts.
3. Service → **Variables**:
   - `JWT_SECRET`: a long random string. Keep it stable (changing it logs everyone out)
   - `ANTHROPIC_API_KEY`
   - `ADMIN_PASSWORD`: **change it**. The default is public in this repo
   - `ALLOW_SIMULATED_TAP=true`
   - `BRIDGE_TOKEN`: a long random string, for the laptop bridge ([section 8](#8-laptop-bridge-hardware-for-the-deployed-site))
   - Set by the Dockerfile, don't add: `DATABASE_URL`, `FRONTEND_DIST`, `COOKIE_SECURE`
   - Not needed: push notification keys are created in the database on first use
4. Settings → Networking → **Generate Domain** (no TCP proxy needed).

Generate random secrets in Git Bash:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Cost: the trial's $5 credit covers a hackathon easily (the app uses a few hundred MB of memory).
Keeping it up for weeks afterwards needs the Hobby plan.

If a build fails: Deployments → the failed one → Build Logs, and look for the first `error`.

Check the production build locally without Docker (Git Bash, from `backend/`):
```bash
npm run build --prefix ../frontend
FRONTEND_DIST=../frontend/dist uv run fastapi run app/main.py --port 8011
```
then open http://127.0.0.1:8011.

## 8. Laptop bridge (hardware for the deployed site)

The Railway server has no reader or LED board of its own, and websites can't use USB card readers.
The bridge (`backend/app/bridge.py`) runs on the laptop the ACR122U and/or LED board are plugged
into and lends them to the live site over a WebSocket (`/api/nfc/bridge`):
taps go up; card reads/writes and LED frames come down. Every tap screen then works with that reader,
from any device: someone presses Pay on their phone and taps on the laptop's reader.

Setup:
1. Railway → Variables → `BRIDGE_TOKEN` (see [section 7](#7-deploying-railway)).
2. On the laptop, in `backend/.env`:
   ```
   BRIDGE_URL=https://whack-2026-production.up.railway.app
   BRIDGE_TOKEN=<the same token>
   ```
3. Run it (Git Bash, repo root):
   ```bash
   scripts/backend-stop      # only one program may talk to the reader
   npm run bridge
   ```
   It prints `connected`, the reader name and whether it found the LED board. Leave the terminal open:
   closing it stops real taps (the site itself stays up).

- One bridge at a time; a new one replaces the old. Any laptop with the repo, `uv` and the same two
  settings can run it.
- https://whack-2026-production.up.railway.app/api/nfc/status shows `"via": "bridge"` while connected.
- "refused the token": the two `BRIDGE_TOKEN`s differ. "HTTP 404/502": wrong URL or the site is down.
  "SSLCertVerificationError": update the repo (the bridge uses `certifi` to avoid an expired root in
  the Windows certificate store).

## 9. Demo day checklist

- [ ] Latest `main` deployed and **Active** on Railway; log in once to check.
- [ ] `ADMIN_PASSWORD` known to whoever runs the demo (for the site clock).
- [ ] Reader and LED board plugged into the laptop, `scripts/backend-stop`, then `npm run bridge` running.
- [ ] Tap test: child requests something, parent approves, tap on the reader → paid.
- [ ] Phones: notifications turned on for the parent (and kid), a test notification received.
- [ ] Android phone tap tried with an NTAG card, if you'll show it.
- [ ] Phone hotspot ready in case the venue Wi-Fi blocks the bridge.
- [ ] Backup: "Simulate tap" (`ALLOW_SIMULATED_TAP=true`) if hardware fails.
- [ ] Local fallback: `scripts/project-start` + `npm run seed` runs everything on the laptop with
      the reader plugged straight in.

## 10. How the scripts work

The scripts in `scripts/` are one-line wrappers around [scripts/dev.sh](../scripts/dev.sh).

**Start**
1. Checks whether the server already answers (`http://localhost:5173` or
   `http://127.0.0.1:8000/docs`). If it does, says "already running", so you can't end up with two.
2. Launches it detached with `nohup`, logging to `.run/<name>.log`:
   - frontend: `npm run dev --prefix frontend -- --port 5173 --strictPort` (fails rather than
     moving to 5174)
   - backend: `uv run --directory backend fastapi dev app/main.py --port 8000`
3. Polls once a second until it answers (up to 90 s); on timeout prints the last 20 log lines.

**Stop**
1. Finds this project's server processes by command line (a `node`/`python`/`uv`/`cmd` process whose
   command line contains `<repo>/frontend` or `<repo>/backend` plus `vite`/`npm-cli` or
   `fastapi`/`uvicorn`). Windows: PowerShell `Get-CimInstance Win32_Process`; elsewhere `pgrep -f`.
2. Kills each with its children (`taskkill /T /F` on Windows) and repeats up to 5 times.
3. It also stops servers started by hand with `npm run dev`, and never touches other projects.

Why not save a PID? On Windows, `uv` → the venv `python.exe` launcher → uvicorn aren't one process
tree, so killing the launched PID leaves the real server on port 8000, and Windows lets a second
uvicorn bind the same port. Hence the check on start and the thorough stop.

## 11. Troubleshooting

- **"did not answer within 90s"**: read the log lines it printed. Usually a missing `backend/.env`
  (copy `.env.example`), packages not installed (`npm run setup`), or port 5173 taken.
- **"something answers at … but it isn't this project's server"**: another program holds the port.
  Find it with `netstat -ano | grep :8000` (or `:5173`) and stop it.
- **`'vite' is not recognized`**: you skipped `npm run setup`.
- **Backend change doesn't show up**: `scripts/backend-restart` (hot reload can hang).
- **Scripts fail with `$'\r': command not found`**: CRLF line endings. Switch the file to LF in your
  editor (VS Code: bottom-right "CRLF" → "LF") and save. Fresh clones get LF from `.gitattributes`.
- **"Permission denied"** on macOS/Linux: `chmod +x scripts/*`.
- **NFC shows disconnected**: reader unplugged, driver missing, or another program (a second backend,
  or the bridge) is using it. Only run one of them.
- **Card tap does nothing**: a tap only counts while a screen is asking for one, and only a new tap
  (lift the card first). "That card belongs to someone else": cards are linked to the first child who
  paid with them.
- **Startup warning about a column**: a model change the auto-upgrade can't apply.
  `npm run seed:reset` starts fresh (wipes data).
- **LED page says "not found"**: board unplugged, or the script isn't on it (see [section 5](#5-hardware-nfc-reader-and-led-board)).
