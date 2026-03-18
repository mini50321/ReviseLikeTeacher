const crypto = require('crypto');
const { db, initDatabase } = require('../db');

function parseJsonField(val, defaultValue = null) {
  if (val == null || val === '') return defaultValue;
  try {
    return typeof val === 'string' ? JSON.parse(val) : val;
  } catch {
    return defaultValue;
  }
}

function normalizeConceptConcepts(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeConceptRecord(input, fallback = {}) {
  const source = input || {};
  const subject = (source.subject || fallback.subject || '').trim();
  const topic = (source.topic || fallback.topic || '').trim();
  const conceptKey = (source.concept_key || source.concept_id || fallback.concept_key || '').trim();
  const name = (source.name || fallback.name || '').trim();

  const normalized = {
    subject,
    topic,
    concept_key: conceptKey,
    concept_map_id: source.concept_map_id || fallback.concept_map_id || null,
    name,
    display_order: source.display_order != null ? Number(source.display_order) : (fallback.display_order != null ? Number(fallback.display_order) : 0),
    concept_weight: source.concept_weight != null ? Number(source.concept_weight) : (fallback.concept_weight != null ? Number(fallback.concept_weight) : 1),
    section: source.section || fallback.section || null,
    chapter: source.chapter || fallback.chapter || null,
    main_topic: source.main_topic || fallback.main_topic || null,
    subtopic: source.subtopic || fallback.subtopic || null,
    prerequisite_concept_ids: normalizeConceptConcepts(source.prerequisite_concept_ids || fallback.prerequisite_concept_ids),
    downstream_concept_ids: normalizeConceptConcepts(source.downstream_concept_ids || fallback.downstream_concept_ids),
    must_know_points: normalizeConceptConcepts(source.must_know_points || fallback.must_know_points),
    deep_points: normalizeConceptConcepts(source.deep_points || fallback.deep_points),
    traps: normalizeConceptConcepts(source.traps || fallback.traps),
    saqs: normalizeConceptConcepts(source.saqs || fallback.saqs),
    mcqs: normalizeConceptConcepts(source.mcqs || fallback.mcqs),
    leading_questions: normalizeConceptConcepts(source.leading_questions || fallback.leading_questions),
    grading_rubric: normalizeConceptConcepts(source.grading_rubric || fallback.grading_rubric),
    example_phrases: normalizeConceptConcepts(source.example_phrases || fallback.example_phrases),
    micro_questions: normalizeConceptConcepts(source.micro_questions || fallback.micro_questions),
    gross_prompt: source.gross_prompt || fallback.gross_prompt || null
  };

  if (!normalized.subject || !normalized.topic || !normalized.concept_key || !normalized.name) {
    throw new Error('subject, topic, concept_key, and name are required');
  }

  return normalized;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map(stableStringifyItem));
  }
  if (value && typeof value === 'object') {
    const ordered = {};
    for (const key of Object.keys(value).sort()) {
      ordered[key] = stableStringifyItem(value[key]);
    }
    return JSON.stringify(ordered);
  }
  return JSON.stringify(value);
}

function stableStringifyItem(value) {
  if (Array.isArray(value)) return value.map(stableStringifyItem);
  if (value && typeof value === 'object') {
    const ordered = {};
    for (const key of Object.keys(value).sort()) {
      ordered[key] = stableStringifyItem(value[key]);
    }
    return ordered;
  }
  return value;
}

function computeConceptSnapshot(concept) {
  const payload = {
    subject: concept.subject,
    topic: concept.topic,
    concept_key: concept.concept_key,
    concept_map_id: concept.concept_map_id || null,
    name: concept.name,
    display_order: concept.display_order,
    concept_weight: concept.concept_weight,
    section: concept.section,
    chapter: concept.chapter,
    main_topic: concept.main_topic,
    subtopic: concept.subtopic,
    prerequisite_concept_ids: concept.prerequisite_concept_ids,
    downstream_concept_ids: concept.downstream_concept_ids,
    must_know_points: concept.must_know_points,
    deep_points: concept.deep_points,
    traps: concept.traps,
    saqs: concept.saqs,
    mcqs: concept.mcqs,
    leading_questions: concept.leading_questions,
    grading_rubric: concept.grading_rubric,
    example_phrases: concept.example_phrases,
    micro_questions: concept.micro_questions,
    gross_prompt: concept.gross_prompt
  };
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function normalizePromptLike(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object') {
    if (typeof value.prompt === 'string') return value.prompt.trim() || null;
    if (typeof value.content === 'string') return value.content.trim() || null;
    if (typeof value.text === 'string') return value.text.trim() || null;
  }
  return null;
}

function safeLabel(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object') {
    if (typeof value.label === 'string') return value.label.trim() || null;
    if (typeof value.description === 'string') return value.description.trim() || null;
    if (typeof value.text === 'string') return value.text.trim() || null;
  }
  return null;
}

