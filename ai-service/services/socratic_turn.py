import os
import json
import asyncio
from typing import Any, Dict, List, Optional

from services.evaluation import get_openai_client


def _strip_json_fences(text: str) -> str:
    s = (text or "").strip()
    if s.startswith("```json"):
        s = s[7:]
    elif s.startswith("```"):
        s = s[3:]
    s = s.strip()
    if s.endswith("```"):
        s = s[:-3].strip()
    return s


def _normalize_messages(messages: Any) -> List[Dict[str, str]]:
    if not isinstance(messages, list) or len(messages) == 0:
        raise ValueError("messages must be a non-empty list")
    out: List[Dict[str, str]] = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        role = str(m.get("role", "")).strip().lower()
        content = m.get("content")
        if role not in ("system", "user", "assistant"):
            continue
        if content is None:
            continue
        c = str(content).strip()
        if not c:
            continue
        out.append({"role": role, "content": c})
    if len(out) == 0:
        raise ValueError("messages must contain at least one valid system or user message")
    return out


async def run_socratic_next_turn(
    messages: List[Dict[str, Any]],
    temperature: float = 0.35,
    max_tokens: int = 800,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    client = get_openai_client()
    if not client:
        raise ValueError("OPENAI_API_KEY not configured")

    normalized = _normalize_messages(messages)
    mdl = model or os.getenv("AI_MODEL", "gpt-4o-mini")

    def _call():
        return client.chat.completions.create(
            model=mdl,
            messages=normalized,
            temperature=float(temperature),
            max_tokens=int(max_tokens),
            response_format={"type": "json_object"},
        )

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, _call)
    raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise ValueError("empty model response")

    try:
        parsed = json.loads(_strip_json_fences(raw))
    except json.JSONDecodeError as e:
        raise ValueError(f"invalid json from model: {e}") from e

    if not isinstance(parsed, dict):
        raise ValueError("model response must be a JSON object")

    next_p = str(parsed.get("next_teacher_prompt", "") or "").strip()
    if not next_p:
        raise ValueError("missing next_teacher_prompt")

    ack = parsed.get("teacher_acknowledgment")
    if ack is not None and ack != "":
        ack = str(ack).strip() or None
    else:
        ack = None

    return {
        "next_teacher_prompt": next_p,
        "teacher_acknowledgment": ack,
        "model": mdl,
    }
