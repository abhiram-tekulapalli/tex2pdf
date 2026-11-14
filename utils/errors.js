export function createDiagnostic(line, code, message, suggestion = '') {
  return {
    severity: 'error',
    line,
    code,
    message,
    suggestion,
  };
}
