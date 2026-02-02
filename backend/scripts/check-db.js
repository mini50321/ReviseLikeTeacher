const { db, initDatabase } = require('../db');

async function checkDatabase() {
  try {
    await initDatabase();
    
    const tables = await db.query("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('Tables:', tables.rows.map(r => r.name).join(', '));
    
    const allQuestions = await db.query('SELECT COUNT(*) as total FROM question');
    console.log('\nTotal questions (any status):', allQuestions.rows[0].total);
    
    const activeQuestions = await db.query('SELECT COUNT(*) as total FROM question WHERE status = ?', ['active']);
    console.log('Active questions:', activeQuestions.rows[0].total);
    
    if (parseInt(activeQuestions.rows[0].total) > 0) {
      const sample = await db.query('SELECT subject, stem FROM question WHERE status = ? LIMIT 5', ['active']);
      console.log('\nSample questions:');
      sample.rows.forEach(q => console.log(`  ${q.subject}: ${q.stem.substring(0, 50)}...`));
      
      const bySubject = await db.query('SELECT subject, COUNT(*) as count FROM question WHERE status = ? GROUP BY subject', ['active']);
      console.log('\nQuestions by subject:');
      bySubject.rows.forEach(r => console.log(`  ${r.subject}: ${r.count}`));
    } else {
      console.log('\n⚠️  No active questions found!');
      const anyQuestions = await db.query('SELECT subject, status, COUNT(*) as count FROM question GROUP BY subject, status');
      if (anyQuestions.rows.length > 0) {
        console.log('\nQuestions by status:');
        anyQuestions.rows.forEach(r => console.log(`  ${r.subject} (${r.status}): ${r.count}`));
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkDatabase();

