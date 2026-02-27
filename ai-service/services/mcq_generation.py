import os
import json
import asyncio
from typing import Dict, Any, List, Optional
from openai import OpenAI

_client = None


def get_openai_client():
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        _client = OpenAI(api_key=api_key)
    return _client


def normalize_options(options: Any) -> Dict[str, str]:
    if isinstance(options, dict):
        out = {}
        for key in ["A", "B", "C", "D"]:
            value = str(options.get(key, "")).strip()
            out[key] = value
        return out
    if isinstance(options, list):
        labels = ["A", "B", "C", "D"]
        out = {}
        for i, label in enumerate(labels):
            out[label] = str(options[i]).strip() if i < len(options) else ""
        return out
    return {"A": "", "B": "", "C": "", "D": ""}


async def generate_mcq_items(
    subject: str,
    topic: str,
    count: int = 4,
    core_points: Optional[List[str]] = None,
    pyq_examples: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    count = max(1, min(int(count), 8))
    core_points = core_points or []
    pyq_examples = pyq_examples or []

    client = get_openai_client()
    if not client:
        return {"generated": False, "questions": build_fallback_mcqs(subject, topic, count, core_points)}

    example_lines = []
    for ex in pyq_examples[:8]:
        stem = str(ex.get("stem", "")).strip()
        if stem:
            example_lines.append(f"- {stem[:220]}")

    prompt = f"""You are a NEET PG tutor generating high-quality MCQs for mixed teaching practice.

Subject: {subject}
Topic: {topic}
Target count: {count}
Core points to cover: {json.dumps(core_points[:12], ensure_ascii=True)}
Previous-year style examples:
{chr(10).join(example_lines) if example_lines else "- None provided"}

Return ONLY valid JSON object:
{{
  "questions": [
    {{
      "stem": "single best answer MCQ stem",
      "subtopic": "specific subtopic",
      "difficulty": "easy|medium|hard",
      "options": {{"A":"", "B":"", "C":"", "D":""}},
      "correct_answer": "A|B|C|D",
      "ideal_answer": "1-3 line explanation of why correct option is best",
      "key_points": ["point1","point2","point3"],
      "yield_category": "core|frequent|occasional|rare"
    }}
  ]
}}

Rules:
- Generate exactly {count} MCQs.
- Each question must have four options A-D with one best answer.
- Keep distractors plausible and educational.
- Cover different subtopics across the set.
- Output JSON only."""

    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.chat.completions.create(
                model=os.getenv("AI_MODEL", "gpt-4o-mini"),
                messages=[
                    {"role": "system", "content": "You generate medically accurate NEET PG MCQs. Return JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                max_tokens=2800,
                response_format={"type": "json_object"}
            )
        )

        content = response.choices[0].message.content.strip()
        parsed = json.loads(content)
        questions = parsed.get("questions", [])
        if not isinstance(questions, list):
            questions = []

        normalized = []
        for q in questions[:count]:
            if not isinstance(q, dict):
                continue
            stem = str(q.get("stem", "")).strip()
            if not stem:
                continue
            difficulty = str(q.get("difficulty", "medium")).lower()
            if difficulty not in ["easy", "medium", "hard"]:
                difficulty = "medium"
            options = normalize_options(q.get("options"))
            if any(not options[k] for k in ["A", "B", "C", "D"]):
                continue
            correct_answer = str(q.get("correct_answer", "A")).strip().upper()
            if correct_answer not in ["A", "B", "C", "D"]:
                correct_answer = "A"
            key_points = q.get("key_points", [])
            if not isinstance(key_points, list):
                key_points = []
            key_points = [str(p).strip() for p in key_points if str(p).strip()]
            if len(key_points) == 0:
                key_points = [f"Core concept of {topic}"]
            yield_category = str(q.get("yield_category", "core")).lower()
            if yield_category not in ["core", "frequent", "occasional", "rare"]:
                yield_category = "core"

            normalized.append({
                "stem": stem,
                "subtopic": str(q.get("subtopic", topic)).strip() or topic,
                "difficulty": difficulty,
                "options": options,
                "correct_answer": correct_answer,
                "ideal_answer": str(q.get("ideal_answer", "")).strip() or f"{options[correct_answer]} is the best answer for this stem.",
                "key_points": key_points[:6],
                "yield_category": yield_category
            })

        if len(normalized) < count:
            normalized.extend(build_fallback_mcqs(subject, topic, count - len(normalized), core_points))

        return {"generated": True, "questions": normalized[:count]}
    except Exception as e:
        print(f"MCQ generation error: {str(e)}")
        return {"generated": False, "questions": build_fallback_mcqs(subject, topic, count, core_points)}


def build_fallback_mcqs(subject: str, topic: str, count: int, core_points: List[str]) -> List[Dict[str, Any]]:
    seeds = core_points[:] if core_points else [
        f"core mechanism in {topic}",
        f"common clinical clue in {topic}",
        f"most tested differentiator in {topic}",
        f"high-yield trap in {topic}"
    ]

    out = []
    for i in range(count):
        focus = seeds[i % len(seeds)]
        options = {
            "A": f"Primary concept directly related to {focus}",
            "B": f"Commonly confused but incorrect concept for {focus}",
            "C": f"Partially true but less likely concept for {focus}",
            "D": f"Irrelevant or low-priority concept for {focus}"
        }
        out.append({
            "stem": f"In {subject}, which option best explains {focus} for {topic}?",
            "subtopic": focus[:80],
            "difficulty": "medium",
            "options": options,
            "correct_answer": "A",
            "ideal_answer": f"Option A is most consistent with {focus}.",
            "key_points": [focus, "discriminator clue", "avoid common trap"],
            "yield_category": "core"
        })
    return out
