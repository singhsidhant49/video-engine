/**
 * Centralized Editorial Tokens
 * Milestone — Editorial Asset Intelligence & Final Media-Editor Hardening
 * 
 * Centralizes format safe margins, motion parameters, caption chunking/emphasis,
 * pacing rules, and quality gates out of scattered business logic.
 */

export const FormatTokens = Object.freeze({
  SHORTS: {
    width: 1080,
    height: 1920,
    orientation: 'portrait',
    aspectRatio: 9 / 16,
    safeMargins: {
      top: 220,      // Platform top UI (search, sounds, channel header)
      bottom: 360,   // Platform bottom UI (action bar, comments, scrubber)
      left: 72,      // Left edge safety buffer
      right: 140,    // Right interaction rail (like, comment, share buttons)
    },
    minMediaOccupancy: 0.58, // Minimum vertical occupancy before warning
    destructiveCropRatioThreshold: 0.55, // Warn/reject if >55% of width must be clipped
  },
  LANDSCAPE: {
    width: 1920,
    height: 1080,
    orientation: 'landscape',
    aspectRatio: 16 / 9,
    safeMargins: {
      top: 64,       // Clean broadcast top headroom
      bottom: 80,    // Standard bottom title/caption zone
      left: 96,      // Left margin
      right: 96,     // Right margin
    },
    minMediaOccupancy: 0.45,
    destructiveCropRatioThreshold: 0.60,
  },
});

export const MotionTokens = Object.freeze({
  STILL_CAMERA_MIN_SCALE: 1.00,
  STILL_CAMERA_MAX_SCALE: 1.05,
  DETAIL_CROP_MAX_SCALE: 1.12,
  FOCAL_PAN_MAX_DELTA: 0.035,
  MIN_HOLD_FOR_CAMERA_MOTION_SEC: 2.2, // Shots under 2.2s should remain STATIC
  CAMERA_REASONS: Object.freeze([
    'INTENSIFY_FOCUS',
    'REVEAL_CONTEXT',
    'MOVE_TO_DETAIL',
    'FOLLOW_SUBJECT',
    'REFRAME_FOR_CAPTION',
    'MATCH_NEXT_SHOT',
    'STATIC_HOLD',
  ]),
});

export const CaptionTokens = Object.freeze({
  LANDSCAPE: {
    minWords: 4,
    targetWords: 6,
    maxWords: 8,
    maxChars: 44,
    defaultEmphasis: 'NONE', // Professional landscape avoids mandatory active-word karaoke
    defaultStyle: 'CLEAN_TEXT',
    fontSize: 48,
  },
  SHORTS: {
    minWords: 2,
    targetWords: 3,
    maxWords: 5,
    maxChars: 24,
    defaultEmphasis: 'KEYWORD', // High-energy vertical punchy captions
    defaultStyle: 'COMPACT_CAPSULE',
    fontSize: 64,
  },
  EMPHASIS_MODES: Object.freeze(['NONE', 'KEYWORD', 'ACTIVE_WORD']),
  STYLES: Object.freeze(['CLEAN_TEXT', 'SOFT_SCRIM', 'COMPACT_CAPSULE']),
});

export const PacingTokens = Object.freeze({
  SHORTS: {
    minShotDurationSec: 1.8,
    idealShotDurationSec: 3.0,
    maxShotDurationSec: 5.0,
    staleHoldWarningSec: 5.5,
  },
  LANDSCAPE: {
    minShotDurationSec: 2.2,
    idealShotDurationSec: 4.0,
    maxShotDurationSec: 6.5,
    staleHoldWarningSec: 7.0,
  },
  MAX_RAPID_CUTS_WINDOW_10S: 5,
  MIN_READ_TIME_PER_WORD_SEC: 0.28,
});

export const QualityTokens = Object.freeze({
  MIN_CANDIDATE_POOL_SIZE: 8,
  TARGET_CANDIDATE_POOL_SIZE: 16,
  MAX_CONSECUTIVE_LAYERED_MEDIA: 1, // Warn on 2, reject/reselect on 3+
  MIN_SCORE_FOR_DIRECT_ACCEPT: 70,
  MIN_SCORE_FOR_CONTEXTUAL_ACCEPT: 60,
  EDITORIAL_MODES: Object.freeze([
    'DOCUMENTARY',
    'TECHNICAL_EXPLAINER',
    'STORY',
    'MOTIVATIONAL',
    'COMMENTARY',
    'TUTORIAL',
    'GENERAL',
  ]),
  VISUAL_ROLES: Object.freeze([
    'HOOK',
    'ESTABLISH',
    'CONTEXT',
    'ACTION',
    'DETAIL',
    'EVIDENCE',
    'CONSEQUENCE',
    'ATMOSPHERE',
    'TRANSITION',
    'PAYOFF',
  ]),
  MATCH_CLASSES: Object.freeze([
    'DIRECT',
    'CONTEXTUAL',
    'METAPHORICAL',
    'ACCIDENTAL',
    'WRONG',
  ]),
});
