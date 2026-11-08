"""The monthly wrap for a child (docs/DESIGN.md sections 4 and 9).

Same rules as the parent's recap (core/recap_bot.py): the backend works out every number, Claude only turns a facts sheet
into a few friendly sentences, any number it writes that is not in the facts is thrown away, and a built-in summary covers
for the AI. Two more rules for a child: it never sees a name (it writes "you"), and if the parent has switched credit
score tracking off it is not told the score and must not mention one.
"""

import json
import re

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.controllers.ai_controller import call_claude
from app.core.recap_bot import GENERIC_NUMBERS, STATUS_WORDS, _numbers, build_facts
from app.models.card import get_profile
from app.models.credit import latest_statement
from app.models.pricing import money, pct
from app.models.score import score_enabled
from app.models.story import MonthlyStory, find_story
from app.models.user import User

MAX_TOKENS = 600

SYSTEM = """You write "your month" for a child or teen using Teenacredit, a play-money credit card app that teaches how credit \
works. All money is Whack Coins (WC): play money, not real. You are talking TO the child, so say "you".

Use ONLY the facts you are given. Never invent, round or change a number. Never guess a name. Be warm, specific and brief, \
pitched at the age band given (10-12: very simple words and short sentences; 13-15: friendly and plain; 16-18: a little more \
grown-up, still plain). Explain the cause of anything that cost them or moved their score. Do not scold. No real financial \
advice, no real brands, no emoji. If the facts do not include a credit score, do not mention one.

Return ONLY a JSON object with these keys and nothing else:
  "headline": string, at most 10 words
  "story": string, 2 to 4 short sentences about their month
  "tip": string, one sentence: one specific thing to try next month
Keep every number exactly as written in the facts."""


def facts_text(session: Session, child: User) -> tuple[str, dict]:
    """The facts sheet for the latest statement, and the numbers it was built from."""
    assert child.id is not None
    profile = get_profile(session, child.id)  # first: it may commit
    f = build_facts(session, child, profile)
    st = latest_statement(session, child.id)
    assert st is not None
    show_score = score_enabled(child.app_experience)
    f["show_score"] = show_score
    f["st"] = {
        "number": st.number, "status": st.status, "total": st.total, "minimum": st.minimum, "paid": st.paid,
        "purchases": st.purchases, "carried": st.carried, "interest": st.interest, "fees": st.fees,
        "cash_back": st.cash_back, "due": st.due_date.strftime("%d %b %Y").lstrip("0"),
    }
    lines = [f"Age band: {f['age_band']}"]
    if f["on_credit"]:
        lines.append(f"Card: {f['card']} at {pct(f['apr_bp'])} APR, limit {money(f['limit'])}, you owe {money(f['owed'])} ({f['utilisation_pct']}% of the limit)")
    else:
        lines.append("Card: DeerDebit (spends only their own money)")
    s = f["st"]
    lines.append(
        f"Statement {s['number']}: purchases {money(s['purchases'])}, carried over {money(s['carried'])}, interest {money(s['interest'])}, "
        f"fees {money(s['fees'])}, total {money(s['total'])}, minimum {money(s['minimum'])}, paid so far {money(s['paid'])}, "
        f"status: {STATUS_WORDS.get(s['status'], s['status'])}, due {s['due']}"
    )
    if s["cash_back"]:
        lines.append(f"Cash back earned on it: {money(s['cash_back'])}")
    if f["purchase_count"]:
        top = "; ".join(f"{label} {money(total)}" for label, _, total in f["spending"][:3])
        lines.append(f"All the things bought so far: {money(f['spent_total'])} in {f['purchase_count']} purchases ({top})")
    lines.append(f"Interest paid so far: {money(f['interest_total'])}. Late fees so far: {money(f['late_fee_total'])}")
    sc = f["score"]
    if show_score:
        line = f"Credit score: {sc['value']} ({sc['band']}) on a scale of 300 to 800"
        if sc["change"] is not None:
            line += f"; it changed by {sc['change']:+d} last month. Reasons: " + "; ".join(sc["reasons"])
        lines.append(line)
    return "\n".join(lines), f


