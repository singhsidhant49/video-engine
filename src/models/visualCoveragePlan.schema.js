import { z } from 'zod';

export const InformationTypeSchema = z.enum([
  'code', 'interface', 'process', 'comparison', 'relationship', 'timeline',
  'location', 'data', 'evidence', 'entity', 'emotion', 'atmosphere', 'emphasis',
]);

export const VisualRepresentationSchema = z.enum([
  'media', 'code', 'ui', 'process', 'diagram', 'comparison', 'timeline',
  'map', 'chart', 'document', 'typography',
]);

export const VisualCoverageItemSchema = z.object({
  shotId: z.string().min(1),
  sceneId: z.string().min(1),
  sectionId: z.string().min(1),
  informationType: InformationTypeSchema,
  primaryRepresentation: VisualRepresentationSchema,
  fallbackRepresentations: z.array(VisualRepresentationSchema),
  semanticPayload: z.object({
    communicationObjective: z.string(),
    visualConcept: z.string(),
    entities: z.array(z.string()),
    role: z.string(),
  }),
  evidenceRequirements: z.object({
    level: z.enum(['required', 'preferred', 'conceptual_allowed']),
    authenticSourceRequired: z.boolean(),
  }),
  mediaConstraints: z.object({
    preference: z.enum(['real', 'procedural', 'auto']),
    orientation: z.enum(['portrait', 'landscape']),
    focalPointHint: z.string().nullable(),
    motionPreference: z.string().nullable(),
  }),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
  coverageStatus: z.enum(['UNRESOLVED', 'DIRECT', 'SUPPORTIVE', 'WEAK']).default('UNRESOLVED'),
});

export const VisualCoveragePlanSchema = z.array(VisualCoverageItemSchema);

