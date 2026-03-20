const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');
const { extractQuestionsFromPDF, buildConceptDraftFromText } = require('../services/ai');
const { parseMicroPdfConceptText } = require('../services/micropdf-text-parser');
const { importMicroPdfConceptBatch } = require('../services/micropdf-concept-import');
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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'pdf-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  }
});

async function extractRawTextAndStore({ pdfId, pdf, fileBuffer }) {
  await db.query(
    `UPDATE pdfupload SET upload_status = 'processing' WHERE id = $1`,
    [pdfId]
  );

  const chunkSize = Number(process.env.PDF_CHUNK_PAGE_SIZE || 5);
  const maxChunks = Number(process.env.PDF_MAX_CHUNKS || 30);

  let lastSummary = '';
  const rawTextParts = [];

  for (let chunkIndex = 0; chunkIndex < maxChunks; chunkIndex += 1) {
    const startPage = chunkIndex * chunkSize;
    const endPage = startPage + chunkSize;

    const result = await extractQuestionsFromPDF(fileBuffer, pdf.file_name, startPage, endPage);
    const questions = result.questions || [];
    const textLength = result.text_length || 0;
    const rawText = result.text || '';

    if (rawText && rawText.trim()) rawTextParts.push(rawText);
    if (result.summary) lastSummary = result.summary;
    if (questions.length === 0 && textLength < 50) {
      if (chunkIndex === 0) {
        await db.query(
          `UPDATE pdfupload SET upload_status = 'failed' WHERE id = $1`,
          [pdfId]
        );
        return { ok: false };
      }
      break;
    }

    if (questions.length === 0) break;
  }

  const combinedRawText = rawTextParts.join('\n\n');
  await db.query(
    `UPDATE pdfupload
     SET upload_status = 'extracted',
         extraction_summary = $1,
         processed_at = CURRENT_TIMESTAMP,
         raw_text = $2,
         raw_text_length = $3
     WHERE id = $4`,
    [
      lastSummary || `Extracted text for PDF ${pdf.file_name}`,
      combinedRawText || null,
      combinedRawText ? combinedRawText.length : 0,
      pdfId
    ]
  );

  return { ok: true, rawText: combinedRawText || '' };
}

function extractSubjectTopicFromRawText(rawText) {
  const subjectMatch = String(rawText || '').match(/Subject\s*:\s*(.+)/i);
  const topicMatch =
    String(rawText || '').match(/Main Topic\s*:\s*(.+)/i) ||
    String(rawText || '').match(/Topic\s*:\s*(.+)/i);
  return {
    subject: subjectMatch?.[1]?.trim() || null,
    topic: topicMatch?.[1]?.trim() || null
  };
}

async function parseAndImportConceptsFromRawText(rawText, fallback) {
  const parsed = parseMicroPdfConceptText(rawText);
  let draft = parsed?.draft || null;
  if (!draft) {
    const st = extractSubjectTopicFromRawText(rawText);
    const subject = fallback?.subject || st.subject;
    const topic = fallback?.topic || st.topic;
    if (!subject || !topic) {
      throw new Error('Unable to determine subject/topic for concept drafting');
    }
    const built = await buildConceptDraftFromText({
      subject,
      topic,
      text: rawText,
      maxConcepts: fallback?.max_concepts || 6
    });
    draft = built;
  }

  const concepts = Array.isArray(draft?.concepts) ? draft.concepts : (Array.isArray(draft) ? draft : []);
  if (!concepts.length) throw new Error('No concepts found to import');

  const importResult = await importMicroPdfConceptBatch(concepts, {});
  const importedConcepts = Array.isArray(importResult?.results) ? importResult.results : [];
  const conceptIds = importedConcepts.filter(r => r.status !== 'failed').map(r => r.id).filter(Boolean);
  const selectedConceptId = conceptIds[0] || null;

  return {
    draft,
    importResult,
    concepts_imported: importedConcepts,
    selected_concept_id: selectedConceptId
  };
}

router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

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
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:pdfId/prepare', authenticate, async (req, res) => {
  try {
    const { pdfId } = req.params;
    const { subject, topic, max_concepts } = req.body || {};
    const pdfResult = await db.query(
      'SELECT * FROM pdfupload WHERE id = $1 AND admin_id = $2',
      [pdfId, req.user.userId]
    );
    if (!pdfResult.rows.length) return res.status(404).json({ error: 'PDF not found' });

    const pdf = pdfResult.rows[0];
    const rawText = pdf.raw_text || '';

    let extracted = { ok: false, rawText: '' };
    if (!rawText || !rawText.trim() || pdf.upload_status !== 'extracted') {
      const filePath = path.join(__dirname, '..', pdf.file_path);
      const fileBuffer = await fs.readFile(filePath);
      extracted = await extractRawTextAndStore({ pdfId, pdf, fileBuffer });
      if (!extracted.ok) return res.status(400).json({ error: 'PDF extraction failed' });
    }

    const combinedRawText = (extracted.rawText && extracted.rawText.trim() ? extracted.rawText : rawText) || '';
    if (!combinedRawText.trim()) return res.status(400).json({ error: 'No extracted text available for this PDF' });

    const parsedImport = await parseAndImportConceptsFromRawText(combinedRawText, {
      subject,
      topic,
      max_concepts: max_concepts || 6
    });

    res.json({
      pdf_id: pdfId,
      status: 'imported',
      selected_concept_id: parsedImport.selected_concept_id,
      concepts_imported: parsedImport.concepts_imported
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to prepare Micro-PDF' });
  }
});

module.exports = router;

