/**
 * Visual Coverage Plan & Explanatory Representation Engine.
 * 
 * Answers the core editorial question:
 * "WHAT SHOULD THE VIEWER SEE TO UNDERSTAND THIS IDEA?"
 * 
 * Replaces the naive "no media -> StatementShot" default with semantic, content-driven
 * explanatory primitives: Code, UI/Repository, Process Diagrams, Node/Relationship Graphs,
 * Geopolitical Maps, Split Comparisons, Timelines, Authentic Documents, and Charts.
 */

import { VisualCoveragePlanSchema } from '../models/visualCoveragePlan.schema.js';
import { flattenStoryboardScenes } from './storyboardDiagnostics.js';
import { buildVisualProposition } from './visualProposition.js';
import { routeRepresentation } from './representationRouter.js';

export const INFORMATION_TYPES = {
  CODE: 'code',
  INTERFACE: 'interface',
  PROCESS: 'process',
  COMPARISON: 'comparison',
  RELATIONSHIP: 'relationship',
  TIMELINE: 'timeline',
  LOCATION: 'location',
  DATA: 'data',
  EVIDENCE: 'evidence',
  ENTITY: 'entity',
  EMOTION: 'emotion',
  ATMOSPHERE: 'atmosphere',
  EMPHASIS: 'emphasis',
};

export const REPRESENTATIONS = {
  MEDIA: 'media',
  CODE: 'code',
  UI: 'ui',
  PROCESS: 'process',
  DIAGRAM: 'diagram',
  COMPARISON: 'comparison',
  TIMELINE: 'timeline',
  MAP: 'map',
  CHART: 'chart',
  DOCUMENT: 'document',
  TYPOGRAPHY: 'typography',
};

/**
 * Classifies the information type of a content beat or scene based on narration,
 * intent, entities, and keywords.
 * 
 * @param {Object} scene - Storyboard scene or plan beat
 * @returns {string} One of INFORMATION_TYPES
 */
