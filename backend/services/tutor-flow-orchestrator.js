const { buildTutorPrompt } = require('./diagnostic-tutor-rules');
const { buildTutorStep } = require('./diagnostic-tutor-engine');

function getMaxSocraticTurns(level) {
  switch ((level || 'average').toLowerCase()) {
    case 'excellent':
      return 1;
    case 'strong':
      return 2;
    case 'bored':
      return 1;
    case 'average':
      return 3;
    case 'weak':
      return 4;
    case 'very_weak':
      return 5;
    default:
      return 3;
  }
}

function getInitialPhase(level, scoreResult = {}) {
  const highLevel = ['excellent', 'strong', 'bored'].includes((level || '').toLowerCase());
  const missed = Array.isArray(scoreResult.pointsMissed) ? scoreResult.pointsMissed : [];
  if (highLevel && missed.length === 0) return 'mcq';
  if (highLevel) return 'mcq';
  return 'socratic';
}

function getNextPhase({ phase, level, scoreResult = {}, socraticTurns = [] }) {
  const maxSocraticTurns = getMaxSocraticTurns(level);
  const missed = Array.isArray(scoreResult.pointsMissed) ? scoreResult.pointsMissed : [];
  if (phase === 'saq') {
    return getInitialPhase(level, scoreResult);
  }
  if (phase === 'socratic') {
    if (missed.length === 0 || socraticTurns.length >= maxSocraticTurns) {
      return 'final_recall';
    }
    return 'socratic';
  }
  if (phase === 'final_recall') {
    return 'mcq';
  }
  return 'mcq';
}

function buildFinalRecallPrompt() {
  return 'Now summarize the full answer in 4-5 exam sentences.';
}

function buildTutorFlowPlan({
  concept,
  studentLevelResult,
  scoreResult,
  answerText,
  phase = 'saq',
  socraticTurns = [],
  usedMcqIds = []
}) {
  const level = studentLevelResult?.level || 'average';
  const tutorStep = concept
    ? buildTutorStep({
        concept,
        studentLevelResult,
        scoreResult,
        answerText: answerText || '',
        usedMcqIds
      })
    : null;

  const nextPhase = getNextPhase({
    phase,
    level,
    scoreResult,
    socraticTurns
  });

  const nextTeacherPrompt = phase === 'final_recall'
    ? buildFinalRecallPrompt()
    : (concept ? buildTutorPrompt(concept, level, scoreResult, answerText || '') : null);

  return {
    phase: nextPhase,
    tutor_step: tutorStep,
    next_teacher_prompt: nextPhase === 'mcq' ? null : nextTeacherPrompt,
    final_recall_prompt: buildFinalRecallPrompt(),
    socratic_turn_limit: getMaxSocraticTurns(level),
    tutor_mode: tutorStep?.tutor_mode || null,
    mcq_plan: tutorStep && nextPhase === 'mcq' ? tutorStep : null
  };
}

module.exports = {
  getMaxSocraticTurns,
  getInitialPhase,
  getNextPhase,
  buildFinalRecallPrompt,
  buildTutorFlowPlan
};
