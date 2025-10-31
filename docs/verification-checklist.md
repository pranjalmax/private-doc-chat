# Verification Checklist — Private Doc Chat

Use this list to validate the demo end-to-end in a few minutes.

---

## Environment

- [ ] Using **Chrome or Edge (desktop)** with **WebGPU** enabled.
- [ ] Local server started in this folder:
  - `python -m http.server 8080` (or `py -m http.server 8080`)
- [ ] Open `http://localhost:8080`.

---

## App Status

- [ ] Status panel shows:
  - **WebGPU: Available**
  - **Transformers.js: Ready**
  - **PDF.js: Ready**
  - **localForage: Ready**
- [ ] No blocking overlay is present. (If it appears, press **Esc**.)

---

## Model Load

- [ ] Click **“Load Tiny Model”**.
- [ ] Progress reaches **100%** and the label reads **Loaded: Llama-3.2-1B-Instruct…**.

---

## Ingest a Document

- [ ] Click **Upload PDF** and select a **text-based** 10–30 page PDF.
- [ ] Ingest log shows:
  - `Reading page N of …`
  - `Chunked into … chunks`
  - `Embedding chunks…`
  - `✅ Ingest complete: vectors saved locally.`
- [ ] **Sources** panel lists `C1, C2, …` with page numbers.

---

## Ask (Strict Mode)

- [ ] Enable **Strict (quote-only)**.
- [ ] Ask a concrete question (e.g., “What is the main objective?”).
- [ ] Answer consists of **copied sentences** with citations like `[C3]`.
- [ ] Clicking a citation scrolls and highlights the chunk.

---

## Ask (Normal Mode)

- [ ] Disable **Strict**.
- [ ] Ask the same question.
- [ ] Answer is concise with **2–4 citations** like `[C#]`.

---

## Guardrails

- [ ] Ask something **not present** in the PDF.
- [ ] App responds: **“I don’t know based on this document.”**
  - (Similarity threshold `MIN_SIM` prevents guessing.)

---

## Controls & Variations

- [ ] Change **Top-k** (e.g., 4 → 6) and ask again (citations may change).
- [ ] Adjust **Max answer length** (e.g., 128) and ask again (shorter output).

---

## Privacy / Reset

- [ ] Click **🧹 Clear Data**.
- [ ] **Sources** clears; ingest log notes data cleared.
- [ ] Re-uploading the same PDF works (previous vectors replaced).

---

## Offline (Optional)

- [ ] After one successful run, toggle Wi-Fi **off**.
- [ ] Open a **new tab** to the app:
  - App shell loads (via Service Worker).
  - If the model is cached by the browser, Q&A still runs; otherwise, UI remains usable (re-enable Wi-Fi to reload the model).

---

## Pass Criteria

- End-to-end: Upload → Ingest → Ask → Citations → Clear Data succeeds.
- Strict mode is faithful (only quotes from chunks).
- Normal mode remains grounded (always cites).
- “I don’t know” behavior triggers on weak retrieval.
