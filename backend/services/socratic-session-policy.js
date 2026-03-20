const SOCRATIC_POLICY_VERSION = '1.0';

const MAX_SOCRATIC_TURNS_BY_LEVEL = {
  excellent: 1,
  strong: 2,
  bored: 1,
  average: 3,
  weak: 4,
  very_weak: 5
};

const LEVELS_SKIP_SOCRATIC_AFTER_SAQ = new Set(['excellent', 'strong', 'bored']);

function getMaxSocraticTurns(level) {
  const key = String(level || 'average').toLowerCase();
  return MAX_SOCRATIC_TURNS_BY_LEVEL[key] ?? MAX_SOCRATIC_TURNS_BY_LEVEL.average;
}

function shouldSkipSocraticAfterSaq(level) {
  return LEVELS_SKIP_SOCRATIC_AFTER_SAQ.has(String(level || '').toLowerCase());
}

function getInitialPhaseAfterSaq(level, scoreResult = {}) {
  const missed = Array.isArray(scoreResult.pointsMissed) ? scoreResult.pointsMissed : [];
  if (shouldSkipSocraticAfterSaq(level)) {
    return {
      phase: 'mcq',
      socraticSkipped: true,
      reason: missed.length === 0 ? 'high_level_no_gaps' : 'high_level_to_mcq'
    };
  }
  return {
    phase: 'socratic',
    socraticSkipped: false,
    reason: 'needs_socratic_scaffolding'
  };
}

function getInitialPhase(level, scoreResult = {}) {
  return getInitialPhaseAfterSaq(level, scoreResult).phase;
}

function getSocraticExitReason({ scoreResult = {}, socraticTurns = [], level }) {
  const missed = Array.isArray(scoreResult.pointsMissed) ? scoreResult.pointsMissed : [];
  const max = getMaxSocraticTurns(level);
  const used = Array.isArray(socraticTurns) ? socraticTurns.length : 0;
  if (missed.length === 0) return 'rubric_complete';
  if (used >= max) return 'turn_cap';
  return null;
}

function getNextPhase({ phase, level, scoreResult = {}, socraticTurns = [] }) {
  const maxSocraticTurns = getMaxSocraticTurns(level);
  const missed = Array.isArray(scoreResult.pointsMissed) ? scoreResult.pointsMissed : [];
  if (phase === 'saq') {
    return getInitialPhaseAfterSaq(level, scoreResult).phase;
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

function getSocraticLifecycleSnapshot({
  phase,
  level,
  scoreResult = {},
  socraticTurns = [],
  hasConcept = true
}) {
  const maxTurns = getMaxSocraticTurns(level);
  const turnsUsed = Array.isArray(socraticTurns) ? socraticTurns.length : 0;
  const missed = Array.isArray(scoreResult.pointsMissed) ? scoreResult.pointsMissed : [];
  const exitReason = phase === 'socratic'
    ? getSocraticExitReason({ scoreResult, socraticTurns, level })
    : null;
  const nextPhase = getNextPhase({ phase, level, scoreResult, socraticTurns });
  const afterSaq = getInitialPhaseAfterSaq(level, scoreResult);
  return {
    policy_version: SOCRATIC_POLICY_VERSION,
    has_concept: hasConcept,
    level: level || 'average',
    phase,
    max_socratic_turns: maxTurns,
    socratic_turns_used: turnsUsed,
    socratic_turns_remaining: Math.max(0, maxTurns - turnsUsed),
    missing_point_count: missed.length,
    socratic_exit_reason: exitReason,
    next_phase: nextPhase,
    starts_socratic_after_saq: Boolean(hasConcept && afterSaq.phase === 'socratic'),
    in_socratic_phase: Boolean(hasConcept && phase === 'socratic')
  };
}

function exportPolicyDefinition() {
  return {
    version: SOCRATIC_POLICY_VERSION,
    start_after_saq: {
      when: 'student_level is not excellent, strong, or bored',
      otherwise: 'phase goes to mcq (Socratic block skipped)',
      requires_concept: true
    },
    end_socratic_when: [
      'no rubric points remain missed',
      'student has used max Socratic turns for their level'
    ],
    after_socratic_block: 'final_recall then mcq',
    max_turns_by_level: { ...MAX_SOCRATIC_TURNS_BY_LEVEL }
  };
}

module.exports = {
  SOCRATIC_POLICY_VERSION,
  MAX_SOCRATIC_TURNS_BY_LEVEL,
  getMaxSocraticTurns,
  shouldSkipSocraticAfterSaq,
  getInitialPhaseAfterSaq,
  getInitialPhase,
  getSocraticExitReason,
  getNextPhase,
  getSocraticLifecycleSnapshot,
  exportPolicyDefinition
};
