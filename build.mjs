// Сборка сайта: data/*.json + _source/raw (фото из каталогов) + src/ → dist/
// Запуск: npm run build. Готовую папку dist/ целиком выкладывать на хостинг с PHP.
import fs from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const DIST = path.join(ROOT, "dist");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const site = read("data/site.json");
const cat = read("data/products.json");
const { looks } = read("data/looks.json");
const VERSION = Date.now().toString(36);
// BASE — подпапка, если сайт лежит не в корне домена (демо на GitHub Pages: BASE=/studio60-perm).
// В этом режиме сайт закрыт от индексации, а форма предупреждает, что заявки не отправляются.
const BASE = (process.env.BASE || "").replace(/\/$/, "");
const PREVIEW = !!BASE;

// ---------- утилиты ----------
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const write = (rel, html) => {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
};
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};
const rub = (n) => n.toLocaleString("ru-RU").replace(/ /g, " ") + " ₽";
const priceText = (p) => (p.price ? rub(p.price) : "Цена по запросу");
const credit = `https://sitomika.ru/?utm_source=${site.creditSlug}&amp;utm_medium=footer&amp;utm_campaign=client-sites`;

// ---------- фото ----------
// Каждое исходное фото режется на несколько ширин WebP; уже готовые файлы не пересобираются.
const imgCache = new Map();
async function img(srcRel, widths) {
  const key = srcRel + widths.join();
  if (imgCache.has(key)) return imgCache.get(key);
  const src = path.join(ROOT, "_source/raw", srcRel + ".jpg");
  const meta = await sharp(src).metadata();
  const base = srcRel.replace(/\//g, "-");
  const out = [];
  for (const w of widths) {
    const width = Math.min(w, meta.width);
    const rel = `img/${base}-${width}.webp`;
    const dest = path.join(DIST, rel);
    if (!fs.existsSync(dest) || fs.statSync(dest).mtimeMs < fs.statSync(src).mtimeMs) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await sharp(src).resize({ width }).webp({ quality: 80 }).toFile(dest);
    }
    out.push({ url: "/" + rel, w: width });
  }
  const res = {
    src: out[out.length - 1].url,
    small: out[0].url,
    srcset: out.map((o) => `${o.url} ${o.w}w`).join(", "),
    ratio: meta.height / meta.width,
    w: meta.width,
    h: meta.height,
  };
  imgCache.set(key, res);
  return res;
}
const LOOK_W = [480, 880];
const PACK_W = [480, 960, 1536];
const picture = (im, alt, { sizes = "(max-width: 700px) 50vw, 25vw", eager = false, cls = "" } = {}) =>
  `<img class="${cls}" src="${im.small}" srcset="${im.srcset}" sizes="${sizes}" width="${im.w}" height="${im.h}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;

// ---------- модель каталога ----------
const typeCat = Object.fromEntries(cat.categories.map((c) => [c.type, c]));
const colorName = (c) => cat.colors[c]?.name || c;
const colorShort = (c) => cat.colors[c]?.short || cat.colors[c]?.name || c;
const deToId = Object.fromEntries(Object.entries(cat.colors).map(([id, c]) => [c.de.toLowerCase(), id]));

const products = cat.products.map((p) => {
  const id = `${p.type}-${p.model}-${p.fabric}`.toLowerCase();
  const category = typeCat[p.type];
  return {
    ...p,
    id,
    article: `${p.type} ${p.model}/${p.fabric}`,
    category,
    slug: `${category.id}-${p.model}-${p.fabric}`,
    url: `/product/${category.id}-${p.model}-${p.fabric}/`,
    price: p.price ?? null,
    variants: p.variants.map((v) => ({ ...v, looks: [], images: [] })),
  };
});
const byArticle = new Map(); // "HO 3389/69 anthra" → [product, variant]
for (const p of products) for (const v of p.variants) byArticle.set(`${p.article} ${v.color}`, [p, v]);

const lookList = looks.map((l, i) => ({
  ...l,
  n: i + 1,
  items: l.items.map((a) => {
    const m = a.match(/^(\w+ \d+\/\d+) (\w+)$/);
    const hit = m && byArticle.get(`${m[1]} ${deToId[m[2].toLowerCase()]}`);
    if (!hit) console.warn("! артикул из образа не найден в каталоге:", a, "→", l.id);
    return hit ? { p: hit[0], v: hit[1] } : null;
  }).filter(Boolean),
}));
for (const l of lookList) for (const it of l.items) it.v.looks.push(l);

async function prepareImages() {
  for (const l of lookList) l.img = await img(l.image, LOOK_W);
  for (const p of products)
    for (const v of p.variants) {
      // сначала образы, где вещей меньше (сама вещь виднее); cover в products.json — ручной выбор обложки
      v.looks.sort((x, y) => (y.id === v.cover) - (x.id === v.cover) || x.items.length - y.items.length || x.n - y.n);
      if (v.pack) v.images.push(await img(v.pack, PACK_W));
      for (const l of v.looks) v.images.push(l.img);
      if (!v.images.length) console.warn("! нет фото:", p.article, v.color);
    }
}

// ---------- общий шаблон ----------
const nav = [
  ["/catalog/", "Каталог"],
  ["/looks/", "Образы"],
  ["/boutique/", "Бутик"],
  ["/delivery/", "Доставка и оплата"],
];
const messengerLinks = (cls = "") => [
  site.whatsapp && `<a class="${cls}" href="https://wa.me/${esc(site.whatsapp)}" target="_blank" rel="noopener" data-goal="messenger_click">WhatsApp</a>`,
  site.telegram && `<a class="${cls}" href="https://t.me/${esc(site.telegram)}" target="_blank" rel="noopener" data-goal="messenger_click">Telegram</a>`,
].filter(Boolean).join("");

const metrika = site.metrikaId
  ? `<script>window.dataLayer=window.dataLayer||[];(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${Number(site.metrikaId)},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true,ecommerce:"dataLayer"});</script><noscript><div><img src="https://mc.yandex.ru/watch/${Number(site.metrikaId)}" style="position:absolute;left:-9999px" alt=""></div></noscript>`
  : "";

function layout({ title, desc, path: pagePath, body, og, jsonld = [], main = "" , noindex = false}) {
  const canonical = site.domain + pagePath;
  const ogImg = site.domain + (og || "/img/og.jpg");
  const ld = jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("");
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
${noindex || PREVIEW ? '<meta name="robots" content="noindex">' : ""}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)} — ${esc(site.tagline)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImg}">
<meta property="og:locale" content="ru_RU">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f5f1eb">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/manrope-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/style.css?v=${VERSION}">
${ld}
${metrika}
</head>
<body class="${main}">
<a class="skip" href="#main">Перейти к содержимому</a>
<div class="topbar"><div class="wrap topbar__in">
  <span>Все вещи в наличии · Примерка в ${site.mall} · Доставка по России</span>
  <a href="tel:${site.phoneHref}" data-goal="phone_click">${esc(site.phone)}</a>
</div></div>
<header class="header"><div class="wrap header__in">
  <button class="burger" type="button" aria-label="Меню" aria-expanded="false" data-burger><span></span><span></span></button>
  <a class="logo" href="/" aria-label="${esc(site.name)} — на главную">
    <span class="logo__name">${esc(site.name)}</span>
    <span class="logo__sub">${esc(site.brand)} · ${esc(site.city)}</span>
  </a>
  <nav class="nav" aria-label="Основное меню" data-nav>
    ${nav.map(([h, t]) => `<a href="${h}"${pagePath.startsWith(h) ? ' aria-current="page"' : ""}>${t}</a>`).join("")}
    <div class="nav__mobile-extra">
      <a href="tel:${site.phoneHref}" data-goal="phone_click">${esc(site.phone)}</a>
      ${messengerLinks()}
      <span>${esc(site.addressShort)}</span>
    </div>
  </nav>
  <div class="header__actions">
    <a class="header__phone" href="tel:${site.phoneHref}" data-goal="phone_click">${esc(site.phone)}</a>
    <a class="cart-btn" href="/cart/" aria-label="Корзина" data-cart-open>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
      <span class="cart-btn__count" data-cart-count hidden>0</span>
    </a>
  </div>
</div></header>
<main id="main">
${body}
</main>
<footer class="footer"><div class="wrap">
  <div class="footer__grid">
    <div>
      <div class="logo logo--footer"><span class="logo__name">${esc(site.name)}</span><span class="logo__sub">${esc(site.brand)} · ${esc(site.city)}</span></div>
      <p class="footer__text">Монобрендовый бутик немецкой женской одежды ${esc(site.brand)}. Все вещи в наличии в Перми, отправляем по всей России.</p>
    </div>
    <div>
      <h3 class="footer__h">Каталог</h3>
      ${cat.categories.filter((c) => products.some((p) => p.category === c)).map((c) => `<a href="/catalog/${c.id}/">${esc(c.name)}</a>`).join("")}
    </div>
    <div>
      <h3 class="footer__h">Покупателям</h3>
      <a href="/looks/">Образы сезона</a>
      <a href="/delivery/">Доставка, оплата, возврат</a>
      <a href="/delivery/#sizes">Таблица размеров</a>
      <a href="/boutique/">Бутик и контакты</a>
    </div>
    <div>
      <h3 class="footer__h">Бутик</h3>
      <p>${esc(site.address)}${site.addressFloor ? ", " + esc(site.addressFloor) : ""}</p>
      <p>${esc(site.hours)}</p>
      <p><a href="tel:${site.phoneHref}" data-goal="phone_click">${esc(site.phone)}</a></p>
      <p><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>
      <div class="footer__msg">${messengerLinks("chip")}</div>
    </div>
  </div>
  <div class="footer__bottom">
    <span>© ${new Date().getFullYear()} ${esc(site.name)}. ${esc(site.legal.name)}, ИНН ${esc(site.legal.inn)}, ОГРНИП ${esc(site.legal.ogrnip)}</span>
    <div class="footer-bottom-links">
      <a href="/politika-konfidentsialnosti/">Политика конфиденциальности</a>
      <a href="/soglasie/">Согласие на обработку данных</a>
      <a class="footer-credit" href="${credit}" target="_blank" rel="noopener">Разработано в sitomika.ru</a>
    </div>
  </div>
  <p class="footer__note">${esc(site.brand)} — зарегистрированная торговая марка её правообладателя. Сайт принадлежит независимому продавцу. Информация на сайте не является публичной офертой; наличие, цену и размер подтверждает консультант.</p>
</div></footer>

<div class="drawer" data-drawer hidden>
  <div class="drawer__bg" data-drawer-close></div>
  <aside class="drawer__panel" role="dialog" aria-modal="true" aria-label="Корзина">
    <div class="drawer__head"><b>Ваш выбор</b><button type="button" class="icon-btn" data-drawer-close aria-label="Закрыть">✕</button></div>
    <div class="drawer__body" data-drawer-body></div>
    <div class="drawer__foot">
      <a class="btn btn--dark btn--block" href="/cart/">Оформить запрос</a>
      <button type="button" class="btn btn--ghost btn--block" data-drawer-close>Продолжить выбор</button>
      <button type="button" class="link link--sm drawer__clear" data-cart-clear>Очистить корзину</button>
    </div>
  </aside>
</div>

<div class="cookie" data-cookie hidden>
  <p>Мы используем cookie, чтобы сайт работал корректно${site.metrikaId ? ", и сервис Яндекс Метрика — чтобы понимать, как улучшить сайт" : ", и для работы встроенной карты"}. Продолжая пользоваться сайтом, вы соглашаетесь с этим. <a href="/politika-konfidentsialnosti/">Подробнее</a></p>
  <button type="button" class="btn btn--dark btn--sm" data-cookie-ok>Понятно</button>
</div>

<script>window.SITE=${JSON.stringify({ base: BASE, preview: PREVIEW, metrikaId: site.metrikaId ? Number(site.metrikaId) : null, phone: site.phone, phoneHref: site.phoneHref, sizes: site.sizes, sizeRu: site.sizeRu })};</script>
<script src="/assets/catalog.js?v=${VERSION}" defer></script>
<script src="/assets/app.js?v=${VERSION}" defer></script>
</body>
</html>`;
}

