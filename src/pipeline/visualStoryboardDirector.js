import { StoryboardSchema } from '../models/storyboard.schema.js';
import { analyzeEditorialScenes } from '../storyboard/editorialAnalysis.js';
import { authorShots } from '../storyboard/shotPlanner.js';

function primaryPresentation(scene) {
  const sources = scene.sourceScenes;
  const ranked = [...sources].sort((a, b) => (b.importance || b.intensity || 3) - (a.importance || a.intensity || 3));
  return ranked[0] || sources[0];
}

function toCanonicalScene(editorialScene, strategy, topic) {
  const primary = primaryPresentation(editorialScene);
  const scene = {
    id: editorialScene.id,
    sourceSceneIds: editorialScene.sourceSceneIds,
    narration: editorialScene.narration,
    scriptRange: editorialScene.scriptRange,
    durationHint: editorialScene.durationHint,
    purpose: editorialScene.purpose,
    visualIntent: editorialScene.visualIntent,
    importance: editorialScene.importance,
    energy: editorialScene.energy,
    informationDensity: editorialScene.informationDensity,
    preferredPresentation: primary.kind || 'subject',
    evidenceRequirement: editorialScene.evidenceRequirement,
    entities: editorialScene.entities,
    presentationSource: {
      kind: primary.kind || 'subject',
      visual: primary.visual || '',
      entity: primary.entity || null,
      text: primary.text || null,
      emphasis: primary.emphasis || null,
      data: primary.data || null,
      tone: primary.tone || 'neutral',
      shot: primary.shot || 'medium',
      focus: primary.focus || null,
      camera: primary.camera || null,
      continuity: primary.continuity || 'new',
      treatment: primary.treatment || null,
      template: primary.template || null,
    },
    sourceScenes: editorialScene.sourceScenes,
    startsSection: editorialScene.startsSection,
  };
  scene.shots = authorShots(scene, strategy, topic);
  return scene;
}

function buildSections(scenes) {
  const sections = [];
  for (const scene of scenes) {
    const begins = !sections.length || scene.startsSection || scene.purpose === 'transition';
    if (begins) {
      sections.push({
        id: `section_${String(sections.length + 1).padStart(2, '0')}`,
        purpose: scene.purpose,
        energy: scene.energy,
        scenes: [scene],
      });
    } else {
      const section = sections[sections.length - 1];
      section.scenes.push(scene);
      section.energy = Math.round(section.scenes.reduce((sum, item) => sum + item.energy, 0) / section.scenes.length);
    }
  }
  return sections;
}

/**
 * Authoritative creative transformation: normalized content plan -> editorial
 * analysis -> canonical sections/scenes/shots. No provider or frame decisions
 * are made here.
 */
export function buildStoryboard(plan, {
  format = 'landscape', sceneSeconds = [], videoId = 'unassigned', visualStrategy, visualPolicy,
} = {}) {
  const strategy = {
    ...visualStrategy,
    useMediaEditorial: visualPolicy ? visualPolicy.useMediaEditorial : (visualStrategy?.useMediaEditorial ?? true),
    format,
  };
  const editorialScenes = analyzeEditorialScenes(plan, { sceneSeconds });
  const scenes = editorialScenes.map((scene) => toCanonicalScene(scene, strategy, plan.topic));
  const sections = buildSections(scenes);
  const storyboard = {
    version: 2,
    videoId,
    title: plan.title,
    topic: plan.topic,
    format,
    style: plan.style,
    hue: plan.hue,
    visualStrategy,
    sections,
    // Deprecated compatibility view. It is derived from canonical sections and
    // must never be consumed as an independent creative plan.
    beats: sections.map((section) => ({
      beatId: section.id,
      purpose: section.purpose,
      scenes: section.scenes,
    })),
  };
  return StoryboardSchema.parse(storyboard);
}
