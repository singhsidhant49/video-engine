import fs from 'node:fs/promises';
import path from 'node:path';
import {
  wikipediaLeadImage, commonsSearch, pexelsSearch, pixabaySearch, pexelsVideoSearch,
  generatedCandidate, genericCandidates, materialiseImage, materialiseVideo, mapLimit, hamming, searchStats,
} from '../services/freeMediaService.js';
import { licenseAllowed } from '../shared/licensing.js';
import { relevance, relevanceEnabled } from '../services/relevance.js';

// CLIP similarity below this looked unrelated in measurements (unrelated ≈0.19–0.22, good ≈0.26–0.33).
const RELEVANCE_FLOOR = 0.215;

/**
 * Asset Director — finds the imagery each Visual Director spec asks for,
 * under an explicit quality policy:
 *
 *   role "subject" (a named real thing):  verified → relevant → (generated only if not a real entity) → none
 *   role "mood"    (atmosphere):          video (if the style prefers motion) → relevant → generated → video → generic (if the style allows)
 *   role "texture" (behind a graphic):    relevant only
 *
 * "none" is a valid answer: the Visual Director then recasts the scene as
 * typography or a graphic instead of showing the wrong picture. Generic
 * library photos can never represent a named subject.
 *
 * Set GENERATED_FIRST=1 when a reliable generator is configured to put
 * purpose-built images ahead of stock for mood shots.
 */

const TIER_RANK = { verified: 0, relevant: 1, generated: 2, generic: 3 };

function score(c, format) {
  let s = c.weight;
  if (c.width && c.height) {
    s += Math.min(1, Math.min(c.width, c.height) / 1400) * 0.8;
    if ((c.height > c.width) === (format === 'shorts')) s += 0.35;
  }
  return s;
}

function orderCandidates(cands, need, format) {
  const byScore = (a, b) => score(b, format) - score(a, format);
  const stills = (tier) => cands.filter((c) => c.type === 'image' && c.tier === tier).sort(byScore);
  const videos = cands.filter((c) => c.type === 'video').sort(byScore);
  const generated = cands.filter((c) => c.tier === 'generated');
  const generic = cands.filter((c) => c.tier === 'generic');
  switch (need.role) {
    case 'subject':
      return [...stills('verified'), ...stills('relevant'), ...(need.allowGenerated ? generated : [])];
    case 'mood': {
      const genFirst = process.env.GENERATED_FIRST === '1';
      return [
        ...(need.preferVideo ? videos : []),
        ...stills('verified'),
        ...(genFirst ? generated : []),
        ...stills('relevant'),
        ...(genFirst ? [] : generated),
        ...(need.preferVideo ? [] : videos),
        ...(need.allowGeneric ? generic : []),
      ];
    }
    case 'texture':
      return stills('verified').concat(stills('relevant'));
    default:
      return [];
  }
}

async function gather(scene, spec, { format, topicText, index }) {
  const need = spec.need;
  if (need.role === 'none') return [];
  const orientation = format === 'shorts' ? 'portrait' : 'landscape';
  const entityName = scene.entity?.name;
  const tasks = [];
  if (scene.entity?.wikipedia) {
    tasks.push(wikipediaLeadImage(scene.entity.wikipedia));
    tasks.push(commonsSearch(scene.entity.wikipedia, entityName));
  }
  for (const q of scene.imageQueries) {
    tasks.push(commonsSearch(q, entityName), pexelsSearch(q, orientation), pixabaySearch(q, orientation));
    if (need.allowVideo) tasks.push(pexelsVideoSearch(q, orientation, Math.min(need.minSeconds, 10)));
  }
  const found = (await Promise.all(tasks)).flat();
  if (need.allowGenerated) {
    const g = generatedCandidate(scene.visual || scene.imageQueries[0] || scene.narration, format, 1000 + index);
    if (g) found.push(g);
  }
  if (need.allowGeneric) found.push(...genericCandidates(topicText, index));
  return found;
}

/**
 * @returns {Promise<{ assets: Record<string, {primary: object|null, alternates: object[]}>, report: object[] }>}
 */
