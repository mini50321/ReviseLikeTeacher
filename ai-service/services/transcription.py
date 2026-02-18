from openai import OpenAI
from openai import RateLimitError, APIError, APIConnectionError
import tempfile
import os
import sys
from typing import Dict, Any, Optional
import asyncio
from dotenv import load_dotenv

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

_client: Optional[OpenAI] = None

def get_openai_client() -> OpenAI:
    global _client
    if _client is None:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        service_dir = os.path.dirname(script_dir)
        
        env_paths = [
            os.path.join(service_dir, ".env"),
            os.path.join(script_dir, ".env"),
            os.path.abspath(".env")
        ]
        
        api_key = None
        for env_path in env_paths:
            abs_path = os.path.abspath(env_path)
            if os.path.exists(abs_path):
                load_dotenv(dotenv_path=abs_path, override=True)
                api_key = os.getenv("OPENAI_API_KEY")
                if api_key:
                    break
                try:
                    with open(abs_path, 'r', encoding='utf-8-sig') as f:
                        for line in f:
                            line = line.strip()
                            if line and not line.startswith('#'):
                                if 'OPENAI_API_KEY=' in line or line.startswith('OPENAI_API_KEY='):
                                    parts = line.split('=', 1)
                                    if len(parts) == 2:
                                        key_name = parts[0].strip().lstrip('\ufeff')
                                        if key_name == 'OPENAI_API_KEY':
                                            api_key = parts[1].strip()
                                            if api_key:
                                                os.environ['OPENAI_API_KEY'] = api_key
                                                break
                    if api_key:
                        break
                except Exception as e:
                    print(f"Error reading .env file: {e}")
                    pass
        
        if not api_key:
            load_dotenv(override=True)
            api_key = os.getenv("OPENAI_API_KEY")
        
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY not found in environment variables. "
                "Please set it in your .env file (in ai-service/ directory) or environment variables."
            )
        
        _client = OpenAI(api_key=api_key)
    return _client

def get_language_code(language: str) -> str:
    language_map = {
        "english": "en",
        "hindi": "hi",
        "hinglish": "hi"
    }
    return language_map.get(language.lower(), "en")

async def transcribe_audio(audio_content: bytes, language: str, filename: str = None) -> Dict[str, Any]:
    temp_path = None
    try:
        print(f"Starting transcription: language={language}, filename={filename}, audio_size={len(audio_content)} bytes")
        
        file_ext = ".webm"
        if filename:
            _, ext = os.path.splitext(filename.lower())
            if ext in [".webm", ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".ogg"]:
                file_ext = ext
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
            temp_file.write(audio_content)
            temp_path = temp_file.name
        
        print(f"Audio saved to temp file: {temp_path}")
        
        lang_code = get_language_code(language)
        language_param = lang_code if language != "hinglish" else None
        
        print(f"Calling OpenAI Whisper API with language={language_param}")
        
        client = get_openai_client()
        
        loop = asyncio.get_event_loop()
        
        def transcribe_sync():
            with open(temp_path, "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language=language_param,
                    response_format="verbose_json"
                )
            return transcript
        
        transcript = await loop.run_in_executor(None, transcribe_sync)
        
        transcription_text = transcript.text.strip() if hasattr(transcript, 'text') else str(transcript).strip()
        try:
            print(f"Transcription text: {transcription_text[:100]}...")
        except (UnicodeEncodeError, UnicodeDecodeError):
            safe_text = transcription_text[:100].encode('utf-8', errors='replace').decode('utf-8', errors='replace')
            print(f"Transcription text: {safe_text}...")
        
        confidence = 0.95
        
        segments_count = 0
        if hasattr(transcript, 'segments') and transcript.segments:
            segments_count = len(transcript.segments)
        elif isinstance(transcript, dict) and 'segments' in transcript:
            segments_count = len(transcript['segments'])
        
        detected_language = language
        if hasattr(transcript, 'language') and transcript.language:
            detected_language = transcript.language
        elif isinstance(transcript, dict) and 'language' in transcript:
            detected_language = transcript['language']
        
        result = {
            "transcription": transcription_text,
            "confidence": round(confidence, 2),
            "language": detected_language if detected_language else language,
            "segments": segments_count
        }
        
        try:
            print(f"Transcription complete: {len(transcription_text)} characters, language={result['language']}")
            print(f"Returning result: {result}")
        except (UnicodeEncodeError, UnicodeDecodeError):
            print(f"Transcription complete: {len(transcription_text)} characters, language={result['language']}")
            print("Returning result (contains Unicode characters)")
        return result
        
    except RateLimitError as e:
        error_msg = (
            "Transcription failed: OpenAI API quota exceeded. "
            "Please check your OpenAI account billing and add credits, or try again later."
        )
        print(f"Rate limit error: {str(e)}")
        raise Exception(error_msg)
    except APIConnectionError as e:
        error_msg = (
            "Transcription failed: Network connection error. "
            "Please check your internet connection and try again."
        )
        print(f"Connection error: {str(e)}")
        raise Exception(error_msg)
    except APIError as e:
        error_str = str(e).lower()
        if "api_key" in error_str or "authentication" in error_str or "unauthorized" in error_str:
            error_msg = (
                "Transcription failed: Invalid or missing OpenAI API key. "
                "Please check your OPENAI_API_KEY in the .env file."
            )
        elif "quota" in error_str or "insufficient_quota" in error_str:
            error_msg = (
                "Transcription failed: OpenAI API quota exceeded. "
                "Please check your OpenAI account billing and add credits."
            )
        else:
            error_msg = f"Transcription failed: OpenAI API error - {str(e)}"
        print(f"API error: {str(e)}")
        raise Exception(error_msg)
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        error_str = str(e).lower()
        
        print(f"Transcription error: {str(e)}")
        print(f"Traceback: {error_trace}")
        
        if "file" in error_str and "format" in error_str:
            error_msg = (
                "Transcription failed: Unsupported audio file format. "
                "Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg"
            )
        else:
            error_msg = f"Transcription failed: {str(e)}"
        
        raise Exception(error_msg)
        
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
                print(f"Cleaned up temp file: {temp_path}")
            except Exception as cleanup_error:
                print(f"Warning: Failed to clean up temp file: {cleanup_error}")

