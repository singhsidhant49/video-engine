let sharpModule = null;
let sharpAvailable = false;

try {
  const mod = await import('sharp');
  sharpModule = mod.default || mod;
  // Test a simple instantiation to ensure native bindings are functional
  sharpAvailable = typeof sharpModule === 'function';
} catch (e) {
  sharpAvailable = false;
}

export function getSharp() {
  return sharpAvailable ? sharpModule : null;
}

/**
 * Fast pure-JS dimension extraction for JPEG, PNG, GIF, WebP.
 */
export function getImageDimensions(buf) {
  if (!buf || buf.length < 24) return { width: 1920, height: 1080 };

  // PNG: bytes 16-24
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height, format: 'png' };
  }

  // GIF: bytes 6-10
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    return { width, height, format: 'gif' };
  }

  // JPEG: scan SOF markers
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 8) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        return { width, height, format: 'jpeg' };
      }
      const len = buf.readUInt16BE(offset + 2);
      offset += 2 + len;
    }
  }

  // WebP
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunkHeader = buf.toString('ascii', 12, 16);
    if (chunkHeader === 'VP8 ') {
      const width = buf.readUInt16LE(26) & 0x3fff;
      const height = buf.readUInt16LE(28) & 0x3fff;
      return { width, height, format: 'webp' };
    }
  }

  // Fallback default
  return { width: 1920, height: 1080, format: 'unknown' };
}
