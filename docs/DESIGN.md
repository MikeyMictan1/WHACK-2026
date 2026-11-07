# Whack: Design Doc

Capital One track. A play-money credit card that teaches kids (10 to 18) how credit works.
All money is fake and for education only.

## 1. Overview

Parents set up an account and add their kids. Each kid gets a starter credit card, a dashboard,
and a physical NFC card they tap to buy things. Kids earn play money from allowance and chores,
spend it on rewards, and watch their credit score react. Claude explains what their choices cost.

**Core loop:** earn, spend, statement, pay, score, plan.

1. Kid earns money (allowance, chores, bonuses).
2. Kid requests a reward. Parent approves. Kid taps the NFC card. Item is bought.
3. Each month a statement arrives with the balance and a due date.
4. Kid pays (in full, minimum, or late).
5. Credit score updates.
6. Score decides the plan (interest rate, limit). Kid may switch plan.

## 2. Users and accounts

1. **Parent:** signs up with username and password. Owns one or more kids. *(Built)*
2. **Child:** created, edited and removed by their parent on the parent dashboard. Logs in on the
   same login page with the username and password (min 4 characters) the parent set. Age 10 to 18.
   NFC card login to follow. *(Built, except NFC)*
3. Auth is the existing cookie JWT. One `user` table with `role` and `parent_id`; parent-only
   endpoints return 403 to a child session.

## 3. Parent dashboard

1. **Kids list** *(built)*: one row per child with balance, card, score (when tracking is on) and next payment, plus
   "Add child" and a Breakdown link.
