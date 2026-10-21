import { SceneCompositionSchema } from '../models/sceneComposition.schema.js';

export function createSceneComposition(input) {
  const parsed = SceneCompositionSchema.parse(input);
  const ids = new Set(parsed.elements.map((element) => element.id));
  if (ids.size !== parsed.elements.length) throw new Error(`SceneComposition ${parsed.shotId} contains duplicate element IDs`);
  for (const id of parsed.readingOrder) if (!ids.has(id)) throw new Error(`Reading-order element ${id} is absent`);
  for (const relationship of parsed.relationships) {
    if (!ids.has(relationship.from) || !ids.has(relationship.to)) {
      throw new Error(`Relationship ${relationship.from} -> ${relationship.to} references an absent element`);
    }
  }
  return parsed;
}

export function sceneElementMap(composition) {
  return new Map(composition.elements.map((element) => [element.id, element]));
}

