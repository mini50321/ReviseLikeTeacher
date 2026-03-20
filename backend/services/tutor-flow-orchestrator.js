const { buildTutorPrompt } = require('./diagnostic-tutor-rules');
const { buildTutorStep } = require('./diagnostic-tutor-engine');
const {
  getMaxSocraticTurns,
  getInitialPhase,
  getNextPhase
} = require('./socratic-session-policy');

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
    : (concept ? buildTutorPrompt(concept, level, scoreResult, answerText || '', {
        socraticTurnCount: Array.isArray(socraticTurns) ? socraticTurns.length : 0
      }) : null);

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
