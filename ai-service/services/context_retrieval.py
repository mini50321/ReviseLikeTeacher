import os
import json
import math
import hashlib
import sqlite3
from typing import Dict, Any, List, Optional, Tuple
from openai import OpenAI

_client: Optional[OpenAI] = None
_cache: Dict[str, Any] = {"index": None}


def _get_openai_client() -> Optional[OpenAI]:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        _client = OpenAI(api_key=api_key)
    return _client


def _backend_db_path() -> str:
    configured = os.getenv("BACKEND_DB_PATH")
    if configured:
        return configured
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(base, "backend", "database.sqlite")


def _index_cache_path() -> str:
    configured = os.getenv("CONTEXT_INDEX_PATH")
    if configured:
        return configured
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cache_dir = os.path.join(base, ".cache")
    os.makedirs(cache_dir, exist_ok=True)
    return os.path.join(cache_dir, "context_index.json")


def _safe_json_load(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (list, dict)):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def _normalize_space(text: str) -> str:
    return " ".join((text or "").split())


def _compose_question_text(row: sqlite3.Row) -> Tuple[str, str, str]:
    stem = _normalize_space(row["stem"] or "")
    ideal = _normalize_space(row["ideal_answer"] or "")
    key_points_raw = _safe_json_load(row["key_points"])
    tags_raw = _safe_json_load(row["previous_year_tags"])

    key_points: List[str] = []
    if isinstance(key_points_raw, list):
        key_points = [_normalize_space(str(x)) for x in key_points_raw if _normalize_space(str(x))]

    tags: List[str] = []
    if isinstance(tags_raw, list):
        tags = [_normalize_space(str(x)) for x in tags_raw if _normalize_space(str(x))]

    text_parts = [
        f"Source: question_bank",
        f"Subject: {row['subject'] or ''}",
        f"Topic: {row['topic'] or ''}",
        f"Subtopic: {row['subtopic'] or ''}",
        f"Type: {row['type'] or ''}",
        f"Stem: {stem}",
        f"Ideal answer: {ideal}",
        f"Key points: {'; '.join(key_points)}",
        f"PYQ tags: {'; '.join(tags)}"
    ]
    full_text = _normalize_space(" ".join([p for p in text_parts if p.strip()]))
    short_preview = stem[:180] if stem else (ideal[:180] if ideal else full_text[:180])
    source_id = f"question:{row['id']}"
    return source_id, full_text, short_preview


def _compose_extracted_text(row: sqlite3.Row) -> Tuple[str, str, str]:
    extracted_text = _normalize_space(row["extracted_text"] or "")
    ideal = _normalize_space(row["extracted_ideal_answer"] or "")
    kp_raw = _safe_json_load(row["detected_key_points"])
    tags_raw = _safe_json_load(row["detected_previous_year_tags"])

    key_points: List[str] = []
    if isinstance(kp_raw, list):
        key_points = [_normalize_space(str(x)) for x in kp_raw if _normalize_space(str(x))]

    tags: List[str] = []
    if isinstance(tags_raw, list):
        tags = [_normalize_space(str(x)) for x in tags_raw if _normalize_space(str(x))]

    text_parts = [
        f"Source: extracted_pdf",
        f"Subject: {row['detected_subject'] or ''}",
        f"Topic: {row['detected_topic'] or ''}",
        f"Subtopic: {row['detected_subtopic'] or ''}",
        f"Type: {row['detected_type'] or ''}",
        f"Text: {extracted_text}",
        f"Ideal answer: {ideal}",
        f"Key points: {'; '.join(key_points)}",
        f"PYQ tags: {'; '.join(tags)}"
    ]
    full_text = _normalize_space(" ".join([p for p in text_parts if p.strip()]))
    short_preview = extracted_text[:180] if extracted_text else full_text[:180]
    source_id = f"extracted:{row['id']}"
    return source_id, full_text, short_preview


def _compose_teaching_unit_text(row: sqlite3.Row) -> Tuple[str, str, str]:
    core = _normalize_space(row["concept_core_block"] or "")
    comp = _normalize_space(row["comparison_tables"] or "")
    clinical = _normalize_space(row["clinical_scenarios"] or "")
    recall = _normalize_space(row["numerical_recall_points"] or "")
    traps = _normalize_space(row["trap_patterns"] or "")

    text_parts = [
        "Source: teaching_unit",
        f"Subject: {row['subject'] or ''}",
        f"Topic: {row['topic'] or ''}",
        f"Core: {core}",
        f"Comparisons: {comp}",
        f"Clinical: {clinical}",
        f"Recall: {recall}",
        f"Traps: {traps}"
    ]
    full_text = _normalize_space(" ".join([p for p in text_parts if p.strip()]))
    short_preview = f"{row['subject'] or ''} / {row['topic'] or ''} teaching unit"
    source_id = f"teaching_unit:{row['id']}"
    return source_id, full_text, short_preview