2. **Child breakdown** *(built, `/dashboard/children/:id`)*: spending and earning by kind, what credit has cost,
   score history with reasons, recent activity, statements, and an AI recap (name-free, numbers checked against the
   backend's facts, built-in summary if Claude is down). Recap is written on request, not weekly.
3. **Approvals:** incoming purchase requests (notification, then approve or deny).
4. **Controls per child:**
   - Weekly allowance amount and payday
   - Starting credit limit *(built: 1 to 100 WC, applies to the starter card Whack Basic only)*
   - Which credit cards the child can access: parent picks the allowed set (for example 2 to
     start with, pre-selected by age so it's one tap to accept), and the child chooses between
     them at first login
   - Rewards: in-game, weekly, milestones (parent sets prices and IRL rewards)
   - Chores and extracurriculars, with payouts and bonuses
   - Feature toggles (age-based presets)
5. **Options:** realtime or simulated time, age, currency label (£ / $ / € / Whack coins).

## 4. Child dashboard

Matches the designer's mocks.

1. **Home** *(built)*: current balance, credit left, payment due date, spending chart (by kind), recent
   transactions. Left and right side panels show placed decor.
2. **Rewards:** three rows of item cards.
   - In-game (cosmetics, decor)
   - Weekly (small items)
   - Milestones (parent-set goals)
3. **Earn money:** chores and extracurriculars the parent has added. Kid marks done, parent approves.
4. **Monthly review:** AI summary, new credit score, updated plan (interest, limit), "Change plan?".
5. **Change plan:** lists cards the parent allows, with a "Negotiate?" button leading to the AI chat.
6. **Decor** *(built, `/decor`)*: owned in-game items placed in the left and right panels (4 per side; pick an item,
   then a side).
7. **Learn:** info pages about credit (see 4.1). Linked from the nav, from the score on Home,
   and from the monthly review.

### 4.1 Info pages ("Learn more about credit")

Static pages, short and friendly, written for ages 10 to 18. No AI needed to render them.

1. What is credit?
2. Credit score: what it is and the three things that move it (payment history, utilisation, history length)
3. APR and interest: why borrowing costs money, with a worked example
4. Statements: balance, minimum payment, due date, what happens if you're late
5. Utilisation: why using less of your limit is better
6. Choosing a card: what rewards, limits and fees mean (and why the Loan Shark is a trap)
7. Glossary: short definitions the UI and AI link to

Each page ends with a "Try it" link to the matching dashboard section. Parents get the same pages
under their dashboard. Content lives in one file in the frontend (`learn/content.ts`), no database.

## 5. Purchase flow

1. Kid picks a reward and presses buy. A `purchase_request` is created (`pending`).
2. Parent gets a notification (phone or dashboard) and approves (`approved`) or denies.
3. Kid's screen shows "Tap your card".
4. Kid taps. Backend checks the card belongs to that child, then marks it `paid` and moves the money.
5. Requests expire after 15 minutes. A "Simulate tap" button is the backup (`ALLOW_SIMULATED_TAP`).
6. Weekly items can be bought once every 7 days. One purchase in progress per child at a time.

*(Built: shop, chores with parent approval, bonuses, the full purchase flow with real or simulated
tap. A child's first card used to pay is linked to them. Parent screens poll; no push notifications.)*

The NFC reader sits on the laptop and acts as the payment terminal. Any device can show the
"Tap your card" screen because tap events reach browsers over SSE.

## 6. Credit cards and score

**Score** (300 to 800, simplified):
1. Payment history: paying on time (largest weight)
2. Utilisation: balance divided by limit (under 10% is best)
3. Length of history

The app always shows why the score moved (for example "+12 paid on time, -8 utilisation 45%").
The backend computes all numbers. Claude only explains them.

**Cards** (placeholder names, change before the pitch):
1. Debit (youngest kids, no credit)
2. Whack Basic (starter credit card)
3. CapOne Chip (mid tier)
4. Venture W (best rewards, needs a high score)
5. Loan Shark (instant approval, awful APR; the teaching villain)

**Monthly:** score updates, plan changes (APR, limit), kid can switch within what the parent allows.

**Score, as built** (`models/score.py`): 300 plus three parts, so 300 to 800.

| Part | Points | How it moves |
|---|---|---|
| Payment history | up to 250 (50%) | Each statement paid on time (in full or at least the minimum) closes 12% of the gap to 250. A late one costs 40 points or 30% of what was built up, whichever is more. |
| Credit used | up to 150 (30%) | Statement total divided by the limit: full marks at 10% or less, then falling in straight lines through 30% (105), 50% (60) to 0 at 100%. |
| Length of history | up to 100 (20%) | 100 over the first 12 months open. |

- A new account starts at 580 (Fair). CapOne Chip needs 600 and Venture W 720, so good habits unlock cards.
- It is recalculated once a month, when a statement is issued ("Skip a month"). Every change is saved with its reason (`ScoreEvent`), for example "+14 Statement 1 paid in full on time" or "-34 You used 25% of your limit".
- Debit has no credit to measure, so only a statement paid on time counts there; usage and history are left alone.
- The backend always tracks it. A parent decides whether the child sees it (the age preset or the Custom "credit score" option); when it is off the child sees an explanation, the AI never names a number, and locked cards say "needs a stronger credit record".
- The parent's kids list shows the score and last month's change. A child's Monthly review has the number, the three parts, why it moved, a history chart and the next card it unlocks.

### 6.1 Credit card numbers and rules *(Built)*

Status: built (`models/credit.py`, `models/card.py`, `controllers/credit_controller.py`). A child on a
credit card spends on the card; on Debit they spend their own balance. The card numbers below are the
ones in the app; they were first proposed so the
credit core had something concrete to
build against. All values are starting points; tune them after a playtest.

| Card | Limit | APR | Score needed | Perk | Notes |
|---|---|---|---|---|---|
| Debit | none (own balance) | none | none | none | Default for the youngest kids. Can't go below £0. |
| Whack Basic | £20 | 20% | none | none | Starter credit card every child can get. |
| CapOne Chip | £50 | 15% | 600+ | 1% back | Mid tier, unlocked by a decent score. |
| Venture W | £150 | 10% | 720+ | 3% back | Best card. Rewards paid as play money. |
| Loan Shark | £100 | 90% | none, instant | none | £5 late fee. Looks easy, costs the most. The villain. |

Rules:

1. **Grace period.** Pay the full statement by the due date and no interest is charged. Pay part
   of it and interest is charged on what's left over. This is the most important lesson: it's
   how real cards work.
2. **Interest per month** = carried balance × APR / 12, rounded to the nearest penny, added as a
   `LedgerEntry` on statement day.
3. **Minimum payment:** the larger of £1 or 10% of the statement. Paying less than the minimum
   counts as a late payment (score hit, late fee on cards that have one).
4. **Over the limit:** the tap is declined with the reason (ties into NFC declines).
5. **Perks** (cashback) are credited after the statement is paid, not at purchase, so rewards
   come from paying on time.
6. **Switching cards:** monthly, only to cards the parent allows and the score qualifies for.
   Loan Shark is always available unless the parent blocks it, to show why "instant approval"
   is a trap.

**Interest is too small to feel at these amounts.** 20% a year on £20 is about 33p a month. Two
options:

1. Scale rates up as a "game APR" so the cost is visible.
2. Keep rates real and have the monthly review show the same choice at real-life size ("on a
   £1,000 balance this would cost £16.67 this month").

Recommended: option 2. It stays honest and still lands the point.

**As built** (choices the rules above left open):

- A child has their own clock. It only moves when a parent presses "Skip a month" on the dashboard.
  One month is 4 weeks (28 days), so each skip also pays 4 weekly allowances. A statement is due 14 days
  after it is issued.
- Skipping a month closes the books: the previous statement's due date passes (paid in full, minimum paid, or
  late), interest and any late fee are charged, and a new statement is issued. Payments happen between
  skips, so they are always before the due date.
- Interest is on the unpaid part of the previous statement, at the APR in force on statement day. Paid in full
  by the due date means none (the grace period).
- The minimum is the larger of 1.00 WC and 10%, never more than the statement. Below it by the due date is
  late: the late fee (Loan Shark only) and a broken on-time streak. Paying the minimum or more is not late; the
  rest is carried over and charged interest.
- Cash back is paid into the child's balance when a statement is paid in full by its due date. A carried or
  late statement forfeits it. Each purchase earns the rate of the card it was bought on.
- An over-limit purchase is refused when the child asks and again at the tap, with the reason. Interest and
  fees can push the balance over the limit.
- One plan change a month: after a change the next waits for the next statement. The balance carries over to
  the new card, which must have a limit at least as high as what is owed. Debit needs a zero balance.
- The Monthly review and the Plans page show interest at an example size (1,000 WC) when the child owes
  nothing, as recommended above (option 2).
- Not built here: a payday setting, and the parent's allowed-card set (the add-child form stores one, but the
  Plans page does not read it yet).

**Build needs** (all built):

1. Simulated time first ("Skip a month" for parents; NEXT_STEPS.md step 4).
2. A card record per child: card type, limit, APR, opened date.
3. Purchases charged to credit instead of balance when the child is on a credit card.
4. Monthly statement: total, minimum, due date; paying it (ideally by tapping the NFC card).
5. Score update with reasons shown (section 6 above).

## 7. NFC card

1. Physical card the kid carries. Identifies the child and holds their data using the existing
   encrypted vault mechanism (`core/nfc_card.py`, `models/vault.py`).
2. Used to log in and to confirm purchases.
3. Reader is an ACR122U on the laptop. Hardware is optional; everything else must work without it.

## 8. LED matrix (16x16)

*(Built: LED Home page at `/led` mirrors the board live; wardrobe of skins: clock, balance,
savings jar, mascot free; weather, date, heartbeat, starfield, rainbow, fire, code rain sold in the
shop as LED skins.)*

1. Mascot that reacts to score and spending.
2. Credit score shown as colour (red to lime) or utilisation as a filling bar.
3. "LED only" mode for younger kids.
4. Cosmetic animations and colour schemes unlocked from the shop.

## 9. AI features (Claude Haiku 5.5)

Uses the existing `ai_controller.get_client()`. Keep all prompts short, friendly and age-aware.

1. **Weekly recap:** story of what the kid spent on, plus credit tips. Fun for kids, structured
   summary for parents.
2. **Negotiation bot:** when switching cards, the kid negotiates APR with a seller bot. Bot
   knows the score and the card's terms. Outcome is bounded by backend rules, not by the model.
3. **Buddy (optional):** explains terms and links to the matching info page. **What-if slider (optional):** backend computes pay-minimum vs
   pay-in-full, Claude narrates it.
4. **Safety:** parents can read transcripts, bots stay on topic, no real advice or real products.

## 10. Data model

`Family`, `User` (role: parent or child), `Child` profile (age, currency, limit, card id, time mode),
`Card` (plan type, APR, limit), `Transaction`, `Statement`, `Reward` (type: in-game, weekly, milestone),
`PurchaseRequest`, `Chore`, `ScoreEvent`, `Recap`, `NegotiationMessage`.
Money is stored as integers (smallest unit). Currency is display-only; no exchange rates.

## 11. Build plan

1. Accounts: parent signup, add child, child login by NFC.
2. Money and rewards: allowance, rewards shop, purchase flow with approval and tap.
3. Credit: statements, score, plan change.
4. AI: weekly recap, then negotiation.
5. LED mascot and cosmetics.
6. Extras if time: buddy, what-if slider, mobile polish.

**Demo path:** parent approves a kid's purchase, kid taps the card, simulated month passes,
score and plan change, kid negotiates a new rate. Time simulation makes this fast on stage.

## 12. Open questions

1. Weekly recap or monthly wrap? The mocks say monthly; the plan says weekly. Suggest both:
   weekly recap, monthly credit review.
2. Final card names (avoid real brand names).
3. Child sign-in fallback if the card is lost (PIN or parent reset).
4. Is the "community suggests other card companies" idea fictional cards only? Keep it that way.
