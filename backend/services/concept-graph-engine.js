const { db } = require('../db');

function parseJsonField(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function serializeConcept(row) {
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    concept_key: row.concept_key,
    concept_map_id: row.concept_map_id || null,
    name: row.name,
    display_order: row.display_order != null ? row.display_order : 0,
    concept_weight: row.concept_weight != null ? row.concept_weight : 1,
    section: row.section || null,
    chapter: row.chapter || null,
    main_topic: row.main_topic || null,
    subtopic: row.subtopic || null,
    prerequisite_concept_ids: parseJsonField(row.prerequisite_concept_ids, []),
    downstream_concept_ids: parseJsonField(row.downstream_concept_ids, []),
    must_know_points: parseJsonField(row.must_know_points, []),
    deep_points: parseJsonField(row.deep_points, []),
    traps: parseJsonField(row.traps, []),
    leading_questions: parseJsonField(row.leading_questions, []),
    example_phrases: parseJsonField(row.example_phrases, []),
    grading_rubric: parseJsonField(row.grading_rubric, []),
    micro_questions: parseJsonField(row.micro_questions, []),
    saqs: parseJsonField(row.saqs, []),
    mcqs: parseJsonField(row.mcqs, []),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function getOrderedTopics(subject) {
  const pathwayOrder = await db.query(
    'SELECT topic FROM topic_pathway_order WHERE subject = $1 ORDER BY display_order ASC, topic ASC',
    [subject]
  );
  const ordered = (pathwayOrder.rows || []).map(row => row.topic);
  if (ordered.length > 0) return ordered;

  const grossPromptTopics = await db.query(
    'SELECT DISTINCT topic FROM topic_gross_prompt WHERE subject = $1 ORDER BY topic ASC',
    [subject]
  );
  return (grossPromptTopics.rows || []).map(row => row.topic);
}

async function getConceptRows({ subject, topic = null }) {
  const params = [subject];
  let query = 'SELECT * FROM topic_concept WHERE subject = $1';
  if (topic) {
    query += ' AND topic = $2';
    params.push(topic);
  }
  query += ' ORDER BY topic ASC, display_order ASC, concept_key ASC';
  const result = await db.query(query, params);
  return result.rows || [];
}

async function getFullPathway({ subject, topic = null }) {
  const topics = topic ? [topic] : await getOrderedTopics(subject);
  const pathway = [];
  for (const currentTopic of topics) {
    const rows = await getConceptRows({ subject, topic: currentTopic });
    for (const row of rows) {
      pathway.push(serializeConcept(row));
    }
  }
  return {
    subject,
    topics,
    concepts: pathway
  };
}

function buildReferenceMaps(concepts) {
  const byId = new Map();
  const byMapId = new Map();
  for (const concept of concepts) {
    byId.set(concept.id, concept);
    if (concept.concept_map_id) {
      byMapId.set(concept.concept_map_id, concept);
    }
  }
  return { byId, byMapId };
}

function resolveConceptReference(ref, maps) {
  if (!ref) return null;
  return maps.byId.get(ref) || maps.byMapId.get(ref) || null;
}

function buildEdges(concepts, maps) {
  const edges = [];
  const missingReferences = [];
  const seen = new Set();

  for (const concept of concepts) {
    const prereqs = Array.isArray(concept.prerequisite_concept_ids) ? concept.prerequisite_concept_ids : [];
    const downstream = Array.isArray(concept.downstream_concept_ids) ? concept.downstream_concept_ids : [];

    for (const ref of prereqs) {
      const target = resolveConceptReference(ref, maps);
      if (!target) {
        missingReferences.push({
          source_id: concept.id,
          source_key: concept.concept_key,
          reference: ref,
          relation: 'prerequisite'
        });
        continue;
      }
      const edgeKey = `${target.id}->${concept.id}`;
      if (!seen.has(edgeKey)) {
        seen.add(edgeKey);
        edges.push({
          from: target.id,
          to: concept.id,
          relation: 'prerequisite'
        });
      }
    }

    for (const ref of downstream) {
      const target = resolveConceptReference(ref, maps);
      if (!target) {
        missingReferences.push({
          source_id: concept.id,
          source_key: concept.concept_key,
          reference: ref,
          relation: 'downstream'
        });
        continue;
      }
      const edgeKey = `${concept.id}->${target.id}`;
      if (!seen.has(edgeKey)) {
        seen.add(edgeKey);
        edges.push({
          from: concept.id,
          to: target.id,
          relation: 'downstream'
        });
      }
    }
  }

  return { edges, missingReferences };
}

function detectCycles(nodes, edges) {
  const adjacency = new Map();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge.to);
  }

  const visited = new Set();
  const inStack = new Set();
  const path = [];
  const cycles = [];

  function dfs(nodeId) {
    if (inStack.has(nodeId)) {
      const idx = path.indexOf(nodeId);
      if (idx >= 0) {
        cycles.push(path.slice(idx).concat(nodeId));
      } else {
        cycles.push([nodeId, nodeId]);
      }
      return;
    }
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);
    const nextNodes = adjacency.get(nodeId) || [];
    for (const next of nextNodes) {
      dfs(next);
    }
    path.pop();
    inStack.delete(nodeId);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return cycles;
}

