Micro-PDF Tutor Acceptance Checklist

1) Upload Micro-PDF (student)
- Call `POST /api/micropdf-tutor/upload` (multipart/form-data, field name: `file`) with `Authorization: Bearer <token>`.
- Save the returned `id` as `pdfId`.

2) Prepare + auto-import concepts
- Call `POST /api/micropdf-tutor/:pdfId/prepare` with `Authorization`.
- Confirm response returns `selected_concept_id`.
- Save `selected_concept_id` as `conceptId`.

3) Start diagnostic from the imported concept
- Call `POST /api/diagnostic/start-from-micropdf` with body `{ "concept_id": conceptId }` and `Authorization`.
- Confirm response returns:
  - `diagnostic_id`, `session_id`, `topic_learning_session_id`
  - `questions` with at least one SAQ item

4) Verify SAQ question generation
- Confirm the first SAQ stem matches the imported Micro-PDF content (it should not be blank even when `concept.micro_questions[0]` is a string).

5) Verify Socratic tutoring adapts step-by-step
- Submit an incorrect SAQ answer.
- In Socratic tutoring:
  - Confirm prompts are derived from missing rubric points (they should change after each turn).
  - Confirm the exact same prompt does not repeat when you miss by typing “near” answers (spelling/keyword mismatches).

6) Verify “I don’t know” progression
- Enter `I don’t know` (or `IDK`) twice consecutively.
- Confirm the tutor does not revert to the plain question repeatedly.
- Confirm the tutor reveals the correct structure and then moves to the next missing step.

7) Regression sanity checks
- Enter `Yes` / `No` and confirm the tutor still advances through the missed-points queue.
- Confirm UI remains responsive and the “Send” input works after each turn.

