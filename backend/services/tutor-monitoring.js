const { db } = require('../db');

function safeJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

async function logTutorEvent(event) {
  const payload = event || {};
  const id = db.generateUUID();
  await db.query(
    `INSERT INTO tutor_event_log
     (id, user_id, session_type, session_id, diagnostic_id, topic_learning_session_id,
      subject, topic, concept_id, concept_map_id, phase, event_type, student_level,
      score, mastery_status, retry_count, attempt_id, next_phase, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      id,
      payload.user_id || null,
      payload.session_type || null,
      payload.session_id || null,
      payload.diagnostic_id || null,
      payload.topic_learning_session_id || null,
      payload.subject || null,
      payload.topic || null,
      payload.concept_id || null,
      payload.concept_map_id || null,
      payload.phase || null,
      payload.event_type || 'unknown',
      payload.student_level || null,
      payload.score != null ? Number(payload.score) : null,
      payload.mastery_status || null,
      payload.retry_count != null ? Number(payload.retry_count) : null,
      payload.attempt_id || null,
      payload.next_phase || null,
      payload.message || null,
      JSON.stringify(payload.metadata || {})
    ]
  );
  return id;
}

async function getTutorMonitoringSummary({ days = 14 } = {}) {
  const dayCount = Math.max(1, parseInt(days, 10) || 14);
  const recentEvents = await db.query(
    `SELECT *
     FROM tutor_event_log
     WHERE created_at >= date('now', '-' || $1 || ' days')
     ORDER BY created_at DESC`,
    [dayCount]
  );

  const eventRows = recentEvents.rows || [];
  const byType = {};
  const byPhase = {};
  const byConcept = {};
  const stuckCandidates = [];

  for (const row of eventRows) {
    const typeKey = row.event_type || 'unknown';
    const phaseKey = row.phase || 'unknown';
    const conceptKey = row.concept_id || row.concept_map_id || `${row.subject || 'unknown'}|${row.topic || 'unknown'}`;
    const metadata = safeJson(row.metadata, {});

    byType[typeKey] = (byType[typeKey] || 0) + 1;
    byPhase[phaseKey] = (byPhase[phaseKey] || 0) + 1;

    if (!byConcept[conceptKey]) {
      byConcept[conceptKey] = {
        concept_id: row.concept_id || null,
        concept_map_id: row.concept_map_id || null,
        subject: row.subject,
        topic: row.topic,
        event_count: 0,
        socratic_turns: 0,
        avg_score_sum: 0,
        scored_events: 0,
        stuck_signals: 0,
        last_event_at: row.created_at
      };
    }

    const bucket = byConcept[conceptKey];
    bucket.event_count += 1;
    if (row.event_type === 'diagnostic_socratic_turn' || row.event_type === 'topic_fix_socratic_turn') {
      bucket.socratic_turns += 1;
    }
    if (typeof row.score === 'number') {
      bucket.avg_score_sum += row.score;
      bucket.scored_events += 1;
    }
    if (metadata?.stuck || metadata?.retry_count >= 3 || metadata?.phase_complete === false) {
      bucket.stuck_signals += 1;
    }
    bucket.last_event_at = row.created_at;
  }

  const concepts = Object.values(byConcept)
    .map(item => ({
      ...item,
      avg_score: item.scored_events > 0 ? Math.round(item.avg_score_sum / item.scored_events) : null
    }))
    .sort((a, b) => {
      const stuckDelta = (b.stuck_signals || 0) - (a.stuck_signals || 0);
      if (stuckDelta !== 0) return stuckDelta;
      const eventDelta = (b.event_count || 0) - (a.event_count || 0);
      if (eventDelta !== 0) return eventDelta;
      return String(a.topic || '').localeCompare(String(b.topic || ''));
    });

  const stuckConcepts = concepts.filter(item => item.stuck_signals > 0 || item.socratic_turns >= 4).slice(0, 20);

  return {
    window_days: dayCount,
    totals: {
      events: eventRows.length,
      tutor_sessions: new Set(eventRows.map(e => `${e.session_type || 'unknown'}|${e.session_id || e.diagnostic_id || e.topic_learning_session_id || 'none'}`)).size,
      concepts_touched: concepts.length,
      stuck_concepts: stuckConcepts.length
    },
    by_event_type: byType,
    by_phase: byPhase,
    recent_events: eventRows.slice(0, 100),
    stuck_concepts: stuckConcepts,
    concept_activity: concepts.slice(0, 50)
  };
}

module.exports = {
  logTutorEvent,
  getTutorMonitoringSummary
};
