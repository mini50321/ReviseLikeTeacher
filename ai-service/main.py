from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
import uvicorn
from typing import Optional
import os
from dotenv import load_dotenv

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

@app.post("/context/reindex")
async def context_reindex(request: dict = None):
    try:
        from services.context_retrieval import build_or_load_context_index
        force_rebuild = bool((request or {}).get("force_rebuild", True))
        index_data = build_or_load_context_index(force_rebuild=force_rebuild)
        return JSONResponse(content={
            "ok": True,
            "total_indexed": index_data.get("count", 0),
            "used_embeddings": bool(index_data.get("has_embeddings"))
        })
    except Exception as e:
        import traceback
        print(f"Context reindex error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Context reindex failed: {str(e)}")

@app.post("/context/retrieve")
async def context_retrieve(request: dict):
    try:
        from services.context_retrieval import retrieve_relevant_context
        query = request.get("query", "")
        subject = request.get("subject")
        topic = request.get("topic")
        top_k = int(request.get("top_k", 5))
        force_rebuild = bool(request.get("force_rebuild", False))

        if not query or not str(query).strip():
            raise HTTPException(status_code=400, detail="query is required")

        result = retrieve_relevant_context(
            query=str(query),
            subject=subject,
            topic=topic,
            top_k=max(1, min(top_k, 10)),
            force_rebuild=force_rebuild
        )
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Context retrieve error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Context retrieval failed: {str(e)}")

@app.post("/voice-coach-turn")
async def voice_coach_turn(request: dict):
    try:
        from services.voice_coach import coach_voice_turn
        transcript = request.get("transcript")
        if not transcript or not str(transcript).strip():
            raise HTTPException(status_code=400, detail="transcript is required")

        result = await coach_voice_turn(
            transcript=str(transcript),
            subject=request.get("subject"),
            topic=request.get("topic"),
            question_stem=request.get("question_stem"),
            student_answer=request.get("student_answer"),
            top_k=int(request.get("top_k", 5)),
            latency_mode=request.get("latency_mode", "balanced"),
            conversation_history=request.get("conversation_history", [])
        )
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Voice coach turn error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Voice coach turn failed: {str(e)}")

@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form(...)
):
    try:
        from services.transcription import transcribe_audio
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
        from services.evaluation import evaluate_answer
        question = request.get("question")
        student_answer = request.get("student_answer")
        current_mastery = request.get("current_mastery", 0)
        user_id = request.get("user_id")
        training_examples = request.get("training_examples") or []
        
        if not question or not student_answer:
            raise HTTPException(status_code=400, detail="Question and student_answer are required")
        
        result = await evaluate_answer(
            question=question,
            student_answer=student_answer,
            current_mastery=current_mastery,
            user_id=user_id,
            training_examples=training_examples
        )
        
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Evaluation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")

@app.post("/quick-check")
async def quick_check(request: dict):
    try:
        from services.evaluation import evaluate_quick_check
        question = request.get("question")
        original_answer = request.get("original_answer", "")
        teacher_response = request.get("teacher_response", "")
        quick_check_answer = request.get("quick_check_answer")

        if not question or not quick_check_answer:
            raise HTTPException(status_code=400, detail="question and quick_check_answer are required")

        result = await evaluate_quick_check(
            question=question,
            original_answer=original_answer,
            teacher_response=teacher_response,
            quick_check_answer=quick_check_answer
        )
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Quick-check error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Quick-check failed: {str(e)}")

@app.post("/tts")
async def text_to_speech(request: dict):
    try:
        from services.tts import generate_speech
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
        import traceback
        print(f"TTS error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Speech generation failed: {str(e)}")


@app.post("/extract-pdf")
async def extract_pdf(
    file: UploadFile = File(...),
    filename: str = Form(""),
    start_page: int = Form(0),
    end_page: int | None = Form(None)
):
    try:
        from services.pdf_extraction import extract_questions_from_pdf
        pdf_content = await file.read()

        if len(pdf_content) == 0:
            raise HTTPException(status_code=400, detail="PDF file is empty")

        if len(pdf_content) > 50 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="PDF file too large (max 50MB)")

        result = await extract_questions_from_pdf(
            pdf_content,
            filename or file.filename or "unknown.pdf",
            start_page=start_page,
            end_page=end_page
        )

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
        from services.exam_trigger_notes import generate_exam_trigger_notes
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


@app.post("/concept-map/build-draft")
async def concept_map_build_draft(request: dict):
    try:
        from services.concept_builder import build_concept_map_from_text
        subject = request.get("subject")
        topic = request.get("topic")
        text = request.get("text")
        max_concepts = int(request.get("max_concepts", 6))

        if not subject or not topic or not text or not str(text).strip():
            raise HTTPException(status_code=400, detail="subject, topic, and text are required")

        result = await build_concept_map_from_text(
            subject=str(subject),
            topic=str(topic),
            text=str(text),
            max_concepts=max_concepts
        )

        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Concept map build error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Concept map build failed: {str(e)}")


@app.post("/generate-rapid-fire")
async def rapid_fire_endpoint(request: dict):
    try:
        from services.rapid_fire import generate_rapid_fire_questions
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
        from services.distractor_intelligence import enrich_distractor_data
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
        from services.teaching_units import generate_teaching_unit
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
        from services.concept_clustering import detect_concept_clusters
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
        from services.integration_tagging import detect_integration_tags
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
        from services.mcq_to_saq import convert_mcqs_to_saqs
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
        from services.laq_generator import generate_laq_vignette
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
        from services.laq_generator import generate_laq_batch
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


@app.post("/generate-saq-anchors")
async def generate_saq_anchors_endpoint(request: dict):
    try:
        from services.anchor_generation import generate_saq_anchors
        subject = request.get("subject")
        topic = request.get("topic")
        count = request.get("count", 4)

        if not subject or not topic:
            raise HTTPException(status_code=400, detail="Subject and topic are required")

        result = await generate_saq_anchors(
            subject=subject,
            topic=topic,
            count=min(int(count), 6),
            core_points=request.get("core_points", []),
            pyq_examples=request.get("pyq_examples", [])
        )
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"SAQ anchor generation error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"SAQ anchor generation failed: {str(e)}")


@app.post("/generate-mcq-items")
async def generate_mcq_items_endpoint(request: dict):
    try:
        from services.mcq_generation import generate_mcq_items
        subject = request.get("subject")
        topic = request.get("topic")
        count = request.get("count", 4)

        if not subject or not topic:
            raise HTTPException(status_code=400, detail="Subject and topic are required")

        result = await generate_mcq_items(
            subject=subject,
            topic=topic,
            count=min(max(int(count), 1), 8),
            core_points=request.get("core_points", []),
            pyq_examples=request.get("pyq_examples", [])
        )
        return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"MCQ generation error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"MCQ generation failed: {str(e)}")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    host = "0.0.0.0" if os.getenv("PORT") else "127.0.0.1"
    uvicorn.run(app, host=host, port=port)

