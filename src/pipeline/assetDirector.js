import fs from 'node:fs/promises';
import path from 'node:path';
import {
  wikipediaLeadImage, commonsSearch, pexelsSearch, braveImageSearch, pixabaySearch, pexelsVideoSearch,
  generatedCandidate, genericCandidates, cleanQuery, materialiseImage, materialiseVideo, mapLimit, hamming, searchStats,
} from '../services/freeMediaService.js';
import { searchImageBank, recordImageInBank } from '../services/imageBank.js';
import { licenseAllowed } from '../shared/licensing.js';
import { relevance, relevanceEnabled } from '../services/relevance.js';

// CLIP similarity below this looked unrelated in measurements (unrelated ≈0.10–0.13, good ≈0.14–0.33).
const RELEVANCE_FLOOR = 0.14;

/**
 * Asset Director — finds the imagery each Visual Director spec asks for,
 * under an explicit quality policy:
 *
 *   role "subject" (a named real thing):  verified → relevant → generated → generic
 *   role "mood"    (atmosphere):          video (if the style prefers motion) → relevant → generated → video → generic
 *   role "texture" (behind a graphic):    relevant → verified → generated → generic
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
      return [...stills('verified'), ...stills('relevant'), ...generated, ...generic];
    case 'mood': {
      const genFirst = process.env.GENERATED_FIRST === '1';
      return [
        ...(need.preferVideo ? videos : []),
        ...stills('verified'),
        ...(genFirst ? generated : []),
        ...stills('relevant'),
        ...(genFirst ? [] : generated),
        ...(need.preferVideo ? [] : videos),
        ...generic,
      ];
    }
    case 'texture':
      return [...stills('verified'), ...stills('relevant'), ...generated, ...generic];
    default:
      return [...stills('verified'), ...stills('relevant'), ...generated, ...generic];
  }
}

async function gather(scene, spec, { format, topicText, index }) {
  const need = spec.need;
  if (need.role === 'none') return [];
  const orientation = format === 'shorts' ? 'portrait' : 'landscape';
  const entityName = scene.entity?.name;
  const tasks = [];

  // 1. Search persistent local Image Bank first (instant zero-latency reuse)
  if (entityName) {
    tasks.push(searchImageBank(entityName, { limit: 2 }));
  }
  for (const q of (scene.imageQueries || [])) {
    const qClean = cleanQuery(q);
    if (qClean) tasks.push(searchImageBank(qClean, { limit: 2 }));
  }

  // 2. Verified Wikipedia Lead & Commons
  if (scene.entity?.wikipedia) {
    tasks.push(wikipediaLeadImage(scene.entity.wikipedia));
    tasks.push(commonsSearch(scene.entity.wikipedia, entityName));
  }
  if (entityName) {
    tasks.push(
      pexelsSearch(entityName, orientation),
      braveImageSearch(entityName, orientation),
      commonsSearch(entityName, entityName)
    );
  }

  // 3. Web & Stock APIs: Brave Search, Pexels, Commons, Pixabay
  for (const q of (scene.imageQueries || [])) {
    const qClean = cleanQuery(q);
    tasks.push(commonsSearch(q, entityName));
    if (qClean) {
      tasks.push(
        pexelsSearch(qClean, orientation),
        braveImageSearch(qClean, orientation),
        pixabaySearch(qClean, orientation)
      );
    }
    if (qClean !== q) {
      tasks.push(pexelsSearch(q, orientation), braveImageSearch(q, orientation));
    }
    if (need.allowVideo && qClean) {
      tasks.push(pexelsVideoSearch(qClean, orientation, Math.min(need.minSeconds, 10)));
    }
  }

  const found = (await Promise.all(tasks)).flat();
  const g = generatedCandidate(scene.visual || scene.imageQueries?.[0] || scene.narration || topicText, format, 1000 + index);
  if (g) found.push(g);
  found.push(...genericCandidates(topicText, index));
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
      // Motion first when the style prefers it
      if (spec.need.preferVideo) {
        for (const c of ordered.filter((x) => x.type === 'video').slice(0, 3)) { const t = await tryTake(c); if (t) { accept(t); break; } }
      }
      if (!picked.length) {
        const takes = [];
        let attempts = 0;
        for (const c of ordered.filter((x) => x.type === 'image')) {
          if (takes.length >= 4 || attempts >= 10) break;
          attempts++;
          const t = await tryTake(c);
          if (t) takes.push(t);
        }
        const bonus = { verified: 0.02, relevant: 0.015, generated: 0.005, generic: 0 };
        takes.sort((a, b) => ((b.asset.relevance ?? 0.2) + (bonus[b.c.tier] || 0)) - ((a.asset.relevance ?? 0.2) + (bonus[a.c.tier] || 0)));
        const best = takes[0];
        if (best) {
          accept(best);
          for (const t of takes.slice(1)) {
            if (picked.length >= spec.need.count) break;
            if (TIER_RANK[t.c.tier] <= TIER_RANK.relevant) accept(t);
          }
        }
        for (const t of takes) if (!picked.includes(t.asset)) await fs.rm(t.file, { force: true });
      }
    } else {
      let attempts = 0;
      for (const c of ordered) {
        if (picked.length >= spec.need.count || attempts > 16) break;
        attempts++;
        const t = await tryTake(c);
        if (!t) continue;
        accept(t);
      }
    }

    // Ultimate fallback if strict matching yielded nothing
    if (!picked.length && ordered.length) {
      for (const c of ordered) {
        const t = await tryTake(c);
        if (t) { accept(t); break; }
      }
    }
    assets[scene.id] = { primary: picked[0] || null, alternates: picked.slice(1) };
    const p = picked[0];
    if (p && p.type === 'image' && p.src) {
      recordImageInBank({
        filePath: path.join(publicDir, p.src),
        description,
        query: scene.imageQueries?.[0] || scene.visual || scene.entity?.name || '',
        source: p.source,
        label: p.label || '',
        license: p.license,
        width: p.width || 1920,
        height: p.height || 1080,
      }).catch(() => {});
    }
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
