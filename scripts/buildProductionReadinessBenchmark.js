import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { licenseAllowed } from '../src/shared/licensing.js';

const root = path.resolve('benchmarks', 'pixel-first');
const indexPath = path.resolve('.cache', 'image_bank', 'bank_index.json');
const stop = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'image', 'photo', 'animation', 'visual', 'showing']);
const tokens = (value) => [...new Set(String(value || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((token) => token.length > 2 && !stop.has(token)))];

const confusers = [
  [/branch|timeline/, /tree|twig|baboon|forest/],
  [/memory leak|garbage collect/, /water|pipe|sanitation|trash/],
  [/cloud comput/, /weather|storm|sky|cumulus/],
  [/network|packet/, /fishing|parcel|cardboard/],
  [/bank run|financial bank/, /river|jogging/],
  [/parallel universe|multiverse/, /guitar|pedal|stompbox/],
];

function classifyNiche(text) {
  if (/memory|code|developer|server|network|cloud|software|database|cpu|chip/.test(text)) return 'software development';
  if (/bank|money|finance|market|stock|bond|mortgage|currency/.test(text)) return 'finance';
  if (/business|office|company|factory|sales|meeting/.test(text)) return 'business';
  if (/psychology|brain|emotion|behavior|mental/.test(text)) return 'psychology';
  if (/health|medical|doctor|hospital|fitness|disease/.test(text)) return 'health';
  if (/history|ancient|war|historic|science|physics|quantum|space/.test(text)) return 'science/history';
  return 'tech/AI';
}

function label(item, index) {
  const request = item.description || '';
  const visible = item.label || '';
  const requestTokens = tokens(request);
  const visibleTokens = tokens(visible);
  const overlap = requestTokens.length ? requestTokens.filter((token) => visibleTokens.includes(token)).length / requestTokens.length : 0;
  const accidental = confusers.some(([need, wrong]) => need.test(request.toLowerCase()) && wrong.test(visible.toLowerCase()));
  const license = licenseAllowed(item.license);
  const semanticClass = accidental ? 'ACCIDENTAL' : overlap >= 0.5 ? 'DIRECT' : overlap >= 0.2 ? 'CONTEXTUAL' : 'WRONG';
  const accept = license.ok && ['DIRECT', 'CONTEXTUAL'].includes(semanticClass);
  return {
    id: item.id,
    candidatePath: path.resolve(item.file),
    niche: classifyNiche(`${request} ${visible}`),
    requestConcept: request,
    intrinsicVisibleLabel: visible,
    labels: {
      subjectMatch: Number(overlap.toFixed(3)),
      actionMatch: /ing\b/.test(visible) && /ing\b/.test(request) ? 0.7 : 0.2,
      evidenceValue: semanticClass === 'DIRECT' ? 0.8 : semanticClass === 'CONTEXTUAL' ? 0.5 : 0.1,
      semanticClass,
      editorialUsefulness: semanticClass === 'DIRECT' ? 'STRONG' : semanticClass === 'CONTEXTUAL' ? 'USEFUL' : 'WEAK',
      distraction: accidental ? 0.9 : semanticClass === 'WRONG' ? 0.7 : 0.15,
      licenseValidity: license.ok,
      accept,
    },
    review: {
      method: 'intrinsic-provider-label-versus-legacy-request audit',
      status: 'PROVISIONAL_REQUIRES_HUMAN_PIXEL_REVIEW',
      deterministicConfuserRule: accidental,
      ordinal: index + 1,
    },
  };
}

async function buildSheet(records, sheetIndex) {
  const width = 240;
  const height = 180;
  const columns = 5;
  const cells = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const image = await sharp(record.candidatePath).resize(width, height - 34, { fit: 'cover' }).png().toBuffer();
    const caption = Buffer.from(`<svg width="${width}" height="34"><rect width="100%" height="100%" fill="#111827"/><text x="6" y="14" font-size="10" fill="#fff">${record.id}</text><text x="6" y="28" font-size="10" fill="${record.labels.accept ? '#4ade80' : '#fb7185'}">${record.labels.semanticClass} · ${record.niche}</text></svg>`);
    const cell = await sharp({ create: { width, height, channels: 3, background: '#111827' } })
      .composite([{ input: image, top: 0, left: 0 }, { input: caption, top: height - 34, left: 0 }]).png().toBuffer();
    cells.push({ input: cell, left: (i % columns) * width, top: Math.floor(i / columns) * height });
  }
  const rows = Math.ceil(records.length / columns);
  const output = path.join(root, `candidate-contact-sheet-${String(sheetIndex + 1).padStart(2, '0')}.png`);
  await sharp({ create: { width: columns * width, height: rows * height, channels: 3, background: '#030712' } }).composite(cells).png().toFile(output);
  return output;
}

