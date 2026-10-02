# Milestone 10 Visual Coverage Audit: Explanatory Representation Gap

**Date:** 2026-09-28  
**Scope:** Systematic visual coverage audit across the three core genre benchmark runs:
1. **Psychology / Behavioral Science:** *"Why Your Brain Chooses Instant Gratification"* (`video-2026-09-27T16-30-25`)
2. **Software / Tech Explainer:** *"How AI Coding Agents Work"* (`video-2026-09-27T15-00-36`)
3. **Business / Deep-Tech Documentary:** *"How ASML Dominates Global Chipmaking"* (`video-2026-09-27T12-58-07`)

---

## 1. Executive Summary

Milestones 1–9 solved editorial structure, duration budgeting, pacing, and audio mastering. However, an analysis of the rendered output reveals a profound explanatory deficiency:
> **The engine defaults to typography whenever concrete stock photography is missing.**

Instead of asking:
> *"What diagram, interface, code snippet, comparison, or data visualization would actually make the viewer understand this idea?"*

The system has asked:
> *"Can we find a Pexels photo for this noun? If not, recast to `StatementShot`."*

This failure is most catastrophic in technical and procedural topics:
- In **"How AI Coding Agents Work"**, **10 out of 17 scenes (59%)** collapsed into generic typographic statement cards. A video explaining repository parsing, tool calls, bash execution, context windows, and test recovery contained **zero lines of code, zero terminal windows, zero file trees, and zero architecture diagrams**.
- In **"Why Your Brain Chooses Instant Gratification"**, while real B-roll and charts improved the flow, scenes discussing cognitive competition and the marshmallow test fell back to single-word text cards ("Slower reason", "The marshmallow test", "brain") rather than node diagrams or visual metaphors.

---

## 2. Benchmark Scene-by-Scene Visual Coverage Audit

### Legend
- **DIRECT:** Visual directly demonstrates and explains the mechanism or entity discussed.
- **SUPPORTIVE:** Visual strongly reinforces the tone or secondary dimension.
- **GENERIC:** Generic stock media or high-level atmospheric backdrop.
- **WEAK:** Overly simplistic text card or minimally related asset.
- **MISLEADING:** Visual contradicts or confuses the spoken concept.

---

### Benchmark A: "How AI Coding Agents Work" (`video-2026-09-27T15-00-36`)

| Scene | Spoken Narration | Visual Intent | Selected Family | Rendered Representation | Coverage Quality | Fallback / Failure Reason |
|:---:|---|---|---|---|:---:|---|
| **s01** | *"You type a sentence, and a machine edits your codebase."* | subject | `statement:kinetic` | Large text: "One sentence, one edit" | **WEAK** | No stock image of a codebase edit $\rightarrow$ defaulted to text card. (Should show prompt input + git diff). |
| **s02** | *"That is an AI coding agent, and it is not just autocomplete."* | atmosphere | `image:full` | Stock photo of programmer typing | **GENERIC** | Stock photo conveys person at desk, but explains nothing about agents vs autocomplete. |
| **s03** | *"Autocomplete predicts next line; an agent owns the whole task."* | comparison | `compare:columns` | 2-column comparison card | **SUPPORTIVE** | Text comparison is clear, but lacks concrete code line vs multi-file task visual. |
| **s04** | *"At its core is a loop: the model reads, plans, calls a tool..."* | process | `process:flow` | 3-step procedural cards | **DIRECT** | Accurately maps the loop sequence. |
| **s05** | *"The model never touches your files directly."* | subject | `statement:words` | Large text: "never touches your files" | **WEAK** | Abstract negative claim collapsed to huge floating words. (Should show Agent $\rightarrow$ Tool Isolation boundary). |
| **s06** | *"It asks environment to run commands, and environment answers."* | subject | `statement:kinetic` | Large text: "TOOL CALL" | **WEAK** | Missed opportunity to show terminal execution / bash return block. |
| **s07** | *"Tools are simple: read file, search repo, write patch, run test."* | list | `list:ledger` | List card with 4 items | **SUPPORTIVE** | Readable list, but lacks actual tool schema/syntax appearance. |
| **s08** | *"Then it checks the result and decides what to do next."* | subject | `statement:highlight` | Text: "decides what to do next" | **WEAK** | Empty text screen held for 4.2 seconds. |
| **s09** | *"Loop makes agents feel less like chatbot, more like junior engineer."*| atmosphere | `image:full` | Stock photo of office workers | **GENERIC** | Vague corporate stock photo. |
| **s10** | *"But it only knows what context window can hold."* | subject | `image:split` | Stock photo of laptop | **GENERIC** | Laptop photo completely fails to explain token context limits. (Needs memory bar/token meter). |
| **s11** | *"Large codebases do not fit, so agent must retrieve right pieces."* | subject | `statement:words` | Text: "retrieve the right pieces" | **WEAK** | Third text card in four scenes. |
| **s12** | *"It searches by meaning, not just by filename."* | subject | `statement:kinetic` | Text: "Search by meaning" | **WEAK** | Fourth text card. (Should show embedding / semantic search tree). |
| **s13** | *"Every action it takes is logged, so you can audit whole run."* | subject | `statement:kinetic` | Text: "AUDIT TRAIL" | **WEAK** | Fifth text card. (Should show JSON event log / audit timeline). |
| **s14** | *"That is how it recovers from a failed test instead of giving up."* | subject | `statement:highlight` | Text: "recovers from a failed test" | **WEAK** | Sixth text card. (Should show red test $\rightarrow$ green test terminal transition!). |
| **s15** | *"So the real skill is no longer typing code."* | statement | `statement:kinetic` | Text: "Typing code" | **WEAK** | Seventh text card. |
| **s16** | *"It is specifying the task, and verifying the result."* | subject | `statement:kinetic` | Text: "Specify. Verify." | **WEAK** | Eighth text card. |
| **s17** | *"The agent writes code; you still own the decision."* | atmosphere | `image:full` | Stock photo of person with laptop | **GENERIC** | Final generic stock photo. |

