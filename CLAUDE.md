# Whack (hackathon template)

React + Tailwind frontend, FastAPI + SQLModel (SQLite) backend in MVC, cookie-based JWT auth,
a Claude-powered AI page, and two hardware integrations: an NFC card reader and a 16x16 LED
matrix. This is hackathon code, so favour working and demoable over tested and abstract.
Don't add tests, CI, migrations frameworks or extra layers unless asked.

## Running

The user is on Windows. Project scripts are bash and run from Git Bash at the repo root:

- `scripts/project-start` / `scripts/project-stop` / `scripts/project-restart` both servers in the background (also `scripts/frontend-*`, `scripts/backend-*`)
- `scripts/dev.sh status frontend backend` shows what's up. Logs: `.run/frontend.log`, `.run/backend.log`
- `npm run dev` runs both in the foreground; `npm run setup` installs everything (first time)
- Frontend http://localhost:5173 · backend http://127.0.0.1:8000 · API docs http://127.0.0.1:8000/docs
- Vite proxies `/api/*` to the backend, so the frontend always calls relative `/api/...` paths
- Preview configs for the browser pane are in `.claude/launch.json` (`frontend`, `backend`, `dev`)

How the scripts work and how to troubleshoot them: [RUNBOOK.md](RUNBOOK.md).

`fastapi dev` hot-reloads the backend and Vite hot-reloads the frontend, so after editing code
there's no need to restart. Restart only after changing `backend/.env` or installing packages.

Checks before saying frontend work is done: `npm run build --prefix frontend` (typechecks) and
`npm run lint --prefix frontend` (oxlint). Backend has no test suite; exercise endpoints via
`/docs` or curl.

Packages: backend uses **uv** (`uv add <pkg> --directory backend`, never pip). Frontend uses npm
in `frontend/` (`npm install <pkg> --prefix frontend`).

## Layout

```
backend/app/
  main.py            app setup; every controller's router is registered here under /api
  core/              config (pydantic-settings, reads backend/.env), database, security (JWT,
                     argon2), nfc_card (reader I/O), unicorn (LED matrix serial bridge)
  models/            M: SQLModel tables + request/response schemas + data-access functions
  controllers/       C: one APIRouter per area; deps.py has CurrentUser and CurrentParent
frontend/src/
  main.tsx           entry (only file directly in src/)
  app/App.tsx        route table
  lib/api.ts         api<T>(path, { method, json }) fetch wrapper; throws ApiError(status, message)
  styles/index.css   Tailwind import + design tokens (@theme) + utilities
  components/
    layout/          NavBar, Footer, Layout, PageHeader, Logo, Sheet, navigation.ts (nav links)
    ui/              Button, TextField, FormError, Skeleton, Toaster + showToast()
    feature/         FeaturePage placeholder scaffold, ApiStatus
    visual/          BlurBackdrop, Flashlight
  auth/              AuthProvider, useAuth(), RequireAuth, Login/Register pages
  dashboard/         /dashboard: ParentDashboard (manage kids) or ChildDashboard, by user.role
  front-page/  feature-1/  feature-2/  ai-feature/  profile/  vault/  nfc/  legal/  not-found/
  assets/            backdrop/, carousel/, mascot/ images (numbered PNGs, see each README)
hardware/unicorn/    whack_grid.py, MicroPython that runs on the LED board
```

## Adding a feature (the usual path)

Backend:
1. `backend/app/models/<thing>.py`: the `SQLModel` table, Pydantic request/response schemas, and
   plain data-access functions taking a `Session`. Export it from `app/models/__init__.py`
   (this is what registers the table).
2. `backend/app/controllers/<thing>_controller.py`: `router = APIRouter(prefix="/<thing>", tags=[...])`.
   Use `session: SessionDep` for the DB and `user: CurrentUser` to require login.
   Raise `HTTPException(status.HTTP_..., "message")`; the frontend shows `detail` to the user.
3. Import it in `app/main.py` and add it to both the import list and the router tuple.

Frontend:
1. New folder `src/<thing>/` with `<Thing>Page.tsx` (named export) and, if needed, `<thing>Api.ts`
   wrapping `api()` calls with types.
2. Register the route in `app/App.tsx` (wrap in `<RequireAuth>` if it needs login).
3. Optionally add it to `NAV_LINKS` in `components/layout/navigation.ts`.

`feature-1` (`/feature-1`, `/api/feature-1`) is still a placeholder; repurpose it rather than
adding a parallel page. `feature-2` is the LED grid page.

## Gotchas

- **No migrations.** `init_db()` runs `SQLModel.metadata.create_all`, which creates missing tables
  but never adds columns to existing ones. After adding or changing a column on an existing table,
  stop the backend, delete `backend/app.db`, and start it again (this wipes users and data).
  Tell the user when you do this.
- **Accounts:** one `user` table with `role` = `parent` | `child`. `/auth/register` only creates
  parents; children are created by their parent via `/api/children` (`parent_id` set) and log in
  on the normal login page. Use `CurrentParent` for parent-only endpoints.
- **Auth is a cookie**, not a header. `api()` sends `credentials: 'include'`; don't add
  Authorization headers or localStorage tokens.
