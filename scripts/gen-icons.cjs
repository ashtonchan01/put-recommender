/**
 * Generates simple PNG app icons using only Node.js built-ins (no external deps).
 * Creates: public/icons/icon-192.png, icon-512.png, apple-touch-icon.png
 */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

function makePNG(size) {
  // Background: #0f172a (slate-950), accent: #10b981 (emerald-500)
  const bg = [0x0f, 0x17, 0x2a];
  const accent = [0x10, 0xb9, 0x81];
  const white = [0xff, 0xff, 0xff];

  // Draw a simple icon: dark background + rounded "W" shape made from pixels
  const pixels = Buffer.alloc(size * size * 3);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42; // outer circle radius
  const strokeW = size * 0.06;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 3;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background
      pixels[idx] = bg[0]; pixels[idx+1] = bg[1]; pixels[idx+2] = bg[2];

      // Accent circle ring
      if (dist >= r - strokeW && dist <= r) {
        pixels[idx] = accent[0]; pixels[idx+1] = accent[1]; pixels[idx+2] = accent[2];
      }
    }
  }

  // Draw a simple "W" in the center using pixels
  const letterSize = size * 0.38;
  const lx = cx - letterSize / 2;
  const ly = cy - letterSize / 2;
  const sw = Math.max(2, Math.round(size * 0.055)); // stroke width

  function setRect(rx, ry, rw, rh, color) {
    const x0 = Math.round(rx), y0 = Math.round(ry);
    const x1 = Math.round(rx + rw), y1 = Math.round(ry + rh);
    for (let y = Math.max(0, y0); y < Math.min(size, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x1); x++) {
        const idx = (y * size + x) * 3;
        pixels[idx] = color[0]; pixels[idx+1] = color[1]; pixels[idx+2] = color[2];
      }
    }
  }

  // W: two V shapes side by side
  // Left leg down-left
  const h = letterSize;
  const w = letterSize;
  // Left outer stroke (vertical, slightly angled — approximated as rect)
  setRect(lx,              ly, sw, h * 0.65, white);
  // Left inner stroke
  setRect(lx + w * 0.22,  ly + h * 0.35, sw, h * 0.65, white);
  // Right inner stroke
  setRect(lx + w * 0.5,   ly, sw, h * 0.65, white);  // actually the midpoint goes back up
  // Right outer stroke
  setRect(lx + w - sw,    ly, sw, h * 0.65, white);

  // Bottom connectors (diagonals approximated as rects)
  // Bottom-left diagonal
  for (let i = 0; i < Math.round(h * 0.4); i++) {
    const t = i / (h * 0.4);
    const bx = lx + t * (w * 0.11);
    const by = ly + h * 0.6 + i;
    setRect(bx, by, sw, 1, white);
  }
  // Bottom-left inner
  for (let i = 0; i < Math.round(h * 0.4); i++) {
    const t = i / (h * 0.4);
    const bx = lx + w * 0.22 - t * (w * 0.11);
    const by = ly + h * 0.6 + i;
    setRect(bx, by, sw, 1, white);
  }
  // Bottom-right inner
  for (let i = 0; i < Math.round(h * 0.4); i++) {
    const t = i / (h * 0.4);
    const bx = lx + w * 0.5 + t * (w * 0.11);
    const by = ly + h * 0.6 + i;
    setRect(bx, by, sw, 1, white);
  }
  // Bottom-right outer
  for (let i = 0; i < Math.round(h * 0.4); i++) {
    const t = i / (h * 0.4);
    const bx = lx + w - sw - t * (w * 0.11);
    const by = ly + h * 0.6 + i;
    setRect(bx, by, sw, 1, white);
  }

  // Build PNG binary
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw image data: filter byte (0) + RGB row for each row
  const rawRows = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    rawRows[y * (1 + size * 3)] = 0; // filter = None
    pixels.copy(rawRows, y * (1 + size * 3) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const compressed = zlib.deflateSync(rawRows, { level: 6 });

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type, "ascii");
    const crcInput = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcInput));
    return Buffer.concat([len, typeB, data, crc]);
  }

  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
}

// CRC32 implementation
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const outDir = path.join(__dirname, "../public/icons");
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const buf = makePNG(size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), buf);
  console.log(`Generated icon-${size}.png (${buf.length} bytes)`);
}

// 180x180 apple-touch-icon
const atiBuf = makePNG(180);
fs.writeFileSync(path.join(outDir, "apple-touch-icon.png"), atiBuf);
console.log(`Generated apple-touch-icon.png (${atiBuf.length} bytes)`);
