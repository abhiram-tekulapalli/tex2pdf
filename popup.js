import { MonospaceLatexEditor } from './editor/editor.js';
import { StandaloneLatexCompiler } from './compiler/latex-compiler.js';
import { PdfPreviewViewer } from './preview/pdf-viewer.js';

const params = new URLSearchParams(window.location.search);
if (params.get('mode') === 'tab') {
  document.documentElement.classList.add('tex-tab-mode');
  document.body.classList.add('tex-tab-mode');
  const expandBtn = document.getElementById('expand-tab-btn');
  if (expandBtn) expandBtn.style.display = 'none';
}

const statusEl = document.getElementById('status-indicator');
const statsEl = document.getElementById('editor-stats');
const compiler = new StandaloneLatexCompiler();

let editor;
let lastCompiledResult = null;

const viewer = new PdfPreviewViewer(document.getElementById('output-mount'), (line) => {
  if (editor) editor.jumpToLine(line);
});

async function runCompilation() {
  if (!editor) return;
  statusEl.textContent = 'Compiling...';
  const res = await compiler.compile(editor.getValue());
  lastCompiledResult = res;
  if (res.success) {
    statusEl.textContent = 'Successful';
    viewer.renderSuccess(res.pdfBytes, res.pages, res.durationMs);
  } else {
    statusEl.textContent = 'Error';
    viewer.renderErrors(res.diagnostics || []);
  }
}

editor = new MonospaceLatexEditor(
  document.getElementById('editor-mount'),
  '',
  (lines, chars) => {
    if (statsEl) statsEl.textContent = `${lines} ${lines === 1 ? 'line' : 'lines'} · ${chars} chars`;
  },
  () => runCompilation()
);

editor.textarea.placeholder = `\\documentclass{article}\n\\begin{document}\nPaste your LaTeX source code here...\n\\end{document}`;

document.getElementById('compile-btn').addEventListener('click', () => {
  runCompilation();
});

document.getElementById('clear-btn').addEventListener('click', () => {
  editor.setValue('');
  lastCompiledResult = null;
  statusEl.textContent = 'Idle';
  viewer.renderIdle();
});

document.getElementById('expand-tab-btn').addEventListener('click', () => {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime && chrome.runtime.getURL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?mode=tab') });
  } else {
    window.open('popup.html?mode=tab', '_blank');
  }
});

// Window size preset buttons (S / M / L)
const SIZE_MAP = {
  sm: { width: 560, height: 420 },
  md: { width: 720, height: 540 },
  lg: { width: 800, height: 600 },
};

function applyPopupDimensions(w, h) {
  const clampedW = Math.max(480, Math.min(800, Math.round(w)));
  const clampedH = Math.max(360, Math.min(600, Math.round(h)));
  document.documentElement.style.width = `${clampedW}px`;
  document.documentElement.style.height = `${clampedH}px`;
  document.body.style.width = `${clampedW}px`;
  document.body.style.height = `${clampedH}px`;
}

document.querySelectorAll('.tex-size-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.getAttribute('data-size');
    if (key && SIZE_MAP[key]) {
      document.querySelectorAll('.tex-size-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      applyPopupDimensions(SIZE_MAP[key].width, SIZE_MAP[key].height);
    }
  });
});

// Draggable Split-Pane Resizer (between LaTeX Editor and PDF Preview)
const paneResizer = document.getElementById('pane-resizer');
const workspace = document.getElementById('tex-workspace');
const editorPane = document.getElementById('editor-pane');
const outputPane = document.getElementById('output-pane');

if (paneResizer && workspace && editorPane && outputPane) {
  let isDraggingSplit = false;

  paneResizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDraggingSplit = true;
    paneResizer.classList.add('dragging');
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDraggingSplit) return;
    const rect = workspace.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const pct = Math.max(25, Math.min(75, (relX / rect.width) * 100));
    editorPane.style.width = `${pct}%`;
    outputPane.style.width = `${100 - pct}%`;
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingSplit) {
      isDraggingSplit = false;
      paneResizer.classList.remove('dragging');
      if (lastCompiledResult && lastCompiledResult.success) {
        viewer.renderSuccess(
          lastCompiledResult.pdfBytes,
          lastCompiledResult.pages,
          lastCompiledResult.durationMs
        );
      }
    }
  });
}

// Draggable Bottom-Right Corner Window Resizer
const cornerResizer = document.getElementById('corner-resizer');
if (cornerResizer) {
  let isResizingWindow = false;
  let startX = 0;
  let startY = 0;
  let startW = 720;
  let startH = 540;

  cornerResizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizingWindow = true;
    startX = e.screenX;
    startY = e.screenY;
    startW = document.body.offsetWidth;
    startH = document.body.offsetHeight;
    document.querySelectorAll('.tex-size-btn').forEach((b) => b.classList.remove('active'));
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizingWindow) return;
    const nextW = startW + (e.screenX - startX);
    const nextH = startH + (e.screenY - startY);
    applyPopupDimensions(nextW, nextH);
  });

  window.addEventListener('mouseup', () => {
    isResizingWindow = false;
  });
}
