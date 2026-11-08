"""The parent's recap of a child's card use (docs/DESIGN.md sections 3 and 9).

The backend works out every number (`build_facts`). Claude only turns that facts sheet into a few sentences:
  * it never sees a name, only "the child", amounts, kinds of purchase and dates
  * every number in what it writes must appear in the facts sheet, or the text is thrown away
  * if the AI is unavailable, or fails that check twice, a plain built-in summary is used instead
"""

import json
import re

from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.controllers.ai_controller import call_claude
from app.core.seller_bot import age_band, age_from_experience
from app.models.breakdown import credit_costs, earned_breakdown, spending_breakdown
from app.models.card import CreditProfile, get_card, get_profile
from app.models.credit import is_credit, latest_statement
from app.models.pricing import money, pct
from app.models.recap import Recap
from app.models.score import ScoreEvent, band_of
from app.models.shop import balance_of
from app.models.user import User

MAX_TOKENS = 700
GENERIC_NUMBERS = {"10", "30", "100", "300", "800"}  # thresholds the AI may mention without them being in the facts

STATUS_WORDS = {
    "open": "waiting for payment",
    "paid": "paid in full",
    "carried": "minimum paid, the rest carried over",
    "late": "paid late",
}

SYSTEM = """You write a short recap for a PARENT about how their child is using Whack, a play-money credit card app that \
teaches kids and teens to manage credit. All money is Whack Coins (WC): play money, not real.

Use ONLY the facts you are given. Never invent, round or change a number. Never use the child's name: say "your child". \
Plain, warm, specific words. No real financial advice and no real brands or products.

Return ONLY a JSON object with these keys and nothing else:
  "headline": string, at most 12 words
  "spending": string, 1 to 2 sentences on what they spent and earned
  "credit": string, 1 to 2 sentences on their card habits (statements, interest, score); explain the cause of any change
  "praise": string, one sentence naming one thing they did well (if there is nothing yet, encourage a first step)
  "talk_about": list of exactly 2 short conversation starters the parent can use with the child
Keep every number exactly as written in the facts."""


# ---- the facts ----------------------------------------------------------------------

def build_facts(session: Session, child: User, profile: CreditProfile) -> dict:
    """Everything the recap may say, as plain numbers. Call `get_profile` first (it may commit)."""
    assert child.id is not None
    card = get_card(session, profile.current_card_id)
    spending = spending_breakdown(session, child.id)
    earned = earned_breakdown(session, child.id)
    interest, late_fees = credit_costs(session, child.id)
    statement = latest_statement(session, child.id)

    score = None
    last = session.exec(select(ScoreEvent).where(ScoreEvent.child_id == child.id).order_by(col(ScoreEvent.id).desc())).first()
    if last is not None:
        rows = session.exec(
            select(ScoreEvent).where(ScoreEvent.child_id == child.id, ScoreEvent.month == last.month).order_by(col(ScoreEvent.id))
        ).all()
        score = {"change": sum(e.delta for e in rows), "reasons": [f"{e.delta:+d} {e.reason}" for e in rows]}
    if score is None:
        score = {"change": None, "reasons": []}
    score["value"] = profile.score
    score["band"] = band_of(profile.score)

    return {
        "age_band": age_band(age_from_experience(child.app_experience)),
        "wallet_balance": balance_of(session, child.id),
        "on_credit": is_credit(profile),
        "card": card.name if card else profile.current_card_id,
        "apr_bp": profile.current_apr_bp,
        "limit": profile.credit_limit,
        "owed": profile.balance,
        "utilisation_pct": round(100 * profile.balance / profile.credit_limit) if profile.credit_limit else 0,
        "months": profile.cycles_done,
        "spending": [(r.label, r.count, r.total) for r in spending],
        "spent_total": sum(r.total for r in spending),
        "purchase_count": sum(r.count for r in spending),
        "earned": [(r.label, r.count, r.total) for r in earned],
        "earned_total": sum(r.total for r in earned),
        "interest_total": interest,
        "late_fee_total": late_fees,
        "statement": (
            {"number": statement.number, "total": statement.total, "status": statement.status, "interest": statement.interest,
             "fees": statement.fees}
            if statement
            else None
        ),
        "score": score,
    }


def facts_text(f: dict) -> str:
    """The facts sheet Claude is given. Every number the recap may use is in here."""
    lines = [
        f"Child's age band: {f['age_band']}",
        f"Own balance: {money(f['wallet_balance'])}",
    ]
    if f["on_credit"]:
        lines.append(
            f"Card: {f['card']} at {pct(f['apr_bp'])} APR, limit {money(f['limit'])}, "
            f"owes {money(f['owed'])} ({f['utilisation_pct']}% of the limit)"
        )
    else:
        lines.append("Card: Debit (spends only their own money, no credit)")
    lines.append(f"Months of statements so far: {f['months']}")
    if f["purchase_count"]:
        parts = "; ".join(f"{label} {money(total)} ({count} purchases)" for label, count, total in f["spending"])
        lines.append(f"Spent so far: {money(f['spent_total'])} across {f['purchase_count']} purchases: {parts}")
    else:
        lines.append("Spent so far: nothing yet")
    if f["earned_total"]:
        parts = "; ".join(f"{label} {money(total)}" for label, _, total in f["earned"])
        lines.append(f"Earned so far: {money(f['earned_total'])}: {parts}")
    else:
        lines.append("Earned so far: nothing yet")
    lines.append(f"Interest charged so far: {money(f['interest_total'])}. Late fees so far: {money(f['late_fee_total'])}")
    st = f["statement"]
    if st:
        lines.append(
            f"Latest statement (number {st['number']}): total {money(st['total'])}, {STATUS_WORDS.get(st['status'], st['status'])}, "
            f"interest on it {money(st['interest'])}, fees on it {money(st['fees'])}"
        )
    else:
        lines.append("Latest statement: none yet")
    sc = f["score"]
    line = f"Credit score: {sc['value']} ({sc['band']}) on a scale of 300 to 800"
    if sc["change"] is not None:
        line += f"; it changed by {sc['change']:+d} last month. Reasons: " + "; ".join(sc["reasons"])
    lines.append(line)
    return "\n".join(lines)


