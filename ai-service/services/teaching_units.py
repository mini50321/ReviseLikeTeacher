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


async def generate_teaching_unit(
    subject: str,
    topic: str,
    subtopics: Optional[List[str]] = None,
    weak_areas: Optional[List[str]] = None,
    pyq_data: Optional[List[Dict]] = None
) -> Dict[str, Any]:
    client = get_openai_client()

    if not client:
        return get_fallback_teaching_unit(subject, topic)

    try:
        context_parts = [
            f"Subject: {subject}",
            f"Topic: {topic}"
        ]
        if subtopics:
            context_parts.append(f"Key subtopics: {', '.join(subtopics)}")
        if weak_areas:
            context_parts.append(f"Student weak areas: {', '.join(weak_areas)}")
        if pyq_data:
            pyq_summary = []
            for q in pyq_data[:10]:
                pyq_summary.append(f"- {q.get('subtopic', 'General')}: {q.get('stem', '')[:100]}")
            context_parts.append(f"Sample PYQs from this topic:\n" + "\n".join(pyq_summary))

        context = "\n".join(context_parts)

        prompt = f"""You are a NEET-PG exam preparation expert and medical educator. Generate a comprehensive Teaching Unit for the following topic.

{context}

Generate the following in JSON format:
{{
  "concept_core_block": [
    // 8-12 core concept entries. Each entry is an object with:
    // "title": short concept name
    // "type": one of "definition", "mechanism", "differentiation", "classification", "principle"
    // "content": clear, concise explanation (2-4 sentences)
    // "high_yield": boolean indicating if this is frequently tested in NEET-PG
    // Focus on definitions, mechanisms, differentiations, and classifications.
  ],
  "comparison_tables": [
    // 2-4 high-yield comparison tables. Each table is an object with:
    // "title": what is being compared (e.g., "Type 1 vs Type 2 RTA")
    // "columns": array of column headers (entity names being compared)
    // "rows": array of objects with "feature" and "values" (array matching columns)
    // Include 5-8 comparison points per table.
    // Choose the most commonly confused or compared entities.
  ],
  "clinical_scenarios": [
    // 3-5 clinical application scenarios. Each is an object with:
    // "scenario": a brief clinical vignette (2-3 sentences)
    // "key_concept": the concept being tested
    // "expected_answer": what the student should recognize/conclude
    // "teaching_point": one-line takeaway
    // These should mimic NEET-PG clinical question style.
  ],
  "numerical_recall_points": [
    // 5-8 numerical/value-based facts to memorize. Each is an object with:
    // "fact": the numerical fact (e.g., "Normal serum sodium: 135-145 mEq/L")
    // "context": why this value matters clinically
    // "mnemonic": optional memory aid (null if none)
    // Include lab values, dosages, cutoffs, staging criteria.
  ],
  "trap_patterns": [
    // 4-6 common exam trap patterns. Each is an object with:
    // "trap": description of the trap (e.g., "Confusing X with Y because...")
    // "why_tempting": why students fall for it
    // "correct_approach": how to avoid the trap
    // "related_subtopic": the subtopic this trap relates to
    // Based on common PYQ distractor patterns.
  ]
}}

Rules:
- All content must be medically accurate and NEET-PG relevant.
- Prioritize high-yield, frequently tested concepts.
- Comparison tables should cover the most commonly confused pairs.
- Clinical scenarios should mimic real NEET-PG question style.
- Trap patterns should reflect actual PYQ distractor strategies.
- Return ONLY valid JSON, no markdown or extra text."""

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: client.chat.completions.create(
            model=os.getenv("AI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": "You are a NEET-PG medical education expert. Always return valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=4000,
            response_format={"type": "json_object"}
        ))

        content = response.choices[0].message.content.strip()
        result = json.loads(content)

        concept_core = result.get("concept_core_block", [])
        comparisons = result.get("comparison_tables", [])
        scenarios = result.get("clinical_scenarios", [])
        numerical = result.get("numerical_recall_points", [])
        traps = result.get("trap_patterns", [])

        if not isinstance(concept_core, list): concept_core = []
        if not isinstance(comparisons, list): comparisons = []
        if not isinstance(scenarios, list): scenarios = []
        if not isinstance(numerical, list): numerical = []
        if not isinstance(traps, list): traps = []

        return {
            "concept_core_block": concept_core[:12],
            "comparison_tables": comparisons[:4],
            "clinical_scenarios": scenarios[:5],
            "numerical_recall_points": numerical[:8],
            "trap_patterns": traps[:6],
            "generated": True,
            "model": os.getenv("AI_MODEL", "gpt-4o-mini")
        }

    except json.JSONDecodeError as e:
        print(f"JSON parse error in teaching unit: {str(e)}")
        return get_fallback_teaching_unit(subject, topic)
    except Exception as e:
        print(f"Teaching unit generation error: {str(e)}")
        return get_fallback_teaching_unit(subject, topic)


def get_fallback_teaching_unit(subject: str, topic: str) -> Dict[str, Any]:
    return {
        "concept_core_block": [
            {"title": f"Definition of {topic}", "type": "definition", "content": f"Review the fundamental definition and scope of {topic} in {subject}.", "high_yield": True},
            {"title": f"Pathophysiology of {topic}", "type": "mechanism", "content": f"Understand the underlying mechanism and pathological processes in {topic}.", "high_yield": True},
            {"title": f"Classification of {topic}", "type": "classification", "content": f"Know the standard classification systems used for {topic}.", "high_yield": True},
            {"title": f"Key Differentiations", "type": "differentiation", "content": f"Be able to differentiate between the major subtypes or similar conditions in {topic}.", "high_yield": True}
        ],
        "comparison_tables": [
            {
                "title": f"{topic} — Key Comparison",
                "columns": ["Type A", "Type B"],
                "rows": [
                    {"feature": "Etiology", "values": ["Primary", "Secondary"]},
                    {"feature": "Presentation", "values": ["Acute", "Chronic"]},
                    {"feature": "Diagnosis", "values": ["Clinical", "Lab-based"]},
                    {"feature": "Treatment", "values": ["Medical", "Surgical"]}
                ]
            }
        ],
        "clinical_scenarios": [
            {
                "scenario": f"A patient presents with classic features of {topic}. What is the most likely diagnosis?",
                "key_concept": f"Recognition of {topic} presentation",
                "expected_answer": f"Classic {topic} diagnosis",
                "teaching_point": f"Know the pathognomonic features of {topic}."
            }
        ],
        "numerical_recall_points": [
            {"fact": f"Key lab value for {topic}: review normal ranges", "context": "Essential for diagnosis", "mnemonic": None},
            {"fact": f"Staging cutoff for {topic}: review criteria", "context": "Determines treatment approach", "mnemonic": None}
        ],
        "trap_patterns": [
            {
                "trap": f"Confusing {topic} Type A with Type B",
                "why_tempting": "Similar presentation in early stages",
                "correct_approach": "Focus on the key differentiating feature",
                "related_subtopic": topic
            }
        ],
        "generated": False,
        "model": "fallback"
    }

