INSERT INTO system_tuning_parameters (parameter_name, parameter_value, parameter_type, category) VALUES
('strong_mastery_threshold', 80.0, 'threshold', 'mastery'),
('moderate_mastery_threshold', 50.0, 'threshold', 'mastery'),
('high_recall_threshold', 90.0, 'threshold', 'recall'),
('medium_recall_threshold', 70.0, 'threshold', 'recall'),
('importance_weight', 1.0, 'weight', 'scheduler'),
('difficulty_weight', 0.8, 'weight', 'scheduler'),
('intelligence_weight', 0.6, 'weight', 'scheduler'),
('mastery_weight', 0.7, 'weight', 'forecast'),
('adherence_weight', 0.3, 'weight', 'forecast');

INSERT INTO users (id, email, password_hash, role, email_verified) VALUES
('00000000-0000-0000-0000-000000000001', 'admin@reviseliketeacher.com', '$2b$10$example_hash_admin', 'admin', TRUE),
('00000000-0000-0000-0000-000000000002', 'student@example.com', '$2b$10$example_hash_student', 'student', TRUE);

INSERT INTO userprofile (user_id, target_exam, exam_date, target_score_band, selected_subjects, daily_study_minutes, weekly_question_target, onboarding_completed) VALUES
('00000000-0000-0000-0000-000000000002', 'NEET PG', '2024-12-31', '650-700', ARRAY['Pathology', 'Anatomy', 'Physiology'], 120, 80, TRUE);

