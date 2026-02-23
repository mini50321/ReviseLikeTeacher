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


async def enrich_distractor_data(
    questions: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    client = get_openai_client()

    if not client:
        return [get_fallback_enrichment(q) for q in questions]

    results = []
    batch_size = 5

    for i in range(0, len(questions), batch_size):
        batch = questions[i:i + batch_size]
        batch_results = await enrich_batch(client, batch)
        results.extend(batch_results)

    return results


async def enrich_batch(client, questions: List[Dict]) -> List[Dict]:
    questions_text = []
    for idx, q in enumerate(questions):
        q_text = f"Question {idx + 1}:\n"
        q_text += f"  ID: {q.get('id', 'unknown')}\n"
        q_text += f"  Subject: {q.get('subject', 'unknown')}\n"
        q_text += f"  Topic: {q.get('topic', 'unknown')}\n"
        q_text += f"  Subtopic: {q.get('subtopic', 'unknown')}\n"
        q_text += f"  Stem: {q.get('stem', '')}\n"
        q_text += f"  Type: {q.get('type', 'mcq')}\n"

        if q.get('options'):
            opts = q['options']
            if isinstance(opts, str):
                try:
                    opts = json.loads(opts)
                except:
                    pass
            if isinstance(opts, dict):
                for key, val in opts.items():
                    q_text += f"  Option {key}: {val}\n"

        if q.get('correct_answer'):
            q_text += f"  Correct Answer: {q['correct_answer']}\n"

        questions_text.append(q_text)

    prompt = f"""You are a NEET-PG exam analysis expert. Analyze the following medical exam questions and generate distractor intelligence data.

{chr(10).join(questions_text)}

For each question, generate the following JSON object:
{{
  "question_id": "the ID provided",
  "distractor_analysis": {{
    // For each wrong option (B, C, D if A is correct), explain:
    // "B": {{"meaning": "Why this option is tempting", "error_type": "one of: concept_missing, confusion_pair, rule_exception_failure, memory_slip, application_failure, overgeneralization, trap_susceptibility", "confused_with": "what concept this gets confused with"}},
    // Include entries for ALL wrong options.
  }},
  "concept_tags": [
    // 2-4 core medical concepts being tested
    // e.g., ["acid-base balance", "renal tubular acidosis", "urine anion gap"]
  ],
  "trap_pattern": "Description of the exam trap or trick in this question, if any. null if straightforward.",
  "error_archetype": "The primary error archetype this question targets. One of: concept_missing, confusion_pair, rule_exception_failure, memory_slip, application_failure, overgeneralization, trap_susceptibility"
}}

Return a JSON object with key "enrichments" containing an array of enrichment objects, one per question.

Rules:
- Be specific about WHY each distractor is tempting.
- Error types must be from the specified list.
- Concept tags should be medical concepts, not generic terms.
- Return ONLY valid JSON."""

    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: client.chat.completions.create(
            model=os.getenv("AI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": "You are a NEET-PG exam analysis expert. Always return valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.5,
            max_tokens=4000,
            response_format={"type": "json_object"}
        ))

        content = response.choices[0].message.content.strip()
        result = json.loads(content)

        enrichments = result.get("enrichments", [])
        if not isinstance(enrichments, list):
            enrichments = []

        final = []
        for idx, q in enumerate(questions):
            if idx < len(enrichments):
                e = enrichments[idx]
                e["question_id"] = q.get("id", "unknown")
                e["enriched"] = True
                final.append(e)
            else:
                final.append(get_fallback_enrichment(q))

        return final

    except Exception as e:
        print(f"Distractor enrichment batch error: {str(e)}")
        return [get_fallback_enrichment(q) for q in questions]


def get_fallback_enrichment(question: Dict) -> Dict:
    return {
        "question_id": question.get("id", "unknown"),
        "distractor_analysis": {},
        "concept_tags": [question.get("subtopic") or question.get("topic") or "general"],
        "trap_pattern": None,
        "error_archetype": "concept_missing",
        "enriched": False
    }

