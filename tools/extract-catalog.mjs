// Извлекает фотографии, встроенные в PDF-каталог, в исходном разрешении (без наложенных подписей).
// Запуск: node tools/extract-catalog.mjs <файл.pdf> <папка-вывода> [префикс]
// Для каждой картинки печатает страницу, позицию на странице (bbox) и текст подписи под ней —
// по этому выводу заполняются data/products.json и data/looks.json.
import * as mupdf from "mupdf";
import sharp from "sharp";
import fs from "fs";
import path from "path";

const [pdf, outDir, prefix = "img"] = process.argv.slice(2);
if (!pdf || !outDir) {
  console.error("Использование: node tools/extract-catalog.mjs <файл.pdf> <папка-вывода> [префикс]");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const doc = mupdf.Document.openDocument(fs.readFileSync(pdf), "application/pdf");

for (let i = 0; i < doc.countPages(); i++) {
  const page = doc.loadPage(i);
  const images = [];
  const lines = [];
  page.toStructuredText("preserve-images").walk({
    onImageBlock(bbox, _m, image) { images.push({ bbox, image }); },
    beginLine(bbox) { lines.push({ bbox, text: "" }); },
    onChar(c) { lines[lines.length - 1].text += c; },
  });
  // порядок «сверху вниз, слева направо», а не порядок в потоке PDF
  images.sort((a, b) => (Math.abs(a.bbox[1] - b.bbox[1]) > 20 ? a.bbox[1] - b.bbox[1] : a.bbox[0] - b.bbox[0]));
  for (const [k, { bbox, image }] of images.entries()) {
    let pix = image.toPixmap();
    if (pix.getColorSpace()?.getName() !== "DeviceRGB") pix = pix.convertToColorSpace(mupdf.ColorSpace.DeviceRGB);
    const name = `${prefix}-p${String(i + 1).padStart(2, "0")}-${k + 1}.jpg`;
    // JPEG высокого качества: почти без потерь, но в разы легче PNG — исходники хранятся в git
    await sharp(Buffer.from(pix.asPNG())).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toFile(path.join(outDir, name));
    const caption = lines
      .filter((l) => l.bbox[1] > bbox[3] - 2 && l.bbox[1] < bbox[3] + 40 && l.bbox[0] >= bbox[0] - 5 && l.bbox[0] < bbox[2])
      .map((l) => l.text.trim()).join(" | ");
    const pageText = page.toStructuredText().asText().replace(/\s+/g, " ").trim();
    console.log(JSON.stringify({ file: name, page: i + 1, bbox: bbox.map(Math.round), w: pix.getWidth(), h: pix.getHeight(), caption, pageText: images.length === 1 ? pageText : undefined }));
  }
}
