const { db } = require('../db');
const { resolveConceptId } = require('./concept-map-pathway');

function parseJsonField(val, fallback = null) {
  if (val == null || val === '') return fallback;
  try {
    return typeof val === 'string' ? JSON.parse(val) : val;
  } catch {
    return fallback;
  }
}

function inferStudentLevel(messages) {
  if (!Array.isArray(messages) || messages.length < 4) return 'average';
  const assistantMsgs = messages.filter(m => m.role === 'assistant');
  const userMsgs = messages.filter(m => m.role === 'user');
  const firstUser = userMsgs[1] || userMsgs[0];
  const firstUserContent = (firstUser && firstUser.content) ? firstUser.content : '';
  const wordCount = firstUserContent.trim().split(/\s+/).filter(Boolean).length;
  const hasMcqVerification = assistantMsgs.some(m => (m.content || '').includes('MCQ') || (m.content || '').includes('A.'));
  const hasSocraticProbes = assistantMsgs.some(m => {
    const c = (m.content || '').toLowerCase();
    return c.includes('which structure') || c.includes('what') && c.includes('?') && !c.includes('MCQ');
  });
  if (wordCount > 80 && hasMcqVerification && !hasSocraticProbes) return 'excellent';
  if (wordCount > 50 && (hasMcqVerification || hasSocraticProbes)) return 'strong';
  if (hasSocraticProbes && wordCount < 40) return 'average';
  return 'average';
}

async function importJsonlLines(lines, options = {}) {
  const { conceptId, conceptMapId, subject, topic, sourceFile } = options;
  const results = { imported: 0, skipped: 0, errors: [] };
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] || '').trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      const messages = obj.messages || [];
      if (!Array.isArray(messages) || messages.length === 0) {
        results.skipped++;
        continue;
      }
      const studentLevel = options.studentLevel || inferStudentLevel(messages);
      let subj = subject;
      let top = topic;
      let cId = conceptId;
      let cMapId = conceptMapId;
      const firstUser = messages.find(m => m.role === 'user');
      const firstContent = (firstUser && firstUser.content) || '';
      if (!subj || !top) {
        if (cId || cMapId) {
          const row = await resolveConceptId(cId || cMapId);
          if (row) {
            subj = row.subject;
            top = row.topic;
            cId = row.id;
            cMapId = row.concept_map_id;
          }
        }
      }
      const id = db.generateUUID();
      await db.query(
        `INSERT INTO tutoring_training_examples
         (id, concept_id, concept_map_id, subject, topic, student_level, messages, source_file)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, cId || null, cMapId || null, subj || null, top || null, studentLevel, JSON.stringify(messages), sourceFile || null]
      );
      results.imported++;
    } catch (e) {
      results.errors.push({ line: i + 1, message: e.message });
      results.skipped++;
    }
  }
  return results;
}

async function listExamples(filters = {}) {
  const { concept_id, concept_map_id, subject, topic, student_level, limit = 50 } = filters;
  let query = 'SELECT * FROM tutoring_training_examples WHERE 1=1';
  const params = [];
  let p = 1;
  if (concept_id) { query += ` AND concept_id = $${p++}`; params.push(concept_id); }
  if (concept_map_id) { query += ` AND concept_map_id = $${p++}`; params.push(concept_map_id); }
  if (subject) { query += ` AND subject = $${p++}`; params.push(subject); }
  if (topic) { query += ` AND topic = $${p++}`; params.push(topic); }
  if (student_level) { query += ` AND student_level = $${p++}`; params.push(student_level); }
  query += ` ORDER BY created_at DESC LIMIT $${p}`;
  params.push(limit);
  const result = await db.query(query, params);
  return (result.rows || []).map(row => ({
    id: row.id,
    concept_id: row.concept_id,
    concept_map_id: row.concept_map_id,
    subject: row.subject,
    topic: row.topic,
    student_level: row.student_level,
    messages: parseJsonField(row.messages, []),
    source_file: row.source_file,
    created_at: row.created_at
  }));
}

async function exportAsJsonl(filters = {}) {
  const examples = await listExamples({ ...filters, limit: 500 });
  return examples.map(ex => JSON.stringify({ messages: ex.messages })).join('\n');
}

async function getExamplesForPrompting(conceptIdOrMapId, studentLevel, limit = 3) {
  const filters = { limit };
  if (conceptIdOrMapId) {
    const resolved = await resolveConceptId(conceptIdOrMapId);
    if (resolved) {
      filters.concept_id = resolved.id;
      filters.concept_map_id = resolved.concept_map_id;
    }
  }
  if (studentLevel) filters.student_level = studentLevel;
  const examples = await listExamples(filters);
  return examples.map(ex => ({ messages: ex.messages }));
}

async function getExamplesForSubjectTopic(subject, topic, studentLevel = null, limit = 3) {
  const filters = { subject, topic, limit };
  if (studentLevel) filters.student_level = studentLevel;
  const examples = await listExamples(filters);
  return examples.map(ex => ({ messages: ex.messages, student_level: ex.student_level }));
}

module.exports = {
  importJsonlLines,
  listExamples,
  exportAsJsonl,
  getExamplesForPrompting,
  getExamplesForSubjectTopic,
  inferStudentLevel
};