export function classifyInformationType(scene) {
  const text = `${scene.narration || ''} ${scene.purpose || ''} ${scene.visualConcept || ''} ${scene.visual || ''} ${scene.text?.headline || ''} ${scene.text?.kicker || ''} ${scene.focus || ''}`.toLowerCase();
  const entities = (scene.entities || []).map((e) => (typeof e === 'string' ? e : e.name || '')).join(' ').toLowerCase();
  const combined = `${text} ${entities}`;

  // 1. Evidence / Study / Archival Document (check high-priority scientific evidence before general keywords)
  if (/\b(marshmallow test|stanford|experiment|research paper|study|published|patent|court document|headline|article|quote|archives)\b/i.test(combined)
    || scene.kind === 'document' || scene.kind === 'quote' || scene.evidenceRequirement === 'required') {
    return INFORMATION_TYPES.EVIDENCE;
  }

  // 2. Code / Software Engineering
  if (/\b(codebase|syntax|function|functions|unit tests?|run tests?|tests? pass|test runner|failed tests?|test fail\w*|repo|repos|repository|repositories|git|diff|patch|tool calls?|function calls?|bash|compile|debug|refactor|pull request|npm|python|javascript|script)\b/i.test(combined)
    || (/\btests?\b/i.test(combined) && /\b(agent|run|fail|pass|code|build|recover)\b/i.test(combined))
    || (/\bterminal\b/i.test(combined) && /\b(command line|cli|bash|console|code|script|prompt|run|shell|developer)\b/i.test(combined))
    || scene.kind === 'code') {
    return INFORMATION_TYPES.CODE;
  }

  // 3. Interface / App / Workflow
  if (/\b(interface|ui|window|search bar|context window|prompt|input|editor|file tree|query|queries|retrieve|retrieval|dashboard|feed|notification)\b/i.test(combined)
    || /\bdatabase\s+(console|dashboard|screen|interface|client)\b/i.test(combined)
    || scene.kind === 'ui') {
    return INFORMATION_TYPES.INTERFACE;
  }

  // 3. Process / Multi-stage flow / Loops
  if (/\b(loop|step|first|then|finally|cycle|pipeline|pathway|fires|phase|stages|mechanism|trigger.*spike|how it works)\b/i.test(combined)
    || scene.kind === 'process') {
    return INFORMATION_TYPES.PROCESS;
  }

  // 4. Comparison / Contrast / A vs B
  if (/\b(competes|versus|vs|contrast|unlike|differs|opposite|on the other hand|while.*tries|two systems|alternative|choice)\b/i.test(combined)
    || scene.kind === 'comparison' || scene.visualIntent === 'compare') {
    return INFORMATION_TYPES.COMPARISON;
  }

  // 5. Relationship / Architecture / Multi-component networks
  if (/\b(limbic.*prefrontal|prefrontal cortex|neural network|architecture|interact|connects|system.*competes|governs|hierarchy|nodes)\b/i.test(combined)) {
    return INFORMATION_TYPES.RELATIONSHIP;
  }

  // 6. Timeline / Chronological Progression
  if (/\b(history|decades|evolution|chronology|day 1|year 1|milestones|centuries|timeline|over time|gradually|started in|by \d{4})\b/i.test(combined)
    || scene.kind === 'timeline') {
    return INFORMATION_TYPES.TIMELINE;
  }

  // 7. Location / Geography / Global Distribution
  if (/\b(taiwan|netherlands|silicon valley|geography|geopolitical|shipping routes|trade routes|chokepoint map|concentrated in|factories in|shipped from)\b/i.test(combined)
    || (/\b(map|worldwide|across the globe)\b/i.test(combined) && /\b(route|supply|chokepoint|factory|geopolitical|travel|hub)\b/i.test(combined))
    || scene.kind === 'map') {
    return INFORMATION_TYPES.LOCATION;
  }

  // 8. Data / Quantitative / Charts
  if (/\b(percent|%|drops|value drops|discounting|curve|statistics|billion|million|ratio|metric|survey|data points|growth)\b/i.test(combined)
    || scene.kind === 'statistic' || scene.kind === 'chart' || scene.visualIntent === 'quantify') {
    return INFORMATION_TYPES.DATA;
  }

  // 9. Concrete physical entity (machine, person, device, building, artifact)
  if (entities.length > 0 && !/\b(brain|mind|thought|skill|decision|future)\b/i.test(entities)) {
    return INFORMATION_TYPES.ENTITY;
  }
  if (scene.kind === 'subject' || scene.role === 'subject' || scene.role === 'establishing' || scene.role === 'context' || scene.role === 'detail') {
    return INFORMATION_TYPES.ENTITY;
  }

  // 11. Emotion / Atmosphere / Concrete scene
  if (scene.kind === 'atmosphere' || scene.visualIntent === 'humanize' || scene.visualIntent === 'contextualize' || (scene.visualConcept && !scene.emphasis && scene.kind !== 'statement')) {
    return INFORMATION_TYPES.ATMOSPHERE;
  }

  // 12. Pure rhetorical emphasis
  return INFORMATION_TYPES.EMPHASIS;
}

/**
 * Builds a deterministic VisualCoveragePlan for the storyboard.
 * Maps every shot to its primary representation and an ordered non-statement fallback chain.
 * 
 * @param {Object} storyboard - Canonical storyboard
 * @returns {Array<Object>} List of VisualCoverageItem
 */
