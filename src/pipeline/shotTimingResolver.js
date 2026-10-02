const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function boundaryCandidates(words, sceneStart, sceneEnd) {
  return words.slice(1).map((word, index) => ({
    frame: clamp(word.startFrame - 2, sceneStart + 1, sceneEnd - 1),
    phrase: Boolean(words[index]?.endsPhrase),
    sentence: Boolean(words[index]?.endsSentence),
  }));
}

/**
 * Resolve authored shot hints to exact, gap-free frame ranges. Boundaries are
 * selected only from aligned word starts and favor phrase/sentence pauses.
 */
export function resolveShotTiming({ scene, shots, alignedWords, sceneStart, sceneEnd, fps }) {
  if (!shots?.length) throw new Error(`Scene ${scene.id} has no authored shots`);
  const totalFrames = Math.max(shots.length, sceneEnd - sceneStart);
  if (shots.length === 1) {
    return [{ storyboardShotId: shots[0].id, startFrame: sceneStart, endFrame: sceneEnd, durationInFrames: totalFrames, from: 0 }];
  }

  const hintTotal = shots.reduce((sum, shot) => sum + Math.max(0.1, shot.durationHint || 1), 0);
  const candidates = boundaryCandidates(alignedWords, sceneStart, sceneEnd);
  // Explainer shots must hold at least 1.8s (or proportional scene fraction) to avoid micro-cuts
  const isMontage = shots.some((s) => s.role === 'montage' || s.durationHint < 1.5);
  const targetMinSec = isMontage ? 0.8 : (scene.energy >= 4 ? 1.5 : 1.8);
  const minFrames = Math.max(12, Math.min(fps * targetMinSec, Math.floor(totalFrames / shots.length * 0.82)));
  const boundaries = [sceneStart];
  let cumulative = 0;

  for (let index = 1; index < shots.length; index++) {
    cumulative += Math.max(0.1, shots[index - 1].durationHint || 1);
    const ideal = sceneStart + totalFrames * cumulative / hintTotal;
    const earliest = boundaries[index - 1] + minFrames;
    const remaining = shots.length - index;
    const latest = sceneEnd - remaining * minFrames;
    const viable = candidates.filter((candidate) => candidate.frame >= earliest && candidate.frame <= latest);
    let selected = viable.sort((a, b) => {
      const score = (candidate) => Math.abs(candidate.frame - ideal)
        - (candidate.sentence ? fps * 0.55 : candidate.phrase ? fps * 0.32 : 0);
      return score(a) - score(b);
    })[0];
    if (!selected) {
      selected = [...candidates].sort((a, b) => Math.abs(a.frame - ideal) - Math.abs(b.frame - ideal))[0];
    }
    const frame = Math.round(clamp(selected?.frame ?? ideal, earliest, latest));
    boundaries.push(frame);
  }
  boundaries.push(sceneEnd);

  return shots.map((shot, index) => ({
    storyboardShotId: shot.id,
    startFrame: boundaries[index],
    endFrame: boundaries[index + 1],
    durationInFrames: boundaries[index + 1] - boundaries[index],
    from: boundaries[index] - sceneStart,
    changeReason: shot.changeReason || (index === 0 ? 'newIdea' : 'detail'),
  }));
}
