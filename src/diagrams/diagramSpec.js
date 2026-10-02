/**
 * Milestone 13 — Diagram Semantic Model (DiagramSpec)
 * 
 * Formalizes the relationship and visual hierarchy between entities.
 * The visual presentation is strictly derived from semantic relationships
 * rather than inferred from raw string styling.
 */

import { DIAGRAM_GRAMMARS, NODE_IMPORTANCE, NODE_VISUAL_FORMS, GRAMMAR_DEFINITIONS, inferDiagramGrammar } from './diagramGrammar.js';

/**
 * Normalizes raw overlay data or storyboard objects into a clean, canonical DiagramSpec.
 * 
 * @param {Object} raw - Raw clip.overlay or scene.data
 * @param {Object} context - Optional context { narration, topic, format }
 * @returns {Object} Validated DiagramSpec
 */
export function createDiagramSpec(raw = {}, context = {}) {
  const title = (raw.title || raw.kicker || raw.headline || '').trim();
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];

  // Determine grammar
  const grammar = raw.grammar && DIAGRAM_GRAMMARS[raw.grammar]
    ? raw.grammar
    : inferDiagramGrammar({ text: context.narration || '', title, nodes: rawNodes, edges: rawEdges });

  // Format complexity constraints (Requirement 33: 9:16 max 5 nodes, 16:9 max 7 nodes)
  const isVertical = context.format === 'shorts' || context.format === 'vertical';
  const grammarDef = GRAMMAR_DEFINITIONS[grammar];
  const maxNodes = isVertical
    ? (grammarDef?.maxNodes?.vertical || 5)
    : (grammarDef?.maxNodes?.landscape || 7);
  const cappedRawNodes = rawNodes.length > maxNodes ? rawNodes.slice(0, maxNodes) : rawNodes;

  // Map and clean nodes with strict editorial hierarchy
  const nodes = cappedRawNodes.map((n, idx) => {
    const id = String(n.id || `node_${idx + 1}`);
    const label = String(n.label || n.title || `Concept ${idx + 1}`).trim();
    const supportText = n.supportText || n.detail || n.desc || n.description || null;
    const role = n.role || (idx === 0 ? 'SOURCE' : idx === rawNodes.length - 1 ? 'OUTPUT' : 'INTERMEDIARY');
    
    // Assign importance: primaryNode if matched, or first node / focal node
    let importance = n.importance || (idx === 0 ? NODE_IMPORTANCE.PRIMARY : NODE_IMPORTANCE.SECONDARY);
    if (n.isPrimary || id === raw.primaryNode || idx === 0) {
      importance = NODE_IMPORTANCE.PRIMARY;
    } else if (idx >= 3) {
      importance = NODE_IMPORTANCE.SUPPORTING;
    }

    const visualForm = n.visualForm || defaultVisualFormFor(grammar, importance);

    return {
      id,
      label,
      supportText: supportText ? String(supportText).trim() : null,
      importance,
      role: String(role).trim(),
      state: n.state || 'active', // 'active' | 'subdued' | 'highlighted' | 'inactive'
      visualForm,
      metric: n.metric || null,
      accent: n.accent || null,
    };
  });

  // Assign primaryNode identifier
  const primaryNode = nodes.find((n) => n.importance === NODE_IMPORTANCE.PRIMARY)?.id || nodes[0]?.id || null;

  // Clean and link edges; if no edges are specified and there are 2+ nodes, synthesize sequential path
  let activeRawEdges = rawEdges;
  if (activeRawEdges.length === 0 && nodes.length > 1) {
    activeRawEdges = nodes.slice(0, -1).map((n, i) => ({
      from: n.id,
      to: nodes[i + 1].id,
    }));
  }
  const edges = normalizeDiagramEdges(activeRawEdges, nodes, primaryNode);

  return {
    grammar,
    title: title || 'SYSTEM DYNAMICS',
    kicker: raw.kicker || null,
    primaryNode,
    nodes,
    edges,
    conclusionLabel: raw.conclusionLabel || raw.outcome || null,
    emphasisSequence: Array.isArray(raw.emphasisSequence) ? raw.emphasisSequence : nodes.map((n) => n.id),
    backgroundMode: raw.backgroundMode || null, // Will be resolved by background controller
    frameAt: raw.at ?? 4,
  };
}

export function normalizeDiagramEdges(rawEdges = [], nodes = [], primaryNode = null) {
  return rawEdges.map((e, idx) => {
    const from = String(e.from || (nodes[idx]?.id || ''));
    const to = String(e.to || (nodes[idx + 1]?.id || ''));
    return {
      id: e.id || `edge_${from}_${to}`,
      from,
      to,
      label: e.label ? String(e.label).trim() : null,
      relationship: e.relationship || 'leads_to', // 'leads_to' | 'competes_with' | 'inhibits' | 'feeds' | 'reinforces'
      direction: e.direction || 'forward', // 'forward' | 'bidirectional' | 'reverse' | 'return_loop'
      weight: e.weight || (from === primaryNode || to === primaryNode ? 2 : 1),
    };
  });
}

export function defaultVisualFormFor(grammar, importance) {
  if (grammar === DIAGRAM_GRAMMARS.CYCLE) return NODE_VISUAL_FORMS.CIRCLE;
  if (grammar === DIAGRAM_GRAMMARS.CAUSE_EFFECT) return NODE_VISUAL_FORMS.TEXT_ONLY;
  if (grammar === DIAGRAM_GRAMMARS.RELATIONSHIP || grammar === DIAGRAM_GRAMMARS.COMPARISON) return NODE_VISUAL_FORMS.BAND;
  if (grammar === DIAGRAM_GRAMMARS.NETWORK) return importance === NODE_IMPORTANCE.PRIMARY ? NODE_VISUAL_FORMS.CIRCLE : NODE_VISUAL_FORMS.DOT_LABEL;
  if (grammar === DIAGRAM_GRAMMARS.STACK || grammar === DIAGRAM_GRAMMARS.FUNNEL) return NODE_VISUAL_FORMS.BAND;
  return NODE_VISUAL_FORMS.PILL;
}
