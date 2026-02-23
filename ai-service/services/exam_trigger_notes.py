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


async def generate_exam_trigger_notes(
    subject: str,
    topic: str,
    weak_subtopics: Optional[List[str]] = None,
    mastery_status: Optional[str] = None,
    mcq_accuracy: Optional[float] = None,
    core_coverage: Optional[float] = None,
    misconceptions: Optional[List[str]] = None
) -> Dict[str, Any]:
    client = get_openai_client()

    if not client:
        return get_fallback_notes(subject, topic)

    try:
        context_parts = [
            f"Subject: {subject}",
            f"Topic: {topic}"
        ]
        if mastery_status:
            context_parts.append(f"Student mastery status: {mastery_status}")
        if mcq_accuracy is not None:
            context_parts.append(f"MCQ accuracy: {mcq_accuracy}%")
        if core_coverage is not None:
            context_parts.append(f"Core coverage: {core_coverage}%")
        if weak_subtopics:
            context_parts.append(f"Weak subtopics: {', '.join(weak_subtopics)}")
        if misconceptions:
            context_parts.append(f"Key misconceptions identified: {', '.join(misconceptions)}")

        context = "\n".join(context_parts)

        prompt = f"""You are a NEET-PG exam preparation expert. Generate Exam Trigger Notes for a medical student.

{context}

Generate the following in JSON format:
{{
  "trigger_lines": [
    // Exactly 15 high-yield exam trigger lines for this topic.
    // Each line should be a concise, memorable statement that captures a key exam-worthy fact.
    // Focus on frequently tested concepts, classic associations, and must-know facts.
    // Format: short, punchy statements that trigger full concept recall.
  ],
  "differentiation_table": [
    // A high-yield differentiation/comparison table.
    // Each entry is an object with "feature", "entity_a", "entity_b" (and optionally "entity_c").
    // Choose the most commonly confused or compared entities in this topic.
    // Include 6-10 comparison points.
  ],
  "recall_bullets": [
    // Exactly 5 last-minute rapid recall bullets.
    // These are the absolute must-know points that a student should review in the last 5 minutes before an exam.
    // Each should be a single high-impact statement.
  ]
}}

Rules:
- All content must be medically accurate and NEET-PG relevant.
- Focus on PYQ patterns and high-yield facts.
- Trigger lines should be unique, not repetitive.
- Differentiation table should compare the most commonly confused entities.
- Recall bullets should be the absolute highest yield.
- If weak subtopics or misconceptions are provided, ensure those areas are addressed.
- Return ONLY valid JSON, no markdown or extra text."""

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: client.chat.completions.create(
            model=os.getenv("AI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": "You are a NEET-PG exam preparation expert. Always return valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=3000,
            response_format={"type": "json_object"}
        ))

        content = response.choices[0].message.content.strip()
        result = json.loads(content)

        trigger_lines = result.get("trigger_lines", [])
        diff_table = result.get("differentiation_table", [])
        recall_bullets = result.get("recall_bullets", [])

        if not isinstance(trigger_lines, list):
            trigger_lines = []
        if not isinstance(diff_table, list):
            diff_table = []
        if not isinstance(recall_bullets, list):
            recall_bullets = []

        return {
            "trigger_lines": trigger_lines[:15],
            "differentiation_table": diff_table[:10],
            "recall_bullets": recall_bullets[:5],
            "generated": True,
            "model": os.getenv("AI_MODEL", "gpt-4o-mini")
        }

    except json.JSONDecodeError as e:
        print(f"JSON parse error in exam trigger notes: {str(e)}")
        return get_fallback_notes(subject, topic)
    except Exception as e:
        print(f"Exam trigger notes generation error: {str(e)}")
        return get_fallback_notes(subject, topic)


def get_fallback_notes(subject: str, topic: str) -> Dict[str, Any]:
    return {
        "trigger_lines": [
            f"Review core concepts of {topic} in {subject}.",
            f"Focus on high-yield differentiations in {topic}.",
            f"Remember classic clinical presentations for {topic}.",
            f"Revise drug of choice and treatment protocols for {topic}.",
            f"Study investigation of choice for {topic} conditions.",
            f"Know the pathophysiology flowchart for {topic}.",
            f"Review epidemiology and risk factors for {topic}.",
            f"Memorize key lab values and normal ranges for {topic}.",
            f"Understand the staging/grading systems in {topic}.",
            f"Revise surgical approaches relevant to {topic}.",
            f"Know the genetics and inheritance patterns in {topic}.",
            f"Study radiological findings specific to {topic}.",
            f"Review complications and prognosis for {topic}.",
            f"Understand the mechanism of action of drugs used in {topic}.",
            f"Revise recent guidelines and updates for {topic}."
        ],
        "differentiation_table": [
            {"feature": "Key characteristic", "entity_a": f"{topic} Type A", "entity_b": f"{topic} Type B"},
            {"feature": "Etiology", "entity_a": "Primary", "entity_b": "Secondary"},
            {"feature": "Presentation", "entity_a": "Acute", "entity_b": "Chronic"},
            {"feature": "Investigation", "entity_a": "Gold standard", "entity_b": "Screening"},
            {"feature": "Treatment", "entity_a": "Medical", "entity_b": "Surgical"}
        ],
        "recall_bullets": [
            f"Most common cause of {topic}: review high-yield association.",
            f"Drug of choice for {topic}: confirm first-line treatment.",
            f"Investigation of choice: know the gold standard test.",
            f"Classic triad/tetrad associated with {topic}.",
            f"Key differentiating feature from similar conditions."
        ],
        "generated": False,
        "model": "fallback"
    }

