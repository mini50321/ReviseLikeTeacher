const { db, initDatabase } = require('../db');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const sampleQuestions = [
  {
    stem: 'Which of the following is the most common cause of community-acquired pneumonia in adults?',
    type: 'mcq',
    subject: 'Microbiology',
    topic: 'Bacterial Infections',
    subtopic: 'Respiratory Infections',
    difficulty: 'medium',
    importance: 'high',
    cognitive_focus: 'clinical',
    ideal_answer: 'Streptococcus pneumoniae',
    key_points: ['S. pneumoniae is the leading cause', 'Community-acquired', 'Gram-positive diplococcus'],
    previous_year_tags: ['NEET PG 2023', 'Important'],
    status: 'active'
  },
  {
    stem: 'What is the mechanism of action of penicillin?',
    type: 'saq',
    subject: 'Pharmacology',
    topic: 'Antibiotics',
    subtopic: 'Beta-lactam Antibiotics',
    difficulty: 'easy',
    importance: 'high',
    cognitive_focus: 'factual',
    ideal_answer: 'Penicillin inhibits bacterial cell wall synthesis by binding to penicillin-binding proteins and preventing cross-linking of peptidoglycan chains.',
    key_points: ['Cell wall synthesis inhibition', 'Penicillin-binding proteins', 'Peptidoglycan'],
    previous_year_tags: ['NEET PG 2022'],
    status: 'active'
  },
  {
    stem: 'A 45-year-old patient presents with chest pain radiating to the left arm. ECG shows ST elevation in leads II, III, and aVF. What is the most likely diagnosis?',
    type: 'case_based',
    subject: 'Pathology',
    topic: 'Cardiovascular Diseases',
    subtopic: 'Myocardial Infarction',
    difficulty: 'hard',
    importance: 'high',
    cognitive_focus: 'clinical',
    ideal_answer: 'Inferior wall myocardial infarction. The ST elevation in leads II, III, and aVF indicates involvement of the inferior wall of the heart.',
    key_points: ['Inferior wall MI', 'ST elevation', 'ECG interpretation'],
    previous_year_tags: ['NEET PG 2023', 'Clinical'],
    status: 'active'
  },
  {
    stem: 'The liver is located in the right upper quadrant of the abdomen.',
    type: 'true_false',
    subject: 'Anatomy',
    topic: 'Abdominal Anatomy',
    subtopic: 'Liver',
    difficulty: 'easy',
    importance: 'medium',
    cognitive_focus: 'factual',
    ideal_answer: 'True',
    key_points: ['Right upper quadrant', 'Liver location'],
    previous_year_tags: [],
    status: 'active'
  },
  {
    stem: 'Assertion: Insulin decreases blood glucose levels. Reason: Insulin promotes glucose uptake by cells and inhibits gluconeogenesis.',
    type: 'assertion_reason',
    subject: 'Physiology',
    topic: 'Endocrinology',
    subtopic: 'Insulin',
    difficulty: 'medium',
    importance: 'high',
    cognitive_focus: 'conceptual',
    ideal_answer: 'Both assertion and reason are true, and reason is the correct explanation.',
    key_points: ['Insulin mechanism', 'Glucose uptake', 'Gluconeogenesis'],
    previous_year_tags: ['NEET PG 2022'],
    status: 'active'
  },
  {
    stem: 'Which enzyme is responsible for converting angiotensin I to angiotensin II?',
    type: 'mcq',
    subject: 'Physiology',
    topic: 'Renal Physiology',
    subtopic: 'RAAS System',
    difficulty: 'medium',
    importance: 'high',
    cognitive_focus: 'factual',
    ideal_answer: 'Angiotensin-converting enzyme (ACE)',
    key_points: ['ACE', 'RAAS', 'Angiotensin conversion'],
    previous_year_tags: ['NEET PG 2023'],
    status: 'active'
  },
  {
    stem: 'Describe the pathophysiology of type 2 diabetes mellitus.',
    type: 'saq',
    subject: 'Pathology',
    topic: 'Endocrine Disorders',
    subtopic: 'Diabetes Mellitus',
    difficulty: 'hard',
    importance: 'high',
    cognitive_focus: 'conceptual',
    ideal_answer: 'Type 2 diabetes is characterized by insulin resistance and relative insulin deficiency. Initially, beta cells compensate by producing more insulin, but over time, beta cell function declines, leading to hyperglycemia.',
    key_points: ['Insulin resistance', 'Beta cell dysfunction', 'Hyperglycemia'],
    previous_year_tags: ['NEET PG 2023', 'Important'],
    status: 'active'
  },
  {
    stem: 'Which of the following is a Gram-negative bacterium?',
    type: 'mcq',
    subject: 'Microbiology',
    topic: 'Bacteriology',
    subtopic: 'Bacterial Classification',
    difficulty: 'easy',
    importance: 'medium',
    cognitive_focus: 'factual',
    ideal_answer: 'Escherichia coli',
    key_points: ['Gram-negative', 'E. coli', 'Bacterial classification'],
    previous_year_tags: [],
    status: 'active'
  },
  {
    stem: 'A patient with chronic kidney disease has elevated serum phosphate levels. What is the most appropriate treatment?',
    type: 'case_based',
    subject: 'Pharmacology',
    topic: 'Renal Pharmacology',
    subtopic: 'Phosphate Binders',
    difficulty: 'medium',
    importance: 'high',
    cognitive_focus: 'clinical',
    ideal_answer: 'Phosphate binders such as calcium carbonate or sevelamer should be used to reduce phosphate absorption from the gut.',
    key_points: ['Phosphate binders', 'Chronic kidney disease', 'Hyperphosphatemia'],
    previous_year_tags: ['NEET PG 2022'],
    status: 'active'
  },
  {
    stem: 'The heart has four chambers: two atria and two ventricles.',
    type: 'true_false',
    subject: 'Anatomy',
    topic: 'Cardiovascular Anatomy',
    subtopic: 'Heart Structure',
    difficulty: 'easy',
    importance: 'medium',
    cognitive_focus: 'factual',
    ideal_answer: 'True',
    key_points: ['Four chambers', 'Atria', 'Ventricles'],
    previous_year_tags: [],
    status: 'active'
  },
  {
    stem: 'Which of the following is the primary function of the Krebs cycle?',
    type: 'mcq',
    subject: 'Biochemistry',
    topic: 'Metabolism',
    subtopic: 'Citric Acid Cycle',
    difficulty: 'medium',
    importance: 'high',
    cognitive_focus: 'conceptual',
    ideal_answer: 'Production of NADH, FADH2, and ATP through oxidation of acetyl-CoA',
    key_points: ['Krebs cycle', 'NADH production', 'Acetyl-CoA oxidation'],
    previous_year_tags: ['NEET PG 2023'],
    status: 'active'
  },
  {
    stem: 'What is the end product of glycolysis?',
    type: 'saq',
    subject: 'Biochemistry',
    topic: 'Metabolism',
    subtopic: 'Glycolysis',
    difficulty: 'easy',
    importance: 'high',
    cognitive_focus: 'factual',
    ideal_answer: 'Pyruvate (or pyruvic acid)',
    key_points: ['Glycolysis', 'Pyruvate', 'Glucose metabolism'],
    previous_year_tags: ['NEET PG 2022'],
    status: 'active'
  },
  {
    stem: 'Which enzyme is responsible for converting glucose-6-phosphate to fructose-6-phosphate in glycolysis?',
    type: 'mcq',
    subject: 'Biochemistry',
    topic: 'Metabolism',
    subtopic: 'Glycolysis',
    difficulty: 'medium',
    importance: 'medium',
    cognitive_focus: 'factual',
    ideal_answer: 'Phosphoglucose isomerase',
    key_points: ['Glycolysis enzymes', 'Phosphoglucose isomerase', 'Glucose-6-phosphate'],
    previous_year_tags: [],
    status: 'active'
  },
  {
    stem: 'A patient presents with sudden loss of vision in one eye. Fundoscopy reveals a cherry-red spot. What is the most likely diagnosis?',
    type: 'case_based',
    subject: 'Ophthalmology',
    topic: 'Retinal Disorders',
    subtopic: 'Central Retinal Artery Occlusion',
    difficulty: 'hard',
    importance: 'high',
    cognitive_focus: 'clinical',
    ideal_answer: 'Central retinal artery occlusion (CRAO). The cherry-red spot is a classic finding due to the contrast between the pale, ischemic retina and the red fovea.',
    key_points: ['CRAO', 'Cherry-red spot', 'Sudden vision loss'],
    previous_year_tags: ['NEET PG 2023', 'Clinical'],
    status: 'active'
  },
  {
    stem: 'What is the most common cause of conductive hearing loss?',
    type: 'mcq',
    subject: 'ENT',
    topic: 'Hearing Disorders',
    subtopic: 'Conductive Hearing Loss',
    difficulty: 'medium',
    importance: 'high',
    cognitive_focus: 'clinical',
    ideal_answer: 'Otitis media with effusion (middle ear infection)',
    key_points: ['Conductive hearing loss', 'Otitis media', 'Middle ear'],
    previous_year_tags: ['NEET PG 2022'],
    status: 'active'
  },
  {
    stem: 'Describe the mechanism of action of aspirin.',
    type: 'saq',
    subject: 'Pharmacology',
    topic: 'NSAIDs',
    subtopic: 'Aspirin',
    difficulty: 'medium',
    importance: 'high',
    cognitive_focus: 'conceptual',
    ideal_answer: 'Aspirin irreversibly inhibits cyclooxygenase (COX) enzymes, particularly COX-1, preventing the synthesis of prostaglandins and thromboxanes, which leads to anti-inflammatory, analgesic, and antiplatelet effects.',
    key_points: ['COX inhibition', 'Prostaglandins', 'Antiplatelet'],
    previous_year_tags: ['NEET PG 2023'],
    status: 'active'
  },
  {
    stem: 'Which of the following is a characteristic feature of Forensic Medicine?',
    type: 'mcq',
    subject: 'Forensic Medicine',
    topic: 'Introduction',
    subtopic: 'Basics',
    difficulty: 'easy',
    importance: 'medium',
    cognitive_focus: 'factual',
    ideal_answer: 'Application of medical knowledge to legal issues',
    key_points: ['Forensic medicine', 'Legal medicine', 'Medical jurisprudence'],
    previous_year_tags: [],
    status: 'active'
  },
  {
    stem: 'What is the primary goal of Community Medicine?',
    type: 'saq',
    subject: 'Community Medicine',
    topic: 'Introduction',
    subtopic: 'Public Health',
    difficulty: 'easy',
    importance: 'high',
    cognitive_focus: 'conceptual',
    ideal_answer: 'To improve the health of populations through prevention, health promotion, and disease control at the community level.',
    key_points: ['Public health', 'Population health', 'Prevention'],
    previous_year_tags: ['NEET PG 2022'],
    status: 'active'
  },
  {
    stem: 'Which of the following is the most common type of diabetes mellitus?',
    type: 'mcq',
    subject: 'Pathology',
    topic: 'Endocrine Disorders',
    subtopic: 'Diabetes Mellitus',
    difficulty: 'easy',
    importance: 'high',
    cognitive_focus: 'factual',
    ideal_answer: 'Type 2 diabetes mellitus',
    key_points: ['Type 2 diabetes', 'Most common', 'Diabetes prevalence'],
    previous_year_tags: ['NEET PG 2023'],
    status: 'active'
  }
];

