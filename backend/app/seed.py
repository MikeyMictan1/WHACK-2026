"""Demo data for development and the pitch. Run from the repo root:

    npm run seed          add the demo accounts if they are missing (safe to repeat)
    npm run seed:reset    erase EVERY table first, then add them (works while the backend is running)

Demo logins (play money only, local use):
    parent   demo_parent   whack-demo-1    has example rewards and chores, and sees both kids
    child    demo_kid      1234            younger kid on the starter plan
    child    demo_teen     1234            older kid with a stronger record (can unlock Venture W)
"""

import argparse

from sqlmodel import Session, SQLModel

from app.core.database import engine, init_db
from app.core.security import hash_password
from app.models.card import get_profile
from app.models.led import ensure_skin_rewards
from app.models.milestone import MilestoneInput, replace_milestones
from app.models.shop import add_starter_items
from app.models.user import User, create_user, get_user_by_username
from app.models.weekly_item import WeeklyItemInput, replace_weekly_items

PARENT = {"username": "demo_parent", "password": "whack-demo-1", "display_name": "Demo Parent"}

CHILDREN = [
    {
        "username": "demo_kid",
        "password": "1234",
        "display_name": "Kit",
        "weekly_allowance": 1000,  # minor units (1/100 WC): 10.00 WC
        "app_experience": "13+",
        "card_type": "deer_debit,cap_one",
        "items": [("Ice cream", 300, 2), ("Extra screen time", 500, 1)],
        "milestones": [("New bike", 20000)],
        "profile": {},  # the default demo profile: score 640, on Whack Basic
    },
    {
        "username": "demo_teen",
        "password": "1234",
        "display_name": "Alex",
        "weekly_allowance": 2500,
        "app_experience": "15+",
        "card_type": "cap_one,venture_w,shark_father",
        "items": [("Cinema ticket", 800, 1), ("Snacks", 250, 3)],
        "milestones": [("Concert ticket", 12000), ("Headphones", 8000)],
        "profile": {"score": 710, "on_time_streak": 6, "balance": 1000, "months_open": 9},
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
        display_name=PARENT["display_name"],
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
        display_name=spec["display_name"],
        weekly_allowance=spec["weekly_allowance"],
        app_experience=spec["app_experience"],
        card_type=spec["card_type"],
    )
    assert child.id is not None
    replace_weekly_items(session, child.id, [WeeklyItemInput(name=n, cost=c, weekly_limit=w) for n, c, w in spec["items"]])
    replace_milestones(session, child.id, [MilestoneInput(name=n, cost=c) for n, c in spec["milestones"]])
    profile = get_profile(session, child.id)  # creates the demo credit profile
    for field, value in spec["profile"].items():
        setattr(profile, field, value)
    session.add(profile)
    session.commit()
    print(f"  created  child  {spec['username']}  (password {spec['password']})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Add demo accounts and data.")
    parser.add_argument("--reset", action="store_true", help="erase every table first")
    args = parser.parse_args()

    import app.models  # noqa: F401  (registers every table, so --reset knows what to drop)

    if args.reset:
        SQLModel.metadata.drop_all(engine)
        print("Erased all tables.")
    init_db()

    with Session(engine) as session:
        parent = _get_or_create_parent(session)
        assert parent.id is not None
        for spec in CHILDREN:
            _get_or_create_child(session, parent, spec)
        ensure_skin_rewards(session, parent.id)  # LED skins in the family shop, like the app does on first visit
    print("Done. Log in at http://localhost:5173/login")


if __name__ == "__main__":
    main()
