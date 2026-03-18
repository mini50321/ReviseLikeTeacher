const fs = require('fs');
const path = require('path');
const {
  normalizeConceptRecord,
  importMicroPdfConceptBatch
} = require('../services/micropdf-concept-import');

function expandInputPaths(args) {
  const files = [];
  for (const arg of args) {
    const abs = path.isAbsolute(arg) ? arg : path.join(__dirname, '..', arg);
    if (!fs.existsSync(abs)) {
      continue;
    }
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(abs)
        .filter(name => name.endsWith('.json') || name.endsWith('.js'))
        .map(name => path.join(abs, name));
      files.push(...entries);
    } else {
      files.push(abs);
    }
  }
  return files;
}

function loadConceptFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.js')) {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(filePath);
  }
  return JSON.parse(raw);
}

async function main() {
  const inputArgs = process.argv.slice(2);
  if (inputArgs.length === 0) {
    console.error('Usage: node scripts/import-micropdf-batch.js <file-or-dir> [more files or dirs...]');
    process.exit(1);
  }

  try {
    const files = expandInputPaths(inputArgs);
    if (files.length === 0) {
      throw new Error('No JSON or JS concept files found');
    }

    const concepts = files.map((filePath) => normalizeConceptRecord(loadConceptFile(filePath)));
    const result = await importMicroPdfConceptBatch(concepts);

    console.log(`Files: ${files.length}`);
    console.log(`Created: ${result.created}`);
    console.log(`Updated: ${result.updated}`);
    console.log(`Skipped: ${result.skipped}`);
    console.log(`Failed: ${result.failed}`);
    for (const item of result.results) {
      const label = `${item.subject || ''} / ${item.topic || ''} / ${item.concept_key || ''}`.replace(/^ \//, '').replace(/\/\s*$/, '');
      if (item.status === 'failed') {
        console.log(`FAILED [${item.index}]: ${item.error}`);
      } else {
        console.log(`${item.status.toUpperCase()} [${item.index}]: ${label}`);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error('Batch import failed:', err.message);
    process.exit(1);
  }
}

main();
