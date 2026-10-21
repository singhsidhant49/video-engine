/**
 * Milestone 13 — Deterministic Reference Diagram Fixtures
 * 
 * Defines authoritative fixtures A through F for both 16:9 landscape
 * and 9:16 vertical golden renderings:
 * 
 * Fixture A: Limbic system vs prefrontal cortex (COMPARISON)
 * Fixture B: Dopamine habit loop (CYCLE)
 * Fixture C: Autonomous AI agent execution (PIPELINE)
 * Fixture D: Global semiconductor supply chain (NETWORK)
 * Fixture E: Enterprise revenue breakdown (HIERARCHY)
 * Fixture F: Notification urge cascade (CAUSE_EFFECT)
 */

import { DIAGRAM_GRAMMARS, NODE_IMPORTANCE, NODE_VISUAL_FORMS, BACKGROUND_MODES } from './diagramGrammar.js';

export const GOLDEN_DIAGRAM_FIXTURES = {
  psychology_comparison: {
    id: 'psychology_comparison',
    name: 'Neural Conflict Comparison',
    topic: 'psychology',
    grammar: DIAGRAM_GRAMMARS.COMPARISON,
    title: 'DECISION ARCHITECTURE',
    centralConflictLabel: 'DECISION CONFLICT',
    conclusionLabel: 'Outcome: Impulse vs. Deliberation',
    backgroundMode: BACKGROUND_MODES.SOFT_RADIAL,
    nodes: [
      {
        id: 'limbic',
        label: 'LIMBIC SYSTEM',
        supportText: 'Fast · Emotional · Immediate Reward',
        importance: NODE_IMPORTANCE.PRIMARY,
        role: 'IMPULSE',
        visualForm: NODE_VISUAL_FORMS.BAND,
      },
      {
        id: 'pfc',
        label: 'PREFRONTAL CORTEX',
        supportText: 'Slow · Deliberate · Long-Term Value',
        importance: NODE_IMPORTANCE.PRIMARY,
        role: 'CONTROL',
        visualForm: NODE_VISUAL_FORMS.BAND,
      },
    ],
    edges: [
      { from: 'limbic', to: 'pfc', label: 'conflicts with', relationship: 'conflict', direction: 'bidirectional' },
    ],
  },
  dopamine_cycle: {
    id: 'dopamine_cycle',
    name: 'Dopamine Habit Loop',
    topic: 'psychology',
    grammar: DIAGRAM_GRAMMARS.CYCLE,
    title: 'DOPAMINE REINFORCEMENT LOOP',
    backgroundMode: BACKGROUND_MODES.CHARCOAL,
    nodes: [
      { id: 'cue', label: 'Cue / Trigger', supportText: 'External signal', importance: NODE_IMPORTANCE.SECONDARY, visualForm: NODE_VISUAL_FORMS.PILL },
      { id: 'anticipation', label: 'Dopamine Spike', supportText: 'Anticipation', importance: NODE_IMPORTANCE.PRIMARY, visualForm: NODE_VISUAL_FORMS.CIRCLE },
      { id: 'action', label: 'Craving / Action', supportText: 'Compulsive search', importance: NODE_IMPORTANCE.SECONDARY, visualForm: NODE_VISUAL_FORMS.PILL },
      { id: 'reward', label: 'Immediate Reward', supportText: 'Short relief', importance: NODE_IMPORTANCE.SECONDARY, visualForm: NODE_VISUAL_FORMS.PILL },
      { id: 'reinforce', label: 'Pathway Reinforcement', supportText: 'Deepened circuit', importance: NODE_IMPORTANCE.SUPPORTING, visualForm: NODE_VISUAL_FORMS.PILL },
    ],
    edges: [
      { from: 'cue', to: 'anticipation', label: 'triggers' },
      { from: 'anticipation', to: 'action', label: 'drives' },
      { from: 'action', to: 'reward', label: 'yields' },
      { from: 'reward', to: 'reinforce', label: 'strengthens' },
      { from: 'reinforce', to: 'cue', label: 'resets', isFeedback: true },
    ],
  },
  ai_agent_pipeline: {
    id: 'ai_agent_pipeline',
    name: 'Autonomous AI Agent Execution',
    topic: 'technology',
    grammar: DIAGRAM_GRAMMARS.PIPELINE,
    title: 'AUTONOMOUS EXECUTION LOOP',
    backgroundMode: BACKGROUND_MODES.TECHNICAL_GRID,
    nodes: [
      { id: 'goal', label: 'User Goal', supportText: 'Natural language', importance: NODE_IMPORTANCE.SECONDARY, visualForm: NODE_VISUAL_FORMS.PILL },
      { id: 'inspect', label: 'Context Inspection', supportText: 'Read repo & logs', importance: NODE_IMPORTANCE.SECONDARY, visualForm: NODE_VISUAL_FORMS.PILL },
      { id: 'decide', label: 'Plan & Decide', supportText: 'Reasoning model', importance: NODE_IMPORTANCE.PRIMARY, visualForm: NODE_VISUAL_FORMS.BAND },
      { id: 'tool', label: 'Tool Invocation', supportText: 'Linter, CLI, edit', importance: NODE_IMPORTANCE.SECONDARY, visualForm: NODE_VISUAL_FORMS.PILL },
      { id: 'observe', label: 'Observation', supportText: 'Compiler output', importance: NODE_IMPORTANCE.SUPPORTING, visualForm: NODE_VISUAL_FORMS.PILL },
    ],
    edges: [
      { from: 'goal', to: 'inspect' },
      { from: 'inspect', to: 'decide' },
      { from: 'decide', to: 'tool' },
      { from: 'tool', to: 'observe' },
      { from: 'observe', to: 'decide', label: 'feedback loop', isFeedback: true },
    ],
  },
  asml_supply_chain: {
    id: 'asml_supply_chain',
    name: 'Global Semiconductor Supply Chain',
    topic: 'semiconductors',
    grammar: DIAGRAM_GRAMMARS.NETWORK,
    title: 'THE SILICON MONOPOLY',
    backgroundMode: BACKGROUND_MODES.SUBTLE_TEXTURE,
    nodes: [
      { id: 'zeiss', label: 'Zeiss Optics', supportText: 'EUV mirrors', importance: NODE_IMPORTANCE.SUPPORTING, visualForm: NODE_VISUAL_FORMS.PILL },
      { id: 'cymer', label: 'Cymer Light', supportText: 'Tin plasma pulse', importance: NODE_IMPORTANCE.SUPPORTING, visualForm: NODE_VISUAL_FORMS.PILL },
      { id: 'asml', label: 'ASML Veldhoven', supportText: 'Sole EUV integrator', importance: NODE_IMPORTANCE.PRIMARY, visualForm: NODE_VISUAL_FORMS.BAND },
      { id: 'tsmc', label: 'TSMC Foundries', supportText: 'Leading-edge wafers', importance: NODE_IMPORTANCE.SECONDARY, visualForm: NODE_VISUAL_FORMS.PILL },
      { id: 'buyers', label: 'NVIDIA / Apple / Cloud', supportText: 'Next-gen chips', importance: NODE_IMPORTANCE.SECONDARY, visualForm: NODE_VISUAL_FORMS.PILL },
    ],
    edges: [
      { from: 'zeiss', to: 'asml', label: 'precision optics' },
      { from: 'cymer', to: 'asml', label: 'EUV source' },
      { from: 'asml', to: 'tsmc', label: 'lithography systems' },
      { from: 'tsmc', to: 'buyers', label: 'finished silicon' },
    ],
  },
  finance_hierarchy: {
    id: 'finance_hierarchy',
    name: 'Enterprise Revenue Breakdown',
    topic: 'business',
    grammar: DIAGRAM_GRAMMARS.HIERARCHY,
    title: 'ENTERPRISE REVENUE STACK',
    backgroundMode: BACKGROUND_MODES.PAPER_LIGHT,
    nodes: [
      { id: 'total', label: 'Total Revenue ($85B)', supportText: 'Consolidated fiscal year', importance: NODE_IMPORTANCE.PRIMARY, visualForm: NODE_VISUAL_FORMS.BAND },
      { id: 'cloud', label: 'Cloud Infrastructure', supportText: '48% · 24% YoY growth', importance: NODE_IMPORTANCE.SECONDARY, visualForm: NODE_VISUAL_FORMS.PILL },
      { id: 'enterprise', label: 'Enterprise Software', supportText: '34% · Recurring', importance: NODE_IMPORTANCE.SECONDARY, visualForm: NODE_VISUAL_FORMS.PILL },
      { id: 'services', label: 'Professional Services', supportText: '18% · Implementation', importance: NODE_IMPORTANCE.SUPPORTING, visualForm: NODE_VISUAL_FORMS.PILL },
    ],
    edges: [
      { from: 'total', to: 'cloud' },
      { from: 'total', to: 'enterprise' },
      { from: 'total', to: 'services' },
    ],
  },
  cause_effect_chain: {
    id: 'cause_effect_chain',
    name: 'Notification Urge Cascade',
    topic: 'psychology',
    grammar: DIAGRAM_GRAMMARS.CAUSE_EFFECT,
    title: 'ATTENTION CAPTURE CASCADE',
    backgroundMode: BACKGROUND_MODES.NEUTRAL_DARK,
    nodes: [
      { id: 'ping', label: 'Push Notification', supportText: 'Auditory stimulus', importance: NODE_IMPORTANCE.SECONDARY, visualForm: NODE_VISUAL_FORMS.PILL },
      { id: 'spike', label: 'Anticipation Spike', supportText: 'Uncertain reward cue', importance: NODE_IMPORTANCE.PRIMARY, visualForm: NODE_VISUAL_FORMS.BAND },
      { id: 'urge', label: 'Cognitive Urge', supportText: 'Task friction', importance: NODE_IMPORTANCE.SECONDARY, visualForm: NODE_VISUAL_FORMS.PILL },
      { id: 'action', label: 'App Open Action', supportText: 'Attention captured', importance: NODE_IMPORTANCE.SECONDARY, visualForm: NODE_VISUAL_FORMS.PILL },
    ],
    edges: [
      { from: 'ping', to: 'spike', label: 'triggers' },
      { from: 'spike', to: 'urge', label: 'amplifies' },
      { from: 'urge', to: 'action', label: 'compels' },
    ],
  },
};
