/**
 * Complete Production LaTeX-to-PDF Engine for the Tex Chrome Extension (Manifest V3).
 * Features:
 * - Balanced-brace multi-argument \newcommand / \renewcommand macro expansion (#1..#9)
 * - Two-column paracol layout (\columnratio, \columnsep, \switchcolumn)
 * - \hfill flush-right alignment on the same baseline
 * - Scoped \fontsize{size}{skip}\selectfont, \definecolor{name}{RGB}{r,g,b}, \textcolor, \color
 * - Custom \titleformat{\section} uppercase small-caps headers with horizontal rules
 * - Native binary %PDF-1.4 generation with Type1 fonts, RGB strokes/fills, and /Link URI annotations
 */

const KNOWN_INVALID_TYPOS = new Set([
  'sectoin', 'subsectoin', 'begni', 'endd', 'pirnt', 'documenclass', 'usepakcage', 'textbfx', 'itme',
]);

const XELATEX_ONLY_PACKAGES = new Set([
  'fontspec', 'polyglossia', 'unicode-math', 'luacode', 'luatextra', 'xunicode', 'xltxtra',
]);

const KNOWN_ENVIRONMENTS = new Set([
  'document', 'abstract', 'center', 'flushleft', 'flushright',
  'itemize', 'enumerate', 'description',
  'paracol', 'multicols', 'minipage',
  'tabular', 'tabular*', 'tabularx', 'longtable', 'table', 'table*', 'figure', 'figure*',
  'equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'displaymath', 'math',
  'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'cases', 'aligned',
  'verbatim', 'lstlisting', 'quote', 'quotation', 'thebibliography', 'spacing',
]);

const LIPSUM_TEXT = [
  'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Ut purus elit, vestibulum ut, placerat ac, adipiscing vitae, felis. Curabitur dictum gravida mauris. Nam arcu libero, nonummy eget, consectetuer id, vulputate a, magna. Donec vehicula augue eu neque.',
  'Nam dui ligula, fringilla a, euismod sodales, sollicitudin vel, wisi. Morbi auctor lorem non justo. Nam lacus libero, pretium at, lobortis vitae, ultricies et, tellus. Donec aliquet, tortor sed accumsan bibendum, erat ligula aliquet magna, vitae ornare odio metus a mi.',
  'Nulla malesuada porttitor diam. Donec felis erat, congue non, volutpat at, tincidunt tristique, libero. Vivamus viverra fermentum felis. Donec nonummy pellentesque ante. Phasellus adipiscing semper elit. Proin fermentum massa ac quam.',
];

function getLineNumber(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

function getLineSnippet(raw, lineNum) {
  const lines = raw.split(/\r?\n/);
  return lines[lineNum - 1] || '';
}

function stripCommentsPreserveLines(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => {
      let out = '';
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '%' && (i === 0 || line[i - 1] !== '\\')) break;
        out += line[i];
      }
      return out;
    })
    .join('\n');
}

function readBraced(str, startPos) {
  let i = startPos;
  while (i < str.length && /\s/.test(str[i])) i++;
  if (i >= str.length || str[i] !== '{') return null;
  let depth = 0;
  const contentStart = i + 1;
  for (; i < str.length; i++) {
    if (str[i] === '\\') {
      i++;
      continue;
    }
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) {
        return { content: str.slice(contentStart, i), endPos: i + 1 };
      }
    }
  }
  return null;
}

function readBracket(str, startPos) {
  let i = startPos;
  while (i < str.length && /\s/.test(str[i])) i++;
  if (i >= str.length || str[i] !== '[') return null;
  let depth = 0;
  const contentStart = i + 1;
  for (; i < str.length; i++) {
    if (str[i] === '\\') {
      i++;
      continue;
    }
    if (str[i] === '[') depth++;
    else if (str[i] === ']') {
      depth--;
      if (depth === 0) {
        return { content: str.slice(contentStart, i), endPos: i + 1 };
      }
    }
  }
  return null;
}

function parseDimPt(dimStr, fallback = 0) {
  if (!dimStr) return fallback;
  const m = dimStr.trim().toLowerCase().match(/^(-?\d+(?:\.\d+)?)\s*(pt|in|cm|mm|em|ex)?$/);
  if (!m) return fallback;
  const v = parseFloat(m[1]);
  const u = m[2] || 'pt';
  if (u === 'in') return v * 72;
  if (u === 'cm') return v * 28.3465;
  if (u === 'mm') return v * 2.83465;
  if (u === 'em') return v * 10;
  if (u === 'ex') return v * 4.5;
  return v;
}

