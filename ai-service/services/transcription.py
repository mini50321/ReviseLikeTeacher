from faster_whisper import WhisperModel
import tempfile
import os
from typing import Dict, Any
import asyncio

_model_cache = {}

async def load_model(model_name: str = "base"):
    if model_name not in _model_cache:
        loop = asyncio.get_event_loop()
        model = await loop.run_in_executor(
            None,
            lambda: WhisperModel(model_name, device="cpu", compute_type="int8")
        )
        _model_cache[model_name] = model
    return _model_cache[model_name]

def get_language_code(language: str) -> str:
    language_map = {
        "english": "en",
        "hindi": "hi",
        "hinglish": "hi"
    }
    return language_map.get(language.lower(), "en")

async def transcribe_audio(audio_content: bytes, language: str, filename: str = None) -> Dict[str, Any]:
    try:
        model_name = "base"
        
        if language == "hinglish":
            model_name = "medium"
        
        model = await load_model(model_name)
        
        lang_code = get_language_code(language)
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
            temp_file.write(audio_content)
            temp_path = temp_file.name
        
        try:
            loop = asyncio.get_event_loop()
            def transcribe_sync():
                segments, info = model.transcribe(
                    temp_path,
                    language=lang_code if language != "hinglish" else None,
                    task="transcribe"
                )
                return list(segments), info
            
            segments_list, info = await loop.run_in_executor(None, transcribe_sync)
            
            transcription_text = " ".join([segment.text for segment in segments_list]).strip()
            
            confidence = 0.0
            if segments_list:
                avg_confidence = sum(seg.no_speech_prob for seg in segments_list) / len(segments_list)
                confidence = max(0.0, min(1.0, 1.0 - avg_confidence))
            
            return {
                "transcription": transcription_text,
                "confidence": round(confidence, 2),
                "language": language,
                "segments": len(segments_list)
            }
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
                
    except Exception as e:
        raise Exception(f"Transcription failed: {str(e)}")

