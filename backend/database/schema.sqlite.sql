CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    email_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE userprofile (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_exam TEXT,
    exam_date TEXT,
    target_score_band TEXT,
    selected_subjects TEXT,
    daily_study_minutes INTEGER DEFAULT 60 CHECK (daily_study_minutes >= 15 AND daily_study_minutes <= 480),
    weekly_question_target INTEGER DEFAULT 50 CHECK (weekly_question_target >= 5 AND weekly_question_target <= 500),
    intelligence_level TEXT DEFAULT 'medium' CHECK (intelligence_level IN ('high', 'medium', 'low')),
    intelligence_score REAL DEFAULT 50.00 CHECK (intelligence_score >= 0 AND intelligence_score <= 100),
    goal_tier TEXT DEFAULT 'good_rank' CHECK (goal_tier IN ('top_rank', 'good_rank', 'seat_only')),
    student_category TEXT DEFAULT 'average' CHECK (student_category IN ('bright', 'average', 'weak')),
    subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'standard', 'premium')),
    onboarding_completed INTEGER DEFAULT 0,
    learner_profile TEXT CHECK (learner_profile IN ('top', 'mid', 'struggling')),
    time_budget TEXT CHECK (time_budget IN ('short', 'medium', 'long')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE INDEX idx_userprofile_user_id ON userprofile(user_id);
CREATE INDEX idx_userprofile_exam_date ON userprofile(exam_date);

CREATE TABLE question (
    id TEXT PRIMARY KEY,
    stem TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('mcq', 'saq', 'laq', 'case_based', 'true_false', 'assertion_reason')),
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    subtopic TEXT,
    difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    importance TEXT DEFAULT 'medium' CHECK (importance IN ('high', 'medium', 'low')),
    yield_category TEXT CHECK (yield_category IN ('core', 'frequent', 'occasional', 'rare')),
    cognitive_focus TEXT DEFAULT 'factual' CHECK (cognitive_focus IN ('factual', 'conceptual', 'clinical')),
    ideal_answer TEXT,
    key_points TEXT,
    previous_year_tags TEXT,
    options TEXT,
    correct_answer TEXT,
    distractor_analysis TEXT,
    concept_tags TEXT,
    trap_pattern TEXT,
    image_path TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
    created_by TEXT REFERENCES users(id),
    source_pdf_id TEXT,
    extracted_question_id TEXT,
    concept_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_question_subject ON question(subject);
CREATE INDEX idx_question_topic ON question(topic);
CREATE INDEX idx_question_type ON question(type);
CREATE INDEX idx_question_difficulty ON question(difficulty);
CREATE INDEX idx_question_importance ON question(importance);
CREATE INDEX idx_question_yield_category ON question(yield_category);
CREATE INDEX idx_question_status ON question(status);
CREATE INDEX idx_question_subject_topic ON question(subject, topic);
CREATE INDEX idx_question_subject_topic_subtopic ON question(subject, topic, subtopic);

CREATE TABLE session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL CHECK (session_type IN ('practice', 'revision', 'quick', 'adaptive_mastery')),
    configuration TEXT,
    total_questions INTEGER DEFAULT 0,
    accuracy REAL,
    average_score REAL,
    total_time_seconds INTEGER DEFAULT 0,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned'))
);

CREATE INDEX idx_session_user_id ON session(user_id);
CREATE INDEX idx_session_status ON session(status);
CREATE INDEX idx_session_started_at ON session(started_at);
CREATE INDEX idx_session_type ON session(session_type);

