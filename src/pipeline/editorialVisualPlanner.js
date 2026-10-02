const FAMILY_TO_REPRESENTATION = {
  image: 'media', montage: 'media', code: 'code', ui: 'ui', process: 'process',
  diagram: 'diagram', compare: 'comparison', timeline: 'timeline', map: 'map',
  chart: 'chart', stat: 'chart', document: 'document', statement: 'typography',
  chapter: 'typography', quote: 'typography', list: 'diagram', ground: 'typography',
};

function hierarchyFor(scene, shot, representation) {
  const data = scene.data || {};
  const steps = Array.isArray(data.steps) ? data.steps : [];
  if (representation === 'comparison') return {
    primary: [data.left?.title || data.subjectA?.title, data.right?.title || data.subjectB?.title].filter(Boolean),
    secondary: [data.left?.detail || data.left?.description, data.right?.detail || data.right?.description, data.keyDifference || data.conclusion].filter(Boolean),
    supporting: (data.dimensions || []).map((item) => item.label).filter(Boolean),
  };
  if (representation === 'chart') return {
    primary: [data.takeaway, scene.text?.headline].filter(Boolean),
    secondary: [data.title, data.question, ...(data.labels || [])].filter(Boolean),
    supporting: [typeof data.source === 'string' ? data.source : data.source?.name, data.units].filter(Boolean),
  };
  return {
    primary: steps.map((step) => step.title || step.label).filter(Boolean),
    secondary: steps.map((step) => step.detail || step.desc).filter(Boolean),
    supporting: [scene.text?.kicker, scene.text?.headline].filter(Boolean),
  };
}

export function buildEditorialVisualPlan({ storyboard, coveragePlan, specs = [], assets = {}, format = storyboard.format, visualPolicy = null }) {
  const specByScene = new Map(specs.map((spec) => [spec.sceneId, spec]));
  const scenes = storyboard.sections.flatMap((section) => section.scenes.map((scene) => ({ scene, sectionId: section.id })));
  const coverageByShot = new Map(coveragePlan.map((item) => [item.shotId, item]));
  const result = [];

  for (const { scene, sectionId } of scenes) {
    const spec = specByScene.get(scene.id);
    for (const shot of scene.shots) {
      const coverage = coverageByShot.get(shot.id);
      if (!coverage) throw new Error(`EditorialVisualPlan missing coverage for ${shot.id}`);
      const selectedRepresentation = visualPolicy?.useMediaEditorial ? 'media' : coverage.primaryRepresentation;
      const priorRepresentation = FAMILY_TO_REPRESENTATION[spec?.family] || selectedRepresentation;
      const override = priorRepresentation !== selectedRepresentation ? {
        originalRepresentation: priorRepresentation,
        selectedRepresentation,
        reason: `Coverage authority replaced legacy family "${spec?.family}" with "${selectedRepresentation}".`,
      } : null;
      result.push({
        shotId: shot.id,
        sceneId: scene.id,
        sectionId,
        selectedRepresentation,
        representationOverride: override,
        communicationObjective: coverage.semanticPayload.communicationObjective,
        hierarchy: hierarchyFor(scene.presentationSource || scene, shot, selectedRepresentation),
        density: scene.informationDensity >= 4 ? 'HIGH' : scene.informationDensity <= 2 ? 'LOW' : 'MEDIUM',
        cognitiveLoad: scene.informationDensity || 3,
        visualGrammar: selectedRepresentation === 'process' ? 'directed-flow' : selectedRepresentation === 'media' ? 'media-editorial' : selectedRepresentation,
        assetBindings: Object.values(assets[scene.id]?.byShot || {}).filter((asset) => asset.storyboardShotId === shot.id).map((asset) => asset.src),
        textBlocks: {
          title: scene.presentationSource?.text?.kicker || scene.presentationSource?.text?.headline
            || scene.presentationSource?.data?.title
            || (selectedRepresentation === 'comparison' ? 'COMPARISON' : selectedRepresentation === 'chart' ? 'CHART' : 'PROCESS'),
          steps: scene.presentationSource?.data?.steps || [],
          takeaway: scene.presentationSource?.data?.takeaway || scene.presentationSource?.data?.conclusion || null,
        },
        semanticEvents: [],
        formatHints: {
          format,
          preferredTopology: format === 'shorts' ? 'vertical' : 'horizontal',
          maximumVisibleStages: format === 'shorts' ? 4 : 6,
        },
        continuityIntent: {
          treatment: spec?.treatment || scene.presentationSource?.treatment || 'graphic',
          priorFamilyAvoidance: true,
        },
        coverage,
      });
    }
  }
  return result;
}

export function representationForFamily(family) {
  return FAMILY_TO_REPRESENTATION[family] || null;
}