// ---------- компоненты ----------
const swatch = (c, extra = "") => `<span class="sw" style="--c:${cat.colors[c]?.hex || "#ccc"}" title="${esc(colorName(c))}"${extra}></span>`;

function card(p, opts = {}) {
  const v = p.variants[0];
  const [a, b] = v.images;
  const colors = p.variants.map((x) => x.color);
  return `<article class="card" data-card data-colors="${colors.join(" ")}" data-short="${p.short ? 1 : 0}" data-coll="${p.collections.join(" ")}" data-price="${p.price || ""}">
  <a class="card__media" href="${p.url}">
    ${a ? picture(a, `${p.title} ${p.article}, ${colorName(v.color)}`, { sizes: opts.sizes }) : ""}
    ${b ? picture(b, "", { sizes: opts.sizes, cls: "card__alt" }) : ""}
    <span class="card__tag">В наличии</span>
  </a>
  <div class="card__body">
    <div class="card__sw">${colors.map((c) => swatch(c)).join("")}${p.short ? '<span class="card__opt">есть укороченные</span>' : ""}</div>
    <h3 class="card__title"><a href="${p.url}">${esc(p.title)}</a></h3>
    <div class="card__meta"><span>${esc(p.article)}</span><span class="card__price">${priceText(p)}</span></div>
  </div>
</article>`;
}

const crumbs = (items) => `<nav class="crumbs" aria-label="Хлебные крошки">${items.map(([h, t], i) => (i < items.length - 1 ? `<a href="${h}">${esc(t)}</a><span>/</span>` : `<span aria-current="page">${esc(t)}</span>`)).join("")}</nav>`;
const crumbsLd = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([h, t], i) => ({ "@type": "ListItem", position: i + 1, name: t, item: site.domain + h })),
});

const steps = `<ol class="steps">
  <li><b>Выберите вещи и размер</b><span>Добавьте их в корзину. Не уверены в размере — отметьте «помочь с размером».</span></li>
  <li><b>Отправьте запрос</b><span>Оплачивать на сайте ничего не нужно. Запрос придёт консультанту бутика.</span></li>
  <li><b>Консультант перезвонит</b><span>Подтвердит наличие, поможет с посадкой, расскажет про оплату и доставку или отложит вещи на примерку.</span></li>
</ol>`;

const trust = `<ul class="trust">
  <li><b>Всё в наличии</b><span>Вещи уже в Перми, не под заказ</span></li>
  <li><b>Примерка в бутике</b><span>Отложим к вашему приходу</span></li>
  <li><b>Доставка по России</b><span>Отправим в любой город</span></li>
  <li><b>Оплата после звонка</b><span>Без предоплаты на сайте</span></li>
</ul>`;

function callbackForm(source, title = "Нужна консультация?", text = "Оставьте телефон — подскажем по размеру, сочетаниям и наличию, пришлём дополнительные фото.") {
  return `<section class="callback"><div class="wrap callback__in">
  <div><h2 class="h2">${esc(title)}</h2><p class="lead">${esc(text)}</p></div>
  <form class="form form--inline" data-form="callback" data-source="${esc(source)}" novalidate>
    <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="field"><span>Имя</span><input name="name" autocomplete="given-name" required></label>
    <label class="field"><span>Телефон</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="+7"></label>
    <button class="btn btn--dark" type="submit">Перезвоните мне</button>
    <label class="check"><input type="checkbox" name="consent" value="1" required><span>Даю <a href="/soglasie/" target="_blank">согласие на обработку персональных данных</a> в соответствии с <a href="/politika-konfidentsialnosti/" target="_blank">политикой</a></span></label>
    <p class="form__msg" data-form-msg role="status"></p>
  </form>
</div></section>`;
}