CREATE TABLE attempt (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
    answer_text TEXT NOT NULL,
    answer_method TEXT NOT NULL CHECK (answer_method IN ('voice', 'text')),
    language TEXT CHECK (language IN ('english', 'hindi', 'hinglish')),
    ai_feedback TEXT,
    ai_score INTEGER CHECK (ai_score >= 0 AND ai_score <= 100),
    time_spent_seconds INTEGER DEFAULT 0,
    misconception_type TEXT CHECK (misconception_type IN ('concept_missing', 'confusion_pair', 'rule_exception_failure', 'memory_slip', 'application_failure', 'overgeneralization', 'trap_susceptibility')),
    misconception_tags TEXT,
    concept_tested TEXT,
    distractor_chosen_meaning TEXT,
    feedback_rating TEXT CHECK (feedback_rating IN ('good', 'bad', 'worse')),
    submitted_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attempt_user_id ON attempt(user_id);
CREATE INDEX idx_attempt_question_id ON attempt(question_id);
CREATE INDEX idx_attempt_session_id ON attempt(session_id);
CREATE INDEX idx_attempt_submitted_at ON attempt(submitted_at);
CREATE INDEX idx_attempt_user_question ON attempt(user_id, question_id);
CREATE INDEX idx_attempt_misconception ON attempt(misconception_type);

CREATE TABLE topicmastery (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    subject TEXT NOT NULL,
    mastery_level REAL DEFAULT 0.00 CHECK (mastery_level >= 0 AND mastery_level <= 100),
    mastery_status TEXT DEFAULT 'not_started' CHECK (mastery_status IN ('not_started', 'in_progress', 'relearn_core', 'revision_required', 'mastered')),
    competency_score REAL DEFAULT 0.00 CHECK (competency_score >= 0 AND competency_score <= 100),
    diagnostic_level TEXT CHECK (diagnostic_level IN ('weak', 'average', 'good', 'strong')),
    saq_raw_score REAL,
    mcq_accuracy REAL,
    core_coverage REAL DEFAULT 0.00,
    revision_count INTEGER DEFAULT 0,
    required_revisions INTEGER DEFAULT 3 CHECK (required_revisions >= 1 AND required_revisions <= 10),
    completed_revisions INTEGER DEFAULT 0,
    last_revision_date TEXT,
    next_revision_date TEXT,
    intelligence_factor REAL DEFAULT 1.00,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, topic, subject)
);

CREATE INDEX idx_topicmastery_user_id ON topicmastery(user_id);
CREATE INDEX idx_topicmastery_topic ON topicmastery(topic);
CREATE INDEX idx_topicmastery_subject ON topicmastery(subject);
CREATE INDEX idx_topicmastery_next_revision ON topicmastery(next_revision_date);
CREATE INDEX idx_topicmastery_user_topic ON topicmastery(user_id, topic);
CREATE INDEX idx_topicmastery_mastery_status ON topicmastery(mastery_status);

CREATE TABLE questionmastery (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
    mastery_level REAL DEFAULT 0.00 CHECK (mastery_level >= 0 AND mastery_level <= 100),
    attempt_count INTEGER DEFAULT 0,
    last_attempt_at TEXT,
    first_correct_at TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, question_id)
);

CREATE INDEX idx_questionmastery_user_id ON questionmastery(user_id);
CREATE INDEX idx_questionmastery_question_id ON questionmastery(question_id);
CREATE INDEX idx_questionmastery_user_question ON questionmastery(user_id, question_id);

CREATE TABLE revisionschedule (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    planned_questions INTEGER DEFAULT 0,
    planned_minutes INTEGER DEFAULT 0,
    subjects TEXT,
    topics TEXT,
    question_types TEXT,
    difficulty_mix TEXT,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'complete', 'partial', 'skipped')),
    completed_questions INTEGER DEFAULT 0,
    actual_minutes INTEGER DEFAULT 0,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

CREATE INDEX idx_revisionschedule_user_id ON revisionschedule(user_id);
CREATE INDEX idx_revisionschedule_date ON revisionschedule(date);
CREATE INDEX idx_revisionschedule_status ON revisionschedule(status);
CREATE INDEX idx_revisionschedule_user_date ON revisionschedule(user_id, date);

