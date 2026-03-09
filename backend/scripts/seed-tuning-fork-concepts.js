const { initDatabase } = require('../db');
const { seedTuningFork } = require('../services/seed-tuning-fork');

async function seed() {
  await initDatabase();
  const result = await seedTuningFork();
  console.log(`Done. Inserted: ${result.inserted}, Skipped: ${result.skipped}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
