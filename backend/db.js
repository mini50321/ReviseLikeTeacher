const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

let SQL;
let db;

const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
const schemaPath = path.join(__dirname, 'database', 'schema.sqlite.sql');

const initDatabase = async () => {
  try {
    SQL = await initSqlJs();
    
    let dbData = null;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      dbData = new Uint8Array(buffer);
    }
    
    db = new SQL.Database(dbData);
    
    if (!dbData) {
      console.log('📦 Initializing database...');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      db.run(schema);
      saveDatabase();
      console.log('✅ Database schema initialized');
    } else {
      console.log('✅ Database loaded');
      runMigrations();
    }
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
};

const getTableColumns = (tableName) => {
  try {
    const info = db.exec(`PRAGMA table_info(${tableName})`);
    return info[0]?.values.map(row => row[1]) || [];
  } catch {
    return [];
  }
};

const tableExists = (tableName) => {
  try {
    const result = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
    return result.length > 0 && result[0].values.length > 0;
  } catch {
    return false;
  }
};

const addColumnIfMissing = (table, column, definition) => {
  const columns = getTableColumns(table);
  if (!columns.includes(column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`✅ Migration: Added ${column} to ${table}`);
  }
};

const createTableIfMissing = (tableName, createSQL) => {
  if (!tableExists(tableName)) {
    db.run(createSQL);
    console.log(`✅ Migration: Created table ${tableName}`);
  }
};

const createIndexIfMissing = (indexName, createSQL) => {
  try {
    const result = db.exec(`SELECT name FROM sqlite_master WHERE type='index' AND name='${indexName}'`);
    if (result.length === 0 || result[0].values.length === 0) {
      db.run(createSQL);
    }
  } catch {}
};