CREATE TABLE examreadiness (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    readiness_percentage REAL DEFAULT 0.00 CHECK (readiness_percentage >= 0 AND readiness_percentage <= 100),
    status TEXT DEFAULT 'off_track' CHECK (status IN ('on_track', 'borderline', 'off_track')),
    forecast_data TEXT,
    last_calculated TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE INDEX idx_examreadiness_user_id ON examreadiness(user_id);
CREATE INDEX idx_examreadiness_status ON examreadiness(status);

CREATE TABLE pdfupload (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    upload_status TEXT DEFAULT 'uploaded' CHECK (upload_status IN ('uploaded', 'processing', 'extracted', 'failed')),
    extraction_summary TEXT,
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT
);

CREATE INDEX idx_pdfupload_admin_id ON pdfupload(admin_id);
CREATE INDEX idx_pdfupload_status ON pdfupload(upload_status);
CREATE INDEX idx_pdfupload_uploaded_at ON pdfupload(uploaded_at);

CREATE TABLE extractedquestion (
    id TEXT PRIMARY KEY,
    pdfupload_id TEXT NOT NULL REFERENCES pdfupload(id) ON DELETE CASCADE,
    extracted_text TEXT NOT NULL,
    detected_type TEXT,
    detected_subject TEXT,
    detected_topic TEXT,
    detected_subtopic TEXT,
    detected_importance TEXT,
    detected_cognitive_focus TEXT,
    detected_difficulty TEXT,
    detected_key_points TEXT,
    detected_previous_year_tags TEXT,
    extracted_options TEXT,
    extracted_correct_answer TEXT,
    extracted_ideal_answer TEXT,
    yield_category TEXT CHECK (yield_category IN ('core', 'frequent', 'occasional', 'rare')),
    detected_distractor_analysis TEXT,
    detected_concept_tags TEXT,
    detected_trap_pattern TEXT,
    frequency_count INTEGER DEFAULT 1,
    most_recent_year INTEGER,
    extracted_image_path TEXT,
    confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'accepted', 'accepted_edited', 'rejected')),
    admin_corrections TEXT,
    extracted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT,
    reviewed_by TEXT REFERENCES users(id)
);

CREATE INDEX idx_extractedquestion_pdfupload_id ON extractedquestion(pdfupload_id);
CREATE INDEX idx_extractedquestion_status ON extractedquestion(status);
CREATE INDEX idx_extractedquestion_confidence ON extractedquestion(confidence_score);
CREATE INDEX idx_extractedquestion_yield ON extractedquestion(yield_category);

CREATE TABLE system_tuning_parameters (
    id TEXT PRIMARY KEY,
    parameter_name TEXT UNIQUE NOT NULL,
    parameter_value REAL NOT NULL,
    parameter_type TEXT NOT NULL CHECK (parameter_type IN ('threshold', 'weight', 'other')),
    category TEXT NOT NULL CHECK (category IN ('mastery', 'recall', 'scheduler', 'forecast', 'competency', 'misconception')),
    updated_by TEXT REFERENCES users(id),
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tuning_params_category ON system_tuning_parameters(category);
CREATE INDEX idx_tuning_params_name ON system_tuning_parameters(parameter_name);

CREATE TABLE feedback_ratings (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL REFERENCES attempt(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating TEXT NOT NULL CHECK (rating IN ('good', 'bad', 'worse')),
    feedback_text TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_ratings_attempt_id ON feedback_ratings(attempt_id);
CREATE INDEX idx_feedback_ratings_user_id ON feedback_ratings(user_id);
CREATE INDEX idx_feedback_ratings_rating ON feedback_ratings(rating);

CREATE TABLE extraction_corrections (
    id TEXT PRIMARY KEY,
    extracted_question_id TEXT NOT NULL REFERENCES extractedquestion(id) ON DELETE CASCADE,
    admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    corrections TEXT NOT NULL,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_extraction_corrections_extracted_id ON extraction_corrections(extracted_question_id);
CREATE INDEX idx_extraction_corrections_admin_id ON extraction_corrections(admin_id);

CREATE TABLE evaluation_corrections (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL REFERENCES attempt(id) ON DELETE CASCADE,
    admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    corrections TEXT NOT NULL,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_evaluation_corrections_attempt_id ON evaluation_corrections(attempt_id);
CREATE INDEX idx_evaluation_corrections_admin_id ON evaluation_corrections(admin_id);

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
);

CREATE INDEX idx_subtopic_yield_subject ON subtopic_yield(subject);
CREATE INDEX idx_subtopic_yield_topic ON subtopic_yield(topic);
CREATE INDEX idx_subtopic_yield_category ON subtopic_yield(yield_category);
CREATE INDEX idx_subtopic_yield_subject_topic ON subtopic_yield(subject, topic);

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
);

CREATE INDEX idx_teaching_unit_subject ON teaching_unit(subject);
CREATE INDEX idx_teaching_unit_topic ON teaching_unit(topic);
CREATE INDEX idx_teaching_unit_subject_topic ON teaching_unit(subject, topic);

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
);

CREATE INDEX idx_exam_trigger_notes_user_id ON exam_trigger_notes(user_id);
CREATE INDEX idx_exam_trigger_notes_subject_topic ON exam_trigger_notes(subject, topic);

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
);

CREATE INDEX idx_confusion_pairs_user_id ON confusion_pairs(user_id);
CREATE INDEX idx_confusion_pairs_subject_topic ON confusion_pairs(subject, topic);
CREATE INDEX idx_confusion_pairs_resolved ON confusion_pairs(resolved);

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
);

