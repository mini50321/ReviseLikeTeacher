import os
import json
from openai import AsyncOpenAI

api_key = os.getenv("OPENAI_API_KEY")
client = AsyncOpenAI(api_key=api_key) if api_key else None

async def detect_integration_tags(questions: list) -> list:
    results = []
    if client is None:
        for q in questions:
            results.append({
                "question_id": q.get("id"),
                "tags": [],
                "error": "OPENAI_API_KEY not configured"
            })
        return results

    for q in questions:
        try:
            prompt = f"""Analyze this medical exam question and identify ALL cross-subject or cross-topic integration points.

Question: {q.get('stem', '')}
Subject: {q.get('subject', '')}
Topic: {q.get('topic', '')}
Subtopic: {q.get('subtopic', '')}
Options: {json.dumps(q.get('options', []))}
Correct Answer: {q.get('correct_answer', '')}

Return a JSON array of integration tags. Each tag should have:
- "linked_subjects": array of other subjects this question connects to
- "linked_topics": array of specific topics from those subjects
- "integration_type": one of "cross_subject", "cross_topic", "clinical_bridge", "mechanism_link", "pharmacology_bridge"
- "integration_label": a short descriptive label (e.g., "Physiology-Pharmacology Bridge: Beta-blockers mechanism")
- "explanation": brief explanation of the integration connection
- "difficulty_boost": "none", "moderate", or "high" based on how much the integration adds complexity

Rules:
- Only return genuine integration points, not forced connections
- "cross_subject" = connects 2+ different subjects
- "cross_topic" = connects 2+ topics within the same subject
- "clinical_bridge" = links basic science to clinical application
- "mechanism_link" = connects pathophysiology to pharmacology/treatment
- "pharmacology_bridge" = drug mechanism linking to disease pathology
- Return empty array [] if no meaningful integration exists

Return ONLY valid JSON array, no markdown."""

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a medical education expert specializing in integrated learning for NEET-PG preparation. Identify cross-subject and cross-topic connections in exam questions."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=1000
            )

            content = response.choices[0].message.content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1] if "\n" in content else content[3:]
                content = content.rsplit("```", 1)[0]

            tags = json.loads(content)
            if not isinstance(tags, list):
                tags = []

            results.append({
                "question_id": q.get("id"),
                "tags": tags
            })

        except Exception as e:
            print(f"Integration detection error for question {q.get('id')}: {str(e)}")
            results.append({
                "question_id": q.get("id"),
                "tags": [],
                "error": str(e)
            })

    return results

