// Draws the app icon (five land-coloured bars in a pixel frame) as PNGs without any dependency.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "public", "icons");
mkdirSync(out, { recursive: true });
const BARS = [[0xf0, 0xe0, 0x9a], [0x2f, 0x7f, 0xc4], [0x4a, 0x3f, 0x55], [0xd0, 0x4a, 0x2a], [0x2a, 0x7a, 0x4a]];
const BG = [0x1f, 0x1f, 0x2e];

function crc(buf) {
  let c, crcv = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crcv ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcv = (crcv >>> 8) ^ c;
  }
  return (crcv ^ 0xffffffff) >>> 0;
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function png(size) {
  const px = size / 32; // 32x32 pixel grid
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / px), gy = Math.floor(y / px);
      let col = BG;
      const inside = gx >= 5 && gx < 27 && gy >= 6 && gy < 26;
      const frame = gx >= 4 && gx < 28 && gy >= 5 && gy < 27;
      if (frame) col = [0xf5, 0xf0, 0xe0];
      if (inside) col = BARS[Math.min(4, Math.floor((gx - 5) / 4.4))];
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
for (const s of [192, 512]) writeFileSync(join(out, `icon-${s}.png`), png(s));
console.log("icons written");