export function buildVisualCoveragePlan(storyboard, { visualPolicy = null } = {}) {
  const items = [];
  const canonical = Array.isArray(storyboard.sections);
  const scenes = canonical ? flattenStoryboardScenes(storyboard) : (storyboard.scenes || []);
  const sectionByScene = new Map(canonical
    ? storyboard.sections.flatMap((section) => section.scenes.map((scene) => [scene.id, section.id]))
    : scenes.map((scene) => [scene.id, scene.sectionId || 'legacy']));

  const allowProcedural = visualPolicy
    ? (visualPolicy.enableProceduralGraphics === true && !visualPolicy.useMediaEditorial)
    : true;

  for (const scene of scenes) {
    const shots = scene.shots || [scene];

    for (const shot of shots) {
      const infoType = classifyInformationType({ ...scene, ...shot, narration: scene.narration });
      let primary = REPRESENTATIONS.MEDIA;
      let fallbacks = [REPRESENTATIONS.MEDIA];

      if (allowProcedural) {
        switch (infoType) {
          case INFORMATION_TYPES.CODE:
            primary = REPRESENTATIONS.CODE;
            fallbacks = [REPRESENTATIONS.UI, REPRESENTATIONS.DIAGRAM, REPRESENTATIONS.COMPARISON];
            break;
          case INFORMATION_TYPES.INTERFACE:
            primary = REPRESENTATIONS.UI;
            fallbacks = [REPRESENTATIONS.CODE, REPRESENTATIONS.DIAGRAM, REPRESENTATIONS.MEDIA];
            break;
          case INFORMATION_TYPES.PROCESS:
            primary = REPRESENTATIONS.PROCESS;
            fallbacks = [REPRESENTATIONS.TIMELINE, REPRESENTATIONS.COMPARISON, REPRESENTATIONS.MEDIA];
            break;
          case INFORMATION_TYPES.COMPARISON:
            primary = REPRESENTATIONS.COMPARISON;
            fallbacks = [REPRESENTATIONS.DIAGRAM, REPRESENTATIONS.CHART, REPRESENTATIONS.TYPOGRAPHY];
            break;
          case INFORMATION_TYPES.RELATIONSHIP:
            primary = REPRESENTATIONS.DIAGRAM;
            fallbacks = [REPRESENTATIONS.COMPARISON, REPRESENTATIONS.PROCESS, REPRESENTATIONS.TYPOGRAPHY];
            break;
          case INFORMATION_TYPES.TIMELINE:
            primary = REPRESENTATIONS.TIMELINE;
            fallbacks = [REPRESENTATIONS.DIAGRAM, REPRESENTATIONS.MEDIA, REPRESENTATIONS.DOCUMENT];
            break;
          case INFORMATION_TYPES.LOCATION:
            primary = REPRESENTATIONS.MAP;
            fallbacks = [REPRESENTATIONS.MEDIA, REPRESENTATIONS.DIAGRAM, REPRESENTATIONS.TIMELINE];
            break;
          case INFORMATION_TYPES.DATA:
            primary = REPRESENTATIONS.CHART;
            fallbacks = [REPRESENTATIONS.COMPARISON, REPRESENTATIONS.DOCUMENT, REPRESENTATIONS.TYPOGRAPHY];
            break;
          case INFORMATION_TYPES.EVIDENCE:
            primary = REPRESENTATIONS.DOCUMENT;
            fallbacks = [REPRESENTATIONS.MEDIA, REPRESENTATIONS.DIAGRAM, REPRESENTATIONS.TYPOGRAPHY];
            break;
          case INFORMATION_TYPES.ENTITY:
          case INFORMATION_TYPES.ATMOSPHERE:
          case INFORMATION_TYPES.EMOTION:
            primary = REPRESENTATIONS.MEDIA;
            fallbacks = [REPRESENTATIONS.DOCUMENT, REPRESENTATIONS.TYPOGRAPHY];
            break;
          case INFORMATION_TYPES.EMPHASIS:
          default:
            primary = REPRESENTATIONS.TYPOGRAPHY;
            fallbacks = [REPRESENTATIONS.MEDIA];
            break;
        }

        // A shot's authored media policy is more specific than scene classification.
        if (shot.mediaPreference === 'real') {
          primary = REPRESENTATIONS.MEDIA;
        } else if (shot.mediaPreference === 'procedural' && infoType === INFORMATION_TYPES.PROCESS) {
          primary = REPRESENTATIONS.PROCESS;
        }
      } else {
        primary = REPRESENTATIONS.MEDIA;
        fallbacks = [REPRESENTATIONS.MEDIA];
      }

      const visualProposition = buildVisualProposition({
        shot,
        scene,
        topic: storyboard.topic || storyboard.title || '',
      });
      const representationDecision = routeRepresentation(visualProposition, {
        shotId: shot.id || `${scene.id}_shot_01`, primaryRepresentation: primary, fallbackRepresentations: fallbacks,
      }, { visualPolicy });
      primary = representationDecision.selectedRepresentation;
      items.push({
        sectionId: sectionByScene.get(scene.id) || 'legacy',
        sceneId: scene.id,
        shotId: shot.id || `${scene.id}_shot_01`,
        informationType: infoType,
        primaryRepresentation: primary,
        fallbackRepresentations: fallbacks,
        semanticPayload: {
          communicationObjective: scene.visualIntent || scene.purpose || 'explain',
          visualConcept: shot.visualConcept || scene.visual || '',
          entities: (shot.entities || scene.entities || []).map((entity) => typeof entity === 'string' ? entity : entity.name).filter(Boolean),
          role: shot.role || 'graphic',
        },
        evidenceRequirements: {
          level: shot.evidenceRequirement || scene.evidenceRequirement || 'conceptual_allowed',
          authenticSourceRequired: (shot.evidenceRequirement || scene.evidenceRequirement) === 'required',
        },
        mediaConstraints: {
          preference: shot.mediaPreference || 'auto',
          orientation: storyboard.format === 'shorts' ? 'portrait' : 'landscape',
          focalPointHint: shot.focalPointHint || null,
          motionPreference: shot.motionPreference || null,
        },
        confidence: 0.92,
        rationale: `Shot classified as "${infoType}"; preferred explanatory channel is "${primary}".`,
        coverageStatus: 'UNRESOLVED',
        visualProposition,
        representationDecision,
      });
    }
  }

  return VisualCoveragePlanSchema.parse(items);
}