CREATE INDEX idx_diagnostic_assessment_user_id ON diagnostic_assessment(user_id);
CREATE INDEX idx_diagnostic_assessment_subject_topic ON diagnostic_assessment(subject, topic);

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
    adaptive_level TEXT CHECK (adaptive_level IN ('mastering_fast', 'progressing', 'struggling', 'needs_foundation', 'unknown')),
    difficulty_label TEXT,
    concept_plan TEXT,
    concept_anchor_index INTEGER DEFAULT 0,
    concept_retry_count INTEGER DEFAULT 0,
    concept_core_points TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
);

CREATE INDEX idx_topic_learning_session_user_id ON topic_learning_session(user_id);
CREATE INDEX idx_topic_learning_session_subject_topic ON topic_learning_session(subject, topic);
CREATE INDEX idx_topic_learning_session_phase ON topic_learning_session(current_phase);
CREATE INDEX idx_topic_learning_session_user_subject_topic ON topic_learning_session(user_id, subject, topic);

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
);

CREATE INDEX idx_subject_allocation_user_id ON subject_allocation(user_id);
CREATE INDEX idx_subject_allocation_subject ON subject_allocation(subject);

CREATE TABLE subscription (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'standard', 'premium')),
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    UNIQUE(user_id)
);

CREATE INDEX idx_subscription_user_id ON subscription(user_id);
CREATE INDEX idx_subscription_tier ON subscription(tier);
CREATE INDEX idx_subscription_status ON subscription(status);

CREATE TRIGGER update_users_updated_at AFTER UPDATE ON users
    FOR EACH ROW
    BEGIN
        UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_userprofile_updated_at AFTER UPDATE ON userprofile
    FOR EACH ROW
    BEGIN
        UPDATE userprofile SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_question_updated_at AFTER UPDATE ON question
    FOR EACH ROW
    BEGIN
        UPDATE question SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_topicmastery_updated_at AFTER UPDATE ON topicmastery
    FOR EACH ROW
    BEGIN
        UPDATE topicmastery SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_questionmastery_updated_at AFTER UPDATE ON questionmastery
    FOR EACH ROW
    BEGIN
        UPDATE questionmastery SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_subtopic_yield_updated_at AFTER UPDATE ON subtopic_yield
    FOR EACH ROW
    BEGIN
        UPDATE subtopic_yield SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_teaching_unit_updated_at AFTER UPDATE ON teaching_unit
    FOR EACH ROW
    BEGIN
        UPDATE teaching_unit SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TABLE competency_score_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    subject TEXT NOT NULL,
    score REAL NOT NULL,
    calculated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_competency_score_log_user_id ON competency_score_log(user_id);
CREATE INDEX idx_competency_score_log_subject_topic ON competency_score_log(subject, topic);

CREATE TRIGGER update_confusion_pairs_updated_at AFTER UPDATE ON confusion_pairs
    FOR EACH ROW
    BEGIN
        UPDATE confusion_pairs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_subject_allocation_updated_at AFTER UPDATE ON subject_allocation
    FOR EACH ROW
    BEGIN
        UPDATE subject_allocation SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TABLE daily_plan_progress (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    completed_blocks TEXT DEFAULT '[]',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_plan_progress_user_id ON daily_plan_progress(user_id);
CREATE INDEX idx_daily_plan_progress_date ON daily_plan_progress(date);

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
);

CREATE INDEX idx_mock_test_user_id ON mock_test(user_id);
CREATE INDEX idx_mock_test_status ON mock_test(status);

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
);

CREATE INDEX idx_integration_tag_question_id ON integration_tag(question_id);
CREATE INDEX idx_integration_tag_primary_subject ON integration_tag(primary_subject);
CREATE INDEX idx_integration_tag_type ON integration_tag(integration_type);
CREATE INDEX idx_integration_tag_label ON integration_tag(integration_label);

CREATE TRIGGER update_integration_tag_updated_at AFTER UPDATE ON integration_tag
    FOR EACH ROW
    BEGIN
        UPDATE integration_tag SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

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
);

