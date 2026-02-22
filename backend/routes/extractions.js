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

    res.json({ extractions: result.rows });
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
        status: 'active'
      };

      if (corrections) {
        Object.assign(questionData, corrections);
      }

      const questionResult = await db.query(
        `INSERT INTO question
         (stem, type, subject, topic, subtopic, difficulty, importance,
          cognitive_focus, ideal_answer, key_points, previous_year_tags,
          options, correct_answer,
          image_path, status, created_by, source_pdf_id, extracted_question_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [
          questionData.stem,
          questionData.type,
          questionData.subject,
          questionData.topic,
          questionData.subtopic,
          questionData.difficulty,
          questionData.importance,
          questionData.cognitive_focus,
          questionData.ideal_answer || '',
          JSON.stringify(questionData.key_points || []),
          JSON.stringify(questionData.previous_year_tags || []),
          questionData.options || null,
          questionData.correct_answer || null,
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
        question: questionResult.rows[0]
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

