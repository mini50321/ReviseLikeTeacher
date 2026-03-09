import os
import json
import tempfile
import asyncio
import re
import base64
from io import BytesIO
from typing import Dict, Any, List
from services.transcription import get_openai_client

try:
    import pdfplumber
except ImportError:
    pdfplumber = None


LAQ_KEYWORDS = [
    "long answer",
    "essay",
    "discuss",
    "describe in detail",
    "elaborate",
    "write in detail",
    "critically evaluate",
    "compare and contrast"
]

SAQ_KEYWORDS = [
    "short answer",
    "short note",
    "briefly",
    "enumerate",
    "list",
    "define",
    "name"
]

CASE_KEYWORDS = [
    "patient",
    "year-old",
    "presented with",
    "complains of",
    "history of",
    "on examination",
    "clinical scenario",
    "vignette"
]


def extract_text_from_pdf(pdf_bytes: bytes, start_page: int = 0, end_page: int | None = None) -> str:
    if pdfplumber is None:
        raise ImportError("pdfplumber is not installed")
    max_chars = int(os.getenv("PDF_MAX_TEXT_CHARS", "60000"))
    max_pages = int(os.getenv("PDF_MAX_PAGES", "80"))

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        parts = []
        total_chars = 0
        with pdfplumber.open(tmp_path) as pdf:
            total_pages = len(pdf.pages)
            if start_page < 0:
                start_page = 0
            if end_page is None or end_page > total_pages:
                end_page = min(total_pages, max_pages)
            for i, page in enumerate(pdf.pages):
                if i < start_page:
                    continue
                if i >= end_page or total_chars >= max_chars:
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


