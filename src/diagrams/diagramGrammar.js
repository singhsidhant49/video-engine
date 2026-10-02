/**
 * Milestone 13 — Diagram Grammars & Semantic Vocabulary
 * 
 * Replaces generic "box-arrow-box" presentation slides with formal editorial
 * information-design grammars.
 */

export const DIAGRAM_GRAMMARS = {
  FLOW: 'FLOW',
  CYCLE: 'CYCLE',
  CAUSE_EFFECT: 'CAUSE_EFFECT',
  RELATIONSHIP: 'RELATIONSHIP',
  COMPARISON: 'COMPARISON',
  HIERARCHY: 'HIERARCHY',
  PIPELINE: 'PIPELINE',
  NETWORK: 'NETWORK',
  STACK: 'STACK',
  FUNNEL: 'FUNNEL',
  SYSTEM_ARCHITECTURE: 'SYSTEM_ARCHITECTURE',
  TIMELINE: 'TIMELINE',
  SPECTRUM: 'SPECTRUM',
};

export const NODE_IMPORTANCE = {
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
  SUPPORTING: 'SUPPORTING',
  CONTEXT: 'CONTEXT',
};

export const NODE_VISUAL_FORMS = {
  TEXT_ONLY: 'text_only',
  PILL: 'pill',
  CIRCLE: 'circle',
  DOT_LABEL: 'dot_label',
  BAND: 'band',
  BRACKET_REGION: 'bracket_region',
  CARD: 'card', // Used selectively only when semantic enclosure is required
};

export const CONNECTOR_TYPES = {
  STRAIGHT: 'straight',
  CURVED: 'curved',
  ELBOW: 'elbow',
  BIDIRECTIONAL: 'bidirectional',
  BRACKET: 'bracket',
  FLOW_LINE: 'flow_line',
  LOOP_BACK: 'loop_back',
  DASHED_TENSION: 'dashed_tension',
};

export const BACKGROUND_MODES = {
  NEUTRAL_DARK: 'neutralDark',
  SOFT_RADIAL: 'softRadial',
  TECHNICAL_GRID: 'technicalGrid',
  PAPER_LIGHT: 'paperLight',
  MEDIA_BLUR: 'mediaBlur',
  CHARCOAL: 'charcoal',
  SUBTLE_TEXTURE: 'subtleTexture',
};

/**
 * Grammar definitions establishing constraints, node limits, connector styles,
 * and layout intentions for both 16:9 landscape and 9:16 mobile viewports.
 */
export const GRAMMAR_DEFINITIONS = {
  [DIAGRAM_GRAMMARS.FLOW]: {
    name: 'Causal / Sequence Flow',
    minNodes: 2,
    maxNodes: { landscape: 5, vertical: 4 },
    defaultConnector: CONNECTOR_TYPES.STRAIGHT,
    defaultVisualForm: NODE_VISUAL_FORMS.PILL,
    description: 'Directed horizontal track or vertical progression showing sequence of steps or causation.',
  },
  [DIAGRAM_GRAMMARS.CYCLE]: {
    name: 'Reinforcing Cycle / Habit Loop',
    minNodes: 3,
    maxNodes: { landscape: 6, vertical: 5 },
    defaultConnector: CONNECTOR_TYPES.CURVED,
    defaultVisualForm: NODE_VISUAL_FORMS.DOT_LABEL,
    description: 'Closed circular loop showing continuous feedback, reinforcement, or biological cycles.',
  },
  [DIAGRAM_GRAMMARS.CAUSE_EFFECT]: {
    name: 'Direct Cause & Consequence',
    minNodes: 2,
    maxNodes: { landscape: 4, vertical: 3 },
    defaultConnector: CONNECTOR_TYPES.FLOW_LINE,
    defaultVisualForm: NODE_VISUAL_FORMS.TEXT_ONLY,
    description: 'Stripped causal vector connecting triggers directly to cascading consequences without cards.',
  },
  [DIAGRAM_GRAMMARS.RELATIONSHIP]: {
    name: 'Polar Relationship & Conflict',
    minNodes: 2,
    maxNodes: { landscape: 4, vertical: 3 },
    defaultConnector: CONNECTOR_TYPES.DASHED_TENSION,
    defaultVisualForm: NODE_VISUAL_FORMS.BAND,
    description: 'Opposing systems competing or balancing (e.g. Limbic impulse vs Prefrontal control).',
  },
  [DIAGRAM_GRAMMARS.COMPARISON]: {
    name: 'Editorial Split Comparison',
    minNodes: 2,
    maxNodes: { landscape: 2, vertical: 2 },
    defaultConnector: CONNECTOR_TYPES.BIDIRECTIONAL,
    defaultVisualForm: NODE_VISUAL_FORMS.BAND,
    description: 'Shared-baseline contrast between two opposing paradigms or mechanisms with unified frame 0.',
  },
  [DIAGRAM_GRAMMARS.HIERARCHY]: {
    name: 'Architectural Hierarchy & Tree',
    minNodes: 3,
    maxNodes: { landscape: 6, vertical: 4 },
    defaultConnector: CONNECTOR_TYPES.ELBOW,
    defaultVisualForm: NODE_VISUAL_FORMS.PILL,
    description: 'Top-down root to branches or vertical stacked categories showing structural authority.',
  },
  [DIAGRAM_GRAMMARS.PIPELINE]: {
    name: 'Execution Pipeline with Loopback',
    minNodes: 3,
    maxNodes: { landscape: 5, vertical: 4 },
    defaultConnector: CONNECTOR_TYPES.ELBOW,
    defaultVisualForm: NODE_VISUAL_FORMS.PILL,
    description: 'Multi-stage processing pipeline with explicit return/feedback loops.',
  },
  [DIAGRAM_GRAMMARS.NETWORK]: {
    name: 'Hub & Satellite Ecosystem',
    minNodes: 3,
    maxNodes: { landscape: 7, vertical: 5 },
    defaultConnector: CONNECTOR_TYPES.STRAIGHT,
    defaultVisualForm: NODE_VISUAL_FORMS.CIRCLE,
    description: 'Central chokepoint or monopoly hub with radiating satellite dependencies (e.g. ASML).',
  },
  [DIAGRAM_GRAMMARS.STACK]: {
    name: 'Layered Architectural Stack',
    minNodes: 2,
    maxNodes: { landscape: 5, vertical: 4 },
    defaultConnector: CONNECTOR_TYPES.BRACKET,
    defaultVisualForm: NODE_VISUAL_FORMS.BAND,
    description: 'Stratified layers showing foundation, middleware, and application abstractions.',
  },
  [DIAGRAM_GRAMMARS.FUNNEL]: {
    name: 'Conversion & Chokepoint Funnel',
    minNodes: 3,
    maxNodes: { landscape: 5, vertical: 4 },
    defaultConnector: CONNECTOR_TYPES.STRAIGHT,
    defaultVisualForm: NODE_VISUAL_FORMS.BAND,
    description: 'Tapering stages illustrating volume reduction, selection pressure, or filtering.',
  },
  [DIAGRAM_GRAMMARS.SYSTEM_ARCHITECTURE]: {
    name: 'Technical Architecture Bus',
    minNodes: 3,
    maxNodes: { landscape: 6, vertical: 4 },
    defaultConnector: CONNECTOR_TYPES.ELBOW,
    defaultVisualForm: NODE_VISUAL_FORMS.PILL,
    description: 'Engineered system components communicating through a common bus or interface.',
  },
};

