CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE userprofile (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_exam VARCHAR(100),
    exam_date DATE,
    target_score_band VARCHAR(50),
    selected_subjects TEXT[],
    daily_study_minutes INTEGER DEFAULT 60 CHECK (daily_study_minutes >= 15 AND daily_study_minutes <= 480),
    weekly_question_target INTEGER DEFAULT 50 CHECK (weekly_question_target >= 5 AND weekly_question_target <= 500),
    intelligence_level VARCHAR(20) DEFAULT 'medium' CHECK (intelligence_level IN ('high', 'medium', 'low')),
    intelligence_score DECIMAL(5,2) DEFAULT 50.00 CHECK (intelligence_score >= 0 AND intelligence_score <= 100),
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE INDEX idx_userprofile_user_id ON userprofile(user_id);
CREATE INDEX idx_userprofile_exam_date ON userprofile(exam_date);

CREATE TABLE question (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stem TEXT NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('mcq', 'saq', 'case_based', 'true_false', 'assertion_reason')),
    subject VARCHAR(100) NOT NULL,
    topic VARCHAR(100) NOT NULL,
    subtopic VARCHAR(100),
    difficulty VARCHAR(20) DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    importance VARCHAR(20) DEFAULT 'medium' CHECK (importance IN ('high', 'medium', 'low')),
    cognitive_focus VARCHAR(20) DEFAULT 'factual' CHECK (cognitive_focus IN ('factual', 'conceptual', 'clinical')),
    ideal_answer TEXT,
    key_points JSONB,
    previous_year_tags JSONB,
    image_path VARCHAR(500),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
    created_by UUID REFERENCES users(id),
    source_pdf_id UUID,
    extracted_question_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_question_subject ON question(subject);
CREATE INDEX idx_question_topic ON question(topic);
CREATE INDEX idx_question_type ON question(type);
CREATE INDEX idx_question_difficulty ON question(difficulty);
CREATE INDEX idx_question_importance ON question(importance);
CREATE INDEX idx_question_status ON question(status);
CREATE INDEX idx_question_subject_topic ON question(subject, topic);

CREATE TABLE session (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_type VARCHAR(50) NOT NULL CHECK (session_type IN ('practice', 'revision', 'quick')),
    configuration JSONB,
    total_questions INTEGER DEFAULT 0,
    accuracy DECIMAL(5,2),
    average_score DECIMAL(5,2),
    total_time_seconds INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned'))
);

CREATE INDEX idx_session_user_id ON session(user_id);
CREATE INDEX idx_session_status ON session(status);
CREATE INDEX idx_session_started_at ON session(started_at);

CREATE TABLE attempt (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES question(id) ON DELETE CASCADE,
    session_id UUID REFERENCES session(id) ON DELETE SET NULL,
    answer_text TEXT NOT NULL,
    answer_method VARCHAR(20) NOT NULL CHECK (answer_method IN ('voice', 'text')),
    language VARCHAR(20) CHECK (language IN ('english', 'hindi', 'hinglish')),
    ai_feedback JSONB,
    ai_score INTEGER CHECK (ai_score >= 0 AND ai_score <= 100),
    time_spent_seconds INTEGER DEFAULT 0,
    feedback_rating VARCHAR(20) CHECK (feedback_rating IN ('good', 'bad', 'worse')),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attempt_user_id ON attempt(user_id);
CREATE INDEX idx_attempt_question_id ON attempt(question_id);
CREATE INDEX idx_attempt_session_id ON attempt(session_id);
CREATE INDEX idx_attempt_submitted_at ON attempt(submitted_at);
CREATE INDEX idx_attempt_user_question ON attempt(user_id, question_id);

CREATE TABLE topicmastery (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic VARCHAR(100) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    mastery_level DECIMAL(5,2) DEFAULT 0.00 CHECK (mastery_level >= 0 AND mastery_level <= 100),
    revision_count INTEGER DEFAULT 0,
    required_revisions INTEGER DEFAULT 3 CHECK (required_revisions >= 1 AND required_revisions <= 10),
    completed_revisions INTEGER DEFAULT 0,
    last_revision_date DATE,
    next_revision_date DATE,
    intelligence_factor DECIMAL(3,2) DEFAULT 1.00,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, topic, subject)
);

CREATE INDEX idx_topicmastery_user_id ON topicmastery(user_id);
CREATE INDEX idx_topicmastery_topic ON topicmastery(topic);
CREATE INDEX idx_topicmastery_subject ON topicmastery(subject);
CREATE INDEX idx_topicmastery_next_revision ON topicmastery(next_revision_date);
CREATE INDEX idx_topicmastery_user_topic ON topicmastery(user_id, topic);

CREATE TABLE questionmastery (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES question(id) ON DELETE CASCADE,
    mastery_level DECIMAL(5,2) DEFAULT 0.00 CHECK (mastery_level >= 0 AND mastery_level <= 100),
    attempt_count INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP,
    first_correct_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, question_id)
);

