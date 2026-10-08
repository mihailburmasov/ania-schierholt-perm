// Высокое разрешение из банка + цвет как в PDF-лукбуке.
// Для каждого канала строится LUT (сопоставление гистограмм) по уменьшенным копиям и применяется к оригиналу.

import fs from 'fs';
import sharp from 'sharp';

const [map, pdfDir, bankDir, outDir] = process.argv.slice(2);
const M = JSON.parse(fs.readFileSync(map));
fs.mkdirSync(outDir, { recursive: true });

const SMALL = { width: 440, height: 624, fit: 'fill' };
async function rgb(file, size) {
  let s = sharp(file);
  if (size) s = s.resize(size);
  const { data, info } = await s.toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}
function cdf(data, ch) {
  const h = new Float64Array(256);
  for (let i = ch; i < data.length; i += 3) h[data[i]]++;
  let s = 0; const n = data.length / 3;
  for (let v = 0; v < 256; v++) { s += h[v]; h[v] = s / n; }
  return h;
}
function lut(src, ref) {
  const L = new Uint8Array(256); let j = 0;
  for (let v = 0; v < 256; v++) { while (j < 255 && ref[j] < src[v]) j++; L[v] = j; }
  // сглаживание, чтобы не было ступенек
  const S = new Uint8Array(256);
  for (let v = 0; v < 256; v++) { let a = 0, k = 0; for (let d = -3; d <= 3; d++) { const x = v + d; if (x >= 0 && x < 256) { a += L[x]; k++; } } S[v] = Math.round(a / k); }
  return S;
}

for (const [pdf, bank] of Object.entries(M)) {
  if (process.argv[6] && !pdf.includes(process.argv[6])) continue;
  const ref = await rgb(`${pdfDir}/${pdf}`, SMALL);
  const src = await rgb(`${bankDir}/${bank}`, SMALL);
  const luts = [0, 1, 2].map((c) => lut(cdf(src.data, c), cdf(ref.data, c)));
  const full = await rgb(`${bankDir}/${bank}`);
  const d = full.data;
  for (let i = 0; i < d.length; i += 3) { d[i] = luts[0][d[i]]; d[i + 1] = luts[1][d[i + 1]]; d[i + 2] = luts[2][d[i + 2]]; }
  const out = `${outDir}/${pdf}`;
  await sharp(d, { raw: { width: full.info.width, height: full.info.height, channels: 3 } }).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
  console.log(pdf, '←', bank, full.info.width + 'x' + full.info.height, (fs.statSync(out).size / 1024 | 0) + ' KB');
}
