import os
from typing import Dict, Any, Optional
from openai import OpenAI
import asyncio

_client = None

def get_openai_client():
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        _client = OpenAI(api_key=api_key)
    return _client

def _format_training_examples_for_prompt(training_examples: list) -> str:
    """Extract tutor responses from training examples to use as few-shot style cues."""
    if not training_examples:
        return ""
    blocks = []
    for ex in training_examples[:3]:  # max 3 examples
        if isinstance(ex, dict):
            messages = ex.get("messages") or []
        elif isinstance(ex, list):
            messages = ex
        else:
            continue
        if not isinstance(messages, list) or len(messages) < 4:
            continue
        # Extract assistant responses that follow user answers (tutor replies)
        for j in range(1, len(messages)):
            m = messages[j] or {}
            prev = messages[j - 1] or {}
            if m.get("role") == "assistant" and prev.get("role") == "user":
                content = (m.get("content") or "").strip()
                if len(content) > 30:
                    block = "---\nTutor response example:\n" + (content[:500] if len(content) > 500 else content)
                    blocks.append(block)
                    break  # one tutor response per example
    if not blocks:
        return ""
    return "\n\nExample tutor responses (match this Socratic style in your teacher_response):\n" + "\n".join(blocks) + "\n\n---\n"


async def evaluate_answer(
    question: Dict[str, Any],
    student_answer: str,
    current_mastery: float = 0.0,
    user_id: Optional[str] = None,
    training_examples: Optional[list] = None
) -> Dict[str, Any]:
    client = get_openai_client()
    
    if not client:
        ideal_answer = question.get("ideal_answer", "")
        return get_fallback_evaluation(question, student_answer, ideal_answer)
    
    try:
        
        question_stem = question.get("stem", "")
        ideal_answer = question.get("ideal_answer", "")
        key_points = question.get("key_points", [])
        topic = question.get("topic", "")
        subject = question.get("subject", "")
        subtopic = question.get("subtopic") or ""
        difficulty = question.get("difficulty", "medium")
        importance = question.get("importance") or ""
        yield_category = question.get("yield_category") or ""
        concept_tags = question.get("concept_tags") or []
        trap_pattern = question.get("trap_pattern") or ""

        if isinstance(key_points, str):
            try:
                import json
                key_points = json.loads(key_points)
            except Exception:
                key_points = []
        if not isinstance(key_points, list):
            key_points = []
        if isinstance(concept_tags, str):
            try:
                import json
                concept_tags = json.loads(concept_tags) if concept_tags.strip() else []
            except Exception:
                concept_tags = []
        if not isinstance(concept_tags, list):
            concept_tags = []

        training_examples = training_examples or []
        examples_block = _format_training_examples_for_prompt(training_examples)

        key_points_text = "\n".join([f"- {point}" for point in key_points]) if key_points else "Not specified"
        concept_tags_text = ", ".join(concept_tags) if concept_tags else "Not specified"
        context_parts = [f"Subject: {subject}", f"Topic: {topic}"]
        if subtopic:
            context_parts.append(f"Subtopic: {subtopic}")
        if importance:
            context_parts.append(f"Importance: {importance}")
        if yield_category:
            context_parts.append(f"Yield: {yield_category}")
        if trap_pattern:
            context_parts.append(f"Common trap: {trap_pattern}")
        context_block = "\n".join(context_parts)

        prompt = f"""You are a warm, Socratic NEET PG tutor in an interactive one-on-one session. Infer the student's competency from their answer alone; do not assume or ask about topic choice. Guide the student step-by-step to the answer, not just state it. Do not offer topic choices or declare mastery prematurely.
{examples_block}

Question: {question_stem}

Teaching context (use this to tailor your hints and quick-check question):
{context_block}
Concept tags: {concept_tags_text}
Difficulty: {difficulty}

Key Points to Cover:
{key_points_text}

Ideal Answer: {ideal_answer}

Student's Answer: {student_answer}

Evaluate the student's answer and provide:
1. A score from 0-100
2. Structured feedback (strengths, improvements, model_explanation)
3. A "teacher_response" — this is the most important part. It must feel like active teaching, not a passive explanation, and should show the path to the answer.

For non-MCQ style questions (type not in ["mcq", "true_false", "assertion_reason"]), you MUST NOT reveal the exact missing terms directly in strengths, improvements, or teacher_response. Instead, guide the student with questions.

For teacher_response, follow this exact flow in one natural paragraph:
- First 1 short sentence: acknowledge what the student did well.
- Next 1 short sentence: name the biggest gap or misconception in general terms (e.g., "you skipped an important middle-ear step") WITHOUT naming the exact missing structures or terms.
- Next 2-3 short sentences: walk the student through the key reasoning steps needed to reach the answer, in simple, high-yield language (focus on how to think, not just what the answer is). Use indirect hints (e.g., "after the external auditory canal, sound hits a thin membrane before the ossicles") without saying the term.
- Final 1 short sentence: ask a concrete quick check question the student can answer in one line, which forces them to name the missing structure or fact themselves.

Rules:
- Keep it under 140 words.
- Use direct second-person language ("you").
- Be warm, specific, and encouraging.
- Do not use bullet points or markdown.
- Do not just repeat the ideal answer verbatim.
- Avoid simply giving a full final answer sentence; instead, emphasize the reasoning steps and let the quick check question pull the answer from the student.
- In strengths and improvements, do not list missing terms explicitly for non-MCQ questions; describe them generically so that only model_explanation (which may be shown later) contains the full answer.

Respond in JSON format:
{{
    "score": <number 0-100>,
    "feedback": {{
        "strengths": "<text>",
        "improvements": "<text>",
        "model_explanation": "<text>"
    }},
    "teacher_response": "<natural conversational teacher response>"
}}"""

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a Socratic NEET PG tutor and evaluator. Infer competency from answers. Prioritize active teaching with hints and short check questions, not topic choice. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.4,
                max_tokens=800
            )
        )
        
        import json
        content = response.choices[0].message.content.strip()
        
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()
        
        result = json.loads(content)
        
        score = max(0, min(100, int(result.get("score", 50))))
        
        feedback = result.get("feedback", {})
        if not isinstance(feedback, dict):
            feedback = {
                "strengths": "Thank you for your answer.",
                "improvements": "Keep practicing to improve.",
                "model_explanation": ideal_answer or "Review the topic for a complete answer."
            }
        
        teacher_response = result.get("teacher_response", "")
        if not teacher_response:
            teacher_response = "You made a good attempt. Your main gap is missing key concepts from this topic. In one short line, state the core mechanism and a single clinical clue."

        mastery_delta = calculate_mastery_delta(score, current_mastery, difficulty)

        return {
            "score": score,
            "feedback": {
                "strengths": feedback.get("strengths", "Thank you for your answer."),
                "improvements": feedback.get("improvements", "Keep practicing to improve."),
                "model_explanation": feedback.get("model_explanation", ideal_answer or "Review the topic for a complete answer.")
            },
            "teacher_response": teacher_response,
            "mastery_impact": {
                "delta": mastery_delta
            }
        }
        
    except Exception as e:
        print(f"OpenAI evaluation error: {str(e)}")
        ideal_answer = question.get("ideal_answer", "")
        return get_fallback_evaluation(question, student_answer, ideal_answer)

