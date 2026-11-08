/** All the text on the Learn page. Edit lessons here; no database. Money is play money (WC). */

export type DemoId = 'choices' | 'score' | 'interest' | 'statement' | 'utilisation' | 'cards' | 'myths' | 'glossary'

export type Topic = {
  /** Used in the URL: /learn#apr opens the topic. The AI helper links to these. */
  id: string
  title: string
  blurb: string
  lines: string[]
  demo: DemoId
  tryIt?: { to: string; label: string }
}

export const TOPICS: Topic[] = [
  {
    id: 'credit',
    title: 'What is credit?',
    blurb: 'Borrowing now and paying later, with a price tag.',
    lines: [
      'Credit means a bank lets you spend money you do not have yet.',
      'You pay it back later. If you take your time, you pay extra on top. That extra is called interest.',
      'Lenders trust people who pay back on time, so good habits unlock better deals.',
    ],
    demo: 'choices',
    tryIt: { to: '/dashboard', label: 'Go to your dashboard' },
  },
  {
    id: 'score',
    title: 'Credit score',
    blurb: 'A number that tells lenders how well you pay back.',
    lines: [
      'Here it runs from 300 to 800. Higher is better.',
      'Three things move it most: paying on time, how much of your limit you use, and how long you have had credit.',
      'Tap things a kid might do and watch where the score lands.',
    ],
    demo: 'score',
    tryIt: { to: '/review', label: 'See your own score' },
  },
  {
    id: 'apr',
    title: 'APR and interest',
    blurb: 'The price of borrowing, as a yearly percentage.',
    lines: [
      'APR is the yearly price of borrowing. At 25% APR, every 100 WC you keep owing costs about 25 WC a year.',
      'Drag the sliders. The same debt costs very different amounts on different cards.',
    ],
    demo: 'interest',
    tryIt: { to: '/plans', label: 'Compare card rates' },
  },
  {
    id: 'statements',
    title: 'Statements',
    blurb: 'The monthly bill. Learn to read it.',
    lines: [
      'Every month the card sends a statement. It adds up what you spent and what you owe.',
      'Tap each part to see what it means.',
    ],
    demo: 'statement',
    tryIt: { to: '/review', label: 'See your monthly review' },
  },
  {
    id: 'utilisation',
    title: 'Utilisation',
    blurb: 'How much of your limit you are using.',
    lines: [
      'Utilisation is your balance divided by your limit. Owe 30 WC on a 100 WC limit and it is 30%.',
      'Under 10% is great. Over 30% starts to hurt your score.',
      'Drag the slider and watch the verdict change.',
    ],
    demo: 'utilisation',
    tryIt: { to: '/review', label: 'Check yours' },
  },
  {
    id: 'cards',
    title: 'Choosing a card',
    blurb: 'Rates, rewards, fees, and the trap to avoid.',
    lines: [
      'Compare the APR first, then the fees, then the rewards.',
      'Cash back sounds nice, but if you carry a balance the interest usually costs more than the rewards pay.',
      'Loan Shark approves anyone instantly. The price is a huge APR.',
    ],
    demo: 'cards',
    tryIt: { to: '/plans', label: 'Compare the plans' },
  },
  {
    id: 'myths',
    title: 'Myth or fact',
    blurb: 'Test what you think you know.',
    lines: ['Tap true or false on each one. You will see why straight away.'],
    demo: 'myths',
  },
  {
    id: 'glossary',
    title: 'Glossary',
    blurb: 'Short meanings for the words you will see.',
    lines: [],
    demo: 'glossary',
  },
]

// ---- What is credit? ----------------------------------------------------------------

export const CHOICES = {
  prompt: 'You borrow 20 WC for a game. The bill arrives. What do you do?',
  options: [
    { label: 'Pay all 20 WC', outcome: 'You owe nothing more and pay no interest. This is the best way to use a card.' },
    {
      label: 'Pay only the minimum (2 WC)',
      outcome: 'The other 18 WC stays on the bill and grows with interest every month. In the end you pay back more than 20 WC.',
    },
    {
      label: 'Ignore it',
      outcome: 'You get a late fee, interest keeps growing, and your credit score drops. Lenders notice this.',
    },
  ],
}

// ---- Credit score ---------------------------------------------------------------------

export const SCORE_MIN = 300
export const SCORE_MAX = 800
export const SCORE_START = 600

