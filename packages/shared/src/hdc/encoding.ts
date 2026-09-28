/**
 * Byte-level decoding for .hdc files.
 *
 * Desktop Hero Designer writes UTF-16 (usually little-endian with a BOM); files produced by
 * other tools, and the XML the hero6e Foundry system stores, are UTF-8.
 */

export type HdcEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';

interface Utf8Decoder {
  decode(input: Uint8Array): string;
}
declare const TextDecoder: { new (label: string): Utf8Decoder };

export function detectHdcEncoding(bytes: Uint8Array): HdcEncoding {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  // BOM-less UTF-16: "<" followed by a zero byte (LE) or preceded by one (BE)
  if (bytes[0] === 0x3c && bytes[1] === 0x00) return 'utf-16le';
  if (bytes[0] === 0x00 && bytes[1] === 0x3c) return 'utf-16be';
  return 'utf-8';
}

/** Decodes raw .hdc bytes to a string, stripping any byte-order mark */
export function decodeHdcBytes(bytes: Uint8Array): string {
  const encoding = detectHdcEncoding(bytes);
  let text: string;
  if (encoding === 'utf-8') {
    text = new TextDecoder('utf-8').decode(bytes);
  } else {
    const littleEndian = encoding === 'utf-16le';
    const units = new Array<number>(Math.floor(bytes.length / 2));
    for (let i = 0; i < units.length; i++) {
      const lo = bytes[i * 2]!;
      const hi = bytes[i * 2 + 1]!;
      units[i] = littleEndian ? lo | (hi << 8) : (lo << 8) | hi;
    }
    // Chunked to stay under engine argument limits on large embedded images
    const parts: string[] = [];
    for (let i = 0; i < units.length; i += 0x8000) {
      parts.push(String.fromCharCode(...units.slice(i, i + 0x8000)));
    }
    text = parts.join('');
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Encodes to UTF-16LE with a BOM, the format desktop Hero Designer writes */
export function encodeHdcUtf16(text: string): Uint8Array {
  const bytes = new Uint8Array((text.length + 1) * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[(i + 1) * 2] = code & 0xff;
    bytes[(i + 1) * 2 + 1] = code >> 8;
  }
  return bytes;
}
