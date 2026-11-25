// Собирает каталог из проверенного списка отмеченных клиенткой позиций.
import fs from 'node:fs';
const path = 'data/products.json';
const old = JSON.parse(fs.readFileSync(path, 'utf8'));
const selected = JSON.parse(fs.readFileSync('data/stock-selection.json', 'utf8')).items;
const colors = {
  ...old.colors,
  caramel: { name: 'Карамельный', de: 'Caramel', hex: '#c6ac8d' },
  coralle: { name: 'Коралловый', de: 'Coralle', hex: '#dd9685' },
  tinte: { name: 'Тёмно-синий', de: 'Tinte', hex: '#252b3d' },
  truffel: { name: 'Трюфельный', de: 'Trüffel', hex: '#686254' },
  tanne: { name: 'Хвойный', de: 'Tanne', hex: '#244a40' },
  krokant: { name: 'Серо-бежевый', de: 'Krokant', hex: '#9d9484' },
  fog: { name: 'Серый', de: 'Fog', hex: '#bebdb7' },
  violet: { name: 'Фиолетовый', de: 'Violet', hex: '#543a85' },
  mauve: { name: 'Мокко', de: 'Mauve', hex: '#55504e' },
  camel: { name: 'Кэмел', de: 'Camel', hex: '#ba9165' },
};
const titles = { JA: 'Жакет', BL: 'Блуза', MA: 'Пальто', HO: 'Брюки', RO: 'Юбка', PU: 'Джемпер', KL: 'Платье' };
const categories = [
  ...old.categories.filter((c) => !['PU', 'KL'].includes(c.type)),
  { id: 'trikotazh', name: 'Трикотаж', type: 'PU', seoTitle: 'Женский трикотаж Ania Schierholt' },
  { id: 'platya', name: 'Платья', type: 'KL', seoTitle: 'Платья Ania Schierholt' },
];
const previous = new Map(old.products.map((p) => [`${p.type} ${p.model}/${p.fabric}`, p]));
const products = [];
for (const item of selected) {
  const match = item.article.match(/^([A-Z]+) (\d{4})\/(\d{2})$/);
  if (!match) throw new Error(`Неверный артикул: ${item.article}`);
  const [, type, model, fabric] = match;
  if (!colors[item.color]) throw new Error(`Неизвестный цвет: ${item.color}`);
  const oldProduct = previous.get(item.article);
  products.push({
    type, model, fabric, collections: ['shop'],
    title: oldProduct?.title || titles[type],
    desc: `${titles[type]} ${item.article}, цвет «${colors[item.color].name.toLowerCase()}». Текущий размер и стоимость подскажет консультант бутика.`,
    features: [],
    variants: [{ color: item.color, alt: [], pack: [item.photo] }],
    source: { catalog: item.photo.split('/')[0], page: item.page },
    ...(item.sizesRu ? { sizesRu: item.sizesRu } : {}),
  });
}
const data = {
  _comment: 'Товары из отмеченных клиенткой PDF. Источник каждой карточки — поле source и data/stock-selection.json. Год коллекции в интерфейсе не выводится. Размеры без подтверждённой системы RU/DE уточняет консультант.',
  collections: { shop: { name: 'В бутике', short: 'В бутике' }, aw26: { name: 'Лукбук Ania Schierholt', short: 'Лукбук' } },
  categories, colors, products,
};
fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
console.log(`Собрано ${products.length} товаров из отмеченных PDF`);
