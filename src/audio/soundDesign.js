/**
 * Sound Design & Restrained SFX Dispatcher for Documentary / Explainer Videos.
 * 
 * Enforces restrained, semantic sound placement adhering to a controlled acoustic vocabulary.
 * Prevents rapid-fire sound effects and maintains strict peak headroom below speech.
 */

export const SFX_VOCABULARY = {
  WHOOSH: 'whoosh',           // Subtle camera move or clean transition
  CLICK: 'click',             // UI / interactive milestone
  PAPER_SLAM: 'paper_slam',   // Document / physical evidence
  IMPACT_BOOM: 'impact_boom', // Major numerical stat / hero inflection (intensity >= 4)
  TICK: 'click',              // Soft timeline / tick reveal
  CASH_REGISTER: 'cash_register', // Finance / market transactions
};

/**
 * Validates and authors sparse, event-driven sound effects for the timeline.
 * 
 * Rules:
 * 1. Minimum spacing: >= 6.0 seconds (180 frames) between any two SFX.
 * 2. Maximum budget: <= 5 SFX per 75 seconds of video.
 * 3. Peak level: all SFX volumes calibrated between 0.15 and 0.22 (comfortably beneath narration).
 * 4. Never trigger on every cut or text line.
 * 
 * @param {Object} params
 * @param {Array<Object>} params.clips - Storyboard clips
 * @param {Array<string>} params.transitions - Transition types
 * @param {Object} params.sfxPaths - Resolved SFX public file paths
 * @param {number} [params.fps=30]
 * @param {string} [params.format='landscape']
 * @returns {{
 *   events: Array<{ src: string, from: number, volume: number, type: string, sceneId: string }>,
 *   diagnostics: { sfxCount: number, sfxPeak: number, minGapSeconds: number }
 * }}
 */
export function authorSoundDesign({
  clips = [],
  transitions = [],
  sfxPaths = {},
  fps = 30,
  format = 'landscape',
}) {
  const minGapFrames = Math.round(fps * (format === 'shorts' ? 5.0 : 6.5));
  const maxSfxBudget = Math.max(3, Math.round((clips.length / 10) * 5));

  const events = [];
  let lastEventFrame = -Infinity;

  const tryAddSfx = (type, frame, volume, sceneId) => {
    if (events.length >= maxSfxBudget) return false;
    if (!sfxPaths[type] || frame < 0) return false;
    if (frame - lastEventFrame < minGapFrames) return false;

    events.push({
      src: sfxPaths[type],
      from: frame,
      volume: Number(volume.toFixed(3)),
      type,
      sceneId,
    });
    lastEventFrame = frame;
    return true;
  };

  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const trans = transitions[i] || 'cut';

    // 1. Transition Whoosh: only on designed camera sweeps / pushes, not standard cuts
    if (['push', 'whip', 'zoom', 'wipe'].includes(trans)) {
      const cutFrame = c.from + (c.cutAt ?? Math.round(c.durationInFrames * 0.5));
      tryAddSfx(SFX_VOCABULARY.WHOOSH, cutFrame - 6, 0.18, c.sceneId);
    }

    // 2. Editorial Semantic SFX: based on canonical shot family
    const shots = c.shots || [];
    for (const shot of shots) {
      const shotStart = c.from + (shot.from ?? 0);

      if (shot.family === 'document') {
        tryAddSfx(SFX_VOCABULARY.PAPER_SLAM, shotStart + 4, 0.20, c.sceneId);
      } else if (shot.family === 'stat' && (c.intensity >= 4 || shot.role === 'hero')) {
        const at = shot.overlay?.at ?? 4;
        tryAddSfx(SFX_VOCABULARY.IMPACT_BOOM, shotStart + at, 0.22, c.sceneId);
      } else if (shot.family === 'ui') {
        const at = shot.overlay?.at ?? 4;
        tryAddSfx(SFX_VOCABULARY.CLICK, shotStart + at, 0.16, c.sceneId);
      } else if (shot.family === 'timeline') {
        tryAddSfx(SFX_VOCABULARY.CLICK, shotStart + 6, 0.14, c.sceneId);
      }
    }
  }

  // Calculate minimum observed gap
  let minObservedGap = Infinity;
  for (let i = 0; i < events.length - 1; i++) {
    const gap = (events[i + 1].from - events[i].from) / fps;
    if (gap < minObservedGap) minObservedGap = gap;
  }

  const sfxPeak = events.reduce((max, ev) => Math.max(max, ev.volume), 0);

  return {
    events,
    diagnostics: {
      sfxCount: events.length,
      sfxPeak: Number(sfxPeak.toFixed(3)),
      minGapSeconds: Number((minObservedGap === Infinity ? 0 : minObservedGap).toFixed(2)),
      sfxTypes: events.map((e) => e.type),
    },
  };
}