export const SCORE_EVENTS = [
  { label: 'Paid the bill on time', delta: 12, why: 'Paying on time is the biggest part of your score.' },
  { label: 'Paid the bill late', delta: -35, why: 'One late payment can undo months of good habits.' },
  { label: 'Used 90% of your limit', delta: -20, why: 'Using almost all of your limit looks risky to lenders.' },
  { label: 'Used only 10% of your limit', delta: 8, why: 'Using a small part of your limit shows you manage credit well.' },
  { label: 'Another month with the account', delta: 3, why: 'A longer history helps a little each month.' },
]

// ---- APR and interest -------------------------------------------------------------------

export const INTEREST_ROWS = [
  { name: 'Low rate', apr: 10 },
  { name: 'Typical card', apr: 20 },
  { name: 'Loan Shark', apr: 90 },
]

// ---- Statements ----------------------------------------------------------------------------

export const STATEMENT_PARTS = [
  { label: 'Balance', value: '50.00 WC', text: 'Everything you owe right now.' },
  {
    label: 'Minimum payment',
    value: '5.00 WC',
    text: 'The smallest amount you must pay to avoid a late fee. Paying only this is expensive, because interest builds on the rest.',
  },
  { label: 'Due date', value: '28 Nov', text: 'Pay by this day or you get a late fee and your score drops.' },
  {
    label: 'Interest charged',
    value: '0.92 WC',
    text: 'The extra you pay for carrying a balance. Pay in full and it is zero.',
  },
]

// ---- Utilisation -----------------------------------------------------------------------------

export const UTILISATION_BANDS = [
  { upTo: 10, label: 'Excellent', text: 'Lenders love this.' },
  { upTo: 30, label: 'Good', text: 'A healthy amount.' },
  { upTo: 50, label: 'Careful', text: 'Your score may start to slip.' },
  { upTo: 100, label: 'Risky', text: 'This looks like you are stretched thin.' },
]

// ---- Choosing a card ----------------------------------------------------------------------------

/** The app's real card rates, in a simple example: carry 50 WC for a year and spend 10 WC a month. */
export const CARD_EXAMPLES = [
  { name: 'Calicco Credit', apr: 20, cashBack: 0 },
  { name: 'Venture W', apr: 10, cashBack: 3 },
  { name: 'Loan Shark', apr: 90, cashBack: 0 },
]
export const CARD_BALANCE = 50
export const CARD_MONTHLY_SPEND = 10

// ---- Myth or fact ---------------------------------------------------------------------------------

export const MYTHS = [
  {
    claim: 'You need to carry a balance to build credit.',
    isTrue: false,
    why: 'Paying in full every month builds credit just as well, and you pay no interest.',
  },
  {
    claim: 'Paying on time is the biggest part of your score.',
    isTrue: true,
    why: 'It counts for more than anything else, so it is the habit to build first.',
  },
  {
    claim: 'Looking at your own credit score hurts it.',
    isTrue: false,
    why: 'Checking your own score is safe. Check it as often as you like.',
  },
  {
    claim: 'A higher limit means you should spend more.',
    isTrue: false,
    why: 'A higher limit is room, not a goal. Using less of it looks better.',
  },
  {
    claim: 'The minimum payment is the best amount to pay.',
    isTrue: false,
    why: 'It keeps you out of trouble, but interest piles up on everything you did not pay.',
  },
  {
    claim: 'A card that approves anyone instantly is a good sign.',
    isTrue: false,
    why: 'Easy approval usually comes with a huge APR. That is how Loan Shark works.',
  },
]

// ---- Glossary -------------------------------------------------------------------------------------------

export const GLOSSARY = [
  { term: 'APR', short: 'Annual percentage rate. The yearly price of borrowing, as a percentage.' },
  { term: 'Balance', short: 'The amount you owe on your card right now.' },
  { term: 'Cash back', short: 'A small reward: a percentage of what you spend comes back to you.' },
  { term: 'Credit', short: 'Borrowing money now and paying it back later.' },
  { term: 'Credit limit', short: 'The most you are allowed to owe on a card.' },
  { term: 'Credit score', short: 'A number, 300 to 800 here, showing how well you pay back what you borrow.' },
  { term: 'Due date', short: 'The day your payment must arrive to avoid a late fee.' },
  { term: 'Interest', short: 'The extra you pay for borrowing money for longer.' },
  { term: 'Late fee', short: 'A charge for paying after the due date.' },
  { term: 'Minimum payment', short: 'The smallest amount you must pay each month to stay in good standing.' },
  { term: 'On-time payment', short: 'A payment made by the due date. The most important habit for your score.' },
  { term: 'Statement', short: 'The monthly summary of what you spent, what you owe and when to pay.' },
  { term: 'Utilisation', short: 'The share of your limit you are using. Lower is better.' },
  { term: 'Whack Coin (WC)', short: 'The play money used in this app. It is not a real currency.' },
]