const mapEmbed = `<div class="map"><iframe title="Бутик на карте" src="https://yandex.ru/map-widget/v1/?text=${encodeURIComponent(`${site.city}, ${site.street}, ${site.mall.replace(/[«»]/g, "")}`)}&amp;z=16" loading="lazy" allowfullscreen></iframe></div>`;

const sizeTable = `<div class="table-wrap"><table class="sizes">
  <thead><tr><th>Размер бренда (DE)</th>${site.sizes.map((s) => `<th>${s}</th>`).join("")}</tr></thead>
  <tbody>
    <tr><th>Российский размер</th>${site.sizes.map((s) => `<td>${site.sizeRu[s]}</td>`).join("")}</tr>
    <tr><th>Обхват груди, см</th>${[80, 84, 88, 92, 96, 100, 104].map((x) => `<td>${x}</td>`).join("")}</tr>
    <tr><th>Обхват талии, см</th>${[64, 68, 72, 76, 80, 84, 88].map((x) => `<td>${x}</td>`).join("")}</tr>
    <tr><th>Обхват бёдер, см</th>${[90, 94, 97, 100, 103, 106, 110].map((x) => `<td>${x}</td>`).join("")}</tr>
  </tbody></table></div>
<p class="note">Таблица ориентировочная, по стандарту немецких размеров. Модели Ania Schierholt часто свободного кроя — консультант подскажет посадку конкретной вещи и при необходимости измерит изделие.</p>`;

// ---------- страницы ----------
const ldStore = {
  "@context": "https://schema.org",
  "@type": "ClothingStore",
  name: `${site.name} — ${site.brand}`,
  url: site.domain + "/",
  telephone: site.phone,
  email: site.email,
  image: site.domain + "/img/og.jpg",
  address: { "@type": "PostalAddress", streetAddress: `${site.street}, ${site.mall}`, addressLocality: site.city, addressCountry: "RU" },
  openingHours: site.hoursSchema,
  brand: { "@type": "Brand", name: site.brand },
};

const faq = [
  ["Как оплатить заказ?", "На сайте оплачивать ничего не нужно. После вашего запроса консультант перезвонит, подтвердит наличие и размер и предложит удобный способ оплаты. В бутике можно оплатить на месте после примерки."],
  ["Можно ли сначала примерить?", `Да. Отметьте в запросе «примерка в бутике» — мы отложим вещи в нужных размерах, и вы примерите их в ${site.mall} (${site.addressShort}).`],
  ["Отправляете ли вы в другие города?", "Да, отправляем по всей России. Способ и стоимость доставки консультант рассчитает при звонке."],
  ["Как подобрать размер?", "У бренда немецкая размерная сетка: 38 DE соответствует 44 российскому. Таблица — на странице «Доставка и оплата». Если сомневаетесь, отметьте «помочь с размером» — консультант уточнит ваши параметры и посадку модели."],
  ["Почему не указаны цены?", "Цены появятся на сайте в ближайшее время. Пока консультант сообщит актуальную стоимость при звонке — это займёт пару минут."],
  ["Можно ли вернуть вещь?", "Да, при покупке с доставкой вещь надлежащего качества можно вернуть в течение 7 дней после получения, если сохранены товарный вид и ярлыки. Подробности — на странице «Доставка и оплата»."],
];
const faqHtml = `<div class="faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>`;
const faqLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };

function pageHome() {
  const L = (n) => lookList.find((l) => l.n === n);
  const heroLooks = [L(8), L(1), L(24)];
  const capsules = [
    ["caper", "Каперс", "Глубокий оливковый: жакеты, юбка миди, длинный стёганый жилет", L(3)],
    ["muschel", "Ракушка", "Светлый бежевый: пальто-халат, брюки на мягком поясе, белые блузы", L(11)],
    ["anthra", "Антрацит", "Графит для города: костюмы, стёганые жилеты, широкие брюки", L(25)],
  ];
  const catTiles = cat.categories
    .map((c) => ({ c, list: products.filter((p) => p.category === c) }))
    .filter((x) => x.list.length);
  const featured = ["ho-3389-69", "ma-3362-69", "ja-3351-66", "we-3360-49", "bl-3337-42", "ja-3358-69", "ro-3396-66", "ho-3378-69"].map((id) => products.find((p) => p.id === id));
  const body = `
<section class="hero"><div class="wrap hero__in">
  <div class="hero__text">
    <p class="kicker">Новая коллекция · Осень–зима 2026</p>
    <h1 class="h1">${esc(site.brand)}<br><em>в Перми</em></h1>
    <p class="lead"><span class="hide-m">Немецкая женская одежда из Штутгарта: мягкие костюмы, широкие брюки, стёганые жилеты в спокойных цветах сезона. </span>Все вещи в наличии в бутике в ${site.mall}. Выберите онлайн — консультант перезвонит, поможет с размером и отправит по России.</p>
    <div class="hero__cta">
      <a class="btn btn--dark" href="/catalog/">Смотреть каталог</a>
      <a class="btn btn--ghost" href="/boutique/">Примерить в бутике</a>
    </div>
  </div>
  <div class="hero__media">
    ${heroLooks.map((l, i) => `<a href="/looks/#${l.id}" class="hero__img hero__img--${i + 1}">${picture(l.img, "Образ из коллекции Ania Schierholt осень–зима 2026", { sizes: i === 0 ? "(max-width: 900px) 60vw, 45vw" : "(max-width: 900px) 40vw, 25vw", eager: i === 0 })}</a>`).join("")}
  </div>
</div></section>
<section class="band"><div class="wrap">${trust}</div></section>

<section class="section"><div class="wrap">
  <div class="section__head"><h2 class="h2">Каталог</h2><a class="link" href="/catalog/">Все вещи · ${products.length}</a></div>
  <div class="cats">
    ${catTiles.map(({ c, list }) => `<a class="cat" href="/catalog/${c.id}/">${list[0].variants[0].images[0] ? picture(list[0].variants[0].images[0], c.name, { sizes: "(max-width: 700px) 50vw, 14vw" }) : ""}<span class="cat__name">${esc(c.name)}</span><span class="cat__n">${list.length} ${plural(list.length, "модель", "модели", "моделей")}</span></a>`).join("")}
  </div>
</div></section>

<section class="section section--tint"><div class="wrap">
  <div class="section__head"><div><p class="kicker">Палитра сезона</p><h2 class="h2">Три цвета — один гардероб</h2></div></div>
  <p class="lead lead--narrow">Вещи коллекции сочетаются внутри своего цвета и между цветами: жакет «каперс» носится с брюками «антрацит», блуза «ракушка» — с любыми брюками. Собирайте капсулу, а не отдельные покупки.</p>
  <div class="capsules">
    ${capsules.map(([c, name, text, l]) => `<a class="capsule" href="/catalog/?color=${c}">${picture(l.img, `Капсула ${name}`, { sizes: "(max-width: 700px) 100vw, 33vw" })}<span class="capsule__txt">${swatch(c)}<b>${name}</b><span>${esc(text)}</span><span class="link">Смотреть вещи</span></span></a>`).join("")}
  </div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section__head"><h2 class="h2">Хиты сезона</h2><a class="link" href="/catalog/">Весь каталог</a></div>
  <div class="grid">${featured.map((p) => card(p)).join("")}</div>
</div></section>

<section class="section section--dark"><div class="wrap">
  <div class="section__head"><div><p class="kicker">Лукбук AW26</p><h2 class="h2">Готовые образы</h2></div><a class="link" href="/looks/">Все ${lookList.length} образов</a></div>
  <p class="lead lead--narrow">Каждый образ из лукбука можно заказать целиком — в один клик, а размер уточнить с консультантом.</p>
  <div class="strip">${lookList.filter((_, i) => i % 3 === 0).map((l) => `<a class="strip__item" href="/looks/#${l.id}">${picture(l.img, `Образ ${l.n}`, { sizes: "(max-width: 700px) 45vw, 16vw" })}<span>${l.items.length} ${plural(l.items.length, "вещь", "вещи", "вещей")}</span></a>`).join("")}</div>
</div></section>

<section class="section"><div class="wrap split">
  <div>
    <p class="kicker">Как заказать</p>
    <h2 class="h2">Без оплаты на сайте</h2>
    <p class="lead">Мы не просим платить заранее за то, что вы ещё не видели. Сначала разговор с консультантом, потом — оплата удобным способом.</p>
    ${steps}
  </div>
  <div class="brand-box">
    <p class="kicker">О бренде</p>
    <h2 class="h2">${esc(site.brand)}</h2>
    <p>Немецкая марка женской одежды из Штутгарта. Дизайнер бренда с первой коллекции работает со спокойной нейтральной палитрой и современной, удобной посадкой: высокие мягкие пояса, свободные жакеты, брюки, которые не нужно «терпеть».</p>
    <p>Бренд представлен в бутиках Германии, Австрии, Швейцарии, Великобритании, Нидерландов, США и других стран. В Перми коллекция ${esc(site.brand)} — в бутике ${esc(site.name)} в ${site.mall}.</p>
  </div>
</div></section>

<section class="section section--tint"><div class="wrap split">
  <div>
    <p class="kicker">Бутик в Перми</p>
    <h2 class="h2">Приходите на примерку</h2>
    <p class="lead">${esc(site.address)}${site.addressFloor ? ", " + esc(site.addressFloor) : ""}</p>
    <p>${esc(site.hours)}</p>
    <p>Отметьте в запросе «примерка в бутике» — отложим нужные размеры к вашему приходу.</p>
    <div class="btn-row"><a class="btn btn--dark" href="tel:${site.phoneHref}" data-goal="phone_click">Позвонить</a><a class="btn btn--ghost" href="/boutique/">Как добраться</a></div>
  </div>
  ${mapEmbed}
</div></section>

<section class="section"><div class="wrap narrow">
  <h2 class="h2">Частые вопросы</h2>
  ${faqHtml}
</div></section>
${callbackForm("Главная")}`;
  write("index.html", layout({
    title: `${site.brand} в Перми — женская одежда в наличии | ${site.name}`,
    desc: `Бутик ${site.brand} в Перми, ${site.mall}. Коллекция осень–зима 2026: брюки, жакеты, блузы, пальто, жилеты. Всё в наличии, примерка в бутике, доставка по России.`,
    path: "/",
    body,
    main: "page-home",
    jsonld: [ldStore, faqLd],
  }));
}

