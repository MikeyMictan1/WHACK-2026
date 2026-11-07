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
- `npm run seed` adds demo accounts (parent `demo_parent`, kids `demo_kid` and `demo_teen`; logins in
  `backend/app/seed.py`); `npm run seed:reset` erases all data first. Safe to repeat.
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
                     argon2), nfc_card (reader I/O), unicorn (LED matrix serial bridge),
                     led_skins (what the LED can show: one render function per skin)
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
  dashboard/         /dashboard: ParentDashboard (approvals, manage kids) or ChildDashboard, by user.role
  shop/  earn/  manage/  child /shop (+ PurchaseFlow overlay), child /earn, parent /manage; shopApi.ts
  led/               /led "LED Home": live LedGrid of the board + wardrobe of skins
  learn/             /learn info pages: expandable lessons with small demos; text lives in learn/content.ts
  help/              the Ask button (bottom right, every page except the negotiation chat) and its chat panel
  front-page/  ai-feature/  profile/  vault/  nfc/  legal/  not-found/
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

The template's feature-1 and feature-2 are gone: the nav is Shop (`/shop`), LED Home (`/led`) and
AI. The old paths redirect.

## Gotchas

- **Schema upgrades are mostly automatic.** `init_db()` creates missing tables (`create_all`) and then
  adds any columns an existing table is missing (`_add_missing_columns` in `core/database.py`), so
  adding a field to a model just works and keeps existing data. It cannot rename, delete or retype a
  column, or add a required column that has no default; it logs a warning at startup when it hits one
  of those. Then run `npm run seed:reset` (erases every table, then re-adds the demo accounts) or stop
  the backend and delete `backend/app.db`. Tell the user when you wipe data. Give new required columns
  a default (`Field(default=...)`) so they can be added automatically.
- **Accounts:** one `user` table with `role` = `parent` | `child`. `/auth/register` only creates
  parents; children are created by their parent via `/api/children` (`parent_id` set) and log in
  on the normal login page. Use `CurrentParent` for parent-only endpoints.
- **Admin:** a third role, `admin`, is one built-in account (`ADMIN_USERNAME`/`ADMIN_PASSWORD`,
  default `admin` / `admin-change-me`). Nothing can register it; `init_db()` calls `ensure_admin()` on
  every start, which recreates it if missing and resets its role and password. A `before_delete` hook
  on `User` refuses to delete it. Use `CurrentAdmin` for admin-only endpoints.
- **Site clock** (`models/clock.py`, `/api/clock`): the site's own "now" = real time + whatever the
  admin added (a day, week or calendar month; reset drops the additions). **The whole site runs on it:**
  never call `datetime.now()` in app code, use `site_now()` (or `shop.utcnow()`, which wraps it). The
  only real-time clocks are security ones: JWT expiry (`core/security.py`) and the NFC card save stamp.
  The LED clock/date skins add `site_offset()` to local time.
- **Play money** (`models/shop.py`, `shop_controller`, `chores_controller`): amounts are integer
  pence; balance = sum of `LedgerEntry` rows (never store a balance column). Purchase requests go
  `pending -> approved -> paid`; `/shop/requests/{id}/pay` blocks up to 30 s waiting for a tap on
  the reader (`?simulate=true` skips it). A child's first card used to pay gets linked (`CardLink`).
  New parents get example rewards/chores (`STARTER_REWARDS`). Parent screens poll every 2-3 s.
- **Backend hot reload can hang** (open SSE streams / the NFC thread). If an endpoint change doesn't
  show up, run `scripts/backend-restart`.
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

## Credit core

`models/credit.py` holds the rules and `controllers/credit_controller.py` the API (docs/DESIGN.md 6.1).

- A child on a credit card spends on the card: `shop_controller.pay` calls `charge_purchase` instead of taking
  money from the ledger, and declines over the limit. On Debit it still takes the child's own balance.
  The purchase is claimed first with `set_status_if` (race-safe), then charged in the same transaction.
- Statement payments (`POST /api/credit/payments`) take a tap like purchases: reader or laptop bridge
  (`wait_for_card_tap`), a phone tap (`card_uid`), or `simulate`.
- `CreditProfile.balance` (what is owed) changes only through `credit.post_entry`, together with a
  `CreditEntry`. Never edit it directly. Functions in `models/credit.py` never commit; the caller does, so a
  purchase or payment and its ledger entries succeed or fail together.
- Each child has their own clock (`CreditProfile.sim_now`). Only the parent's "Skip a month"
  (`advance_month`, `POST /api/credit/children/{id}/skip-month`) moves it: 4 weeks, 4 allowances, the due date
  passes, interest and any late fee, a new `Statement`. Statements are due 14 days after they are issued.
  This is separate from the admin's site clock (`models/clock.py`, `site_now()`), which the shop uses.
