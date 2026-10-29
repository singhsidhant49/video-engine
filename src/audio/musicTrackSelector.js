import { getAudioCatalog, getTracksForCategory, findTrackByNameOrId, DEFAULT_VOLUME_PROFILE } from './musicCatalog.js';

function hashString(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const CRIME_MYSTERY_REGEX = /\b(crime|murder|killer|detective|investigation|fraud|heist|mystery|fbi|cia|scandal|conspiracy|secrets?|cold\s+case)\b/i;

/**
 * Resolves the appropriate background music track for a video.
 *
 * @param {Object} options
 * @param {string} [options.contentType] - Canonical content type (meditation, documentary, explainer, motivational, audiobook, story)
 * @param {string} [options.style] - Directing style (e.g., investigative, cinematic_documentary, tech_editorial)
 * @param {string} [options.topic] - Video topic or prompt
 * @param {string} [options.videoId] - Unique video identifier for deterministic variety
 * @param {string} [options.requestedTrack] - Optional user-specified track name or ID
 * @param {Array} [options.catalog] - Optional custom or mock catalog
 * @returns {Object|null} Selected track metadata or null if no track available
 */
export function selectBackgroundMusic(options = {}, catalogArg = null) {
  const {
    contentType = 'explainer',
    style = 'editorial_explainer',
    topic = '',
    videoId = '',
    requestedTrack = null,
    catalog = catalogArg || options?.catalog || getAudioCatalog(),
  } = options || {};
  if (!catalog || !catalog.length) {
    return null;
  }

  // 1. Explicit user request override
  if (requestedTrack) {
    const matched = findTrackByNameOrId(requestedTrack, catalog);
    if (matched) {
      return {
        ...matched,
        selectedBy: 'user_override',
        synthetic: false,
      };
    }
  }

  // 2. Sub-genre routing: Investigative / Crime detection
  const isInvestigative = style === 'investigative' || CRIME_MYSTERY_REGEX.test(topic || '');
  if (isInvestigative) {
    const crimeTracks = getTracksForCategory('investigate_crime', catalog);
    if (crimeTracks.length > 0) {
      const idx = hashString(`${videoId}:${topic}:crime`) % crimeTracks.length;
      return {
        ...crimeTracks[idx],
        selectedBy: 'topic_subgenre_match',
        synthetic: false,
      };
    }
  }

  // 3. Match by canonical content type
  const normType = String(contentType || '').toLowerCase().trim();
  let candidateTracks = getTracksForCategory(normType, catalog);

  // If style hints educational and category is explainer, mix in education tracks
  if (normType === 'explainer' && (style === 'fast_educational' || /\b(learn|facts|how\s+it\s+works)\b/i.test(topic || ''))) {
    const eduTracks = getTracksForCategory('education', catalog);
    if (eduTracks.length > 0) {
      candidateTracks = [...candidateTracks, ...eduTracks];
    }
  }

  // 4. Deterministic variety rotation
  if (candidateTracks.length > 0) {
    const seed = `${videoId || 'vid'}:${topic || 'top'}:${normType}`;
    const idx = hashString(seed) % candidateTracks.length;
    return {
      ...candidateTracks[idx],
      selectedBy: 'content_type_rotation',
      synthetic: false,
    };
  }

  // 5. Broad fallback to first available track in catalog
  const fallbackTrack = catalog[hashString(videoId || topic) % catalog.length];
  return {
    ...fallbackTrack,
    selectedBy: 'global_catalog_fallback',
    synthetic: false,
  };
}
