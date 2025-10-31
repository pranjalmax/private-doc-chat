// ===== Imports via CDN =====
import * as pdfjsLib from 'https://unpkg.com/pdfjs-dist@5.4.296/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.mjs';

import * as webllm from 'https://esm.run/@mlc-ai/web-llm';
import { pipeline, env as xenv } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// ===== Config =====
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 150;
const EMB_MODEL = 'Xenova/all-MiniLM-L6-v2';
const DEFAULT_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
// retrieval confidence guardrail
const MIN_SIM = 0.15; // if top similarity < 0.15, we answer "I don't know"

// ===== Elements =====
const els = {
  strictMode: document.getElementById('strictMode'),
  appRoot: document.getElementById('app-root'),
  overlay: document.getElementById('busy-overlay'),

  webgpu: document.getElementById('webgpu-status'),
  xenova: document.getElementById('xenova-status'),
  pdfjs: document.getElementById('pdfjs-status'),
  lf: document.getElementById('lf-status'),

  pdfInput: document.getElementById('pdf-input'),
  clearData: document.getElementById('clear-data'),

  question: document.getElementById('question'),
  ask: document.getElementById('ask'),
  topk: document.getElementById('topk'),
  maxTokens: document.getElementById('maxTokens'),
  maxTokensValue: document.getElementById('maxTokensValue'),

  loadModel: document.getElementById('load-model'),
  modelProgressWrap: document.getElementById('model-progress-wrap'),
  modelProgress: document.getElementById('model-progress'),
  modelStatus: document.getElementById('model-status'),

  answer: document.getElementById('answer'),
  sources: document.getElementById('sources'),
  ingestLog: document.getElementById('ingest-log'),
};

// keyboard open for file label
document.querySelector('label.file-button')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.pdfInput.click(); }
});

// ===== Status + logs =====
function setStatus(el, text, ok = true) {
  el.textContent = text;
  el.style.color = ok ? 'var(--accent)' : 'var(--danger)';
}

function logIngest(msg) {
  const time = new Date().toLocaleTimeString();
  els.ingestLog.textContent += `[${time}] ${msg}\n`;
}

// ===== Busy overlay (hard fail-safe using inline display) =====
function toggleControls(disabled) {
  const controls = [
    els.pdfInput, els.clearData, els.question, els.ask,
    els.topk, els.maxTokens, els.loadModel
  ];
  for (const el of controls) {
    if (!el) continue;
    el.disabled = !!disabled;
    if (el.setAttribute) el.setAttribute('aria-disabled', String(!!disabled));
  }
}

function setBusy(isBusy, label = 'Working…') {
  try {
    els.appRoot?.setAttribute('aria-busy', isBusy ? 'true' : 'false');

    // hard control via inline display (class is just a hint)
    if (isBusy) {
      if (els.overlay) {
        els.overlay.style.display = 'grid';
        els.overlay.classList.remove('hidden'); // harmless if already removed
        els.overlay.setAttribute('aria-hidden', 'false');
        const t = els.overlay.querySelector('.busy-text');
        if (t) t.textContent = label;
      }
    } else {
      if (els.overlay) {
        els.overlay.style.display = 'none';
        els.overlay.classList.add('hidden');    // keep in sync
        els.overlay.setAttribute('aria-hidden', 'true');
      }
    }

    toggleControls(isBusy);

    // auto-unblock after 8s in case of crash in the middle of a task
    clearTimeout(setBusy._timeoutId);
    if (isBusy) {
      setBusy._timeoutId = setTimeout(() => {
        // final hard kill
        if (els.overlay) {
          els.overlay.style.display = 'none';
          els.overlay.classList.add('hidden');
          els.overlay.setAttribute('aria-hidden', 'true');
        }
        toggleControls(false);
        els.appRoot?.setAttribute('aria-busy', 'false');
        console.warn('[setBusy] Auto-cleared busy overlay after 8s');
      }, 8000);
    }
  } catch (e) {
    console.error('[setBusy] error', e);
    // absolute fail-safe
    try {
      if (els.overlay) {
        els.overlay.style.display = 'none';
        els.overlay.classList.add('hidden');
        els.overlay.setAttribute('aria-hidden', 'true');
      }
      toggleControls(false);
      els.appRoot?.setAttribute('aria-busy', 'false');
    } catch {}
  }
}

// Extra kill-switch: ESC hides overlay immediately
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setBusy(false);
});

