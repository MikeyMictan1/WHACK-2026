import anthropic
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter(prefix="/ai", tags=["ai"])

MODEL = "claude-haiku-5-5"
SYSTEM_PROMPT = "You are a helpful, concise assistant."

# Created lazily so the app still boots without a key; the status endpoint reports it.
_client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    global _client
    if not settings.anthropic_api_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "AI is not configured. Set ANTHROPIC_API_KEY in backend/.env.",
        )
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    reply: str


@router.get("")
def get_ai_status() -> dict[str, str]:
    configured = bool(settings.anthropic_api_key)
    return {"feature": "ai", "status": f"{MODEL} ready" if configured else "no API key set"}


@router.post("/chat")
def chat(body: ChatRequest) -> ChatResponse:
    client = get_client()
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            output_config={"effort": "low"},
            messages=[{"role": "user", "content": body.message}],
        )
    except anthropic.AuthenticationError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Invalid Anthropic API key.")
    except anthropic.RateLimitError:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Rate limited. Try again shortly.")
    except anthropic.APIStatusError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Claude API error ({e.status_code}).")
    except anthropic.APIConnectionError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not reach the Claude API.")

    if response.stop_reason == "refusal":
        return ChatResponse(reply="Sorry, I can't help with that request.")

    reply = "".join(block.text for block in response.content if block.type == "text")
    return ChatResponse(reply=reply.strip())
