"""The five credit cards a child can choose between, and each child's credit account.

Money is stored in minor units (hundredths of a Whack Coin, WC). APR is stored in basis points (2000 = 20.00%).
The card numbers follow docs/DESIGN.md section 6.1. The names are placeholders and are fictional.
"""

from datetime import UTC, datetime

from sqlmodel import Field, Session, SQLModel, select

from app.models.score import init_score, utilisation_bp_of

# ---- Tables ----------------------------------------------------------------


class Card(SQLModel, table=True):
    id: str = Field(primary_key=True)  # slug, e.g. "whack_basic"
    name: str
    tier: int  # 0 = debit ... 4 = loan shark (display order)
    pitch: str
    listed_apr_bp: int
    max_discount_bp: int  # the most negotiation can ever take off the listed APR
    # The credit limit, as a percentage of the child's weekly allowance (100 = 1x). 0 = no credit (debit:
    # you spend your own balance). Higher tiers get a bigger multiple. See limit_for().
    limit_multiplier_pct: int = 0
    credit_limit: int = 0  # unused (limits were fixed amounts); kept so older databases can still add cards
    min_score: int  # 0 = no score needed
    rewards_bp: int  # cash back on spending, in basis points (100 = 1%)
    late_fee: int  # charged when a payment is late; 0 = this card has no late fee
    # How hard rudeness is punished in a negotiation (basis points): the most one rude message can add to
    # the APR, and the most the APR can ever be pushed above the listed rate.
    penalty_step_bp: int = 100
    max_penalty_bp: int = 300
    negotiable: bool = True
    seller: str  # who the child talks to, e.g. "Mia from Whack Basic"


class CreditProfile(SQLModel, table=True):
    """A child's credit account: the card they are on, what they owe, and their simulated clock.

    Created on first use. `balance` is what the child owes on the card right now; it is only ever
    changed together with a `CreditEntry` (see models/credit.py), which is the single place that does it.
    `score` is calculated from behaviour, once a month (models/score.py): 300 + the three parts below.
    """

    user_id: int = Field(primary_key=True, foreign_key="user.id")
    score: int = 580  # 300 to 800; recalculated when a statement is issued (models/score.py)
    score_payment: int = -1  # payment history points, 0 to 250. -1 = the score is not set up yet
    score_utilisation: int = 0  # credit used points, 0 to 150
    score_history: int = 0  # length of history points, 0 to 100
    current_card_id: str = "whack_basic"
    current_apr_bp: int = 2000  # the APR this child actually pays (a negotiation can change it)
    credit_limit: int = 2_000  # limit_for(their card, weekly_allowance); kept up to date by get_profile
    weekly_allowance: int = 0  # a copy of the child's weekly allowance (User.weekly_allowance), set by get_profile
    balance: int = 0  # owed on the card, including purchases not yet on a statement
    monthly_spend: int = 1_500  # a typical month's spending, used only for the rewards estimates
    on_time_streak: int = 0  # statements in a row that were not paid late
    months_open: int = 0
    # Comma-separated card ids the parent allows. Empty means every card is allowed.
    allowed_card_ids: str = ""

    # The child's own clock. It only moves when a parent skips a month (models/credit.advance_month).
    sim_now: datetime | None = None
    opened_at: datetime | None = None
    cycles_done: int = 0  # statements issued so far (the number of months skipped)
    last_switch_cycle: int = -1  # `cycles_done` when the plan was last changed; one change per month


# ---- Seed data ---------------------------------------------------------------

CARD_SEED: list[Card] = [
    Card(
        id="debit", name="Debit", tier=0, pitch="Spend only what you have. No borrowing, no interest.",
        listed_apr_bp=0, max_discount_bp=0, limit_multiplier_pct=0, min_score=0, rewards_bp=0, late_fee=0,
        negotiable=False, seller="Whack Bank",
    ),
    Card(
        id="whack_basic", name="Whack Basic", tier=1, pitch="The starter card. Small limit, friendly terms.",
        listed_apr_bp=2000, max_discount_bp=400, limit_multiplier_pct=100, min_score=0, rewards_bp=0,
        late_fee=0, seller="Mia from Whack Basic",
    ),
    Card(
        id="chip", name="CapOne Chip", tier=2, pitch="A step up. A higher limit and a little cash back.",
        listed_apr_bp=1500, max_discount_bp=300, limit_multiplier_pct=150, min_score=600, rewards_bp=100,
        late_fee=0, seller="Simon Smith from CapOne Chip",
    ),
    Card(
        id="venture_w", name="Venture W", tier=3, pitch="Best rewards and the lowest rates, for strong scores.",
        listed_apr_bp=1000, max_discount_bp=200, limit_multiplier_pct=300, min_score=720, rewards_bp=300,
        late_fee=0, seller="Priya from Venture W",
    ),
    Card(
        id="loan_shark", name="Loan Shark", tier=4, pitch="Instant approval, no questions. Look at the interest.",
        listed_apr_bp=9000, max_discount_bp=100, limit_multiplier_pct=1000, min_score=0, rewards_bp=0,
        late_fee=500, seller="Linguini from Loan Shark",
        penalty_step_bp=250, max_penalty_bp=500,  # he punishes rudeness hard: up to 5 points above his rate
    ),
]