def _compose_exam_notes_text(row: sqlite3.Row) -> Tuple[str, str, str]:
    trigger = _normalize_space(row["trigger_lines"] or "")
    diff = _normalize_space(row["differentiation_table"] or "")
    recall = _normalize_space(row["recall_bullets"] or "")
    text_parts = [
        "Source: exam_notes",
        f"Subject: {row['subject'] or ''}",
        f"Topic: {row['topic'] or ''}",
        f"Trigger lines: {trigger}",
        f"Differentiation: {diff}",
        f"Recall bullets: {recall}"
    ]
    full_text = _normalize_space(" ".join([p for p in text_parts if p.strip()]))
    short_preview = f"{row['subject'] or ''} / {row['topic'] or ''} exam notes"
    source_id = f"exam_note:{row['id']}"
    return source_id, full_text, short_preview


def _cosine(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def _tokenize(text: str) -> List[str]:
    parts = []
    for token in _normalize_space((text or "").lower()).split(" "):
        t = token.strip(".,:;!?()[]{}\"'")
        if len(t) >= 2:
            parts.append(t)
    return parts


def _lexical_score(query: str, doc: str) -> float:
    q = set(_tokenize(query))
    if not q:
        return 0.0
    d = set(_tokenize(doc))
    if not d:
        return 0.0
    overlap = len(q.intersection(d))
    return overlap / max(1, len(q))


def _embed_texts(texts: List[str], model: str = "text-embedding-3-small") -> List[List[float]]:
    client = _get_openai_client()
    if client is None:
        return []
    response = client.embeddings.create(model=model, input=texts)
    out: List[List[float]] = []
    for item in response.data:
        out.append(list(item.embedding))
    return out


def _read_sources_from_db() -> List[Dict[str, Any]]:
    db_path = _backend_db_path()
    if not os.path.exists(db_path):
        return []

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    sources: List[Dict[str, Any]] = []
    try:
        cur = conn.cursor()

        cur.execute(
            """
            SELECT id, stem, type, subject, topic, subtopic, ideal_answer, key_points, previous_year_tags, updated_at
            FROM question
            WHERE status = 'active'
            """
        )
        for row in cur.fetchall():
            source_id, full_text, preview = _compose_question_text(row)
            if len(full_text) < 30:
                continue
            sources.append({
                "source_id": source_id,
                "source_type": "question",
                "subject": row["subject"] or "",
                "topic": row["topic"] or "",
                "subtopic": row["subtopic"] or "",
                "text": full_text[:3500],
                "preview": preview
            })

        cur.execute(
            """
            SELECT id, extracted_text, detected_type, detected_subject, detected_topic, detected_subtopic,
                   extracted_ideal_answer, detected_key_points, detected_previous_year_tags, extracted_at
            FROM extractedquestion
            WHERE status IN ('draft', 'accepted')
            """
        )
        for row in cur.fetchall():
            source_id, full_text, preview = _compose_extracted_text(row)
            if len(full_text) < 30:
                continue
            sources.append({
                "source_id": source_id,
                "source_type": "extracted",
                "subject": row["detected_subject"] or "",
                "topic": row["detected_topic"] or "",
                "subtopic": row["detected_subtopic"] or "",
                "text": full_text[:3500],
                "preview": preview
            })

        cur.execute(
            """
            SELECT id, subject, topic, concept_core_block, comparison_tables, clinical_scenarios,
                   numerical_recall_points, trap_patterns
            FROM teaching_unit
            """
        )
        for row in cur.fetchall():
            source_id, full_text, preview = _compose_teaching_unit_text(row)
            if len(full_text) < 30:
                continue
            sources.append({
                "source_id": source_id,
                "source_type": "teaching_unit",
                "subject": row["subject"] or "",
                "topic": row["topic"] or "",
                "subtopic": "",
                "text": full_text[:3500],
                "preview": preview
            })

        cur.execute(
            """
            SELECT id, subject, topic, trigger_lines, differentiation_table, recall_bullets
            FROM exam_trigger_notes
            """
        )
        for row in cur.fetchall():
            source_id, full_text, preview = _compose_exam_notes_text(row)
            if len(full_text) < 30:
                continue
            sources.append({
                "source_id": source_id,
                "source_type": "exam_note",
                "subject": row["subject"] or "",
                "topic": row["topic"] or "",
                "subtopic": "",
                "text": full_text[:3500],
                "preview": preview
            })
    finally:
        conn.close()
    return sources


def _fingerprint_sources(sources: List[Dict[str, Any]]) -> str:
    h = hashlib.sha256()
    for src in sorted(sources, key=lambda x: x["source_id"]):
        h.update(src["source_id"].encode("utf-8"))
        h.update(src["text"][:400].encode("utf-8"))
    return h.hexdigest()


def _load_cached_index() -> Optional[Dict[str, Any]]:
    path = _index_cache_path()
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and "documents" in data and "fingerprint" in data:
            return data
    except Exception:
        return None
    return None


def _save_cached_index(index_data: Dict[str, Any]) -> None:
    path = _index_cache_path()
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(index_data, f, ensure_ascii=True)
    os.replace(tmp_path, path)


def build_or_load_context_index(force_rebuild: bool = False) -> Dict[str, Any]:
    sources = _read_sources_from_db()
    fingerprint = _fingerprint_sources(sources)

    if not force_rebuild:
        if _cache["index"] and _cache["index"].get("fingerprint") == fingerprint:
            return _cache["index"]
        cached = _load_cached_index()
        if cached and cached.get("fingerprint") == fingerprint:
            _cache["index"] = cached
            return cached

    docs: List[Dict[str, Any]] = []
    for src in sources:
        docs.append({
            "source_id": src["source_id"],
            "source_type": src["source_type"],
            "subject": src["subject"],
            "topic": src["topic"],
            "subtopic": src["subtopic"],
            "text": src["text"],
            "preview": src["preview"]
        })

    embeddings: List[List[float]] = []
    if docs:
        texts = [d["text"] for d in docs]
        chunk_size = 64
        for i in range(0, len(texts), chunk_size):
            batch = texts[i:i + chunk_size]
            batch_embeddings = _embed_texts(batch)
            if not batch_embeddings or len(batch_embeddings) != len(batch):
                embeddings = []
                break
            embeddings.extend(batch_embeddings)

    has_embeddings = len(embeddings) == len(docs) and len(docs) > 0
    if has_embeddings:
        for i, emb in enumerate(embeddings):
            docs[i]["embedding"] = emb
    else:
        for d in docs:
            d["embedding"] = None

    index_data = {
        "fingerprint": fingerprint,
        "has_embeddings": has_embeddings,
        "documents": docs,
        "count": len(docs)
    }
    _cache["index"] = index_data
    _save_cached_index(index_data)
    return index_data


def _subject_topic_match_score(doc: Dict[str, Any], subject: str, topic: str) -> float:
    score = 0.0
    if subject and doc.get("subject", "").lower() == subject.lower():
        score += 0.2
    if topic and doc.get("topic", "").lower() == topic.lower():
        score += 0.3
    return score


def retrieve_relevant_context(
    query: str,
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    top_k: int = 5,
    force_rebuild: bool = False
) -> Dict[str, Any]:
    query = _normalize_space(query or "")
    if not query:
        return {"results": [], "used_embeddings": False, "total_indexed": 0}

    index_data = build_or_load_context_index(force_rebuild=force_rebuild)
    docs: List[Dict[str, Any]] = index_data.get("documents", [])
    if not docs:
        return {"results": [], "used_embeddings": False, "total_indexed": 0}

    filtered_docs = docs
    if subject or topic:
        filtered_docs = []
        for d in docs:
            if subject and d.get("subject", "").lower() != subject.lower():
                continue
            if topic and d.get("topic", "").lower() != topic.lower():
                continue
            filtered_docs.append(d)
        if len(filtered_docs) == 0:
            filtered_docs = docs

    used_embeddings = False
    query_emb: Optional[List[float]] = None
    if index_data.get("has_embeddings"):
        emb = _embed_texts([query])
        if emb and len(emb) == 1:
            query_emb = emb[0]
            used_embeddings = True

    scored: List[Tuple[float, Dict[str, Any]]] = []
    for d in filtered_docs:
        lexical = _lexical_score(query, d.get("text", ""))
        context_boost = _subject_topic_match_score(d, subject or "", topic or "")
        emb_score = 0.0
        if used_embeddings and query_emb and d.get("embedding"):
            emb_score = _cosine(query_emb, d["embedding"])
        total = (0.72 * emb_score + 0.28 * lexical) if used_embeddings else lexical
        total += context_boost
        if total > 0:
            scored.append((total, d))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:max(1, min(top_k, 10))]
    results = []
    for score, doc in top:
        results.append({
            "score": round(float(score), 4),
            "source_id": doc.get("source_id"),
            "source_type": doc.get("source_type"),
            "subject": doc.get("subject"),
            "topic": doc.get("topic"),
            "subtopic": doc.get("subtopic"),
            "preview": doc.get("preview"),
            "text": doc.get("text")
        })

    return {
        "results": results,
        "used_embeddings": used_embeddings,
        "total_indexed": len(docs)
    }
