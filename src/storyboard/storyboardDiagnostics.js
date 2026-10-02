export const flattenStoryboardScenes = (storyboard) => storyboard.sections.flatMap((section) => section.scenes);

export function buildStoryboardDiagnostics(storyboard) {
  const scenes = flattenStoryboardScenes(storyboard);
  const shots = scenes.flatMap((scene) => scene.shots);
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const distribution = (values) => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
  return {
    sectionCount: storyboard.sections.length,
    sceneCount: scenes.length,
    shotCount: shots.length,
    averageShotsPerScene: Number((shots.length / Math.max(1, scenes.length)).toFixed(2)),
    averageSceneDuration: Number((sum(scenes.map((scene) => scene.durationHint)) / Math.max(1, scenes.length)).toFixed(2)),
    averageShotDurationHint: Number((sum(shots.map((shot) => shot.durationHint)) / Math.max(1, shots.length)).toFixed(2)),
    purposeDistribution: distribution(scenes.map((scene) => scene.purpose)),
    visualIntentDistribution: distribution(scenes.map((scene) => scene.visualIntent)),
    mediaPreferenceDistribution: distribution(shots.map((shot) => shot.mediaPreference)),
  };
}

export function printStoryboardDiagnostics(diagnostics) {
  console.log(`   Storyboard: ${diagnostics.sectionCount} sections · ${diagnostics.sceneCount} scenes · ${diagnostics.shotCount} shots`);
  console.log(`   Averages: ${diagnostics.averageShotsPerScene} shots/scene · ${diagnostics.averageSceneDuration}s/scene · ${diagnostics.averageShotDurationHint}s/shot`);
  console.log(`   Purposes: ${JSON.stringify(diagnostics.purposeDistribution)}`);
  console.log(`   Visual intents: ${JSON.stringify(diagnostics.visualIntentDistribution)}`);
  console.log(`   Media preferences: ${JSON.stringify(diagnostics.mediaPreferenceDistribution)}`);
}
