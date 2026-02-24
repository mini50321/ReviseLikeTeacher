import os
import json
from openai import AsyncOpenAI

api_key = os.getenv("OPENAI_API_KEY")
client = AsyncOpenAI(api_key=api_key) if api_key else None

async def convert_mcqs_to_saqs(questions: list) -> list:
    results = []
    if client is None:
        for q in questions:
            results.append({
                "source_question_id": q.get("id"),
                "success": False,
                "error": "OPENAI_API_KEY not configured"
            })
        return results

    for q in questions:
        try:
            prompt = f"""Convert this MCQ into a diagnostic SAQ (Short Answer Question) for NEET-PG preparation.

Original MCQ:
Stem: {q.get('stem', '')}
Options: {json.dumps(q.get('options', []))}
Correct Answer: {q.get('correct_answer', '')}
Subject: {q.get('subject', '')}
Topic: {q.get('topic', '')}
Subtopic: {q.get('subtopic', '')}

Conversion Rules:
1. Identify the CORE CONCEPT being tested in this MCQ
2. Remove all options
3. Convert into a "Why / Differentiate / Explain mechanism" format
4. Ensure the SAQ tests REASONING, not recall
5. The question should be answerable in 2-4 sentences
6. Keep it conceptual and clinically relevant

Return a JSON object with:
- "saq_stem": The converted SAQ question text
- "core_concept": The fundamental concept being tested
- "ideal_answer": A model answer (2-4 sentences)
- "key_points": Array of 2-4 key points the answer should contain
- "cognitive_level": One of "conceptual", "application", "analysis"
- "conversion_type": One of "why_question", "differentiation", "mechanism", "clinical_reasoning", "explain"
- "difficulty": "easy", "medium", or "hard"

Return ONLY valid JSON, no markdown."""

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a medical education expert who converts MCQs into conceptual short-answer questions for NEET-PG diagnostic assessments. Focus on testing reasoning over recall."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=800
            )

            content = response.choices[0].message.content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1] if "\n" in content else content[3:]
                content = content.rsplit("```", 1)[0]

            saq_data = json.loads(content)

            results.append({
                "source_question_id": q.get("id"),
                "success": True,
                **saq_data
            })

        except Exception as e:
            print(f"MCQ-to-SAQ conversion error for {q.get('id')}: {str(e)}")
            results.append({
                "source_question_id": q.get("id"),
                "success": False,
                "error": str(e)
            })

    return results

