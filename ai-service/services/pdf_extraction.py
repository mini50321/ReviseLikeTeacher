import os
import json
import tempfile
import asyncio
from typing import Dict, Any, List
from services.transcription import get_openai_client

try:
    import pdfplumber
except ImportError:
    pdfplumber = None


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    if pdfplumber is None:
        raise ImportError("pdfplumber is not installed")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        full_text = ""
        with pdfplumber.open(tmp_path) as pdf:
            for i, page in enumerate(pdf.pages):
                page_text = page.extract_text()
                if page_text:
                    full_text += f"\n--- Page {i + 1} ---\n{page_text}"
        return full_text.strip()
    finally:
        os.unlink(tmp_path)


async def parse_questions_from_text(text: str, filename: str = "") -> List[Dict[str, Any]]:
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
  "cognitive_focus": "factual"
}}

For non-MCQ questions, set options to null and correct_answer to null.

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

    return all_questions


def analyze_importance(questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    topic_frequency = {}
    topic_years = {}

    for q in questions:
        key = f"{q.get('subject', '').lower()}|{q.get('topic', '').lower()}"
        stem_short = q.get('stem', '')[:80].lower()

        topic_frequency[key] = topic_frequency.get(key, 0) + 1

        exam_tags = q.get('exam_tags', [])
        if key not in topic_years:
            topic_years[key] = set()

        for tag in exam_tags:
            years = [int(s) for s in tag.split() if s.isdigit() and 2000 <= int(s) <= 2030]
            for y in years:
                topic_years[key].add(y)

    current_year = 2026

    for q in questions:
        key = f"{q.get('subject', '').lower()}|{q.get('topic', '').lower()}"
        freq = topic_frequency.get(key, 1)
        years = topic_years.get(key, set())
        most_recent = max(years) if years else 0

        recency_score = 0
        if most_recent >= current_year - 1:
            recency_score = 3
        elif most_recent >= current_year - 3:
            recency_score = 2
        elif most_recent > 0:
            recency_score = 1

        frequency_score = 0
        if freq >= 3:
            frequency_score = 3
        elif freq >= 2:
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
        q['frequency_count'] = freq
        q['most_recent_year'] = most_recent if most_recent > 0 else None

    return questions


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

    print(f"Parsed {len(questions)} questions. Analyzing importance...")
    questions = analyze_importance(questions)

    high_count = sum(1 for q in questions if q.get('importance') == 'high')
    medium_count = sum(1 for q in questions if q.get('importance') == 'medium')
    low_count = sum(1 for q in questions if q.get('importance') == 'low')

    subjects = list(set(q.get('subject', 'Unknown') for q in questions))

    summary = (
        f"Extracted {len(questions)} questions. "
        f"Importance: {high_count} high, {medium_count} medium, {low_count} low. "
        f"Subjects: {', '.join(subjects[:5])}"
    )

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
        }
    }