CREATE INDEX idx_concept_cluster_subject ON concept_cluster(subject);
CREATE INDEX idx_concept_cluster_topic ON concept_cluster(topic);
CREATE INDEX idx_concept_cluster_core_concept ON concept_cluster(core_concept);
CREATE INDEX idx_concept_cluster_repetition ON concept_cluster(repetition_score);

CREATE TRIGGER update_concept_cluster_updated_at AFTER UPDATE ON concept_cluster
    FOR EACH ROW
    BEGIN
        UPDATE concept_cluster SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

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
);

CREATE INDEX idx_saq_conversion_source ON saq_conversion(source_mcq_id);
CREATE INDEX idx_saq_conversion_status ON saq_conversion(status);
CREATE INDEX idx_saq_conversion_cognitive ON saq_conversion(cognitive_level);

CREATE TRIGGER update_saq_conversion_updated_at AFTER UPDATE ON saq_conversion
    FOR EACH ROW
    BEGIN
        UPDATE saq_conversion SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

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
);

CREATE INDEX idx_laq_generation_subject ON laq_generation(subject);
CREATE INDEX idx_laq_generation_topic ON laq_generation(topic);
CREATE INDEX idx_laq_generation_status ON laq_generation(status);
CREATE INDEX idx_laq_generation_difficulty ON laq_generation(difficulty);

CREATE TRIGGER update_laq_generation_updated_at AFTER UPDATE ON laq_generation
    FOR EACH ROW
    BEGIN
        UPDATE laq_generation SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

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
);

CREATE INDEX idx_topic_concept_subject ON topic_concept(subject);
CREATE INDEX idx_topic_concept_topic ON topic_concept(topic);
CREATE INDEX idx_topic_concept_subject_topic ON topic_concept(subject, topic);
CREATE INDEX idx_topic_concept_concept_key ON topic_concept(concept_key);
CREATE INDEX idx_topic_concept_display_order ON topic_concept(display_order);

CREATE TRIGGER update_topic_concept_updated_at AFTER UPDATE ON topic_concept
    FOR EACH ROW
    BEGIN
        UPDATE topic_concept SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TABLE concept_mastery (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    concept_id TEXT NOT NULL REFERENCES topic_concept(id) ON DELETE CASCADE,
    mastery REAL DEFAULT 0.00 CHECK (mastery >= 0 AND mastery <= 1),
    last_seen TEXT,
    next_due TEXT,
    weak_points TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, concept_id)
);

CREATE INDEX idx_concept_mastery_user_id ON concept_mastery(user_id);
CREATE INDEX idx_concept_mastery_concept_id ON concept_mastery(concept_id);
CREATE INDEX idx_concept_mastery_user_concept ON concept_mastery(user_id, concept_id);
CREATE INDEX idx_concept_mastery_next_due ON concept_mastery(next_due);

CREATE TRIGGER update_concept_mastery_updated_at AFTER UPDATE ON concept_mastery
    FOR EACH ROW
    BEGIN
        UPDATE concept_mastery SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TABLE topic_gross_prompt (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    prompt_text TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(subject, topic)
);

CREATE INDEX idx_topic_gross_prompt_subject_topic ON topic_gross_prompt(subject, topic);

CREATE TRIGGER update_topic_gross_prompt_updated_at AFTER UPDATE ON topic_gross_prompt
    FOR EACH ROW
    BEGIN
        UPDATE topic_gross_prompt SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TABLE concept_map_session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    learner_level TEXT DEFAULT 'mid',
    snapshot TEXT,
    current_concept_id TEXT,
    current_point_id TEXT,
    probe_count INTEGER DEFAULT 0,
    leading_tier INTEGER DEFAULT 1,
    phase TEXT DEFAULT 'probing' CHECK (phase IN ('probing', 'completed')),
    completed_point_ids TEXT,
    summary_text TEXT,
    missed_points_text TEXT,
    must_repeat_question TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_concept_map_session_user_id ON concept_map_session(user_id);
CREATE INDEX idx_concept_map_session_phase ON concept_map_session(phase);
CREATE INDEX idx_concept_map_session_started_at ON concept_map_session(started_at);

CREATE TRIGGER update_concept_map_session_updated_at AFTER UPDATE ON concept_map_session
    FOR EACH ROW
    BEGIN
        UPDATE concept_map_session SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