**Audit Conclusion for Tech Explainer:**  
**59% text cards, 24% generic stock.** The video fails completely to look like a software engineering explainer.

---

### Benchmark B: "Why Your Brain Chooses Instant Gratification" (`video-2026-09-27T16-30-25`)

| Scene | Spoken Narration | Visual Intent | Selected Family | Rendered Representation | Coverage Quality | Fallback / Failure Reason |
|:---:|---|---|---|---|:---:|---|
| **s01** | Smartphone in hand ("Now or later?") | establish | `image:full` | Real B-roll of smartphone | **DIRECT** | Excellent hook visual grounding. |
| **s02** | Chronology: Day 1 $\rightarrow$ Year 1 $\rightarrow$ Year 10 | context | `timeline:default` | Timeline graphic | **DIRECT** | Clear habit formation chronology. |
| **s03** | Ancient wiring: Not a flaw | identify | `image:editorial` | Doctor with brain MRI scan | **SUPPORTIVE** | Authentic neuro-medical asset. |
| **s04** | Trigger $\rightarrow$ Limbic spike $\rightarrow$ Act now | explain | `process:flow` | 3-step neural sequence | **DIRECT** | Explanatory process flow. |
| **s05** | Slower reason | compare | `statement:kinetic` | Text: "Slower reason" | **WEAK** | Missed opportunity for dual-system relationship diagram. |
| **s06** | Limbic system vs Prefrontal cortex | compare | `compare:columns` | 2-column comparison | **DIRECT** | Effective functional contrast. |
| **s07** | Hyperbolic discounting: Value drops with delay | quantify | `chart:default` | Bar chart showing value decay | **DIRECT** | Strong quantitative evidence. |
| **s08** | The marshmallow test (Stanford 1972) | identify | `statement:highlight` | Text: "The marshmallow test" | **WEAK** | No image of experiment $\rightarrow$ defaulted to text card. (Needs experiment visual/diagram). |
| **s09** | Endless scroll, modern triggers | context | `image:full` | Real B-roll of phone desk | **DIRECT** | Grounded modern environment. |
| **s10** | Rewiring friction / attention | reveal | `statement:words` | Text: "brain" | **WEAK** | Weak closing resolution on a single isolated noun. |

---

### Benchmark C: "How ASML Dominates Global Chipmaking" (`video-2026-09-27T12-58-07`)