def extract_text_from_pdf_with_ocr(pdf_bytes: bytes, start_page: int = 0, end_page: int | None = None) -> str:
    if pdfplumber is None:
        return ""
    client = get_openai_client()
    if client is None:
        return ""
    max_chars = int(os.getenv("PDF_OCR_MAX_TEXT_CHARS", "60000"))
    max_pages = int(os.getenv("PDF_OCR_MAX_PAGES", "40"))
    ocr_model = os.getenv("PDF_OCR_MODEL", os.getenv("AI_MODEL", "gpt-4o-mini"))
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name
    try:
        parts = []
        total_chars = 0
        with pdfplumber.open(tmp_path) as pdf:
            total_pages = len(pdf.pages)
            if start_page < 0:
                start_page = 0
            if end_page is None or end_page > total_pages:
                end_page = min(total_pages, max_pages)
            for i, page in enumerate(pdf.pages):
                if i < start_page:
                    continue
                if i >= end_page or total_chars >= max_chars:
                    break
                image = page.to_image(resolution=200).original
                buf = BytesIO()
                image.save(buf, format="PNG")
                b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                content = [
                    {
                        "type": "text",
                        "text": "Transcribe all readable text from this page. Return only the plain text, no explanations."
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "data:image/png;base64," + b64
                        }
                    }
                ]
                try:
                    resp = client.chat.completions.create(
                        model=ocr_model,
                        messages=[
                            {
                                "role": "system",
                                "content": "You are an OCR engine. You read text from images and output only the exact text content."
                            },
                            {
                                "role": "user",
                                "content": content
                            }
                        ]
                    )
                    page_text = resp.choices[0].message.content or ""
                except Exception as e:
                    print(f"OCR page error: {e}")
                    page_text = ""
                if page_text:
                    chunk = f"\n--- Page {i + 1} (OCR) ---\n{page_text}"
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
        return normalize_extracted_questions(structured_questions)

    client = get_openai_client()
    if client is None:
        return normalize_extracted_questions(structured_questions)

    max_chars = 8000
    chunks = build_text_chunks(text, max_chars=max_chars)

    all_questions = []

    max_chunks = int(os.getenv("PDF_MAX_AI_CHUNKS", "5"))

    for i, chunk in enumerate(chunks[:max_chunks]):
        prompt = f"""You are an expert at parsing medical exam question papers (NEET PG, AIIMS, JIPMER, etc).

The following text is extracted from a PDF file named "{filename}". The PDF contains both questions AND their answers/explanations. Your job is to extract both: the question into stem and the corresponding answer/explanation into ideal_answer.

STEM vs IDEAL_ANSWER (critical):
- "stem" = ONLY the question text. Never put the answer or explanation in stem.
- "ideal_answer" = the answer or explanation that appears in the PDF for this question. Look in the same block or the lines immediately after the question for labels like "Answer:", "Explanation:", "Key:", "Solution:", or the paragraph that clearly explains the answer. Copy or closely paraphrase that text into ideal_answer. The client has confirmed all answers are in the PDF — do not invent a meta-sentence like "A good answer should explain..."; extract what the document actually says. If you truly cannot find any answer text in the chunk, then write 1-2 sentences of correct clinical content for that question (still not a meta-phrase).
- Do not put explanation text in stem. Do not put the question in ideal_answer.

CORRECT ANSWER (MCQ only):
- Set correct_answer to the option letter (A, B, C, or D) that is explicitly marked correct in the source (e.g. "Answer: B", "Key: C", "PREFERRED RESPONSE", "Correct option"). Use exactly what the document states; do not infer a different letter.

SKIP these:
- Standalone statements, single-line facts, headings, or phrases that are not questions (e.g. "Sound louder in diseased ear").
- Items where you cannot identify a clear question being asked or a clear correct answer for MCQs.

For each question output:
1. stem: only the question text
2. options, correct_answer (for MCQ; must match document)
3. type: mcq, saq, laq, case_based, true_false, or assertion_reason
4. subject: from document header, section title, or filename (e.g. ENT, Orthopedics, General Medicine). Never leave blank.
5. topic: the main clinical/system topic (e.g. Tuning Fork Tests, Fractures, Hearing Loss). Never use "General" unless the source gives no clue.
6. subtopic: finer category if present (e.g. Rinne test, Weber test). Use null only if none.
7. difficulty, exam_tags
8. key_points: 2-5 short phrases the correct answer must cover, derived from the ideal_answer or explanation. Always fill this from the content; do not leave empty.
9. ideal_answer: the actual correct answer or explanation. Never "None". If the source has no explanation, write 1-2 sentences of correct clinical content.
10. cognitive_focus (factual/conceptual/clinical), distractor_analysis (MCQ), concept_tags (2-4 tags e.g. anatomy, physiology, clinical finding), trap_pattern (if MCQ has a common trap, one short phrase)

JSON format per item:
{{
  "stem": "only the question text, no explanation",
  "type": "mcq",
  "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
  "correct_answer": "A",
  "subject": "from document (e.g. ENT, Orthopedics)",
  "topic": "specific topic (e.g. Tuning Fork Tests, not General)",
  "subtopic": "finer category or null",
  "difficulty": "medium",
  "exam_tags": ["..."],
  "key_points": ["point1", "point2", "..."],
  "ideal_answer": "actual correct answer text; never None",
  "cognitive_focus": "factual",
  "distractor_analysis": {{"B": "...", "C": "...", "D": "..."}},
  "concept_tags": ["tag1", "tag2", "..."],
  "trap_pattern": "common trap if any or null"
}}

For non-MCQ: options, correct_answer, distractor_analysis = null. ideal_answer must be the actual correct answer content (state the facts or reasoning), not "None" and not "A good answer should explain...".

TEXT (chunk {i + 1} of {len(chunks)}):
{chunk}

Return ONLY a valid JSON array. No extra text."""

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
        return normalize_extracted_questions(all_questions)
    return normalize_extracted_questions(structured_questions)


