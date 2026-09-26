/**
 * Licence policy for monetised use.
 *
 * LICENSE_POLICY:
 *   commercial (default)  public domain, CC0, CC BY, CC BY-SA, Pexels/Pixabay/Unsplash licences; attribution collected
 *   strict                as commercial, minus share-alike and AI-generated images
 *   any                   no filtering (personal / internal use only)
 *
 * Always rejected under commercial/strict: non-commercial (NC), no-derivatives (ND),
 * non-free / fair-use files, and anything whose licence cannot be determined.
 */

const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

/** Normalise MediaWiki extmetadata into our licence record. */
export function licenseFromExtmeta(ext = {}, page = null) {
  const v = (k) => ext[k]?.value;
  const name = stripHtml(v('LicenseShortName')) || null;
  return {
    name,
    url: stripHtml(v('LicenseUrl')) || null,
    author: stripHtml(v('Artist')) || null,
    attributionRequired: String(v('AttributionRequired')).toLowerCase() === 'true',
    nonFree: String(v('NonFree') || '').toLowerCase() === 'true' || /fair use|non-free/i.test(name || ''),
    page,
  };
}

export function licenseAllowed(license, policy = process.env.LICENSE_POLICY || 'commercial') {
  if (policy === 'any') return { ok: true };
  if (!license?.name) return { ok: false, why: 'licence unknown' };
  const n = license.name.toLowerCase();
  if (license.nonFree) return { ok: false, why: `non-free (${license.name})` };
  if (/\bnc\b|non-?commercial/.test(n)) return { ok: false, why: `non-commercial (${license.name})` };
  if (/\bnd\b|no-?deriv/.test(n)) return { ok: false, why: `no-derivatives (${license.name})` };
  if (policy === 'strict') {
    if (/\bsa\b|share-?alike/.test(n)) return { ok: false, why: `share-alike under strict policy (${license.name})` };
    if (/ai-generated/.test(n)) return { ok: false, why: 'AI-generated under strict policy' };
  }
  if (/public domain|^pd\b|cc0|pdm|no restrictions/.test(n)) return { ok: true };
  if (/^cc[ -]by(-sa)?[ -]?\d|^cc[ -]by(-sa)?$/.test(n)) return { ok: true };
  if (/pexels license|pixabay content license|unsplash license|ai-generated/.test(n)) return { ok: true };
  return { ok: false, why: `unrecognised licence (${license.name})` };
}

/** Credits block for a video description. Only lists what was actually used. */
export function formatCredits(title, used) {
  const lines = [`Credits — ${title}`, ''];
  const images = used.filter((a) => a.license);
  if (!images.length) return lines.concat('No third-party imagery.').join('\n');
  lines.push('Imagery:');
  for (const a of images) {
    const L = a.license;
    const what = a.label ? String(a.label).replace(/^File:/, '').replace(/\.(jpe?g|png|webp)$/i, '') : a.source;
    lines.push(`• ${what}${L.author ? ` — ${L.author}` : ''} · ${L.name}${L.url ? ` (${L.url})` : ''}${L.page ? ` · ${L.page}` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}
