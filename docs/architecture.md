# Architecture — Private Doc Chat (100% Browser RAG)

This app implements Retrieval-Augmented Generation entirely **in the browser**. All compute and storage happen locally; no servers or API keys are used.

---

## Block Diagram

```mermaid
graph TD
  A[User PDF Upload] --> B[pdf.js extract text per page]
  B --> C[Sliding Chunker ~900 chars 150 overlap keep page and char ranges]
  C --> D[Transformers.js MiniLM mean pooling normalized]
  D --> E[IndexedDB via localForage docs list and per doc vectors]

  subgraph Retrieval_And_Answering
    Q[User Question] --> Qe[Embed question]
    Qe --> S[Cosine similarity over stored vectors]
    E --> S
    S --> K[Top k selection 3 to 8]
    K --> P[Prompt builder strict or normal add citations and min sim guardrail]
    P --> L[WebLLM MLC WebGPU Llama 3 dot 2 1B Instruct]
    L --> U[Answer with citations UI links scroll and highlight chunk]
  end
<details> <summary><strong>ASCII fallback (click to expand)</strong></summary>
rust
Copy code
Upload -> pdf.js -> Chunker -> Embeddings -> IndexedDB
                                   ^               |
                                   |               |
Question -> Embed -> Cosine Sim -> Top-k -> Prompt -> WebLLM -> Answer (+ citations)
</details> 
```

---

## Key Components

### Parsing
- **Library**: `pdf.js`
- **Output**: concatenated text with per-page ranges:
  - `page`
  - `start` and `end` character offsets (for mapping chunks back to pages)

### Chunking
- **Strategy**: sliding window (`chunkSize ≈ 900`, `overlap ≈ 150`)
- **Metadata per chunk**: `{ id, text, page, charStart, charEnd }`
- **Why**: windowing preserves local context and improves retrieval recall.

### Embeddings
- **Library**: `@xenova/transformers` (Transformers.js)
- **Model**: `Xenova/all-MiniLM-L6-v2`
- **Config**: `pooling = 'mean'`, `normalize = true`
- **Output**: dense vectors stored as JS arrays

### Storage
- **Library**: `localForage` → IndexedDB
- **Layout**:
  - `docs`: lightweight registry of ingested docs
  - `doc:${docId}:vectors`: single record containing `chunks`, `vectors`, `dims`
- **Privacy**: Everything stays on-device. **Clear Data** wipes all keys.

### Retrieval
- **Similarity**: cosine over normalized vectors
- **Selection**: top-k (UI controlled)
- **Guardrail**: `MIN_SIM` threshold (e.g., 0.22) → reply “I don’t know” if best match is too weak

### Generation
- **Library**: `@mlc-ai/web-llm` (WebLLM)
- **Model**: `Llama-3.2-1B-Instruct-q4f16_1-MLC` (small, browser-friendly)
- **Modes**:
  - **Strict (extractive)**: copy sentences only from chunks, temperature=0
  - **Normal (abstractive-lite)**: concise paraphrase, temperature≈0.1
- **Citations**: model instructed to tag `[C#]`; UI converts to anchors

### UI & Accessibility
- Vanilla HTML/CSS/JS
- Keyboard-navigable controls; visible focus rings
- Loading overlay with fail-safes (auto-clear + Esc kill-switch)
- Service Worker caches **app shell** for offline UX (models rely on browser cache)

---

## Design Decisions & Trade-offs

- **Small models** for responsiveness on typical laptops; strict mode ensures factual grounding.
- **Client-side only** simplifies deployment, enhances privacy, and avoids API costs.
- **Cosine similarity** + **top-k** provide predictable retrieval; a reranker can be added later if budget allows.
- **Service Worker** caches only the shell (to avoid storing large model files explicitly).

---

## Extensibility (Future Work)

- URL / paste ingest with boilerplate stripping; OCR for scanned PDFs
- Light reranker (cross-encoder) for better top-k ordering (still in-browser)
- Multi-doc library with tags and filters
- Answer styles (ELI5 / executive summary)
- Export conversation + citations to Markdown





