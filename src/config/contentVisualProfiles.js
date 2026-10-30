const PROFILES = Object.freeze({
  documentary: {
    id: 'documentary', authenticMediaPriority: true, maxImageShare: 0.88,
    minVideoShare: 0, minStructuredShare: 0, maxPhotoRun: 10,
    dissolveShare: { min: 0.15, target: 0.22, max: 0.30 },
    videoRoles: new Set(['action', 'transition', 'atmosphere']),
  },
  explainer: {
    id: 'explainer', authenticMediaPriority: true, maxImageShare: 0.85,
    minVideoShare: 0, minStructuredShare: 0, maxPhotoRun: 7,
    dissolveShare: { min: 0.04, target: 0.09, max: 0.15 },
    videoRoles: new Set(['action', 'transition']),
  },
  motivational: {
    id: 'motivational', authenticMediaPriority: true, maxImageShare: 0.48,
    minVideoShare: 0.50, minStructuredShare: 0, maxPhotoRun: 4,
    dissolveShare: { min: 0, target: 0.05, max: 0.10 },
    videoRoles: new Set(['hook', 'action', 'transition', 'atmosphere', 'payoff', 'establishing']),
  },
  meditation: {
    id: 'meditation', authenticMediaPriority: true, maxImageShare: 0.30,
    minVideoShare: 0.65, minStructuredShare: 0, maxPhotoRun: 3,
    dissolveShare: { min: 0.45, target: 0.65, max: 0.90 },
    videoRoles: new Set(['hook', 'action', 'transition', 'atmosphere', 'payoff', 'establishing', 'subject', 'detail']),
  },
  story: {
    id: 'story', authenticMediaPriority: true, maxImageShare: 0.82,
    minVideoShare: 0, minStructuredShare: 0, maxPhotoRun: 8,
    dissolveShare: { min: 0.15, target: 0.24, max: 0.34 },
    videoRoles: new Set(['action', 'transition', 'atmosphere']),
  },
  audiobook: {
    id: 'audiobook', authenticMediaPriority: true, maxImageShare: 0.90,
    minVideoShare: 0, minStructuredShare: 0, maxPhotoRun: 10,
    dissolveShare: { min: 0.18, target: 0.28, max: 0.40 },
    videoRoles: new Set(['action', 'transition', 'atmosphere']),
  },
});

export function normalizeContentType(value = 'explainer') {
  const normalized = String(value || 'explainer').trim().toLowerCase();
  if (normalized === 'investigative') return 'documentary';
  if (normalized === 'educational' || normalized === 'tutorial') return 'explainer';
  return PROFILES[normalized] ? normalized : 'explainer';
}

export function getContentVisualProfile(contentType = 'explainer') {
  return PROFILES[normalizeContentType(contentType)];
}

export function requiresNativeMotion({ contentType = 'explainer', shot = {} } = {}) {
  const profile = getContentVisualProfile(contentType);
  const role = String(shot.role || '').toLowerCase();
  const intent = String(shot.assetIntent || '').toLowerCase();
  if (shot.mediaPreference === 'video' || ['active', 'energetic'].includes(shot.motionPreference)) return true;
  return profile.videoRoles.has(role) || profile.videoRoles.has(intent);
}

