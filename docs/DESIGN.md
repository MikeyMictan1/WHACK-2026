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

1. **Parent:** email and password login. Owns the family and one or more kids.
2. **Child:** created by a parent. Signs in with the NFC card (or a PIN as fallback). Age 10 to 18.
3. Auth is the existing cookie JWT. A child session is limited to child pages.

## 3. Parent dashboard

1. **Kids list:** one card per child (balance, score, next payment). "Add child account" button.
2. **Child breakdown:** spending, score history, recent transactions, AI weekly recap.
3. **Approvals:** incoming purchase requests (notification, then approve or deny).
4. **Controls per child:**
   - Weekly allowance amount and payday
   - Starting credit limit
   - Which credit cards the child can access
   - Rewards: in-game, weekly, milestones (parent sets prices and IRL rewards)
   - Chores and extracurriculars, with payouts and bonuses
   - Feature toggles (age-based presets)
5. **Options:** realtime or simulated time, age, currency label (£ / $ / € / Whack coins).

## 4. Child dashboard

Matches the designer's mocks.

1. **Home:** current balance, available credit, breakdown chart, payment due date, recent transactions.
   Side panel is decor space for owned cosmetics.
2. **Rewards:** three rows of item cards.
   - In-game (cosmetics, decor)
   - Weekly (small items)
   - Milestones (parent-set goals)
3. **Earn money:** chores and extracurriculars the parent has added. Kid marks done, parent approves.
4. **Monthly review:** AI summary, new credit score, updated plan (interest, limit), "Change plan?".
5. **Change plan:** lists cards the parent allows, with a "Negotiate?" button leading to the AI chat.
6. **Decor:** owned items can be placed in left and right screen sections.

## 5. Purchase flow

1. Kid picks a reward and presses buy. A `purchase_request` is created (`pending`).
2. Parent gets a notification (phone or dashboard) and approves (`approved`) or denies.
3. Kid's screen shows "Tap your card".
4. Kid taps. Backend checks the card belongs to that child, then marks it `paid` and moves the money.
5. Requests expire after a few minutes. Dev builds have a "simulate tap" button.

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

## 7. NFC card

1. Physical card the kid carries. Identifies the child and holds their data using the existing
   encrypted vault mechanism (`core/nfc_card.py`, `models/vault.py`).
2. Used to log in and to confirm purchases.
3. Reader is an ACR122U on the laptop. Hardware is optional; everything else must work without it.

## 8. LED matrix (16x16)

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
3. **Buddy (optional):** explains terms. **What-if slider (optional):** backend computes pay-minimum vs
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