MIN_CREDIT_LIMIT = 100  # 1.00 WC: a credit card always has some limit, even with no allowance set


def limit_for(card: Card, weekly_allowance: int) -> int:
    """This card's credit limit for a child with this weekly allowance: Whack Basic 1x, CapOne Chip 1.5x,
    Venture W 3x, Loan Shark 10x. 0 for Debit."""
    if card.limit_multiplier_pct <= 0:
        return 0
    return max(MIN_CREDIT_LIMIT, weekly_allowance * card.limit_multiplier_pct // 100)


# ---- Data access ---------------------------------------------------------------

def list_cards(session: Session) -> list[Card]:
    """All cards in display order. The table is a copy of CARD_SEED: missing rows are added and
    changed values (a new seller name, a tweaked APR) are applied, so editing the seed just works."""
    rows = {c.id: c for c in session.exec(select(Card))}
    changed = False
    for seed in CARD_SEED:
        row = rows.get(seed.id)
        if row is None:
            session.add(Card(**seed.model_dump()))  # a new object: never attach the shared seed to a session
            changed = True
            continue
        for field, value in seed.model_dump().items():
            if getattr(row, field) != value:
                setattr(row, field, value)
                session.add(row)
                changed = True
    if changed:
        session.commit()
        rows = {c.id: c for c in session.exec(select(Card))}
    return sorted(rows.values(), key=lambda c: c.tier)


def get_card(session: Session, card_id: str) -> Card | None:
    list_cards(session)  # make sure the table is seeded
    return session.get(Card, card_id)


def get_profile(session: Session, user_id: int) -> CreditProfile:
    """The child's credit account, created on first use as a fresh account on the starter card."""
    profile = session.get(CreditProfile, user_id)
    now = datetime.now(UTC)
    if profile is None:
        starter = get_card(session, "whack_basic")
        assert starter is not None
        profile = CreditProfile(
            user_id=user_id,
            current_card_id=starter.id,
            current_apr_bp=starter.listed_apr_bp,
            credit_limit=0,  # set from their allowance below
            sim_now=now,
            opened_at=now,
        )
        init_score(profile)
        session.add(profile)
        session.commit()
        session.refresh(profile)
    elif profile.sim_now is None:
        # Made before the credit core existed, when balance, limit and APR were demo numbers.
        # Start a real account on the same card.
        card = get_card(session, profile.current_card_id) or get_card(session, "whack_basic")
        assert card is not None
        profile.current_card_id = card.id
        profile.current_apr_bp = card.listed_apr_bp
        profile.balance = 0
        profile.on_time_streak = 0
        profile.months_open = 0
        profile.sim_now = now
        profile.opened_at = now
        session.add(profile)
        session.commit()
        session.refresh(profile)
    if profile.score_payment < 0:
        # Made before scores were calculated (it carried a placeholder number): set it up from the account as it is now.
        init_score(profile, utilisation_bp_of(profile.balance, profile.credit_limit))
        session.add(profile)
        session.commit()
        session.refresh(profile)
    # The limit follows the weekly allowance, so a parent changing the allowance changes it too.
    from app.models.user import User  # here, not at the top: user.py's imports reach back into the models

    child = session.get(User, user_id)
    weekly = (child.weekly_allowance or 0) if child else 0
    card = get_card(session, profile.current_card_id)
    limit = limit_for(card, weekly) if card else profile.credit_limit
    if (profile.weekly_allowance, profile.credit_limit) != (weekly, limit):
        profile.weekly_allowance = weekly
        profile.credit_limit = limit
        session.add(profile)
        session.commit()
        session.refresh(profile)
    return profile


def allowed_ids(profile: CreditProfile) -> set[str] | None:
    """None means no restriction."""
    ids = {i for i in profile.allowed_card_ids.split(",") if i}
    return ids or None
