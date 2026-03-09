import os
import json
import asyncio
from typing import Dict, Any
from services.transcription import get_openai_client


async def build_concept_map_from_text(
    subject: str,
    topic: str,
    text: str,
    max_concepts: int = 6
) -> Dict[str, Any]:
    client = get_openai_client()

    if not client or not text or not str(text).strip():
        return {"concepts": []}

    try:
        max_chars = int(os.getenv("CONCEPT_BUILDER_MAX_TEXT", "12000"))
        snippet = str(text)[:max_chars]
        safe_max_concepts = max(1, min(int(max_concepts or 6), 12))

        prompt = f"""You are a NEET PG educator designing a concept map for one chapter.

Subject: {subject}
Topic: {topic}

Below is text extracted from the chapter. Use it to propose high‑yield concepts and their checkpoints.

===== CHAPTER TEXT (TRUNCATED) =====
{snippet}
===== END TEXT =====

Return JSON with this shape:
{{
  "concepts": [
    {{
      "concept_key": "short_slug_for_concept",
      "name": "Human‑readable concept name",
      "section": "optional section name or null",
      "chapter": "chapter heading or null",
      "main_topic": "{topic}",
      "subtopic": "smaller focus inside topic or null",
      "must_know_points": ["bullet1", "bullet2", "..."],
      "deep_points": ["deeper mechanism or application points"] ,
      "traps": ["common confusions or exam traps"],
      "leading_questions": [
        {{"tier": 1, "prompt": "easy Socratic starter question"}},
        {{"tier": 2, "prompt": "medium guidance question"}},
        {{"tier": 3, "prompt": "stronger hint question"}},
        {{"tier": 4, "prompt": "almost reveals the answer"}}
      ],
      "grading_rubric": [
        {{
          "id": "short_id_like_eac",
          "label": "External auditory canal",
          "description": "What the student must state for this checkpoint",
          "example_phrases": ["external auditory canal", "ear canal", "EAC"],
          "tier": "must_know"
        }}
      ],
      "micro_questions": [
        "Very short recall question tied to this concept"
      ]
    }}
  ]
}}

Rules:
- Propose at most {safe_max_concepts} concepts.
- Use short, URL‑safe strings for concept_key (e.g. hearing_pathway, rinne_test).
- grading_rubric should usually have 4‑10 items per concept.
- example_phrases must help text‑matching; include synonyms and abbreviations.
- tier is "must_know" for core points and "deep" for advanced ones.
- leading_questions and micro_questions should be concise and exam‑relevant.
- Do NOT invent content unrelated to the chapter text.
- Always return valid JSON only, no markdown.
"""

        loop = asyncio.get_event_loop()

        def call_openai():
            return client.chat.completions.create(
                model=os.getenv("AI_MODEL", "gpt-4o-mini"),
                messages=[
                    {
                        "role": "system",
                        "content": "You are a NEET PG concept‑map designer. Always respond with a single JSON object."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                max_tokens=4096,
                response_format={"type": "json_object"}
            )

        response = await loop.run_in_executor(None, call_openai)
        content = response.choices[0].message.content.strip()
        result = json.loads(content)

        concepts = result.get("concepts", [])
        if not isinstance(concepts, list):
            concepts = []

        return {
            "concepts": concepts[:safe_max_concepts],
            "subject": subject,
            "topic": topic,
            "generated": True,
            "model": os.getenv("AI_MODEL", "gpt-4o-mini")
        }

    except json.JSONDecodeError as e:
        print(f"Concept builder JSON parse error: {str(e)}")
        return {"concepts": [], "subject": subject, "topic": topic, "generated": False}
    except Exception as e:
        print(f"Concept builder error: {str(e)}")
        return {"concepts": [], "subject": subject, "topic": topic, "generated": False}