// ===== Boot checks =====
(function boot() {
  // Force-unblock UI on first paint
  if (els.overlay) {
    els.overlay.style.display = 'none';
    els.overlay.classList.add('hidden');
    els.overlay.setAttribute('aria-hidden', 'true');
  }
  toggleControls(false);
  els.appRoot?.setAttribute('aria-busy', 'false');
  els.answer.textContent = '';

  const hasWebGPU = !!navigator.gpu;
  setStatus(els.webgpu, hasWebGPU ? 'Available' : 'Not available', hasWebGPU);

  try {
    xenv.backends.onnx.wasm.wasmPaths =
      'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/';
    setStatus(els.xenova, 'Ready');
  } catch { setStatus(els.xenova, 'Load error', false); }

  try {
    setStatus(els.pdfjs, pdfjsLib?.version ? `Ready (v${pdfjsLib.version})` : 'Ready');
  } catch { setStatus(els.pdfjs, 'Load error', false); }

  try {
    localforage.config({ name: 'private-doc-chat', storeName: 'vectors' });
    setStatus(els.lf, 'Ready');
  } catch { setStatus(els.lf, 'Load error', false); }

  // show current max tokens value
  els.maxTokensValue.textContent = els.maxTokens.value;
})();

els.maxTokens.addEventListener('input', () => {
  els.maxTokensValue.textContent = els.maxTokens.value;
});

// ===== WebLLM model loader =====
let engine = null;

function showModelProgress(pct, text) {
  els.modelProgressWrap.classList.remove('hidden');
  els.modelProgressWrap.setAttribute('aria-hidden', 'false');
  els.modelProgress.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  els.modelStatus.textContent = text || `Loading… ${pct.toFixed(0)}%`;
}

async function loadModel() {
  setBusy(true, 'Downloading small model…');
  els.loadModel.disabled = true;
  els.modelStatus.textContent = 'Starting download…';
  showModelProgress(1, 'Initializing…');

  const initProgressCallback = (p) => {
    const pct = (p?.progress ?? 0) * 100;
    showModelProgress(pct, p?.text ? `${p.text} (${pct.toFixed(0)}%)` : `Loading… ${pct.toFixed(0)}%`);
  };

  try {
    engine = await webllm.CreateMLCEngine(DEFAULT_MODEL, { initProgressCallback });
    els.modelStatus.textContent = `Loaded: ${DEFAULT_MODEL}`;
    els.modelProgress.style.width = '100%';
  } catch (err) {
    console.error(err);
    els.modelStatus.textContent = 'Model failed to load';
    els.loadModel.disabled = false;
  } finally {
    setBusy(false);
  }
}
els.loadModel.addEventListener('click', loadModel);

// ===== In-memory state =====
let currentDoc = null; // { docId, fileName, pages, chunks, vectorsMeta }
let embedder = null;   // Transformers.js pipeline

// ===== PDF ingest flow =====
els.pdfInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  els.sources.innerHTML = '';
  els.answer.textContent = '';
  currentDoc = null;
  logIngest(`Selected: ${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`);
  setBusy(true, 'Reading PDF…');

  try {
    const buf = await file.arrayBuffer();
    const { pages, fullText } = await extractPdfText(buf, (p, total) => {
      logIngest(`Reading page ${p} of ${total}…`);
    });
    logIngest(`PDF parsed. Pages: ${pages.length}, total characters: ${fullText.length.toLocaleString()}`);

    const pageRanges = pages.map(pg => ({ page: pg.page, start: pg.start, end: pg.end }));
    const chunks = makeChunksWithPages(fullText, pageRanges, CHUNK_SIZE, CHUNK_OVERLAP);
    logIngest(`Chunked into ${chunks.length} chunks (~${CHUNK_SIZE} chars each, ${CHUNK_OVERLAP} overlap).`);

    const docId = `${Date.now()}-${file.name}`;
    currentDoc = { docId, fileName: file.name, pages, chunks, vectorsMeta: null };
    renderChunks(chunks);

    await ensureEmbedder();
    logIngest('Embedding chunks… (on-device)');
    setBusy(true, 'Embedding chunks…');

    const vectors = [];
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const vec = await embedText(c.text);
      vectors.push({ id: c.id, page: c.page, charStart: c.charStart, charEnd: c.charEnd, vector: vec });
      if ((i + 1) % 5 === 0 || i === chunks.length - 1) logIngest(`Embedded ${i + 1} / ${chunks.length}`);
      await idle();
    }

    const payload = {
      docId,
      fileName: file.name,
      createdAt: Date.now(),
      dims: vectors[0]?.vector.length || 0,
      chunks,
      vectors,
    };

    // Replace any previous entry with the same fileName (simple versioning)
    let docs = (await localforage.getItem('docs')) || [];
    const filtered = docs.filter(d => d.fileName !== file.name);
    filtered.unshift({ docId, fileName: file.name, createdAt: payload.createdAt });
    await localforage.setItem('docs', filtered);

    // Save vectors
    await localforage.setItem(`doc:${docId}:vectors`, payload);

    currentDoc.vectorsMeta = payload;
    logIngest('✅ Ingest complete: vectors saved locally.');
    if (engine) {
      els.ask.disabled = false; els.ask.setAttribute('aria-disabled', 'false');
      logIngest('You can now ask a question.');
    } else {
      logIngest('Tip: Click “Load Tiny Model” to enable asking questions.');
    }
  } catch (err) {
    console.error(err);
    logIngest('❌ PDF parse/embedding error. Try a different PDF.');
  } finally {
    setBusy(false);
  }
});

