# Milestone 13 — Diagram & Procedural Visuals Audit

## 1. Executive Summary

A comprehensive visual and architectural audit of the video generator's procedural visuals—specifically diagrams, process flows, comparisons, and structured graphics—was conducted across four recent production runs:
1. **Psychology Short (9:16)**: `video-2026-09-28T12-38-23` (*Why Your Brain Chooses Instant Gratification*)
2. **Psychology Landscape (16:9)**: `video-2026-09-28T09-30-31` (*Why Your Brain Chooses Instant Gratification*)
3. **AI Coding Agent (16:9)**: `video-2026-09-28T09-26-47` (*How AI Coding Agents Work*)
4. **ASML Monopoly (16:9)**: `video-2026-09-28T09-36-38` (*Why ASML is the World's Most Important Monopoly*)

### Core Architectural Findings:
1. **Single Naive Box-Arrow-Box Topology**:
   - `DiagramShot` in `src/remotion/families/diagrams.jsx` assumes every relationship is a strictly linear horizontal sequence `nodes[i] → nodes[i+1]`.
   - The `edges` data model (`from`, `to`, `label`) is completely ignored by the renderer. Cycles, loops, networks, hierarchies, bidirectional conflicts, and feedbacks cannot be rendered.
2. **Missing Format-Aware Compositions**:
   - In 9:16 vertical video, diagrams either flex-wrap into cramped staggered rows or stack as small desktop cards centered in an ocean of empty space (>65% dead canvas).
   - Labels and typography do not scale for mobile viewport legibility.
3. **Severe Frame-0 Incompleteness**:
   - Both `DiagramShot` and `CompareShot` initialize with `opacity: 0` for all core elements at frame 0, revealing only a small eyebrow/kicker. The screen appears dead/broken until progressive animations kick in.
4. **Desynchronized Animation Timing in Comparisons**:
   - In `CompareShot`, column entrance times are decoupled from scene length (`leftAt: 2`, `rightAt: 250`). In short clips, the opposing concept does not appear until 8.3s in, leaving one half of the screen blank for the majority of the shot.
5. **Repeated Background Aesthetics**:
   - `Ground` in `src/remotion/engine/imagery.jsx` unconditionally stamps a 54px technical grid and top-left radial glow across every procedural clip, causing visual monotony.
6. **Hardcoded Domain Data Pollution**:
   - When Creative QA repairs representation fatigue or synthesizes procedural data in `src/storyboard/visualCoveragePlan.js`, default mock schemas ("AGENT EXECUTION LOOP" and "src/agent.js") are injected into unrelated topics like ASML supply chains and psychology videos.

---

## 2. Weak Diagram Records

### Record 1: Neural Conflict Architecture (Psychology Short)
- **Scene ID**: `scene_002`
- **Shot ID**: `scene_002_shot_01` (Clip `c02`)
- **Run**: `video-2026-09-28T12-38-23`
- **Representation**: `diagram` (variant `nodes`)
- **Format**: `shorts` (9:16)
- **Semantic Purpose**: Explain the biological struggle between the impulsive Limbic System and the rational Prefrontal Cortex over immediate vs long-term decisions.
- **Current Layout**: Two horizontal rounded cards (`Limbic System` and `Prefrontal Cortex`) crammed side-by-side with a tiny dashed arrow connector.
- **Current Animation**: Sequential opacity slide-up (`progress(frame, at + i * 8, 14)`).
- **Specific Visual Problems**:
  - Occupies less than 30% of the vertical canvas; over 70% of screen is dead space.
  - Nodes look like cloud software microservices rather than biological/behavioral systems.
  - Opposing/conflict dynamic is completely missing; arrow simply points from Limbic to PFC as if one merely sends data to the other.
  - At frame 0, screen is completely empty except for a tiny kicker.
- **Recommended Semantic Grammar**: `RELATIONSHIP` or `COMPARISON` with opposing polar anchors, vertical duel layout, conflict tension badge, and decision outcome vector.

---

### Record 2: Dopamine Craving Loop (Psychology Short)
- **Scene ID**: `scene_003`
- **Shot ID**: `scene_003_shot_01` (Clip `c03`)
- **Run**: `video-2026-09-28T12-38-23`
- **Representation**: `process` (variant `flow`)
- **Format**: `shorts` (9:16)
- **Semantic Purpose**: Explain the self-reinforcing habit loop: Stimulus → Dopamine Release → Craving.
- **Current Layout**: Three vertical columns stacked in column layout, but with tiny text, thin progress lines, and washed-out opacity.
- **Current Animation**: Future stages dim to `0.35` opacity, waiting until frames 169 and 189 (5.6s - 6.3s into a 7s shot) to brighten.
- **Specific Visual Problems**:
  - The stages appear like a bulleted presentation slide.
  - Dimmed stages look faded and unreadable on phone screens.
  - The cyclical reinforcement (Craving drives future Stimulus response) is completely absent.
- **Recommended Semantic Grammar**: `CYCLE` grammar with a connected radial/orbital loop, continuous directional energy, high-contrast readable mobile typography, and frame-0 full-structure visibility.

---

### Record 3: Prefrontal Cortex vs Limbic System (Psychology Short)
- **Scene ID**: `scene_004`
- **Shot ID**: `scene_004_shot_01` (Clip `c04`)
- **Run**: `video-2026-09-28T12-38-23`
- **Representation**: `compare` (variant `columns`)
- **Format**: `shorts` (9:16)
- **Semantic Purpose**: Contrast rational, deliberate long-term planning against fast, emotional immediate gratification.
- **Current Layout**: Top/bottom column layout with bullet points (`—` and `✦`).
- **Current Animation**: `leftAt: 2`, `rightAt: 250`.
- **Specific Visual Problems**:
  - For the first 8.3 seconds (250 frames), only the top element is visible; bottom half is totally black.
  - Presentation looks like a two-box spreadsheet column comparison rather than a dynamic editorial contrast.
  - Eyebrows and body text are too small for 9:16 vertical viewports.
- **Recommended Semantic Grammar**: `COMPARISON` with unified frame-0 structure, split-screen or top/bottom dual-gauge contrast, large mobile-first typographic scales, and synchronized progressive reveal (within 300–450ms).

---

### Record 4: Neural Conflict in Landscape (Psychology Landscape)
- **Scene ID**: `scene_005` & `scene_010`
- **Shot ID**: `scene_005_shot_01` (Clip `c05`) & `scene_010_shot_01` (Clip `c10`)
- **Run**: `video-2026-09-28T09-30-31`
- **Representation**: `diagram` (variants `nodes` and `workspace`)
- **Format**: `landscape` (16:9)
- **Semantic Purpose**: Visualizing neural decision architecture.
- **Current Layout**:
  - `c05`: Small cards floating in the center of 1920x1080 canvas surrounded by massive black void.
  - `c10`: IDE workspace with file tree and git diff status (domain pollution).
- **Current Animation**: Independent card fades; no relational motion.
- **Specific Visual Problems**:
  - In landscape, horizontal canvas is wasted; small boxes cluster in center.
  - `c10` renders a software coding IDE in a neuroscience explainer.
  - Thin 1px borders and repetitive technical grid background feel like a developer tool documentation site.
- **Recommended Semantic Grammar**: `SYSTEM_ARCHITECTURE` / `RELATIONSHIP` using wide horizontal staging, primary vs secondary hierarchy, clean architectural bus connectors, and content-grounded neural nodes.

---

### Record 5: AI Coding Agent Execution Loop (AI Coding Agent)
- **Scene ID**: `scene_012`
- **Shot ID**: `scene_012_shot_01` (Clip `c12`)
- **Run**: `video-2026-09-28T09-26-47`
- **Representation**: `diagram` (variant `nodes`)
- **Format**: `landscape` (16:9)
- **Semantic Purpose**: Explain how an agent moves in a closed loop: Planner → Tool Dispatcher → Sandbox Environment → Observation Feedback.
- **Current Layout**: 4 boxes in a horizontal row: `AI Agent → Tool Dispatcher → Environment → Observation`.
- **Current Animation**: Linear staggered fade-in.
- **Specific Visual Problems**:
  - The crucial feedback edge (`Observation → AI Agent`) is completely missing because the renderer only connects adjacent index neighbors.
  - Does not look like a loop; looks like a dead-end linear pipeline.
  - Small labels in boxes with excessive padding.
- **Recommended Semantic Grammar**: `PIPELINE` with explicit loopback connector (`Observation ↪ Agent`), or circular `CYCLE` flow with active execution pulse.

---

### Record 6: Geopolitical Supply Chain & Export Controls (ASML)
- **Scene ID**: `scene_011` & `scene_012`
- **Shot ID**: `scene_011_shot_01` (Clip `c11`) & `scene_012_shot_01` (Clip `c12`)
- **Run**: `video-2026-09-28T09-36-38`
- **Representation**: `diagram` (variant `nodes` and `workspace`)
- **Format**: `landscape` (16:9)
- **Semantic Purpose**: Illustrate geopolitical chokepoints and export control restrictions between ASML, TSMC, and global superpowers.
- **Current Layout**: Repaired shots were injected with the hardcoded "AGENT EXECUTION LOOP" nodes (AI Agent, Tool Dispatcher, etc.) instead of semiconductor supply chain entities.
- **Current Animation**: Generic fade in.
- **Specific Visual Problems**:
  - Catastrophic domain semantic failure: semiconductor export controls rendered as software agent tools.
  - Same dark green grid background repeated for the 4th time in the video.
- **Recommended Semantic Grammar**: `NETWORK` / `SYSTEM_ARCHITECTURE` with genuine supply-chain hierarchy (ASML at center/root, TSMC as fab choke, US/EU/Asia as consumer nodes) with controlled editorial background.

---

## 3. Comprehensive Grammar Matrix & Action Plan

| Grammar | Core Meaning | Min/Max Nodes | Landscape Layout | Vertical Layout | Connector System | Animation Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FLOW** / **CAUSE_EFFECT** | Direct causal chain | 2–5 | Horizontal track with bold causality vectors | Vertical cascade with downward gravity | Direct arrowhead with causality tag | Causal pulse propagation |
| **CYCLE** | Self-reinforcing closed loop | 3–6 | Circular orbital / rounded diamond | Elliptical vertical loop utilizing height | Curved continuous directional arcs | Orbit sweep + node activation |
| **COMPARISON** | Direct opposition / contrast | 2 entities | Symmetrical left vs right with central divider | Top vs bottom with central collision/vs badge | Opposing arrows or tension line | Simultaneous entrance + comparative highlight |
| **RELATIONSHIP** | Interaction / conflict / balance | 2–4 | Dual polar systems with central battleground | Stacked polar systems with vertical tension vector | Bidirectional clash / connector | Opposing approach + central clash |
| **HIERARCHY** / **STACK** | Tree, layers, dependencies | 3–6 | Multi-tier horizontal tree with clean roots | Vertical stacked layers with boundary brackets | Clean orthogonal branching rules | Top-down / bottom-up structural build |
| **PIPELINE** | Multi-stage processor with loopback | 3–5 | Horizontal assembly line with return conduit | Vertical staggered pipeline with return conduit | Orthogonal bus with feedback loop | Stage-by-stage progressive pulse |
| **NETWORK** | Hub & satellite dependencies | 3–7 | Radial hub with satellite nodes | Centered master node with stacked satellites | Radiating spokes with directional arrows | Center ignition outward to perimeter |
| **FUNNEL** | Conversion / filtering stages | 3–5 | Horizontal tapered funnel stages | Inverted trapezoid vertical stack | Stage-to-stage restriction guides | Fluid downward progression |
| **SYSTEM_ARCHITECTURE** | Technical components & bus | 3–6 | Architectural grid with clear bus connectors | Vertical bus with modular attachments | Formal orthogonal wiring | Component scan + active data flow |
