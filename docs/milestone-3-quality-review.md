# Milestone 3 quality review

Date: 2026-09-27

## Outcome

Milestone 3 is accepted for storyboard-to-timeline execution. Canonical shots are visible, narration-aligned, traceable, and rendered as distinct presentation decisions. The result is materially better than scene-level hold splitting, but not uniformly documentary-grade because semantic asset selection and whole-video continuity are later milestones.

## Golden fixtures

All fixtures are deterministic 18-second, 1920×1080 H.264 renders with no generated assets.

| Fixture | Families | Result | Honest note |
| --- | --- | --- | --- |
| `evidence-rhythm` | montage, hero stat, statement | Strong hierarchy and escalation. | Uses repository-local acceptance media; it is not a search-quality test. |
| `explanation-flow` | document, process, timeline | Clear explanatory sequence and progressive disclosure. | Document treatment remains visibly constructed. |
| `editorial-contrast` | photo, ledger list, quote | Useful photographic/procedural contrast. | The list can feel template-like before all items arrive. |

Each fixture directory under `renders/golden/milestone-3/` contains its timeline, diagnostics, QC, frames, contact sheet, and MP4.

## Real 66.6-second validation

Run: `renders/runs/video-2026-09-27T11-48-05`

Output: `renders/video-2026-09-27T11-48-05-landscape.mp4`

Topic: *How Nvidia Built an Unstoppable AI Monopoly*

- 1920×1080 landscape, 30 fps, H.264 CRF 17, BT.709, 192 kbps audio.
- Rendered duration 66.69 seconds; timeline duration 66.63 seconds.
- 10 scenes, 23 canonical shots, 96% word alignment, and zero generated media.
- Four used asset records pass the current license gate.
- Blank-frame, frozen-clip, coverage, traceability, caption-order, and licensing checks pass.
- Media-shot asset reuse is 0%; the longest photo/montage run is two shots.
- Preflight and post-render contact sheets were generated and inspected.

Visual strengths: strong stat hierarchy, a legible CUDA process, coherent dark-green editorial styling, restrained cuts, caption yielding on primary graphics, and a memorable typographic payoff.

Observed issues and repairs:

- Inspection exposed an empty comparison frame after an internal cut. Reveal timing restarted too late. It was moved to frame two, variants now alternate deterministically, the preflight was re-inspected, and the MP4 was re-rendered.
- The ASML assets are verified and licensed but depict headquarters/freight rather than the requested lithography machine. Milestones 4–6 own semantic asset repair.
- An eight-shot structured run remains. Adjacent camera-move repetition is 64%, largely because non-photo graphics correctly use `static`; fake movement would not improve it. Continuity V2 should address medium rhythm.
- Some midpoints capture progressive graphics before all information has arrived. This is expected timing, though list/document styling retains a template signature.

## Scorecard

| Dimension | Score | Rationale |
| --- | ---: | --- |
| Storyboard fidelity | 9/10 | Exact count/order/IDs; no invented shots. |
| Timing and sync | 8/10 | Phrase-aware, gap-free, 96% aligned. |
| Hierarchy/readability | 8/10 | Strong core families and caption yielding. |
| Media semantics | 6/10 | Relevant context, but weak ASML concept match. |
| Rhythm/variation | 7/10 | 23 shots and no reuse; structured run remains. |
| Motion restraint | 8/10 | Subtle photos, static information graphics. |
| Overall | 8/10 | Materially better, inspectable execution with honest asset debt. |

## Validation

```text
npm test
npm run render:golden:m3
node scripts/previewRun.js renders/runs/video-2026-09-27T11-48-05 --at 0.5
npm run render:timeline -- renders/runs/video-2026-09-27T11-48-05
```

Final automated result: 15/15 tests passing.
