// Draws the extension icon as PNG without an image library: a blue cookie
// with two overlapping white circles, two people passing each other.

import { crc32, deflateSync } from "node:zlib";
import { cookieRadius } from "./shape.ts";

const BLUE = [0x11, 0x85, 0xfe] as const;
const WHITE = [0xff, 0xff, 0xff] as const;
const SAMPLES = 4; // 4x4 supersampling for smooth edges

function colorAt(x: number, y: number): readonly [number, number, number] | null {
  // x, y in -1..1
  const r = Math.hypot(x, y);
  if (r > cookieRadius(Math.atan2(y, x))) return null;

  const inLeft = Math.hypot(x + 0.17, y) < 0.36;
  const inRight = Math.hypot(x - 0.17, y) < 0.36;
  return inLeft !== inRight ? WHITE : BLUE;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function iconPng(size: number): Buffer {
  const rows: Buffer[] = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4); // leading 0 = no filter
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = ((px + (sx + 0.5) / SAMPLES) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / SAMPLES) / size) * 2 - 1;
          const c = colorAt(x, y);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const o = 1 + px * 4;
      if (a > 0) {
        row[o] = Math.round(r / a);
        row[o + 1] = Math.round(g / a);
        row[o + 2] = Math.round(b / a);
      }
      row[o + 3] = Math.round((a / (SAMPLES * SAMPLES)) * 255);
    }
    rows.push(row);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
