import os
import json
import asyncio
import time
import hashlib
from typing import Dict, Any, Optional
from openai import OpenAI
from services.context_retrieval import retrieve_relevant_context

_client: Optional[OpenAI] = None
_response_cache: Dict[str, Dict[str, Any]] = {}
VOICE_CACHE_TTL_SECONDS = int(os.getenv("VOICE_COACH_CACHE_TTL_SECONDS", "180"))
VOICE_CACHE_MAX_ITEMS = int(os.getenv("VOICE_COACH_CACHE_MAX_ITEMS", "300"))
VOICE_COACH_TIMEOUT_SECONDS = float(os.getenv("VOICE_COACH_TIMEOUT_SECONDS", "12"))
VOICE_MIN_CONTEXT_SCORE = float(os.getenv("VOICE_MIN_CONTEXT_SCORE", "0.9"))
MEDICAL_QUERY_EXPANSIONS = {
    "moa": "mechanism of action",
    "nsaid": "nonsteroidal anti inflammatory drug",
    "raas": "renin angiotensin aldosterone system",
    "copd": "chronic obstructive pulmonary disease",
    "mi": "myocardial infarction",
    "htn": "hypertension",
    "cns": "central nervous system",
    "cvs": "cardiovascular system"
}


def get_openai_client() -> Optional[OpenAI]:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        _client = OpenAI(api_key=api_key)
    return _client