// ===== Ask → retrieve → answer with citations =====
els.ask.addEventListener('click', async () => {
  const q = (els.question.value || '').trim();
  if (!q) return;
  if (!engine) { els.answer.textContent = 'Model not loaded. Click “Load Tiny Model”.'; return; }
  if (!currentDoc?.vectorsMeta) { els.answer.textContent = 'No embedded document yet. Upload a PDF first.'; return; }

  setBusy(true, 'Answering…');
  els.answer.textContent = 'Thinking…';

  try {
    await ensureEmbedder();
    const qvec = await embedText(q);
    const k = parseInt(els.topk.value, 10) || 6;
    const { top, all } = topKSimilar(qvec, currentDoc.vectorsMeta.vectors, k);

    // Guardrail: if best match is weak, don't guess
    if (!top.length || (top[0].score ?? 0) < MIN_SIM) {
      els.answer.textContent = "I don't know based on this document. Try a more specific question or increase Top-k.";
      setBusy(false);
      return;
    }

    const ctxBlocks = top.map((t) => {
      const ch = currentDoc.vectorsMeta.chunks.find(c => c.id === t.id);
      const safeText = ch.text.replace(/\n{2,}/g, '\n');
      return `[${ch.id}] (Page ${ch.page ?? 'n/a'})\n"${safeText}"`;
    }).join('\n\n---\n\n');

    const strict = !!els.strictMode?.checked;
    const maxTokens = parseInt(els.maxTokens.value, 10) || 256;

    // Two prompt styles: Strict (extractive) vs Normal (abstractive-lite)
    const promptStrict =
`You must answer ONLY with sentences copied verbatim from the provided chunks.
After each sentence, include the chunk ID in square brackets like [C1].
Do NOT add any outside knowledge. If the chunks don't contain the answer, say exactly: "I don't know."

Question:
${q}

Chunks:
${ctxBlocks}

Answer using only copied sentences with citations like [C#].`;

    const promptNormal =
`You are a careful assistant. Answer using ONLY the provided chunks.
Prefer to quote a few short phrases, and always add 2–4 citations like [C1], [C2].
If you aren't sure, say "I don't know."

Question:
${q}

Chunks:
${ctxBlocks}

Answer with 2–4 citations like [C#].`;

    const messages = [
      { role: 'system', content: strict
        ? 'Extractive QA. Copy sentences only from chunks; always cite like [C1]. No outside info.'
        : 'Be concise, faithful to chunks, and always cite chunk IDs like [C1], [C2].'
      },
      { role: 'user', content: strict ? promptStrict : promptNormal },
    ];

    const reply = await engine.chat.completions.create({
      messages,
      temperature: strict ? 0 : 0.1,
      max_tokens: maxTokens,
    });

    let text = reply?.choices?.[0]?.message?.content ?? '(no output)';
    // If model ignored rules, fall back to explicit "I don't know" when no [C#] is present
    if (!/\[C\d+\]/.test(text)) {
      text = "I don't know based on this document.";
    }

    text = linkifyCitations(text);
    els.answer.innerHTML = text;

    const firstTag = findFirstCitationTag(text);
    if (firstTag) scrollToChunk(firstTag);
  } catch (e) {
    console.error(e);
    els.answer.textContent = 'Generation failed. See console.';
  } finally {
    setBusy(false);
  }
});


