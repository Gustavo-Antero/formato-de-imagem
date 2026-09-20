(() => {
  if (window.__imgfmt) return;

  const MIN = 24;
  let force = true;
  let last = null;

  try {
    chrome.storage.local.get({ force: true }, (v) => { force = v.force !== false; });
    chrome.storage.onChanged.addListener((ch) => {
      if (ch.force) force = ch.force.newValue !== false;
    });
  } catch (e) {}

  const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch (e) { return null; } };
  const isTiny = (u) => u.startsWith('data:') && u.length < 400;

  function bgUrls(el) {
    let bg = '';
    try { bg = getComputedStyle(el).backgroundImage; } catch (e) {}
    if (!bg || bg === 'none') return [];
    const out = [];
    const re = /url\((['"]?)(.*?)\1\)/g;
    let m;
    while ((m = re.exec(bg))) {
      const u = abs(m[2]);
      if (u && !isTiny(u)) out.push(u);
    }
    return out;
  }

  // Devolve as URLs de imagem de um elemento. 'canvas:' indica que deve ser lido do canvas.
  function urlsOf(el) {
    const tag = el.localName;
    if (tag === 'img') {
      const d = el.dataset || {};
      const c = [el.currentSrc, el.src, d.src, d.original, d.lazySrc];
      const u = c.map((x) => x && abs(x)).find((x) => x && !isTiny(x));
      return u ? [u] : [];
    }
    if (tag === 'image') {
      const h = el.getAttribute('href') || el.getAttribute('xlink:href');
      const u = h && abs(h);
      return u ? [u] : [];
    }
    if (tag === 'video') return el.poster ? [abs(el.poster)].filter(Boolean) : [];
    if (tag === 'canvas') return ['canvas:'];
    if (el === document.body || el === document.documentElement) return [];
    return bgUrls(el);
  }

  function stackAt(root, x, y, out, seen) {
    let els = [];
    try { els = root.elementsFromPoint(x, y); } catch (e) {}
    for (const el of els) {
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
      if (el.shadowRoot) stackAt(el.shadowRoot, x, y, out, seen);
    }
  }

  function pick(el) {
    const r = el.getBoundingClientRect();
    if (r.width < MIN || r.height < MIN) return null;
    const u = urlsOf(el)[0];
    return u ? { url: u, el } : null;
  }

  // Procura a imagem no ponto clicado, mesmo com camadas transparentes por cima.
  function detectAt(x, y) {
    const stack = [];
    stackAt(document, x, y, stack, new Set());
    for (const el of stack) {
      const p = pick(el);
      if (p) {
        p.native = el === stack[0] && el.localName === 'img';
        return p;
      }
    }
    // Plano B: imagens com pointer-events desativado não aparecem na pilha.
    let best = null;
    let area = Infinity;
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const p = pick(el);
      if (!p) continue;
      const a = r.width * r.height;
      if (a < area) { area = a; best = p; }
    }
    if (best) best.native = false;
    return best;
  }

  function tell() {
    try {
      chrome.runtime.sendMessage({ type: 'found', found: !!last, native: !!(last && last.native) })
        .catch(() => {});
    } catch (e) {}
  }

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return;
    last = detectAt(e.clientX, e.clientY);
    tell();
  }, true);

  // Roda antes dos scripts do site. Se houver imagem ali, o site não consegue cancelar o menu.
  window.addEventListener('contextmenu', (e) => {
    last = detectAt(e.clientX, e.clientY);
    tell();
    if (force && last) e.stopImmediatePropagation();
  }, true);

  const toDataUrl = (blob) => new Promise((res, rej) => {
    const f = new FileReader();
    f.onload = () => res(f.result);
    f.onerror = rej;
    f.readAsDataURL(blob);
  });

  async function blobUrlToData(u) {
    try { return await toDataUrl(await (await fetch(u)).blob()); } catch (e) { return null; }
  }

  async function resolveLast() {
    if (!last) return null;
    if (last.url === 'canvas:') {
      try { return last.el.toDataURL('image/png'); } catch (e) { return null; }
    }
    if (last.url.startsWith('blob:')) return blobUrlToData(last.url);
    return last.url;
  }

  function listAll() {
    const map = new Map();
    let canvases = 0;
    const visit = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) visit(el.shadowRoot);
        let w = 0;
        let h = 0;
        if (el.localName === 'img') { w = el.naturalWidth; h = el.naturalHeight; }
        if (!w || !h) {
          const r = el.getBoundingClientRect();
          w = Math.round(r.width);
          h = Math.round(r.height);
        }
        if (w < 32 || h < 32) continue;
        for (let u of urlsOf(el)) {
          if (u === 'canvas:') {
            if (canvases++ >= 3) continue;
            try { u = el.toDataURL('image/png'); } catch (e) { continue; }
          }
          if (!map.has(u)) map.set(u, { url: u, w, h });
        }
      }
    };
    visit(document);
    return [...map.values()];
  }

  window.__imgfmt = { listAll };

  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'resolveLast') { resolveLast().then(sendResponse); return true; }
      if (msg.type === 'fetchBlob') { blobUrlToData(msg.url).then(sendResponse); return true; }
    });
  } catch (e) {}
})();
