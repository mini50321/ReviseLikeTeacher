const { db } = require('./db');
(async () => {
  const r = await db.query("SELECT id,file_name,file_path,upload_status FROM pdfupload ORDER BY uploaded_at DESC LIMIT 5");
  console.log(r.rows);
  process.exit(0);
})();
