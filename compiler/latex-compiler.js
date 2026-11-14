import { compileLatexDocument } from './engine/pdf-writer.js';

export class StandaloneLatexCompiler {
  constructor() {
    this.seq = 0;
    this.worker = null;
    try {
      this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    } catch {
      this.worker = null;
    }
  }

  compile(source) {
    const id = ++this.seq;
    if (!this.worker) {
      return Promise.resolve({ id, ...compileLatexDocument(source) });
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ id, ...compileLatexDocument(source) });
      }, 3000);

      const handler = (event) => {
        if (event.data && event.data.id === id) {
          clearTimeout(timeout);
          this.worker.removeEventListener('message', handler);
          resolve(event.data);
        }
      };

      const errHandler = () => {
        clearTimeout(timeout);
        this.worker.removeEventListener('error', errHandler);
        resolve({ id, ...compileLatexDocument(source) });
      };

      this.worker.addEventListener('message', handler);
      this.worker.addEventListener('error', errHandler);
      this.worker.postMessage({ id, source });
    });
  }
}
