let activeBlobUrl = null;

export function createPdfBlobUrl(pdfBytes) {
  revokePdfBlobUrl();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  activeBlobUrl = URL.createObjectURL(blob);
  return activeBlobUrl;
}

export function revokePdfBlobUrl() {
  if (activeBlobUrl) {
    URL.revokeObjectURL(activeBlobUrl);
    activeBlobUrl = null;
  }
}

export function downloadPdf(pdfBytes, filename = 'document.pdf') {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
