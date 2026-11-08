# Teenacredit - Giddy Up Glitch Whack 2026 Submission
<img width="1872" height="897" alt="screen1" src="https://github.com/user-attachments/assets/d6bb0538-a4b4-4d6f-ad7c-cf92471e470c" />

## Inspiration
"Make Credit Accessible" led us to trace our own experiences as university students with credits, only to realise we knew nothing about it. With that, we pursued the idea of making credit more accessible by educating the next generation from the ages of 10 to 18.

## What it does
[Teenacredit](https://www.teenacredit.cash/) is a publicly available tool that allows parents to manage their kids' credit card expenditures. Kids will have access to a physical, mock credit card for learning about credit. They will be able to spend, borrow and pay back with play money (“Whack Coins”) by tapping a real NFC card. Parents set the limits and observe how the habits go. In-built AI explains and role-plays, but the backend owns every number.

**For kids and teens**
- Earn money from allowance, chores and bonuses, then spend it in a rewards shop (in-game items, weekly treats, savings milestones). Every purchase is paid by tapping the NFC card.
- Use one of five cards, from a debit card up to a "villain" card. Each credit card has a limit, an APR, monthly statements, a minimum payment, interest, late fees and cash back.
- Observe a 300 to 800 credit score move every month, with plain-English reasoning detailing the changes, a history chart and the next card it unlocks.
- Negotiate your interest rate with 4 AI sellers with customised personalities. Polite, well-argued requests lower the rate and rude ones raise it, and the backend enforces the limits.
- Read an AI-enhanced monthly wrap, detailing the statement, why the score moved, and one tip for next month.
- Using the 'Ask' button, ask the AI assistant any credit queries on any page to educate the users.
- Dashboard decoration with items users own, and show their balance, savings goal or mascot on a _16x16 LED matrix_.
- Learn from short lessons (credit, score, APR, statements, utilisation, choosing a card, myth or fact, glossary) with small interactive demos.

**For parents**
- A kids list with balance, card, owed amount, score and next payment per child.
- Per-child setup: allowance, weekly shop items, milestones, and age presets (10+, 13+, 15+) or Custom, which determines the allowed cards and whether the score is shown.
- A child breakdown with spending and earning by kind, what interest and fees have cost, score history with reasons, statements, and an AI recap with something to praise and two things to talk about.
- Approve purchases and chores (with phone notifications), and manage the shop and chores.
- "Skip a month" fast-forwards a child's account, so a full month of statements, interest and score changes can be shown within minutes.

## How we built it
- **Frontend:** React and Tailwind.
- **Backend:** FastAPI and SQLModel (SQLite), with cookie-based JWT auth and separate parent, child and admin roles.
- **AI:** Claude Haiku 5.5 through the Anthropic SDK.
- **NFC:** an ACR122U reader (PC/SC) acts as the payment terminal. Android phones can tap with Web NFC, and a laptop bridge lets the deployed site use the reader and board.
- **LED:** a Pimoroni Stellar Unicorn 16x16 matrix on a Pico 2 W, driven over USB serial. The web page mirrors the board live.
- **Notifications and deploy:** Web Push, plus a Dockerfile and a Railway config.

**AI design: Claude writes, the backend decides.**
- Backend computes numbers: scores, interest, the negotiation rate floor, and offer limits.
- Claude exclusively turns a facts sheet into sentences or plays a seller character. The negotiation bot lacks access to the floor.
- Any AI text that contains a number not in the facts is rejected and retried, then a built-in fallback is used. The demo keeps working if Claude is down.
- AI summaries do not have access to a child's name, and the AI does not name a credit score the parent has hidden.

<img width="1174" height="807" alt="screen2" src="https://github.com/user-attachments/assets/80a10dcf-7e61-4a16-acc2-5e223b22d9b9" />

## Challenges we ran into
- Ensuring the tool was compatible with both kids and teens: we decided to integrate extra features for the teens to match the complexity with their learning ability
- NFC Detection Consistency: our NFC cards seem to instantaneously react to Android phones but not IOS phones. This was due to their architectural differences; hence, this was a problem we couldn't solve in our prototype.
- Race conditions around taps and payments (double charges and cancels): Solved with atomic operational status changes.

## Accomplishments that we're proud of
- Complete credit loop (earn, spend, statement, pay, score, switch plan) with a real card tap and a score that always explains why it moved.
- Negotiation feature with customised seller bot personalities.
- Hardware integrations: the NFC card is the bank card, and the LED board is a live display of the child's account.

<img width="1368" height="796" alt="screen3" src="https://github.com/user-attachments/assets/001ad826-35d0-4ff5-8201-9a99182bea2c" />

## What we learned
- Importance of the planning stage to ensure the majority of details are covered in the system design before coding.
- Keeping the numbers in code and the explanations in Claude resulted in increased data reliability.

## What's next for Teenacredit
- LED feedback on every card tap (paid, declined, waiting) and a freeze-card control.
- A weekly parent recap alongside the monthly wrap.
- Contactless limits and declines with a reason at the terminal.
