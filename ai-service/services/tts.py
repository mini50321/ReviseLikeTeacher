import os
import httpx
from dotenv import load_dotenv

load_dotenv()

_ALLOWED_VOICES = frozenset({"alloy", "echo", "fable", "onyx", "nova", "shimmer"})


async def generate_speech(text: str, voice: str = "nova", speed: float = 1.0) -> bytes:
    if not text or not text.strip():
        raise ValueError("Text is required for speech generation")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured")

    v = voice if voice in _ALLOWED_VOICES else "nova"
    payload = {
        "model": "tts-1",
        "voice": v,
        "input": text[:4096].strip(),
        "speed": min(max(float(speed), 0.25), 4.0),
        "response_format": "mp3"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload
        )
        response.raise_for_status()
        return response.content
