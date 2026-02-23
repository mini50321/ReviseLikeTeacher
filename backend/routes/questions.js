const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { db } = require('../db');

router.get('/', authenticate, async (req, res) => {
  try {
    const { subject, topic, type, difficulty, yield_category, limit = 20, offset = 0 } = req.query;

    let query = 'SELECT * FROM question WHERE status = $1';
    const params = ['active'];
    let paramCount = 2;

    if (subject) {
      query += ` AND subject = $${paramCount++}`;
      params.push(subject);
    }

    if (topic) {
      query += ` AND topic = $${paramCount++}`;
      params.push(topic);
    }

    if (type) {
      query += ` AND type = $${paramCount++}`;
      params.push(type);
    }

    if (difficulty) {
      query += ` AND difficulty = $${paramCount++}`;
      params.push(difficulty);
    }

    if (yield_category) {
      query += ` AND yield_category = $${paramCount++}`;
      params.push(yield_category);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(parseInt(limit), parseInt(offset));

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)').split('ORDER BY')[0];
    const countResult = await db.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    const result = await db.query(query, params);

    res.json({
      questions: result.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query('SELECT * FROM question WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get question error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      stem,
      type,
      subject,
      topic,
      subtopic,
      difficulty = 'medium',
      importance = 'medium',
      yield_category,
      cognitive_focus = 'factual',
      ideal_answer,
      key_points,
      previous_year_tags,
      options,
      correct_answer,
      distractor_analysis,
      concept_tags,
      trap_pattern,
      image_path,
      status = 'active'
    } = req.body;

    if (!stem || !type || !subject || !topic) {
      return res.status(400).json({ error: 'Stem, type, subject, and topic required' });
    }

    if ((type === 'mcq' || type === 'true_false' || type === 'assertion_reason') && !correct_answer) {
      return res.status(400).json({ error: 'Correct answer is required for this question type' });
    }

    if (yield_category && !['core', 'frequent', 'occasional', 'rare'].includes(yield_category)) {
      return res.status(400).json({ error: 'yield_category must be core, frequent, occasional, or rare' });
    }

    const questionId = db.generateUUID();

    const result = await db.query(
      `INSERT INTO question 
       (id, stem, type, subject, topic, subtopic, difficulty, importance, yield_category,
        cognitive_focus, ideal_answer, key_points, previous_year_tags, 
        options, correct_answer, distractor_analysis, concept_tags, trap_pattern,
        image_path, status, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) 
       RETURNING *`,
      [questionId, stem, type, subject, topic, subtopic, difficulty, importance,
       yield_category || null,
       cognitive_focus, ideal_answer, JSON.stringify(key_points || []), 
       JSON.stringify(previous_year_tags || []), 
       options ? JSON.stringify(options) : null, correct_answer || null,
       distractor_analysis ? (typeof distractor_analysis === 'string' ? distractor_analysis : JSON.stringify(distractor_analysis)) : null,
       concept_tags ? (typeof concept_tags === 'string' ? concept_tags : JSON.stringify(concept_tags)) : null,
       trap_pattern || null,
       image_path, status, req.user.userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create question error:', error);
    const errorMessage = error.message || 'Internal server error';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Question ID is required' });
    }

    console.log('Updating question:', { id, updates });

    const allowedFields = ['stem', 'type', 'subject', 'topic', 'subtopic', 
                           'difficulty', 'importance', 'yield_category', 'cognitive_focus', 
                           'ideal_answer', 'key_points', 'previous_year_tags',
                           'options', 'correct_answer', 'distractor_analysis',
                           'concept_tags', 'trap_pattern', 'image_path', 'status'];
    const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setParts = [];
    const values = [id];
    let paramCount = 2;

    const jsonFields = ['key_points', 'previous_year_tags', 'options', 'distractor_analysis', 'concept_tags'];
    updateFields.forEach(field => {
      if (jsonFields.includes(field) && updates[field] !== null && typeof updates[field] !== 'string') {
        setParts.push(`${field} = $${paramCount++}`);
        values.push(JSON.stringify(updates[field]));
      } else {
        setParts.push(`${field} = $${paramCount++}`);
        values.push(updates[field]);
      }
    });

    const setClause = setParts.join(', ');

    console.log('Executing UPDATE query:', {
      id,
      setClause,
      values: values.slice(1)
    });

    const checkResult = await db.query('SELECT id, status FROM question WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      console.log('Question not found in database:', id);
      return res.status(404).json({ error: 'Question not found' });
    }

    console.log('Question found:', checkResult.rows[0]);

    try {
      const updateQuery = `UPDATE question SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`;
      console.log('Executing UPDATE:', updateQuery);
      console.log('UPDATE values (full):', values);
      console.log('UPDATE setClause:', setClause);
      console.log('UPDATE updateFields:', updateFields);
      
      const updateResult = await db.query(updateQuery, values);
      console.log('UPDATE query executed, result:', JSON.stringify(updateResult, null, 2));
      console.log('UPDATE rowCount:', updateResult.rowCount);
      
      if (!updateResult || updateResult.rowCount === 0) {
        console.error('CRITICAL: UPDATE query did not affect any rows!');
        console.error('This means the WHERE clause did not match or the query failed silently.');
        return res.status(500).json({ error: 'Update query did not affect any rows' });
      }

      if (updateResult.rowCount === 0) {
        console.error('WARNING: UPDATE affected 0 rows! The question may not exist or the WHERE clause did not match.');
      }

      const updatedResult = await db.query('SELECT * FROM question WHERE id = $1', [id]);
      console.log('SELECT after UPDATE returned:', updatedResult.rows.length, 'rows');
      
      if (updatedResult.rows.length === 0) {
        console.error('Question not found after update for ID:', id);
        return res.status(404).json({ error: 'Question not found or could not be updated' });
      }

      const returnedStatus = updatedResult.rows[0].status;
      console.log('Question found after UPDATE. Status before:', checkResult.rows[0].status, 'Status after:', returnedStatus);
      
      if (returnedStatus === checkResult.rows[0].status && 'status' in updates) {
        console.error('ERROR: Status was not updated! Expected:', updates.status, 'Got:', returnedStatus);
      }

      console.log('Question updated successfully. New status:', returnedStatus);
      res.json(updatedResult.rows[0]);
    } catch (updateError) {
      console.error('Error during UPDATE operation:', updateError);
      console.error('Update error stack:', updateError.stack);
      throw updateError;
    }
  } catch (error) {
    console.error('Update question error:', error);
    const errorMessage = error.message || 'Internal server error';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;

