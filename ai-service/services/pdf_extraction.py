import os
import json
import tempfile
import asyncio
import re
from typing import Dict, Any, List
from services.transcription import get_openai_client

try:
    import pdfplumber
except ImportError:
    pdfplumber = None


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    if pdfplumber is None:
        raise ImportError("pdfplumber is not installed")
    max_chars = int(os.getenv("PDF_MAX_TEXT_CHARS", "180000"))
    max_pages = int(os.getenv("PDF_MAX_PAGES", "250"))

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        parts = []
        total_chars = 0
        with pdfplumber.open(tmp_path) as pdf:
            for i, page in enumerate(pdf.pages):
                if i >= max_pages or total_chars >= max_chars:
                    break
                page_text = page.extract_text()
                if page_text:
                    chunk = f"\n--- Page {i + 1} ---\n{page_text}"
                    remaining = max_chars - total_chars
                    if remaining <= 0:
                        break
                    if len(chunk) > remaining:
                        chunk = chunk[:remaining]
                    parts.append(chunk)
                    total_chars += len(chunk)
        return "".join(parts).strip()
    finally:
        os.unlink(tmp_path)


async def parse_questions_from_text(text: str, filename: str = "") -> List[Dict[str, Any]]:
    structured_questions = parse_structured_question_blocks(text, filename)
    if len(text) > 120000 and structured_questions:
        return structured_questions

    client = get_openai_client()

    max_chars = 12000
    chunks = []
    if len(text) <= max_chars:
        chunks = [text]
    else:
        words = text.split()
        current_chunk = ""
        for word in words:
            if len(current_chunk) + len(word) + 1 > max_chars:
                chunks.append(current_chunk.strip())
                current_chunk = word
            else:
                current_chunk += " " + word
        if current_chunk.strip():
            chunks.append(current_chunk.strip())

    all_questions = []

    for i, chunk in enumerate(chunks):
        prompt = f"""You are an expert at parsing medical exam question papers (NEET PG, AIIMS, JIPMER, etc).

The following text is extracted from a PDF file named "{filename}". Parse and extract ALL individual questions from this text.

For each question, identify:
1. The full question text (stem)
2. Options (A, B, C, D) if it's an MCQ
3. The correct answer if marked in the text
4. Question type: mcq, saq, case_based, true_false, or assertion_reason
5. Subject (e.g., Anatomy, Physiology, Pharmacology, Pathology, Microbiology, etc.)
6. Topic within the subject
7. Subtopic if identifiable
8. Difficulty: easy, medium, or hard
9. Exam year tags - identify which exam and year this question appeared in (e.g., "NEET PG 2023", "AIIMS 2022"). Look for clues in the text like headers, footers, question numbers with years, etc.
10. Key points that the correct answer covers
11. Ideal answer / explanation if available in the text
12. Cognitive focus: factual, conceptual, or clinical
13. Distractor analysis: For each MCQ, explain why each wrong option is tempting. Describe the misconception each distractor exploits.
14. Concept tags: The core medical concept being tested (e.g., "acid-base balance", "enzyme kinetics")
15. Trap pattern: If the question has a common trap or trick, describe it (e.g., "reversal of Type 1 vs Type 2", "confusing drug names")

IMPORTANT for exam year detection:
- Look for patterns like "NEET 2023", "AIIMS Nov 2022", "JIPMER 2021", "PGI 2020", year headers, etc.
- If the PDF title or headers mention a year, tag all questions with that year
- If no year is found, use "unknown"

Respond with a JSON array. Each item:
{{
  "stem": "full question text",
  "type": "mcq",
  "options": {{"A": "option text", "B": "option text", "C": "option text", "D": "option text"}},
  "correct_answer": "A",
  "subject": "Pharmacology",
  "topic": "Antibiotics",
  "subtopic": "Fluoroquinolones",
  "difficulty": "medium",
  "exam_tags": ["NEET PG 2023"],
  "key_points": ["point 1", "point 2"],
  "ideal_answer": "explanation text",
  "cognitive_focus": "factual",
  "distractor_analysis": {{"B": "Confuses bacteriostatic with bactericidal", "C": "Common name similarity with cephalosporins", "D": "Overgeneralization of spectrum"}},
  "concept_tags": ["fluoroquinolone mechanism", "DNA gyrase inhibition"],
  "trap_pattern": "Confusing generation-specific spectrum coverage"
}}

For non-MCQ questions, set options, correct_answer, and distractor_analysis to null.

TEXT (chunk {i + 1} of {len(chunks)}):
{chunk}

Return ONLY valid JSON array. No extra text."""

        loop = asyncio.get_event_loop()

        def call_openai():
            return client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are an expert medical exam question parser. Always respond with valid JSON array only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=4000
            )

        response = await loop.run_in_executor(None, call_openai)
        content = response.choices[0].message.content.strip()

        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        try:
            questions = json.loads(content)
            if isinstance(questions, list):
                all_questions.extend(questions)
        except json.JSONDecodeError:
            print(f"Failed to parse JSON from chunk {i + 1}")

    if all_questions:
        return all_questions
    return structured_questions


