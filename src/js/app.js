/* Studio 60 — корзина, фильтры, карточка товара, формы, аналитика */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var CAT = window.CATALOG || {};
  var SITE = window.SITE || {};
  var BASE = SITE.base || "";
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var rub = function (n) { return n.toLocaleString("ru-RU") + " ₽"; };

  /* ---------- аналитика ---------- */
  function goal(name, params) {
    try { if (SITE.metrikaId && window.ym) window.ym(SITE.metrikaId, "reachGoal", name, params || {}); } catch (e) {}
  }
  function ecom(action, items, extra) {
    window.dataLayer = window.dataLayer || [];
    var products = items.map(function (it) {
      var p = CAT[it.id] || {};
      var o = { id: it.id + "-" + it.color, name: p.t + " " + p.a, brand: "Ania Schierholt", category: p.c, variant: (p.v && p.v[it.color] && p.v[it.color].n) || it.color, quantity: it.qty || 1 };
      if (p.p) o.price = p.p;
      return o;
    });
    var e = {}; e[action] = { products: products };
    if (extra) e[action].actionField = extra;
    window.dataLayer.push({ ecommerce: Object.assign({ currencyCode: "RUB" }, e) });
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-goal]");
    if (a) goal(a.getAttribute("data-goal"));
  });

  /* ---------- источник визита (UTM / yclid) — уходит вместе с заявкой ---------- */
  (function () {
    var q = new URLSearchParams(location.search);
    var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid"];
    var hit = {};
    keys.forEach(function (k) { if (q.get(k)) hit[k] = q.get(k); });
    var ref = document.referrer && document.referrer.indexOf(location.host) === -1 ? document.referrer : "";
    if (Object.keys(hit).length || ref) {
      hit.landing = location.pathname; hit.referrer = ref; hit.at = new Date().toISOString();
      if (!store.get("s60_first")) store.set("s60_first", hit);
      store.set("s60_last", hit);
    }
  })();

  /* ---------- корзина ---------- */
  var KEY = "s60_cart";
  var cart = store.get(KEY, []).filter(function (l) { return CAT[l.id]; });
  function save() { store.set(KEY, cart); renderCount(); }
  function count() { return cart.reduce(function (n, l) { return n + l.qty; }, 0); }
  function renderCount() {
    $$("[data-cart-count]").forEach(function (el) { var n = count(); el.textContent = n; el.hidden = !n; });
  }
  function sameLine(a, b) { return a.id === b.id && a.color === b.color && (a.size || "") === (b.size || "") && (a.length || "") === (b.length || ""); }
  function add(items) {
    items.forEach(function (it) {
      var ex = cart.filter(function (l) { return sameLine(l, it); })[0];
      if (ex) ex.qty += 1; else cart.push({ id: it.id, color: it.color, size: it.size || "", length: it.length || "", qty: 1 });
    });
    save();
    ecom("add", items);
    goal("cart_add");
    var btn = $(".cart-btn"); if (btn) { btn.classList.remove("is-bump"); void btn.offsetWidth; btn.classList.add("is-bump"); }
    openDrawer();
  }
  function sizeLabel(s) { return !s ? "" : s === "help" ? "помочь с размером" : (SITE.sizeRu[s] || "") + " RU / " + s + " DE"; }
  function lineHtml(l, i, full) {
    var p = CAT[l.id], v = p.v[l.color] || {};
    var sizeSel = '<select data-line-size="' + i + '" aria-label="Размер"><option value="">Размер…</option>' +
      SITE.sizes.map(function (s) { return '<option value="' + s + '"' + (l.size === s ? " selected" : "") + ">" + SITE.sizeRu[s] + " RU / " + s + " DE</option>"; }).join("") +
      '<option value="help"' + (l.size === "help" ? " selected" : "") + ">Помочь с размером</option></select>";
    return '<div class="line">' +
      '<a class="line__img" href="' + p.u + "?c=" + l.color + '"><img src="' + v.i + '" alt="" loading="lazy"></a>' +
      "<div>" +
        '<a class="line__title" href="' + p.u + "?c=" + l.color + '">' + esc(p.t) + "</a>" +
        '<div class="line__meta">' + esc(p.a) + " · " + esc(v.n) + (l.length ? " · длина " + esc(l.length) : "") + (!full && l.size ? " · " + esc(sizeLabel(l.size)) : "") + (!full && !l.size ? " · размер уточнить" : "") + "</div>" +
        (full ? '<div class="line__opts">' + sizeSel + (p.s ? '<select data-line-length="' + i + '" aria-label="Длина"><option value="стандартная"' + (l.length !== "укороченная" ? " selected" : "") + '>Стандартная длина</option><option value="укороченная"' + (l.length === "укороченная" ? " selected" : "") + ">Укороченная</option></select>" : "") +
          '<span class="qty"><button type="button" data-line-dec="' + i + '" aria-label="Меньше">−</button><span>' + l.qty + '</span><button type="button" data-line-inc="' + i + '" aria-label="Больше">+</button></span></div>' : "") +
      "</div>" +
      '<div class="line__side"><span>' + (p.p ? rub(p.p * l.qty) : "") + '</span><button type="button" class="line__rm" data-line-rm="' + i + '">Удалить</button></div>' +
      "</div>";
  }

  /* выдвижная корзина */
  var drawer = $("[data-drawer]");
  function renderDrawer() {
    $("[data-drawer-body]").innerHTML = cart.length ? cart.map(function (l, i) { return lineHtml(l, i, false); }).join("") : '<p class="note" style="padding:20px 0">Корзина пуста</p>';
    $$(".drawer__foot [href], .drawer__foot [data-cart-clear]").forEach(function (el) { el.hidden = !cart.length; });
  }
  function openDrawer() {
    if (!drawer || $("[data-cart-lines]")) return; // на странице корзины не показываем
    renderDrawer();
    drawer.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeDrawer() { if (drawer) { drawer.hidden = true; document.body.style.overflow = ""; } }
  $$("[data-drawer-close]").forEach(function (b) { b.addEventListener("click", closeDrawer); });
  if (drawer) $("[data-drawer-body]").addEventListener("click", function (e) {
    var i = e.target.getAttribute("data-line-rm");
    if (i === null) return;
    ecom("remove", [cart[i]]); cart.splice(i, 1); save(); renderDrawer();
  });
  $$("[data-cart-clear]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!cart.length || !confirm("Убрать из корзины все вещи?")) return;
      ecom("remove", cart.slice()); cart = []; save();
      if (linesBox) renderCart(); else renderDrawer();
    });
  });
  $$("[data-cart-open]").forEach(function (a) {
    a.addEventListener("click", function (e) { if (cart.length && !$("[data-cart-lines]") && window.innerWidth > 600) { e.preventDefault(); openDrawer(); } });
  });

  /* страница корзины */
  var linesBox = $("[data-cart-lines]");
  function renderCart() {
    if (!linesBox) return;
    linesBox.innerHTML = cart.map(function (l, i) { return lineHtml(l, i, true); }).join("");
    $("[data-cart-empty]").hidden = !!cart.length;
    $("[data-cart-actions]").hidden = !cart.length;
    var form = $('[data-form="order"]'); if (form) form.hidden = !cart.length;
    var total = cart.reduce(function (s, l) { var p = CAT[l.id]; return s + (p.p ? p.p * l.qty : 0); }, 0);
    var unpriced = cart.some(function (l) { return !CAT[l.id].p; });
    $("[data-cart-total]").innerHTML = "Вещей: <b>" + count() + "</b><br>" +
      (total && !unpriced ? "Сумма: <b>" + rub(total) + "</b>" : total ? "Сумма без учёта позиций с ценой по запросу: <b>" + rub(total) + "</b>" : "Стоимость консультант сообщит при звонке");
  }
  if (linesBox) {
    renderCart();
    linesBox.addEventListener("click", function (e) {
      var t = e.target, i;
      if ((i = t.getAttribute("data-line-inc")) !== null) cart[i].qty++;
      else if ((i = t.getAttribute("data-line-dec")) !== null) { if (cart[i].qty > 1) cart[i].qty--; else cart.splice(i, 1); }
      else if ((i = t.getAttribute("data-line-rm")) !== null) { ecom("remove", [cart[i]]); cart.splice(i, 1); }
      else return;
      save(); renderCart();
    });
    linesBox.addEventListener("change", function (e) {
      var t = e.target, i;
      if ((i = t.getAttribute("data-line-size")) !== null) cart[i].size = t.value;
      else if ((i = t.getAttribute("data-line-length")) !== null) cart[i].length = t.value;
      save();
    });
  }
  renderCount();

  /* ---------- меню, cookie, модальные окна ---------- */
  var burger = $("[data-burger]");
  if (burger) burger.addEventListener("click", function () {
    var open = document.body.classList.toggle("nav-open");
    burger.setAttribute("aria-expanded", open);
  });
  var cookie = $("[data-cookie]");
  if (cookie && !store.get("s60_cookie_ok")) {
    cookie.hidden = false;
    $("[data-cookie-ok]").addEventListener("click", function () { store.set("s60_cookie_ok", 1); cookie.hidden = true; });
  }
  $$("[data-modal-open]").forEach(function (b) {
    b.addEventListener("click", function () { var m = $('[data-modal="' + b.getAttribute("data-modal-open") + '"]'); if (m) { m.hidden = false; var f = $("input:not(.hp)", m); if (f) f.focus(); } });
  });
  $$("[data-modal-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest("[data-modal]").hidden = true; }); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    $$("[data-modal]").forEach(function (m) { m.hidden = true; });
    closeDrawer(); closeLightbox();
  });

  /* ---------- лайтбокс ---------- */
  var lb, lbList = [], lbIdx = 0;
  function showLb() { $("img", lb).src = lbList[lbIdx]; }
  function closeLightbox() { if (lb) { lb.remove(); lb = null; document.body.style.overflow = ""; } }
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-zoom]");
    if (!a) return;
    e.preventDefault();
    var scope = a.closest("[data-gallery]") || a.parentNode;
    lbList = $$("[data-zoom]", scope).map(function (x) { return x.getAttribute("href"); });
    lbIdx = Math.max(0, lbList.indexOf(a.getAttribute("href")));
    lb = document.createElement("div");
    lb.className = "lightbox";
    lb.innerHTML = '<img alt=""><button type="button" class="lightbox__x" aria-label="Закрыть">✕</button>' + (lbList.length > 1 ? '<button type="button" class="lightbox__prev" aria-label="Назад">‹</button><button type="button" class="lightbox__next" aria-label="Вперёд">›</button>' : "");
    document.body.appendChild(lb);
    document.body.style.overflow = "hidden";
    showLb();
    lb.addEventListener("click", function (ev) {
      if (ev.target.classList.contains("lightbox__prev")) { lbIdx = (lbIdx - 1 + lbList.length) % lbList.length; showLb(); }
      else if (ev.target.classList.contains("lightbox__next")) { lbIdx = (lbIdx + 1) % lbList.length; showLb(); }
      else closeLightbox();
    });
  });

  /* ---------- фильтры каталога ---------- */
  var grid = $("[data-grid]");
  if (grid) {
    var q = new URLSearchParams(location.search);
    var state = { color: q.get("color") || "", short: q.get("short") === "1" };
    var shortBox = $("[data-short-filter]");
    function apply() {
      var shown = 0;
      $$("[data-card]", grid).forEach(function (c) {
        var ok = (!state.color || c.getAttribute("data-colors").split(" ").indexOf(state.color) > -1) && (!state.short || c.getAttribute("data-short") === "1");
        c.hidden = !ok; if (ok) shown++;
      });
      $$("[data-color]").forEach(function (b) { b.classList.toggle("is-on", b.getAttribute("data-color") === state.color); });
      if (shortBox) shortBox.checked = state.short;
      var cnt = $("[data-count]"); if (cnt) cnt.textContent = "Показано: " + shown;
      $("[data-empty]").hidden = !!shown;
      var u = new URL(location.href);
      state.color ? u.searchParams.set("color", state.color) : u.searchParams.delete("color");
      state.short ? u.searchParams.set("short", "1") : u.searchParams.delete("short");
      history.replaceState(null, "", u);
    }
    $$("[data-color]").forEach(function (b) { b.addEventListener("click", function () { state.color = b.getAttribute("data-color"); apply(); }); });
    if (shortBox) shortBox.addEventListener("change", function () { state.short = shortBox.checked; apply(); });
    var reset = $("[data-reset]"); if (reset) reset.addEventListener("click", function () { state = { color: "", short: false }; apply(); });
    // в ссылках категорий сохраняем выбранный цвет
    $$(".cat-chips a").forEach(function (a) { a.addEventListener("click", function () { if (state.color) a.href = a.pathname + "?color=" + state.color; }); });
    // карточки ведут на товар в выбранном цвете
    grid.addEventListener("click", function (e) { var a = e.target.closest("a"); if (a && state.color && a.pathname.indexOf("/product/") > -1) a.href = a.pathname + "?c=" + state.color; });
    apply();
  }

  /* ---------- карточка товара ---------- */
  var prod = $("[data-product]");
  if (prod) {
    var pid = prod.getAttribute("data-product");
    var P = CAT[pid];
    var sel = { color: Object.keys(P.v)[0], size: "", length: P.s ? "стандартная" : "" };
    function setVariant(c) {
      if (!P.v[c]) return;
      sel.color = c;
      $$("[data-variant]").forEach(function (b) { var on = b.getAttribute("data-variant") === c; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
      $$("[data-gallery]").forEach(function (g) { g.hidden = g.getAttribute("data-gallery") !== c; });
      $$("[data-variant-block]").forEach(function (g) { g.hidden = g.getAttribute("data-variant-block") !== c; });
      $("[data-color-label]").textContent = P.v[c].n;
      $("[data-color-name]").textContent = "· " + P.v[c].n;
      var u = new URL(location.href); u.searchParams.set("c", c); history.replaceState(null, "", u);
    }
    $$("[data-variant]").forEach(function (b) { b.addEventListener("click", function () { setVariant(b.getAttribute("data-variant")); }); });
    var startC = new URLSearchParams(location.search).get("c");
    if (startC && P.v[startC]) setVariant(startC);

    var sizesRow = $(".sizes-row");
    $$("[data-size]").forEach(function (b) {
      b.addEventListener("click", function () {
        sel.size = b.getAttribute("data-size");
        $$("[data-size]").forEach(function (x) { var on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-checked", on); });
        sizesRow.classList.remove("is-invalid");
        $("[data-add-msg]").textContent = "";
      });
    });
    $$("[data-length]").forEach(function (b) {
      b.addEventListener("click", function () { sel.length = b.getAttribute("data-length"); $$("[data-length]").forEach(function (x) { x.classList.toggle("is-on", x === b); }); });
    });
    function addCurrent() {
      if (!sel.size) {
        sizesRow.classList.add("is-invalid");
        var m = $("[data-add-msg]"); m.textContent = "Выберите размер или «Помочь с размером»"; m.className = "form__msg is-err";
        sizesRow.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      add([{ id: pid, color: sel.color, size: sel.size, length: sel.length }]);
    }
    $("[data-add]").addEventListener("click", addCurrent);
    var sticky = $("[data-sticky-buy]");
    if (sticky && "IntersectionObserver" in window) {
      $("[data-add-sticky]").addEventListener("click", addCurrent);
      new IntersectionObserver(function (en) { sticky.hidden = en[0].isIntersecting || en[0].boundingClientRect.top > 0; }).observe($("[data-add]"));
    }
    // точки-индикаторы мобильной галереи
    $$("[data-gallery]").forEach(function (g) {
      var track = $("[data-gallery-track]", g), dots = $$("[data-thumb]", g);
      if (!dots.length) return;
      track.addEventListener("scroll", function () {
        var i = Math.round(track.scrollLeft / track.clientWidth);
        dots.forEach(function (d, k) { d.classList.toggle("is-on", k === i); });
      }, { passive: true });
      dots.forEach(function (d, k) { d.addEventListener("click", function () { track.scrollTo({ left: k * track.clientWidth, behavior: "smooth" }); }); });
    });
    ecom("detail", [{ id: pid, color: sel.color }]);
  }

  /* образ целиком */
  $$("[data-add-look]").forEach(function (b) {
    b.addEventListener("click", function () {
      var items = JSON.parse(b.getAttribute("data-add-look")).filter(function (it) { return CAT[it.id]; });
      add(items);
      goal("look_add");
    });
  });

  /* ---------- формы ---------- */
  function phoneOk(v) { return v.replace(/\D/g, "").length >= 10; }
  $$("[data-form]").forEach(function (form) {
    var phone = $('[name="phone"]', form);
    if (phone) phone.addEventListener("focus", function () { if (!phone.value) phone.value = "+7 "; });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = $("[data-form-msg]", form);
      var bad = [];
      $$("[required]", form).forEach(function (f) {
        var ok = f.type === "checkbox" ? f.checked : f.name === "phone" ? phoneOk(f.value) : f.value.trim().length > 1;
        f.classList.toggle("is-invalid", !ok);
        if (!ok) bad.push(f);
      });
      if (bad.length) {
        msg.className = "form__msg is-err";
        msg.textContent = bad.some(function (f) { return f.type === "checkbox"; }) && bad.length === 1 ? "Подтвердите согласие на обработку данных" : "Проверьте имя и телефон";
        bad[0].focus();
        return;
      }
      var type = form.getAttribute("data-form");
      var data = new FormData(form);
      data.append("type", type);
      data.append("source", form.getAttribute("data-source") || "");
      data.append("page", location.href);
      data.append("utm_first", JSON.stringify(store.get("s60_first", {})));
      data.append("utm_last", JSON.stringify(store.get("s60_last", {})));
      if (type === "order") {
        data.append("items", JSON.stringify(cart.map(function (l) {
          var p = CAT[l.id];
          return { article: p.a, title: p.t, color: p.v[l.color].n, size: sizeLabel(l.size) || "не выбран", length: l.length, qty: l.qty, price: p.p, url: location.origin + p.u + "?c=" + l.color };
        })));
      }
      var btn = $('[type="submit"]', form);
      btn.disabled = true;
      msg.className = "form__msg"; msg.textContent = "Отправляем…";
      fetch(BASE + "/send.php", { method: "POST", body: data, headers: { Accept: "application/json" } })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.error || "fail");
          if (type === "order") {
            ecom("purchase", cart, { id: res.id || String(Date.now()) });
            goal("order_send");
            cart = []; save();
            location.href = BASE + "/spasibo/?id=" + encodeURIComponent(res.id || "");
            return;
          }
          goal(type === "question" ? "question_send" : "callback_send");
          form.reset();
          msg.className = "form__msg is-ok";
          msg.textContent = "Спасибо! Перезвоним в рабочее время.";
          btn.disabled = false;
        })
        .catch(function () {
          btn.disabled = false;
          msg.className = "form__msg is-err";
          msg.innerHTML = (SITE.preview ? "Это демо-версия сайта: заявки начнут приходить после переноса на хостинг. Пока позвоните:" : "Не удалось отправить. Позвоните нам:") + " <a href=\"tel:" + SITE.phoneHref + "\">" + esc(SITE.phone) + "</a>";
        });
    });
  });

  var oid = $("[data-order-id]");
  if (oid) { var id = new URLSearchParams(location.search).get("id"); if (id) oid.textContent = "Номер запроса: " + id; }
})();