function topologicalSort(nodes, edges) {
  const indegree = new Map();
  const adjacency = new Map();
  for (const node of nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
  }

  const queue = nodes
    .filter(node => (indegree.get(node.id) || 0) === 0)
    .sort((a, b) => (a.topic.localeCompare(b.topic) || (a.display_order - b.display_order) || a.concept_key.localeCompare(b.concept_key)));
  const ordered = [];

  while (queue.length > 0) {
    const current = queue.shift();
    ordered.push(current);
    const nextNodes = adjacency.get(current.id) || [];
    for (const next of nextNodes) {
      indegree.set(next, (indegree.get(next) || 0) - 1);
      if ((indegree.get(next) || 0) === 0) {
        const nextNode = nodes.find(node => node.id === next);
        if (nextNode) {
          queue.push(nextNode);
          queue.sort((a, b) => (a.topic.localeCompare(b.topic) || (a.display_order - b.display_order) || a.concept_key.localeCompare(b.concept_key)));
        }
      }
    }
  }

  return ordered;
}

async function getConceptGraph({ subject, topic = null }) {
  const rows = await getConceptRows({ subject, topic });
  const nodes = rows.map(serializeConcept);
  const maps = buildReferenceMaps(nodes);
  const { edges, missingReferences } = buildEdges(nodes, maps);
  const cycles = detectCycles(nodes, edges);
  const sorted = topologicalSort(nodes, edges);

  return {
    subject,
    topic,
    node_count: nodes.length,
    edge_count: edges.length,
    nodes,
    edges,
    topological_order: sorted,
    issues: {
      missing_references: missingReferences,
      cycles
    }
  };
}

async function validateConceptGraph({ subject, topic = null }) {
  const graph = await getConceptGraph({ subject, topic });
  return {
    subject: graph.subject,
    topic: graph.topic,
    valid: graph.issues.missing_references.length === 0 && graph.issues.cycles.length === 0,
    node_count: graph.node_count,
    edge_count: graph.edge_count,
    issues: graph.issues
  };
}

function rankCandidates(candidates, studentLevel) {
  const level = (studentLevel || 'average').toLowerCase();
  const direction = ['excellent', 'strong', 'bored'].includes(level) ? -1 : 1;
  return [...candidates].sort((a, b) => {
    const weightDelta = ((a.concept_weight || 1) - (b.concept_weight || 1)) * direction;
    if (weightDelta !== 0) return weightDelta;
    const orderDelta = ((a.display_order || 0) - (b.display_order || 0)) * direction;
    if (orderDelta !== 0) return orderDelta;
    return a.concept_key.localeCompare(b.concept_key);
  });
}

function hasSatisfiedPrerequisites(concept, completedIds) {
  const prereqs = Array.isArray(concept.prerequisite_concept_ids) ? concept.prerequisite_concept_ids : [];
  return prereqs.every(id => completedIds.has(id));
}

async function getNextBestConcept({ currentConceptId = null, subject = null, topic = null, studentLevel = 'average', completedConceptIds = [] }) {
  const completedIds = new Set((Array.isArray(completedConceptIds) ? completedConceptIds : []).filter(Boolean));
  let current = null;

  if (currentConceptId) {
    const row = await db.query('SELECT * FROM topic_concept WHERE id = $1 OR concept_map_id = $1 LIMIT 1', [currentConceptId]);
    current = row.rows && row.rows.length > 0 ? serializeConcept(row.rows[0]) : null;
  }

  if (!current && subject) {
    const pathway = await getFullPathway({ subject, topic });
    current = pathway.concepts.find(concept => !completedIds.has(concept.id)) || pathway.concepts[0] || null;
  }

  if (!current) return null;

  const graph = await getConceptGraph({ subject: current.subject, topic: current.topic });
  const nodesById = new Map(graph.nodes.map(node => [node.id, node]));
  const currentNode = nodesById.get(current.id) || current;

  const explicitCandidates = [];
  for (const ref of currentNode.downstream_concept_ids || []) {
    const resolved = graph.nodes.find(node => node.id === ref || node.concept_map_id === ref);
    if (resolved && !completedIds.has(resolved.id) && hasSatisfiedPrerequisites(resolved, completedIds)) {
      explicitCandidates.push(resolved);
    }
  }

  if (explicitCandidates.length > 0) {
    const ranked = rankCandidates(explicitCandidates, studentLevel);
    return ranked[0];
  }

  const remaining = graph.topological_order.filter(node => !completedIds.has(node.id) && node.id !== current.id);
  if (remaining.length > 0) {
    const ranked = rankCandidates(remaining, studentLevel);
    return ranked[0];
  }

  return null;
}

async function getFirstConceptForSubject(subject, topic = null) {
  const pathway = await getFullPathway({ subject, topic });
  return pathway.concepts[0] || null;
}

module.exports = {
  getConceptGraph,
  validateConceptGraph,
  getNextBestConcept,
  getFullPathway,
  getFirstConceptForSubject,
  serializeConcept
};
