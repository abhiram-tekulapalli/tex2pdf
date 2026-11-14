import { compileLatexDocument } from './engine/pdf-writer.js';

self.onmessage = (event) => {
  const { id, source } = event.data || {};
  const result = compileLatexDocument(source);
  self.postMessage({ id, ...result });
};