// ===== Clear local data =====
els.clearData.addEventListener('click', async () => {
  setBusy(true, 'Clearing data…');
  try {
    await localforage.clear();
    els.sources.innerHTML = '';
    els.answer.textContent = '';
    currentDoc = null;
    logIngest('Cleared local data.');
  } catch (e) {
    console.error(e);
    logIngest('Failed to clear local data.');
  } finally {
    setBusy(false);
  }
});

// ===== PDF text extraction =====
async function extractPdfText(arrayBuffer, onProgress) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const total = pdf.numPages;

  let cursor = 0;
  const pages = [];
  let fullText = '';

  for (let i = 1; i <= total; i++) {
    if (typeof onProgress === 'function') onProgress(i, total);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(it => (it.str || ''));
    const pageText = strings.join('\n').trim();

    const start = cursor;
    fullText += pageText + '\n\n';
    cursor = fullText.length;
    const end = cursor;

    pages.push({ page: i, text: pageText, start, end });
    await idle();
  }
  return { pages, fullText };
}

// ===== Chunking =====
function makeChunksWithPages(fullText, pageRanges, chunkSize, overlap) {
  const chunks = [];
  let i = 0, idx = 1;
  while (i < fullText.length) {
    const end = Math.min(i + chunkSize, fullText.length);
    const text = fullText.slice(i, end).trim();
    const charStart = i, charEnd = end;
    const pages = findOverlappingPages(charStart, charEnd, pageRanges);
    const displayPage = pages.length ? pages[0] : null;
    chunks.push({ id: `C${idx++}`, text, page: displayPage, charStart, charEnd });
    if (end === fullText.length) break;
    i = Math.max(0, end - overlap);
  }
  return chunks;
}
function findOverlappingPages(start, end, pageRanges) {
  const out = [];
  for (const r of pageRanges) {
    const overlaps = !(end <= r.start || start >= r.end);
    if (overlaps) out.push(r.page);
  }
  return out;
}

// ===== Embeddings =====
async function ensureEmbedder() {
  if (embedder) return;
  logIngest('Preparing embedding model… (first load may take a moment)');
  embedder = await pipeline('feature-extraction', EMB_MODEL);
  logIngest('Embedding model ready.');
}
async function embedText(text) {
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// ===== Retrieval: cosine top-k =====
function topKSimilar(queryVec, vectorRows, k = 4) {
  const qn = l2norm(queryVec);
  const scored = vectorRows.map(row => ({ id: row.id, score: cosine(queryVec, qn, row.vector) }));
  scored.sort((a, b) => b.score - a.score);
  return { top: scored.slice(0, k), all: scored };
}
function cosine(q, qn, v) {
  let dot = 0; for (let i = 0; i < q.length; i++) dot += q[i] * v[i];
  return dot / (qn * 1);
}
function l2norm(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]*a[i]; return Math.sqrt(s); }

// ===== Render chunks =====
function renderChunks(chunks) {
  els.sources.innerHTML = '';
  if (!chunks || !chunks.length) { els.sources.textContent = 'No chunks yet.'; return; }
  const frag = document.createDocumentFragment();
  chunks.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'source-chunk';
    div.id = c.id;
    const head = document.createElement('div');
    head.style.fontWeight = '600'; head.style.marginBottom = '4px';
    head.textContent = `${c.id} — Page ${c.page ?? 'n/a'}`;
    const body = document.createElement('div');
    body.textContent = c.text.slice(0, 400) + (c.text.length > 400 ? ' …' : '');
    div.appendChild(head); div.appendChild(body); frag.appendChild(div);
  });
  els.sources.appendChild(frag);
  logIngest(`Rendered ${chunks.length} chunks in Sources.`);
}

// ===== Citations: [C#] → anchor + scroll/highlight =====
function linkifyCitations(text) {
  return text.replace(/\[C(\d+)\]/g, (m, num) => {
    const id = `C${num}`;
    return `<a href="#${id}" data-cite="${id}" style="text-decoration:underline">${m}</a>`;
  });
}
function findFirstCitationTag(html) {
  const m = html.match(/\[C(\d+)\]/);
  return m ? `C${m[1]}` : null;
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-cite]');
  if (!a) return;
  e.preventDefault();
  const id = a.getAttribute('data-cite');
  scrollToChunk(id);
});
function scrollToChunk(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('highlight');
  setTimeout(() => el.classList.remove('highlight'), 1500);
}

// ===== Idle helper =====
function idle() {
  return new Promise((res) => {
    if ('requestIdleCallback' in window) requestIdleCallback(() => res(), { timeout: 50 });
    else setTimeout(res, 0);
  });
}