- **Imports include the extension** in the frontend (`'./Foo.tsx'`, `'../lib/api.ts'`).
- **React Compiler is on** (babel plugin), so don't hand-add `useMemo`/`useCallback` for perf.
- **React Router v7** imports from `'react-router'` (not `react-router-dom`).
- Hardware is optional: if `pyscard` or the reader is missing, NFC stays disabled; if no Pico is
  plugged in, the LED page reports "not found". Don't make the app depend on hardware being there.
- Never commit `backend/.env` (it holds `JWT_SECRET` and `ANTHROPIC_API_KEY`). New settings go in
  `core/config.py` with a default and get documented in `backend/.env.example`.

## AI feature

`backend/app/controllers/ai_controller.py` calls the Anthropic SDK (`MODEL = "claude-haiku-5-5"`,
`output_config={"effort": "low"}`), single-turn, non-streaming. The client is created lazily so
the app boots without a key; missing key returns 503 and the page says so. Reuse `get_client()`
and its error mapping for new AI endpoints. For streaming, follow the SSE pattern in
`nfc_controller.nfc_events` (FastAPI `StreamingResponse`) and read it with `fetch` streaming or
`EventSource` on the frontend. Use the claude-api skill for model IDs and API details.

## Change plan and negotiation

Child flow: `/review` (always has "Change plan?") -> `/plans` (five cards, `plans_controller`) ->
`/plans/:cardId/negotiate` (`negotiation_controller`) -> accept -> tap card (or "Simulate tap" in dev)
-> plan switched. Money is integer hundredths of a Whack Coin (WC, play money; shown as "40.00 WC"), APR is integer basis points (2499 = 24.99%).

- Numbers are the backend's: `models/pricing.py` computes the floor APR from score, payment streak and
  utilisation, and `clamp_offer` limits every bot offer (down to the floor in steps; up by 1 point per rude message, at most 3 points over the listed APR). The bot (`core/seller_bot.py`) never sees the
  floor; it calls a `make_offer` tool and is told what was recorded. The UI shows the recorded offer.
- `models/card.py` seeds the five cards and holds `CreditProfile`, a stand-in for the child's score,
  balance and current plan (created with demo values on first use). Replace `get_profile` when the real
  score and statements exist.
- If Claude is unreachable the scripted bot in `seller_bot.py` takes over so the demo still runs.
- `core/led_feedback.py` fills a bar on the LED grid as the discount grows; it is best effort.
- `ALLOW_SIMULATED_TAP` (config) enables the dev-only simulate button on the confirm screen.

## Hardware

**NFC** (ACR122U reader via PC/SC, `pyscard`): `core/nfc_card.py` reads/writes raw tag memory
(NTAG21x, Ultralight, MIFARE Classic 1K); all access must hold `card_lock` because a background
poller shares the reader. `controllers/nfc_controller.py` runs that poller (started in
`main.lifespan`) and pushes `hello`/`reader`/`card`/`card_removed` events over SSE at
`/api/nfc/events`; `frontend/src/nfc/useNfc.ts` consumes them. "Log out with NFC" moves the user's
vault (`models/vault.py`) onto the card, AES-GCM encrypted with the card UID as associated data
and a one-time save id; tapping the card while logged out logs in and moves it back. Changing
`NFC_SECRET`/`JWT_SECRET` makes existing cards unreadable.

**LED matrix** (Pimoroni Stellar Unicorn 16x16 on a Pico 2 W, USB serial): `core/unicorn.py` finds
the board by USB VID, Ctrl-C's whatever runs, starts `whack_grid.run()`, then sends line commands
`P x y r g b`, `C`, `B n`. The board needs `hardware/unicorn/whack_grid.py` copied to it once:
`uvx mpremote connect COM3 cp hardware/unicorn/whack_grid.py :whack_grid.py`.
`controllers/feature2_controller.py` exposes it under `/api/feature-2`.

## Design rules (frontend)

The look is deliberate; keep new UI consistent with it.

- Tokens live in `src/styles/index.css` `@theme`. Use them (`text-ink`, `text-muted`, `bg-paper`,
  `bg-sky`, `border-line`, `bg-signal`, `text-d1`..`text-d4`, `text-lead`) instead of raw hex or
  default Tailwind colours. Utilities: `container-x` (page gutter), `grid-12`, `meta` (small label).
- One typeface (Outfit). Square corners, no shadows, no glass/blur cards. Surfaces are solid and
  separated by 1px rules. Acid lime `signal` is the only highlight colour, used sparingly.
- Pages start with `<PageHeader marker="0N" title description />`, content in
  `<section className="container-x py-10 md:py-14">`.
- Use `Button`, `TextField`, `FormError`, `Skeleton` (loading states, never a blank screen) and
  `showToast(message, 'info' | 'error')` from `components/ui` rather than new one-offs.
- Avoid the generic-AI look listed in [.claude/vibe-code.md](.claude/vibe-code.md): no emoji in
  headings, no em-dash-heavy or buzzword copy, no gradients/orbs/dot grids, no three-cards-in-a-row,
  bento grids, fake testimonials, scroll fade-ins or hover gimmicks. Read that file before any
  sizeable UI work.
- For bigger visual work (new pages, redesigns), also read
  `.claude/web-design-engineer/SKILL.md` and follow it.

## Working style

- Keep changes small and in the existing structure; match the surrounding code's style.
- The user runs Windows with PowerShell as the default shell; give commands for Git Bash when they
  use the project scripts, and say which shell a command is for.
- Update README.md / RUNBOOK.md / backend/README.md when you change how something is run or set up.
