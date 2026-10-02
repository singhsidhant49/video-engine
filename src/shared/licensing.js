/**
 * Licence policy and provenance tracking for commercial & editorial media.
 *
 * Provenance schema:
 * {
 *   provider: 'pexels' | 'wikipedia' | 'brave' | 'pixabay' | 'image_bank',
 *   source_url: string,
 *   creator: string | null,
 *   license_name: string,
 *   license_url: string | null,
 *   retrieved_at: string,
 *   commercial_use: 'allowed' | 'editorial_only' | 'unknown' | 'rejected',
 *   attribution_required: boolean,
 *   verification_status: 'verified' | 'editorial_only' | 'manual_review'
 * }
 */

const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

/** Normalise MediaWiki extmetadata into our licence record. */
export function licenseFromExtmeta(ext = {}, page = null) {
  const v = (k) => ext[k]?.value;
  const name = stripHtml(v('LicenseShortName')) || 'Wikimedia Commons';
  const author = stripHtml(v('Artist')) || null;
  const isPublicDomain = /public domain|pd|cc0|pdm/i.test(name);
  const isCC = /cc-by/i.test(name);

  return {
    provider: 'wikipedia',
    name,
    license_name: name,
    url: stripHtml(v('LicenseUrl')) || null,
    license_url: stripHtml(v('LicenseUrl')) || null,
    author,
    creator: author,
    attributionRequired: String(v('AttributionRequired')).toLowerCase() === 'true',
    attribution_required: String(v('AttributionRequired')).toLowerCase() === 'true',
    nonFree: String(v('NonFree') || '').toLowerCase() === 'true' || /fair use|non-free/i.test(name),
    commercial_use: isPublicDomain || isCC ? 'allowed' : 'editorial_only',
    verification_status: isPublicDomain || isCC ? 'verified' : 'editorial_only',
    retrieved_at: new Date().toISOString(),
    page,
  };
}

export function licenseAllowed(license, policy = process.env.LICENSE_POLICY || 'commercial') {
  if (policy === 'any') return { ok: true, status: 'unfiltered' };
  if (!license?.name && !license?.license_name) return { ok: false, why: 'licence unknown' };

  const n = (license.license_name || license.name).toLowerCase();
  if (license.nonFree) return { ok: false, why: `non-free (${license.name || license.license_name})` };
  if (/\bnc\b|non-?commercial/.test(n)) return { ok: false, why: `non-commercial (${license.name || license.license_name})` };
  if (/\bnd\b|no-?deriv/.test(n)) return { ok: false, why: `no-derivatives (${license.name || license.license_name})` };

  if (policy === 'strict') {
    if (/\bsa\b|share-?alike/.test(n)) return { ok: false, why: `share-alike under strict policy (${license.name || license.license_name})` };
    if (/ai-generated/.test(n)) return { ok: false, why: 'AI-generated under strict policy' };
  }

  if (/public domain|^pd\b|cc0|pdm|no restrictions/.test(n)) {
    return { ok: true, status: 'verified', commercial: true };
  }
  if (/^cc[ -]by(-sa)?[ -]?\d|^cc[ -]by(-sa)?$/.test(n)) {
    return { ok: true, status: 'verified', commercial: true };
  }
  if (/pexels license|pixabay content license|unsplash license/.test(n)) {
    return { ok: true, status: 'verified', commercial: true };
  }
  if (/web editorial|brave|image bank|editorial/.test(n)) {
    // Web editorial: allowed under commercial editorial documentary policy
    return { ok: true, status: 'editorial_only', commercial: true };
  }

  return { ok: false, why: `unrecognised licence (${license.name || license.license_name})` };
}

/** Credits block for a video description. */
export function formatCredits(title, used) {
  const lines = [`Credits & Provenance — ${title}`, ''];
  const images = used.filter((a) => a.license);
  if (!images.length) return lines.concat('No third-party imagery.').join('\n');
  lines.push('Visual Assets & Provenance:');
  for (const a of images) {
    const L = a.license;
    const what = a.label ? String(a.label).replace(/^File:/, '').replace(/\.(jpe?g|png|webp)$/i, '') : a.source;
    const author = L.creator || L.author;
    const licName = L.license_name || L.name || 'Editorial / Stock';
    const licUrl = L.license_url || L.url;
    lines.push(`• ${what}${author ? ` — by ${author}` : ''} · ${licName}${licUrl ? ` (${licUrl})` : ''} · [${L.verification_status || 'verified'}]`);
  }
  return `${lines.join('\n')}\n`;
}
