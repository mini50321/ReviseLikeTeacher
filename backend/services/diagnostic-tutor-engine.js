const { selectNextPrompt, getTunableConfig } = require('./socratic-mcq-selector');

function getMcqLoadForLevel(level) {
  switch (level) {
    case 'excellent':
      return { min: 3, max: 3, branch: 'excellent' };
    case 'strong':
      return { min: 2, max: 3, branch: 'strong' };
    case 'average':
      return { min: 3, max: 4, branch: 'average' };
    case 'weak':
      return { min: 4, max: 4, branch: 'weak' };
    case 'very_weak':
      return { min: 4, max: 5, branch: 'very_weak' };
    case 'bored':
      return { min: 3, max: 4, branch: 'excellent' };
    default:
      return { min: 3, max: 4, branch: 'average' };
  }
}

function decideTutorMode(studentLevel, pointsHit, pointsMissed) {
  const hasMissed = Array.isArray(pointsMissed) && pointsMissed.length > 0;
  const high = ['excellent', 'strong', 'bored'].includes(studentLevel);
  if (high && !hasMissed) {
    return { mode: 'mcq_only', reason: 'high_level_no_missed_points' };
  }
  if (!hasMissed) {
    return { mode: 'mcq_focus', reason: 'no_missed_points' };
  }
  if (studentLevel === 'very_weak' || studentLevel === 'weak') {
    return { mode: 'socratic_then_mcq', reason: 'low_level_needs_reconstruction' };
  }
  return { mode: 'mixed', reason: 'average_or_better_with_gaps' };
}

function buildMcqPlan(concept, studentLevel, usedMcqIds = []) {
  const config = getTunableConfig();
  const mcqLoad = getMcqLoadForLevel(studentLevel);
  const mcqs = [];
  const used = Array.isArray(usedMcqIds) ? [...usedMcqIds] : [];
  const conceptWrapper = {
    ...concept,
    mcqs: Array.isArray(concept.mcqs) ? concept.mcqs : []
  };
  const currentPoint = null;
  let safety = mcqLoad.max + 3;

  while (mcqs.length < mcqLoad.min && safety > 0) {
    const prompt = selectNextPrompt({
      concept: conceptWrapper,
      currentPoint,
      studentLevel,
      probeCount: 0,
      leadingTier: 3,
      usedMcqIds: used,
      config
    });
    if (prompt.type === 'mcq' && prompt.mcq) {
      mcqs.push(prompt.mcq);
      used.push(prompt.mcq.id);
    }
    safety -= 1;
    if (!prompt.mcq) break;
  }

  return {
    branch: getMcqLoadForLevel(studentLevel).branch,
    required_mcqs: mcqLoad.min,
    max_mcqs: mcqLoad.max,
    mcqs
  };
}

function buildTutorStep({ concept, studentLevelResult, scoreResult, answerText, usedMcqIds }) {
  const level = studentLevelResult.level || 'average';
  const modeDecision = decideTutorMode(level, scoreResult.pointsHit || [], scoreResult.pointsMissed || []);
  const mcqPlan = buildMcqPlan(concept, level, usedMcqIds);

  return {
    student_level: level,
    tutor_mode: modeDecision.mode,
    tutor_reason: modeDecision.reason,
    mcq_branch: mcqPlan.branch,
    required_mcqs: mcqPlan.required_mcqs,
    max_mcqs: mcqPlan.max_mcqs,
    mcqs: mcqPlan.mcqs
  };
}

module.exports = {
  getMcqLoadForLevel,
  decideTutorMode,
  buildMcqPlan,
  buildTutorStep
};

