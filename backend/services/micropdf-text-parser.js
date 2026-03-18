function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitLines(text) {
  return normalizeText(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function lineIndex(lines, matcher) {
  return lines.findIndex(line => matcher(line.toLowerCase()));
}

function sectionSlice(lines, startMatcher, endMatcher) {
  const start = lineIndex(lines, startMatcher);
  if (start === -1) return [];
  const end = endMatcher ? lineIndex(lines.slice(start + 1), endMatcher) : -1;
  return end === -1 ? lines.slice(start + 1) : lines.slice(start + 1, start + 1 + end);
}

function joinSection(lines) {
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

function parseColonField(lines, label) {
  const regex = new RegExp(`^${escapeRegExp(label)}\\s*:\\s*(.*)$`, 'i');
  const idx = lines.findIndex(line => regex.test(line));
  if (idx === -1) return null;
  const match = lines[idx].match(regex);
  const first = (match?.[1] || '').trim();
  if (first) return first;
  const next = lines.slice(idx + 1).find(line => !/^[A-Za-z][A-Za-z\s()/-]*:/.test(line));
  return next ? next.trim() : '';
}

function parseMultiLineField(lines, label, stopMatchers = []) {
  const regex = new RegExp(`^${escapeRegExp(label)}\\s*:\\s*(.*)$`, 'i');
  const idx = lines.findIndex(line => regex.test(line));
  if (idx === -1) return '';
  const match = lines[idx].match(regex);
  const values = [];
  const first = (match?.[1] || '').trim();
  if (first) values.push(first);
  for (let i = idx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (stopMatchers.some(fn => fn(line.toLowerCase()))) break;
    if (/^[A-Za-z][A-Za-z\s()/-]*:/.test(line) && !line.toLowerCase().startsWith(label.toLowerCase())) break;
    values.push(line);
  }
  return joinSection(values);
}

function parseListText(text) {
  const source = normalizeText(text);
  if (!source) return [];
  const lines = source
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const items = [];
  for (const line of lines) {
    const stripped = line.replace(/^[-•*]\s*/, '').trim();
    if (!stripped) continue;
    if (/^\d+\.\s*/.test(stripped)) {
      items.push(stripped.replace(/^\d+\.\s*/, '').trim());
      continue;
    }
    if (stripped.includes('→')) {
      stripped.split('→').forEach(part => {
        const item = part.trim().replace(/^[,;]+|[,;]+$/g, '');
        if (item) items.push(item);
      });
      continue;
    }
    if (stripped.includes(',') && !/^https?:\/\//i.test(stripped)) {
      stripped.split(',').forEach(part => {
        const item = part.trim().replace(/^[,;]+|[,;]+$/g, '');
        if (item) items.push(item);
      });
      continue;
    }
    items.push(stripped);
  }
  return [...new Set(items)];
}

function extractFieldBlock(text, label, stopLabels = []) {
  const lower = text.toLowerCase();
  const start = lower.indexOf(label.toLowerCase());
  if (start === -1) return '';
  const startValue = start + label.length;
  let end = text.length;
  for (const stop of stopLabels) {
    const idx = lower.indexOf(stop.toLowerCase(), startValue);
    if (idx !== -1 && idx < end) end = idx;
  }
  return text.slice(startValue, end).trim();
}

function parseOptions(text) {
  const optionMatches = [...text.matchAll(/([A-D])\.\s/g)];
  if (optionMatches.length === 0) return {};
  const options = {};
  for (let i = 0; i < optionMatches.length; i += 1) {
    const current = optionMatches[i];
    const next = optionMatches[i + 1];
    const label = current[1];
    const start = current.index + current[0].length;
    const end = next ? next.index : text.length;
    options[label] = text.slice(start, end).trim().replace(/\s+/g, ' ');
  }
  return options;
}

function parseSaqBlocks(text) {
  const blocks = [];
  const regex = /SAQ\s+(\d+)\s+Question:\s*([\s\S]*?)(?=(?:\nSAQ\s+\d+\s+Question:|\nMCQs\s*\(with Socratic Prompts\)|$))/gi;
  let match;
  while ((match = regex.exec(text))) {
    const body = match[2].trim();
    const questionEnd = ['Core Points:', 'Misconceptions:', 'Compact Answer:']
      .map(label => {
        const idx = body.toLowerCase().indexOf(label.toLowerCase());
        return idx === -1 ? body.length : idx;
      })
      .reduce((min, idx) => Math.min(min, idx), body.length);
    const question = body.slice(0, questionEnd).trim().replace(/\s+/g, ' ');
    const corePointsText = extractFieldBlock(body, 'Core Points:', ['Misconceptions:']).replace(/\s+/g, ' ');
    const misconceptionsText = extractFieldBlock(body, 'Misconceptions:', ['Compact Answer:']).replace(/\s+/g, ' ');
    const compactAnswer = extractFieldBlock(body, 'Compact Answer:', []).replace(/\s+/g, ' ');
    blocks.push({
      id: `saq_${match[1]}`,
      question,
      core_points: parseListText(corePointsText),
      misconceptions: parseListText(misconceptionsText),
      compact_answer: compactAnswer
    });
  }
  return blocks;
}

function parseMcqBlocks(text) {
  const sectionText = String(text || '').trim();
  if (!sectionText) return [];
  const headingLess = sectionText.replace(/^MCQs\s*\(with Socratic Prompts\)\s*/i, '').trim();
  const bodyText = headingLess || sectionText;
  const blocks = [];
  const regex = /Question:\s*([\s\S]*?)(?=(?:\nQuestion:|$))/gi;
  let match;
  while ((match = regex.exec(bodyText))) {
    const block = match[0];
    const question = extractFieldBlock(block, 'Question:', ['Correct Answer:', 'Socratic Prompts:', 'Common Reasoning Errors:', 'Concept Reinforcement:']).replace(/\s+/g, ' ');
    const optionStart = block.search(/\nA\.\s|^A\.\s/i);
    const correctStart = block.search(/\nCorrect Answer:/i);
    const promptStart = block.search(/\nSocratic Prompts:/i);
    const optionsEndCandidates = [correctStart, promptStart].filter(idx => idx !== -1);
    const optionsEnd = optionsEndCandidates.length > 0 ? Math.min(...optionsEndCandidates) : block.length;
    const optionsText = optionStart !== -1 ? block.slice(optionStart, optionsEnd).trim() : '';
    const correctAnswer = (extractFieldBlock(block, 'Correct Answer:', ['Socratic Prompts:', 'Common Reasoning Errors:', 'Concept Reinforcement:']).match(/[A-D]/i) || [null])[0];
    const socraticPromptsText = extractFieldBlock(block, 'Socratic Prompts:', ['Common Reasoning Errors:', 'Concept Reinforcement:']).replace(/\s+/g, ' ');
    const commonErrorsText = extractFieldBlock(block, 'Common Reasoning Errors:', ['Concept Reinforcement:']).replace(/\s+/g, ' ');
    const reinforcement = extractFieldBlock(block, 'Concept Reinforcement:', []).replace(/\s+/g, ' ');
    blocks.push({
      id: `mcq_${blocks.length + 1}`,
      question,
      options: parseOptions(optionsText),
      correct_answer: correctAnswer || null,
      socratic_prompts: parseListText(socraticPromptsText),
      common_reasoning_errors: parseListText(commonErrorsText),
      concept_reinforcement: reinforcement
    });
  }
  return blocks;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function parseMicroPdfConceptText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  const lines = splitLines(normalized);

  const subject = parseColonField(lines, 'Subject');
  const section = parseColonField(lines, 'Section');
  const chapter = parseColonField(lines, 'Chapter');
  const mainTopic = parseColonField(lines, 'Main Topic');
  const subtopic = parseColonField(lines, 'Subtopic');
  const conceptName = parseColonField(lines, 'Concept Name');
  const conceptId = parseColonField(lines, 'Concept ID');
  const conceptType = parseColonField(lines, 'Concept Type');
  const conceptWeight = parseColonField(lines, 'Concept Weight');
  const highYieldLevel = parseColonField(lines, 'High-Yield Level');

  const dependencyLines = sectionSlice(lines, line => line.includes('concept dependencies'), line => line.includes('concept explanation'));
  const explanationLines = sectionSlice(lines, line => line.includes('concept explanation'), line => line.includes('core points'));
  const corePointsLines = sectionSlice(lines, line => line.includes('core points'), line => line.includes('important points'));
  const importantPointsLines = sectionSlice(lines, line => line.includes('important points'), line => line.includes('competencies covered'));
  const competencyLines = sectionSlice(lines, line => line.includes('competencies covered'), line => line.includes('minimum question coverage'));
  const coverageLines = sectionSlice(lines, line => line.includes('minimum question coverage'), line => line.includes('saqs'));
  const saqSectionLines = sectionSlice(lines, line => line === 'saqs', line => line.includes('mcqs'));
  const mcqSectionLines = sectionSlice(lines, line => line.includes('mcqs'), null);

  const dependencyText = dependencyLines.join('\n');
  const prerequisiteText = parseMultiLineField(dependencyLines, 'Prerequisite Concepts', [
    line => line.includes('parallel concepts'),
    line => line.includes('downstream concepts'),
    line => line.includes('why this dependency matters')
  ]);
  const parallelText = parseMultiLineField(dependencyLines, 'Parallel Concepts', [
    line => line.includes('downstream concepts'),
    line => line.includes('why this dependency matters')
  ]);
  const downstreamText = parseMultiLineField(dependencyLines, 'Downstream Concepts', [
    line => line.includes('why this dependency matters')
  ]);
  const whyDependencyText = parseMultiLineField(dependencyLines, 'Why this dependency matters', []);

  const corePoints = parseListText(corePointsLines.join('\n'));
  const importantPoints = parseListText(importantPointsLines.join('\n'));
  const competencies = parseListText(competencyLines.join('\n'));

  const saqs = parseSaqBlocks(saqSectionLines.join('\n'));
  const mcqs = parseMcqBlocks(mcqSectionLines.join('\n'));

  const concept = {
    subject,
    section,
    chapter,
    main_topic: mainTopic,
    subtopic,
    concept_name: conceptName,
    concept_id: conceptId,
    concept_type: conceptType,
    concept_weight: conceptWeight ? Number(conceptWeight) : 1,
    high_yield_level: highYieldLevel,
    concept_explanation: joinSection(explanationLines),
    dependencies: {
      prerequisite: parseListText(prerequisiteText),
      parallel: parseListText(parallelText),
      downstream: parseListText(downstreamText),
      rationale: whyDependencyText
    },
    core_points: corePoints,
    important_points: importantPoints,
    competencies_covered: competencies,
    saqs,
    mcqs
  };

  if (!subject || !conceptName || !corePoints.length || !saqs.length || !mcqs.length) {
    return null;
  }

  const conceptKey = conceptId || `${subject}.${section || mainTopic || 'topic'}.${slugify(conceptName)}`;
  const leadingQuestions = [
    ...saqs.map(saq => saq.question).filter(Boolean),
    ...mcqs.flatMap(mcq => mcq.socratic_prompts || [])
  ];
  const traps = [
    ...(dependencyText ? [whyDependencyText].filter(Boolean) : []),
    ...saqs.flatMap(saq => saq.misconceptions || []),
    ...mcqs.flatMap(mcq => mcq.common_reasoning_errors || [])
  ].filter(Boolean);
  const microQuestions = [
    ...saqs.map(saq => saq.question),
    ...mcqs.map(mcq => mcq.question)
  ].filter(Boolean);
  const gradingRubric = corePoints.map((point, index) => ({
    id: `${conceptKey}:rubric:${index + 1}`,
    label: point,
    description: point
  }));
  const examplePhrases = saqs.map(saq => saq.compact_answer).filter(Boolean);
  const deepPoints = importantPoints.map((point, index) => ({
    id: `${conceptKey}:deep:${index + 1}`,
    label: point,
    description: point
  }));
  const mustKnowPoints = corePoints.map((point, index) => ({
    id: `${conceptKey}:core:${index + 1}`,
    label: point,
    description: point
  }));

  const draft = {
    subject,
    topic: mainTopic || chapter || section || conceptName,
    gross_prompt: saqs[0]?.question || conceptName,
    concepts: [
      {
        subject,
        topic: mainTopic || chapter || section || conceptName,
        section,
        chapter,
        main_topic: mainTopic,
        subtopic,
        concept_key: conceptKey,
        concept_map_id: conceptId || conceptKey,
        name: conceptName,
        display_order: 1,
        concept_weight: Number(conceptWeight || 1),
        prerequisite_concept_ids: parseListText(prerequisiteText),
        downstream_concept_ids: parseListText(downstreamText),
        must_know_points: mustKnowPoints,
        deep_points: deepPoints,
        traps,
        leading_questions: leadingQuestions,
        example_phrases: examplePhrases,
        grading_rubric: gradingRubric,
        micro_questions: microQuestions,
        saqs: saqs.map(saq => ({
          id: saq.id,
          question: saq.question,
          core_points: saq.core_points,
          misconceptions: saq.misconceptions,
          compact_answer: saq.compact_answer
        })),
        mcqs: mcqs.map(mcq => ({
          id: mcq.id,
          question: mcq.question,
          options: mcq.options,
          correct_answer: mcq.correct_answer,
          socratic_prompts: mcq.socratic_prompts,
          common_reasoning_errors: mcq.common_reasoning_errors,
          concept_reinforcement: mcq.concept_reinforcement
        }))
      }
    ],
    metadata: {
      concept_type: conceptType,
      high_yield_level: highYieldLevel,
      dependencies: concept.dependencies
    }
  };

  return { draft, warnings: [] };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  parseMicroPdfConceptText
};