function buildExtractedSummary(concept) {
  const mustKnow = Array.isArray(concept.must_know_points) ? concept.must_know_points : [];
  const deep = Array.isArray(concept.deep_points) ? concept.deep_points : [];
  const saqs = Array.isArray(concept.saqs) ? concept.saqs : [];
  const mcqs = Array.isArray(concept.mcqs) ? concept.mcqs : [];
  const leading = Array.isArray(concept.leading_questions) ? concept.leading_questions : [];
  const traps = Array.isArray(concept.traps) ? concept.traps : [];
  const prereq = Array.isArray(concept.prerequisite_concept_ids) ? concept.prerequisite_concept_ids : [];
  const downstream = Array.isArray(concept.downstream_concept_ids) ? concept.downstream_concept_ids : [];

  const coreSamples = mustKnow.map(safeLabel).filter(Boolean).slice(0, 4);
  const deepSamples = deep.map(safeLabel).filter(Boolean).slice(0, 3);
  const leadingSamples = leading.map(normalizePromptLike).filter(Boolean).slice(0, 4);
  const saqSamples = saqs.map(s => normalizePromptLike(s && (s.question || s.prompt || s.text))).filter(Boolean).slice(0, 2);
  const mcqSamples = mcqs.map(m => normalizePromptLike(m && (m.question || m.prompt || m.text))).filter(Boolean).slice(0, 2);
  const trapSamples = traps.map(normalizePromptLike).filter(Boolean).slice(0, 3);

  return {
    gross_prompt: normalizePromptLike(concept.gross_prompt) || (saqs[0] ? normalizePromptLike(saqs[0].question) : null),
    counts: {
      core_points: mustKnow.length,
      deep_points: deep.length,
      saqs: saqs.length,
      mcqs: mcqs.length,
      leading_prompts: leading.length,
      traps: traps.length,
      prerequisite_concepts: prereq.length,
      downstream_concepts: downstream.length
    },
    samples: {
      core_points: coreSamples,
      deep_points: deepSamples,
      leading_prompts: leadingSamples,
      saqs: saqSamples,
      mcqs: mcqSamples,
      traps: trapSamples,
      prerequisites: prereq.slice(0, 4),
      downstream: downstream.slice(0, 4)
    }
  };
}

