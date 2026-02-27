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


async def generate_saq_anchors(
    subject: str,
    topic: str,
    count: int = 4,
    core_points: Optional[List[str]] = None,
    pyq_examples: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    count = max(1, min(int(count), 6))
    core_points = core_points or []
    pyq_examples = pyq_examples or []

    client = get_openai_client()
    if not client:
        return {
            "generated": False,
            "questions": build_fallback_anchors(subject, topic, count, core_points)
        }

    example_lines = []
    for ex in pyq_examples[:8]:
        stem = str(ex.get("stem", "")).strip()
        if stem:
            example_lines.append(f"- {stem[:220]}")

    prompt = f"""You are a NEET PG tutor generating guided short-answer anchor questions.

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
      "stem": "short-answer question text",
      "subtopic": "specific subtopic",
      "difficulty": "easy|medium|hard",
      "ideal_answer": "2-4 line model answer",
      "key_points": ["point1", "point2", "point3"],
      "yield_category": "core|frequent|occasional|rare"
    }}
  ]
}}

Rules:
- Generate exactly {count} questions.
- Keep each stem concise and exam-like.
- Prioritize high-yield NEET PG understanding, not trivia.
- Questions should collectively cover different subtopics.
- key_points must be a non-empty array.
- Output JSON only."""

    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.chat.completions.create(
                model=os.getenv("AI_MODEL", "gpt-4o-mini"),
                messages=[
                    {"role": "system", "content": "You generate medically accurate NEET PG SAQ anchors. Return JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                max_tokens=2200,
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
            key_points = q.get("key_points", [])
            if not isinstance(key_points, list):
                key_points = []
            key_points = [str(p).strip() for p in key_points if str(p).strip()]
            if len(key_points) == 0:
                key_points = [f"Core principle of {topic}"]

            difficulty = str(q.get("difficulty", "medium")).lower()
            if difficulty not in ["easy", "medium", "hard"]:
                difficulty = "medium"

            yield_category = str(q.get("yield_category", "core")).lower()
            if yield_category not in ["core", "frequent", "occasional", "rare"]:
                yield_category = "core"

            normalized.append({
                "stem": stem,
                "subtopic": str(q.get("subtopic", topic)).strip() or topic,
                "difficulty": difficulty,
                "ideal_answer": str(q.get("ideal_answer", "")).strip() or f"Explain the key mechanism and high-yield clues for {topic}.",
                "key_points": key_points[:6],
                "yield_category": yield_category
            })

        if len(normalized) < count:
            fallback = build_fallback_anchors(subject, topic, count - len(normalized), core_points)
            normalized.extend(fallback)

        return {"generated": True, "questions": normalized[:count]}
    except Exception as e:
        print(f"SAQ anchor generation error: {str(e)}")
        return {
            "generated": False,
            "questions": build_fallback_anchors(subject, topic, count, core_points)
        }


def build_fallback_anchors(subject: str, topic: str, count: int, core_points: List[str]) -> List[Dict[str, Any]]:
    seeds = core_points[:]
    if len(seeds) == 0:
        seeds = [
            f"Definition and clinical relevance of {topic}",
            f"Core mechanism in {topic}",
            f"Common differentiators in {topic}",
            f"High-yield pitfalls in {topic}"
        ]

    output = []
    for i in range(count):
        focus = seeds[i % len(seeds)]
        output.append({
            "stem": f"In {subject}, explain: {focus}. Include one clinical clue that helps in exams.",
            "subtopic": focus[:80],
            "difficulty": "medium",
            "ideal_answer": f"A strong answer should cover {focus}, one discriminator, and one clinical application.",
            "key_points": [focus, "Most likely exam discriminator", "Clinical clue integration"],
            "yield_category": "core"
        })
    return output
