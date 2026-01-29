const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { db } = require('../db');
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

    const filePath = `/uploads/${req.file.filename}`;
    const fileSize = req.file.size;

    const result = await db.query(
      `INSERT INTO pdfupload (admin_id, file_name, file_path, file_size, upload_status) 
       VALUES ($1, $2, $3, $4, 'uploaded') 
       RETURNING *`,
      [req.user.userId, req.file.originalname, filePath, fileSize]
    );

    res.status(201).json(result.rows[0]);
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
      image_path
    } = req.body;

    if (!extracted_text || !type || !subject || !topic) {
      return res.status(400).json({ error: 'Extracted text, type, subject, and topic required' });
    }

    const extractedResult = await db.query(
      `INSERT INTO extractedquestion 
       (pdfupload_id, extracted_text, detected_type, detected_subject, detected_topic, 
        detected_subtopic, detected_difficulty, detected_importance, detected_cognitive_focus,
        detected_key_points, detected_previous_year_tags, extracted_image_path, 
        confidence_score, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 100, 'draft') 
       RETURNING *`,
      [id, extracted_text, type, subject, topic, subtopic, difficulty, importance, 
       cognitive_focus, JSON.stringify(key_points || []), 
       JSON.stringify(previous_year_tags || []), image_path]
    );

    res.status(201).json(extractedResult.rows[0]);
  } catch (error) {
    console.error('Create manual question error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

