// Шаг 2: плавная местная поправка цвета под PDF. gain = blur(PDF) / blur(шаг 1) на грубой сетке.

import fs from 'fs';
import sharp from 'sharp';
const [pdfDir, inDir, outDir, GWs] = process.argv.slice(2);
const GW = Number(GWs || 20), GH = Math.round(GW * 1.42);
fs.mkdirSync(outDir, { recursive: true });
const grid = async (f) => sharp(await sharp(f).resize(GW * 4, GH * 4, { fit: 'fill' }).blur(5).toBuffer()).resize(GW, GH, { fit: 'fill' }).toColourspace('srgb').removeAlpha().raw().toBuffer();
for (const f of fs.readdirSync(inDir)) {
  const a = await grid(`${pdfDir}/${f}`), b = await grid(`${inDir}/${f}`);
  const gain = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) gain[i] = Math.max(0, Math.min(255, Math.round(128 * (a[i] + 6) / (b[i] + 6))));
  const full = await sharp(`${inDir}/${f}`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const G = await sharp(gain, { raw: { width: GW, height: GH, channels: 3 } }).resize(full.info.width, full.info.height, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer();
  const d = full.data;
  for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, Math.round(d[i] * G[i] / 128)));
  await sharp(d, { raw: { width: full.info.width, height: full.info.height, channels: 3 } }).jpeg({ quality: 88, mozjpeg: true }).toFile(`${outDir}/${f}`);
}
console.log('ok');