function serializeConceptRow(row) {
  if (!row) return null;
  const parsed = (field, fallback) => parseJsonField(row[field], fallback);
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    concept_key: row.concept_key,
    concept_map_id: row.concept_map_id,
    name: row.name,
    display_order: row.display_order,
    concept_weight: row.concept_weight,
    section: row.section,
    chapter: row.chapter,
    main_topic: row.main_topic,
    subtopic: row.subtopic,
    prerequisite_concept_ids: parsed('prerequisite_concept_ids', []),
    downstream_concept_ids: parsed('downstream_concept_ids', []),
    must_know_points: parsed('must_know_points', []),
    deep_points: parsed('deep_points', []),
    traps: parsed('traps', []),
    saqs: parsed('saqs', []),
    mcqs: parsed('mcqs', []),
    leading_questions: parsed('leading_questions', []),
    grading_rubric: parsed('grading_rubric', []),
    example_phrases: parsed('example_phrases', []),
    micro_questions: parsed('micro_questions', []),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function ensureGrossPrompt(concept) {
  const grossPrompt = concept.gross_prompt || (concept.saqs[0] && concept.saqs[0].question) || null;
  if (!grossPrompt) return null;
  const existingPrompt = await db.query(
    'SELECT id FROM topic_gross_prompt WHERE subject = $1 AND topic = $2',
    [concept.subject, concept.topic]
  );
  if (existingPrompt.rows && existingPrompt.rows.length > 0) {
    return { status: 'exists' };
  }
  const promptId = db.generateUUID();
  await db.query(
    'INSERT INTO topic_gross_prompt (id, subject, topic, prompt_text) VALUES ($1, $2, $3, $4)',
    [promptId, concept.subject, concept.topic, grossPrompt]
  );
  return { status: 'created' };
}

async function upsertMicroPdfConcept(rawInput, fallback = {}) {
  await initDatabase();
  const concept = normalizeConceptRecord(rawInput, fallback);

  const existing = await db.query(
    'SELECT * FROM topic_concept WHERE subject = $1 AND topic = $2 AND concept_key = $3',
    [concept.subject, concept.topic, concept.concept_key]
  );

  const conceptSnapshot = computeConceptSnapshot(concept);

  const fields = {
    concept_map_id: concept.concept_map_id,
    name: concept.name,
    display_order: concept.display_order,
    concept_weight: concept.concept_weight,
    section: concept.section,
    chapter: concept.chapter,
    main_topic: concept.main_topic,
    subtopic: concept.subtopic,
    prerequisite_concept_ids: JSON.stringify(concept.prerequisite_concept_ids),
    downstream_concept_ids: JSON.stringify(concept.downstream_concept_ids),
    must_know_points: JSON.stringify(concept.must_know_points),
    deep_points: JSON.stringify(concept.deep_points),
    traps: JSON.stringify(concept.traps),
    saqs: JSON.stringify(concept.saqs),
    mcqs: JSON.stringify(concept.mcqs),
    leading_questions: JSON.stringify(concept.leading_questions),
    grading_rubric: JSON.stringify(concept.grading_rubric),
    example_phrases: JSON.stringify(concept.example_phrases),
    micro_questions: JSON.stringify(concept.micro_questions)
  };

  if (existing.rows && existing.rows.length > 0) {
    const row = existing.rows[0];
    const existingSnapshot = computeConceptSnapshot(serializeConceptRow(row));
    const prompts = [];
    let action = 'updated';

    if (existingSnapshot === conceptSnapshot) {
      action = 'skipped';
      prompts.push('Concept already matches current data');
    } else {
      await db.query(
        `UPDATE topic_concept SET
          concept_map_id = $1,
          name = $2,
          display_order = $3,
          concept_weight = $4,
          section = $5,
          chapter = $6,
          main_topic = $7,
          subtopic = $8,
          prerequisite_concept_ids = $9,
          downstream_concept_ids = $10,
          must_know_points = $11,
          deep_points = $12,
          traps = $13,
          saqs = $14,
          mcqs = $15,
          leading_questions = $16,
          grading_rubric = $17,
          example_phrases = $18,
          micro_questions = $19,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $20`,
        [
          fields.concept_map_id,
          fields.name,
          fields.display_order,
          fields.concept_weight,
          fields.section,
          fields.chapter,
          fields.main_topic,
          fields.subtopic,
          fields.prerequisite_concept_ids,
          fields.downstream_concept_ids,
          fields.must_know_points,
          fields.deep_points,
          fields.traps,
          fields.saqs,
          fields.mcqs,
          fields.leading_questions,
          fields.grading_rubric,
          fields.example_phrases,
          fields.micro_questions,
          row.id
        ]
      );
    }

    const promptResult = await ensureGrossPrompt(concept);
    if (promptResult && promptResult.status === 'exists') {
      prompts.push('Gross prompt already existed');
    }

    return {
      action,
      id: row.id,
      subject: concept.subject,
      topic: concept.topic,
      concept_key: concept.concept_key,
      name: concept.name,
      snapshot: conceptSnapshot,
      extracted: buildExtractedSummary(concept),
      warnings: prompts
    };
  }

  const id = db.generateUUID();
  await db.query(
    `INSERT INTO topic_concept
     (id, subject, topic, concept_key, concept_map_id, name, display_order, concept_weight,
      section, chapter, main_topic, subtopic,
      prerequisite_concept_ids, downstream_concept_ids,
      must_know_points, deep_points, traps, saqs, mcqs,
      leading_questions, grading_rubric, example_phrases, micro_questions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
    [
      id,
      concept.subject,
      concept.topic,
      concept.concept_key,
      fields.concept_map_id,
      fields.name,
      fields.display_order,
      fields.concept_weight,
      fields.section,
      fields.chapter,
      fields.main_topic,
      fields.subtopic,
      fields.prerequisite_concept_ids,
      fields.downstream_concept_ids,
      fields.must_know_points,
      fields.deep_points,
      fields.traps,
      fields.saqs,
      fields.mcqs,
      fields.leading_questions,
      fields.grading_rubric,
      fields.example_phrases,
      fields.micro_questions
    ]
  );
  const promptResult = await ensureGrossPrompt(concept);

  return {
    action: 'created',
    id,
    subject: concept.subject,
    topic: concept.topic,
    concept_key: concept.concept_key,
    name: concept.name,
    snapshot: conceptSnapshot,
    extracted: buildExtractedSummary(concept),
    warnings: promptResult && promptResult.status === 'created' ? ['Gross prompt created'] : []
  };
}

async function importMicroPdfConceptBatch(items, fallback = {}) {
  const results = [];
  const seen = new Set();

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] || {};
    try {
      const normalized = normalizeConceptRecord(item, fallback);
      const dedupeKey = `${normalized.subject}|${normalized.topic}|${normalized.concept_key}`;
      const batchWarnings = [];
      if (seen.has(dedupeKey)) {
        batchWarnings.push('Duplicate concept in batch');
      }
      seen.add(dedupeKey);

      const result = await upsertMicroPdfConcept(normalized);
      results.push({
        index: i,
        status: result.action,
        ...result,
        warnings: [...(result.warnings || []), ...batchWarnings]
      });
    } catch (error) {
      results.push({
        index: i,
        status: 'failed',
        error: error.message || 'Import failed'
      });
    }
  }

  return {
    total: items.length,
    created: results.filter(r => r.status === 'created').length,
    updated: results.filter(r => r.status === 'updated').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    failed: results.filter(r => r.status === 'failed').length,
    results
  };
}

function extractConceptItemsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.concepts)) return payload.concepts;
  if (Array.isArray(payload.items)) return payload.items;
  if (payload.concept) return [payload.concept];
  return [payload];
}

module.exports = {
  parseJsonField,
  normalizeConceptRecord,
  computeConceptSnapshot,
  serializeConceptRow,
  upsertMicroPdfConcept,
  importMicroPdfConceptBatch,
  extractConceptItemsFromPayload
};

