import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

export const CATEGORY_VOLUME_PROFILES = {
  meditation: { baseVolume: 0.22, duckedVolume: 0.08, label: 'Meditation & Ambient' },
  documentary: { baseVolume: 0.18, duckedVolume: 0.05, label: 'Documentary & History' },
  documenty: { baseVolume: 0.18, duckedVolume: 0.05, label: 'Documentary & History' },
  investigate_crime: { baseVolume: 0.18, duckedVolume: 0.05, label: 'Crime & Investigation' },
  explainer: { baseVolume: 0.15, duckedVolume: 0.04, label: 'Explainer & Tech' },
  education: { baseVolume: 0.16, duckedVolume: 0.04, label: 'Educational' },
  motivational: { baseVolume: 0.20, duckedVolume: 0.05, label: 'Motivational & Inspirational' },
  story: { baseVolume: 0.17, duckedVolume: 0.05, label: 'Story & Narrative' },
  storytelling: { baseVolume: 0.17, duckedVolume: 0.05, label: 'Story & Narrative' },
  audiobook: { baseVolume: 0.17, duckedVolume: 0.05, label: 'Audiobook & Literature' },
};

export const DEFAULT_VOLUME_PROFILE = { baseVolume: 0.18, duckedVolume: 0.05 };

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatArtistName(raw) {
  if (!raw) return 'YouTube Audio Library';
  if (raw.startsWith('u_')) return 'Audio Library';
  if (raw === 'the_mountain') return 'The Mountain';
  if (raw === 'atlasaudio') return 'Atlas Audio';
  if (raw === 'lnplusmusic') return 'LN Plus Music';
  if (raw === 'musicword') return 'Music Word';
  if (raw === 'tatamusic') return 'Tata Music';
  if (raw === 'solarflex') return 'Solarflex';
  if (raw === 'velariomusic') return 'Velario Music';
  if (raw === 'verclub_music') return 'Verclub Music';
  if (raw === 'alex-morgan' || raw === 'alex_morgan') return 'Alex Morgan';
  if (raw === 'vadim_makes_sound') return 'Vadim Makes Sound';
  if (raw === 'jorisvermeer') return 'Joris Vermeer';
  if (raw === 'viacheslavstarostin') return 'Viacheslav Starostin';
  if (raw === 'sigmamusicart') return 'Sigma Music Art';
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ');
}

export function parseTrackFilename(filename) {
  const baseName = filename.replace(/\.[^/.]+$/, '').trim();
  let title = baseName;
  let artist = 'YouTube Audio Library';

  if (baseName.includes(' - ')) {
    const parts = baseName.split(' - ');
    title = parts[0].trim();
    artist = parts.slice(1).join(' - ').trim();
  } else if (/^rain\b/i.test(baseName)) {
    title = baseName;
    artist = 'Nature Ambient';
  } else if (/^[a-z0-9_]+-[a-z0-9_(). -]+-\d+(\s*\(\d+\))?$/i.test(baseName)) {
    const clean = baseName.replace(/\s*\(\d+\)$/, '');
    const parts = clean.split('-');
    artist = formatArtistName(parts[0]);
    const words = parts.slice(1, -1);
    const deduped = [];
    for (const w of words) {
      if (deduped.length === 0 || deduped[deduped.length - 1].toLowerCase() !== w.toLowerCase()) {
        deduped.push(w);
      }
    }
    title = deduped.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  return { title, artist };
}

let cachedCatalog = null;
let cachedCatalogMtime = 0;

/**
 * Scans the public/audiotrack directory and builds an array of track descriptors.
 */
export function scanAudioTracks(baseDir = path.join(config.publicDir, 'audiotrack')) {
  if (!fs.existsSync(baseDir)) return [];

  const catalog = [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const category = entry.name;
    const catDir = path.join(baseDir, category);
    const files = fs.readdirSync(catDir).filter((f) => /\.(mp3|m4a|wav|aac)$/i.test(f));

    const profile = CATEGORY_VOLUME_PROFILES[category] || DEFAULT_VOLUME_PROFILE;

    for (const file of files) {
      const { title, artist } = parseTrackFilename(file);
      const id = `${category}_${slugify(title)}`;
      const relativeSrc = `audiotrack/${category}/${file}`;

      catalog.push({
        id,
        title,
        artist,
        category,
        filename: file,
        src: relativeSrc,
        baseVolume: profile.baseVolume,
        duckedVolume: profile.duckedVolume,
      });
    }
  }

  return catalog;
}

/**
 * Returns the track catalog, utilizing cached results when possible.
 */
export function getAudioCatalog(baseDir = path.join(config.publicDir, 'audiotrack')) {
  try {
    const stat = fs.existsSync(baseDir) ? fs.statSync(baseDir) : null;
    if (cachedCatalog && stat && stat.mtimeMs === cachedCatalogMtime) {
      return cachedCatalog;
    }
    const fresh = scanAudioTracks(baseDir);
    cachedCatalog = fresh;
    cachedCatalogMtime = stat ? stat.mtimeMs : Date.now();
    return fresh;
  } catch {
    return scanAudioTracks(baseDir);
  }
}

/**
 * Saves a static catalog.json to public/audiotrack/catalog.json.
 */
export function generateCatalogFile(baseDir = path.join(config.publicDir, 'audiotrack')) {
  const tracks = scanAudioTracks(baseDir);
  const catalogPath = path.join(baseDir, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify({ version: '1.0.0', generatedAt: new Date().toISOString(), totalTracks: tracks.length, tracks }, null, 2), 'utf8');
  return tracks;
}

/**
 * Retrieves tracks belonging to a given content type or category.
 */
export function getTracksForCategory(category = 'explainer', catalog = getAudioCatalog()) {
  const cleanCategory = String(category || '').toLowerCase().trim();
  const directMatches = catalog.filter((t) => t.category.toLowerCase() === cleanCategory);
  if (directMatches.length > 0) return directMatches;

  // Aliases and related content types
  if (cleanCategory === 'documentary') {
    return catalog.filter((t) => ['documentary', 'documenty'].includes(t.category.toLowerCase()));
  }
  if (cleanCategory === 'story') {
    return catalog.filter((t) => ['story', 'storytelling'].includes(t.category.toLowerCase()));
  }
  if (cleanCategory === 'explainer') {
    return catalog.filter((t) => ['explainer', 'education'].includes(t.category.toLowerCase()));
  }

  return [];
}

/**
 * Finds a specific track by ID, title, or filename (case-insensitive substring match).
 */
export function findTrackByNameOrId(query = '', catalog = getAudioCatalog()) {
  if (!query) return null;
  const q = String(query).toLowerCase().trim();
  const qSlug = slugify(q);

  return catalog.find((t) => t.id === q
    || t.id.includes(qSlug)
    || t.title.toLowerCase() === q
    || t.filename.toLowerCase() === q
    || t.filename.toLowerCase().includes(q)
    || t.title.toLowerCase().includes(q)) || null;
}
