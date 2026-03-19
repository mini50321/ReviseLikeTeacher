function safeParseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function parseOptionsFromBlock(block) {
  const text = String(block || '').trim();
  if (!text) return null;
  const out = {};
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lineRe = /^([A-D])[\.\)]\s*(.+)$/i;
  for (const line of lines) {
    const m = line.match(lineRe);
    if (m) out[m[1].toUpperCase()] = m[2].trim();
  }
  if (Object.keys(out).length >= 4) return out;
  const inlineParts = text.split(/\s+(?=[A-D][\.\)]\s)/i);
  for (const part of inlineParts) {
    const m = part.trim().match(lineRe);
    if (m) out[m[1].toUpperCase()] = m[2].trim();
  }
  return ['A', 'B', 'C', 'D'].every((k) => out[k]) ? out : null;
}

function splitStemAndOptionBlock(fullText) {
  const text = String(fullText || '');
  const re = /(?:^|\r?\n)(\s*[A-D][\.\)]\s*.+)/im;
  const match = text.match(re);
  if (!match || match.index == null) {
    return { stem: text.trim(), optionBlock: '' };
  }
  const stem = text.slice(0, match.index).trim();
  const optionBlock = text.slice(match.index).trim();
  return { stem, optionBlock };
}

function coerceOptionsObject(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    const parsed = safeParseJson(raw, null);
    if (parsed && typeof parsed === 'object') return coerceOptionsObject(parsed);
    const fromText = parseOptionsFromBlock(raw);
    return fromText || {};
  }
  if (Array.isArray(raw)) {
    const labels = ['A', 'B', 'C', 'D'];
    const obj = {};
    for (let i = 0; i < Math.min(4, raw.length); i += 1) {
      const v = raw[i];
      obj[labels[i]] = v != null && typeof v === 'object' ? v.text || v.label || String(v) : String(v);
    }
    return obj;
  }
  if (typeof raw === 'object') {
    const out = {};
    ['A', 'B', 'C', 'D', 'a', 'b', 'c', 'd'].forEach((k) => {
      if (raw[k] != null && String(raw[k]).trim()) {
        const uk = k.toUpperCase();
        out[uk] = String(raw[k]).trim();
      }
    });
    return out;
  }
  return {};
}

function normalizeCorrectAnswer(value) {
  const s = String(value || '').trim().toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(s)) return s;
  const m = s.match(/\b([A-D])\b/);
  if (m) return m[1];
  const n = s.match(/^(\d)$/);
  if (n) {
    const map = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' };
    return map[n[1]] || '';
  }
  return '';
}

function normalizeMcqRecord(mcq, index = 0) {
  if (!mcq || typeof mcq !== 'object') return null;
  let question = mcq.question != null ? String(mcq.question) : '';
  if (!question && mcq.stem != null) question = String(mcq.stem);
  question = question.trim();
  if (!question) return null;

  let options = coerceOptionsObject(mcq.options);
  const ot = mcq.options_text != null ? String(mcq.options_text) : '';
  if (!['A', 'B', 'C', 'D'].every((k) => options[k])) {
    const fromOt = parseOptionsFromBlock(ot);
    if (fromOt) options = { ...options, ...fromOt };
  }
  if (!['A', 'B', 'C', 'D'].every((k) => options[k])) {
    const { stem, optionBlock } = splitStemAndOptionBlock(question);
    const fromBlock = parseOptionsFromBlock(optionBlock);
    if (fromBlock && stem) {
      question = stem;
      options = { ...options, ...fromBlock };
    } else if (fromBlock) {
      options = { ...options, ...fromBlock };
    }
  }

  if (!['A', 'B', 'C', 'D'].every((k) => options[k])) return null;

  const correct = normalizeCorrectAnswer(mcq.correct_answer);
  if (!correct) return null;

  const id = mcq.id != null ? mcq.id : `mcq_${index}`;
  return {
    id,
    question,
    options: {
      A: options.A,
      B: options.B,
      C: options.C,
      D: options.D
    },
    correct_answer: correct,
    socratic_prompts: mcq.socratic_prompts,
    common_reasoning_errors: mcq.common_reasoning_errors,
    concept_reinforcement: mcq.concept_reinforcement
  };
}

function normalizeMcqsList(mcqs) {
  if (!Array.isArray(mcqs)) return [];
  const out = [];
  mcqs.forEach((m, i) => {
    const n = normalizeMcqRecord(m, i);
    if (n) out.push(n);
  });
  return out;
}

function questionRowToNormalizedMcq(row, idx) {
  if (!row) return null;
  const opts = row.options != null ? safeParseJson(row.options, row.options) : {};
  return normalizeMcqRecord(
    {
      id: row.id,
      question: row.stem || '',
      options: opts,
      correct_answer: row.correct_answer,
      socratic_prompts: null
    },
    idx
  );
}

function planMcqsAreUsable(mcqs) {
  if (!Array.isArray(mcqs) || mcqs.length === 0) return false;
  return mcqs.every((m) => {
    const n = normalizeMcqRecord(
      {
        question: m.question,
        stem: m.stem,
        options: m.options,
        options_text: m.options_text,
        correct_answer: m.correct_answer,
        id: m.id
      },
      0
    );
    return Boolean(n);
  });
}

module.exports = {
  normalizeMcqRecord,
  normalizeMcqsList,
  questionRowToNormalizedMcq,
  planMcqsAreUsable,
  parseOptionsFromBlock,
  splitStemAndOptionBlock
};
