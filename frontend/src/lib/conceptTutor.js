import api from './api.js';

export async function getTutorFlowPlan({ conceptId, studentLevel = 'average', answerText = '', phase = 'saq', socraticTurns = [], usedMcqIds = [] }) {
  if (!conceptId) return null;
  const response = await api.post('/concept-map/tutor-flow/plan', {
    concept_id: conceptId,
    student_level: studentLevel,
    answer_text: answerText,
    phase,
    socratic_turns: socraticTurns,
    used_mcq_ids: usedMcqIds
  });
  return response.data?.tutor_flow || null;
}

export async function getNextConceptSuggestion({ conceptId = null, subject = null, topic = null, studentLevel = 'average', completedConceptIds = [] }) {
  const params = {};
  if (conceptId) params.current_concept_id = conceptId;
  if (subject) params.subject = subject;
  if (topic) params.topic = topic;
  if (studentLevel) params.student_level = studentLevel;
  if (Array.isArray(completedConceptIds) && completedConceptIds.length > 0) {
    params.completed_concept_ids = completedConceptIds.join(',');
  }
  const response = await api.get('/concept-map/graph/next-best', { params });
  return response.data?.next_concept || null;
}

