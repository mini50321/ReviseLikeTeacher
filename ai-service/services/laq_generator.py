import os
import json
from openai import AsyncOpenAI

api_key = os.getenv("OPENAI_API_KEY")
client = AsyncOpenAI(api_key=api_key) if api_key else None


async def generate_laq_vignette(subject: str, topic: str, high_yield_concepts: list, pyq_traps: list = None, difficulty: str = "medium"):
    if client is None:
        raise RuntimeError("OPENAI_API_KEY not configured")
    trap_context = ""
    if pyq_traps and len(pyq_traps) > 0:
        trap_context = f"\nDistractor traps observed in PYQs for this topic:\n{json.dumps(pyq_traps[:10])}"

    concepts_text = ", ".join(high_yield_concepts[:5]) if high_yield_concepts else topic

    prompt = f"""Generate a clinical integration LAQ (Long Answer Question) for NEET-PG preparation.

Subject: {subject}
Topic: {topic}
High-yield concepts to integrate: {concepts_text}
Difficulty: {difficulty}
{trap_context}

Rules (from Document 3, Section 5):
1. Combine 2-3 high-yield concepts into ONE clinical vignette
2. The question must ask: diagnosis + mechanism + next step
3. Mimic NEET-PG framing style
4. Use distractor traps observed in PYQs
5. The vignette should test APPLICATION, not recall

Generate a JSON object with:
- "vignette": Clinical scenario text (patient presentation, labs, imaging - 4-6 sentences)
- "questions": Array of 3 sub-questions:
  1. "What is the most likely diagnosis? Explain the pathophysiology."
  2. A mechanism/differentiation question linking the integrated concepts
  3. "What is the next best step in management? Justify."
- "model_answers": Array of 3 model answers (2-4 sentences each)
- "key_concepts_tested": Array of concepts being tested
- "integrated_topics": Array of the topics/subtopics being combined
- "clinical_pearls": Array of 2-3 high-yield clinical pearls
- "common_mistakes": Array of 2-3 common mistakes students make
- "trap_elements": Array of trap elements embedded in the vignette
- "difficulty": "easy", "medium", or "hard"

Return ONLY valid JSON, no markdown."""

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a senior medical educator creating NEET-PG clinical integration questions. Your vignettes must combine multiple high-yield concepts into realistic clinical scenarios that test deep understanding, not memorization."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.4,
        max_tokens=1500
    )

    content = response.choices[0].message.content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        content = content.rsplit("```", 1)[0]

    return json.loads(content)


async def generate_laq_batch(items: list):
    results = []
    for item in items:
        try:
            result = await generate_laq_vignette(
                subject=item.get("subject", ""),
                topic=item.get("topic", ""),
                high_yield_concepts=item.get("high_yield_concepts", []),
                pyq_traps=item.get("pyq_traps", []),
                difficulty=item.get("difficulty", "medium")
            )
            results.append({
                "subject": item.get("subject"),
                "topic": item.get("topic"),
                "success": True,
                **result
            })
        except Exception as e:
            print(f"LAQ generation error for {item.get('topic')}: {str(e)}")
            results.append({
                "subject": item.get("subject"),
                "topic": item.get("topic"),
                "success": False,
                "error": str(e)
            })
    return results