CREATE INDEX idx_questionmastery_user_id ON questionmastery(user_id);
CREATE INDEX idx_questionmastery_question_id ON questionmastery(question_id);
CREATE INDEX idx_questionmastery_user_question ON questionmastery(user_id, question_id);

CREATE TABLE revisionschedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    planned_questions INTEGER DEFAULT 0,
    planned_minutes INTEGER DEFAULT 0,
    subjects TEXT[],
    topics JSONB,
    question_types JSONB,
    difficulty_mix JSONB,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'complete', 'partial', 'skipped')),
    completed_questions INTEGER DEFAULT 0,
    actual_minutes INTEGER DEFAULT 0,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

CREATE INDEX idx_revisionschedule_user_id ON revisionschedule(user_id);
CREATE INDEX idx_revisionschedule_date ON revisionschedule(date);
CREATE INDEX idx_revisionschedule_status ON revisionschedule(status);
CREATE INDEX idx_revisionschedule_user_date ON revisionschedule(user_id, date);

CREATE TABLE examreadiness (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    readiness_percentage DECIMAL(5,2) DEFAULT 0.00 CHECK (readiness_percentage >= 0 AND readiness_percentage <= 100),
    status VARCHAR(20) DEFAULT 'off_track' CHECK (status IN ('on_track', 'borderline', 'off_track')),
    forecast_data JSONB,
    last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE INDEX idx_examreadiness_user_id ON examreadiness(user_id);
CREATE INDEX idx_examreadiness_status ON examreadiness(status);

CREATE TABLE pdfupload (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT,
    upload_status VARCHAR(20) DEFAULT 'uploaded' CHECK (upload_status IN ('uploaded', 'processing', 'extracted', 'failed')),
    extraction_summary JSONB,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

CREATE INDEX idx_pdfupload_admin_id ON pdfupload(admin_id);
CREATE INDEX idx_pdfupload_status ON pdfupload(upload_status);
CREATE INDEX idx_pdfupload_uploaded_at ON pdfupload(uploaded_at);

CREATE TABLE extractedquestion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pdfupload_id UUID NOT NULL REFERENCES pdfupload(id) ON DELETE CASCADE,
    extracted_text TEXT NOT NULL,
    detected_type VARCHAR(50),
    detected_subject VARCHAR(100),
    detected_topic VARCHAR(100),
    detected_subtopic VARCHAR(100),
    detected_importance VARCHAR(20),
    detected_cognitive_focus VARCHAR(20),
    detected_difficulty VARCHAR(20),
    detected_key_points JSONB,
    detected_previous_year_tags JSONB,
    extracted_image_path VARCHAR(500),
    confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'accepted', 'accepted_edited', 'rejected')),
    admin_corrections JSONB,
    extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by UUID REFERENCES users(id)
);

CREATE INDEX idx_extractedquestion_pdfupload_id ON extractedquestion(pdfupload_id);
CREATE INDEX idx_extractedquestion_status ON extractedquestion(status);
CREATE INDEX idx_extractedquestion_confidence ON extractedquestion(confidence_score);

CREATE TABLE system_tuning_parameters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parameter_name VARCHAR(100) UNIQUE NOT NULL,
    parameter_value DECIMAL(10,4) NOT NULL,
    parameter_type VARCHAR(20) NOT NULL CHECK (parameter_type IN ('threshold', 'weight', 'other')),
    category VARCHAR(50) NOT NULL CHECK (category IN ('mastery', 'recall', 'scheduler', 'forecast')),
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tuning_params_category ON system_tuning_parameters(category);
CREATE INDEX idx_tuning_params_name ON system_tuning_parameters(parameter_name);

CREATE TABLE feedback_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attempt_id UUID NOT NULL REFERENCES attempt(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating VARCHAR(20) NOT NULL CHECK (rating IN ('good', 'bad', 'worse')),
    feedback_text TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_ratings_attempt_id ON feedback_ratings(attempt_id);
CREATE INDEX idx_feedback_ratings_user_id ON feedback_ratings(user_id);
CREATE INDEX idx_feedback_ratings_rating ON feedback_ratings(rating);

CREATE TABLE extraction_corrections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    extracted_question_id UUID NOT NULL REFERENCES extractedquestion(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    corrections JSONB NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_extraction_corrections_extracted_id ON extraction_corrections(extracted_question_id);
CREATE INDEX idx_extraction_corrections_admin_id ON extraction_corrections(admin_id);

CREATE TABLE evaluation_corrections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attempt_id UUID NOT NULL REFERENCES attempt(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    corrections JSONB NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_evaluation_corrections_attempt_id ON evaluation_corrections(attempt_id);
CREATE INDEX idx_evaluation_corrections_admin_id ON evaluation_corrections(admin_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_userprofile_updated_at BEFORE UPDATE ON userprofile
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_question_updated_at BEFORE UPDATE ON question
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_topicmastery_updated_at BEFORE UPDATE ON topicmastery
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questionmastery_updated_at BEFORE UPDATE ON questionmastery
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