def parse_structured_question_blocks(text: str, filename: str = "") -> List[Dict[str, Any]]:
    header_subject = None
    header_match = re.search(r"\(([A-Za-z\s]+QUESTIONS?)\)\s*DONE BY", text, re.IGNORECASE)
    if header_match:
        header_subject = header_match.group(1).strip().title()

    block_pattern = re.compile(r"(?ms)^\s*(\d+)\)\s*\(([^)]+)\)\s*(.+?)(?=^\s*\d+\)\s*\(|\Z)")
    option_pattern = re.compile(r"(?ms)^\s*([A-E])\.\s*(.+?)(?=^\s*[A-E]\.\s|^\s*PREFERRED RESPONSE|\Z)")
    pref_pattern = re.compile(r"PREFERRED RESPONSE\s*▼\s*([1-5A-E])", re.IGNORECASE)

    questions: List[Dict[str, Any]] = []
    for match in block_pattern.finditer(text):
        code = (match.group(2) or "").strip()
        block = (match.group(3) or "").strip()
        if not block:
            continue

        options = {}
        first_option_start = None
        option_matches = list(option_pattern.finditer(block))
        for idx, opt_match in enumerate(option_matches):
            if idx == 0:
                first_option_start = opt_match.start()
            letter = opt_match.group(1).strip().upper()
            value = normalize_ws(opt_match.group(2))
            options[letter] = value

        if first_option_start is not None:
            stem_text = block[:first_option_start].strip()
        else:
            split_pref = pref_pattern.search(block)
            stem_text = block[:split_pref.start()].strip() if split_pref else block
        stem_text = normalize_ws(stem_text)

        pref_match = pref_pattern.search(block)
        correct_answer = None
        if pref_match:
            raw = pref_match.group(1).strip().upper()
            if raw.isdigit():
                idx = int(raw) - 1
                if 0 <= idx < 5:
                    correct_answer = ["A", "B", "C", "D", "E"][idx]
            elif raw in ["A", "B", "C", "D", "E"]:
                correct_answer = raw

        ideal_answer = None
        if pref_match:
            explanation = block[pref_match.end():].strip()
            explanation = normalize_ws(explanation)
            if explanation:
                ideal_answer = explanation

        q_type = "mcq" if len(options) >= 2 else "saq"
        subject = infer_subject_from_stem(stem_text, header_subject, filename)
        topic = "General"

        question = {
            "stem": stem_text,
            "type": q_type,
            "options": options if q_type == "mcq" else None,
            "correct_answer": correct_answer if q_type == "mcq" else None,
            "subject": subject,
            "topic": topic,
            "subtopic": None,
            "difficulty": "medium",
            "exam_tags": [code] if code else [],
            "key_points": [],
            "ideal_answer": ideal_answer,
            "cognitive_focus": "conceptual",
            "distractor_analysis": None,
            "concept_tags": [],
            "trap_pattern": None
        }
        if question["stem"]:
            questions.append(question)

    return questions