function catalogFilters(list) {
  const colors = [...new Set(list.flatMap((p) => p.variants.map((v) => v.color)))];
  const hasShort = list.some((p) => p.short);
  return `<div class="filters" data-filters>
    <div class="filters__group" role="group" aria-label="Цвет">
      <button type="button" class="fchip is-on" data-color="">Все цвета</button>
      ${colors.map((c) => `<button type="button" class="fchip" data-color="${c}">${swatch(c)}${esc(colorShort(c))}</button>`).join("")}
    </div>
    ${hasShort ? `<label class="check check--sm"><input type="checkbox" data-short-filter><span>Есть укороченная длина</span></label>` : ""}
    <span class="filters__count" data-count></span>
  </div>`;
}

function pageCatalog(category) {
  const list = category ? products.filter((p) => p.category === category) : products;
  const title = category ? category.name : "Каталог";
  const pagePath = category ? `/catalog/${category.id}/` : "/catalog/";
  const cr = [["/", "Главная"], ["/catalog/", "Каталог"], ...(category ? [[pagePath, category.name]] : [])];
  const body = `
<div class="wrap">
  ${crumbs(cr)}
  <div class="page-head">
    <h1 class="h1 h1--page">${esc(category ? category.seoTitle : `${site.brand}: каталог`)}</h1>
    <p class="lead">Коллекция осень–зима 2026. Все вещи в наличии в Перми — выберите модель и размер, консультант перезвонит и всё уточнит.</p>
  </div>
  <nav class="cat-chips" aria-label="Категории">
    <a href="/catalog/" class="chip${!category ? " is-on" : ""}">Все <sup>${products.length}</sup></a>
    ${cat.categories.map((c) => ({ c, n: products.filter((p) => p.category === c).length })).filter((x) => x.n).map(({ c, n }) => `<a href="/catalog/${c.id}/" class="chip${category === c ? " is-on" : ""}">${esc(c.name)} <sup>${n}</sup></a>`).join("")}
  </nav>
  ${catalogFilters(list)}
  <div class="grid" data-grid>${list.map((p) => card(p)).join("")}</div>
  <p class="empty" data-empty hidden>По выбранным фильтрам ничего нет. <button type="button" class="link" data-reset>Сбросить фильтры</button></p>
</div>
<section class="section"><div class="wrap">${steps}</div></section>
${callbackForm("Каталог: " + title, "Не нашли нужное?", "Расскажите, что ищете, — подберём из наличия в бутике и пришлём фото в мессенджер.")}`;
  write(pagePath.slice(1) + "index.html", layout({
    title: category ? `${category.seoTitle} — купить в Перми | ${site.name}` : `Каталог ${site.brand} — купить в Перми с доставкой по России | ${site.name}`,
    desc: category
      ? `${category.seoTitle}: ${list.length} ${plural(list.length, "модель", "модели", "моделей")} в наличии в бутике в ${site.mall}, Пермь. Примерка, доставка по России, оплата после звонка консультанта.`
      : `Все вещи ${site.brand} коллекции осень–зима 2026 в наличии в Перми: брюки, жакеты, блузы, пальто, жилеты. Доставка по России, примерка в бутике.`,
    path: pagePath,
    body,
    main: "page-catalog",
    jsonld: [crumbsLd(cr)],
  }));
}

function lookBlock(l, currentId) {
  return `<div class="look" id="${l.id}">
  <a class="look__img" href="${l.img.src}" data-zoom>${picture(l.img, `Образ ${l.n}: ${l.items.map((it) => it.p.title).join(", ")}`, { sizes: "(max-width: 700px) 100vw, 30vw" })}</a>
  <div class="look__body">
    <p class="kicker">Образ ${l.n} · ${esc(cat.collections[l.collection].name)}</p>
    <ul class="look__items">
      ${l.items.map(({ p, v }) => `<li${p.id === currentId ? ' class="is-current"' : ""}>
        <a href="${p.url}?c=${v.color}" class="look__thumb">${v.images[0] ? picture(v.pack ? v.images[0] : v.images[0], p.title, { sizes: "80px" }) : ""}</a>
        <div><a href="${p.url}?c=${v.color}">${esc(p.title)}</a><span>${esc(p.article)} · ${esc(colorShort(v.color))} · ${priceText(p)}</span></div>
      </li>`).join("")}
    </ul>
    <button type="button" class="btn btn--dark" data-add-look='${JSON.stringify(l.items.map(({ p, v }) => ({ id: p.id, color: v.color })))}'>Добавить образ целиком</button>
    <p class="note">Размер для каждой вещи можно выбрать в корзине или уточнить с консультантом.</p>
  </div>
</div>`;
}