const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
const sourceItems = [...(index.images || [])];
const knownIds = new Set(sourceItems.map((item) => item.id));
const runsRoot = path.resolve('renders', 'runs');
for (const runName of await fs.readdir(runsRoot).catch(() => [])) {
  if (sourceItems.length >= 260) break;
  const runDir = path.join(runsRoot, runName);
  try {
    const payload = JSON.parse(await fs.readFile(path.join(runDir, 'assets.json'), 'utf8'));
    for (const scene of Object.values(payload.assets || payload)) {
      for (const asset of Object.values(scene?.byShot || {})) {
        const id = asset.sha256ContentHash?.slice(0, 16) || `${runName}-${asset.storyboardShotId}`;
        if (knownIds.has(id) || !asset.src || asset.unresolved) continue;
        knownIds.add(id);
        sourceItems.push({
          id,
          file: path.join(runDir, 'public', asset.src),
          description: asset.query || asset.visibleNeed?.primaryConcept || '',
          label: asset.label || '',
          source: asset.source,
          license: asset.license,
          width: asset.width,
          height: asset.height,
        });
      }
    }
  } catch {}
}
const available = [];
for (const item of sourceItems) {
  if (available.length >= 200) break;
  try {
    await fs.access(item.file);
    await sharp(item.file).metadata();
    available.push(item);
  } catch {}
}
if (available.length < 200) throw new Error(`Need 200 real assets; found ${available.length}`);
await fs.mkdir(root, { recursive: true });
const dataset = available.map(label);
const sheets = [];
for (let offset = 0; offset < dataset.length; offset += 25) sheets.push(await buildSheet(dataset.slice(offset, offset + 25), offset / 25));
const byClass = Object.fromEntries(['DIRECT', 'CONTEXTUAL', 'ACCIDENTAL', 'WRONG'].map((value) => [value, dataset.filter((item) => item.labels.semanticClass === value).length]));
const metrics = {
  version: 1,
  generatedAt: new Date().toISOString(),
  candidateCount: dataset.length,
  realPixelFiles: dataset.filter((item) => item.candidatePath).length,
  niches: Object.fromEntries([...new Set(dataset.map((item) => item.niche))].map((niche) => [niche, dataset.filter((item) => item.niche === niche).length])),
  semanticClasses: byClass,
  licenseFailureRate: Number((dataset.filter((item) => !item.labels.licenseValidity).length / dataset.length).toFixed(3)),
  accidentalAssetRate: Number((byClass.ACCIDENTAL / dataset.length).toFixed(3)),
  wrongAssetRate: Number((byClass.WRONG / dataset.length).toFixed(3)),
  reviewStatus: 'PROVISIONAL_REQUIRES_HUMAN_PIXEL_REVIEW',
  contactSheets: sheets.map((file) => path.relative(root, file).replaceAll('\\', '/')),
};
await fs.writeFile(path.join(root, 'candidate-dataset.json'), JSON.stringify(dataset, null, 2));
await fs.writeFile(path.join(root, 'candidate-metrics.json'), JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
