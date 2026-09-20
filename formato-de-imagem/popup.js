const $ = (s) => document.querySelector(s);
const S = { format: 'png', quality: 92, items: [], sel: new Set(), tab: null };

const setStatus = (t) => { $('#status').textContent = t || ''; };

function paintFormat() {
  document.querySelectorAll('#formats button').forEach((b) => b.classList.toggle('on', b.dataset.f === S.format));
  $('#qRow').hidden = !(S.format === 'jpg' || S.format === 'webp');
}

function paintCount() {
  $('#count').textContent = S.items.length;
  $('#download').textContent = `Baixar (${S.sel.size})`;
  $('#download').disabled = S.sel.size === 0;
}

function render() {
  const grid = $('#grid');
  grid.textContent = '';
  if (!S.items.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Nenhuma imagem encontrada nesta página.';
    grid.append(p);
    paintCount();
    return;
  }
  S.items.slice(0, 300).forEach((it, idx) => {
    const b = document.createElement('button');
    b.className = 'cell';
    b.title = it.url;
    b.classList.toggle('sel', S.sel.has(idx));
    if (it.url.startsWith('blob:')) {
      b.classList.add('noprev');
    } else {
      const img = new Image();
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => { img.remove(); b.classList.add('noprev'); };
      img.src = it.url;
      b.append(img);
    }
    const dim = document.createElement('span');
    dim.className = 'dim';
    dim.textContent = `${it.w}x${it.h}`;
    const chk = document.createElement('span');
    chk.className = 'chk';
    chk.textContent = 'X';
    b.append(dim, chk);
    b.onclick = () => {
      if (S.sel.has(idx)) S.sel.delete(idx); else S.sel.add(idx);
      b.classList.toggle('sel');
      paintCount();
    };
    grid.append(b);
  });
  paintCount();
}

async function scan() {
  const url = S.tab.url || '';
  if (!/^(https?|file):/.test(url)) {
    setStatus('O Chrome não permite extensões nesta página.');
    render();
    return;
  }
  try {
    const target = { tabId: S.tab.id, allFrames: true };
    await chrome.scripting.executeScript({ target, files: ['content.js'] });
    const res = await chrome.scripting.executeScript({
      target,
      func: () => (window.__imgfmt ? window.__imgfmt.listAll() : []),
    });
    const map = new Map();
    for (const r of res) {
      for (const it of r.result || []) {
        if (!map.has(it.url)) map.set(it.url, { ...it, frameId: r.frameId });
      }
    }
    S.items = [...map.values()].sort((a, b) => b.w * b.h - a.w * a.h);
  } catch (e) {
    setStatus('Não foi possível ler esta página. Recarregue e tente de novo.');
  }
  render();
}

async function init() {
  const saved = await chrome.storage.local.get({ format: 'png', quality: 92, force: true });
  S.format = saved.format;
  S.quality = saved.quality;
  $('#q').value = S.quality;
  $('#qv').textContent = S.quality;
  $('#force').checked = saved.force;
  paintFormat();

  [S.tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.runtime.sendMessage({ type: 'setReferer', pageUrl: S.tab.url });
  await scan();
}

document.querySelectorAll('#formats button').forEach((b) => {
  b.onclick = () => {
    S.format = b.dataset.f;
    chrome.storage.local.set({ format: S.format });
    paintFormat();
  };
});

$('#q').oninput = (e) => {
  S.quality = Number(e.target.value);
  $('#qv').textContent = S.quality;
  chrome.storage.local.set({ quality: S.quality });
};

$('#force').onchange = (e) => chrome.storage.local.set({ force: e.target.checked });

$('#all').onclick = () => {
  S.items.slice(0, 300).forEach((_, i) => S.sel.add(i));
  render();
};
$('#none').onclick = () => { S.sel.clear(); render(); };

$('#download').onclick = async () => {
  const items = [...S.sel].map((i) => ({ url: S.items[i].url, frameId: S.items[i].frameId }));
  setStatus('Baixando...');
  $('#download').disabled = true;
  const r = await chrome.runtime.sendMessage({
    type: 'downloadMany',
    items,
    format: S.format,
    quality: S.quality / 100,
    tabId: S.tab.id,
    pageUrl: S.tab.url,
  });
  if (!r) setStatus('Algo deu errado. Tente de novo.');
  else if (r.fail) setStatus(`Baixadas: ${r.ok}. Falharam: ${r.fail}. ${r.error}`);
  else setStatus(`Pronto. ${r.ok} arquivo(s) baixado(s).`);
  paintCount();
};

init();