def _cache_key(payload: Dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")).hexdigest()


def _read_cache(key: str) -> Optional[Dict[str, Any]]:
    record = _response_cache.get(key)
    if not record:
        return None
    if time.time() - record.get("stored_at", 0) > VOICE_CACHE_TTL_SECONDS:
        _response_cache.pop(key, None)
        return None
    return dict(record.get("value", {}))


def _write_cache(key: str, value: Dict[str, Any]) -> None:
    if len(_response_cache) >= VOICE_CACHE_MAX_ITEMS:
        oldest = min(_response_cache.items(), key=lambda item: item[1].get("stored_at", 0))[0]
        _response_cache.pop(oldest, None)
    _response_cache[key] = {"stored_at": time.time(), "value": dict(value)}


def _build_references(retrieval: Dict[str, Any], limit: int = 3):
    refs = retrieval.get("results", [])[:limit]
    references = []
    for r in refs:
        references.append({
            "source_id": r.get("source_id"),
            "source_type": r.get("source_type"),
            "subject": r.get("subject"),
            "topic": r.get("topic"),
            "preview": r.get("preview"),
            "score": r.get("score")
        })
    return references


def _context_confidence(references):
    top_score = 0.0
    if references:
        try:
            top_score = float(references[0].get("score") or 0.0)
        except (TypeError, ValueError):
            top_score = 0.0
    if top_score >= VOICE_MIN_CONTEXT_SCORE:
        return "high", top_score
    if top_score >= VOICE_MIN_CONTEXT_SCORE * 0.6:
        return "medium", top_score
    return "low", top_score


def _ensure_teacher_style(text: str, max_words: int = 60) -> str:
    cleaned = " ".join((text or "").strip().split())
    if not cleaned:
        return "Let's rebuild this step by step. Quick check: what is the single key clue in the stem?"
    words = cleaned.split(" ")
    if len(words) > max_words:
        cleaned = " ".join(words[:max_words]).rstrip(" ,;:")
    if "?" not in cleaned:
        cleaned = f"{cleaned} Quick check: what is the single key clue in the stem?"
    return cleaned


def _build_quality_checks(text: str, max_words: int = 95) -> Dict[str, Any]:
    words = [w for w in (text or "").split(" ") if w]
    word_count = len(words)
    has_check_question = "?" in (text or "")
    within_word_limit = word_count <= max_words
    return {
        "word_count": word_count,
        "has_check_question": has_check_question,
        "within_word_limit": within_word_limit,
        "style_passed": has_check_question and within_word_limit
    }


def _expand_medical_query(query: str):
    base = (query or "").strip().lower()
    additions = []
    for term, expansion in MEDICAL_QUERY_EXPANSIONS.items():
        if term in base.split(" ") or f"{term} " in base or f" {term}" in base:
            additions.append(expansion)
    if not additions:
        return query, []
    expanded = f"{query} {' '.join(additions)}"
    return expanded, additions


def _fallback_response(transcript: str, retrieval: Dict[str, Any], reason: str = "fallback", query_expansions=None) -> Dict[str, Any]:
    references = _build_references(retrieval, limit=3)
    confidence, top_score = _context_confidence(references)
    teacher_response = _ensure_teacher_style(
        "Good attempt. You are close, but refine the core concept in one short line and state a single discriminator clue clearly.",
        max_words=60
    )
    return {
        "teacher_response": teacher_response,
        "teaching_focus": "concept_clarity",
        "grounding_note": "Fallback mode: response generated without LLM reasoning; references are retrieval-only.",
        "used_source_ids": [ref.get("source_id") for ref in references if ref.get("source_id")],
        "context_confidence": confidence,
        "context_top_score": round(top_score, 4),
        "needs_clarification": confidence == "low",
        "query_expansions": query_expansions or [],
        "expanded_query_used": bool(query_expansions),
        "references": references,
        "used_context_count": len(references),
        "used_embeddings": retrieval.get("used_embeddings", False),
        "cache_hit": False,
        "fallback_used": True,
        "fallback_reason": reason,
        "latency_mode": "balanced",
        "quality_checks": _build_quality_checks(teacher_response, max_words=60)
    }


async def coach_voice_turn(
    transcript: str,
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    question_stem: Optional[str] = None,
    student_answer: Optional[str] = None,
    top_k: int = 5,
    latency_mode: Optional[str] = "balanced",
    conversation_history: Optional[Any] = None
) -> Dict[str, Any]:
    started = time.perf_counter()
    transcript = str(transcript or "").strip()[:1500]
    subject = str(subject).strip()[:80] if subject else None
    topic = str(topic).strip()[:120] if topic else None
    question_stem = str(question_stem).strip()[:900] if question_stem else None
    student_answer = str(student_answer).strip()[:1200] if student_answer else None
    latency_mode = str(latency_mode or "balanced").strip().lower()
    if latency_mode not in {"balanced", "fast"}:
        latency_mode = "balanced"
    normalized_history = []
    if isinstance(conversation_history, list):
        for turn in conversation_history[-8:]:
            if not isinstance(turn, dict):
                continue
            normalized_history.append({
                "student": str(turn.get("student", "")).strip()[:600],
                "teacher": str(turn.get("teacher", "")).strip()[:900]
            })
    bounded_top_k = max(1, min(int(top_k), 8))
    if latency_mode == "fast":
        bounded_top_k = min(bounded_top_k, 3)
    context_char_limit = 320 if latency_mode == "fast" else 520
    max_tokens = 120 if latency_mode == "fast" else 180
    timeout_seconds = min(VOICE_COACH_TIMEOUT_SECONDS, 8.0) if latency_mode == "fast" else VOICE_COACH_TIMEOUT_SECONDS

    cache_payload = {
        "transcript": transcript,
        "subject": subject,
        "topic": topic,
        "question_stem": question_stem,
        "student_answer": student_answer,
        "top_k": bounded_top_k,
        "latency_mode": latency_mode,
        "conversation_history": normalized_history
    }
    key = _cache_key(cache_payload)
    cached = _read_cache(key)
    if cached:
        cached["cache_hit"] = True
        cached["latency_ms"] = int((time.perf_counter() - started) * 1000)
        return cached

    query_parts = [transcript or "", student_answer or "", question_stem or ""]
    query = " ".join([p for p in query_parts if p]).strip()
    expanded_query, query_expansions = _expand_medical_query(query)
    retrieval = retrieve_relevant_context(
        query=expanded_query,
        subject=subject,
        topic=topic,
        top_k=bounded_top_k
    )

    client = get_openai_client()
    if client is None:
        result = _fallback_response(transcript, retrieval, reason="no_openai_client", query_expansions=query_expansions)
        result["latency_mode"] = latency_mode
        result["latency_ms"] = int((time.perf_counter() - started) * 1000)
        _write_cache(key, result)
        return result

    context_items = retrieval.get("results", [])[:bounded_top_k]
    context_blob = []
    ref_payload = _build_references(retrieval, limit=bounded_top_k)
    confidence, top_score = _context_confidence(ref_payload)
    if confidence == "low":
        teacher_response = _ensure_teacher_style(
            "I want to teach this accurately, so give me one extra anchor: mention the exact drug, mechanism keyword, or one line from the PYQ/textbook you are referring to.",
            max_words=95
        )
        result = {
            "teacher_response": teacher_response,
            "teaching_focus": "concept_clarity",
            "grounding_note": "Context match is weak; clarification requested before teaching to avoid incorrect guidance.",
            "used_source_ids": [ref.get("source_id") for ref in ref_payload if ref.get("source_id")],
            "context_confidence": confidence,
            "context_top_score": round(top_score, 4),
            "needs_clarification": True,
            "query_expansions": query_expansions,
            "expanded_query_used": bool(query_expansions),
            "references": ref_payload,
            "used_context_count": len(ref_payload),
            "used_embeddings": retrieval.get("used_embeddings", False),
            "cache_hit": False,
            "fallback_used": False,
            "fallback_reason": None,
            "latency_mode": latency_mode,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "quality_checks": _build_quality_checks(teacher_response, max_words=95)
        }
        _write_cache(key, result)
        return result
    for item in context_items:
        context_blob.append(
            f"[{item.get('source_id')}] {item.get('subject')} / {item.get('topic')} :: {item.get('text', '')[:context_char_limit]}"
        )

    prompt = f"""You are a voice-first NEET PG teacher.

Student transcript: {transcript}
Student answer text: {student_answer or ""}
Question stem: {question_stem or ""}
Subject: {subject or ""}
Topic: {topic or ""}
Latency mode: {latency_mode}
Recent conversation turns: {json.dumps(normalized_history, ensure_ascii=True)}

Retrieved curriculum context:
{chr(10).join(context_blob) if context_blob else "No context found"}

Return JSON:
{{
  "teacher_response": "natural spoken teacher response under 90 words",
  "teaching_focus": "one of concept_clarity|discriminator|clinical_reasoning|memory_recall|exam_strategy",
  "grounding_note": "one sentence: which PYQ/textbook clue supports this teaching point",
  "used_source_ids": ["list of source_id values from retrieved context that you actually used"]
}}

Rules:
- Sound like a real teacher speaking naturally.
- Continue from recent conversation context when present.
- Use retrieved context to ground your explanation.
- Include one short check question at the end.
- No markdown. JSON only."""

    try:
        loop = asyncio.get_event_loop()
        response_task = loop.run_in_executor(
            None,
            lambda: client.chat.completions.create(
                model=os.getenv("AI_MODEL", "gpt-4o-mini"),
                messages=[
                    {"role": "system", "content": "You are a medical teaching coach. Return JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.35,
                max_tokens=max_tokens,
                response_format={"type": "json_object"}
            )
        )
        response = await asyncio.wait_for(response_task, timeout=timeout_seconds)

        parsed = json.loads(response.choices[0].message.content.strip())
        teacher_response = _ensure_teacher_style(str(parsed.get("teacher_response", "")).strip(), max_words=95)
        if not teacher_response:
            result = _fallback_response(transcript, retrieval, reason="empty_teacher_response", query_expansions=query_expansions)
            result["latency_mode"] = latency_mode
            result["latency_ms"] = int((time.perf_counter() - started) * 1000)
            _write_cache(key, result)
            return result

        focus = str(parsed.get("teaching_focus", "concept_clarity")).strip().lower()
        if focus not in ["concept_clarity", "discriminator", "clinical_reasoning", "memory_recall", "exam_strategy"]:
            focus = "concept_clarity"

        used_source_ids = parsed.get("used_source_ids", [])
        if not isinstance(used_source_ids, list):
            used_source_ids = []
        allowed_ids = {ref.get("source_id") for ref in ref_payload if ref.get("source_id")}
        used_source_ids = [sid for sid in used_source_ids if sid in allowed_ids]
        if not used_source_ids and ref_payload:
            used_source_ids = [ref_payload[0].get("source_id")]

        grounding_note = str(parsed.get("grounding_note", "")).strip()
        if not grounding_note:
            grounding_note = "This response is grounded in the highest-ranked retrieved curriculum reference."

        result = {
            "teacher_response": teacher_response,
            "teaching_focus": focus,
            "grounding_note": grounding_note,
            "used_source_ids": used_source_ids,
            "context_confidence": confidence,
            "context_top_score": round(top_score, 4),
            "needs_clarification": False,
            "query_expansions": query_expansions,
            "expanded_query_used": bool(query_expansions),
            "references": ref_payload,
            "used_context_count": len(ref_payload),
            "used_embeddings": retrieval.get("used_embeddings", False),
            "cache_hit": False,
            "fallback_used": False,
            "fallback_reason": None,
            "latency_mode": latency_mode,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "quality_checks": _build_quality_checks(teacher_response, max_words=95)
        }
        _write_cache(key, result)
        return result
    except Exception as e:
        print(f"Voice coach error: {str(e)}")
        result = _fallback_response(transcript, retrieval, reason=e.__class__.__name__, query_expansions=query_expansions)
        result["latency_mode"] = latency_mode
        result["latency_ms"] = int((time.perf_counter() - started) * 1000)
        _write_cache(key, result)
        return result
