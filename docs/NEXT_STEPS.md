# Next steps

State as of the shop and chores work: parent and child accounts, shop (in-game, weekly,
milestones), chores, parent approvals, bonuses, and the full purchase flow (request, approve,
tap card or simulate, paid). The credit core is built too (cards, statements, paying, interest, late
fees, cash back, "Skip a month"); see DESIGN.md section 6.1. The credit score is still a placeholder.

## 1. Do next (in order)

1. **Commit and share.** Teammates pull, run `scripts/backend-restart` (new tables are created on
   start; no DB reset needed this time).
2. **Seed script.** `backend/scripts/seed.py`: one parent, two kids with some money, a few purchases.
   Every column change wipes the DB, so this saves everyone time.
3. **Child setup options** on "Add child": weekly allowance, payday, starting credit limit, allowed
   cards. Store on a new `ChildSettings` table (new table, so no DB reset).
4. **Simulated time** *(built: "Skip a month", 4 weeks, pays 4 weekly allowances; no payday setting yet)*.
5. **Credit core** *(built except the score: card on the child, buying on credit, statements, paying them,
   interest, late fees, cash back, one plan change a month)*. **Still to do: the score from behaviour, with
   the reasons it moved.** See DESIGN.md sections 6 and 6.1.
6. **Hardware hooks** (section 2 below). Start with LED feedback for the purchase flow; it's small
   and makes the demo land.
7. **AI:** weekly recap, then the negotiation bot.

Known gaps worth fixing when convenient:

- Shop items can be removed but not edited (remove and re-add for now).
- Parent "notifications" are polling (every 3 s on the dashboard). Fine for the demo.
- A child can't see why something was denied. Optional note on deny.
- Backend hot reload sometimes hangs; `scripts/backend-restart` fixes it.

## 2. Making NFC and the LED matter

Rule: **each piece of hardware stands in for something real.** The NFC card is the bank card.
The reader plus LED is the card terminal in a shop. If a hardware moment doesn't teach something
about real cards, cut it.

### NFC card: the card is the account

1. **Only the card can spend.** Built: the app can request, but money only moves on a tap.
2. **Contactless limit.** Real cards let you tap small amounts without a PIN. Copy that: under a
   parent-set limit (e.g. £5), tap pays straight away with no approval; over it, the parent
   approves first. This makes the tap feel like real life and cuts parent chores.
3. **Declines at the terminal.** Not enough money, over the credit limit, or card frozen: the tap
   is refused with the reason. Learning what a decline means is real financial education.
4. **Freeze card.** Parent (or child) freezes the card from the app; taps are declined until
   unfrozen. Real banking apps have this; it's one boolean on `CardLink`.
5. **Tap to check.** Tapping with nothing to pay shows balance, credit used and the next due date
   on the LED.
6. **Tap to log in** on any device (the existing NFC login), so the card is the kid's identity.
7. **Pay the statement by tapping.** Payment day becomes a physical moment.

### LED matrix: the terminal screen and a credit health meter

1. **Payment feedback.** On every tap: green tick (paid), red cross plus a short reason icon
   (declined), amber spinner (waiting for parent). Turns the reader into a terminal.
2. **Ambient credit health.** When idle, show the score as a colour band (red to lime) and
   utilisation as a bar. One glance tells the kid how they're doing; this is the "LED only" mode
   for younger kids.
3. **Savings goal.** The chosen milestone (the PS5) as a bar filling up as they save.
4. **Due date warning.** Amber pulse 3 days before the statement is due, red when late.
5. **Mascot reacts** to real events: happy on a chore approved or a bill paid on time, worried on
   high utilisation, sad on a late payment.
6. **Shop cosmetics run here.** *(Built: LED skins bought in the shop play on the board.)*

Avoid idle rainbow loops and decorative animations: every LED state should mean something.

**Demo setup:** put the reader and the LED board side by side as one "Whack terminal" (a box or
stand), with the kid's phone or laptop next to it and the parent's phone in someone else's hand.

### Build order for hardware

1. LED purchase feedback (paid / declined / waiting). Backend calls `core/unicorn.py` from
   `shop_controller.pay` and from the approval endpoints.
2. Declines with reasons, plus freeze card.
3. Contactless limit (auto-approve under £X).
4. Idle credit health display (needs the credit core).
5. Mascot and purchased animations.
