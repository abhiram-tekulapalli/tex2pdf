export class MonospaceLatexEditor {
  constructor(mountEl, initialValue = '', onStatsChange = null, onCompileShortcut = null) {
    this.mountEl = mountEl;
    this.onStatsChange = onStatsChange;
    this.onCompileShortcut = onCompileShortcut;

    this.lineNumbersEl = document.createElement('div');
    this.lineNumbersEl.className = 'tex-line-numbers';
    this.textarea = document.createElement('textarea');
    this.textarea.className = 'tex-textarea';
    this.textarea.spellcheck = false;
    this.textarea.value = initialValue;

    this.mountEl.innerHTML = '';
    this.mountEl.appendChild(this.lineNumbersEl);
    this.mountEl.appendChild(this.textarea);

    this.textarea.addEventListener('input', () => this.updateLineNumbers());
    this.textarea.addEventListener('scroll', () => {
      this.lineNumbersEl.scrollTop = this.textarea.scrollTop;
    });
    this.textarea.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (this.onCompileShortcut) this.onCompileShortcut();
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const val = this.textarea.value;
        this.textarea.value = val.slice(0, start) + '  ' + val.slice(end);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
        this.updateLineNumbers();
      }
    });

    // Attach edge-hover auto-scroll to editor textarea
    const EDGE_ZONE_PX = 48;
    const MAX_SPEED = 7;
    let velocity = 0;
    let rafId = null;

    const step = () => {
      if (velocity === 0) {
        rafId = null;
        return;
      }
      this.textarea.scrollTop += velocity;
      this.lineNumbersEl.scrollTop = this.textarea.scrollTop;
      rafId = requestAnimationFrame(step);
    };

    this.textarea.addEventListener('mousemove', (e) => {
      const rect = this.textarea.getBoundingClientRect();
      if (rect.height <= 0 || this.textarea.scrollHeight <= this.textarea.clientHeight) {
        velocity = 0;
        return;
      }
      const relY = e.clientY - rect.top;
      const distBottom = rect.height - relY;

      if (distBottom >= 0 && distBottom < EDGE_ZONE_PX) {
        velocity = Math.max(1.5, ((EDGE_ZONE_PX - distBottom) / EDGE_ZONE_PX) * MAX_SPEED);
        if (rafId === null) rafId = requestAnimationFrame(step);
      } else if (relY >= 0 && relY < EDGE_ZONE_PX && this.textarea.scrollTop > 0) {
        velocity = -Math.max(1.5, ((EDGE_ZONE_PX - relY) / EDGE_ZONE_PX) * MAX_SPEED);
        if (rafId === null) rafId = requestAnimationFrame(step);
      } else {
        velocity = 0;
      }
    });

    this.textarea.addEventListener('mouseleave', () => {
      velocity = 0;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    });

    this.updateLineNumbers();
  }

  updateLineNumbers() {
    const val = this.textarea.value;
    const lines = val ? val.split('\n') : [''];
    const count = Math.max(1, lines.length);
    const nums = [];
    for (let i = 1; i <= count; i++) nums.push(i);
    this.lineNumbersEl.textContent = nums.join('\n');
    if (this.onStatsChange) {
      this.onStatsChange(count, val.length);
    }
  }

  getValue() {
    return this.textarea.value;
  }

  setValue(val) {
    this.textarea.value = val;
    this.updateLineNumbers();
  }

  jumpToLine(lineNumber) {
    const lines = this.textarea.value.split('\n');
    const target = Math.max(1, Math.min(lineNumber, lines.length));
    let startOffset = 0;
    for (let i = 0; i < target - 1; i++) {
      startOffset += lines[i].length + 1;
    }
    const endOffset = startOffset + (lines[target - 1] ? lines[target - 1].length : 0);
    this.textarea.focus();
    this.textarea.setSelectionRange(startOffset, endOffset);
    const lineHeight = 20;
    this.textarea.scrollTop = Math.max(0, (target - 4) * lineHeight);
  }
}
