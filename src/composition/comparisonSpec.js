import { ComparisonSpecSchema } from '../models/comparisonSpec.schema.js';
import { createSemanticTextVariants } from './semanticText.js';

const cleanId = (value, fallback) => String(value || fallback).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || fallback;

export function normalizeComparisonSpec({ editorialPlan, overlay = {} }) {
  const left = overlay.left || overlay.subjectA || {};
  const right = overlay.right || overlay.subjectB || {};
  const labelA = left.title || left.label || 'Option A';
  const labelB = right.title || right.label || 'Option B';
  const descriptionA = left.detail || left.desc || left.description || '';
  const descriptionB = right.detail || right.desc || right.description || '';
  const type = overlay.comparisonType || (/before|old/i.test(labelA) && /after|new/i.test(labelB) ? 'before_after'
    : left.value != null || right.value != null ? 'quantitative' : 'conceptual');
  const keyDifference = overlay.keyDifference || overlay.conclusion || `${labelA} versus ${labelB}`;
  return ComparisonSpecSchema.parse({
    version: 1,
    shotId: editorialPlan.shotId,
    objective: editorialPlan.communicationObjective || `Show the meaningful distinction between ${labelA} and ${labelB}`,
    comparisonType: type,
    subjectA: {
      id: cleanId(left.id || labelA, 'subject_a'), label: labelA, description: descriptionA,
      metricLabel: left.metricLabel || null, metricValue: left.metricValue != null ? String(left.metricValue) : left.value != null ? String(left.value) : null,
      textVariants: left.textVariants || createSemanticTextVariants(descriptionA || labelA, { labelOnly: labelA }),
    },
    subjectB: {
      id: cleanId(right.id || labelB, 'subject_b'), label: labelB, description: descriptionB,
      metricLabel: right.metricLabel || null, metricValue: right.metricValue != null ? String(right.metricValue) : right.value != null ? String(right.value) : null,
      textVariants: right.textVariants || createSemanticTextVariants(descriptionB || labelB, { labelOnly: labelB }),
    },
    dimensions: (overlay.dimensions || []).slice(0, 4).map((dimension, index) => ({
      id: cleanId(dimension.id || dimension.label, `dimension_${index + 1}`), label: dimension.label || `Dimension ${index + 1}`,
      valueA: String(dimension.valueA ?? dimension.left ?? ''), valueB: String(dimension.valueB ?? dimension.right ?? ''), importance: dimension.importance || 'secondary',
    })),
    keyDifference,
    keyDifferenceVariants: overlay.keyDifferenceVariants || createSemanticTextVariants(keyDifference),
    emphasizedSide: overlay.emphasizedSide || 'BALANCED', conclusion: overlay.conclusion || null,
    grammar: overlay.grammar && overlay.grammar !== 'COMPARISON' ? overlay.grammar : null,
  });
}

export function selectComparisonGrammar(spec, format) {
  if (format === 'shorts') return spec.comparisonType === 'before_after' ? 'STACKED_VERTICAL' : 'STACKED_VERTICAL';
  if (spec.grammar) return spec.grammar;
  if (spec.comparisonType === 'before_after') return 'BEFORE_AFTER';
  if (spec.comparisonType === 'quantitative' && spec.subjectA.metricValue && spec.subjectB.metricValue) return 'DELTA_COMPARISON';
  if (spec.comparisonType === 'tradeoff') return 'SPECTRUM';
  const unequal = Math.abs(spec.subjectA.description.length - spec.subjectB.description.length) > 36;
  return unequal ? 'TWO_COLUMN_EDITORIAL' : 'DUAL_FIELD';
}

