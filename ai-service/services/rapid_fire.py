import os
from typing import Dict, Any, Optional, List
from openai import OpenAI
import asyncio
import json

_client = None

def get_openai_client():
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        _client = OpenAI(api_key=api_key)
    return _client


async def generate_rapid_fire_questions(
    subject: str,
    topic: str,
    weak_subtopics: Optional[List[str]] = None,
    mastery_result: Optional[str] = None,
    count: int = 10
) -> Dict[str, Any]:
    client = get_openai_client()

    if not client:
        return get_fallback_questions(subject, topic, count)

    weak_info = ""
    if weak_subtopics and len(weak_subtopics) > 0:
        weak_info = f"\nThe student has identified weaknesses in: {', '.join(weak_subtopics)}. Include extra questions on these."

    mastery_info = ""
    if mastery_result:
        if mastery_result == 'mastered':
            mastery_info = "\nThe student has MASTERED this topic. Use advanced recall questions and tricky edge cases."
        elif mastery_result == 'revision_required':
            mastery_info = "\nThe student needs REVISION. Focus on high-yield core recall and common confusion points."
        else:
            mastery_info = "\nThe student needs to RELEARN core concepts. Keep questions foundational and clear."

    prompt = f"""Generate exactly {count} rapid-fire recall questions for a NEET-PG student on the topic "{topic}" in the subject "{subject}".
{weak_info}
{mastery_info}

These are quick-recall questions — each should be answerable in 5-15 seconds. They test instant recall, not reasoning.

Types of rapid-fire questions:
- One-word/one-line answers
- "Name the..." questions
- "What is the most common..." questions
- "Which drug/enzyme/receptor..." questions
- True/False statements
- Fill-in-the-blank with key values/numbers

Return JSON:
{{
  "questions": [
    {{
      "question": "What is the most common cause of X?",
      "answer": "Y",
      "hint": "Think about the mechanism of...",
      "difficulty": "easy|medium|hard",
      "subtopic": "relevant subtopic"
    }}
  ]
}}

Rules:
- Mix difficulty levels: 4 easy, 4 medium, 2 hard
- Keep questions short and punchy
- Answers must be concise (1-10 words max)
- Hints should guide without giving away the answer
- Cover different subtopics within the topic
- Return ONLY valid JSON"""

    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: client.chat.completions.create(
            model=os.getenv("AI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": "You are a NEET-PG exam expert. Generate rapid-fire recall questions. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2500,
            response_format={"type": "json_object"}
        ))

        content = response.choices[0].message.content.strip()
        result = json.loads(content)

        questions = result.get("questions", [])
        if not isinstance(questions, list) or len(questions) == 0:
            return get_fallback_questions(subject, topic, count)

        return {
            "questions": questions[:count],
            "subject": subject,
            "topic": topic,
            "total": min(len(questions), count),
            "generated": True
        }

    except Exception as e:
        print(f"Rapid-fire generation error: {str(e)}")
        return get_fallback_questions(subject, topic, count)


def get_fallback_questions(subject: str, topic: str, count: int) -> Dict:
    return {
        "questions": [
            {
                "question": f"Name the most important concept in {topic}.",
                "answer": "Refer to your study material",
                "hint": f"Think about core {subject} principles",
                "difficulty": "medium",
                "subtopic": topic
            }
        ],
        "subject": subject,
        "topic": topic,
        "total": 1,
        "generated": False
    }

