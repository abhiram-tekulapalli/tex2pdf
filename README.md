# Tex — Local LaTeX-to-PDF Chrome Extension

A lightweight, zero-dependency Chrome Extension (Manifest V3) that compiles LaTeX to PDF entirely in the browser using a custom WebAssembly-free PDF engine. No server, no external services, fully offline-capable.

---

## Features

| Feature | Description |
|---------|-------------|
| **Local compilation** | Runs entirely client-side via Web Worker; no network calls |
| **Real PDF output** | Generates valid `%PDF-1.4` binary with Type1 fonts, RGB color, and URI link annotations |
| **Split-pane editor** | Resizable side-by-side LaTeX source editor + live PDF preview |
| **Diagnostics** | Line-precise error reporting with click-to-jump navigation |
| **Macro system** | `\newcommand` / `\renewcommand` with `#1..#9` balanced-brace expansion |
| **Two-column layout** | `paracol` support with `\columnratio`, `\columnsep`, `\switchcolumn` |
| **Typography** | `\fontsize`, `\definecolor{name}{RGB}{...}`, `\textcolor`, `\color`, `\href` |
| **Section styling** | Custom `\titleformat{\section}` uppercase small-caps headers with rules |
| **Tab mode** | "Open Tab" button launches a full-page version for larger documents |
| **Resizable UI** | S/M/L presets + drag-to-resize panes + corner window resize |
| **Keyboard shortcut** | `Ctrl/Cmd + Enter` to compile |

---

## Quick Start

### Load as Unpacked Extension (Chrome / Edge / Brave)

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** (top-left)
4. Select the `tex/` directory (this folder)
5. Click the **Tex** icon in your toolbar to open

### Usage

1. Paste LaTeX source in the left pane
2. Click **Compile PDF** (or press `Ctrl/Cmd + Enter`)
3. View rendered PDF on the right; click **Download PDF** to save `document.pdf`
4. Errors appear inline with line numbers — click a line number to jump in the editor

---

## Supported LaTeX Subset

The engine implements a curated subset sufficient for résumés, letters, short papers, and handouts:

### Document Structure
```latex
\documentclass[11pt,a4paper]{article}
\usepackage[margin=1in]{geometry}
\begin{document}
...content...
\end{document}
```

### Text & Fonts
- `\textbf`, `\textit`, `\texttt`, `\textbullet`
- `\fontsize{12}{14}\selectfont`
- `\definecolor{myblue}{RGB}{0,51,102}` · `\textcolor{myblue}{text}` · `\color{myblue}`

### Sections & Layout
- `\section`, `\subsection` (with optional `titlesec`-style `\titleformat{\section}{\scshape\uppercase}{}{0pt}{\hrule}`)
- `center`, `flushleft`, `flushright`
- `\hfill` for flush-right on same baseline
- `\vspace{...}`, `\setlength{\parskip}{...}`

### Lists
- `itemize` (bullets), `enumerate` (numbered)

### Two-Column (`paracol`)
```latex
\begin{paracol}{2}
  Left column content
  \switchcolumn
  Right column content
\end{paracol}
```
Supports `\columnratio{0.65}`, `\setlength{\columnsep}{15pt}`.

### Links
```latex
\href{https://example.com}{linked text}
```

### Math (limited)
- Inline `$...$`, display `$$...$$`
- `\frac{a}{b}`, `\sqrt{x}`, basic Greek letters (`\alpha`, `\beta`, etc.)
- Environments: `equation`, `align`, `gather`, `matrix`, `pmatrix`, `bmatrix`, `cases`

### Tables & Figures (structural only)
- `tabular`, `tabular*`, `table`, `figure` — rendered as bordered boxes with captions

---

## Architecture

