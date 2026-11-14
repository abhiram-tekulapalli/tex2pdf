import { downloadPdf, revokePdfBlobUrl } from '../utils/download.js';

function attachEdgeAutoScroll(container) {
  if (!container) return;
  const EDGE_ZONE_PX = 52;
  const MAX_SPEED = 8;
  let velocity = 0;
  let rafId = null;

  const step = () => {
    if (!container || velocity === 0) {
      rafId = null;
      return;
    }
    container.scrollTop += velocity;
    rafId = requestAnimationFrame(step);
  };

  container.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    if (rect.height <= 0 || container.scrollHeight <= container.clientHeight) {
      velocity = 0;
      return;
    }
    const relY = e.clientY - rect.top;
    const distBottom = rect.height - relY;

    if (distBottom >= 0 && distBottom < EDGE_ZONE_PX) {
      velocity = Math.max(1.5, ((EDGE_ZONE_PX - distBottom) / EDGE_ZONE_PX) * MAX_SPEED);
      if (rafId === null) rafId = requestAnimationFrame(step);
    } else if (relY >= 0 && relY < EDGE_ZONE_PX && container.scrollTop > 0) {
      velocity = -Math.max(1.5, ((EDGE_ZONE_PX - relY) / EDGE_ZONE_PX) * MAX_SPEED);
      if (rafId === null) rafId = requestAnimationFrame(step);
    } else {
      velocity = 0;
    }
  });

  container.addEventListener('mouseleave', () => {
    velocity = 0;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });
}

function renderPageOnCanvas(page, canvas, scale = 0.56) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.round(page.widthPt * scale);
  const h = Math.round(page.heightPt * scale);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.scale(scale * dpr, scale * dpr);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, page.widthPt, page.heightPt);

  for (const op of page.ops) {
    if (op.kind === 'rect') {
      const topY = page.heightPt - op.y - op.height;
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(op.x, topY, op.width, op.height);
      ctx.strokeStyle = '#d4d4d4';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(op.x, topY, op.width, op.height);
    } else if (op.kind === 'line') {
      const y1 = page.heightPt - op.y1;
      const y2 = page.heightPt - op.y2;
      ctx.beginPath();
      ctx.moveTo(op.x1, y1);
      ctx.lineTo(op.x2, y2);
      if (op.color) {
        const [r, g, b] = op.color;
        ctx.strokeStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
      } else {
        ctx.strokeStyle = '#000000';
      }
      ctx.lineWidth = op.thickness || 0.5;
      ctx.stroke();
    } else if (op.kind === 'text') {
      const topY = page.heightPt - op.y;
      const weight = op.font === 'bold' || op.font === 'boldItalic' ? '700' : '400';
      const style = op.font === 'italic' || op.font === 'boldItalic' ? 'italic' : 'normal';
      const family =
        op.font === 'mono'
          ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
          : 'Georgia, "Times New Roman", Times, serif';
      ctx.font = `${style} ${weight} ${op.size}px ${family}`;
      if (op.color) {
        const [r, g, b] = op.color;
        ctx.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
      } else {
        ctx.fillStyle = '#000000';
      }
      ctx.fillText(op.text, op.x, topY);
    }
  }
  ctx.restore();
}

export class PdfPreviewViewer {
  constructor(mountEl, onJumpToLine = null) {
    this.mountEl = mountEl;
    this.onJumpToLine = onJumpToLine;
    this.renderIdle();
  }

  renderIdle() {
    revokePdfBlobUrl();
    this.mountEl.innerHTML = `
      <div class="tex-output-empty">
        <div>No PDF compiled</div>
        <div style="margin-top:6px;color:#737373">Paste LaTeX source on the left and click <strong>Compile PDF</strong>.</div>
      </div>
    `;
  }

  renderSuccess(pdfBytes, pages, durationMs = 0) {
    revokePdfBlobUrl();
    this.mountEl.innerHTML = '';

    const bar = document.createElement('div');
    bar.className = 'tex-output-bar';
    const kb = (pdfBytes.byteLength / 1024).toFixed(1);
    bar.innerHTML = `
      <span>Compilation status: <strong>Successful</strong> · ${pages.length} page${pages.length === 1 ? '' : 's'} · ${kb} KB · ${durationMs} ms</span>
    `;

    const dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.className = 'tex-btn-primary';
    dlBtn.textContent = 'Download PDF';
    dlBtn.addEventListener('click', () => downloadPdf(pdfBytes, 'document.pdf'));
    bar.appendChild(dlBtn);

    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'tex-pages-scroll';
    attachEdgeAutoScroll(scrollContainer);

    const isTab = document.body.classList.contains('tex-tab-mode');
    const scale = isTab ? 0.86 : 0.56;

    pages.forEach((page) => {
      const wrapper = document.createElement('div');
      const card = document.createElement('div');
      card.className = 'tex-page-card';
      const canvas = document.createElement('canvas');
      canvas.className = 'tex-page-canvas';
      renderPageOnCanvas(page, canvas, scale);
      card.appendChild(canvas);

      const caption = document.createElement('div');
      caption.className = 'tex-page-caption';
      caption.textContent = `Page ${page.pageNumber} of ${pages.length}`;

      wrapper.appendChild(card);
      wrapper.appendChild(caption);
      scrollContainer.appendChild(wrapper);
    });

    this.mountEl.appendChild(bar);
    this.mountEl.appendChild(scrollContainer);
  }

  renderErrors(diagnostics) {
    revokePdfBlobUrl();
    this.mountEl.innerHTML = '';

    const bar = document.createElement('div');
    bar.className = 'tex-output-bar';
    bar.innerHTML = `<span>Compilation status: <strong>Failed</strong> · ${diagnostics.length} error${diagnostics.length === 1 ? '' : 's'}</span>`;

    const list = document.createElement('div');
    list.className = 'tex-error-list';
    attachEdgeAutoScroll(list);

    diagnostics.forEach((d) => {
      const item = document.createElement('div');
      item.className = 'tex-error-item';

      const header = document.createElement('div');
      header.className = 'tex-error-header';
      const titleSpan = document.createElement('span');
      titleSpan.textContent = `! LaTeX Error: ${d.code}`;
      header.appendChild(titleSpan);

      if (d.line) {
        const jumpBtn = document.createElement('button');
        jumpBtn.type = 'button';
        jumpBtn.className = 'tex-error-jump';
        jumpBtn.textContent = `Line ${d.line} →`;
        jumpBtn.addEventListener('click', () => {
          if (this.onJumpToLine) this.onJumpToLine(d.line);
        });
        header.appendChild(jumpBtn);
      }

      const msg = document.createElement('div');
      msg.textContent = d.message;

      item.appendChild(header);
      item.appendChild(msg);

      if (d.context) {
        const snippet = document.createElement('pre');
        snippet.className = 'tex-error-snippet';
        snippet.textContent = `l.${d.line || 1}  ${d.context}`;
        item.appendChild(snippet);
      }

      if (d.suggestion) {
        const hint = document.createElement('div');
        hint.style.marginTop = '6px';
        hint.style.color = '#525252';
        hint.textContent = `Hint: ${d.suggestion}`;
        item.appendChild(hint);
      }

      list.appendChild(item);
    });

    this.mountEl.appendChild(bar);
    this.mountEl.appendChild(list);
  }
}