export async function directAssets(plan, specs, { publicDir, format }) {
  const dir = path.join(publicDir, 'assets');
  await fs.mkdir(dir, { recursive: true });
  const topicText = `${plan.topic} ${plan.title}`;

  const pools = await mapLimit(plan.scenes, 3, (scene, i) => gather(scene, specs[i], { format, topicText, index: i }));

  const usedUrls = new Set();
  const usedHashes = [];
  const assets = {};
  const report = [];

  for (let i = 0; i < plan.scenes.length; i++) {
    const scene = plan.scenes[i];
    const spec = specs[i];
    const picked = [];
    const rejected = [];
    // Licence gate before anything is downloaded.
    const ordered = orderCandidates(pools[i], spec.need, format).filter((c) => {
      if (usedUrls.has(c.url)) return false;
      const verdict = licenseAllowed(c.license);
      if (!verdict.ok) rejected.push(`${c.source}: ${verdict.why}`);
      return verdict.ok;
    });
    const description = scene.visual || scene.imageQueries[0] || scene.narration;
    let seq = 0;
    const tryTake = async (c) => {
      const ext = c.type === 'video' ? 'mp4' : 'jpg';
      const file = path.join(dir, `${scene.id}_${String.fromCharCode(97 + seq++)}.${ext}`);
      try {
        const info = c.type === 'video' ? await materialiseVideo(c, file) : await materialiseImage(c, file);
        if (info.hash && usedHashes.some((h) => hamming(h, info.hash) <= 10)) { rejected.push(`${c.source}: duplicate`); await fs.rm(file, { force: true }); return null; }
        if (c.type === 'video' && info.duration < Math.min(spec.need.minSeconds, 3)) { rejected.push(`${c.source}: clip too short`); return null; }
        const score = c.type === 'image' ? await relevance(file, description) : null;
        const { hash, ...rest } = info;
        return { c, hash, file, asset: { ...rest, src: path.relative(publicDir, file).split(path.sep).join('/'), source: c.source, tier: c.tier, generic: c.tier === 'generic', label: c.label || null, license: c.license || null, relevance: score } };
      } catch (err) {
        rejected.push(`${c.source}: ${err.message}`);
        return null;
      }
    };
    const accept = (t) => {
      usedUrls.add(t.c.url);
      if (t.hash) usedHashes.push(t.hash);
      picked.push(t.asset);
    };

    const audition = relevanceEnabled() && (spec.need.role === 'mood' || spec.need.role === 'texture');
    if (audition) {
      // Motion first when the style prefers it (not scorable here), otherwise audition up to 4 stills and keep the best.
      if (spec.need.preferVideo) {
        for (const c of ordered.filter((x) => x.type === 'video').slice(0, 3)) { const t = await tryTake(c); if (t) { accept(t); break; } }
      }
      if (!picked.length) {
        const takes = [];
        for (const c of ordered.filter((x) => x.type === 'image')) {
          if (takes.length >= 4) break;
          const t = await tryTake(c);
          if (t) takes.push(t);
        }
        const bonus = { verified: 0.012, relevant: 0.006, generated: 0, generic: -0.02 };
        takes.sort((a, b) => (b.asset.relevance + bonus[b.c.tier]) - (a.asset.relevance + bonus[a.c.tier]));
        const best = takes[0];
        if (best && best.asset.relevance >= RELEVANCE_FLOOR) {
          accept(best);
          for (const t of takes.slice(1)) {
            if (picked.length >= spec.need.count) break;
            if (TIER_RANK[t.c.tier] <= TIER_RANK.relevant && t.asset.relevance >= best.asset.relevance - 0.03) accept(t);
          }
        } else if (best) rejected.push(`best candidate looked unrelated to "${description.slice(0, 40)}" (relevance ${best.asset.relevance})`);
        for (const t of takes) if (!picked.includes(t.asset)) await fs.rm(t.file, { force: true });
      }
    } else {
      let attempts = 0;
      for (const c of ordered) {
        if (picked.length >= spec.need.count || attempts > 14) break;
        // Extra images (sequences, splits, reframes) must be at least "relevant", the same medium,
        // and — by CLIP — about as on-topic as the primary.
        if (picked.length && (TIER_RANK[c.tier] > TIER_RANK.relevant || c.type !== picked[0].type)) continue;
        attempts++;
        const t = await tryTake(c);
        if (!t) continue;
        const primaryScore = picked[0]?.relevance;
        if (picked.length && primaryScore != null && t.asset.relevance != null && t.asset.relevance < primaryScore - 0.04) {
          rejected.push(`${c.source}: less relevant than the primary (${t.asset.relevance} vs ${primaryScore})`);
          await fs.rm(t.file, { force: true });
          continue;
        }
        accept(t);
      }
    }
    assets[scene.id] = { primary: picked[0] || null, alternates: picked.slice(1) };
    const p = picked[0];
    report.push({ sceneId: scene.id, role: spec.need.role, tier: p?.tier || 'none', type: p?.type || null, source: p?.source || null, label: p?.label || null, license: p?.license?.name || null, relevance: p?.relevance ?? null, count: picked.length, candidates: ordered.length, rejected: rejected.slice(0, 6) });
    if (spec.need.role !== 'none') {
      console.log(`🖼️  ${scene.id} ${spec.need.role.padEnd(7)} ${p ? `${p.tier}/${p.source}${p.type === 'video' ? ' VIDEO' : ''} ${p.width}×${p.height}${p.relevance != null ? ` r=${p.relevance.toFixed(3)}` : ''}${p.label ? ` — ${String(p.label).slice(0, 56)}` : ''}` : 'NO ACCEPTABLE ASSET'}${picked.length > 1 ? ` +${picked.length - 1}` : ''}`);
    }
  }
  if (searchStats.failed) {
    console.warn(`⚠️  ${searchStats.failed} image searches failed (${[...new Set(searchStats.failures)].slice(0, 3).join('; ')}) — scenes without images may be missing them because sources were unreachable, not because none exist.`);
  }
  report.search = { ...searchStats, failures: [...new Set(searchStats.failures)] };
  return { assets, report };
}
