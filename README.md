# Private Doc Chat — 100% Browser-Only RAG

[![Open Live Demo](https://img.shields.io/badge/Open-Live%20Demo-2ea44f)](https://pranjalmax.github.io/private-doc-chat/)

A lightweight, privacy-first PDF Q&A app. Drop a document, ask questions, and get grounded answers with inline citations — all **on-device**, with **no servers** and **no API keys**.

> **Key idea:** Retrieval-Augmented Generation (RAG) implemented fully in the browser using WebGPU and WebAssembly. The model and embeddings run locally; your files never leave your machine.

---

## Highlights

- **Zero-cost / zero backend**: No OpenAI/Groq/Google keys. No network calls for inference.
- **On-device LLM**: WebLLM (MLC) runs a tiny instruction model in your browser (WebGPU).
- **Local embeddings**: Sentence embeddings via Transformers.js (MiniLM) inside the browser.
- **Grounded answers**: Citations like `[C7]` link to exact text chunks and pages.
- **Privacy by design**: Documents, vectors, and metadata persist only in IndexedDB (localForage).
- **Accessibility & UX**: Keyboard-friendly controls, progress feedback, and strict quote-only mode.

---

## Quick Run (Local)

> Requirements: Desktop **Chrome or Edge** (WebGPU enabled).

1. Open a terminal in this folder and start a simple local server:

   - Python 3:
     ```bash
     python -m http.server 8080
     ```
   - Windows (py launcher):
     ```bash
     py -m http.server 8080
     ```

2. Visit **http://localhost:8080**.

3. Click **“Load Tiny Model”** (first load downloads weights via CDN).

4. **Upload PDF** → wait for “✅ Ingest complete.”

5. Ask a question.  
   - For guaranteed faithfulness, turn on **Strict (quote-only)** — the answer will be composed of sentences copied from the retrieved chunks and cited like `[C3]`.

> The app registers a Service Worker to make the page itself available offline after first load. (Large model files are handled by the browser cache.)

---

## What You Can Do in the UI

- **Upload PDF**: Parse → chunk → embed → persist locally.  
- **Top-k**: Tune retrieval breadth (3–8).  
- **Max answer length**: Cap the output tokens.  
- **Strict (quote-only)**: Extractive answers with citations only; otherwise reply “I don’t know.”  
- **Ask**: Retrieval + prompt to the local LLM, with inline citations.  
- **Clear Data**: Wipes IndexedDB (vectors + metadata) for this origin.

---

## How It Works (High Level)

1. **Parse PDF** with `pdf.js` to extract per-page text.
2. **Chunk** into ~900-char windows with ~150 overlap; track `(page, charStart, charEnd)`.
3. **Embed** each chunk using `@xenova/transformers` (MiniLM) in the browser (ONNX/WASM/WebGPU).
4. **Persist** vectors + metadata in IndexedDB via `localForage`.
5. **Query**: Embed the user question, compute cosine similarity over stored vectors, take top-k chunks.
6. **Prompt**: Build a short instruction + quoted chunks; ask WebLLM for an answer.  
   - **Strict mode** sets temperature to 0 and forces copying only from chunks (with citations).
7. **Citations**: Render `[C#]` tags as anchors; clicking scrolls/highlights the exact chunk.

See `docs/architecture.md` for a diagram and data flow.

---

## Tech Choices (Why These)

- **WebLLM (MLC)** — runs instruction-tuned LLMs in the browser with WebGPU; best in class for on-device inference without native installs.
- **Transformers.js (MiniLM)** — small, fast sentence embeddings portable to the web via ONNX/WASM.
- **pdf.js** — robust text extraction from text-based PDFs.
- **localForage (IndexedDB)** — simple, reliable client-side persistence for a tiny vector store.

---

## Reliability & Guardrails

- **Similarity threshold** — if the best match is weak, the app answers *“I don’t know based on this document.”*
- **Strict mode** — extractive answers only; prevents hallucinations by construction.
- **Progress indicators** — model load, parsing, and embedding show status in the UI.
- **Fail-safe UI** — a stuck overlay auto-clears; **Esc** hides it instantly.

---

## Performance Notes

- Built for typical laptops in modern Chrome/Edge.  
- Embedding time scales with document size; 10–30 page PDFs provide a smooth demo.  
- Answer length and Top-k affect speed; try Top-k = 6 and Max tokens = 128–256 for best balance.

---

## Accessibility

- Keyboard-navigable controls with visible focus.
- ARIA labels on primary actions.
- Citation links are real anchors that move focus to sources.

---

## Privacy

- No uploads. All processing happens locally.
- Use **Clear Data** to wipe everything stored by the app.

---

## Limitations

- **Scanned PDFs (images)** without OCR won’t extract clean text.
- Tiny local models can still drift if Strict is off and the question is vague.
- Browser storage is finite; very large documents may exceed quota.

---

## Folder Guide

- `index.html` — UI shell and library imports  
- `styles.css` — compact, accessible styling  
- `app.js` — PDF ingest, embeddings, retrieval, prompting, citations, UI state  
- `sw.js` — app-shell caching for offline UX  
- `docs/architecture.md` — flow diagram & key details  
- `docs/verification-checklist.md` — manual test steps for demo

---

## License

MIT — use freely, no warranty.