const runMigrations = () => {
  try {
    addColumnIfMissing('question', 'options', 'TEXT');
    addColumnIfMissing('question', 'correct_answer', 'TEXT');
    addColumnIfMissing('question', 'yield_category', 'TEXT');
    addColumnIfMissing('question', 'distractor_analysis', 'TEXT');
    addColumnIfMissing('question', 'concept_tags', 'TEXT');
    addColumnIfMissing('question', 'trap_pattern', 'TEXT');
    createIndexIfMissing('idx_question_yield_category', 'CREATE INDEX idx_question_yield_category ON question(yield_category)');
    createIndexIfMissing('idx_question_subject_topic_subtopic', 'CREATE INDEX idx_question_subject_topic_subtopic ON question(subject, topic, subtopic)');

    addColumnIfMissing('extractedquestion', 'extracted_options', 'TEXT');
    addColumnIfMissing('extractedquestion', 'extracted_correct_answer', 'TEXT');
    addColumnIfMissing('extractedquestion', 'extracted_ideal_answer', 'TEXT');
    addColumnIfMissing('extractedquestion', 'frequency_count', 'INTEGER DEFAULT 1');
    addColumnIfMissing('extractedquestion', 'most_recent_year', 'INTEGER');
    addColumnIfMissing('extractedquestion', 'yield_category', 'TEXT');
    addColumnIfMissing('extractedquestion', 'detected_distractor_analysis', 'TEXT');
    addColumnIfMissing('extractedquestion', 'detected_concept_tags', 'TEXT');
    addColumnIfMissing('extractedquestion', 'detected_trap_pattern', 'TEXT');
    createIndexIfMissing('idx_extractedquestion_yield', 'CREATE INDEX idx_extractedquestion_yield ON extractedquestion(yield_category)');

    // Store raw extracted PDF text per upload (for future concept-map building)
    addColumnIfMissing('pdfupload', 'raw_text', 'TEXT');
    addColumnIfMissing('pdfupload', 'raw_text_length', 'INTEGER');

    addColumnIfMissing('userprofile', 'goal_tier', "TEXT DEFAULT 'good_rank'");
    addColumnIfMissing('userprofile', 'student_category', "TEXT DEFAULT 'average'");
    addColumnIfMissing('userprofile', 'subscription_tier', "TEXT DEFAULT 'free'");
    addColumnIfMissing('userprofile', 'learner_profile', 'TEXT');
    addColumnIfMissing('userprofile', 'time_budget', 'TEXT');

    addColumnIfMissing('attempt', 'misconception_type', 'TEXT');
    addColumnIfMissing('attempt', 'misconception_tags', 'TEXT');
    addColumnIfMissing('attempt', 'concept_tested', 'TEXT');
    addColumnIfMissing('attempt', 'distractor_chosen_meaning', 'TEXT');
    createIndexIfMissing('idx_attempt_misconception', 'CREATE INDEX idx_attempt_misconception ON attempt(misconception_type)');

    addColumnIfMissing('topicmastery', 'mastery_status', "TEXT DEFAULT 'not_started'");
    addColumnIfMissing('topicmastery', 'competency_score', 'REAL DEFAULT 0.00');
    addColumnIfMissing('topicmastery', 'diagnostic_level', 'TEXT');
    addColumnIfMissing('topicmastery', 'saq_raw_score', 'REAL');
    addColumnIfMissing('topicmastery', 'mcq_accuracy', 'REAL');
    addColumnIfMissing('topicmastery', 'core_coverage', 'REAL DEFAULT 0.00');
    createIndexIfMissing('idx_topicmastery_mastery_status', 'CREATE INDEX idx_topicmastery_mastery_status ON topicmastery(mastery_status)');

    createIndexIfMissing('idx_session_type', 'CREATE INDEX idx_session_type ON session(session_type)');

    createTableIfMissing('subtopic_yield', `
      CREATE TABLE subtopic_yield (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        subtopic TEXT NOT NULL,
        pyq_count INTEGER DEFAULT 0,
        yield_category TEXT NOT NULL CHECK (yield_category IN ('core', 'frequent', 'occasional', 'rare')),
        years_appeared TEXT,
        most_recent_year INTEGER,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(subject, topic, subtopic)
      )
    `);
    createIndexIfMissing('idx_subtopic_yield_subject', 'CREATE INDEX idx_subtopic_yield_subject ON subtopic_yield(subject)');
    createIndexIfMissing('idx_subtopic_yield_topic', 'CREATE INDEX idx_subtopic_yield_topic ON subtopic_yield(topic)');
    createIndexIfMissing('idx_subtopic_yield_category', 'CREATE INDEX idx_subtopic_yield_category ON subtopic_yield(yield_category)');
    createIndexIfMissing('idx_subtopic_yield_subject_topic', 'CREATE INDEX idx_subtopic_yield_subject_topic ON subtopic_yield(subject, topic)');

    createTableIfMissing('teaching_unit', `
      CREATE TABLE teaching_unit (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        concept_core_block TEXT,
        comparison_tables TEXT,
        clinical_scenarios TEXT,
        numerical_recall_points TEXT,
        trap_patterns TEXT,
        generated_by TEXT,
        generated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(subject, topic)
      )
    `);
    createIndexIfMissing('idx_teaching_unit_subject', 'CREATE INDEX idx_teaching_unit_subject ON teaching_unit(subject)');
    createIndexIfMissing('idx_teaching_unit_topic', 'CREATE INDEX idx_teaching_unit_topic ON teaching_unit(topic)');
    createIndexIfMissing('idx_teaching_unit_subject_topic', 'CREATE INDEX idx_teaching_unit_subject_topic ON teaching_unit(subject, topic)');

    createTableIfMissing('exam_trigger_notes', `
      CREATE TABLE exam_trigger_notes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        trigger_lines TEXT,
        differentiation_table TEXT,
        recall_bullets TEXT,
        generated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, subject, topic)
      )
    `);
    createIndexIfMissing('idx_exam_trigger_notes_user_id', 'CREATE INDEX idx_exam_trigger_notes_user_id ON exam_trigger_notes(user_id)');
    createIndexIfMissing('idx_exam_trigger_notes_subject_topic', 'CREATE INDEX idx_exam_trigger_notes_subject_topic ON exam_trigger_notes(subject, topic)');

    createTableIfMissing('confusion_pairs', `
      CREATE TABLE confusion_pairs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        concept_a TEXT NOT NULL,
        concept_b TEXT NOT NULL,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        occurrence_count INTEGER DEFAULT 1,
        resolved INTEGER DEFAULT 0,
        comparison_table TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    createIndexIfMissing('idx_confusion_pairs_user_id', 'CREATE INDEX idx_confusion_pairs_user_id ON confusion_pairs(user_id)');
    createIndexIfMissing('idx_confusion_pairs_subject_topic', 'CREATE INDEX idx_confusion_pairs_subject_topic ON confusion_pairs(subject, topic)');
    createIndexIfMissing('idx_confusion_pairs_resolved', 'CREATE INDEX idx_confusion_pairs_resolved ON confusion_pairs(resolved)');

    createTableIfMissing('diagnostic_assessment', `
      CREATE TABLE diagnostic_assessment (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        saq_questions TEXT,
        saq_answers TEXT,
        saq_scores TEXT,
        raw_score REAL,
        diagnostic_level TEXT CHECK (diagnostic_level IN ('weak', 'average', 'good', 'strong')),
        misconception_tags TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    createIndexIfMissing('idx_diagnostic_assessment_user_id', 'CREATE INDEX idx_diagnostic_assessment_user_id ON diagnostic_assessment(user_id)');
    createIndexIfMissing('idx_diagnostic_assessment_subject_topic', 'CREATE INDEX idx_diagnostic_assessment_subject_topic ON diagnostic_assessment(subject, topic)');

    createTableIfMissing('topic_learning_session', `
      CREATE TABLE topic_learning_session (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        current_phase TEXT DEFAULT 'diagnostic' CHECK (current_phase IN ('diagnostic', 'concept_fixing', 'laq', 'mcq_consolidation', 'mastery_check', 'completed')),
        goal_tier TEXT,
        focus_buckets TEXT,
        diagnostic_id TEXT REFERENCES diagnostic_assessment(id),
        diagnostic_score REAL,
        saq_completed INTEGER DEFAULT 0,
        laq_completed INTEGER DEFAULT 0,
        mcq_completed INTEGER DEFAULT 0,
        mcq_total INTEGER DEFAULT 0,
        mcq_correct INTEGER DEFAULT 0,
        mcq_accuracy REAL,
        core_coverage REAL DEFAULT 0,
        competency_score REAL DEFAULT 0,
        mastery_result TEXT CHECK (mastery_result IN ('mastered', 'revision_required', 'relearn_core')),
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      )
    `);
    createIndexIfMissing('idx_topic_learning_session_user_id', 'CREATE INDEX idx_topic_learning_session_user_id ON topic_learning_session(user_id)');
    createIndexIfMissing('idx_topic_learning_session_subject_topic', 'CREATE INDEX idx_topic_learning_session_subject_topic ON topic_learning_session(subject, topic)');
    createIndexIfMissing('idx_topic_learning_session_phase', 'CREATE INDEX idx_topic_learning_session_phase ON topic_learning_session(current_phase)');
    createIndexIfMissing('idx_topic_learning_session_user_subject_topic', 'CREATE INDEX idx_topic_learning_session_user_subject_topic ON topic_learning_session(user_id, subject, topic)');
    addColumnIfMissing('topic_learning_session', 'adaptive_level', 'TEXT');
    addColumnIfMissing('topic_learning_session', 'difficulty_label', 'TEXT');
    addColumnIfMissing('topic_learning_session', 'concept_plan', 'TEXT');
    addColumnIfMissing('topic_learning_session', 'concept_anchor_index', 'INTEGER DEFAULT 0');
    addColumnIfMissing('topic_learning_session', 'concept_retry_count', 'INTEGER DEFAULT 0');
    addColumnIfMissing('topic_learning_session', 'concept_core_points', 'TEXT');

    createTableIfMissing('competency_score_log', `
      CREATE TABLE competency_score_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        topic TEXT NOT NULL,
        subject TEXT NOT NULL,
        score REAL NOT NULL,
        calculated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    createIndexIfMissing('idx_competency_score_log_user_id', 'CREATE INDEX idx_competency_score_log_user_id ON competency_score_log(user_id)');
    createIndexIfMissing('idx_competency_score_log_subject_topic', 'CREATE INDEX idx_competency_score_log_subject_topic ON competency_score_log(subject, topic)');

    createTableIfMissing('subject_allocation', `
      CREATE TABLE subject_allocation (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        priority_score REAL DEFAULT 0,
        weight REAL DEFAULT 1.0,
        self_rating INTEGER DEFAULT 3 CHECK (self_rating >= 1 AND self_rating <= 5),
        allocated_hours REAL DEFAULT 0,
        learning_percentage REAL DEFAULT 60,
        practice_percentage REAL DEFAULT 30,
        revision_percentage REAL DEFAULT 10,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, subject)
      )
    `);
    createIndexIfMissing('idx_subject_allocation_user_id', 'CREATE INDEX idx_subject_allocation_user_id ON subject_allocation(user_id)');
    createIndexIfMissing('idx_subject_allocation_subject', 'CREATE INDEX idx_subject_allocation_subject ON subject_allocation(subject)');

    createTableIfMissing('subscription', `
      CREATE TABLE subscription (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'standard', 'premium')),
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
        UNIQUE(user_id)
      )
    `);
    createIndexIfMissing('idx_subscription_user_id', 'CREATE INDEX idx_subscription_user_id ON subscription(user_id)');
    createIndexIfMissing('idx_subscription_tier', 'CREATE INDEX idx_subscription_tier ON subscription(tier)');
    createIndexIfMissing('idx_subscription_status', 'CREATE INDEX idx_subscription_status ON subscription(status)');

    createTableIfMissing('daily_plan_progress', `
      CREATE TABLE daily_plan_progress (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        completed_blocks TEXT DEFAULT '[]',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date)
      )
    `);
    createIndexIfMissing('idx_daily_plan_progress_user_id', 'CREATE INDEX idx_daily_plan_progress_user_id ON daily_plan_progress(user_id)');
    createIndexIfMissing('idx_daily_plan_progress_date', 'CREATE INDEX idx_daily_plan_progress_date ON daily_plan_progress(date)');

    createTableIfMissing('mock_test', `
      CREATE TABLE mock_test (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        subjects TEXT NOT NULL,
        total_questions INTEGER NOT NULL DEFAULT 200,
        duration_minutes INTEGER NOT NULL DEFAULT 210,
        status TEXT DEFAULT 'created' CHECK (status IN ('created', 'in_progress', 'completed', 'abandoned')),
        question_ids TEXT,
        answers TEXT,
        started_at TEXT,
        completed_at TEXT,
        score REAL,
        correct_count INTEGER DEFAULT 0,
        wrong_count INTEGER DEFAULT 0,
        skipped_count INTEGER DEFAULT 0,
        subject_breakdown TEXT,
        remediation_report TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    createIndexIfMissing('idx_mock_test_user_id', 'CREATE INDEX idx_mock_test_user_id ON mock_test(user_id)');
    createIndexIfMissing('idx_mock_test_status', 'CREATE INDEX idx_mock_test_status ON mock_test(status)');

    createTableIfMissing('integration_tag', `
      CREATE TABLE integration_tag (
        id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
        primary_subject TEXT NOT NULL,
        primary_topic TEXT NOT NULL,
        linked_subjects TEXT NOT NULL,
        linked_topics TEXT NOT NULL,
        integration_type TEXT NOT NULL CHECK (integration_type IN ('cross_subject', 'cross_topic', 'clinical_bridge', 'mechanism_link', 'pharmacology_bridge')),
        integration_label TEXT NOT NULL,
        explanation TEXT,
        difficulty_boost TEXT DEFAULT 'none' CHECK (difficulty_boost IN ('none', 'moderate', 'high')),
        auto_detected INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    createIndexIfMissing('idx_integration_tag_question_id', 'CREATE INDEX idx_integration_tag_question_id ON integration_tag(question_id)');
    createIndexIfMissing('idx_integration_tag_primary_subject', 'CREATE INDEX idx_integration_tag_primary_subject ON integration_tag(primary_subject)');
    createIndexIfMissing('idx_integration_tag_type', 'CREATE INDEX idx_integration_tag_type ON integration_tag(integration_type)');
    createIndexIfMissing('idx_integration_tag_label', 'CREATE INDEX idx_integration_tag_label ON integration_tag(integration_label)');

    createTableIfMissing('concept_cluster', `
      CREATE TABLE concept_cluster (
        id TEXT PRIMARY KEY,
        cluster_name TEXT NOT NULL,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        subtopic TEXT,
        core_concept TEXT NOT NULL,
        question_ids TEXT NOT NULL,
        question_count INTEGER DEFAULT 0,
        years_appeared TEXT,
        year_span INTEGER DEFAULT 0,
        repetition_score REAL DEFAULT 0,
        framing_variants TEXT,
        concept_summary TEXT,
        auto_detected INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    createIndexIfMissing('idx_concept_cluster_subject', 'CREATE INDEX idx_concept_cluster_subject ON concept_cluster(subject)');
    createIndexIfMissing('idx_concept_cluster_topic', 'CREATE INDEX idx_concept_cluster_topic ON concept_cluster(topic)');
    createIndexIfMissing('idx_concept_cluster_core_concept', 'CREATE INDEX idx_concept_cluster_core_concept ON concept_cluster(core_concept)');
    createIndexIfMissing('idx_concept_cluster_repetition', 'CREATE INDEX idx_concept_cluster_repetition ON concept_cluster(repetition_score)');

    createTableIfMissing('saq_conversion', `
      CREATE TABLE saq_conversion (
        id TEXT PRIMARY KEY,
        source_mcq_id TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
        generated_saq_id TEXT REFERENCES question(id) ON DELETE SET NULL,
        saq_stem TEXT NOT NULL,
        core_concept TEXT NOT NULL,
        ideal_answer TEXT NOT NULL,
        key_points TEXT,
        cognitive_level TEXT CHECK (cognitive_level IN ('conceptual', 'application', 'analysis')),
        conversion_type TEXT CHECK (conversion_type IN ('why_question', 'differentiation', 'mechanism', 'clinical_reasoning', 'explain')),
        difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
        reviewed_by TEXT REFERENCES users(id),
        reviewed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_mcq_id)
      )
    `);
    createIndexIfMissing('idx_saq_conversion_source', 'CREATE INDEX idx_saq_conversion_source ON saq_conversion(source_mcq_id)');
    createIndexIfMissing('idx_saq_conversion_status', 'CREATE INDEX idx_saq_conversion_status ON saq_conversion(status)');
    createIndexIfMissing('idx_saq_conversion_cognitive', 'CREATE INDEX idx_saq_conversion_cognitive ON saq_conversion(cognitive_level)');

    createTableIfMissing('laq_generation', `
      CREATE TABLE laq_generation (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        vignette TEXT NOT NULL,
        questions TEXT NOT NULL,
        model_answers TEXT NOT NULL,
        key_concepts_tested TEXT,
        integrated_topics TEXT,
        clinical_pearls TEXT,
        common_mistakes TEXT,
        trap_elements TEXT,
        difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
        generated_question_id TEXT REFERENCES question(id) ON DELETE SET NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
        reviewed_by TEXT REFERENCES users(id),
        reviewed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    createIndexIfMissing('idx_laq_generation_subject', 'CREATE INDEX idx_laq_generation_subject ON laq_generation(subject)');
    createIndexIfMissing('idx_laq_generation_topic', 'CREATE INDEX idx_laq_generation_topic ON laq_generation(topic)');
    createIndexIfMissing('idx_laq_generation_status', 'CREATE INDEX idx_laq_generation_status ON laq_generation(status)');
    createIndexIfMissing('idx_laq_generation_difficulty', 'CREATE INDEX idx_laq_generation_difficulty ON laq_generation(difficulty)');

    addColumnIfMissing('question', 'concept_id', 'TEXT');
    createIndexIfMissing('idx_question_concept_id', 'CREATE INDEX idx_question_concept_id ON question(concept_id)');

    createTableIfMissing('topic_concept', `
      CREATE TABLE topic_concept (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        concept_key TEXT NOT NULL,
        name TEXT NOT NULL,
        display_order INTEGER DEFAULT 0,
        must_know_points TEXT,
        deep_points TEXT,
        traps TEXT,
        leading_questions TEXT,
        example_phrases TEXT,
        grading_rubric TEXT,
        micro_questions TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    createIndexIfMissing('idx_topic_concept_subject', 'CREATE INDEX idx_topic_concept_subject ON topic_concept(subject)');
    createIndexIfMissing('idx_topic_concept_topic', 'CREATE INDEX idx_topic_concept_topic ON topic_concept(topic)');
    createIndexIfMissing('idx_topic_concept_subject_topic', 'CREATE INDEX idx_topic_concept_subject_topic ON topic_concept(subject, topic)');
    createIndexIfMissing('idx_topic_concept_concept_key', 'CREATE INDEX idx_topic_concept_concept_key ON topic_concept(concept_key)');
    createIndexIfMissing('idx_topic_concept_display_order', 'CREATE INDEX idx_topic_concept_display_order ON topic_concept(display_order)');

    createTableIfMissing('concept_mastery', `
      CREATE TABLE concept_mastery (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        concept_id TEXT NOT NULL,
        mastery REAL DEFAULT 0.00,
        last_seen TEXT,
        next_due TEXT,
        weak_points TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, concept_id)
      )
    `);
    createIndexIfMissing('idx_concept_mastery_user_id', 'CREATE INDEX idx_concept_mastery_user_id ON concept_mastery(user_id)');
    createIndexIfMissing('idx_concept_mastery_concept_id', 'CREATE INDEX idx_concept_mastery_concept_id ON concept_mastery(concept_id)');
    createIndexIfMissing('idx_concept_mastery_user_concept', 'CREATE INDEX idx_concept_mastery_user_concept ON concept_mastery(user_id, concept_id)');
    createIndexIfMissing('idx_concept_mastery_next_due', 'CREATE INDEX idx_concept_mastery_next_due ON concept_mastery(next_due)');

    createTableIfMissing('topic_gross_prompt', `
      CREATE TABLE topic_gross_prompt (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        prompt_text TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(subject, topic)
      )
    `);
    createIndexIfMissing('idx_topic_gross_prompt_subject_topic', 'CREATE INDEX idx_topic_gross_prompt_subject_topic ON topic_gross_prompt(subject, topic)');

    createTableIfMissing('concept_map_session', `
      CREATE TABLE concept_map_session (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        learner_level TEXT DEFAULT 'mid',
        snapshot TEXT,
        current_concept_id TEXT,
        current_point_id TEXT,
        probe_count INTEGER DEFAULT 0,
        leading_tier INTEGER DEFAULT 1,
        phase TEXT DEFAULT 'probing',
        completed_point_ids TEXT,
        summary_text TEXT,
        missed_points_text TEXT,
        must_repeat_question TEXT,
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    createIndexIfMissing('idx_concept_map_session_user_id', 'CREATE INDEX idx_concept_map_session_user_id ON concept_map_session(user_id)');
    createIndexIfMissing('idx_concept_map_session_phase', 'CREATE INDEX idx_concept_map_session_phase ON concept_map_session(phase)');
    createIndexIfMissing('idx_concept_map_session_started_at', 'CREATE INDEX idx_concept_map_session_started_at ON concept_map_session(started_at)');
    addColumnIfMissing('concept_map_session', 'time_limit_minutes', 'INTEGER');

    addColumnIfMissing('topic_concept', 'concept_map_id', 'TEXT');
    addColumnIfMissing('topic_concept', 'concept_weight', 'INTEGER DEFAULT 1');
    addColumnIfMissing('topic_concept', 'prerequisite_concept_ids', 'TEXT');
    addColumnIfMissing('topic_concept', 'downstream_concept_ids', 'TEXT');
    addColumnIfMissing('topic_concept', 'section', 'TEXT');
    addColumnIfMissing('topic_concept', 'chapter', 'TEXT');
    addColumnIfMissing('topic_concept', 'main_topic', 'TEXT');
    addColumnIfMissing('topic_concept', 'subtopic', 'TEXT');
    addColumnIfMissing('topic_concept', 'saqs', 'TEXT');
    addColumnIfMissing('topic_concept', 'mcqs', 'TEXT');
    createIndexIfMissing('idx_topic_concept_concept_map_id', 'CREATE INDEX idx_topic_concept_concept_map_id ON topic_concept(concept_map_id)');

    createTableIfMissing('topic_pathway_order', `
      CREATE TABLE topic_pathway_order (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        display_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(subject, topic)
      )
    `);
    createIndexIfMissing('idx_topic_pathway_order_subject', 'CREATE INDEX idx_topic_pathway_order_subject ON topic_pathway_order(subject)');

    createTableIfMissing('pathway_concept', `
      CREATE TABLE pathway_concept (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        main_question TEXT NOT NULL,
        core_points TEXT NOT NULL,
        common_misconceptions TEXT,
        expected_final_answer TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    createIndexIfMissing('idx_pathway_concept_subject_topic', 'CREATE INDEX idx_pathway_concept_subject_topic ON pathway_concept(subject, topic)');

    createTableIfMissing('pathway_session', `
      CREATE TABLE pathway_session (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        pathway_id TEXT NOT NULL,
        phase TEXT DEFAULT 'initial',
        current_step_index INTEGER DEFAULT 0,
        completed_step_ids TEXT DEFAULT '[]',
        probe_count INTEGER DEFAULT 0,
        conversation TEXT DEFAULT '[]',
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    createIndexIfMissing('idx_pathway_session_user_id', 'CREATE INDEX idx_pathway_session_user_id ON pathway_session(user_id)');
    createIndexIfMissing('idx_pathway_session_pathway_id', 'CREATE INDEX idx_pathway_session_pathway_id ON pathway_session(pathway_id)');

    createTableIfMissing('tutoring_training_examples', `
      CREATE TABLE tutoring_training_examples (
        id TEXT PRIMARY KEY,
        concept_id TEXT,
        concept_map_id TEXT,
        subject TEXT,
        topic TEXT,
        student_level TEXT,
        messages TEXT NOT NULL,
        source_file TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    createIndexIfMissing('idx_tutoring_training_concept', 'CREATE INDEX idx_tutoring_training_concept ON tutoring_training_examples(concept_id)');
    createIndexIfMissing('idx_tutoring_training_concept_map', 'CREATE INDEX idx_tutoring_training_concept_map ON tutoring_training_examples(concept_map_id)');
    createIndexIfMissing('idx_tutoring_training_subject_topic', 'CREATE INDEX idx_tutoring_training_subject_topic ON tutoring_training_examples(subject, topic)');
    createIndexIfMissing('idx_tutoring_training_level', 'CREATE INDEX idx_tutoring_training_level ON tutoring_training_examples(student_level)');

    try {
      const triggers = [
        { name: 'update_subtopic_yield_updated_at', table: 'subtopic_yield' },
        { name: 'update_teaching_unit_updated_at', table: 'teaching_unit' },
        { name: 'update_confusion_pairs_updated_at', table: 'confusion_pairs' },
        { name: 'update_subject_allocation_updated_at', table: 'subject_allocation' },
        { name: 'update_integration_tag_updated_at', table: 'integration_tag' },
        { name: 'update_concept_cluster_updated_at', table: 'concept_cluster' },
        { name: 'update_saq_conversion_updated_at', table: 'saq_conversion' },
        { name: 'update_laq_generation_updated_at', table: 'laq_generation' },
        { name: 'update_topic_concept_updated_at', table: 'topic_concept' },
        { name: 'update_concept_mastery_updated_at', table: 'concept_mastery' },
        { name: 'update_topic_gross_prompt_updated_at', table: 'topic_gross_prompt' },
        { name: 'update_concept_map_session_updated_at', table: 'concept_map_session' },
        { name: 'update_pathway_concept_updated_at', table: 'pathway_concept' },
        { name: 'update_pathway_session_updated_at', table: 'pathway_session' }
      ];
      for (const t of triggers) {
        const exists = db.exec(`SELECT name FROM sqlite_master WHERE type='trigger' AND name='${t.name}'`);
        if (exists.length === 0 || exists[0].values.length === 0) {
          db.run(`
            CREATE TRIGGER ${t.name} AFTER UPDATE ON ${t.table}
            FOR EACH ROW
            BEGIN
              UPDATE ${t.table} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END
          `);
        }
      }
    } catch (triggerError) {
      console.log('Trigger migration note:', triggerError.message);
    }

    const tuningDefaults = [
      ['mastery_threshold_mastered', 85.0, 'threshold', 'mastery'],
      ['mastery_threshold_revision', 60.0, 'threshold', 'mastery'],
      ['core_coverage_threshold', 90.0, 'threshold', 'mastery'],
      ['competency_achieved_threshold', 80.0, 'threshold', 'competency'],
      ['revision_interval_mastered_1', 7.0, 'other', 'recall'],
      ['revision_interval_mastered_2', 21.0, 'other', 'recall'],
      ['revision_interval_mastered_3', 45.0, 'other', 'recall'],
      ['revision_interval_revision_1', 3.0, 'other', 'recall'],
      ['revision_interval_revision_2', 10.0, 'other', 'recall'],
      ['revision_interval_revision_3', 25.0, 'other', 'recall'],
      ['revision_interval_relearn_1', 1.0, 'other', 'recall'],
      ['revision_interval_relearn_2', 5.0, 'other', 'recall'],
      ['revision_interval_relearn_3', 15.0, 'other', 'recall'],
      ['competency_saq_weight', 20.0, 'weight', 'competency'],
      ['competency_mcq_weight', 70.0, 'weight', 'competency'],
      ['competency_core_coverage_weight', 10.0, 'weight', 'competency'],
      ['learning_time_allocation', 0.6, 'weight', 'scheduler'],
      ['practice_time_allocation', 0.3, 'weight', 'scheduler'],
      ['mcq_preference_excellent', 0.8, 'weight', 'competency'],
      ['mcq_preference_strong', 0.7, 'weight', 'competency'],
      ['mcq_preference_average', 0.4, 'weight', 'competency'],
      ['mcq_preference_weak', 0.2, 'weight', 'competency'],
      ['mcq_preference_very_weak', 0.1, 'weight', 'competency'],
      ['mcq_preference_bored', 0.9, 'weight', 'competency'],
      ['socratic_first_probes', 1.0, 'other', 'competency'],
      ['force_socratic_until_tier', 2.0, 'other', 'competency'],
      ['level_threshold_excellent', 90.0, 'threshold', 'competency'],
      ['level_threshold_strong', 75.0, 'threshold', 'competency'],
      ['level_threshold_average', 50.0, 'threshold', 'competency'],
      ['level_threshold_weak', 30.0, 'threshold', 'competency'],
      ['level_bored_min_words', 15.0, 'other', 'competency'],
      ['level_bored_compact_similarity', 0.85, 'threshold', 'competency'],
      ['revision_time_allocation', 0.1, 'weight', 'scheduler']
    ];

    for (const [name, value, type, category] of tuningDefaults) {
      try {
        const exists = db.exec(`SELECT 1 FROM system_tuning_parameters WHERE parameter_name = '${name}'`);
        if (exists.length === 0 || exists[0].values.length === 0) {
          const paramId = require('crypto').randomUUID();
          db.run(`INSERT INTO system_tuning_parameters (id, parameter_name, parameter_value, parameter_type, category) VALUES ('${paramId}', '${name}', ${value}, '${type}', '${category}')`);
        }
      } catch (e) {}
    }

    saveDatabase();
    console.log('✅ All migrations completed');
  } catch (error) {
    console.error('Migration error:', error);
  }
};

const saveDatabase = () => {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (error) {
    console.error('Error saving database:', error);
  }
};

const convertQuery = (text, params) => {
  let converted = text;
  const paramMatches = [];
  const paramPattern = /\$(\d+)/g;
  let match;
  
  while ((match = paramPattern.exec(text)) !== null) {
    paramMatches.push({
      index: match.index,
      paramNum: parseInt(match[1])
    });
  }
  
  converted = converted.replace(/RETURNING \*/gi, '');
  converted = converted.replace(/RETURNING [a-z_,\s]+/gi, '');
  
  if (paramMatches.length > 0) {
    const reorderedParams = [];
    paramMatches.sort((a, b) => a.index - b.index);
    
    paramMatches.forEach(m => {
      if (m.paramNum > 0 && m.paramNum <= params.length) {
        reorderedParams.push(params[m.paramNum - 1]);
      }
    });
    
    converted = converted.replace(/\$(\d+)/g, '?');
    
    return { query: converted, params: reorderedParams };
  }
  
  converted = converted.replace(/\$(\d+)/g, '?');
  
  return { query: converted, params };
};

const normalizeParams = (params) => {
  return params.map(param => param === undefined ? null : param);
};

const query = async (text, params = []) => {
  try {
    if (!db) {
      await initDatabase();
    }
    
    const originalText = text;
    const hasReturning = text.toUpperCase().includes('RETURNING');
    const returningMatch = hasReturning ? text.match(/RETURNING\s+([a-z_,\s*]+)/i) : null;
    const tableMatch = text.match(/INSERT INTO\s+(\w+)/i);
    
    const converted = convertQuery(text, params);
    const convertedQuery = converted.query;
    const reorderedParams = converted.params;
    const isSelect = convertedQuery.trim().toUpperCase().startsWith('SELECT');
    
    if (isSelect) {
      const stmt = db.prepare(convertedQuery);
      stmt.bind(normalizeParams(reorderedParams));
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return { rows };
    } else {
      const stmt = db.prepare(convertedQuery);
      stmt.bind(normalizeParams(reorderedParams));
      const stepResult = stmt.step();
      const changes = stmt.getRowsModified ? stmt.getRowsModified() : (db.getRowsModified ? db.getRowsModified() : 1);
      const lastInsertRowid = db.exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0];
      stmt.free();
      
      console.log('Non-SELECT query executed:', {
        query: convertedQuery.substring(0, 100),
        stepResult,
        changes,
        lastInsertRowid
      });
      
      if (hasReturning && lastInsertRowid && tableMatch) {
        const tableName = tableMatch[1];
        let selectFields = '*';
        
        if (returningMatch) {
          const fields = returningMatch[1].trim();
          if (fields !== '*') {
            selectFields = fields;
          }
        }
        
        const selectQuery = `SELECT ${selectFields} FROM ${tableName} WHERE id = ?`;
        const selectStmt = db.prepare(selectQuery);
        selectStmt.bind([lastInsertRowid.toString()]);
        let insertedRow = null;
        if (selectStmt.step()) {
          insertedRow = selectStmt.getAsObject();
        }
        selectStmt.free();
        
        saveDatabase();
        return { rows: insertedRow ? [insertedRow] : [], rowCount: changes || 1, lastInsertRowid };
      }
      
      saveDatabase();
      return { rows: [], rowCount: changes || 1, lastInsertRowid };
    }
  } catch (error) {
    console.error('Database query error:', error);
    console.error('Original query:', text);
    const converted = convertQuery(text, params);
    console.error('Converted query:', converted.query);
    throw error;
  }
};

const queryOne = async (text, params = []) => {
  try {
    if (!db) {
      await initDatabase();
    }
    
    const converted = convertQuery(text, params);
    const convertedQuery = converted.query;
    const reorderedParams = converted.params;
    const stmt = db.prepare(convertedQuery);
    stmt.bind(normalizeParams(reorderedParams));
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return { rows: row ? [row] : [] };
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

const generateUUID = () => uuidv4();

module.exports = { 
  db: {
    query,
    queryOne,
    generateUUID
  },
  initDatabase
};
