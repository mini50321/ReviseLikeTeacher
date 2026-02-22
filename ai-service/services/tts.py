import asyncio
from services.transcription import get_openai_client


async def generate_speech(text: str, voice: str = "nova", speed: float = 1.0) -> bytes:
    if not text or not text.strip():
        raise ValueError("Text is required for speech generation")

    client = get_openai_client()
    loop = asyncio.get_event_loop()

    def tts_sync():
        response = client.audio.speech.create(
            model="tts-1",
            voice=voice,
            input=text,
            speed=speed,
            response_format="mp3"
        )
        return response.content

    audio_bytes = await loop.run_in_executor(None, tts_sync)
    return audio_bytes
