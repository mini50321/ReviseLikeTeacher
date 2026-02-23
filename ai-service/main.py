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
from services.pdf_extraction import extract_questions_from_pdf
from services.exam_trigger_notes import generate_exam_trigger_notes
from services.teaching_units import generate_teaching_unit
from services.distractor_intelligence import enrich_distractor_data
from services.rapid_fire import generate_rapid_fire_questions
from services.integration_tagging import detect_integration_tags
from services.concept_clustering import detect_concept_clusters
from services.mcq_to_saq import convert_mcqs_to_saqs
from services.laq_generator import generate_laq_vignette, generate_laq_batch

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
async def extract_pdf(
    file: UploadFile = File(...),
    filename: str = Form("")
):
    try:
        pdf_content = await file.read()

        if len(pdf_content) == 0:
            raise HTTPException(status_code=400, detail="PDF file is empty")

        if len(pdf_content) > 50 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="PDF file too large (max 50MB)")

        result = await extract_questions_from_pdf(pdf_content, filename or file.filename or "unknown.pdf")

        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"PDF extraction error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"PDF extraction failed: {str(e)}")

@app.post("/generate-notes")
async def generate_notes(request: dict):
    try:
        subject = request.get("subject")
        topic = request.get("topic")

        if not subject or not topic:
            raise HTTPException(status_code=400, detail="Subject and topic are required")

        result = await generate_exam_trigger_notes(
            subject=subject,
            topic=topic,
            weak_subtopics=request.get("weak_subtopics"),
            mastery_status=request.get("mastery_status"),
            mcq_accuracy=request.get("mcq_accuracy"),
            core_coverage=request.get("core_coverage"),
            misconceptions=request.get("misconceptions")
        )

        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Note generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Note generation failed: {str(e)}")


@app.post("/generate-rapid-fire")
async def rapid_fire_endpoint(request: dict):
    try:
        subject = request.get("subject")
        topic = request.get("topic")
        weak_subtopics = request.get("weak_subtopics")
        mastery_result = request.get("mastery_result")
        count = request.get("count", 10)

        if not subject or not topic:
            raise HTTPException(status_code=400, detail="Subject and topic are required")

        result = await generate_rapid_fire_questions(
            subject=subject,
            topic=topic,
            weak_subtopics=weak_subtopics,
            mastery_result=mastery_result,
            count=min(int(count), 20)
        )
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Rapid-fire generation error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Rapid-fire generation failed: {str(e)}")


@app.post("/enrich-distractors")
async def enrich_distractors_endpoint(request: dict):
    try:
        questions = request.get("questions", [])

        if not questions:
            raise HTTPException(status_code=400, detail="Questions array is required")

        if len(questions) > 20:
            raise HTTPException(status_code=400, detail="Maximum 20 questions per request")

        result = await enrich_distractor_data(questions)
        return JSONResponse(content={"enrichments": result})
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Distractor enrichment error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Distractor enrichment failed: {str(e)}")


@app.post("/generate-teaching-unit")
async def generate_teaching_unit_endpoint(request: dict):
    try:
        subject = request.get("subject")
        topic = request.get("topic")

        if not subject or not topic:
            raise HTTPException(status_code=400, detail="Subject and topic are required")

        result = await generate_teaching_unit(
            subject=subject,
            topic=topic,
            subtopics=request.get("subtopics"),
            weak_areas=request.get("weak_areas"),
            pyq_data=request.get("pyq_data")
        )

        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Teaching unit generation error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Teaching unit generation failed: {str(e)}")


@app.post("/detect-clusters")
async def detect_clusters_endpoint(request: dict):
    try:
        questions = request.get("questions", [])

        if not questions:
            raise HTTPException(status_code=400, detail="Questions array is required")

        if len(questions) > 50:
            raise HTTPException(status_code=400, detail="Maximum 50 questions per request")

        result = await detect_concept_clusters(questions)
        return JSONResponse(content={"clusters": result})
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Concept clustering error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Concept clustering failed: {str(e)}")


@app.post("/detect-integration")
async def detect_integration_endpoint(request: dict):
    try:
        questions = request.get("questions", [])

        if not questions:
            raise HTTPException(status_code=400, detail="Questions array is required")

        if len(questions) > 20:
            raise HTTPException(status_code=400, detail="Maximum 20 questions per request")

        result = await detect_integration_tags(questions)
        return JSONResponse(content={"results": result})
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Integration detection error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Integration detection failed: {str(e)}")


@app.post("/convert-mcq-to-saq")
async def convert_mcq_to_saq_endpoint(request: dict):
    try:
        questions = request.get("questions", [])

        if not questions:
            raise HTTPException(status_code=400, detail="Questions array is required")

        if len(questions) > 10:
            raise HTTPException(status_code=400, detail="Maximum 10 questions per request")

        result = await convert_mcqs_to_saqs(questions)
        return JSONResponse(content={"conversions": result})
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"MCQ-to-SAQ conversion error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")


@app.post("/generate-laq")
async def generate_laq_endpoint(request: dict):
    try:
        subject = request.get("subject")
        topic = request.get("topic")

        if not subject or not topic:
            raise HTTPException(status_code=400, detail="Subject and topic are required")

        high_yield_concepts = request.get("high_yield_concepts", [])
        pyq_traps = request.get("pyq_traps", [])
        difficulty = request.get("difficulty", "medium")

        result = await generate_laq_vignette(
            subject=subject,
            topic=topic,
            high_yield_concepts=high_yield_concepts,
            pyq_traps=pyq_traps,
            difficulty=difficulty
        )
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"LAQ generation error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"LAQ generation failed: {str(e)}")


@app.post("/generate-laq-batch")
async def generate_laq_batch_endpoint(request: dict):
    try:
        items = request.get("items", [])

        if not items:
            raise HTTPException(status_code=400, detail="Items array is required")

        if len(items) > 5:
            raise HTTPException(status_code=400, detail="Maximum 5 items per batch")

        results = await generate_laq_batch(items)
        return JSONResponse(content={"results": results})
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"LAQ batch generation error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"LAQ batch generation failed: {str(e)}")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

