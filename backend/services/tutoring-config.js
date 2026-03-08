const { db } = require('../db');

const DEFAULT_CONFIG = {
  mcq_preference_excellent: 0.8,
  mcq_preference_strong: 0.7,
  mcq_preference_average: 0.4,
  mcq_preference_weak: 0.2,
  mcq_preference_very_weak: 0.1,
  mcq_preference_bored: 0.9,
  socratic_first_probes: 1,
  force_socratic_until_tier: 2,
  level_threshold_excellent: 90,
  level_threshold_strong: 75,
  level_threshold_average: 50,
  level_threshold_weak: 30,
  level_bored_min_words: 15,
  level_bored_compact_similarity: 0.85
};

const TUTORING_PARAM_NAMES = [
  'mcq_preference_excellent', 'mcq_preference_strong', 'mcq_preference_average',
  'mcq_preference_weak', 'mcq_preference_very_weak', 'mcq_preference_bored',
  'socratic_first_probes', 'force_socratic_until_tier',
  'level_threshold_excellent', 'level_threshold_strong', 'level_threshold_average', 'level_threshold_weak',
  'level_bored_min_words', 'level_bored_compact_similarity'
];

async function loadTutoringConfig() {
  try {
    const placeholders = TUTORING_PARAM_NAMES.map((_, i) => `$${i + 1}`).join(', ');
    const result = await db.query(
      `SELECT parameter_name, parameter_value FROM system_tuning_parameters
       WHERE parameter_name IN (${placeholders})`,
      TUTORING_PARAM_NAMES
    );
    const config = { ...DEFAULT_CONFIG };
    (result.rows || []).forEach(r => {
      const name = r.parameter_name;
      const val = parseFloat(r.parameter_value);
      if (!isNaN(val) && name in config) {
        config[name] = name.includes('similarity') || name.includes('preference') ? val : Math.round(val);
      }
    });
    return config;
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveTutoringConfig(params) {
  const crypto = require('crypto');
  for (const [name, value] of Object.entries(params)) {
    if (!(name in DEFAULT_CONFIG)) continue;
    const numVal = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numVal)) continue;
    const existing = await db.query(
      'SELECT id FROM system_tuning_parameters WHERE parameter_name = $1',
      [name]
    );
    const table = name.includes('preference') || name.includes('similarity') ? 'weight' : 'threshold';
    const type = name.includes('probes') || name.includes('tier') || name.includes('words') ? 'other' : table;
    const category = 'competency';
    if (existing.rows && existing.rows.length > 0) {
      await db.query(
        'UPDATE system_tuning_parameters SET parameter_value = $1, parameter_type = $2, category = $3 WHERE parameter_name = $4',
        [numVal, type, category, name]
      );
    } else {
      const paramId = crypto.randomUUID();
      await db.query(
        `INSERT INTO system_tuning_parameters (id, parameter_name, parameter_value, parameter_type, category)
         VALUES ($1, $2, $3, $4, $5)`,
        [paramId, name, numVal, type, category]
      );
    }
  }
  return loadTutoringConfig();
}

function getSocraticMcqConfigFromTutoring(tutoringConfig) {
  return {
    mcq_preference_excellent: tutoringConfig.mcq_preference_excellent,
    mcq_preference_strong: tutoringConfig.mcq_preference_strong,
    mcq_preference_average: tutoringConfig.mcq_preference_average,
    mcq_preference_weak: tutoringConfig.mcq_preference_weak,
    mcq_preference_very_weak: tutoringConfig.mcq_preference_very_weak,
    mcq_preference_bored: tutoringConfig.mcq_preference_bored,
    socratic_first_probes: tutoringConfig.socratic_first_probes,
    force_socratic_until_tier: tutoringConfig.force_socratic_until_tier
  };
}

function getLevelThresholdsFromTutoring(tutoringConfig) {
  return {
    excellent: tutoringConfig.level_threshold_excellent,
    strong: tutoringConfig.level_threshold_strong,
    average: tutoringConfig.level_threshold_average,
    weak: tutoringConfig.level_threshold_weak,
    bored_min_words: tutoringConfig.level_bored_min_words,
    bored_compact_similarity: tutoringConfig.level_bored_compact_similarity
  };
}

module.exports = {
  DEFAULT_CONFIG,
  loadTutoringConfig,
  saveTutoringConfig,
  getSocraticMcqConfigFromTutoring,
  getLevelThresholdsFromTutoring
};