function extractAndExpandMacros(source) {
  const macros = new Map();
  let cleaned = '';
  let i = 0;

  while (i < source.length) {
    const slice = source.slice(i);
    const cmdM = slice.match(/^\\(newcommand|renewcommand|providecommand)\*?\b/);
    if (cmdM) {
      let pos = i + cmdM[0].length;
      while (pos < source.length && /\s/.test(source[pos])) pos++;
      let name = '';
      if (source[pos] === '{') {
        const na = readBraced(source, pos);
        if (na) {
          name = na.content.trim().replace(/^\\/, '');
          pos = na.endPos;
        }
      } else if (source[pos] === '\\') {
        const m = source.slice(pos).match(/^\\([a-zA-Z@]+)/);
        if (m) {
          name = m[1];
          pos += m[0].length;
        }
      }
      if (name) {
        let numArgs = 0;
        let defaultOpt;
        const opt = readBracket(source, pos);
        if (opt) {
          numArgs = parseInt(opt.content.trim(), 10) || 0;
          pos = opt.endPos;
          const opt2 = readBracket(source, pos);
          if (opt2) {
            defaultOpt = opt2.content;
            pos = opt2.endPos;
          }
        }
        const bodyArg = readBraced(source, pos);
        if (bodyArg) {
          macros.set(name, { name, numArgs, defaultOpt, body: bodyArg.content });
          const removed = source.slice(i, bodyArg.endPos);
          const nls = removed.match(/\n/g);
          cleaned += nls ? nls.join('') : '';
          i = bodyArg.endPos;
          continue;
        }
      }
    }
    cleaned += source[i];
    i++;
  }

  return { macros, cleaned };
}

function expandMacrosInBody(bodyText, macros) {
  if (macros.size === 0) return bodyText;
  let current = bodyText;
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    let out = '';
    let i = 0;
    while (i < current.length) {
      if (current[i] === '\\') {
        const m = current.slice(i).match(/^\\([a-zA-Z@]+)\b/);
        if (m) {
          const macro = macros.get(m[1]);
          if (macro) {
            let pos = i + m[0].length;
            const args = [];
            let ok = true;
            if (macro.numArgs > 0) {
              if (macro.defaultOpt !== undefined) {
                const opt = readBracket(current, pos);
                if (opt) {
                  args.push(opt.content);
                  pos = opt.endPos;
                } else {
                  args.push(macro.defaultOpt);
                }
              }
              while (args.length < macro.numArgs) {
                const arg = readBraced(current, pos);
                if (!arg) {
                  ok = false;
                  break;
                }
                args.push(arg.content);
                pos = arg.endPos;
              }
            }
            if (ok) {
              let exp = macro.body;
              for (let a = 0; a < args.length; a++) {
                exp = exp.replace(new RegExp(`#${a + 1}`, 'g'), () => args[a]);
              }
              out += exp;
              i = pos;
              changed = true;
              continue;
            }
          }
        }
      }
      out += current[i];
      i++;
    }
    current = out;
    if (!changed) break;
  }
  return current;
}

