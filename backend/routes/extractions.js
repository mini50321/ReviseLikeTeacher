const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { db } = require('../db');

router.get('/:pdfId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { pdfId } = req.params;

    const result = await db.query(
      'SELECT * FROM extractedquestion WHERE pdfupload_id = $1 ORDER BY extracted_at DESC',
      [pdfId]
    );

    const rows = result.rows || [];
    let latestYear = null;

    for (const row of rows) {
      const yearValue = row.most_recent_year;
      const year = typeof yearValue === 'number' ? yearValue : yearValue ? Number(yearValue) : null;
      if (!year || Number.isNaN(year)) continue;
      if (latestYear === null || year > latestYear) {
        latestYear = year;
      }
    }

    const extractions = rows.map(row => {
      const type = (row.detected_type || '').toLowerCase();
      const isMcq = type === 'mcq';
      let pyqLabel = null;

      const yearValue = row.most_recent_year;
      const year = typeof yearValue === 'number' ? yearValue : yearValue ? Number(yearValue) : null;

      if (isMcq && year && latestYear) {
        pyqLabel = year === latestYear ? 'latest' : 'older';
      }

      return {
        ...row,
        pyq_label: pyqLabel
      };
    });

    res.json({ extractions });
  } catch (error) {
    console.error('Get extractions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/review', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, corrections } = req.body;

    if (!action || !['accept', 'reject', 'save_draft'].includes(action)) {
      return res.status(400).json({ error: 'Valid action required: accept, reject, or save_draft' });
    }

    const extractionResult = await db.query(
      'SELECT * FROM extractedquestion WHERE id = $1',
      [id]
    );

    if (extractionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Extraction not found' });
    }

    const extraction = extractionResult.rows[0];

    if (action === 'accept') {
      const questionData = corrections || {
        stem: extraction.extracted_text,
        type: extraction.detected_type,
        subject: extraction.detected_subject,
        topic: extraction.detected_topic,
        subtopic: extraction.detected_subtopic,
        difficulty: extraction.detected_difficulty,
        importance: extraction.detected_importance,
        cognitive_focus: extraction.detected_cognitive_focus,
        ideal_answer: extraction.extracted_ideal_answer || '',
        key_points: extraction.detected_key_points,
        previous_year_tags: extraction.detected_previous_year_tags,
        options: extraction.extracted_options || null,
        correct_answer: extraction.extracted_correct_answer || null,
        image_path: extraction.extracted_image_path,
        yield_category: extraction.yield_category || null,
        distractor_analysis: extraction.detected_distractor_analysis || null,
        concept_tags: extraction.detected_concept_tags || null,
        trap_pattern: extraction.detected_trap_pattern || null,
        status: 'active'
      };

      if (corrections) {
        Object.assign(questionData, corrections);
      }

      const questionId = db.generateUUID();
      const questionResult = await db.query(
        `INSERT INTO question
         (id, stem, type, subject, topic, subtopic, difficulty, importance,
          cognitive_focus, ideal_answer, key_points, previous_year_tags,
          options, correct_answer, yield_category, distractor_analysis,
          concept_tags, trap_pattern,
          image_path, status, created_by, source_pdf_id, extracted_question_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
        [
          questionId,
          questionData.stem,
          questionData.type,
          questionData.subject,
          questionData.topic,
          questionData.subtopic,
          questionData.difficulty,
          questionData.importance,
          questionData.cognitive_focus,
          questionData.ideal_answer || '',
          JSON.stringify(Array.isArray(questionData.key_points) ? questionData.key_points : (questionData.key_points || [])),
          JSON.stringify(Array.isArray(questionData.previous_year_tags) ? questionData.previous_year_tags : (questionData.previous_year_tags || [])),
          questionData.options || null,
          questionData.correct_answer || null,
          questionData.yield_category || null,
          questionData.distractor_analysis || null,
          Array.isArray(questionData.concept_tags) ? JSON.stringify(questionData.concept_tags) : (questionData.concept_tags || null),
          questionData.trap_pattern || null,
          questionData.image_path || '',
          questionData.status || 'active',
          req.user.userId,
          extraction.pdfupload_id,
          id
        ]
      );

      await db.query(
        `UPDATE extractedquestion 
         SET status = 'accepted', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1,
             admin_corrections = $2
         WHERE id = $3`,
        [req.user.userId, JSON.stringify(corrections || {}), id]
      );

      res.json({
        message: 'Question accepted and added to bank',
        question: { id: questionId, ...questionData }
      });
    } else if (action === 'reject') {
      await db.query(
        `UPDATE extractedquestion 
         SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
         WHERE id = $2`,
        [req.user.userId, id]
      );

      res.json({ message: 'Extraction rejected' });
    } else if (action === 'save_draft') {
      await db.query(
        `UPDATE extractedquestion 
         SET status = 'draft', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1,
             admin_corrections = $2
         WHERE id = $3`,
        [req.user.userId, JSON.stringify(corrections || {}), id]
      );

      res.json({ message: 'Saved as draft' });
    }
  } catch (error) {
    console.error('Review extraction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

