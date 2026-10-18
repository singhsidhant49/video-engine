const words = (text) => String(text || '').split(/\s+/).filter(Boolean);

function measuredSceneDurations(scenes, alignedWords) {
  let cursor = 0;
  return scenes.map((scene) => {
    const count = Math.max(1, words(scene.narration).length);
    const start = alignedWords[Math.min(cursor, alignedWords.length - 1)]?.start || 0;
    const endIndex = Math.min(alignedWords.length - 1, cursor + count - 1);
    const end = alignedWords[endIndex]?.end ?? start;
    cursor += count;
    return Math.max(0.1, end - start);
  });
}

function mergeScenes(left, right) {
  const payoff = ['payoff', 'conclusion', 'reveal'].includes(String(right.purpose || '').toLowerCase());
  return {
    ...left,
    narration: `${String(left.narration || '').trim()} ${String(right.narration || '').trim()}`.trim(),
    purpose: payoff ? right.purpose : left.purpose,
    contentBeat: payoff ? right.contentBeat : left.contentBeat,
    imageQueries: [...new Set([...(left.imageQueries || []), ...(right.imageQueries || [])])].slice(0, 3),
    source: left.source || right.source || null,
    emphasis: left.emphasis || right.emphasis || null,
    section: Boolean(left.section),
    startsSection: Boolean(left.startsSection),
    mergedSceneIds: [...(left.mergedSceneIds || [left.id]), ...(right.mergedSceneIds || [right.id])],
  };
}

/** Merge narration beats that are too short for the selected pacing profile.
 * Spoken words stay identical; only visual scene boundaries are consolidated. */
export function consolidatePlanForPacing(plan, alignedWords = [], pacing = {}) {
  const minimum = Number(pacing.minimumShotSeconds || 0);
  if (!minimum || !alignedWords.length || (plan.scenes || []).length < 2) return { plan, merged: [] };
  const floor = minimum * 0.72;
  const scenes = structuredClone(plan.scenes || []);
  const merged = [];
  let changed = true;
  while (changed && scenes.length > 2) {
    changed = false;
    const durations = measuredSceneDurations(scenes, alignedWords);
    const index = durations.findIndex((duration) => duration < floor);
    if (index < 0) break;
    let leftIndex;
    if (index === 0 || scenes[index].section || scenes[index].startsSection) leftIndex = index;
    else if (index === scenes.length - 1 || scenes[index + 1]?.section || scenes[index + 1]?.startsSection) leftIndex = index - 1;
    else leftIndex = durations[index - 1] <= durations[index + 1] ? index - 1 : index;
    const left = scenes[leftIndex];
    const right = scenes[leftIndex + 1];
    if (!left || !right) break;
    scenes.splice(leftIndex, 2, mergeScenes(left, right));
    merged.push({ keptSceneId: left.id, mergedSceneId: right.id, reason: 'profile_minimum_hold' });
    changed = true;
  }
  if (!merged.length) return { plan, merged };
  return {
    plan: { ...plan, scenes, script: scenes.map((scene) => scene.narration).join(' '), pacingConsolidation: { version: 1, merged } },
    merged,
  };
}