def normalize_ws(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def infer_subject_from_stem(stem: str, header_subject: str, filename: str) -> str:
    if header_subject:
        if "HAND" in header_subject.upper():
            return "Orthopedics"
        return header_subject

    upper_name = (filename or "").upper()
    if "OB" in upper_name:
        return "Orthopedics"

    stem_upper = (stem or "").upper()
    if "WRIST" in stem_upper or "FINGER" in stem_upper or "SCAPHOID" in stem_upper:
        return "Orthopedics"

    return "General Medicine"


def classify_yield(pyq_count: int) -> str:
    if pyq_count >= 10:
        return "core"
    elif pyq_count >= 5:
        return "frequent"
    elif pyq_count >= 2:
        return "occasional"
    else:
        return "rare"


def analyze_importance(questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    topic_frequency = {}
    topic_years = {}
    subtopic_frequency = {}
    subtopic_years = {}

    for q in questions:
        subject_key = str(q.get('subject') or '').lower()
        topic_key_part = str(q.get('topic') or '').lower()
        subtopic_key_part = str(q.get('subtopic') or '').lower()
        topic_key = f"{subject_key}|{topic_key_part}"
        subtopic_key = f"{subject_key}|{topic_key_part}|{subtopic_key_part}"

        topic_frequency[topic_key] = topic_frequency.get(topic_key, 0) + 1
        subtopic_frequency[subtopic_key] = subtopic_frequency.get(subtopic_key, 0) + 1

        exam_tags = q.get('exam_tags', [])

        if topic_key not in topic_years:
            topic_years[topic_key] = set()
        if subtopic_key not in subtopic_years:
            subtopic_years[subtopic_key] = set()

        for tag in exam_tags:
            years = [int(s) for s in tag.split() if s.isdigit() and 2000 <= int(s) <= 2030]
            for y in years:
                topic_years[topic_key].add(y)
                subtopic_years[subtopic_key].add(y)

    current_year = 2026

    for q in questions:
        subject_key = str(q.get('subject') or '').lower()
        topic_key_part = str(q.get('topic') or '').lower()
        subtopic_key_part = str(q.get('subtopic') or '').lower()
        topic_key = f"{subject_key}|{topic_key_part}"
        subtopic_key = f"{subject_key}|{topic_key_part}|{subtopic_key_part}"

        topic_freq = topic_frequency.get(topic_key, 1)
        subtopic_freq = subtopic_frequency.get(subtopic_key, 1)
        years = topic_years.get(topic_key, set())
        sub_years = subtopic_years.get(subtopic_key, set())
        most_recent = max(years) if years else 0
        sub_most_recent = max(sub_years) if sub_years else 0

        recency_score = 0
        if most_recent >= current_year - 1:
            recency_score = 3
        elif most_recent >= current_year - 3:
            recency_score = 2
        elif most_recent > 0:
            recency_score = 1

        frequency_score = 0
        if topic_freq >= 3:
            frequency_score = 3
        elif topic_freq >= 2:
            frequency_score = 2
        else:
            frequency_score = 1

        total_score = frequency_score + recency_score

        if total_score >= 5:
            importance = "high"
        elif total_score >= 3:
            importance = "medium"
        else:
            importance = "low"

        q['importance'] = importance
        q['frequency_count'] = subtopic_freq
        q['most_recent_year'] = sub_most_recent if sub_most_recent > 0 else (most_recent if most_recent > 0 else None)
        q['yield_category'] = classify_yield(subtopic_freq)
        q['years_appeared'] = sorted(list(sub_years)) if sub_years else []

    subtopic_yield_map = {}
    for q in questions:
        subject = q.get('subject', '')
        topic = q.get('topic', '')
        subtopic = q.get('subtopic', '') or topic
        key = f"{subject}|{topic}|{subtopic}"

        if key not in subtopic_yield_map:
            subtopic_yield_map[key] = {
                "subject": subject,
                "topic": topic,
                "subtopic": subtopic,
                "pyq_count": 0,
                "years_appeared": set(),
                "most_recent_year": None
            }

        subtopic_yield_map[key]["pyq_count"] += 1
        for y in q.get('years_appeared', []):
            subtopic_yield_map[key]["years_appeared"].add(y)

    subtopic_yield_data = []
    for key, data in subtopic_yield_map.items():
        years_list = sorted(list(data["years_appeared"]))
        subtopic_yield_data.append({
            "subject": data["subject"],
            "topic": data["topic"],
            "subtopic": data["subtopic"],
            "pyq_count": data["pyq_count"],
            "yield_category": classify_yield(data["pyq_count"]),
            "years_appeared": years_list,
            "most_recent_year": max(years_list) if years_list else None
        })

    return questions, subtopic_yield_data


async def extract_questions_from_pdf(pdf_bytes: bytes, filename: str = "") -> Dict[str, Any]:
    print(f"Extracting text from PDF: {filename} ({len(pdf_bytes)} bytes)")
    text = extract_text_from_pdf(pdf_bytes)

    if not text or len(text.strip()) < 50:
        return {
            "questions": [],
            "total_extracted": 0,
            "summary": "Could not extract meaningful text from this PDF. It may be scanned/image-based.",
            "text_length": len(text) if text else 0
        }

    print(f"Extracted {len(text)} characters from PDF. Parsing questions with AI...")
    questions = await parse_questions_from_text(text, filename)

    print(f"Parsed {len(questions)} questions. Analyzing importance and yield...")
    questions, subtopic_yield_data = analyze_importance(questions)

    high_count = sum(1 for q in questions if q.get('importance') == 'high')
    medium_count = sum(1 for q in questions if q.get('importance') == 'medium')
    low_count = sum(1 for q in questions if q.get('importance') == 'low')

    core_count = sum(1 for q in questions if q.get('yield_category') == 'core')
    frequent_count = sum(1 for q in questions if q.get('yield_category') == 'frequent')
    occasional_count = sum(1 for q in questions if q.get('yield_category') == 'occasional')
    rare_count = sum(1 for q in questions if q.get('yield_category') == 'rare')

    subjects = list(set(q.get('subject', 'Unknown') for q in questions))

    summary = (
        f"Extracted {len(questions)} questions. "
        f"Importance: {high_count} high, {medium_count} medium, {low_count} low. "
        f"Yield: {core_count} core, {frequent_count} frequent, {occasional_count} occasional, {rare_count} rare. "
        f"Subjects: {', '.join(subjects[:5])}"
    )

    for q in questions:
        if isinstance(q.get('distractor_analysis'), dict):
            q['distractor_analysis'] = json.dumps(q['distractor_analysis'])
        if isinstance(q.get('concept_tags'), list):
            q['concept_tags'] = json.dumps(q['concept_tags'])
        if isinstance(q.get('years_appeared'), (list, set)):
            q['years_appeared'] = json.dumps(sorted(list(q['years_appeared'])))

    return {
        "questions": questions,
        "total_extracted": len(questions),
        "summary": summary,
        "text_length": len(text),
        "subjects": subjects,
        "importance_breakdown": {
            "high": high_count,
            "medium": medium_count,
            "low": low_count
        },
        "yield_breakdown": {
            "core": core_count,
            "frequent": frequent_count,
            "occasional": occasional_count,
            "rare": rare_count
        },
        "subtopic_yield": subtopic_yield_data
    }
