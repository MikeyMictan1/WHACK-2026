"""The five credit cards a child can choose between, and the child's current credit profile.

Money is stored in minor units (hundredths of a Whack Coin, WC). APR is stored in basis points (2400 = 24.00%).
The names are placeholders (see docs/DESIGN.md section 6) and are fictional.
"""

from sqlmodel import Field, Session, SQLModel, select

# ---- Tables ----------------------------------------------------------------


class Card(SQLModel, table=True):
    id: str = Field(primary_key=True)  # slug, e.g. "whack_basic"
    name: str
    tier: int  # 0 = debit ... 4 = loan shark (display order)
    pitch: str
    listed_apr_bp: int
    max_discount_bp: int  # the most negotiation can ever take off the listed APR
    credit_limit: int
    min_score: int
    rewards_bp: int  # cash back on spending, in basis points
    late_fee: int
    negotiable: bool = True
    seller: str  # who the child talks to, e.g. "Mia from Whack Basic"


class CreditProfile(SQLModel, table=True):
    """Stand-in for the credit side of a child until score, statements and transactions exist.

    Created on first use with demo values. Replace `get_profile` (and the fields it fills) when the
    real score and balance logic lands; everything else reads the profile through that one function.
    """

    user_id: int = Field(primary_key=True, foreign_key="user.id")
    score: int = 640
    current_card_id: str = "whack_basic"
    current_apr_bp: int = 2499
    credit_limit: int = 10_000
    balance: int = 4_000
    monthly_spend: int = 6_000
    on_time_streak: int = 3  # months paid on time in a row
    months_open: int = 4
    # Comma-separated card ids the parent allows. Empty means every card is allowed.
    allowed_card_ids: str = ""


# ---- Seed data ---------------------------------------------------------------

CARD_SEED: list[Card] = [
    Card(
        id="debit", name="Debit", tier=0, pitch="Spend only what you have. No borrowing, no interest.",
        listed_apr_bp=0, max_discount_bp=0, credit_limit=0, min_score=0, rewards_bp=0, late_fee=0,
        negotiable=False, seller="Whack Bank",
    ),
    Card(
        id="whack_basic", name="Whack Basic", tier=1, pitch="The starter card. Small limit, friendly terms.",
        listed_apr_bp=2499, max_discount_bp=600, credit_limit=10_000, min_score=300, rewards_bp=0,
        late_fee=500, seller="Mia from Whack Basic",
    ),
    Card(
        id="chip", name="CapOne Chip", tier=2, pitch="A step up. A higher limit and a little cash back.",
        listed_apr_bp=1999, max_discount_bp=500, credit_limit=25_000, min_score=550, rewards_bp=100,
        late_fee=800, seller="Simon Smith from CapOne Chip",
    ),
    Card(
        id="venture_w", name="Venture W", tier=3, pitch="Best rewards and the lowest rates, for strong scores.",
        listed_apr_bp=1799, max_discount_bp=400, credit_limit=50_000, min_score=680, rewards_bp=200,
        late_fee=1_500, seller="Priya from Venture W",
    ),
    Card(
        id="loan_shark", name="Loan Shark", tier=4, pitch="Instant approval, no questions. Look at the interest.",
        listed_apr_bp=3999, max_discount_bp=100, credit_limit=15_000, min_score=300, rewards_bp=0,
        late_fee=3_500, seller="Vinny from Loan Shark",
    ),
]


# ---- Data access ---------------------------------------------------------------

def list_cards(session: Session) -> list[Card]:
    """All cards in display order. The table is a copy of CARD_SEED: missing rows are added and
    changed values (a new seller name, a tweaked APR) are applied, so editing the seed just works."""
    rows = {c.id: c for c in session.exec(select(Card))}
    changed = False
    for seed in CARD_SEED:
        row = rows.get(seed.id)
        if row is None:
            session.add(seed.model_copy())
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
    profile = session.get(CreditProfile, user_id)
    if profile is None:
        profile = CreditProfile(user_id=user_id)
        session.add(profile)
        session.commit()
        session.refresh(profile)
    return profile


def allowed_ids(profile: CreditProfile) -> set[str] | None:
    """None means no restriction."""
    ids = {i for i in profile.allowed_card_ids.split(",") if i}
    return ids or None