/**
 * Synthesizes rich explanatory semantic data for procedural primitives when LLM scene.data is sparse.
 * Guarantees that CodeShot, DiagramShot, MapShot, UiShot, ChartShot, and CompareShot have authentic,
 * topic-grounded content to render.
 */
export function synthesizeProceduralData(scene, representation) {
  const text = scene.narration || '';
  const tokens = text.split(/\s+/).filter(Boolean);

  switch (representation) {
    case REPRESENTATIONS.CODE: {
      if (scene.data?.code) return scene.data;
      if (/deadlock|transaction|rollback|gridlock|victim.*retry|retry.*failure/i.test(text)) {
        return {
          filename: 'src/db/transfer.py',
          language: 'python',
          code: `for attempt in range(3):\n    try:\n        db.begin()\n        transfer(a, b, amount)\n        db.commit()\n        break\n    except DeadlockError:\n        db.rollback()\n        continue`,
          highlightLines: [7, 8, 9],
          terminal: 'DeadlockError: transaction selected as victim\nROLLBACK complete\nRetry 2/3 succeeded',
        };
      }
      if (/test|recover/i.test(text)) {
        return {
          filename: 'tests/agent.test.js',
          language: 'javascript',
          code: `test('agent self-corrects after test failure', async () => {\n  const patch = await agent.generatePatch(task);\n  const result = await env.runTests(patch);\n  expect(result.passed).toBe(true); // recovered\n});`,
          highlightLines: [3, 4],
          diff: true,
          terminal: 'FAIL tests/agent.test.js (attempt 1)\nPASS tests/agent.test.js (attempt 2: patched)',
        };
      }
      if (/tool|run commands|environment/i.test(text)) {
        return {
          filename: 'src/tools/fileSystem.js',
          language: 'javascript',
          code: `export async function executeTool(name, params) {\n  const tool = registry.get(name);\n  const observation = await tool.run(params);\n  return { success: true, output: observation };\n}`,
          highlightLines: [2, 3],
          terminal: '$ node --test src/tools/*.test.js\n✔ tool: read_file (12ms)\n✔ tool: run_command (45ms)',
        };
      }
      return {
        filename: 'src/agent/loop.js',
        language: 'javascript',
        code: `while (!task.completed) {\n  const plan = await model.reason(task);\n  const action = await plan.selectTool();\n  const result = await environment.execute(action);\n  task.update(result);\n}`,
        highlightLines: [2, 3, 4],
        terminal: '$ agent run "refactor authentication flow"\n[step 1/3] Reading auth.js...\n[step 2/3] Patch applied.',
      };
    }

    case REPRESENTATIONS.UI: {
      if (scene.data?.fileTree) return scene.data;
      if (/database|deadlock|transaction|quer(?:y|ies)|application.*(?:freeze|crash|gridlock)/i.test(text)) {
        return {
          title: 'Database Activity Monitor',
          activeFile: 'blocked_queries.sql',
          fileTree: ['Transaction A — waiting', 'Transaction B — waiting', 'Lock graph — cycle'],
          searchQuery: 'blocked queries and lock waits',
          status: 'DEADLOCK RISK: circular wait detected',
        };
      }
      return {
        title: 'Repository Workspace',
        activeFile: 'src/agent.js',
        fileTree: ['src/agent.js', 'src/tools.js', 'src/context.js', 'tests/agent.test.js'],
        searchQuery: 'semantic search: context window',
        status: 'Audit Log: Tool Call #14 - Executed git diff',
      };
    }

    case REPRESENTATIONS.DIAGRAM: {
      if (scene.data?.nodes && scene.data?.grammar) return scene.data;
      if (/deadlock|circular wait|transaction.*lock|lock.*transaction|banking app.*transfer/i.test(text)) {
        return {
          grammar: 'CYCLE',
          title: /deadlock|database|cycle/i.test(text) ? 'DATABASE DEADLOCK CYCLE' : 'TRANSACTIONS WAIT FOR LOCKS',
          nodes: [
            { id: 'tx_a', label: 'Transfer A', role: 'Transaction', detail: 'Locks account A; waits for B' },
            { id: 'tx_b', label: 'Transfer B', role: 'Transaction', detail: 'Locks account B; waits for A' },
            { id: 'detect', label: 'Cycle Detected', role: 'Database', detail: 'Circular wait graph found' },
            { id: 'rollback', label: 'Victim Rollback', role: 'Resolution', detail: 'Releases locks; other transfer finishes' },
          ],
          edges: [
            { from: 'tx_a', to: 'tx_b', label: 'waits for' },
            { from: 'tx_b', to: 'detect', label: 'closes cycle' },
            { from: 'detect', to: 'rollback', label: 'selects victim' },
            { from: 'rollback', to: 'tx_a', label: 'releases locks', direction: 'return_loop' },
          ],
        };
      }
      if (/limbic|prefrontal|brain|urge|delay|gratification|neuro/i.test(text)) {
        if (/cycle|loop|dopamine|habit|craving|pleasure/i.test(text)) {
          return {
            grammar: 'CYCLE',
            title: 'DOPAMINE REINFORCEMENT CYCLE',
            nodes: [
              { id: 'cue', label: 'Sensory Cue', role: 'Trigger', detail: 'Immediate temptation' },
              { id: 'anticipation', label: 'Anticipation', role: 'Neurochemical', detail: 'Dopamine spike' },
              { id: 'action', label: 'Action', role: 'Behavior', detail: 'Seeking gratification' },
              { id: 'reward', label: 'Reward', role: 'Payload', detail: 'Temporary satisfaction' },
            ],
            edges: [
              { from: 'cue', to: 'anticipation', label: 'triggers' },
              { from: 'anticipation', to: 'action', label: 'drives' },
              { from: 'action', to: 'reward', label: 'yields' },
              { from: 'reward', to: 'cue', label: 'reinforces', direction: 'return_loop' },
            ],
          };
        }
        return {
          grammar: 'RELATIONSHIP',
          title: 'NEURAL DECISION ARBITRATION',
          nodes: [
            { id: 'limbic', label: 'Limbic System', role: 'Fast // Subcortical', detail: 'Immediate emotional impulse' },
            { id: 'pfc', label: 'Prefrontal Cortex', role: 'Slow // Executive', detail: 'Long-term value calculation' },
          ],
          edges: [
            { from: 'limbic', to: 'pfc', label: 'Impulse conflict', direction: 'bidirectional' },
          ],
          conclusionLabel: 'DECISION CONFLICT',
        };
      }
      if (/asml|semiconductor|lithography|tsmc|chip|export control|monopoly|wafer/i.test(text)) {
        return {
          grammar: 'NETWORK',
          title: 'SEMICONDUCTOR VALUE CHOKEPOINT',
          nodes: [
            { id: 'asml', label: 'ASML (Netherlands)', role: 'Monopolist', detail: 'Exclusive EUV optics', importance: 'PRIMARY' },
            { id: 'tsmc', label: 'TSMC (Taiwan)', role: 'Fabrication', detail: 'Advanced leading-edge nodes' },
            { id: 'giants', label: 'NVIDIA / Apple', role: 'Architecture', detail: 'AI accelerators & silicon' },
          ],
          edges: [
            { from: 'asml', to: 'tsmc', label: 'EUV machines' },
            { from: 'tsmc', to: 'giants', label: 'manufactured chips' },
          ],
        };
      }
      if (/bailout|tarp|government|treasury|central bank|federal reserve|fed\b/i.test(text)) {
        return {
          grammar: 'PIPELINE',
          title: 'SYSTEMIC RESCUE FACILITY',
          nodes: [
            { id: 'treasury', label: 'Treasury / Fed', role: 'Liquidity Authority', detail: 'Emergency facility backstop' },
            { id: 'capital', label: 'Capital Injection', role: 'Stabilization', detail: 'Preferred equity & asset purchases' },
            { id: 'solvency', label: 'Solvency Restoration', role: 'Systemic Health', detail: 'Interbank credit unfreezes' },
          ],
          edges: [
            { from: 'treasury', to: 'capital', label: 'injects TARP' },
            { from: 'capital', to: 'solvency', label: 'restores trust' },
          ],
        };
      }
      if (/lehman|bear stearns|insolven|bankrupt|panic|run on the bank|contagion/i.test(text)) {
        return {
          grammar: 'CYCLE',
          title: 'COUNTERPARTY RUN SPIRAL',
          nodes: [
            { id: 'panic', label: 'Counterparty Distrust', role: 'Trigger', detail: 'Fear of toxic balance sheets' },
            { id: 'margin', label: 'Margin Calls & Haircuts', role: 'Liquidity Squeeze', detail: 'Repo lenders demand immediate cash' },
            { id: 'fire_sale', label: 'Fire-Sale Liquidation', role: 'Asset Collapse', detail: 'Assets dumped at deep discounts' },
            { id: 'insolvency', label: 'Capital Depletion', role: 'Failure', detail: 'Terminal default & shutdown' },
          ],
          edges: [
            { from: 'panic', to: 'margin', label: 'accelerates' },
            { from: 'margin', to: 'fire_sale', label: 'forces' },
            { from: 'fire_sale', to: 'insolvency', label: 'causes' },
            { from: 'insolvency', to: 'panic', label: 'amplifies panic', direction: 'return_loop' },
          ],
        };
      }
      if (/interbank|credit market|commercial paper|libor|liquidity freeze|credit freeze|credit spread/i.test(text)) {
        return {
          grammar: 'COMPARISON',
          title: 'CREDIT TRANSMISSION SHOCK',
          nodes: [
            { id: 'liquid', label: 'Functioning Market', role: 'Normal State', detail: 'Overnight interbank loans flow freely' },
            { id: 'frozen', label: 'Seized Grid', role: 'Crisis State', detail: 'Cash hoarding; short-term debt halts' },
          ],
          edges: [
            { from: 'liquid', to: 'frozen', label: 'confidence ruptures' },
          ],
        };
      }
      if (/(connected world|interconnect|global market|across the globe)/i.test(text) && /(bank|finance|mortgage|credit|market)/i.test(text)) {
        return {
          grammar: 'NETWORK',
          title: 'GLOBAL INTERCONNECTED CONTAGION',
          nodes: [
            { id: 'us_mortgages', label: 'US Housing Shock', role: 'Shock Origin', detail: 'Subprime mortgage defaults erupt' },
            { id: 'global_banks', label: 'International Banks', role: 'Transmission Grid', detail: 'Concealed leverage across Europe & Asia' },
            { id: 'real_economy', label: 'Global Real Economy', role: 'Systemic Impact', detail: 'Credit contraction & worldwide recession' },
          ],
          edges: [
            { from: 'us_mortgages', to: 'global_banks', label: 'cross-border exposure' },
            { from: 'global_banks', to: 'real_economy', label: 'credit freeze transmits' },
          ],
        };
      }
      if (/bank|mortgage|financial|crisis|debt|credit|liquidity|subprime|cdo|mbs|securiti/i.test(text)) {
        return {
          grammar: 'FLOW',
          title: 'SUBPRIME SECURITIZATION CASCADE',
          nodes: [
            { id: 'subprime', label: 'Subprime Originators', role: 'Asset Base', detail: 'High default risk mortgages' },
            { id: 'mbs', label: 'Securitized Debt (MBS)', role: 'Derivatives', detail: 'Tranches conceal toxic exposure' },
            { id: 'insolvency', label: 'Systemic Contagion', role: 'Chokepoint', detail: 'Global write-downs across banks' },
          ],
          edges: [
            { from: 'subprime', to: 'mbs', label: 'bundled into' },
            { from: 'mbs', to: 'insolvency', label: 'triggers write-downs' },
          ],
        };
      }
      if (/agent|code|compiler|model|execute|prompt|task|sandbox/i.test(text)) {
        return {
          grammar: 'PIPELINE',
          title: 'AGENT EXECUTION LOOP',
          nodes: [
            { id: 'agent', label: 'AI Agent', role: 'Planner', detail: 'Selects tool & patch' },
            { id: 'tool', label: 'Tool Dispatcher', role: 'Boundary', detail: 'Executes command' },
            { id: 'env', label: 'Sandbox Environment', role: 'Runtime', detail: 'Runs unit tests' },
            { id: 'obs', label: 'Observation', role: 'Feedback', detail: 'Inspects error status' },
          ],
          edges: [
            { from: 'agent', to: 'tool', label: 'invoke' },
            { from: 'tool', to: 'env', label: 'execute' },
            { from: 'env', to: 'obs', label: 'test output' },
            { from: 'obs', to: 'agent', label: 'feedback loop', direction: 'return_loop' },
          ],
        };
      }
      return {
        grammar: 'FLOW',
        // Structured source data is closer to the narrated payload than an
        // editorial headline. This matters when a media shot is recast to a
        // diagram during resume: the headline may be a semantic paraphrase
        // with no spoken words, while data.title is narration-grounded.
        title: scene.data?.title || scene.text?.headline || tokens.slice(0, 4).join(' ').toUpperCase() || 'CAUSAL PROGRESSION',
        nodes: [
          { id: 'n1', label: tokens.slice(0, 3).join(' ') || 'Initial Trigger', role: 'Source' },
          { id: 'n2', label: tokens.slice(3, 7).join(' ') || 'Mechanism', role: 'Process' },
          { id: 'n3', label: tokens.slice(7, 11).join(' ') || 'Outcome', role: 'Result' },
        ],
        edges: [
          { from: 'n1', to: 'n2', label: 'leads to' },
          { from: 'n2', to: 'n3', label: 'produces' },
        ],
      };
    }

    case REPRESENTATIONS.MAP: {
      if (/asml|semiconductor|chip|tsmc|lithography/i.test(text)) {
        return {
          title: 'GLOBAL SEMICONDUCTOR DEPENDENCY',
          regions: [
            { name: 'Veldhoven (ASML)', role: 'EUV Monopolist', x: 48, y: 32 },
            { name: 'Taiwan (TSMC)', role: 'Fabrication Hub', x: 78, y: 52 },
            { name: 'USA (NVIDIA / Apple)', role: 'Design Hub', x: 22, y: 38 },
          ],
          flows: [
            { from: 'Veldhoven (ASML)', to: 'Taiwan (TSMC)' },
            { from: 'Taiwan (TSMC)', to: 'USA (NVIDIA / Apple)' },
          ],
        };
      }
      if (/bank|finance|market|crisis|debt|mortgage|contagion|credit/i.test(text)) {
        return {
          title: 'GLOBAL FINANCIAL CONTAGION NETWORK',
          regions: [
            { name: 'Wall Street (New York)', role: 'Origin Hub', x: 26, y: 38 },
            { name: 'City of London', role: 'European Chokepoint', x: 49, y: 28 },
            { name: 'Tokyo / Hong Kong', role: 'Asian Liquidity Grid', x: 82, y: 44 },
          ],
          flows: [
            { from: 'Wall Street (New York)', to: 'City of London' },
            { from: 'City of London', to: 'Tokyo / Hong Kong' },
          ],
        };
      }
      return {
        title: 'GLOBAL TRANSMISSION NETWORK',
        regions: [
          { name: 'Origin Hub', role: 'Catalyst', x: 26, y: 42 },
          { name: 'Regional Center', role: 'Intermediary', x: 50, y: 32 },
          { name: 'Global Markets', role: 'Transmission', x: 80, y: 46 },
        ],
        flows: [
          { from: 'Origin Hub', to: 'Regional Center' },
          { from: 'Regional Center', to: 'Global Markets' },
        ],
      };
    }

    case 'process': {
      if (scene.data?.steps) return scene.data;
      if (/dopamine|habit|craving|brain|impulse|reward/i.test(text)) {
        return {
          title: 'HABIT FORMATION MECHANISM',
          steps: [
            { number: 1, label: 'Sensory Trigger', detail: 'Notification or environmental cue' },
            { number: 2, label: 'Dopamine Anticipation', detail: 'Limbic activation & pleasure forecast' },
            { number: 3, label: 'Compulsive Action', detail: 'Behavioral gratification response' },
          ],
        };
      }
      if (/asml|semiconductor|chip|lithography/i.test(text)) {
        return {
          title: 'EUV MANUFACTURING PROCESS',
          steps: [
            { number: 1, label: 'Molten Tin Droplets', detail: 'Fired at 50,000 pulses per second' },
            { number: 2, label: 'CO2 Laser Vaporization', detail: 'Creates 13.5nm extreme ultraviolet light' },
            { number: 3, label: 'Atomic-Scale Etching', detail: 'Transfers circuitry onto silicon wafer' },
          ],
        };
      }
      return {
        title: scene.text?.headline || tokens.slice(0, 3).join(' ').toUpperCase() || 'PROCESS',
        steps: [
          { number: 1, label: tokens.slice(0, 3).join(' ') || 'Initial state', detail: tokens.slice(3, 6).join(' ') },
          { number: 2, label: tokens.slice(6, 9).join(' ') || 'Mechanism', detail: tokens.slice(9, 12).join(' ') },
          { number: 3, label: tokens.slice(12, 15).join(' ') || 'Outcome', detail: tokens.slice(15, 18).join(' ') },
        ],
      };
    }

    case 'compare':
    case 'comparison':
    case REPRESENTATIONS.COMPARISON: {
      if (scene.data?.left && scene.data?.right) return scene.data;
      if (/\b(bank|banking|account|transfer|transaction|deadlock|lock)\b/i.test(text)) {
        return {
          grammar: 'COMPARISON',
          title: /transfer/i.test(text) ? 'CROSSED TRANSFERS' : 'TRANSACTION LOCKS',
          left: { title: 'Transfer A to B', desc: 'Locks account A', detail: 'Waits for account B' },
          right: { title: 'Transfer B to A', desc: 'Locks account B', detail: 'Waits for account A' },
          leftAt: 2,
          rightAt: 14,
        };
      }
      if (/limbic|prefrontal|brain|urge|delay|gratification/i.test(text)) {
        return {
          grammar: 'COMPARISON',
          title: 'NEURAL CONFLICT COMPARISON',
          left: { title: 'Prefrontal Cortex', desc: 'Executive Goal Planning', detail: 'Slow, rational long-term calculation' },
          right: { title: 'Limbic System', desc: 'Impulsive Reward Seeking', detail: 'Fast, emotional instant dopamine urge' },
          leftAt: 2,
          rightAt: 14,
        };
      }
      if (/asml|monopoly|semiconductor|duv|euv/i.test(text)) {
        return {
          grammar: 'COMPARISON',
          title: 'LITHOGRAPHY GENERATION GAP',
          left: { title: 'Deep UV (193nm)', desc: 'Legacy Optical Limits', detail: 'Multi-patterning complexity choke' },
          right: { title: 'Extreme UV (13.5nm)', desc: 'Atomic Monolithic Single-Pass', detail: 'Proprietary Zeiss mirror optics' },
          leftAt: 2,
          rightAt: 14,
        };
      }
      if (/autocomplete|agent/i.test(text)) {
        return {
          grammar: 'COMPARISON',
          title: 'PARADIGM SHIFT',
          left: { title: 'Autocomplete', desc: 'Predicts next token', detail: 'Single file // Local line' },
          right: { title: 'Coding Agent', desc: 'Executes entire goal', detail: 'Multi-file // Test-validated' },
          leftAt: 2,
          rightAt: 14,
        };
      }
      return {
        grammar: 'COMPARISON',
        title: (scene.text?.headline || tokens.slice(0, 3).join(' ') || 'COMPARISON').toUpperCase(),
        left: { title: tokens.slice(0, 2).join(' ') || 'First state', desc: tokens.slice(2, 5).join(' ') || 'Initial condition', detail: tokens.slice(5, 8).join(' ') || 'First outcome' },
        right: { title: tokens.slice(8, 10).join(' ') || 'Second state', desc: tokens.slice(10, 13).join(' ') || 'Changed condition', detail: tokens.slice(13, 16).join(' ') || 'Second outcome' },
        leftAt: 2,
        rightAt: 14,
      };
    }

    case REPRESENTATIONS.DOCUMENT: {
      if (/marshmallow|stanford/i.test(text)) {
        return {
          title: 'STANFORD UNIVERSITY // 1972',
          headline: 'Cognitive and Attentional Mechanisms in Delay of Gratification',
          passage: '"Subjects were placed in a room with a choice between an immediate reward and a delayed double reward..."',
          highlight: 'delay of gratification correlates with long-term executive outcomes',
          source: 'Walter Mischel et al., JPSP',
        };
      }
      return {
        title: 'PRIMARY EVIDENCE ARCHIVE',
        headline: scene.text?.headline || 'Empirical Study & Audit Verification',
        passage: text.slice(0, 140) + '...',
        highlight: tokens.slice(0, 4).join(' '),
        source: 'Technical Report',
      };
    }

    case REPRESENTATIONS.CHART: {
      if (scene.data?.values) return scene.data;
      if (/heap|memory|ram|leak|allocat/i.test(text)) return {
        title: 'HEAP MEMORY GROWTH',
        type: 'bar',
        values: [20, 45, 72, 100],
        labels: ['Baseline', 'Retained', 'Pressure', 'Exhausted'],
        highlightIndex: 3,
        source: 'Qualitative mechanism illustration',
      };
      return {
        title: scene.text?.headline || 'NARRATED TREND',
        type: 'bar',
        values: [20, 45, 72, 100],
        labels: ['Start', 'Developing', 'High', 'Outcome'],
        highlightIndex: 3,
        source: 'Qualitative narration; not measured data',
      };
    }

    default:
      return scene.data || {};
  }
}