def parse_structured_question_blocks(text: str, filename: str = "") -> List[Dict[str, Any]]:
    header_subject = None
    header_match = re.search(r"\(([A-Za-z\s]+QUESTIONS?)\)\s*DONE BY", text, re.IGNORECASE)
    if header_match:
        header_subject = header_match.group(1).strip().title()

    block_pattern = re.compile(r"(?ms)^\s*(\d+)[\)\.\:-]\s*(?:\(([^)]+)\)\s*)?(.+?)(?=^\s*\d+[\)\.\:-]\s*(?:\(|\S)|\Z)")
    option_pattern = re.compile(r"(?ms)^\s*([A-E])[\)\.\:-]\s*(.+?)(?=^\s*[A-E][\)\.\:-]\s|^\s*PREFERRED RESPONSE|\Z)")
    pref_pattern = re.compile(r"PREFERRED RESPONSE\s*▼\s*([1-5A-E])", re.IGNORECASE)
    answer_label_pattern = re.compile(
        r"(?ms)(?:Answer|Explanation|Key|Solution)\s*[:\-]\s*(.+?)(?=^\s*(?:\d+[\)\.\:-]|Answer|Explanation|Key|Solution)\s*[:\-]|\Z)",
        re.IGNORECASE
    )

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
        if looks_like_explanation(stem_text):
            continue

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
        if options and correct_answer and correct_answer not in options:
            correct_answer = None

        ideal_answer = None
        if pref_match:
            explanation = block[pref_match.end():].strip()
            explanation = normalize_ws(explanation)
            if explanation:
                ideal_answer = explanation
        if not ideal_answer:
            ans_match = answer_label_pattern.search(block)
            if ans_match:
                ideal_answer = normalize_ws(ans_match.group(1))
                if ideal_answer and len(ideal_answer) < 15:
                    ideal_answer = None

        q_type = infer_question_type(
            stem=stem_text,
            options=options if len(options) >= 2 else None,
            declared_type=None,
            ideal_answer=ideal_answer
        )
        subject = infer_subject_from_stem(stem_text, header_subject, filename)
        topic = "General"

        question = {
            "stem": stem_text,
            "type": q_type,
            "options": options if q_type in ["mcq", "true_false", "assertion_reason"] else None,
            "correct_answer": correct_answer if q_type in ["mcq", "true_false", "assertion_reason"] else None,
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
        if question["stem"] and is_likely_question(stem_text):
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
    if "ENT" in upper_name or "OTOLARYNG" in upper_name or "AUDIO" in upper_name:
        return "ENT"
    if "MED" in upper_name and "GEN" in upper_name:
        return "General Medicine"

    stem_upper = (stem or "").upper()
    if "WRIST" in stem_upper or "FINGER" in stem_upper or "SCAPHOID" in stem_upper:
        return "Orthopedics"
    if "RINNE" in stem_upper or "WEBER" in stem_upper or "HEARING" in stem_upper or "COCHLEAR" in stem_upper:
        return "ENT"

    return "General Medicine"


def _normalize_subject(s: str) -> str:
    if not s or s.lower() == "unknown":
        return "General Medicine"
    s = normalize_ws(s)
    if not s:
        return "General Medicine"
    return s


def _normalize_topic(topic: str, stem: Any, subject: Any) -> str:
    if topic and normalize_ws(topic) and topic.lower() != "general":
        return normalize_ws(topic)
    stem_upper = (stem or "").upper()
    if "RINNE" in stem_upper or "WEBER" in stem_upper:
        return "Tuning Fork Tests"
    if "AIR-BONE" in stem_upper or "AIR BONE" in stem_upper or "AUDIOGRAM" in stem_upper:
        return "Audiogram"
    if "HEARING LOSS" in stem_upper or "CONDUCTIVE" in stem_upper or "SNHL" in stem_upper:
        return "Hearing Loss"
    return "General"


def _normalize_concept_tags(val: Any) -> List[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [normalize_ws(str(x)) for x in val if normalize_ws(str(x))]
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return [normalize_ws(str(x)) for x in parsed if normalize_ws(str(x))]
        except (json.JSONDecodeError, TypeError):
            pass
        if val.strip():
            return [normalize_ws(val)]
    return []


def build_text_chunks(text: str, max_chars: int = 12000) -> List[str]:
    text = text or ""
    if len(text) <= max_chars:
        return [text] if text.strip() else []

    chunks: List[str] = []
    current = ""
    sections = re.split(r"(\n--- Page \d+ ---\n)", text)

    if len(sections) == 1:
        sections = [text]

    for sec in sections:
        if not sec:
            continue
        if len(sec) > max_chars:
            start = 0
            while start < len(sec):
                part = sec[start:start + max_chars]
                if part.strip():
                    chunks.append(part)
                start += max_chars
            continue

        if len(current) + len(sec) > max_chars:
            if current.strip():
                chunks.append(current)
            current = sec
        else:
            current += sec

    if current.strip():
        chunks.append(current)
    return chunks


def normalize_options(options: Any) -> Dict[str, str]:
    if options is None:
        return {}
    if isinstance(options, dict):
        normalized = {}
        for key in ["A", "B", "C", "D", "E"]:
            value = str(options.get(key, "")).strip()
            if value:
                normalized[key] = normalize_ws(value)
        return normalized
    if isinstance(options, list):
        labels = ["A", "B", "C", "D", "E"]
        normalized = {}
        for i, value in enumerate(options):
            if i >= len(labels):
                break
            txt = normalize_ws(str(value))
            if txt:
                normalized[labels[i]] = txt
        return normalized
    if isinstance(options, str):
        extracted = {}
        pattern = re.compile(r"(?ms)([A-E])[\)\.\:-]\s*(.+?)(?=(?:\n\s*[A-E][\)\.\:-]\s)|\Z)")
        for m in pattern.finditer(options):
            label = m.group(1).upper()
            value = normalize_ws(m.group(2))
            if value:
                extracted[label] = value
        return extracted
    return {}


QUESTION_START_PATTERN = re.compile(
    r"^(?:Pages\s+\d+\s*-\s*\d+\s*:\s*)?"
    r"(what|which|how|why|when|who|where|is\s|are\s|can\s|could\s|would\s|should\s|does\s|do\s|has\s|have\s|will\s|did\s|was\s|were\s|name|list|define|describe|explain|compare|differentiate|enumerate|state|give|identify|the\s+following|all\s+of\s+the\s+following)",
    re.IGNORECASE
)

EXPLANATION_START_PATTERN = re.compile(
    r"^(?:because|this\s+is\s+because|the\s+answer\s+is|the\s+correct\s+answer\s+is|thus|therefore|in\s+this\s+case|it\s+is\s+because|due\s+to|owing\s+to|explanation\s*:?\s*|answer\s*:?\s*|key\s*:?\s*)",
    re.IGNORECASE
)


def looks_like_explanation(text: str) -> bool:
    s = (text or "").strip()
    if len(s) < 20:
        return False
    if "?" in s:
        return False
    if EXPLANATION_START_PATTERN.match(s):
        return True
    if s.count(".") >= 2 and not QUESTION_START_PATTERN.match(s):
        return True
    return False


def is_likely_question(stem: str) -> bool:
    s = (stem or "").strip()
    if not s or len(s) < 12:
        return False
    if "?" in s:
        return True
    if QUESTION_START_PATTERN.match(s):
        return True
    if len(s) > 55:
        return True
    return False


def infer_question_type(stem: str, options: Dict[str, str] = None, declared_type: str = None, ideal_answer: str = None) -> str:
    declared = (declared_type or "").strip().lower()
    allowed = {"mcq", "saq", "laq", "case_based", "true_false", "assertion_reason"}
    if declared in allowed:
        if declared in {"mcq", "true_false", "assertion_reason"} and not options:
            pass
        else:
            return declared

    s = (stem or "").strip().lower()
    ia = (ideal_answer or "").strip().lower()
    has_options = bool(options and len(options) >= 2)

    if "assertion" in s and "reason" in s:
        return "assertion_reason"
    if "true or false" in s or re.search(r"\btrue\s*/\s*false\b", s):
        return "true_false"
    if has_options:
        return "mcq"
    if any(k in s for k in CASE_KEYWORDS):
        return "case_based"

    long_signal = len(stem or "") > 260 or len(ideal_answer or "") > 320
    if any(k in s for k in LAQ_KEYWORDS) or any(k in ia for k in LAQ_KEYWORDS) or long_signal:
        return "laq"
    if any(k in s for k in SAQ_KEYWORDS):
        return "saq"
    return "saq"


def normalize_extracted_questions(raw_questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []
    seen = set()

    for q in raw_questions or []:
        if not isinstance(q, dict):
            continue
        stem = normalize_ws(str(q.get("stem", "")))
        if not stem or len(stem) < 12:
            continue
        if looks_like_explanation(stem):
            continue
        if not is_likely_question(stem):
            continue

        signature = stem.lower()
        if signature in seen:
            continue
        seen.add(signature)

        options = normalize_options(q.get("options"))
        q_type = infer_question_type(
            stem=stem,
            options=options if options else None,
            declared_type=q.get("type"),
            ideal_answer=q.get("ideal_answer")
        )

        correct_answer = q.get("correct_answer")
        if isinstance(correct_answer, str):
            correct_answer = correct_answer.strip().upper()
            if correct_answer.isdigit():
                idx = int(correct_answer) - 1
                if 0 <= idx < 5:
                    correct_answer = ["A", "B", "C", "D", "E"][idx]
            if correct_answer not in ["A", "B", "C", "D", "E"]:
                correct_answer = None
            if options and correct_answer and correct_answer not in options:
                correct_answer = None
        else:
            correct_answer = None

        if q_type not in ["mcq", "true_false", "assertion_reason"]:
            options = None
            correct_answer = None

        key_points = q.get("key_points", [])
        if not isinstance(key_points, list):
            key_points = []
        key_points = [normalize_ws(str(p)) for p in key_points if normalize_ws(str(p))]

        exam_tags = q.get("exam_tags", [])
        if not isinstance(exam_tags, list):
            exam_tags = []
        exam_tags = [normalize_ws(str(t)) for t in exam_tags if normalize_ws(str(t))]

        difficulty = str(q.get("difficulty", "medium")).lower()
        if difficulty not in ["easy", "medium", "hard"]:
            difficulty = "medium"

        cognitive_focus = str(q.get("cognitive_focus", "conceptual")).lower()
        if cognitive_focus not in ["factual", "conceptual", "clinical"]:
            cognitive_focus = "conceptual"

        raw_ideal = normalize_ws(str(q.get("ideal_answer", "")))
        if not raw_ideal or raw_ideal.lower() in ("none", "null", "n/a", "na", "-"):
            if key_points:
                ideal_answer = ". ".join(key_points[:4])
            else:
                ideal_answer = "See key points and topic for the expected answer content."
        elif raw_ideal.lower().startswith(("a good answer should", "the answer should", "answer should address", "key points to cover")):
            if key_points:
                ideal_answer = ". ".join(key_points[:4])
            else:
                ideal_answer = raw_ideal
        else:
            ideal_answer = raw_ideal

        cleaned.append({
            "stem": stem,
            "type": q_type,
            "options": options,
            "correct_answer": correct_answer,
            "subject": _normalize_subject(normalize_ws(str(q.get("subject", ""))) or "General Medicine"),
            "topic": _normalize_topic(normalize_ws(str(q.get("topic", ""))) or "General", q.get("stem"), q.get("subject")),
            "subtopic": normalize_ws(str(q.get("subtopic", ""))) or None,
            "difficulty": difficulty,
            "exam_tags": exam_tags,
            "key_points": key_points,
            "ideal_answer": ideal_answer,
            "cognitive_focus": cognitive_focus,
            "distractor_analysis": q.get("distractor_analysis"),
            "concept_tags": _normalize_concept_tags(q.get("concept_tags")),
            "trap_pattern": normalize_ws(str(q.get("trap_pattern", ""))) or None
        })

    return cleaned


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


async def extract_questions_from_pdf(pdf_bytes: bytes, filename: str = "", start_page: int = 0, end_page: int | None = None) -> Dict[str, Any]:
    print(f"Extracting text from PDF: {filename} ({len(pdf_bytes)} bytes) pages {start_page + 1} to {end_page or -1}")
    text = extract_text_from_pdf(pdf_bytes, start_page=start_page, end_page=end_page)

    if not text or len(text.strip()) < 50:
        print("Direct text extraction produced little or no text, attempting OCR...")
        ocr_text = extract_text_from_pdf_with_ocr(pdf_bytes, start_page=start_page, end_page=end_page)
        if ocr_text and len(ocr_text.strip()) >= 50:
            text = ocr_text
        else:
            return {
                "questions": [],
                "total_extracted": 0,
                "summary": "Could not extract meaningful text from this PDF even after AI OCR.",
                "text_length": len(ocr_text) if ocr_text else (len(text) if text else 0),
                "text": ocr_text or text or ""
            }

    if not text or len(text.strip()) < 50:
        return {
            "questions": [],
            "total_extracted": 0,
            "summary": "Could not extract meaningful text from this PDF. It may be scanned/image-based.",
            "text_length": len(text) if text else 0,
            "text": text or ""
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

    max_store_chars = int(os.getenv("PDF_STORE_TEXT_CHARS", "60000"))
    stored_text = text[:max_store_chars]

    return {
        "questions": questions,
        "total_extracted": len(questions),
        "summary": summary,
        "text_length": len(text),
        "text": stored_text,
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