# ---- the built-in summary ----------------------------------------------------------------

def template_recap(f: dict) -> dict:
    """A plain recap made only from the facts, used when the AI is unavailable or fails its checks."""
    earned = f" They have earned {money(f['earned_total'])} so far." if f["earned_total"] else ""
    if f["purchase_count"]:
        label, _, total = f["spending"][0]
        spending = (
            f"They have spent {money(f['spent_total'])} across {f['purchase_count']} purchases, "
            f"mostly on {label.lower()} ({money(total)}).{earned}"
        )
    else:
        spending = f"They have not bought anything yet.{earned}"

    st = f["statement"]
    if not f["on_credit"]:
        credit = "They are on a debit card, so they spend only their own money and there is no credit to manage."
    else:
        bits = [f"They owe {money(f['owed'])} on their {f['card']} card, {f['utilisation_pct']}% of the limit."]
        if st:
            bits.append(f"Statement {st['number']} is {STATUS_WORDS.get(st['status'], st['status'])}.")
        if f["interest_total"]:
            bits.append(f"Interest has cost them {money(f['interest_total'])} so far.")
        credit = " ".join(bits)
    sc = f["score"]
    if sc["change"] is not None:
        credit += f" Their credit score is {sc['value']} ({sc['band']}), {sc['change']:+d} last month."

    if st and st["status"] == "paid" and st["total"] > 0:
        praise = f"They paid statement {st['number']} in full, so it cost them no interest."
    elif st and st["status"] == "carried":
        praise = f"They paid at least the minimum on statement {st['number']}, which kept it from counting as late."
    elif sc["change"] and sc["change"] > 0:
        praise = f"Their credit score went up by {sc['change']} last month."
    elif f["purchase_count"] and not f["interest_total"]:
        praise = "They have used their card without paying any interest."
    else:
        praise = "They are getting started, and that is the hardest part."

    if st and st["status"] == "late":
        first = f"Ask what got in the way of paying statement {st['number']} on time, and agree on a reminder."
    elif f["interest_total"]:
        first = "Ask how they could avoid interest next month by paying the whole statement."
    elif f["utilisation_pct"] > 30:
        first = "Talk about why using less of the limit is better for the credit score."
    else:
        first = "Ask what they are saving up for next and how the card could help."
    second = (
        "Look at their score history together and ask what moved it."
        if sc["change"] is not None
        else "Ask what they would buy next, and whether it is a need or a want."
    )
    return {
        "headline": "A snapshot of their card habits so far",
        "spending": spending,
        "credit": credit,
        "praise": praise,
        "talk_about": [first, second],
    }


# ---- the AI version -------------------------------------------------------------------------

def _numbers(text: str) -> set[str]:
    return {m.replace(",", "") for m in re.findall(r"\d[\d,]*(?:\.\d+)?", text)}


def _parse(raw: str) -> dict | None:
    """The JSON object in Claude's reply, if it has all the right keys and shapes."""
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        data = json.loads(text)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    for key in ("headline", "spending", "credit", "praise"):
        if not isinstance(data.get(key), str) or not data[key].strip():
            return None
    talk = data.get("talk_about")
    if not isinstance(talk, list) or not talk or not all(isinstance(t, str) and t.strip() for t in talk):
        return None
    return {
        "headline": data["headline"].strip()[:200],
        "spending": data["spending"].strip()[:800],
        "credit": data["credit"].strip()[:800],
        "praise": data["praise"].strip()[:400],
        "talk_about": [t.strip()[:300] for t in talk[:3]],
    }


def _unknown_numbers(parts: dict, facts: str) -> set[str]:
    written = " ".join([parts["headline"], parts["spending"], parts["credit"], parts["praise"], *parts["talk_about"]])
    return _numbers(written) - _numbers(facts) - GENERIC_NUMBERS


def claude_recap(facts: str) -> dict | None:
    """The AI's recap, or None if it is unavailable or keeps using numbers that are not in the facts."""
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
        bad = _unknown_numbers(parts, facts)
        if not bad:
            return parts
        extra = (
            f"\n\nYour last draft used numbers that are not in the facts ({', '.join(sorted(bad))}). "
            "Rewrite it using only numbers that appear in the facts."
        )
    return None


def generate_recap(session: Session, child: User) -> Recap:
    """Write, save and return a fresh recap for this child."""
    assert child.id is not None
    profile = get_profile(session, child.id)
    facts = build_facts(session, child, profile)
    parts = claude_recap(facts_text(facts))
    scripted = parts is None
    if parts is None:
        parts = template_recap(facts)
    recap = Recap(
        child_id=child.id,
        headline=parts["headline"],
        spending=parts["spending"],
        credit=parts["credit"],
        praise=parts["praise"],
        talk_about=json.dumps(parts["talk_about"]),
        scripted=scripted,
    )
    session.add(recap)
    session.commit()
    session.refresh(recap)
    return recap
