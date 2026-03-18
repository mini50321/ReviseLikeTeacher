const fs = require('fs');
const path = require('path');
const {
  normalizeConceptRecord,
  upsertMicroPdfConcept
} = require('../services/micropdf-concept-import');

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: node scripts/import-micropdf-concept.js <concept.json | concept.js>');
    process.exit(1);
  }

  try {
    const absPath = path.isAbsolute(fileArg)
      ? fileArg
      : path.join(__dirname, '..', 'data', fileArg);

    if (!fs.existsSync(absPath)) {
      throw new Error(`Concept file not found: ${absPath}`);
    }

    const raw = fs.readFileSync(absPath, 'utf8');
    const concept = absPath.endsWith('.js')
      // eslint-disable-next-line import/no-dynamic-require, global-require
      ? require(absPath)
      : JSON.parse(raw);

    const normalized = normalizeConceptRecord(concept);
    const result = await upsertMicroPdfConcept(normalized);
    console.log(`${result.action.toUpperCase()}: ${normalized.concept_key} (${normalized.name})`);
    if (result.warnings && result.warnings.length > 0) {
      console.log(`Warnings: ${result.warnings.join('; ')}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Import failed:', err.message);
    process.exit(1);
  }
}

main();
