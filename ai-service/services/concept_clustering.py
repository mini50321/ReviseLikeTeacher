import os
import json
from openai import AsyncOpenAI

api_key = os.getenv("OPENAI_API_KEY")
client = AsyncOpenAI(api_key=api_key) if api_key else None

async def detect_concept_clusters(questions: list) -> list:
    if not questions:
        return []
    if client is None:
        return []

    questions_text = ""
    for i, q in enumerate(questions):
        years = q.get("previous_year_tags", "")
        questions_text += f"\n[Q{i+1}] ID: {q.get('id')}\nStem: {q.get('stem', '')}\nSubject: {q.get('subject', '')}\nTopic: {q.get('topic', '')}\nSubtopic: {q.get('subtopic', '')}\nYear Tags: {years}\nOptions: {json.dumps(q.get('options', []))}\nCorrect: {q.get('correct_answer', '')}\n---"

    prompt = f"""Analyze these medical exam questions and identify CONCEPT CLUSTERS — groups of questions that test the SAME underlying concept but are framed differently.

Questions:
{questions_text}

For each cluster found, return:
- "cluster_name": A descriptive name for this concept cluster
- "core_concept": The fundamental concept being tested across all questions in this cluster
- "question_ids": Array of question IDs that belong to this cluster
- "framing_variants": Array of strings describing how each question frames the same concept differently (e.g., "Direct recall", "Clinical scenario", "Negative framing", "Comparative", "Mechanism-based")
- "concept_summary": A brief summary explaining why these questions test the same concept
- "subject": The primary subject
- "topic": The primary topic
- "subtopic": The subtopic if applicable

Rules:
- A cluster must have at least 2 questions
- Questions can belong to multiple clusters if they test overlapping concepts
- Focus on conceptual similarity, not just keyword matching
- Identify different framing styles (direct vs clinical vs negative vs comparative)
- Only return genuine clusters, not forced groupings

Return ONLY a valid JSON array of clusters. No markdown."""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a medical education expert specializing in question analysis for NEET-PG. You identify when different questions test the same underlying concept using different framings."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=2000
        )

        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            content = content.rsplit("```", 1)[0]

        clusters = json.loads(content)
        if not isinstance(clusters, list):
            clusters = []

        return clusters

    except Exception as e:
        print(f"Concept clustering error: {str(e)}")
        return []