```
tex/
├── manifest.json              # Manifest V3, CSP allows WASM eval for future
├── popup.html                 # Entry point; loads editor, compiler, viewer
├── popup.js                   # Orchestrates editor ↔ compiler ↔ viewer
├── popup.css                  # Layout, theming, resize handles
├── editor/
│   ├── editor.js              # MonospaceLatexEditor (line numbers, tabs, auto-scroll)
│   └── editor.css
├── compiler/
│   ├── latex-compiler.js      # StandaloneLatexCompiler (Web Worker fallback)
│   ├── worker.js              # Off-main-thread compilation
│   └── engine/
│       └── pdf-writer.js      # Core: parser, macro expander, layout, binary PDF generator
├── preview/
│   ├── pdf-viewer.js          # Canvas-based page renderer + error UI
│   └── pdf-viewer.css
├── utils/
│   ├── download.js            # Blob URL → <a download> click
│   └── errors.js              # Diagnostic factory
└── assets/icons/              # 16/48/128 px PNG icons
```

### Compilation Pipeline

```
LaTeX source (string)
       │
       ▼
stripCommentsPreserveLines()
       │
       ▼
extractAndExpandMacros()  ──► Map of \newcommand definitions
       │
       ▼
expandMacrosInBody()      (5-pass fixed-point expansion)
       │
       ▼
Validation passes:
  • \documentclass / \begin{document} presence
  • XeLaTeX-only package detection (fontspec, unicode-math, etc.)
  • \begin/\end environment matching
  • Known typo detection (\sectoin, \begni, etc.)
  • \frac{}{}, \href{}{} syntax checks
       │
       ▼ (if clean)
parse geometry, colors, fonts, section style
       │
       ▼
renderSequenceInColumn()  ──► Layout ops per page (text, line, rect, links)
       │
       ▼
buildBinaryPdfFromPages() ──► Uint8Array (%PDF-1.4)
       │
       ▼
Worker.postMessage() → popup.js → PdfPreviewViewer.renderSuccess()
```

### PDF Generation Details

- **Format**: `%PDF-1.4` binary (no external libs)
- **Fonts**: Type1 base 14 (Times-Roman, Times-Bold, Times-Italic, Times-BoldItalic, Courier)
- **Color**: RGB stroke/fill via `RG` / `rg` operators
- **Annotations**: `/Link` `/URI` for `\href` clickable regions
- **Coordinates**: 72 DPI points; origin bottom-left; cursor Y tracks baseline

---

## Development

### No Build Step Required

The extension loads directly from source. Edit files and reload the extension in `chrome://extensions` to test.

### Running Locally (Optional)

For a full-page tab experience outside the popup:

```bash
# Any static server works; e.g.:
npx serve .
# Then open http://localhost:3000/popup.html?mode=tab
```

### Project Conventions

- **ES Modules** throughout (`type: module` via `<script type="module">`)
- **Web Worker** for off-main-thread compilation (falls back to sync on Worker error)
- **No dependencies** — zero `node_modules`, no bundler
- **CSP-compliant**: `'wasm-unsafe-eval'` reserved for future Wasm TeX engine

---

## Limitations & Known Gaps

| Area | Status |
|------|--------|
| Full math typesetting | Minimal — fractions, Greek, basic align only |
| Bibliography / citations | Structural only (`thebibliography` renders as list) |
| Font loading | Type1 base 14 only; no TTF/OTF, no `fontspec` |
| TikZ / PGF / graphics | Not supported |
| XeLaTeX / LuaLaTeX packages | Detected & reported as errors |
| `\input` / `\include` | Not supported (single-file only) |
| Right-to-left / complex scripts | Not supported |

---

## Resume Highlights (for the maintainer)

- **Systems-level browser extension**: Manifest V3, CSP, Web Workers, binary PDF generation from scratch
- **Compiler pipeline**: Lexing → macro expansion (fixed-point) → validation → layout → binary serialization
- **PDF internals**: Cross-reference tables, object streams, Type1 font embedding, Link annotations
- **Layout engine**: Multi-column (`paracol`), word-wrap, `\hfill` flush-right, section rule rendering
- **Zero-dependency architecture**: No npm, no Wasm, no server — pure JS/TS-like patterns in vanilla ES modules
- **UX polish**: Split-pane resize, edge-hover auto-scroll, click-to-jump diagnostics, tab-mode fullscreen

---

## License

MIT — free for personal and commercial use.

---

## Contributing

Issues and PRs welcome. Priority areas:

1. Expand math support (more `amsmath` environments)
2. Add `\includegraphics` placeholder rendering
3. Implement `\input` via `fetch` (with CSP allowlist)
4. Port parser to WebAssembly for speed (retain JS fallback)