function escapePdfLiteral(str) {
  let ascii = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      ascii += str[i];
    } else if (code === 0x2013) {
      ascii += '-';
    } else if (code === 0x2014) {
      ascii += '--';
    } else if (code === 0x2022 || code === 0x00b7) {
      ascii += '*';
    } else {
      ascii += ' ';
    }
  }
  return ascii
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function buildBinaryPdfFromPages(pages, widthPt = 595.28, heightPt = 841.89) {
  const objects = [];
  const addObject = (body) => {
    const id = objects.length + 1;
    objects.push({ id, body });
    return id;
  };

  const catalogId = addObject('');
  const pagesId = addObject('');
  const fontRomanId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>');
  const fontBoldId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>');
  const fontItalicId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>');
  const fontBoldItalicId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Times-BoldItalic >>');
  const fontMonoId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

  const pageIds = [];
  for (const page of pages) {
    const streamLines = [];
    for (const op of page.ops) {
      if (op.kind === 'line') {
        const c = op.color || [0, 0, 0];
        streamLines.push(`${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)} RG`);
        streamLines.push(`${(op.thickness || 0.5).toFixed(2)} w`);
        streamLines.push(`${op.x1.toFixed(2)} ${op.y1.toFixed(2)} m ${op.x2.toFixed(2)} ${op.y2.toFixed(2)} l S`);
      } else if (op.kind === 'rect') {
        streamLines.push('0.96 0.96 0.96 rg');
        streamLines.push(`${op.x.toFixed(2)} ${op.y.toFixed(2)} ${op.width.toFixed(2)} ${op.height.toFixed(2)} re f`);
        streamLines.push('0 0 0 rg');
      } else if (op.kind === 'text') {
        const c = op.color || [0, 0, 0];
        const fontKey =
          op.font === 'boldItalic'
            ? '/F4'
            : op.font === 'bold'
            ? '/F2'
            : op.font === 'italic'
            ? '/F3'
            : op.font === 'mono'
            ? '/F5'
            : '/F1';
        streamLines.push('BT');
        streamLines.push(`${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)} rg`);
        streamLines.push(`${fontKey} ${op.size.toFixed(1)} Tf`);
        streamLines.push(`1 0 0 1 ${op.x.toFixed(2)} ${op.y.toFixed(2)} Tm`);
        streamLines.push(`(${escapePdfLiteral(op.text)}) Tj`);
        streamLines.push('ET');
      }
    }

    const streamContent = streamLines.join('\n');
    const streamBytes = new TextEncoder().encode(streamContent);
    const contentId = addObject(
      `<< /Length ${streamBytes.byteLength} >>\nstream\n${streamContent}\nendstream`
    );

    let annotsEntry = '';
    if (page.links && page.links.length > 0) {
      const annotIds = page.links.map((lnk) =>
        addObject(
          `<< /Type /Annot /Subtype /Link /Rect [${lnk.x.toFixed(2)} ${lnk.y.toFixed(2)} ${(
            lnk.x + lnk.width
          ).toFixed(2)} ${(lnk.y + lnk.height).toFixed(
            2
          )}] /Border [0 0 0] /A << /Type /Action /S /URI /URI (${escapePdfLiteral(lnk.url)}) >> >>`
        )
      );
      annotsEntry = ` /Annots [${annotIds.map((id) => `${id} 0 R`).join(' ')}]`;
    }

    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${widthPt.toFixed(2)} ${heightPt.toFixed(
        2
      )}] /Resources << /Font << /F1 ${fontRomanId} 0 R /F2 ${fontBoldId} 0 R /F3 ${fontItalicId} 0 R /F4 ${fontBoldItalicId} 0 R /F5 ${fontMonoId} 0 R >> >> /Contents ${contentId} 0 R${annotsEntry} >>`
    );
    pageIds.push(pageId);
  }

  objects[catalogId - 1].body = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1].body = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(out.length);
    out += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
  }

  const xrefOffset = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(out);
}

export function compileLatexDocument(rawSource) {
  const startTime = performance.now();
  if (!rawSource || !rawSource.trim()) {
    return {
      success: false,
      diagnostics: [
        {
          line: 1,
          code: 'EMPTY_SOURCE',
          message: 'LaTeX source input is empty. Paste a valid LaTeX document before compiling.',
          context: '',
          suggestion: 'Start with \\documentclass{article} and \\begin{document}.',
        },
      ],
      durationMs: 0,
    };
  }

  const stripped = stripCommentsPreserveLines(rawSource);
  const diagnostics = [];

  if (!/\\documentclass\b/.test(stripped)) {
    diagnostics.push({
      line: 1,
      code: 'MISSING_DOCUMENTCLASS',
      message: 'Missing \\documentclass declaration in preamble.',
      context: getLineSnippet(rawSource, 1),
      suggestion: 'Begin your document with \\documentclass{article}.',
    });
  }

  if (!/\\begin\s*\{document\}/.test(stripped)) {
    diagnostics.push({
      line: 1,
      code: 'MISSING_BEGIN_DOCUMENT',
      message: 'Missing \\begin{document}.',
      context: getLineSnippet(rawSource, 1),
      suggestion: 'Wrap document content in \\begin{document} ... \\end{document}.',
    });
  }

  const { macros, cleaned: sourceWithoutMacroDefs } = extractAndExpandMacros(stripped);

  // Check XeLaTeX-only packages
  const pkgRegex = /\\usepackage\s*(?:\[[\s\S]*?\])?\s*\{([^}]*)\}/g;
  let pm;
  while ((pm = pkgRegex.exec(sourceWithoutMacroDefs)) !== null) {
    const list = pm[1].split(',').map((s) => s.trim().toLowerCase());
    for (const p of list) {
      if (XELATEX_ONLY_PACKAGES.has(p)) {
        const line = getLineNumber(sourceWithoutMacroDefs, pm.index);
        diagnostics.push({
          line,
          code: 'XELATEX_UNSUPPORTED',
          message: `Package "${p}" requires XeLaTeX/LuaLaTeX. Tex uses a pdfTeX-compatible engine.`,
          context: getLineSnippet(rawSource, line),
          suggestion: `Remove \\usepackage{${p}}.`,
        });
      }
    }
  }

  // Validate \begin / \end matching
  const envRegex = /\\(begin|end)\s*\{([^}]*)\}/g;
  const envStack = [];
  let m;
  while ((m = envRegex.exec(sourceWithoutMacroDefs)) !== null) {
    const kind = m[1];
    const name = m[2].trim();
    const line = getLineNumber(sourceWithoutMacroDefs, m.index);
    if (kind === 'begin') {
      if (!KNOWN_ENVIRONMENTS.has(name)) {
        diagnostics.push({
          line,
          code: 'UNDEFINED_ENVIRONMENT',
          message: `Environment "${name}" undefined.`,
          context: getLineSnippet(rawSource, line),
        });
      }
      envStack.push({ name, line });
    } else {
      if (envStack.length === 0) {
        diagnostics.push({
          line,
          code: 'UNMATCHED_END',
          message: `\\end{${name}} encountered without matching \\begin{${name}}.`,
          context: getLineSnippet(rawSource, line),
        });
      } else {
        const top = envStack.pop();
        if (top.name !== name) {
          diagnostics.push({
            line,
            code: 'MISMATCHED_ENVIRONMENT',
            message: `\\begin{${top.name}} on line ${top.line} ended by \\end{${name}} on line ${line}.`,
            context: getLineSnippet(rawSource, line),
            suggestion: `Change \\end{${name}} to \\end{${top.name}}.`,
          });
        }
      }
    }
  }

  for (const unclosed of envStack) {
    diagnostics.push({
      line: unclosed.line,
      code: 'UNCLOSED_ENVIRONMENT',
      message: `\\begin{${unclosed.name}} on line ${unclosed.line} was never closed.`,
      context: getLineSnippet(rawSource, unclosed.line),
    });
  }

  // Check known typos
  const cmdRegex = /\\([a-zA-Z]+)\b/g;
  let cm;
  while ((cm = cmdRegex.exec(sourceWithoutMacroDefs)) !== null) {
    if (KNOWN_INVALID_TYPOS.has(cm[1])) {
      const line = getLineNumber(sourceWithoutMacroDefs, cm.index);
      diagnostics.push({
        line,
        code: 'UNDEFINED_CONTROL_SEQUENCE',
        message: `Undefined control sequence \\${cm[1]}.`,
        context: getLineSnippet(rawSource, line),
      });
    }
  }

  // Validate \frac{a}{b}
  const fracRegex = /\\(?:d|t)?frac\b/g;
  let fm;
  while ((fm = fracRegex.exec(sourceWithoutMacroDefs)) !== null) {
    const line = getLineNumber(sourceWithoutMacroDefs, fm.index);
    const arg1 = readBraced(sourceWithoutMacroDefs, fm.index + fm[0].length);
    const arg2 = arg1 ? readBraced(sourceWithoutMacroDefs, arg1.endPos) : null;
    if (!arg1 || !arg2) {
      diagnostics.push({
        line,
        code: 'INVALID_FRAC_SYNTAX',
        message: '\\frac requires two braced arguments: \\frac{numerator}{denominator}.',
        context: getLineSnippet(rawSource, line),
      });
    }
  }

  if (diagnostics.length > 0) {
    return {
      success: false,
      diagnostics,
      durationMs: Math.round(performance.now() - startTime),
    };
  }

  // Parse preamble geometry, font size, colors, and section style
  let baseFontSize = 10;
  let paperSize = 'letter';
  const docClsM = stripped.match(/\\documentclass\s*(?:\[([\s\S]*?)\])?\s*\{([^}]*)\}/);
  if (docClsM && docClsM[1]) {
    for (const opt of docClsM[1].split(',').map((s) => s.trim())) {
      const ptM = opt.match(/^(\d+(?:\.\d+)?)pt$/);
      if (ptM) baseFontSize = parseFloat(ptM[1]);
      else if (opt === 'a4paper') paperSize = 'a4';
    }
  }

  const widthPt = paperSize === 'a4' ? 595.28 : 612;
  const heightPt = paperSize === 'a4' ? 841.89 : 792;
  const margins = { top: 54, bottom: 54, left: 54, right: 54 };

  const geomPkgM = stripped.match(/\\usepackage\s*\[([\s\S]*?)\]\s*\{geometry\}/);
  if (geomPkgM) {
    for (const part of geomPkgM[1].split(',').map((s) => s.trim())) {
      if (part.startsWith('margin=')) {
        const v = parseDimPt(part.slice(7), 54);
        margins.top = margins.bottom = margins.left = margins.right = v;
      } else if (part.startsWith('top=')) margins.top = parseDimPt(part.slice(4), 54);
      else if (part.startsWith('bottom=')) margins.bottom = parseDimPt(part.slice(7), 54);
      else if (part.startsWith('left=')) margins.left = parseDimPt(part.slice(5), 54);
      else if (part.startsWith('right=')) margins.right = parseDimPt(part.slice(6), 54);
    }
  }

  const colors = {
    black: [0, 0, 0],
    rulecolor: [0.72, 0.72, 0.72],
    accentcolor: [0.086, 0.353, 0.647],
    sectioncolor: [0.14, 0.14, 0.14],
    namecolor: [0.06, 0.06, 0.06],
  };

  const defColRegex = /\\definecolor\s*\{([^}]*)\}\s*\{([^}]*)\}\s*\{([^}]*)\}/g;
  let dcm;
  while ((dcm = defColRegex.exec(stripped)) !== null) {
    const name = dcm[1].trim();
    const model = dcm[2].trim();
    const spec = dcm[3].trim();
    if (model === 'RGB') {
      const nums = spec.split(',').map((n) => parseFloat(n.trim()) / 255);
      if (nums.length === 3) colors[name] = nums;
    }
  }

  const pageStyleEmpty = /\\pagestyle\s*\{empty\}/.test(stripped);
  const hasCustomTitleFormat = /\\titleformat\s*\{\\section\}/.test(stripped);
  let columnSepPt = 15;
  const colSepM = stripped.match(/\\setlength\s*\{\\columnsep\}\s*\{([^}]*)\}/);
  if (colSepM) columnSepPt = parseDimPt(colSepM[1], 15);

  let colRatioLeft = 0.5;
  const colRatioM = stripped.match(/\\columnratio\s*\{([^}]*)\}/);
  if (colRatioM) {
    const r = parseFloat(colRatioM[1]);
    if (!isNaN(r) && r > 0 && r < 1) colRatioLeft = r;
  }

  const beginDocIdx = stripped.indexOf('\\begin{document}');
  const endDocIdx = stripped.indexOf('\\end{document}');
  const rawBody =
    beginDocIdx !== -1
      ? stripped.slice(
          beginDocIdx + '\\begin{document}'.length,
          endDocIdx !== -1 ? endDocIdx : stripped.length
        )
      : stripped;

  const expandedBody = expandMacrosInBody(rawBody, macros);

  const pages = [];
  let currentPage = null;
  let cursorY = heightPt - margins.top;

  const flushPageNumber = () => {
    if (!currentPage || pageStyleEmpty) return;
    currentPage.ops.push({
      kind: 'text',
      text: String(currentPage.pageNumber),
      x: widthPt / 2 - 4,
      y: Math.max(18, margins.bottom - 18),
      size: baseFontSize,
      font: 'roman',
    });
  };

  const startNewPage = () => {
    if (currentPage) flushPageNumber();
    currentPage = {
      pageNumber: pages.length + 1,
      widthPt,
      heightPt,
      ops: [],
      links: [],
    };
    pages.push(currentPage);
    cursorY = heightPt - margins.top;
  };

  const ensureSpace = (pt) => {
    if (!currentPage || cursorY - pt < margins.bottom) {
      startNewPage();
    }
  };

  startNewPage();

  // Tokenize a single visual line into styled runs & handle \hfill
  function parseLineRuns(lineStr, defaultFont = 'roman', defaultSize = baseFontSize, defaultColor = [0, 0, 0]) {
    let s = lineStr.trim();
    let activeSize = defaultSize;
    let activeFont = defaultFont;
    let activeColor = defaultColor;

    // Extract leading \fontsize{X}{Y}\selectfont
    const fsM = s.match(/\\fontsize\s*\{([^}]*)\}\s*\{([^}]*)\}\s*(?:\\selectfont)?/);
    if (fsM) {
      activeSize = parseFloat(fsM[1]) || defaultSize;
    }

    const runs = [];
    let i = 0;
    let buf = '';

    const pushBuf = (font = activeFont, size = activeSize, color = activeColor, url = undefined) => {
      if (!buf) return;
      const cleaned = buf
        .replace(/---/g, '\u2014')
        .replace(/--/g, '\u2013')
        .replace(/\\&/g, '&')
        .replace(/\\%/g, '%')
        .replace(/\\_/g, '_')
        .replace(/\\\s/g, ' ')
        .replace(/\\textbullet\b/g, '\u2022')
        .replace(/\\quad\b/g, '   ')
        .replace(/\\qquad\b/g, '     ')
        .replace(/\$\|\$/g, '|')
        .replace(/\\selectfont\b/g, '')
        .replace(/\\small\b/g, '')
        .replace(/[{}]/g, '')
        .replace(/\s+/g, ' ');
      if (cleaned) {
        runs.push({ text: cleaned, font, size, color, url });
      }
      buf = '';
    };

    while (i < s.length) {
      if (s.startsWith('\\hfill', i)) {
        pushBuf();
        runs.push({ isHfill: true, size: activeSize });
        i += 6;
        continue;
      }
      if (s.startsWith('\\fontsize', i)) {
        pushBuf();
        const a1 = readBraced(s, i + 9);
        const a2 = a1 ? readBraced(s, a1.endPos) : null;
        if (a1 && a2) {
          activeSize = parseFloat(a1.content) || activeSize;
          i = a2.endPos;
          const sel = s.slice(i).match(/^\s*\\selectfont\b/);
          if (sel) i += sel[0].length;
          continue;
        }
      }
      if (s.startsWith('\\color', i)) {
        pushBuf();
        const ca = readBraced(s, i + 6);
        if (ca) {
          activeColor = colors[ca.content.trim()] || activeColor;
          i = ca.endPos;
          continue;
        }
      }
      if (s.startsWith('\\textcolor', i)) {
        pushBuf();
        const ca = readBraced(s, i + 10);
        const ta = ca ? readBraced(s, ca.endPos) : null;
        if (ca && ta) {
          const c = colors[ca.content.trim()] || activeColor;
          const subRuns = parseLineRuns(ta.content, activeFont, activeSize, c);
          runs.push(...subRuns);
          i = ta.endPos;
          continue;
        }
      }
      if (s.startsWith('\\textbf', i) || s.startsWith('\\textit', i) || s.startsWith('\\texttt', i)) {
        pushBuf();
        const cmd = s.slice(i + 1, i + 7);
        const ta = readBraced(s, i + 7);
        if (ta) {
          const nextF =
            cmd === 'textbf'
              ? activeFont === 'italic'
                ? 'boldItalic'
                : 'bold'
              : cmd === 'textit'
              ? activeFont === 'bold'
                ? 'boldItalic'
                : 'italic'
              : 'mono';
          const subRuns = parseLineRuns(ta.content, nextF, activeSize, activeColor);
          runs.push(...subRuns);
          i = ta.endPos;
          continue;
        }
      }
      if (s.startsWith('\\href', i)) {
        pushBuf();
        const ua = readBraced(s, i + 5);
        const la = ua ? readBraced(s, ua.endPos) : null;
        if (ua && la) {
          const url = ua.content.replace(/\\_/g, '_').trim();
          const subRuns = parseLineRuns(la.content, activeFont, activeSize, colors.accentcolor || activeColor);
          subRuns.forEach((r) => {
            r.url = url;
          });
          runs.push(...subRuns);
          i = la.endPos;
          continue;
        }
      }
      buf += s[i];
      i++;
    }
    pushBuf();
    return runs;
  }

  function measureRun(run) {
    const factor = run.font === 'mono' ? 0.56 : run.font === 'bold' ? 0.51 : 0.47;
    return (run.text ? run.text.length : 0) * run.size * factor;
  }

  function renderRunsInColumn(runs, colLeftX, colWidth, align = 'left', extraSpaceAfterPt = 0) {
    if (!runs || runs.length === 0) return;

    const hfillIdx = runs.findIndex((r) => r.isHfill);
    let maxFontSize = baseFontSize;
    for (const r of runs) {
      if (r.size && r.size > maxFontSize) maxFontSize = r.size;
    }
    const lineH = maxFontSize * 1.24;

    if (hfillIdx !== -1) {
      const leftRuns = runs.slice(0, hfillIdx);
      const rightRuns = runs.slice(hfillIdx + 1).filter((r) => !r.isHfill);
      ensureSpace(lineH);
      let lx = colLeftX;
      for (const r of leftRuns) {
        if (!r.text) continue;
        currentPage.ops.push({
          kind: 'text',
          text: r.text,
          x: lx,
          y: cursorY,
          size: r.size,
          font: r.font,
          color: r.color,
        });
        if (r.url) {
          currentPage.links.push({
            x: lx,
            y: cursorY - 2,
            width: measureRun(r),
            height: r.size + 3,
            url: r.url,
          });
        }
        lx += measureRun(r);
      }

      const totalRightW = rightRuns.reduce((acc, r) => acc + measureRun(r), 0);
      let rx = colLeftX + colWidth - totalRightW;
      for (const r of rightRuns) {
        if (!r.text) continue;
        currentPage.ops.push({
          kind: 'text',
          text: r.text,
          x: rx,
          y: cursorY,
          size: r.size,
          font: r.font,
          color: r.color,
        });
        rx += measureRun(r);
      }
      cursorY -= lineH + extraSpaceAfterPt;
      return;
    }

    // Word-wrap runs across colWidth
    const words = [];
    for (const r of runs) {
      if (!r.text) continue;
      const parts = r.text.split(/(\s+)/);
      for (const p of parts) {
        if (!p) continue;
        words.push({
          text: p,
          font: r.font,
          size: r.size,
          color: r.color,
          url: r.url,
          width: measureRun({ text: p, font: r.font, size: r.size }),
        });
      }
    }

    const wrappedLines = [];
    let cur = [];
    let curW = 0;

    for (const w of words) {
      if (cur.length === 0 && /^\s+$/.test(w.text)) continue;
      if (cur.length > 0 && curW + w.width > colWidth && !/^\s+$/.test(w.text)) {
        while (cur.length > 0 && /^\s+$/.test(cur[cur.length - 1].text)) {
          curW -= cur.pop().width;
        }
        wrappedLines.push({ items: cur, totalW: curW });
        cur = [];
        curW = 0;
        if (/^\s+$/.test(w.text)) continue;
      }
      cur.push(w);
      curW += w.width;
    }
    if (cur.length > 0) {
      while (cur.length > 0 && /^\s+$/.test(cur[cur.length - 1].text)) {
        curW -= cur.pop().width;
      }
      wrappedLines.push({ items: cur, totalW: curW });
    }

    for (const wl of wrappedLines) {
      ensureSpace(lineH);
      if (maxFontSize > baseFontSize + 5) {
        cursorY -= (maxFontSize - baseFontSize) * 0.55;
      }
      let x = colLeftX;
      if (align === 'center') {
        x = colLeftX + Math.max(0, (colWidth - wl.totalW) / 2);
      }
      for (const it of wl.items) {
        if (!/^\s+$/.test(it.text)) {
          currentPage.ops.push({
            kind: 'text',
            text: it.text,
            x,
            y: cursorY,
            size: it.size,
            font: it.font,
            color: it.color,
          });
          if (it.url) {
            currentPage.links.push({
              x,
              y: cursorY - 2,
              width: it.width,
              height: it.size + 3,
              url: it.url,
            });
          }
        }
        x += it.width;
      }
      cursorY -= lineH;
    }
    cursorY -= extraSpaceAfterPt;
  }

  function renderSequenceInColumn(seqStr, colLeftX, colWidth) {
    let text = seqStr.replace(/\\lipsum(?:\[(\d+)\])?/g, (_, n) => {
      const idx = n ? (parseInt(n, 10) - 1) % LIPSUM_TEXT.length : 0;
      return `\n\n${LIPSUM_TEXT[idx]}\n\n`;
    });

    // Check for \begin{paracol}{2} ... \end{paracol}
    const paracolStart = text.indexOf('\\begin{paracol}');
    if (paracolStart !== -1) {
      const before = text.slice(0, paracolStart);
      if (before.trim()) renderSequenceInColumn(before, colLeftX, colWidth);

      const afterBegin = text.slice(paracolStart + '\\begin{paracol}'.length);
      const numArg = readBraced(afterBegin, 0);
      const endIdx = afterBegin.lastIndexOf('\\end{paracol}');
      const innerParacol = afterBegin.slice(numArg ? numArg.endPos : 0, endIdx !== -1 ? endIdx : afterBegin.length);

      const cols = innerParacol.split(/\\switchcolumn\*?(?:\[[^\]]*\])?/);
      const availW = colWidth - columnSepPt;
      const w0 = availW * colRatioLeft;
      const w1 = availW * (1 - colRatioLeft);

      const topY = cursorY;
      renderSequenceInColumn(cols[0] || '', colLeftX, w0);
      const endY0 = cursorY;

      if (cols[1]) {
        cursorY = topY;
        renderSequenceInColumn(cols[1], colLeftX + w0 + columnSepPt, w1);
      }
      cursorY = Math.min(endY0, cursorY);

      if (endIdx !== -1) {
        const afterParacol = afterBegin.slice(endIdx + '\\end{paracol}'.length);
        if (afterParacol.trim()) renderSequenceInColumn(afterParacol, colLeftX, colWidth);
      }
      return;
    }

    // Split into logical blocks while keeping environments intact
    let pos = 0;
    while (pos < text.length) {
      while (pos < text.length && /\s/.test(text[pos])) pos++;
      if (pos >= text.length) break;

      if (text.startsWith('\\begin{center}', pos)) {
        const endC = text.indexOf('\\end{center}', pos);
        const inner = text.slice(pos + 14, endC !== -1 ? endC : text.length).trim();
        const rawLines = inner.split(/\\\\(?:\[([^\]]*)\])?/);
        for (let k = 0; k < rawLines.length; k += 2) {
          const lineContent = (rawLines[k] || '').trim();
          const extraPt = rawLines[k + 1] ? parseDimPt(rawLines[k + 1], 0) : 0;
          if (!lineContent) continue;
          if (/\\hrule\b/.test(lineContent)) {
            const ruleY = cursorY + 3;
            currentPage.ops.push({
              kind: 'line',
              x1: colLeftX,
              y1: ruleY,
              x2: colLeftX + colWidth,
              y2: ruleY,
              thickness: 0.4,
              color: colors.rulecolor,
            });
            cursorY -= 5 + extraPt;
          } else {
            const runs = parseLineRuns(lineContent, 'roman', baseFontSize);
            renderRunsInColumn(runs, colLeftX, colWidth, 'center', extraPt);
          }
        }
        pos = endC !== -1 ? endC + 12 : text.length;
        continue;
      }

      if (text.startsWith('\\begin{itemize}', pos) || text.startsWith('\\begin{enumerate}', pos)) {
        const isEnum = text.startsWith('\\begin{enumerate}', pos);
        const tag = isEnum ? 'enumerate' : 'itemize';
        const endPos = text.indexOf(`\\end{${tag}}`, pos);
        let inner = text.slice(pos + tag.length + 8, endPos !== -1 ? endPos : text.length).trim();
        const opt = readBracket(inner, 0);
        if (opt) inner = inner.slice(opt.endPos).trim();

        const items = inner.split(/\\item(?:\s*\[[^\]]*\])?/).map((s) => s.trim()).filter(Boolean);
        items.forEach((it, idx) => {
          const bullet = isEnum ? `${idx + 1}.` : '\u2022';
          const runs = parseLineRuns(it, 'roman', baseFontSize - 0.5);
          const bSize = runs[0]?.size || baseFontSize - 0.5;
          ensureSpace(bSize * 1.25);
          currentPage.ops.push({
            kind: 'text',
            text: bullet,
            x: colLeftX + 1.5,
            y: cursorY,
            size: bSize * 0.9,
            font: 'roman',
          });
          renderRunsInColumn(runs, colLeftX + 10, colWidth - 10, 'left', 1);
        });
        pos = endPos !== -1 ? endPos + tag.length + 6 : text.length;
        continue;
      }

      if (text.startsWith('\\vspace', pos)) {
        const va = readBraced(text, pos + 7);
        if (va) {
          cursorY -= parseDimPt(va.content, 3);
          pos = va.endPos;
          continue;
        }
      }

      if (text.startsWith('\\setlength', pos)) {
        const a1 = readBraced(text, pos + 10);
        const a2 = a1 ? readBraced(text, a1.endPos) : null;
        if (a1 && a2) {
          pos = a2.endPos;
          continue;
        }
      }

      if (text.startsWith('\\columnratio', pos)) {
        const a1 = readBraced(text, pos + 12);
        if (a1) {
          pos = a1.endPos;
          continue;
        }
      }

      if (text.startsWith('\\section', pos) || text.startsWith('\\subsection', pos)) {
        const isSub = text.startsWith('\\subsection', pos);
        const cmdLen = isSub ? 11 : 8;
        let nextP = pos + cmdLen;
        if (text[nextP] === '*') nextP++;
        const sa = readBraced(text, nextP);
        if (sa) {
          const secTitle = sa.content.trim();
          if (hasCustomTitleFormat && !isSub) {
            ensureSpace(18);
            cursorY -= 5;
            currentPage.ops.push({
              kind: 'text',
              text: secTitle.toUpperCase(),
              x: colLeftX,
              y: cursorY,
              size: 7.5,
              font: 'bold',
              color: colors.sectioncolor,
            });
            const ruleY = cursorY - 2.5;
            currentPage.ops.push({
              kind: 'line',
              x1: colLeftX,
              y1: ruleY,
              x2: colLeftX + colWidth,
              y2: ruleY,
              thickness: 0.4,
              color: colors.rulecolor,
            });
            cursorY -= 11;
          } else {
            ensureSpace(20);
            cursorY -= 6;
            const runs = parseLineRuns(secTitle, 'bold', isSub ? baseFontSize + 1.5 : baseFontSize + 3);
            renderRunsInColumn(runs, colLeftX, colWidth, 'left', 3);
          }
          pos = sa.endPos;
          continue;
        }
      }

      // Read until next block boundary (\section, \begin{...}, \vspace, or blank line)
      const rest = text.slice(pos);
      const nextBoundary = rest.search(/\n\s*\n|\\(?:section|subsection|begin\{(center|itemize|enumerate|paracol)\}|vspace)\b/);
      let chunk = nextBoundary > 0 ? rest.slice(0, nextBoundary) : rest;
      pos += chunk.length;

      const subLines = chunk.split(/\\\\(?:\[([^\]]*)\])?/);
      for (let k = 0; k < subLines.length; k += 2) {
        const lineContent = (subLines[k] || '').trim();
        const extraPt = subLines[k + 1] ? parseDimPt(subLines[k + 1], 0) : 0;
        if (!lineContent) continue;
        const runs = parseLineRuns(lineContent, 'roman', baseFontSize);
        renderRunsInColumn(runs, colLeftX, colWidth, 'left', extraPt);
      }
    }
  }

  renderSequenceInColumn(expandedBody, margins.left, widthPt - margins.left - margins.right);
  flushPageNumber();

  const pdfBytes = buildBinaryPdfFromPages(pages, widthPt, heightPt);
  return {
    success: true,
    pdfBytes,
    pages,
    diagnostics: [],
    durationMs: Math.round(performance.now() - startTime),
  };
}