/**
 * Infer optimal grammar from semantic keywords and context.
 */
export function inferDiagramGrammar({ text = '', narration = '', title = '', nodes = [], edges = [] } = {}) {
  const combined = `${title} ${text} ${narration}`.toLowerCase();

  // 1. Comparison
  if (/\b(versus|vs|compare|competes|opposite|contrast|unlike|alternative|choice)\b/i.test(combined)
    || (nodes.length === 2 && /\b(limbic.*prefrontal|prefrontal.*limbic|fast.*slow|emotional.*rational)\b/i.test(combined))) {
    return DIAGRAM_GRAMMARS.COMPARISON;
  }

  // 2. Cause & Effect
  if (/\b(causes|sparks|triggers|leads to|results in|consequence|reaction|domino)\b/i.test(combined)) {
    return DIAGRAM_GRAMMARS.CAUSE_EFFECT;
  }

  // 3. Conflict & Neural Tension
  if (/\b(conflict|tension|sabotage|battle|struggle|balance|tug of war)\b/i.test(combined)) {
    return DIAGRAM_GRAMMARS.RELATIONSHIP;
  }

  // 4. Cycle / Loop
  if (/\b(cycle|loop|habit|dopamine loop|feedback loop|reinforce|recurrent|circulate|spins)\b/i.test(combined)
    || edges.some((e) => e.from && e.to && e.to === edges[0]?.from)) {
    return DIAGRAM_GRAMMARS.CYCLE;
  }

  // 5. Funnel
  if (/\b(funnel|filter|conversion|chokepoint|narrowing|attrition)\b/i.test(combined)) {
    return DIAGRAM_GRAMMARS.FUNNEL;
  }

  // 6. Hierarchy / Stack
  if (/\b(hierarchy|org|breakdown|layers|tier|stack|parent|subtree)\b/i.test(combined)) {
    return DIAGRAM_GRAMMARS.HIERARCHY;
  }

  // 7. Network / Supply Chain
  if (/\b(network|supply chain|ecosystem|monopoly|hub|satellites|global.*dependency|asml.*tsmc)\b/i.test(combined)) {
    return DIAGRAM_GRAMMARS.NETWORK;
  }

  // 8. Pipeline with Feedback
  if (/\b(pipeline|loopback|agent.*tool|planner.*execute|observe.*update)\b/i.test(combined)
    || edges.some((e) => /feedback|return|update/i.test(e.label || ''))) {
    return DIAGRAM_GRAMMARS.PIPELINE;
  }

  // 9. System Architecture
  if (/\b(architecture|system|component|dispatcher|sandbox|bus|interface)\b/i.test(combined)) {
    return DIAGRAM_GRAMMARS.SYSTEM_ARCHITECTURE;
  }

  // Default to clean FLOW
  return DIAGRAM_GRAMMARS.FLOW;
}