def calculate_mastery_delta(score: float, current_mastery: float, difficulty: str) -> float:
    base_delta = (score / 100) * 0.15
    
    difficulty_multiplier = {
        "easy": 0.8,
        "medium": 1.0,
        "hard": 1.2
    }
    
    multiplier = difficulty_multiplier.get(difficulty.lower(), 1.0)
    
    if current_mastery > 80:
        multiplier *= 0.5
    elif current_mastery < 30:
        multiplier *= 1.5
    
    delta = base_delta * multiplier
    
    if score < 40:
        delta *= -0.5
    
    return round(delta, 3)

def get_fallback_evaluation(question: Dict[str, Any], student_answer: str, ideal_answer: str) -> Dict[str, Any]:
    answer_length = len(student_answer)
    ideal_length = len(ideal_answer) if ideal_answer else 100
    
    if answer_length < 10:
        score = 20
    elif answer_length < ideal_length * 0.3:
        score = 40
    elif answer_length < ideal_length * 0.6:
        score = 60
    else:
        score = 70
    
    return {
        "score": score,
        "feedback": {
            "strengths": "Thank you for your answer.",
            "improvements": "Keep practicing to improve your answer quality.",
            "model_explanation": ideal_answer or "Review the topic for a complete answer."
        },
        "teacher_response": "You made a sincere attempt. The main gap is incomplete concept recall. Review the core idea and connect it to one clinical clue. What is the single most important takeaway from this topic?",
        "mastery_impact": {
            "delta": (score / 100) * 0.1
        }
    }


async def evaluate_quick_check(
    question: Dict[str, Any],
    original_answer: str,
    teacher_response: str,
    quick_check_answer: str
) -> Dict[str, Any]:
    client = get_openai_client()
    ideal_answer = question.get("ideal_answer", "")

    if not client:
        return {
            "understanding_level": "partial",
            "follow_up": "Good effort. You are close; refine the discriminator concept and answer it in just one short line.",
            "can_proceed": True
        }

    try:
        stem = question.get("stem", "")
        topic = question.get("topic", "")
        subject = question.get("subject", "")
        prompt = f"""You are a NEET PG tutor evaluating the student's response to a quick-check follow-up question.

Question stem: {stem}
Subject: {subject}
Topic: {topic}
Ideal answer: {ideal_answer}
Student original answer: {original_answer}
Teacher quick-check prompt context: {teacher_response}
Student quick-check reply: {quick_check_answer}

Return JSON:
{{
  "understanding_level": "strong|partial|weak",
  "follow_up": "1-2 short sentences: acknowledge, correct, then one actionable tip",
  "can_proceed": true
}}

Rules:
- Keep follow_up under 80 words.
- Be direct and encouraging.
- Focus on one correction only.
- Return valid JSON only."""

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are an expert tutor. Return JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=220,
                response_format={"type": "json_object"}
            )
        )

        import json
        content = response.choices[0].message.content.strip()
        result = json.loads(content)

        level = str(result.get("understanding_level", "partial")).lower()
        if level not in ["strong", "partial", "weak"]:
            level = "partial"
        follow_up = str(result.get("follow_up", "")).strip()
        if not follow_up:
            follow_up = "Good effort. Refine the key discriminator and try to state the concept in one precise line."

        return {
            "understanding_level": level,
            "follow_up": follow_up,
            "can_proceed": True
        }
    except Exception as e:
        print(f"Quick-check evaluation error: {str(e)}")
        return {
            "understanding_level": "partial",
            "follow_up": "Good effort. Refine the key discriminator and try to state the concept in one precise line.",
            "can_proceed": True
        }

