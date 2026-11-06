const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function createAttendanceIcon(size) {
  const width = size;
  const height = size;
  const rowSize = width * 4;
  const rawData = Buffer.alloc(height * (rowSize + 1));

  const center = size / 2;
  const radius = size * 0.44;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (rowSize + 1);
    rawData[rowOffset] = 0;

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Distance from center for rounded icon
      const dx = Math.abs(x - center);
      const dy = Math.abs(y - center);
      const cornerRadius = size * 0.22;
      const cornerDx = dx - (center - cornerRadius);
      const cornerDy = dy - (center - cornerRadius);

      let inBounds = true;
      if (cornerDx > 0 && cornerDy > 0) {
        if (cornerDx * cornerDx + cornerDy * cornerDy > cornerRadius * cornerRadius) {
          inBounds = false;
        }
      }

      if (!inBounds) {
        // Transparent outside rounded rect
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
        continue;
      }

      // Base gradient (Indigo to Blue)
      const gradT = (x + y) / (width + height);
      let r = Math.round(99 * (1 - gradT) + 37 * gradT);
      let g = Math.round(102 * (1 - gradT) + 99 * gradT);
      let b = Math.round(241 * (1 - gradT) + 235 * gradT);

      // Distance from center
      const dist = Math.sqrt((x - center) * (x - center) + (y - center) * (y - center));

      // 1. Outer Ring
      const ringR = size * 0.32;
      const ringThick = size * 0.035;
      if (Math.abs(dist - ringR) < ringThick) {
        r = 255; g = 255; b = 255;
      }

      // 2. Clock Center Dot
      if (dist < size * 0.04) {
        r = 255; g = 255; b = 255;
      }

      // 3. Vertical Hand (12 o'clock)
      if (Math.abs(x - center) < size * 0.025 && y < center && y > center - ringR * 0.7) {
        r = 255; g = 255; b = 255;
      }

      // 4. Hour Hand (3 o'clock)
      if (Math.abs(y - center) < size * 0.025 && x > center && x < center + ringR * 0.5) {
        r = 255; g = 255; b = 255;
      }

      // 5. Corner Scan Brackets
      const bDist = size * 0.36;
      const bLen = size * 0.10;
      const bThick = size * 0.028;

      const inTopLeft = (x >= center - bDist && x <= center - bDist + bLen && Math.abs(y - (center - bDist)) < bThick) ||
                        (y >= center - bDist && y <= center - bDist + bLen && Math.abs(x - (center - bDist)) < bThick);

      const inTopRight = (x <= center + bDist && x >= center + bDist - bLen && Math.abs(y - (center - bDist)) < bThick) ||
                         (y >= center - bDist && y <= center - bDist + bLen && Math.abs(x - (center + bDist)) < bThick);

      const inBotLeft = (x >= center - bDist && x <= center - bDist + bLen && Math.abs(y - (center + bDist)) < bThick) ||
                        (y <= center + bDist && y >= center + bDist - bLen && Math.abs(x - (center - bDist)) < bThick);

      const inBotRight = (x <= center + bDist && x >= center + bDist - bLen && Math.abs(y - (center + bDist)) < bThick) ||
                         (y <= center + bDist && y >= center + bDist - bLen && Math.abs(x - (center + bDist)) < bThick);

      if (inTopLeft || inTopRight || inBotLeft || inBotRight) {
        r = 52; g = 211; b = 153; // Mint green scan brackets
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = 255;
    }
  }

  const deflated = zlib.deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', deflated),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

const iconsDir = path.join(__dirname, 'icons');
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), createAttendanceIcon(192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), createAttendanceIcon(512));
fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), createAttendanceIcon(180));
console.log('✅ Generated crisp 192, 512, and apple-touch-icon PNGs successfully!');