def template_story(f: dict) -> dict:
    """A plain story made only from the facts, used when the AI is unavailable or fails its checks."""
    s = f["st"]
    if not f["on_credit"]:
        story = "You are on a debit card, so you spend only your own money. There is no statement to pay and no interest."
        return {"headline": "Your month on debit", "story": story, "tip": "Try a credit card when you are ready to practise paying a statement."}
    status = s["status"]
    if status == "paid":
        headline = "You paid in full"
        story = f"Statement {s['number']} was {money(s['total'])} and you paid all of it, so interest cost you nothing."
        if s["cash_back"]:
            story += f" You also earned {money(s['cash_back'])} cash back."
        tip = "Keep paying the whole statement before the due date."
    elif status == "late":
        headline = "A late month"
        story = f"Statement {s['number']} was {money(s['total'])} and it was not paid on time, so a late fee of {money(s['fees'])} was added."
        tip = "Pay at least the minimum before the due date, even if you cannot pay it all."
    elif status == "carried":
        headline = "You paid the minimum"
        story = (
            f"You paid at least the minimum on statement {s['number']}, which kept it from being late. The rest carries over "
            f"and interest of {money(s['interest'])} was charged."
        )
        tip = "Paying the whole statement next time means no interest at all."
    else:
        headline = "Your new statement"
        story = (
            f"Statement {s['number']} is {money(s['total'])}. The minimum is {money(s['minimum'])} and it is due on {s['due']}. "
            f"You have used {f['utilisation_pct']}% of your limit."
        )
        tip = "Pay the whole statement before the due date and it costs you no interest."
    if f["show_score"] and f["score"]["change"] is not None:
        story += f" Your credit score is {f['score']['value']}, {f['score']['change']:+d} last month."
    return {"headline": headline, "story": story, "tip": tip}


def _parse(raw: str) -> dict | None:
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
    try:
        data = json.loads(text)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    out = {}
    for key, cap in (("headline", 200), ("story", 900), ("tip", 400)):
        value = data.get(key)
        if not isinstance(value, str) or not value.strip():
            return None
        out[key] = value.strip()[:cap]
    return out


def claude_story(facts: str, show_score: bool) -> dict | None:
    """The AI's story, or None if it is unavailable or keeps breaking the rules."""
    extra = ""
    for _ in range(2):
        try:
            resp = call_claude(system=SYSTEM + extra, messages=[{"role": "user", "content": facts}], max_tokens=MAX_TOKENS)
        except HTTPException:
            return None
        if resp.stop_reason == "refusal":
            return None
        parts = _parse("".join(b.text for b in resp.content if b.type == "text"))
        if parts is None:
            extra = "\n\nYour last reply was not the JSON object described. Reply with only that JSON."
            continue
        written = " ".join(parts.values())
        bad = _numbers(written) - _numbers(facts) - GENERIC_NUMBERS
        if bad:
            extra = f"\n\nYour last draft used numbers that are not in the facts ({', '.join(sorted(bad))}). Use only numbers in the facts."
            continue
        if not show_score and re.search(r"\bscore\b", written, re.I):
            extra = "\n\nYour last draft mentioned a credit score. This child has none switched on: leave it out."
            continue
        return parts
    return None


def story_for(session: Session, child: User) -> MonthlyStory | None:
    """The wrap for the child's latest statement, written (and saved) the first time it is asked for.
    None before their first statement."""
    assert child.id is not None
    get_profile(session, child.id)
    st = latest_statement(session, child.id)
    if st is None:
        return None
    number, status = st.number, st.status
    existing = find_story(session, child.id, number, status)
    if existing is not None:
        return existing
    facts, f = facts_text(session, child)
    parts = claude_story(facts, f["show_score"])
    scripted = parts is None
    if parts is None:
        parts = template_story(f)
    story = MonthlyStory(
        child_id=child.id, statement_number=number, statement_status=status, scripted=scripted, **parts
    )
    session.add(story)
    try:
        session.commit()
    except IntegrityError:  # two page loads at once: keep the first one saved
        session.rollback()
        return find_story(session, child.id, number, status)
    session.refresh(story)
    return story


def retry_story(session: Session, child: User) -> MonthlyStory | None:
    """Replace a built-in story with an AI one, once the AI is back. Does nothing to a story the AI already wrote."""
    assert child.id is not None
    current = story_for(session, child)
    if current is None or not current.scripted:
        return current
    facts, f = facts_text(session, child)
    parts = claude_story(facts, f["show_score"])
    if parts is None:
        return current
    current.headline, current.story, current.tip, current.scripted = parts["headline"], parts["story"], parts["tip"], False
    session.add(current)
    session.commit()
    session.refresh(current)
    return current

