const FORMATS = {
  png: { mime: 'image/png', ext: 'png', menu: 'PNG' },
  jpg: { mime: 'image/jpeg', ext: 'jpg', menu: 'JPG' },
  webp: { mime: 'image/webp', ext: 'webp', menu: 'WEBP' },
  original: { menu: 'Original (sem converter)' },
};

// Menu do botão direito.
// "native": aparece sobre imagens normais.
// "forced": aparece quando o site esconde a imagem atrás de camadas ou bloqueia o menu.
function buildMenu(set, title, visible) {
  const contexts = set === 'native' ? ['image'] : ['all'];
  const root = `${set}:root`;
  chrome.contextMenus.create({ id: root, title, contexts, visible });
  for (const [id, f] of Object.entries(FORMATS)) {
    chrome.contextMenus.create({ id: `${set}:${id}`, parentId: root, title: f.menu, contexts });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ format: 'png', quality: 92, force: true }, (v) => chrome.storage.local.set(v));
  chrome.contextMenus.removeAll(() => {
    buildMenu('native', 'Baixar imagem como...', true);
    buildMenu('forced', 'Baixar imagem daqui como...', false);
  });
});

function flash(text) {
  chrome.action.setBadgeBackgroundColor({ color: '#000000' });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
}

// Muitos sites só entregam a imagem se o pedido vier com o Referer da própria página.
async function setReferer(pageUrl) {
  let ref = null;
  try {
    const u = new URL(pageUrl);
    if (/^https?:$/.test(u.protocol)) ref = u.origin + '/';
  } catch (e) {}
  const addRules = ref ? [{
    id: 1,
    priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'set', value: ref }] },
    condition: {
      initiatorDomains: [chrome.runtime.id],
      resourceTypes: ['xmlhttprequest', 'image', 'media', 'other'],
    },
  }] : [];
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1], addRules });
}

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < buf.length; i += step) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + step));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

async function convert(blob, f, quality) {
  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d');
  if (f.mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bmp, 0, 0);
  if (bmp.close) bmp.close();
  return canvas.convertToBlob({ type: f.mime, quality });
}

function baseName(url) {
  try {
    if (url.startsWith('data:')) return 'imagem';
    const u = new URL(url);
    let n = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    n = n.replace(/\.[a-z0-9]{2,5}$/i, '');
    n = n.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60);
    return n || 'imagem';
  } catch (e) {
    return 'imagem';
  }
}

function extOf(blob, url) {
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'image/avif': 'avif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg', 'image/x-icon': 'ico',
  };
  if (map[blob.type]) return map[blob.type];
  const m = /\.([a-z0-9]{2,4})(?:$|[?#])/i.exec(url);
  return m ? m[1].toLowerCase() : 'jpg';
}

async function resolveUrl(url, tabId, frameId) {
  if (url.startsWith('blob:')) {
    const data = await chrome.tabs.sendMessage(tabId, { type: 'fetchBlob', url }, { frameId: frameId || 0 });
    if (!data) throw new Error('Não foi possível ler a imagem da página.');
    return data;
  }
  return url;
}

async function saveOne({ url, tabId, frameId, pageUrl, format, quality }) {
  await setReferer(pageUrl);
  const real = await resolveUrl(url, tabId, frameId);
  const res = await fetch(real, { credentials: 'omit' });
  if (!res.ok) throw new Error(`O site recusou o pedido (${res.status}).`);
  const blob = await res.blob();

  let out = blob;
  let ext = extOf(blob, real);
  const f = FORMATS[format];
  if (f && f.mime && blob.type !== 'image/svg+xml') {
    out = await convert(blob, f, quality);
    ext = f.ext;
  }
  const dataUrl = await blobToDataUrl(out);
  await chrome.downloads.download({
    url: dataUrl,
    filename: `${baseName(url)}.${ext}`,
    conflictAction: 'uniquify',
  });
}

async function saveMany(items, opts) {
  let ok = 0;
  let fail = 0;
  let error = '';
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const it = items[i++];
      try {
        await saveOne({ ...opts, url: it.url, frameId: it.frameId });
        ok++;
      } catch (e) {
        fail++;
        error = String((e && e.message) || e);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { ok, fail, error };
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const [set, format] = String(info.menuItemId).split(':');
  if (!['native', 'forced'].includes(set) || format === 'root' || !tab) return;
  const frameId = info.frameId || 0;
  try {
    let url = null;
    if (set === 'forced') {
      url = await chrome.tabs.sendMessage(tab.id, { type: 'resolveLast' }, { frameId });
    }
    if (!url) url = info.srcUrl || null;
    if (!url) { flash('ERRO'); return; }

    const { quality = 92 } = await chrome.storage.local.get('quality');
    await saveOne({ url, tabId: tab.id, frameId, pageUrl: tab.url, format, quality: quality / 100 });
    flash('OK');
  } catch (e) {
    flash('ERRO');
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'found') {
    chrome.contextMenus.update('forced:root', { visible: !!(msg.found && !msg.native) }).catch(() => {});
    return;
  }
  if (msg.type === 'setReferer') {
    setReferer(msg.pageUrl).then(() => sendResponse(true), () => sendResponse(false));
    return true;
  }
  if (msg.type === 'downloadMany') {
    const opts = { tabId: msg.tabId, pageUrl: msg.pageUrl, format: msg.format, quality: msg.quality };
    saveMany(msg.items, opts).then(sendResponse, (e) => sendResponse({ ok: 0, fail: msg.items.length, error: String(e) }));
    return true;
  }
});
