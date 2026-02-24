const fs = require('fs');
const path = require('path');
const { db } = require('./db');
const { extractQuestionsFromPDF } = require('./services/ai');
(async () => {
  try {
    const r = await db.query("SELECT id, file_name, file_path FROM pdfupload WHERE file_name LIKE 'OB MCQ5%' ORDER BY uploaded_at DESC LIMIT 1");
    if (!r.rows.length) {
      console.log('No matching PDF found');
      process.exit(0);
    }
    const pdf = r.rows[0];
    console.log('Testing', pdf.file_name, pdf.file_path);
    const fullPath = path.join(__dirname, pdf.file_path);
    const buf = fs.readFileSync(fullPath);
    const out = await extractQuestionsFromPDF(buf, pdf.file_name);
    console.log('ok', out.total_extracted, out.summary);
  } catch (e) {
    console.error('EXTRACT_ERR', e.message);
  }
  process.exit(0);
})();
