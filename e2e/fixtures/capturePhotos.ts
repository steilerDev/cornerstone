/**
 * Synthetic photos for the capture-screen specs (#2221).
 *
 * Solid-colour PNGs are encoded at test time with `node:zlib` (no binary fixtures to commit, no
 * real photos). Every photo has a distinct colour, hence distinct bytes. The shape matches what
 * `locator.setInputFiles()` and `fileChooser.setFiles()` accept.
 */

import { deflateSync } from 'node:zlib';

export interface CapturePhotoFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A `size` x `size` solid-colour PNG. */
export function solidPng(rgb: readonly [number, number, number], size = 320): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const COLOURS: ReadonlyArray<readonly [number, number, number]> = [
  [200, 60, 60],
  [60, 160, 90],
  [60, 100, 200],
  [220, 170, 50],
  [140, 80, 180],
  [60, 170, 180],
  [180, 120, 80],
  [110, 110, 110],
];

/** `count` distinct synthetic photos named `<prefix>-1.png` ... */
export function capturePhotos(count: number, prefix = 'capture'): CapturePhotoFile[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `${prefix}-${i + 1}.png`,
    mimeType: 'image/png',
    buffer: solidPng(COLOURS[i % COLOURS.length] as [number, number, number]),
  }));
}
