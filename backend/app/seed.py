"""Demo data for development and the pitch. Run from the repo root:

    npm run seed          add the demo accounts if they are missing (safe to repeat)
    npm run seed:reset    erase EVERY table first, then add them (works while the backend is running)
    scripts/wipe          erase EVERY table and leave it empty (only the built-in admin), see --empty

Demo logins (play money only, local use):
    parent   demo_parent   whack-demo-1    has example rewards and chores, and sees both kids
    child    demo_kid      1234            younger kid on the starter card (CaliccoCredit); credit score tracking off (13+)
    child    demo_teen     1234            older kid with a stronger record (can unlock Venture <W>); credit score on
Each kid starts with some money in their balance, so they can buy things and pay statements.
Use the parent dashboard's "Skip a month" to issue statements.
"""

import argparse

from sqlmodel import Session, SQLModel

from app.core.database import engine, init_db
from app.core.security import hash_password
from app.models.card import get_profile
from app.models.led import ensure_skin_rewards
from app.models.milestone import MilestoneInput, replace_milestones
from app.models.score import history_points, total_score
from app.models.shop import add_entry, add_starter_items
from app.models.user import User, create_user, get_user_by_username
from app.models.weekly_item import WeeklyItemInput, replace_weekly_items

PARENT = {"username": "demo_parent", "password": "whack-demo-1"}

CHILDREN = [
    {
        "username": "demo_kid",
        "password": "1234",
        "weekly_allowance": 1000,  # minor units (1/100 WC): 10.00 WC
        "app_experience": "13+",
        "card_type": "deer_debit,shark_father,calicco_credit,cap_one",  # what the 13+ preset ticks
        "items": [("Ice cream", 300, 2), ("Extra screen time", 500, 1)],
        "milestones": [("New bike", 20000)],
        "start_money": 2000,  # 20.00 WC in their own balance
        "profile": {},  # a fresh credit account: score 580 (Fair), on CaliccoCredit, owing nothing. Score tracking is off at 13+
    },
    {
        "username": "demo_teen",
        "password": "1234",
        "weekly_allowance": 2500,
        "app_experience": "15+",
        "card_type": "deer_debit,shark_father,cap_one,venture_w,calicco_credit",  # 15+: every card
        "items": [("Cinema ticket", 800, 1), ("Snacks", 250, 3)],
        "milestones": [("Concert ticket", 12000), ("Headphones", 8000)],
        "start_money": 5000,
        # A record from before the app: six good months of payments on a nine-month-old account (score 715).
        # One more good month takes it past the 720 that Venture <W> needs. Score tracking is on at 15+.
        "profile": {"on_time_streak": 6, "months_open": 9, "score_payment": 190},
    },
]


def _get_or_create_parent(session: Session) -> User:
    parent = get_user_by_username(session, PARENT["username"])
    if parent:
        print(f"  exists   parent {PARENT['username']}")
        return parent
    parent = create_user(
        session,
        username=PARENT["username"],
        hashed_password=hash_password(PARENT["password"]),
        role="parent",
        display_name=None,
    )
    assert parent.id is not None
    add_starter_items(session, parent.id)  # the same example rewards and chores a real sign-up gets
    print(f"  created  parent {PARENT['username']}  (password {PARENT['password']})")
    return parent


def _get_or_create_child(session: Session, parent: User, spec: dict) -> None:
    if get_user_by_username(session, spec["username"]):
        print(f"  exists   child  {spec['username']}")
        return
    child = create_user(
        session,
        username=spec["username"],
        hashed_password=hash_password(spec["password"]),
        role="child",
        parent_id=parent.id,
        display_name=None,
        weekly_allowance=spec["weekly_allowance"],
        app_experience=spec["app_experience"],
        card_type=spec["card_type"],
    )
    assert child.id is not None
    replace_weekly_items(session, child.id, [WeeklyItemInput(name=n, cost=c, weekly_limit=w) for n, c, w in spec["items"]])
    replace_milestones(session, child.id, [MilestoneInput(name=n, cost=c) for n, c in spec["milestones"]])
    add_entry(session, child_id=child.id, amount=spec["start_money"], kind="bonus", description="Starting money")
    profile = get_profile(session, child.id)  # creates the credit account
    for field, value in spec["profile"].items():
        setattr(profile, field, value)
    profile.score_history = history_points(profile.months_open)
    profile.score = total_score(profile.score_payment, profile.score_utilisation, profile.score_history)
    session.add(profile)
    session.commit()
    print(f"  created  child  {spec['username']}  (password {spec['password']})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Add demo accounts and data.")
    parser.add_argument("--reset", action="store_true", help="erase every table first")
    parser.add_argument("--empty", action="store_true", help="with --reset: stop after erasing (no demo accounts)")
    args = parser.parse_args()

    import app.models  # noqa: F401  (registers every table, so --reset knows what to drop)

    if args.reset:
        SQLModel.metadata.drop_all(engine)
        print("Erased all tables.")
    init_db()  # recreates the tables and the built-in admin account
    if args.reset and args.empty:
        print("Done. The database is empty apart from the admin account.")
        return

    with Session(engine) as session:
        parent = _get_or_create_parent(session)
        assert parent.id is not None
        for spec in CHILDREN:
            _get_or_create_child(session, parent, spec)
        ensure_skin_rewards(session, parent.id)  # LED skins in the family shop, like the app does on first visit
    print("Done. Log in at http://localhost:5173/login")


if __name__ == "__main__":
    main()
