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
    onboarding_completed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE INDEX idx_userprofile_user_id ON userprofile(user_id);
CREATE INDEX idx_userprofile_exam_date ON userprofile(exam_date);

CREATE TABLE question (
    id TEXT PRIMARY KEY,
    stem TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('mcq', 'saq', 'case_based', 'true_false', 'assertion_reason')),
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    subtopic TEXT,
    difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    importance TEXT DEFAULT 'medium' CHECK (importance IN ('high', 'medium', 'low')),
    cognitive_focus TEXT DEFAULT 'factual' CHECK (cognitive_focus IN ('factual', 'conceptual', 'clinical')),
    ideal_answer TEXT,
    key_points TEXT,
    previous_year_tags TEXT,
    options TEXT,
    correct_answer TEXT,
    image_path TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
    created_by TEXT REFERENCES users(id),
    source_pdf_id TEXT,
    extracted_question_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_question_subject ON question(subject);
CREATE INDEX idx_question_topic ON question(topic);
CREATE INDEX idx_question_type ON question(type);
CREATE INDEX idx_question_difficulty ON question(difficulty);
CREATE INDEX idx_question_importance ON question(importance);
CREATE INDEX idx_question_status ON question(status);
CREATE INDEX idx_question_subject_topic ON question(subject, topic);

CREATE TABLE session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL CHECK (session_type IN ('practice', 'revision', 'quick')),
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
    feedback_rating TEXT CHECK (feedback_rating IN ('good', 'bad', 'worse')),
    submitted_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attempt_user_id ON attempt(user_id);
CREATE INDEX idx_attempt_question_id ON attempt(question_id);
CREATE INDEX idx_attempt_session_id ON attempt(session_id);
CREATE INDEX idx_attempt_submitted_at ON attempt(submitted_at);
CREATE INDEX idx_attempt_user_question ON attempt(user_id, question_id);

CREATE TABLE topicmastery (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    subject TEXT NOT NULL,
    mastery_level REAL DEFAULT 0.00 CHECK (mastery_level >= 0 AND mastery_level <= 100),
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

CREATE TABLE system_tuning_parameters (
    id TEXT PRIMARY KEY,
    parameter_name TEXT UNIQUE NOT NULL,
    parameter_value REAL NOT NULL,
    parameter_type TEXT NOT NULL CHECK (parameter_type IN ('threshold', 'weight', 'other')),
    category TEXT NOT NULL CHECK (category IN ('mastery', 'recall', 'scheduler', 'forecast')),
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