function pageProduct(p) {
  const cr = [["/", "Главная"], ["/catalog/", "Каталог"], [`/catalog/${p.category.id}/`, p.category.name], [p.url, p.title]];
  const siblings = products.filter((x) => x.model === p.model && x.type === p.type && x !== p);
  const sameCat = products.filter((x) => x.category === p.category && x !== p && !siblings.includes(x)).slice(0, 4);
  const v0 = p.variants[0];
  const galleries = p.variants.map((v, i) => `<div class="gallery" data-gallery="${v.color}"${i ? " hidden" : ""}>
      <div class="gallery__main" data-gallery-track>
        ${v.images.map((im, k) => `<a class="gallery__slide" href="${im.src}" data-zoom>${picture(im, `${p.title} ${p.article}, цвет ${colorName(v.color)}, фото ${k + 1}`, { sizes: "(max-width: 900px) 100vw, 50vw", eager: i === 0 && k === 0 })}</a>`).join("")}
      </div>
      ${v.images.length > 1 ? `<div class="gallery__thumbs">${v.images.map((im, k) => `<button type="button" data-thumb="${k}" aria-label="Фото ${k + 1}"${k === 0 ? ' class="is-on"' : ""}><img src="${im.small}" alt="" loading="lazy" width="${im.w}" height="${im.h}"></button>`).join("")}</div>` : ""}
    </div>`).join("");

  const altColors = (v) => v.alt.filter((c) => !p.variants.some((x) => x.color === c));
  const looksHtml = p.variants.map((v, i) => `<div data-variant-block="${v.color}"${i ? " hidden" : ""}>${v.looks.length ? `<div class="looks-list">${v.looks.slice(0, 2).map((l) => lookBlock(l, p.id)).join("")}</div>` : `<p class="lead">Эта вещь легко сочетается с моделями из того же цвета — посмотрите <a class="link" href="/catalog/?color=${v.color}">всё в цвете «${esc(colorShort(v.color))}»</a>.</p>`}</div>`).join("");

  const body = `
<div class="wrap">
  ${crumbs(cr)}
  <div class="product" data-product="${p.id}">
    <div class="product__media">${galleries}</div>
    <div class="product__info">
      <p class="kicker">${esc(site.brand)} · ${p.collections.map((c) => esc(cat.collections[c].name)).join(" · ")}</p>
      <h1 class="h1 h1--product">${esc(p.title)}</h1>
      <p class="product__art">Артикул ${esc(p.article)} <span data-color-name>· ${esc(colorName(v0.color))}</span></p>
      <p class="product__price">${priceText(p)}${p.price ? "" : '<span class="note">консультант сообщит стоимость при звонке</span>'}</p>
      <p class="stock"><span class="dot"></span>В наличии в бутике в Перми</p>

      <div class="opt">
        <div class="opt__label">Цвет: <b data-color-label>${esc(colorName(v0.color))}</b></div>
        <div class="opt__row">${p.variants.map((v, i) => `<button type="button" class="swb${i ? "" : " is-on"}" data-variant="${v.color}" aria-label="${esc(colorName(v.color))}" aria-pressed="${i ? "false" : "true"}">${swatch(v.color)}</button>`).join("")}</div>
        ${p.variants.map((v, i) => (altColors(v).length ? `<p class="note" data-variant-block="${v.color}"${i ? " hidden" : ""}>У бренда эта модель есть также в цветах: ${altColors(v).map(colorShort).join(", ").toLowerCase()} — наличие уточнит консультант.</p>` : "")).join("")}
        ${siblings.length ? `<p class="note">Та же модель в другой ткани: ${siblings.map((s) => `<a class="link" href="${s.url}">${esc(s.article)} · ${esc(colorShort(s.variants[0].color))}</a>`).join(", ")}</p>` : ""}
      </div>

      <div class="opt">
        <div class="opt__label">Размер <span class="note">DE / RU</span><button type="button" class="link link--sm" data-modal-open="sizes">Таблица размеров</button></div>
        <div class="opt__row sizes-row" role="radiogroup" aria-label="Размер">
          ${site.sizes.map((s) => `<button type="button" class="size" data-size="${s}" role="radio" aria-checked="false">${s}<small>${site.sizeRu[s]}</small></button>`).join("")}
          <button type="button" class="size size--help" data-size="help" role="radio" aria-checked="false">Помочь с размером</button>
        </div>
      </div>

      ${p.short ? `<div class="opt">
        <div class="opt__label">Длина</div>
        <div class="opt__row">
          <button type="button" class="pill is-on" data-length="стандартная">Стандартная</button>
          <button type="button" class="pill" data-length="укороченная">Укороченная</button>
        </div>
        <p class="note">Укороченная версия — по наличию, консультант уточнит.</p>
      </div>` : ""}

      <div class="product__cta">
        <button type="button" class="btn btn--dark btn--block" data-add>Добавить в корзину</button>
        <p class="form__msg" data-add-msg role="status"></p>
        <div class="btn-row">
          <button type="button" class="btn btn--ghost" data-modal-open="ask">Задать вопрос</button>
          <a class="btn btn--ghost" href="tel:${site.phoneHref}" data-goal="phone_click">Позвонить</a>
        </div>
      </div>

      <div class="product__desc">
        <p>${esc(p.desc)}</p>
        <ul class="ticks">${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      </div>

      <div class="faq faq--compact">
        <details><summary>Как оформить и оплатить</summary><p>Добавьте вещь в корзину и отправьте запрос — это бесплатно и ни к чему не обязывает. Консультант перезвонит, подтвердит размер и предложит способ оплаты. Оплаты на сайте нет.</p></details>
        <details><summary>Доставка и примерка</summary><p>Самовывоз и примерка в бутике в ${site.mall} (${esc(site.addressShort)}), доставка по Перми и отправка в любой город России. <a class="link" href="/delivery/">Подробнее</a></p></details>
        <details><summary>Обмен и возврат</summary><p>Вещь надлежащего качества можно вернуть в течение 7 дней после получения при сохранении товарного вида и ярлыков. <a class="link" href="/delivery/#return">Условия</a></p></details>
      </div>
    </div>
  </div>
</div>

<section class="section section--tint"><div class="wrap">
  <div class="section__head"><div><p class="kicker">Как носить</p><h2 class="h2">Образ целиком</h2></div><a class="link" href="/looks/">Все образы</a></div>
  ${looksHtml}
</div></section>

${sameCat.length ? `<section class="section"><div class="wrap">
  <div class="section__head"><h2 class="h2">Ещё ${esc(p.category.name.toLowerCase())}</h2><a class="link" href="/catalog/${p.category.id}/">Смотреть все</a></div>
  <div class="grid">${sameCat.map((x) => card(x)).join("")}</div>
</div></section>` : ""}

<div class="sticky-buy" data-sticky-buy hidden>
  <div><b>${esc(p.title)}</b><span>${priceText(p)}</span></div>
  <button type="button" class="btn btn--dark" data-add-sticky>В корзину</button>
</div>

<div class="modal" data-modal="sizes" hidden><div class="modal__bg" data-modal-close></div><div class="modal__panel" role="dialog" aria-modal="true" aria-label="Таблица размеров">
  <button type="button" class="icon-btn modal__x" data-modal-close aria-label="Закрыть">✕</button>
  <h2 class="h2">Таблица размеров</h2>${sizeTable}
</div></div>

<div class="modal" data-modal="ask" hidden><div class="modal__bg" data-modal-close></div><div class="modal__panel" role="dialog" aria-modal="true" aria-label="Вопрос о товаре">
  <button type="button" class="icon-btn modal__x" data-modal-close aria-label="Закрыть">✕</button>
  <h2 class="h2">Вопрос о модели</h2>
  <p class="note">${esc(p.title)}, ${esc(p.article)}</p>
  <form class="form" data-form="question" data-source="Вопрос: ${esc(p.article)} ${esc(p.title)}" novalidate>
    <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="field"><span>Имя</span><input name="name" autocomplete="given-name" required></label>
    <label class="field"><span>Телефон</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="+7"></label>
    <label class="field"><span>Вопрос</span><textarea name="comment" rows="3" placeholder="Например: какая посадка на мой рост 168 см? Пришлите фото на модели."></textarea></label>
    <label class="check"><input type="checkbox" name="consent" value="1" required><span>Даю <a href="/soglasie/" target="_blank">согласие на обработку персональных данных</a></span></label>
    <button class="btn btn--dark btn--block" type="submit">Отправить</button>
    <p class="form__msg" data-form-msg role="status"></p>
  </form>
</div></div>`;

  const ldProduct = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${p.title} ${site.brand} ${p.article}`,
    sku: p.article,
    brand: { "@type": "Brand", name: site.brand },
    description: p.desc,
    image: p.variants.flatMap((v) => v.images.slice(0, 2).map((im) => site.domain + im.src)),
    color: p.variants.map((v) => colorName(v.color)).join(", "),
    category: p.category.name,
    ...(p.price ? { offers: { "@type": "Offer", price: p.price, priceCurrency: "RUB", availability: "https://schema.org/InStock", url: site.domain + p.url } } : {}),
  };
  write(`product/${p.slug}/index.html`, layout({
    title: `${p.title} ${site.brand} ${p.article} — купить в Перми | ${site.name}`,
    desc: `${p.title} ${site.brand}, артикул ${p.article}, ${p.variants.map((v) => colorName(v.color).toLowerCase()).join(", ")}. В наличии в Перми, ${site.mall}. Примерка, доставка по России, оплата после звонка.`,
    path: p.url,
    og: v0.images[0]?.src,
    body,
    main: "page-product",
    jsonld: [ldProduct, crumbsLd(cr)],
  }));
}

function pageLooks() {
  const cr = [["/", "Главная"], ["/looks/", "Образы"]];
  const body = `<div class="wrap">
  ${crumbs(cr)}
  <div class="page-head"><h1 class="h1 h1--page">Образы осень–зима 2026</h1>
  <p class="lead">${lookList.length} готовых образов из лукбука ${esc(site.brand)}. Добавьте образ целиком — размер каждой вещи выберете в корзине или вместе с консультантом.</p></div>
  <div class="looks-list looks-list--all">${lookList.map((l) => lookBlock(l)).join("")}</div>
</div>`;
  write("looks/index.html", layout({
    title: `Образы ${site.brand} осень–зима 2026 — лукбук | ${site.name}`,
    desc: `Лукбук ${site.brand} осень–зима 2026: ${lookList.length} готовых образов. Закажите образ целиком с примеркой в Перми или доставкой по России.`,
    path: "/looks/",
    body,
    main: "page-looks",
    jsonld: [crumbsLd(cr)],
  }));
}

function pageBoutique() {
  const cr = [["/", "Главная"], ["/boutique/", "Бутик"]];
  const body = `<div class="wrap">
  ${crumbs(cr)}
  <div class="page-head"><h1 class="h1 h1--page">Бутик ${esc(site.brand)} в Перми</h1>
  <p class="lead">Вся коллекция — вживую, в ${site.mall}. Примерьте, почувствуйте ткани, соберите образ вместе с консультантом.</p></div>
  <div class="split split--top">
    <div class="contacts">
      <dl>
        <dt>Адрес</dt><dd>${esc(site.address)}${site.addressFloor ? ", " + esc(site.addressFloor) : ""}</dd>
        <dt>Часы работы</dt><dd>${esc(site.hours)}</dd>
        <dt>Телефон</dt><dd><a href="tel:${site.phoneHref}" data-goal="phone_click">${esc(site.phone)}</a></dd>
        <dt>Почта</dt><dd><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></dd>
        ${messengerLinks() ? `<dt>Мессенджеры</dt><dd class="footer__msg">${messengerLinks("chip")}</dd>` : ""}
      </dl>
      <h2 class="h3">Примерка по записи</h2>
      <p>Выберите вещи на сайте и в запросе отметьте «примерка в бутике» — мы отложим нужные размеры, и к вашему приходу всё будет готово. Можно прийти и без записи.</p>
      <a class="btn btn--dark" href="/catalog/">Выбрать вещи для примерки</a>
    </div>
    ${mapEmbed}
  </div>
</div>
${callbackForm("Бутик", "Хотите прийти на примерку?", "Оставьте телефон — договоримся о времени и подготовим вещи в ваших размерах.")}`;
  write("boutique/index.html", layout({
    title: `Бутик ${site.brand} в Перми, ${site.mall} — адрес и контакты | ${site.name}`,
    desc: `Бутик ${site.brand} в Перми: ${site.address}. ${site.hours}. Примерка, консультация, доставка по России.`,
    path: "/boutique/",
    body,
    jsonld: [ldStore, crumbsLd(cr)],
  }));
}

function pageDelivery() {
  const cr = [["/", "Главная"], ["/delivery/", "Доставка и оплата"]];
  const body = `<div class="wrap narrow">
  ${crumbs(cr)}
  <div class="page-head"><h1 class="h1 h1--page">Доставка, оплата и возврат</h1></div>
  <div class="prose">
  <h2 class="h3">Как проходит заказ</h2>
  ${steps}
  <h2 class="h3">Доставка</h2>
  <ul>
    <li><b>Самовывоз и примерка в бутике</b> — ${esc(site.address)}. Отложим вещи к вашему приходу.</li>
    <li><b>Доставка по Перми</b> — курьером в удобное время, условия уточнит консультант.</li>
    <li><b>Доставка по России</b> — отправляем транспортной компанией в любой город. Стоимость и сроки консультант рассчитает при звонке.</li>
  </ul>
  <h2 class="h3">Оплата</h2>
  <p>На сайте оплаты нет: вы отправляете запрос, консультант перезванивает, подтверждает наличие и размер и предлагает удобный способ оплаты. В бутике оплатить можно на месте после примерки.</p>
  <h2 class="h3" id="sizes">Таблица размеров</h2>
  ${sizeTable}
  <h2 class="h3" id="return">Обмен и возврат</h2>
  <p>При покупке с доставкой вы можете отказаться от вещи надлежащего качества в течение 7 дней после получения, если сохранены её товарный вид, потребительские свойства и фабричные ярлыки, а также документ о покупке (ст. 26.1 Закона «О защите прав потребителей»). Деньги возвращаются не позднее 10 дней с момента получения возврата; стоимость доставки не возвращается.</p>
  <p>При покупке в бутике обмен вещи надлежащего качества возможен в течение 14 дней, если она не была в употреблении и сохранены ярлыки (ст. 25 того же закона).</p>
  <p>Чтобы оформить возврат или обмен, позвоните по телефону <a href="tel:${site.phoneHref}">${esc(site.phone)}</a> или напишите на <a href="mailto:${esc(site.email)}">${esc(site.email)}</a>.</p>
  <h2 class="h3">Продавец</h2>
  <p>${esc(site.legal.name)}, ИНН ${esc(site.legal.inn)}, ОГРНИП ${esc(site.legal.ogrnip)}. Адрес: ${esc(site.address)}.</p>
  </div>
</div>`;
  write("delivery/index.html", layout({
    title: `Доставка, оплата и возврат | ${site.name} — ${site.brand} в Перми`,
    desc: `Как заказать ${site.brand} в бутике ${site.name}: примерка в ${site.mall}, доставка по Перми и России, оплата после звонка консультанта, таблица размеров, возврат.`,
    path: "/delivery/",
    body,
    jsonld: [crumbsLd(cr)],
  }));
}

function pageCart() {
  const body = `<div class="wrap">
  ${crumbs([["/", "Главная"], ["/cart/", "Корзина"]])}
  <div class="page-head"><h1 class="h1 h1--page">Запрос на покупку</h1>
  <p class="lead">Оплачивать на сайте ничего не нужно. Отправьте запрос — консультант перезвонит, подтвердит наличие и размеры, расскажет про оплату и доставку.</p></div>
  <div class="checkout">
    <div>
      <div class="cart-lines" data-cart-lines></div>
      <div class="cart-actions" data-cart-actions><button type="button" class="link link--sm" data-cart-clear>Очистить корзину</button></div>
      <div class="cart-empty" data-cart-empty hidden>
        <p class="lead">В корзине пока пусто.</p>
        <a class="btn btn--dark" href="/catalog/">Перейти в каталог</a>
      </div>
    </div>
    <form class="form checkout__form" data-form="order" data-source="Корзина" novalidate>
      <h2 class="h3">Ваши контакты</h2>
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label class="field"><span>Имя *</span><input name="name" autocomplete="name" required></label>
      <label class="field"><span>Телефон *</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="+7"></label>
      <label class="field"><span>Город</span><input name="city" autocomplete="address-level2" value="Пермь"></label>
      <fieldset class="field">
        <legend>Как получить</legend>
        <label class="radio"><input type="radio" name="delivery" value="Примерка и самовывоз в бутике" checked><span>Примерка и самовывоз в бутике<small>${esc(site.addressShort)}</small></span></label>
        <label class="radio"><input type="radio" name="delivery" value="Доставка по Перми"><span>Доставка по Перми</span></label>
        <label class="radio"><input type="radio" name="delivery" value="Доставка в другой город России"><span>Доставка в другой город России</span></label>
      </fieldset>
      <label class="field"><span>Комментарий</span><textarea name="comment" rows="3" placeholder="Рост, привычный размер, удобное время для звонка"></textarea></label>
      <label class="check"><input type="checkbox" name="consent" value="1" required><span>Даю <a href="/soglasie/" target="_blank">согласие на обработку персональных данных</a> в соответствии с <a href="/politika-konfidentsialnosti/" target="_blank">политикой конфиденциальности</a></span></label>
      <div class="checkout__total" data-cart-total></div>
      <button class="btn btn--dark btn--block" type="submit">Отправить запрос</button>
      <p class="note">Это не оплата и не обязательство купить.</p>
      <p class="form__msg" data-form-msg role="status"></p>
    </form>
  </div>
</div>`;
  write("cart/index.html", layout({ title: `Корзина | ${site.name}`, desc: "Запрос на покупку", path: "/cart/", body, main: "page-cart", noindex: true }));
}

function pageThanks() {
  const body = `<div class="wrap narrow thanks">
  <p class="kicker">Запрос отправлен</p>
  <h1 class="h1 h1--page">Спасибо! Мы скоро перезвоним</h1>
  <p class="lead">Консультант бутика свяжется с вами в рабочее время (${esc(site.hours.toLowerCase())}), подтвердит наличие и размеры и расскажет про оплату и доставку.</p>
  <p data-order-id></p>
  <p>Если хотите быстрее — позвоните: <a class="link" href="tel:${site.phoneHref}" data-goal="phone_click">${esc(site.phone)}</a></p>
  <div class="btn-row"><a class="btn btn--dark" href="/looks/">Посмотреть образы</a><a class="btn btn--ghost" href="/catalog/">Вернуться в каталог</a></div>
</div>`;
  write("spasibo/index.html", layout({ title: `Спасибо за запрос | ${site.name}`, desc: "Запрос отправлен", path: "/spasibo/", body, noindex: true }));
}

function page404() {
  const body = `<div class="wrap narrow thanks"><p class="kicker">Ошибка 404</p><h1 class="h1 h1--page">Такой страницы нет</h1>
  <p class="lead">Возможно, модель уже распродана или ссылка устарела. Загляните в каталог — там всё, что есть в наличии.</p>
  <div class="btn-row"><a class="btn btn--dark" href="/catalog/">Каталог</a><a class="btn btn--ghost" href="/">На главную</a></div></div>`;
  write("404.html", layout({ title: `Страница не найдена | ${site.name}`, desc: "Страница не найдена", path: "/404.html", body, noindex: true }));
}

function pageLegal() {
  const op = `${site.legal.name} (ИНН ${site.legal.inn}, ОГРНИП ${site.legal.ogrnip}), адрес: ${site.address}, e-mail: ${site.email}`;
  const policy = `<div class="wrap narrow prose">
  ${crumbs([["/", "Главная"], ["/politika-konfidentsialnosti/", "Политика конфиденциальности"]])}
  <h1 class="h1 h1--page">Политика в отношении обработки персональных данных</h1>
  <p>Редакция от ${new Date().toLocaleDateString("ru-RU")}</p>
  <h2 class="h3">1. Общие положения</h2>
  <p>Настоящая политика разработана в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных» и определяет порядок обработки персональных данных пользователей сайта ${esc(site.domain.replace(/^https?:\/\//, ""))} (далее — Сайт).</p>
  <p>Оператор персональных данных: ${esc(op)} (далее — Оператор).</p>
  <h2 class="h3">2. Какие данные мы обрабатываем</h2>
  <p>Через формы Сайта: имя, номер телефона, город, предпочтительный способ связи, текст комментария, а также состав выбранных товаров. Автоматически: данные cookie, IP-адрес, сведения о браузере и устройстве, источник перехода на Сайт (в том числе рекламные метки)${site.metrikaId ? ", данные сервиса Яндекс Метрика" : ""}.</p>
  <h2 class="h3">3. Цели обработки</h2>
  <ul><li>обработка запроса на покупку и обратная связь с пользователем;</li><li>консультация по товарам, наличию, размерам, оплате и доставке;</li><li>исполнение договора купли-продажи;</li><li>анализ работы Сайта и эффективности рекламы в обезличенном виде.</li></ul>
  <h2 class="h3">4. Правовые основания</h2>
  <p>Согласие субъекта персональных данных, выраженное путём проставления отметки в форме на Сайте; заключение и исполнение договора, стороной которого является субъект.</p>
  <h2 class="h3">5. Порядок и сроки обработки</h2>
  <p>Оператор осуществляет сбор, запись, систематизацию, хранение, уточнение, использование, удаление и уничтожение персональных данных с использованием средств автоматизации и без них. Данные хранятся до достижения целей обработки, но не дольше 3 лет с момента последнего обращения, либо до отзыва согласия. Данные не передаются третьим лицам, за исключением служб доставки — в объёме, необходимом для доставки заказа, и случаев, предусмотренных законом. Базы данных, содержащие персональные данные граждан РФ, находятся на территории РФ.</p>
  <h2 class="h3">6. Cookie</h2>
  <p>Сайт использует cookie и локальное хранилище браузера для работы корзины и запоминания настроек${site.metrikaId ? ", а также сервис веб-аналитики Яндекс Метрика (ООО «Яндекс»)" : ""}. Встроенная карта загружается с серверов Яндекса. Пользователь может отключить cookie в настройках браузера; часть функций Сайта при этом может работать некорректно.</p>
  <h2 class="h3">7. Права пользователя</h2>
  <p>Пользователь вправе получить сведения об обработке своих данных, потребовать их уточнения, блокирования или уничтожения, а также отозвать согласие, направив письмо на ${esc(site.email)}. Оператор рассматривает обращение в течение 10 рабочих дней.</p>
  <h2 class="h3">8. Защита данных</h2>
  <p>Оператор принимает необходимые правовые, организационные и технические меры для защиты персональных данных от неправомерного доступа, изменения, распространения и уничтожения.</p>
  </div>`;
  write("politika-konfidentsialnosti/index.html", layout({ title: `Политика конфиденциальности | ${site.name}`, desc: "Политика в отношении обработки персональных данных", path: "/politika-konfidentsialnosti/", body: policy }));

  const consent = `<div class="wrap narrow prose">
  ${crumbs([["/", "Главная"], ["/soglasie/", "Согласие на обработку данных"]])}
  <h1 class="h1 h1--page">Согласие на обработку персональных данных</h1>
  <p>Отправляя форму на сайте ${esc(site.domain.replace(/^https?:\/\//, ""))}, я свободно, своей волей и в своём интересе даю согласие ${esc(op)} на обработку моих персональных данных: имени, номера телефона, города, сведений о выбранных товарах, текста комментария, а также технических данных (cookie, IP-адрес, источник перехода).</p>
  <p>Цели обработки: обработка моего запроса, обратная связь, консультация по товарам, оформление и доставка покупки.</p>
  <p>Действия с данными: сбор, запись, систематизация, накопление, хранение, уточнение, использование, передача службам доставки в объёме, необходимом для доставки, обезличивание, блокирование, удаление, уничтожение — с использованием средств автоматизации и без них.</p>
  <p>Согласие действует 3 года или до его отзыва. Отозвать согласие можно, направив письмо на ${esc(site.email)}.</p>
  <p>Подробнее — в <a class="link" href="/politika-konfidentsialnosti/">политике конфиденциальности</a>.</p>
  </div>`;
  write("soglasie/index.html", layout({ title: `Согласие на обработку персональных данных | ${site.name}`, desc: "Согласие на обработку персональных данных", path: "/soglasie/", body: consent }));
}

// ---------- служебные файлы ----------
function catalogJs() {
  const data = {};
  for (const p of products)
    data[p.id] = {
      t: p.title, a: p.article, u: p.url, p: p.price, s: !!p.short, c: p.category.name,
      v: Object.fromEntries(p.variants.map((v) => [v.color, { n: colorName(v.color), h: cat.colors[v.color].hex, i: v.images[0]?.small || "" }])),
    };
  write("assets/catalog.js", `window.CATALOG=${JSON.stringify(data)};`);
}

function seoFiles() {
  const urls = ["/", "/catalog/", ...cat.categories.filter((c) => products.some((p) => p.category === c)).map((c) => `/catalog/${c.id}/`), ...products.map((p) => p.url), "/looks/", "/boutique/", "/delivery/", "/politika-konfidentsialnosti/", "/soglasie/"];
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${site.domain}${u}</loc></url>`).join("\n")}\n</urlset>\n`);
  write("robots.txt", `User-agent: *\nDisallow: /cart/\nDisallow: /spasibo/\nDisallow: /send.php\nClean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&c\n\nSitemap: ${site.domain}/sitemap.xml\n`);
  // Товарный фид для Яндекса (Директ, Товары) — только позиции с ценой
  const priced = products.filter((p) => p.price);
  const offers = priced.flatMap((p) => p.variants.map((v) => `    <offer id="${p.id}-${v.color}" available="true">
      <url>${site.domain}${p.url}?c=${v.color}</url><price>${p.price}</price><currencyId>RUR</currencyId>
      <categoryId>${cat.categories.indexOf(p.category) + 1}</categoryId>
      ${v.images.slice(0, 5).map((im) => `<picture>${site.domain}${im.src}</picture>`).join("")}
      <name>${esc(`${p.title} ${site.brand} ${p.article}, ${colorName(v.color).toLowerCase()}`)}</name>
      <vendor>${esc(site.brand)}</vendor><vendorCode>${esc(p.article)}</vendorCode>
      <description>${esc(p.desc)}</description>
      <param name="Цвет">${esc(colorName(v.color))}</param>
      <pickup>true</pickup><delivery>true</delivery>
    </offer>`));
  write("feed.yml", `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${new Date().toISOString().slice(0, 19)}+05:00">
  <shop>
    <name>${esc(site.name)}</name><company>${esc(site.legal.name)}</company><url>${site.domain}/</url>
    <currencies><currency id="RUR" rate="1"/></currencies>
    <categories>${cat.categories.map((c, i) => `<category id="${i + 1}">${esc(c.name)}</category>`).join("")}</categories>
    <offers>
${offers.join("\n")}
    </offers>
  </shop>
</yml_catalog>
`);
  if (!priced.length) console.log("· feed.yml пустой: у товаров пока нет цен");
}

async function ogImage() {
  const ids = [8, 1, 24];
  const parts = await Promise.all(ids.map((n) => sharp(path.join(ROOT, "_source/raw", lookList.find((l) => l.n === n).image + ".jpg")).resize(400, 630, { fit: "cover", position: "top" }).toBuffer()));
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#f5f1eb" } })
    .composite(parts.map((input, i) => ({ input, left: i * 400, top: 0 })))
    .jpeg({ quality: 82 }).toFile(path.join(DIST, "img/og.jpg"));
}

function staticFiles() {
  const copy = (from, to) => { fs.mkdirSync(path.dirname(path.join(DIST, to)), { recursive: true }); fs.copyFileSync(path.join(ROOT, from), path.join(DIST, to)); };
  copy("src/css/style.css", "assets/style.css");
  copy("src/js/app.js", "assets/app.js");
  copy("src/favicon.svg", "favicon.svg");
  copy("src/.htaccess", ".htaccess");
  copy("server/send.php", "send.php");
  // config.php (пароли) в сборку не копируется — он лежит только на хостинге рядом с send.php
  const F = "node_modules/@fontsource-variable/manrope/files/";
  const G = "node_modules/@fontsource/cormorant-garamond/files/";
  copy(F + "manrope-cyrillic-wght-normal.woff2", "fonts/manrope-cyrillic.woff2");
  copy(F + "manrope-latin-wght-normal.woff2", "fonts/manrope-latin.woff2");
  for (const w of ["400", "500"]) for (const s of ["normal", "italic"]) for (const sub of ["cyrillic", "latin"])
    copy(`${G}cormorant-garamond-${sub}-${w}-${s}.woff2`, `fonts/cormorant-${sub}-${w}-${s}.woff2`);
}

async function appleIcon() {
  await sharp(path.join(ROOT, "src/favicon.svg")).resize(180, 180).flatten({ background: "#1f1e1c" }).png().toFile(path.join(DIST, "apple-touch-icon.png"));
}

// ---------- подпапка: префикс ко всем корневым ссылкам ----------
function applyBase() {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(DIST)) {
    let s;
    if (f.endsWith(".html")) {
      s = fs.readFileSync(f, "utf8")
        .replace(/(\s(?:href|src|action)=")\/(?!\/)/g, `$1${BASE}/`)
        .replace(/srcset="([^"]*)"/g, (m, v) => `srcset="${v.replace(/(^|, )\//g, `$1${BASE}/`)}"`);
    } else if (f.endsWith(".css")) s = fs.readFileSync(f, "utf8").replace(/url\(\//g, `url(${BASE}/`);
    else if (f.endsWith("catalog.js")) s = fs.readFileSync(f, "utf8").replace(/":"\//g, `":"${BASE}/`);
    else continue;
    fs.writeFileSync(f, s);
  }
  write("robots.txt", "User-agent: *\nDisallow: /\n");
  console.log(`· демо-режим: ссылки с префиксом ${BASE}, индексация закрыта`);
}

// ---------- проверка заглушек перед запуском рекламы ----------
function todoReport() {
  const t = [];
  if (/000-00-00|0000000/.test(site.phone + site.phoneHref)) t.push("телефон — заглушка");
  if (/^0+$/.test(site.legal.inn) || /^0+$/.test(site.legal.ogrnip) || /Фамилия/.test(site.legal.name)) t.push("реквизиты продавца (ИП, ИНН, ОГРНИП)");
  if (site.domain === "https://studio60-perm.ru") t.push("домен (сейчас условный studio60-perm.ru)");
  if (!site.metrikaId) t.push("счётчик Яндекс Метрики не подключён");
  if (!site.addressFloor) t.push("этаж/павильон в ТЦ");
  if (Object.keys(site).some((k) => k === "_hours_todo")) t.push("часы работы (проверить и убрать _hours_todo)");
  if (!products.some((p) => p.price)) t.push("цены не заполнены (feed.yml пустой)");
  const cfg = path.join(ROOT, "server/config.php");
  if (!fs.existsSync(cfg)) t.push("server/config.php не создан (почта для заявок)");
  else if (/example\.ru|'log_only' => true/.test(fs.readFileSync(cfg, "utf8"))) t.push("server/config.php — тестовый (example.ru / log_only); на хостинг нужен боевой");
  if (t.length) console.log("\n⚠ Не заполнено — до запуска рекламы:\n  - " + t.join("\n  - ") + "\n");
}

// ---------- запуск ----------
for (const f of fs.existsSync(DIST) ? fs.readdirSync(DIST) : []) if (f !== "img") fs.rmSync(path.join(DIST, f), { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
await prepareImages();
staticFiles();
await appleIcon();
await ogImage();
catalogJs();
pageHome();
pageCatalog(null);
for (const c of cat.categories) if (products.some((p) => p.category === c)) pageCatalog(c);
for (const p of products) pageProduct(p);
pageLooks();
pageBoutique();
pageDelivery();
pageCart();
pageThanks();
page404();
pageLegal();
seoFiles();
if (BASE) applyBase();
todoReport();
console.log(`✓ Собрано: ${products.length} товаров, ${products.reduce((n, p) => n + p.variants.length, 0)} вариантов цвета, ${lookList.length} образов → dist/`);
