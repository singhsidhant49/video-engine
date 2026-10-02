import { flattenStoryboardScenes } from '../storyboard/storyboardDiagnostics.js';

/**
 * Transitional Milestone 2 adapter. It projects the canonical storyboard into
 * the legacy scene shape expected by asset/timeline code. Creative decisions
 * only flow from storyboard -> adapter; nothing is planned independently here.
 */
export function storyboardToExecutionPlan(contentPlan, storyboard) {
  const firstSceneBySection = new Set(storyboard.sections.slice(1).map((section) => section.scenes[0]?.id));
  const sectionByScene = new Map(storyboard.sections.flatMap((section) => section.scenes.map((scene) => [scene.id, section.id])));
  const sceneIdBySource = new Map();
  const scenes = flattenStoryboardScenes(storyboard).map((scene) => {
    for (const sourceId of scene.sourceSceneIds) sceneIdBySource.set(sourceId, scene.id);
    const source = scene.presentationSource || {};
    const entityName = scene.entities?.[0];
    return {
      id: scene.id,
      narration: scene.narration,
      purpose: scene.purpose,
      kind: source.kind || scene.preferredPresentation || 'subject',
      visual: scene.shots[0]?.visualConcept || source.visual || '',
      entity: source.entity || (entityName ? { name: entityName, wikipedia: entityName } : null),
      text: source.text || null,
      emphasis: source.emphasis || null,
      data: source.data || null,
      intensity: scene.energy,
      section: firstSceneBySection.has(scene.id),
      tone: source.tone || 'neutral',
      importance: scene.importance,
      shot: source.shot || 'medium',
      focus: source.focus || null,
      camera: source.camera || null,
      continuity: source.continuity || 'new',
      treatment: source.treatment || (['atmosphere', 'subject'].includes(source.kind) ? 'cinematic' : 'graphic'),
      template: source.template || null,
      visualIntent: scene.visualIntent,
      informationDensity: scene.informationDensity,
      evidenceRequirement: scene.evidenceRequirement,
      storyboardShots: scene.shots,
      sourceSceneIds: scene.sourceSceneIds,
      sectionId: sectionByScene.get(scene.id),
    };
  });

  const claims = (contentPlan?.claims || []).map((claim) => ({
    ...claim,
    scene_id: sceneIdBySource.get(claim.scene_id) || claim.scene_id,
  }));
  return {
    ...(contentPlan || {}),
    title: storyboard.title,
    topic: storyboard.topic,
    format: storyboard.format,
    style: storyboard.style || contentPlan?.style,
    hue: storyboard.hue ?? contentPlan?.hue,
    scenes,
    claims,
    script: scenes.map((scene) => scene.narration).join(' '),
    storyboardVersion: storyboard.version,
  };
}

export function storyboardSceneSeconds(storyboard) {
  return flattenStoryboardScenes(storyboard).map((scene) => scene.durationHint);
}
