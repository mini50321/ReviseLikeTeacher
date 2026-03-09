const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { db } = require('../db');
const { extractQuestionsFromPDF, buildConceptDraftFromText } = require('../services/ai');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const uploadDir = path.join(__dirname, '../uploads');
const ensureUploadDir = async () => {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
  }
};

ensureUploadDir();

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureUploadDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'pdf-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

router.post('/upload', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const pdfId = db.generateUUID();
    const filePath = `/uploads/${req.file.filename}`;
    const fileSize = req.file.size;

    await db.query(
      `INSERT INTO pdfupload (id, admin_id, file_name, file_path, file_size, upload_status) 
       VALUES ($1, $2, $3, $4, $5, 'uploaded')`,
      [pdfId, req.user.userId, req.file.originalname, filePath, fileSize]
    );

    res.status(201).json({
      id: pdfId,
      admin_id: req.user.userId,
      file_name: req.file.originalname,
      file_path: filePath,
      file_size: fileSize,
      upload_status: 'uploaded',
      uploaded_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('PDF upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM pdfupload ORDER BY uploaded_at DESC LIMIT 50'
    );

    res.json({ pdfs: result.rows });
  } catch (error) {
    console.error('Get PDFs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const pdfResult = await db.query('SELECT * FROM pdfupload WHERE id = $1', [id]);
    if (pdfResult.rows.length === 0) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const extractedResult = await db.query(
      'SELECT * FROM extractedquestion WHERE pdfupload_id = $1 ORDER BY extracted_at DESC',
      [id]
    );

    res.json({
      pdf: pdfResult.rows[0],
      extractedQuestions: extractedResult.rows
    });
  } catch (error) {
    console.error('Get PDF details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/extract', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const pdfResult = await db.query('SELECT * FROM pdfupload WHERE id = $1', [id]);
    if (pdfResult.rows.length === 0) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const pdf = pdfResult.rows[0];

    await db.query(
      "UPDATE pdfupload SET upload_status = 'processing' WHERE id = $1",
      [id]
    );

    const filePath = path.join(__dirname, '..', pdf.file_path);
    let fileBuffer;
    try {
      fileBuffer = await fs.readFile(filePath);
    } catch (readError) {
      await db.query(
        "UPDATE pdfupload SET upload_status = 'failed' WHERE id = $1",
        [id]
      );
      return res.status(404).json({ error: 'PDF file not found on server' });
    }

    (async () => {
      try {
        const chunkSize = Number(process.env.PDF_CHUNK_PAGE_SIZE || 5);
        const maxChunks = Number(process.env.PDF_MAX_CHUNKS || 30);

        let totalExtracted = 0;
        let lastSummary = '';
        const rawTextParts = [];
        let rawTextLength = 0;

        for (let chunkIndex = 0; chunkIndex < maxChunks; chunkIndex++) {
          const startPage = chunkIndex * chunkSize;
          const endPage = startPage + chunkSize;

          const result = await extractQuestionsFromPDF(fileBuffer, pdf.file_name, startPage, endPage);
          const questions = result.questions || [];
          const textLength = result.text_length || 0;
          const rawText = result.text || '';

          if (rawText && rawText.trim()) {
            rawTextParts.push(rawText);
            rawTextLength += rawText.length;
          }

          if (questions.length === 0 && textLength < 50) {
            if (chunkIndex === 0) {
              await db.query(
                "UPDATE pdfupload SET upload_status = 'failed' WHERE id = $1",
                [id]
              );
            }
            break;
          }

          const pageRange = `${startPage + 1}-${endPage}`;

          for (const q of questions) {
            const eqId = db.generateUUID();
            const stemWithRange = `Pages ${pageRange}: ${q.stem || ''}`;
            await db.query(
              `INSERT INTO extractedquestion
               (id, pdfupload_id, extracted_text, detected_type, detected_subject,
                detected_topic, detected_subtopic, detected_difficulty, detected_importance,
                detected_cognitive_focus, detected_key_points, detected_previous_year_tags,
                extracted_options, extracted_correct_answer, extracted_ideal_answer,
                yield_category, detected_distractor_analysis, detected_concept_tags,
                detected_trap_pattern, frequency_count, most_recent_year,
                confidence_score, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 'draft')`,
              [
                eqId,
                id,
                stemWithRange,
                q.type || 'mcq',
                q.subject || 'Unknown',
                q.topic || 'General',
                q.subtopic || null,
                q.difficulty || 'medium',
                q.importance || 'medium',
                q.cognitive_focus || 'factual',
                JSON.stringify(q.key_points || []),
                JSON.stringify(q.exam_tags || []),
                q.options ? JSON.stringify(q.options) : null,
                q.correct_answer || null,
                q.ideal_answer || null,
                q.yield_category || 'occasional',
                typeof q.distractor_analysis === 'string' ? q.distractor_analysis : JSON.stringify(q.distractor_analysis || null),
                typeof q.concept_tags === 'string' ? q.concept_tags : JSON.stringify(q.concept_tags || []),
                q.trap_pattern || null,
                q.frequency_count || 1,
                q.most_recent_year || null,
                80
              ]
            );
            totalExtracted += 1;
          }

          const subtopicYield = result.subtopic_yield || [];
          for (const sy of subtopicYield) {
            const syId = db.generateUUID();
            const existing = await db.query(
              'SELECT id, pyq_count FROM subtopic_yield WHERE subject = $1 AND topic = $2 AND subtopic = $3',
              [sy.subject, sy.topic, sy.subtopic]
            );

            if (existing.rows.length > 0) {
              const newCount = existing.rows[0].pyq_count + sy.pyq_count;
              const newCategory = newCount >= 10 ? 'core' : newCount >= 5 ? 'frequent' : newCount >= 2 ? 'occasional' : 'rare';
              await db.query(
                `UPDATE subtopic_yield SET pyq_count = $1, yield_category = $2,
                 years_appeared = $3, most_recent_year = $4 WHERE id = $5`,
                [newCount, newCategory, JSON.stringify(sy.years_appeared || []),
                 sy.most_recent_year || null, existing.rows[0].id]
              );
            } else {
              await db.query(
                `INSERT INTO subtopic_yield (id, subject, topic, subtopic, pyq_count, yield_category, years_appeared, most_recent_year)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [syId, sy.subject, sy.topic, sy.subtopic, sy.pyq_count,
                 sy.yield_category, JSON.stringify(sy.years_appeared || []),
                 sy.most_recent_year || null]
              );
            }
          }

          lastSummary = result.summary || lastSummary;

          if (questions.length === 0) {
            break;
          }
        }

        const combinedRawText = rawTextParts.join('\n\n');

        if (totalExtracted > 0 || combinedRawText) {
          await db.query(
            "UPDATE pdfupload SET upload_status = 'extracted', extraction_summary = $1, processed_at = CURRENT_TIMESTAMP, raw_text = $2, raw_text_length = $3 WHERE id = $4",
            [
              lastSummary || `Extracted ${totalExtracted} questions in chunks.`,
              combinedRawText || null,
              combinedRawText ? rawTextLength : 0,
              id
            ]
          );
        }
      } catch (aiError) {
        console.error('Background PDF extraction error:', aiError);
        await db.query(
          "UPDATE pdfupload SET upload_status = 'failed' WHERE id = $1",
          [id]
        );
      }
    })();

    return res.status(202).json({ status: 'processing' });
  } catch (error) {
    console.error('PDF extraction route error:', error);
    res.status(500).json({ error: error.message || 'Extraction failed' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const pdfResult = await db.query('SELECT * FROM pdfupload WHERE id = $1', [id]);
    if (pdfResult.rows.length === 0) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const pdf = pdfResult.rows[0];

    await db.query('DELETE FROM extractedquestion WHERE pdfupload_id = $1', [id]);
    await db.query('DELETE FROM pdfupload WHERE id = $1', [id]);

    try {
      const filePath = path.join(__dirname, '..', pdf.file_path);
      await fs.unlink(filePath);
    } catch (fileErr) {
      console.warn('Could not delete file from disk:', fileErr.message);
    }

    res.json({ message: 'PDF and its extracted questions deleted' });
  } catch (error) {
    console.error('Delete PDF error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/manual-question', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      extracted_text,
      type,
      subject,
      topic,
      subtopic,
      difficulty,
      importance,
      cognitive_focus,
      key_points,
      previous_year_tags,
      yield_category,
      distractor_analysis,
      concept_tags,
      trap_pattern,
      image_path
    } = req.body;

    if (!extracted_text || !type || !subject || !topic) {
      return res.status(400).json({ error: 'Extracted text, type, subject, and topic required' });
    }

    const extractedResult = await db.query(
      `INSERT INTO extractedquestion 
       (pdfupload_id, extracted_text, detected_type, detected_subject, detected_topic, 
        detected_subtopic, detected_difficulty, detected_importance, detected_cognitive_focus,
        detected_key_points, detected_previous_year_tags, yield_category,
        detected_distractor_analysis, detected_concept_tags, detected_trap_pattern,
        extracted_image_path, confidence_score, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 100, 'draft') 
       RETURNING *`,
      [id, extracted_text, type, subject, topic, subtopic, difficulty, importance, 
       cognitive_focus, JSON.stringify(key_points || []), 
       JSON.stringify(previous_year_tags || []),
       yield_category || null,
       distractor_analysis || null,
       concept_tags ? (typeof concept_tags === 'string' ? concept_tags : JSON.stringify(concept_tags)) : null,
       trap_pattern || null,
       image_path]
    );

    res.status(201).json(extractedResult.rows[0]);
  } catch (error) {
    console.error('Create manual question error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/concept-draft', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, topic, max_concepts } = req.body || {};

    if (!subject || !topic) {
      return res.status(400).json({ error: 'subject and topic are required' });
    }

    const pdfResult = await db.query('SELECT * FROM pdfupload WHERE id = $1', [id]);
    if (pdfResult.rows.length === 0) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const pdf = pdfResult.rows[0];
    const rawText = pdf.raw_text || '';

    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ error: 'No extracted text available for this PDF. Run extraction first.' });
    }

    const maxConceptsNum = Math.min(Math.max(parseInt(max_concepts || '6', 10), 1), 12);

    const draft = await buildConceptDraftFromText({
      subject,
      topic,
      text: rawText,
      maxConcepts: maxConceptsNum
    });

    res.json({
      pdf_id: id,
      subject,
      topic,
      draft
    });
  } catch (error) {
    console.error('Concept draft build route error:', error);
    res.status(500).json({ error: error.message || 'Failed to build concept draft' });
  }
});

module.exports = router;

