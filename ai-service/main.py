from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
import uvicorn
from typing import Optional
import os
from dotenv import load_dotenv

from services.transcription import transcribe_audio
from services.evaluation import evaluate_answer
from services.tts import generate_speech

env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path=env_path)
load_dotenv()

app = FastAPI(title="ReviseLikeTeacher AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "ReviseLikeTeacher AI Service", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form(...)
):
    try:
        if language not in ["english", "hindi", "hinglish"]:
            raise HTTPException(status_code=400, detail="Language must be english, hindi, or hinglish")
        
        audio_content = await audio.read()
        
        if len(audio_content) == 0:
            raise HTTPException(status_code=400, detail="Audio file is empty")
        
        if len(audio_content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Audio file too large (max 10MB)")
        
        result = await transcribe_audio(audio_content, language, audio.filename)
        
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Transcription error in endpoint: {str(e)}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

@app.post("/evaluate")
async def evaluate(request: dict):
    try:
        question = request.get("question")
        student_answer = request.get("student_answer")
        current_mastery = request.get("current_mastery", 0)
        user_id = request.get("user_id")
        
        if not question or not student_answer:
            raise HTTPException(status_code=400, detail="Question and student_answer are required")
        
        result = await evaluate_answer(
            question=question,
            student_answer=student_answer,
            current_mastery=current_mastery,
            user_id=user_id
        )
        
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Evaluation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")

@app.post("/tts")
async def text_to_speech(request: dict):
    try:
        text = request.get("text")
        voice = request.get("voice", "nova")
        speed = request.get("speed", 1.0)

        if not text:
            raise HTTPException(status_code=400, detail="Text is required")

        if len(text) > 4096:
            text = text[:4096]

        allowed_voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
        if voice not in allowed_voices:
            voice = "nova"

        audio_bytes = await generate_speech(text=text, voice=voice, speed=speed)

        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=teacher_response.mp3"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"TTS error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Speech generation failed: {str(e)}")


@app.post("/extract-pdf")
async def extract_pdf(request: dict):
    try:
        pdf_path = request.get("pdf_path")
        
        if not pdf_path:
            raise HTTPException(status_code=400, detail="pdf_path is required")
        
        return JSONResponse(content={
            "message": "PDF extraction endpoint - to be implemented",
            "pdf_path": pdf_path
        })
    except HTTPException:
        raise
    except Exception as e:
        print(f"PDF extraction error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"PDF extraction failed: {str(e)}")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