- The seeded cards follow DESIGN.md 6.1 (`models/card.py`).
- The credit score (`models/score.py`) is 300 + payment history (250) + credit used (150) + history (100). It is
  recalculated only in `advance_month`, and every change is saved as a `ScoreEvent` with its reason. It is always
  tracked, but only shown where the parent turned it on (`score_enabled`, mirroring the form's presets); the API
  returns `score: null` otherwise, the AI helper and the sellers are told not to name a number, and locked-card
  messages use neutral wording. Change the maths and `score_rules_test`-style checks need new numbers.
- A child can change plan once a month (`switch_locked_reason`); Plans and the negotiation both check it.

## Parent dashboard: kids list, breakdown, starting limit

- `User.starting_credit_limit` (minor units, 100 to 10000, null = card's own) applies to the starter card
  `STARTER_CARD_ID` (Whack Basic) only. Always get a child's limit through `models/card.card_limit_for`, never
  `card.credit_limit` directly (plans, opener, bot prompt, `confirm_switch` all pass it). Editing it updates the
  profile at once if the child is still on the starter card.
- `GET /api/breakdown/{child_id}` (parent, own children only) and `POST .../recap` (20 s cooldown) in
  `breakdown_controller`; numbers from `models/breakdown.py`. The parent sees the score even if the child's tracking is off.
- `core/recap_bot.py`: the facts sheet is built in code, Claude only writes JSON sentences from it, any number not in the
  facts is rejected (one retry), then `template_recap`. Never send the child's name. Saved in `Recap` (deleted with the child).

## Child home: decor and spending chart

- Decor = any in-game reward the child has paid for (`models/decor.owned_decor`). `DecorPlacement` stores side and slot;
  `PUT /api/decor` saves the whole layout (owned only, once each, 4 per side). `GET /api/decor/spending` feeds the Home chart
  (reuses `models/breakdown.spending_breakdown`). Frontend: `decor/` (page, panel, tile); no art exists, tiles show the item's initial.

## Change plan and negotiation

Child flow: `/review` (always has "Change plan?") -> `/plans` (five cards, `plans_controller`) ->
`/plans/:cardId/negotiate` (`negotiation_controller`) -> accept -> tap card (or "Simulate tap" in dev)
-> plan switched. Money is integer hundredths of a Whack Coin (WC, play money; shown as "40.00 WC"; format with `formatMoney`/`money()`, both driven by `CURRENCY` in `frontend/src/lib/money.ts`), APR is integer basis points (2499 = 24.99%).

- Numbers are the backend's: `models/pricing.py` computes the floor APR from score, payment streak and
  utilisation, and `clamp_offer` limits every bot offer (down to the floor in steps; up per rude message by the card's `penalty_step_bp`, at most `max_penalty_bp` over the listed APR: 1 and 3 points,
  but Loan Shark punishes hard, 2.5 and 5 points; politeness takes a penalty back off 1 point a message). The bot (`core/seller_bot.py`) never sees the
  floor; it calls a `make_offer` tool and is told what was recorded. The UI shows the recorded offer.
- `models/card.py` seeds the five cards and holds `CreditProfile`, the child's credit account (their card,
  what they owe, their clock, their score and its three parts; created on first use through `get_profile`, which
  also sets up the score for older accounts).
- If Claude is unreachable the scripted bot in `seller_bot.py` takes over so the demo still runs.
- Each seller has a character: `PERSONAS` (Mia, Simon Smith, Priya, Linguini the Godfather-style loan shark),
  `OPENERS` and the offline `SCRIPTS` in `core/seller_bot.py`, keyed by card id. A new negotiable card needs an
  entry in all three. Characters change wording only; the floor, the card's rude penalty and each card's maximum
  discount stay backend rules. Linguini never threatens or shames the child and never states a false number.
  Seller names live in `Card.seller` (`models/card.py`); `list_cards` copies the seed over existing rows.
- `core/led_feedback.py` fills a bar on the LED grid as the discount grows; it is best effort.
  It goes through `core/led_overlay.py` (shown for a few seconds, then the equipped skin returns).
  **Never write to `unicorn` directly**: the LED Home display loop owns the board and would
  overwrite it. Use `led_overlay.show(frame, seconds)` for any event feedback.
- `ALLOW_SIMULATED_TAP` (config) enables the dev-only simulate button on the confirm screen.

## Info pages and the AI helper

- `/learn` (footer link "Info pages") holds eight lessons from `learn/content.ts`; `/learn#apr` opens one.
  Demo numbers are examples computed in the browser, not account data.
- `POST /api/help/chat` (`help_controller`, `core/help_bot.py`) answers credit and app questions. Open to
  everyone; a signed-in child's answers also know their score, plan and APR. Questions are saved in
  `HelpMessage` for parents. It is rate limited, falls back to a short scripted answer if Claude is down,
  and must never reveal negotiation floor rates. Lesson ids and titles in `help_bot.TOPICS` mirror
  `learn/content.ts`; keep them in step when adding a lesson.

## Hardware

**NFC** (ACR122U reader via PC/SC, `pyscard`): `core/nfc_card.py` reads/writes raw tag memory
(NTAG21x, Ultralight, MIFARE Classic 1K); all access must hold `card_lock` because a background
poller shares the reader. `core/nfc_hub.py` (`NfcHub`, started in `main.lifespan`) polls a local
reader; `controllers/nfc_controller.py` pushes `hello`/`reader`/`card`/`card_removed` events over
SSE at `/api/nfc/events`; `frontend/src/nfc/useNfc.ts` consumes them.

**Laptop bridge** (deployed site): `backend/app/bridge.py` (`npm run bridge`, needs `BRIDGE_URL` +
`BRIDGE_TOKEN`) runs on the laptop with the reader/board and connects to the WebSocket
`/api/nfc/bridge`. Its taps feed the same `NfcHub` (`hub.reader_name` = local reader, else the
bridge's); card memory goes through `core/bridge_link.RemoteTag` (same surface as `Tag`), and the LED
loop sends frames with `bridge.send_frame`. Use `nfc_controller._open_card()` for card memory, never
`open_tag()` directly, so both readers work. Protocol is documented at the top of `core/bridge_link.py`.

**Phone tap** (Android Chrome Web NFC, HTTPS only): `frontend/src/nfc/PhoneTapButton.tsx` reads the
card's serial number and sends it as `card_uid` (pay, plan confirm) or to `POST /api/nfc/login/phone`.
The backend runs it through `phone_tap_uid` + `require_own_card` like a reader tap. Reading the id only:
"Log out with NFC" stays reader-only. `ALLOW_PHONE_TAP` turns it off. iPhones have no Web NFC.

**Phone notifications** (Web Push): `models/push.py` (`notify(user_id, title, body, url)`, fire and
forget), `push_controller.py`, `frontend/public/sw.js`, `frontend/src/push/` (`PushToggle` on both
dashboards). VAPID keys are generated into the DB on first use (no settings needed). Sent on: purchase
requested and chore claimed (parent), request approved/denied (child). iPhone needs the site added to
the home screen first (`manifest.webmanifest`).

Cards belong to child accounts, and a tap only acts when a screen asks for one: pay, switch plan,
"Log out with NFC", or log in (nobody logged in). Every screen that waits for a tap calls
`nfc_controller.wait_for_card_tap` (marks the tap used so it can't also log in) and
`require_own_card` (`models/shop.check_card`: the card must be the child's; their first card gets
linked in `CardLink`). Card UIDs are stored via `normalize_uid` (upper hex, no separators).
"Log out with NFC" moves the child's vault (`models/vault.py`) onto their card, AES-GCM encrypted
with the card UID as associated data and a one-time save id. Tapping while logged out restores a
saved vault if the card has one, otherwise logs in the child the card is linked to. Changing
`NFC_SECRET`/`JWT_SECRET` makes existing card saves unreadable.

**LED matrix** (Pimoroni Stellar Unicorn 16x16 on a Pico 2 W, USB serial): `core/unicorn.py` finds
the board by USB VID, Ctrl-C's whatever runs, starts `whack_grid.run()`, then sends line commands
`P x y r g b`, `F <768-byte hex frame>`, `C`, `B n`. The board needs `hardware/unicorn/whack_grid.py`
copied to it (again after it changes; the `F` command is new):
`uvx mpremote connect COM3 cp hardware/unicorn/whack_grid.py :whack_grid.py`. Boards with the old
script still work, falling back to per-pixel updates at 1 fps.

**LED Home** (`controllers/led_controller.py`): a background thread (started in `main.lifespan`)
renders the equipped skin from `core/led_skins.py`, keeps the frame for `GET /api/led/state` (the
page polls it every 200 ms) and pushes it to the board, so screen and board match. Skins: free ones
(clock, balance, savings jar, mascot) for everyone; paid ones become `led_skin` shop items per family
(`models/led.py` `RewardSkin`) and are bought through the normal purchase flow. The last equip
wins the single board. Weather comes from Open-Meteo (`WEATHER_LAT`/`WEATHER_LON`) via httpx.
To add a skin: write `render(t, ctx, state) -> 256 colours` and add it to `SKINS`.

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