| Scene | Spoken Narration | Visual Intent | Selected Family | Rendered Representation | Coverage Quality | Fallback / Failure Reason |
|:---:|---|---|---|---|:---:|---|
| **s01-s02**| ASML EUV machine & 13.5nm physics | atmosphere/subject | `image:editorial` | Authentic cleanroom EUV photo | **DIRECT** | Excellent technical grounding. |
| **s03** | 50,000 droplets of molten tin vaporized by laser | process | `process:flow` | 3-stage process flow | **DIRECT** | Explains machine physics clearly. |
| **s04** | 13.5 nanometer wavelength | stat | `stat:hero` | Giant "13.5 nm" hero stat | **DIRECT** | Strong technical callout. |
| **s05** | Decades of research and billions invested | atmosphere | `statement:kinetic` | Text: "Decades of Doubt" | **WEAK** | Stock query for "decades" failed $\rightarrow$ fell back to text card. (Should be a timeline). |
| **s07** | $150M cost & 3 Boeing 747s to transport | stat | `stat:hero` | Stat card "$150M" | **DIRECT** | Effective scale communication. |
| **s08** | TSMC, Samsung, Intel depend on ASML | list | `list:ledger` | Customer supply list | **DIRECT** | Clean supply chain representation. |
| **s10-s11**| Monopolies & geopolitical export bans | subject | `image:full` | Cleanroom engineer | **SUPPORTIVE** | Authentic image, but misses geographic map of supply chain. |

---

## 3. Core Failure Mechanisms Identified

1. **The "No Media $\rightarrow$ Statement" Default:**
   In `src/pipeline/visualDirector.js`, `recast()` defaults almost every unfulfilled request to:
   ```javascript
   recastToTypography(spec, scene, 'no acceptable subject image');
   ```
   This treats typography as a bottomless wastebasket rather than an intentional design tool.
2. **Missing Primitives for Modern Topics:**
   - **No Code/Terminal Primitive:** Software topics cannot display code snippets, diffs, terminal outputs, or file trees.
   - **No Architecture/Node Diagram Primitive:** Systems with interrelated components (Agent $\rightarrow$ Tool $\rightarrow$ OS, or Limbic $\rightarrow$ Prefrontal) have no relational primitive.
   - **No Map/Geographic Primitive:** Supply chains, geopolitical tensions, and global distributions cannot show a simple world/regional map.
   - **No Semantic Compositions:** The engine cannot place an authentic screenshot or icon alongside a curve or callout tag.
3. **No Information-Type Classification:**
   The storyboard records generic `kind: "subject" | "atmosphere" | "process"`, but does not classify the **information structure** (`code`, `architecture`, `comparison`, `timeline`, `location`, `data`, `evidence`).
4. **Lack of Text Grounding & Safe Fitting:**
   On-screen typography frequently displays arbitrary isolated nouns ("brain", "TOOL CALL", "AUDIT TRAIL") with zero grounding to the actual sentence spoken.

---

## 4. Architectural Roadmap for Milestone 10

1. **`VisualCoveragePlan` Architecture (`src/storyboard/visualCoveragePlan.js`):**
   - Classifies each content beat into an `informationType`: `code`, `interface`, `process`, `comparison`, `timeline`, `relationship`, `data`, `location`, `evidence`, `entity`, `emphasis`.
   - Assigns a `primaryRepresentation` and deterministic `fallbackRepresentations` (e.g. `process` $\rightarrow$ `diagram` $\rightarrow$ `timeline` $\rightarrow$ `comparison`, NEVER `statement`).
2. **New Procedural Explanatory Visual Engines in Remotion:**
   - **`CodeShot` (`src/remotion/families/code.jsx`):** Syntax-highlighted code editor, terminal commands, test results, and file trees.
   - **`DiagramShot` (`src/remotion/families/diagram.jsx`):** Relational node graphs (nodes, edges, flows, groups) for architecture and cognitive systems.
   - **`MapShot` (`src/remotion/families/map.jsx`):** Clean SVG geopolitical/supply chain maps with highlighted hubs and flow arrows.
   - **`ProcessShot` & `ChartShot` Upgrades:** Multi-stage directional flows and animated single-takeaway graphs.
3. **Elimination of `recastToTypography`:**
   - Replace with semantic fallback routing. If media is missing for a software beat, route to `CodeShot` or `UiShot`. If missing for a location beat, route to `MapShot`.
4. **Perceptual Blank Frame & Content Coverage Scoring:**
   - Adds `visual-coverage-diagnostics.json` measuring `directCoverageCount`, `supportiveCoverageCount`, `weakCoverageCount`, and `perceptuallyBlankFrames`.
   - Timeline QC hard-failure if any production shot has `UNRESOLVED` coverage.
5. **A/B Regressions:**
   - Re-render **"How AI Coding Agents Work"** and **"Why Your Brain Chooses Instant Gratification"** to verify that software topics actually look like software and abstract topics actually visually explain.