async function addSampleQuestions() {
  try {
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(__dirname, '..', 'database.sqlite');
    
    await initDatabase();
    console.log('Adding sample questions...');
    console.log('Database path:', dbPath);

    const userIdResult = await db.query('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
    let adminUserId = null;
    
    if (userIdResult.rows.length > 0) {
      adminUserId = userIdResult.rows[0].id;
    } else {
      const studentResult = await db.query('SELECT id FROM users LIMIT 1', []);
      if (studentResult.rows.length > 0) {
        adminUserId = studentResult.rows[0].id;
      }
    }

    if (!adminUserId) {
      console.log('⚠️  No users found in database. Please create a user first.');
      return;
    }

    let added = 0;
    let skipped = 0;

    for (const q of sampleQuestions) {
      const id = uuidv4();
      
      try {
        await db.query(
          `INSERT INTO question 
           (id, stem, type, subject, topic, subtopic, difficulty, importance, 
            cognitive_focus, ideal_answer, key_points, previous_year_tags, 
            status, created_by) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            q.stem,
            q.type,
            q.subject,
            q.topic,
            q.subtopic || null,
            q.difficulty,
            q.importance,
            q.cognitive_focus,
            q.ideal_answer || null,
            JSON.stringify(q.key_points || []),
            JSON.stringify(q.previous_year_tags || []),
            q.status,
            adminUserId
          ]
        );
        added++;
        console.log(`✅ Added: ${q.subject} - ${q.topic}`);
      } catch (error) {
        if (error.message.includes('UNIQUE constraint')) {
          skipped++;
          console.log(`⏭️  Skipped (already exists): ${q.subject} - ${q.topic}`);
        } else {
          console.error(`❌ Error adding question: ${error.message}`);
        }
      }
    }

    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    
    const dbModule = require('../db');
    const dbInstance = dbModule.db;
    
    if (dbInstance && typeof dbInstance.export === 'function') {
      const dbData = dbInstance.export();
      const buffer = Buffer.from(dbData);
      fs.writeFileSync(dbPath, buffer);
      console.log('💾 Database explicitly saved to:', dbPath);
    }
    
    const verifyResult = await db.query('SELECT COUNT(*) as count FROM question WHERE status = ?', ['active']);
    console.log(`✅ Verification: ${verifyResult.rows[0].count} active questions in database`);
    
    const subjectBreakdown = await db.query('SELECT subject, COUNT(*) as count FROM question WHERE status = ? GROUP BY subject', ['active']);
    console.log('\nQuestions by subject:');
    subjectBreakdown.rows.forEach(r => console.log(`  ${r.subject}: ${r.count}`));
    
    console.log(`\n✅ Complete! Added ${added} questions, skipped ${skipped} duplicates.`);
    
    const fileSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    console.log(`📁 Database file size: ${fileSize} bytes`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addSampleQuestions();

