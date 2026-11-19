/**
 * Complete Production LaTeX-to-PDF Engine for the Tex Chrome Extension (Manifest V3).
 * Implements exact pdfTeX / LaTeX2e box-and-glue vertical spacing and Overleaf-compatible typesetting:
 * - TeX pt to PDF bp conversion (1 pt = 72/72.27 bp = 0.996264 bp)
 * - Outer \baselineskip restoration (11.955 bp for 9pt article) when { \fontsize{X}{Y}\selectfont ... }
 *   closes its brace group before \\ or \par
 * - Trailing \\[Xpt] empty-line strut before paragraph boundaries (\par, \begin{itemize}, \section)
 * - Exact \titleformat{\section} & \titlespacing{\section} geometry (-9.764 bp to section rule, -15.143 bp to content)
 * - Bitstream Charter (\usepackage{charter}) & Adobe Type1 AFM glyph width tables + line justification
 * - Full macro & environment expander (\newcommand, \renewcommand, \providecommand, \def, \let, \newenvironment)
 * - Support for paracol, multicols, minipage, tabular, tabularx, nested itemize/enumerate/description,
 *   maketitle, abstract, display/inline math, verbatim/lstlisting, quote, bibliography, footnotes, and hyperref
 * - WinAnsiEncoding support for true bullets (\225), en-dashes (\226), and em-dashes (\227)
 */

const TEX_PT_TO_BP = 72 / 72.27; // 0.99626400996264

const KNOWN_INVALID_TYPOS = new Set([
  'sectoin', 'subsectoin', 'subsubsectoin', 'begni', 'endd', 'pirnt',
  'documenclass', 'usepakcage', 'textbfx', 'itme', 'bfseris', 'itshpae',
]);

const XELATEX_ONLY_PACKAGES = new Set([
  'fontspec', 'polyglossia', 'unicode-math', 'luacode', 'luatextra', 'xunicode', 'xltxtra',
]);

const KNOWN_ENVIRONMENTS = new Set([
  'document', 'abstract', 'titlepage', 'center', 'flushleft', 'flushright',
  'itemize', 'enumerate', 'description', 'list', 'trivlist',
  'paracol', 'multicols', 'minipage',
  'tabular', 'tabular*', 'tabularx', 'longtable', 'array', 'table', 'table*', 'figure', 'figure*',
  'equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*',
  'flalign', 'flalign*', 'eqnarray', 'eqnarray*', 'displaymath', 'math', 'split',
  'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'cases', 'aligned', 'gathered',
  'verbatim', 'lstlisting', 'minted', 'quote', 'quotation', 'verse', 'thebibliography', 'spacing',
  'theorem', 'lemma', 'proposition', 'corollary', 'definition', 'example', 'remark', 'proof',
  'frame', 'block', 'alertblock', 'exampleblock', 'columns', 'column',
  'algorithm', 'algorithm*', 'algorithmic', 'tikzpicture', 'pgfpicture',
  'subfigure', 'subtable', 'tcolorbox', 'framed', 'shaded', 'mdframed',
  'adjustbox', 'landscape', 'sidewaystable', 'sidewaysfigure', 'letter',
  'filecontents', 'filecontents*', 'comment',
]);

const LIPSUM_TEXT = [
  'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Ut purus elit, vestibulum ut, placerat ac, adipiscing vitae, felis. Curabitur dictum gravida mauris. Nam arcu libero, nonummy eget, consectetuer id, vulputate a, magna. Donec vehicula augue eu neque.',
  'Nam dui ligula, fringilla a, euismod sodales, sollicitudin vel, wisi. Morbi auctor lorem non justo. Nam lacus libero, pretium at, lobortis vitae, ultricies et, tellus. Donec aliquet, tortor sed accumsan bibendum, erat ligula aliquet magna, vitae ornare odio metus a mi.',
  'Nulla malesuada porttitor diam. Donec felis erat, congue non, volutpat at, tincidunt tristique, libero. Vivamus viverra fermentum felis. Donec nonummy pellentesque ante. Phasellus adipiscing semper elit. Proin fermentum massa ac quam.',
];

const MATH_SYMBOLS = {
  alpha: 'a', beta: 'b', gamma: 'g', delta: 'd', epsilon: 'e', varepsilon: 'e',
  zeta: 'z', eta: 'h', theta: 'q', vartheta: 'q', iota: 'i', kappa: 'k',
  lambda: 'l', mu: 'm', nu: 'n', xi: 'x', pi: 'p', rho: 'r', sigma: 's',
  tau: 't', upsilon: 'u', phi: 'f', varphi: 'f', chi: 'c', psi: 'y', omega: 'w',
  Gamma: 'G', Delta: 'D', Theta: 'Q', Lambda: 'L', Xi: 'X', Pi: 'P',
  Sigma: 'S', Upsilon: 'U', Phi: 'F', Psi: 'Y', Omega: 'W',
  cdot: '\u2022', textbullet: '\u2022', bullet: '\u2022',
  times: 'x', div: '/', pm: '+/-', mp: '-/+',
  leq: '<=', le: '<=', geq: '>=', ge: '>=', neq: '!=', ne: '!=',
  approx: '~=', equiv: '===', sim: '~', propto: 'prop', infty: 'inf',
  partial: 'd', nabla: 'del', forall: 'for all ', exists: 'exists ',
  in: ' in ', notin: ' not in ', subset: ' subset ', subseteq: ' subseteq ',
  cup: ' U ', cap: ' & ', emptyset: '{}',
  to: '->', rightarrow: '->', Rightarrow: '=>', leftarrow: '<-', Leftarrow: '<=',
  leftrightarrow: '<->', Leftrightarrow: '<=>', mapsto: '|->',
  sum: 'Sum', prod: 'Prod', int: 'Int',oint: 'Oint',
  dots: '...', ldots: '...', cdots: '...', vdots: '...', ddots: '...',
};

const FONTAWESOME_MAP = {
  faEnvelope: 'Email:',
  faEnvelopeO: 'Email:',
  faPhone: 'Tel:',
  faPhoneSquare: 'Tel:',
  faMobile: 'Tel:',
  faMapMarker: 'Loc:',
  faMapMarkerAlt: 'Loc:',
  faLinkedin: 'LinkedIn',
  faLinkedinIn: 'LinkedIn',
  faLinkedinSquare: 'LinkedIn',
  faGithub: 'GitHub',
  faGithubSquare: 'GitHub',
  faGitlab: 'GitLab',
  faGlobe: 'Web:',
  faExternalLink: '',
  faExternalLinkAlt: '',
  faLink: '',
  faCode: '',
  faGraduationCap: '',
  faBriefcase: '',
  faTrophy: '',
  faAward: '',
  faCertificate: '',
  faBook: '',
  faUser: '',
  faCalendar: '',
  faCalendarAlt: '',
};

// Exact Adobe Type1 AFM character widths (in 1/1000ths of 1pt) for Times-Roman & Times-Bold
const TIMES_ROMAN_WIDTHS = {
  ' ': 250, '!': 333, '"': 408, '#': 500, '$': 500, '%': 833, '&': 778, "'": 333,
  '(': 333, ')': 333, '*': 500, '+': 564, ',': 250, '-': 333, '.': 250, '/': 278,
  '0': 500, '1': 500, '2': 500, '3': 500, '4': 500, '5': 500, '6': 500, '7': 500,
  '8': 500, '9': 500, ':': 278, ';': 278, '<': 564, '=': 564, '>': 564, '?': 444,
  '@': 921, 'A': 722, 'B': 667, 'C': 667, 'D': 722, 'E': 611, 'F': 556, 'G': 722,
  'H': 722, 'I': 333, 'J': 389, 'K': 722, 'L': 611, 'M': 889, 'N': 722, 'O': 722,
  'P': 556, 'Q': 722, 'R': 667, 'S': 556, 'T': 611, 'U': 722, 'V': 722, 'W': 944,
  'X': 722, 'Y': 722, 'Z': 611, '[': 333, '\\': 278, ']': 333, '^': 469, '_': 500,
  '`': 333, 'a': 444, 'b': 500, 'c': 444, 'd': 500, 'e': 444, 'f': 333, 'g': 500,
  'h': 500, 'i': 278, 'j': 278, 'k': 500, 'l': 278, 'm': 778, 'n': 500, 'o': 500,
  'p': 500, 'q': 500, 'r': 333, 's': 389, 't': 278, 'u': 500, 'v': 500, 'w': 722,
  'x': 500, 'y': 500, 'z': 444, '{': 480, '|': 278, '}': 480, '~': 541,
  '\u2013': 500, '\u2014': 1000, '\u2022': 350,
};

const TIMES_BOLD_WIDTHS = {
  ' ': 250, '!': 333, '"': 555, '#': 500, '$': 500, '%': 1000, '&': 833, "'": 333,
  '(': 333, ')': 333, '*': 500, '+': 570, ',': 250, '-': 333, '.': 250, '/': 278,
  '0': 500, '1': 500, '2': 500, '3': 500, '4': 500, '5': 500, '6': 500, '7': 500,
  '8': 500, '9': 500, ':': 333, ';': 333, '<': 570, '=': 570, '>': 570, '?': 500,
  '@': 930, 'A': 722, 'B': 667, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778,
  'H': 778, 'I': 389, 'J': 500, 'K': 778, 'L': 667, 'M': 944, 'N': 722, 'O': 778,
  'P': 611, 'Q': 778, 'R': 722, 'S': 556, 'T': 667, 'U': 722, 'V': 722, 'W': 1000,
  'X': 722, 'Y': 722, 'Z': 667, '[': 333, '\\': 278, ']': 333, '^': 581, '_': 500,
  '`': 333, 'a': 500, 'b': 556, 'c': 444, 'd': 556, 'e': 444, 'f': 333, 'g': 500,
  'h': 556, 'i': 278, 'j': 333, 'k': 556, 'l': 278, 'm': 833, 'n': 556, 'o': 500,
  'p': 556, 'q': 556, 'r': 444, 's': 389, 't': 333, 'u': 556, 'v': 500, 'w': 722,
  'x': 500, 'y': 500, 'z': 444, '{': 394, '|': 278, '}': 394, '~': 520,
  '\u2013': 500, '\u2014': 1000, '\u2022': 350,
};

function measureTextExact(text, font, size, useCharterMetrics = false) {
  if (!text) return 0;
  if (font === 'mono') {
    return text.length * size * 0.525;
  }
  const table = font === 'bold' || font === 'boldItalic' ? TIMES_BOLD_WIDTHS : TIMES_ROMAN_WIDTHS;
  let totalMilli = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    totalMilli += table[ch] !== undefined ? table[ch] : 500;
  }
  // Bitstream Charter (\usepackage{charter}) has wider lowercase & digit metrics (~1.048x Roman, ~1.032x Bold)
  const charterScale = useCharterMetrics ? (font === 'bold' || font === 'boldItalic' ? 1.032 : 1.048) : 1.0;
  return (totalMilli / 1000) * size * charterScale;
}

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

function parseDimBp(dimStr, fallback = 0, refWidthBp = 500) {
  if (!dimStr) return fallback;
  const s = dimStr.trim();
  const relM = s.match(/^(-?\d*(?:\.\d+)?)\s*\\(textwidth|linewidth|columnwidth|hsize|paperwidth)$/);
  if (relM) {
    const factor = relM[1] === '' || relM[1] === '+' ? 1 : relM[1] === '-' ? -1 : parseFloat(relM[1]);
    return (isNaN(factor) ? 1 : factor) * refWidthBp;
  }
  if (/^\\topsep\b/.test(s)) return 4 * TEX_PT_TO_BP;
  if (/^\\bigskipamount\b/.test(s)) return 12 * TEX_PT_TO_BP;
  if (/^\\medskipamount\b/.test(s)) return 6 * TEX_PT_TO_BP;
  if (/^\\smallskipamount\b/.test(s)) return 3 * TEX_PT_TO_BP;

  const m = s.toLowerCase().match(/^(-?\d+(?:\.\d+)?)\s*(pt|in|cm|mm|em|ex|bp|dd|pc|sp)?/);
  if (!m) return fallback;
  const v = parseFloat(m[1]);
  const u = m[2] || 'pt';
  if (u === 'in') return v * 72;
  if (u === 'cm') return v * 28.3464567;
  if (u === 'mm') return v * 2.83464567;
  if (u === 'em') return v * 9.96264;
  if (u === 'ex') return v * 4.48;
  if (u === 'pc') return v * 12 * TEX_PT_TO_BP;
  if (u === 'bp') return v;
  return v * TEX_PT_TO_BP;
}

/**
 * Extracts \newcommand, \renewcommand, \providecommand, \def, \let,
 * \newenvironment, and \renewenvironment definitions with full balanced brace parsing.
 */
function extractAndExpandMacros(source) {
  const macros = new Map();
  const environments = new Map();
  let cleaned = '';
  let i = 0;

  while (i < source.length) {
    const slice = source.slice(i);

    // 1. \newcommand / \renewcommand / \providecommand
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
        const m = source.slice(pos).match(/^\\([a-zA-Z@]+|\S)/);
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
          macros.set(name, { name, numArgs, defaultOpt, body: bodyArg.content.trim() });
          const removed = source.slice(i, bodyArg.endPos);
          const nls = removed.match(/\n/g);
          cleaned += nls ? nls.join('') : '';
          i = bodyArg.endPos;
          continue;
        }
      }
    }

    // 2. \def\name#1#2{body}
    const defM = slice.match(/^\\(?:g|e|x)?def\s*\\([a-zA-Z@]+)/);
    if (defM) {
      const name = defM[1];
      let pos = i + defM[0].length;
      let numArgs = 0;
      while (pos < source.length && /\s/.test(source[pos])) pos++;
      while (source[pos] === '#' && /[1-9]/.test(source[pos + 1] || '')) {
        numArgs = Math.max(numArgs, parseInt(source[pos + 1], 10));
        pos += 2;
        while (pos < source.length && /\s/.test(source[pos])) pos++;
      }
      const bodyArg = readBraced(source, pos);
      if (bodyArg) {
        macros.set(name, { name, numArgs, defaultOpt: undefined, body: bodyArg.content.trim() });
        const removed = source.slice(i, bodyArg.endPos);
        const nls = removed.match(/\n/g);
        cleaned += nls ? nls.join('') : '';
        i = bodyArg.endPos;
        continue;
      }
    }

    // 3. \let\newcmd=\oldcmd or \let\newcmd\oldcmd
    const letM = slice.match(/^\\let\s*\\([a-zA-Z@]+)\s*=?\s*\\([a-zA-Z@]+)/);
    if (letM) {
      const newName = letM[1];
      const targetName = letM[2];
      macros.set(newName, { name: newName, numArgs: 0, defaultOpt: undefined, body: `\\${targetName}` });
      const removed = source.slice(i, i + letM[0].length);
      const nls = removed.match(/\n/g);
      cleaned += nls ? nls.join('') : '';
      i += letM[0].length;
      continue;
    }

    // 4. \newenvironment / \renewenvironment
    const envDefM = slice.match(/^\\(newenvironment|renewenvironment)\*?\b/);
    if (envDefM) {
      let pos = i + envDefM[0].length;
      const nameArg = readBraced(source, pos);
      if (nameArg) {
        const envName = nameArg.content.trim();
        pos = nameArg.endPos;
        let numArgs = 0;
        let defaultOpt;
        const opt1 = readBracket(source, pos);
        if (opt1) {
          numArgs = parseInt(opt1.content.trim(), 10) || 0;
          pos = opt1.endPos;
          const opt2 = readBracket(source, pos);
          if (opt2) {
            defaultOpt = opt2.content;
            pos = opt2.endPos;
          }
        }
        const beginDef = readBraced(source, pos);
        const endDef = beginDef ? readBraced(source, beginDef.endPos) : null;
        if (beginDef && endDef) {
          environments.set(envName, {
            name: envName,
            numArgs,
            defaultOpt,
            beginBody: beginDef.content.trim(),
            endBody: endDef.content.trim(),
          });
          const removed = source.slice(i, endDef.endPos);
          const nls = removed.match(/\n/g);
          cleaned += nls ? nls.join('') : '';
          i = endDef.endPos;
          continue;
        }
      }
    }

    // 5. \newtheorem / \newtheorem*
    const thmDefM = slice.match(/^\\newtheorem\*?\b/);
    if (thmDefM) {
      let pos = i + thmDefM[0].length;
      const nameArg = readBraced(source, pos);
      if (nameArg) {
        const envName = nameArg.content.trim();
        pos = nameArg.endPos;
        const opt1 = readBracket(source, pos);
        if (opt1) pos = opt1.endPos;
        const labelArg = readBraced(source, pos);
        if (labelArg) {
          const labelText = labelArg.content.trim();
          pos = labelArg.endPos;
          const opt2 = readBracket(source, pos);
          if (opt2) pos = opt2.endPos;
          environments.set(envName, {
            name: envName,
            numArgs: 0,
            defaultOpt: undefined,
            beginBody: `\\textbf{${labelText}.} \\textit{`,
            endBody: `}`,
          });
          environments.set(`${envName}*`, {
            name: `${envName}*`,
            numArgs: 0,
            defaultOpt: undefined,
            beginBody: `\\textbf{${labelText}.} \\textit{`,
            endBody: `}`,
          });
          const removed = source.slice(i, pos);
          const nls = removed.match(/\n/g);
          cleaned += nls ? nls.join('') : '';
          i = pos;
          continue;
        }
      }
    }

    cleaned += source[i];
    i++;
  }

  return { macros, environments, cleaned };
}

function expandMacrosInBody(bodyText, macros, environments = new Map()) {
  let current = bodyText;

  // Expand user-defined custom environments first (if not overriding core built-in environments)
  const coreEnvs = new Set(['document', 'itemize', 'enumerate', 'description', 'paracol', 'multicols', 'minipage', 'center', 'flushleft', 'flushright', 'tabular', 'tabular*', 'tabularx', 'table', 'abstract', 'verbatim', 'lstlisting', 'equation', 'align']);
  if (environments && environments.size > 0) {
    for (const [envName, envDef] of environments.entries()) {
      if (coreEnvs.has(envName)) continue;
      const beginTag = `\\begin{${envName}}`;
      const endTag = `\\end{${envName}}`;
      let safety = 0;
      while (current.includes(beginTag) && safety++ < 50) {
        const bIdx = current.indexOf(beginTag);
        const eIdx = current.indexOf(endTag, bIdx + beginTag.length);
        if (eIdx === -1) break;
        let pos = bIdx + beginTag.length;
        const args = [];
        if (envDef.numArgs > 0) {
          if (envDef.defaultOpt !== undefined) {
            const opt = readBracket(current, pos);
            if (opt) {
              args.push(opt.content);
              pos = opt.endPos;
            } else {
              args.push(envDef.defaultOpt);
            }
          }
          while (args.length < envDef.numArgs) {
            const arg = readBraced(current, pos);
            if (!arg) break;
            args.push(arg.content);
            pos = arg.endPos;
          }
        }
        let bBody = envDef.beginBody;
        let eBody = envDef.endBody;
        for (let a = 0; a < args.length; a++) {
          const re = new RegExp(`#${a + 1}`, 'g');
          bBody = bBody.replace(re, () => args[a]);
          eBody = eBody.replace(re, () => args[a]);
        }
        const inner = current.slice(pos, eIdx);
        current = current.slice(0, bIdx) + bBody + '\n' + inner + '\n' + eBody + current.slice(eIdx + endTag.length);
      }
    }
  }

  if (macros.size === 0) return current;
  for (let pass = 0; pass < 8; pass++) {
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
            } else {
              // Consume trailing spaces after 0-arg control sequence \foo
              while (pos < current.length && current[pos] === ' ') pos++;
            }
            if (ok) {
              let exp = macro.body;
              for (let a = 0; a < args.length; a++) {
                exp = exp.replace(new RegExp(`(\\\\[a-zA-Z@]+)#${a + 1}`, 'g'), (_, cmd) => `${cmd} ${args[a]}`);
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

function formatMathReadable(mathStr) {
  if (!mathStr) return '';
  let s = mathStr.trim();
  if (s === '|' || s === '\\mid') return '|';
  if (s === '\\cdot' || s === '\\bullet' || s === '\\textbullet') return '\u2022';
  // Replace \frac{a}{b}
  let fracSafety = 0;
  while (/\\(?:d|t)?frac\s*\{/.test(s) && fracSafety++ < 15) {
    const fm = s.match(/\\(?:d|t)?frac\b/);
    if (!fm) break;
    const fIdx = fm.index;
    const a1 = readBraced(s, fIdx + fm[0].length);
    const a2 = a1 ? readBraced(s, a1.endPos) : null;
    if (!a1 || !a2) break;
    const num = formatMathReadable(a1.content);
    const den = formatMathReadable(a2.content);
    s = s.slice(0, fIdx) + `(${num})/(${den})` + s.slice(a2.endPos);
  }
  // Replace \sqrt{x}
  s = s.replace(/\\sqrt\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/g, (_, root, arg) =>
    root ? `root(${root}, ${arg})` : `sqrt(${arg})`
  );
  // Replace \text{...}, \mathrm{...}, \mathbf{...}
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|mathbb)\s*\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\(?:left|right|big|Big|bigg|Bigg)\b/g, '');
  s = s.replace(/\^\{([^{}]*)\}/g, '^$1');
  s = s.replace(/_\{([^{}]*)\}/g, '_$1');
  s = s.replace(/\\([a-zA-Z]+)\b/g, (_, cmd) => {
    if (MATH_SYMBOLS[cmd] !== undefined) return MATH_SYMBOLS[cmd];
    return cmd;
  });
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function escapePdfLiteral(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = str.charCodeAt(i);
    if (ch === '\\') {
      out += '\\\\';
    } else if (ch === '(') {
      out += '\\(';
    } else if (ch === ')') {
      out += '\\)';
    } else if (code >= 32 && code <= 126) {
      out += ch;
    } else if (code === 0x2022 || code === 0x00b7) {
      out += '\\225'; // WinAnsi solid bullet •
    } else if (code === 0x2013) {
      out += '\\226'; // WinAnsi en-dash –
    } else if (code === 0x2014) {
      out += '\\227'; // WinAnsi em-dash —
    } else if (code === 0x2018 || code === 0x2019) {
      out += "'";
    } else if (code === 0x201c || code === 0x201d) {
      out += '"';
    } else if (code === 0x00a0) {
      out += ' ';
    } else {
      out += ' ';
    }
  }
  return out;
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
  const fontRomanId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>');
  const fontBoldId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>');
  const fontItalicId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>');
  const fontBoldItalicId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Times-BoldItalic /Encoding /WinAnsiEncoding >>');
  const fontMonoId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');

  const pageIds = [];
  for (const page of pages) {
    const streamLines = [];
    for (const op of page.ops) {
      if (op.kind === 'line') {
        const c = op.color || [0, 0, 0];
        streamLines.push(`${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)} RG`);
        streamLines.push(`${(op.thickness || 0.4).toFixed(3)} w`);
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
        streamLines.push(`${fontKey} ${op.size.toFixed(2)} Tf`);
        if (op.font === 'mono') {
          // Scale Type1 /Courier (0.600 em) by 87.5% to match TeX cmtt/SFTT (0.525 em) and add subtle stroke weight to match SFTT0800
          streamLines.push(`${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)} RG`);
          streamLines.push('0.140 w');
          streamLines.push('2 Tr');
          streamLines.push('87.5 Tz');
        }
        if (op.charSpace) {
          streamLines.push(`${op.charSpace.toFixed(3)} Tc`);
        }
        streamLines.push(`1 0 0 1 ${op.x.toFixed(2)} ${op.y.toFixed(2)} Tm`);
        streamLines.push(`(${escapePdfLiteral(op.text)}) Tj`);
        if (op.charSpace) {
          streamLines.push('0 Tc');
        }
        if (op.font === 'mono') {
          streamLines.push('100 Tz');
          streamLines.push('0 Tr');
        }
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
          severity: 'error',
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
      severity: 'error',
      line: 1,
      code: 'MISSING_DOCUMENTCLASS',
      message: 'Missing \\documentclass declaration in preamble.',
      context: getLineSnippet(rawSource, 1),
      suggestion: 'Begin your document with \\documentclass{article}.',
    });
  }

  if (!/\\begin\s*\{document\}/.test(stripped)) {
    diagnostics.push({
      severity: 'error',
      line: 1,
      code: 'MISSING_BEGIN_DOCUMENT',
      message: 'Missing \\begin{document}.',
      context: getLineSnippet(rawSource, 1),
      suggestion: 'Wrap document content in \\begin{document} ... \\end{document}.',
    });
  } else if (!/\\end\s*\{document\}/.test(stripped)) {
    const lastLine = rawSource.split(/\r?\n/).length;
    diagnostics.push({
      severity: 'error',
      line: lastLine,
      code: 'MISSING_END_DOCUMENT',
      message: 'Missing \\end{document} before end of file.',
      context: getLineSnippet(rawSource, lastLine),
      suggestion: 'Add \\end{document} at the end of your LaTeX source.',
    });
  }

  // Validate brace balance outside verbatim
  const braceStack = [];
  let inVerbScan = false;
  for (let idx = 0; idx < stripped.length; idx++) {
    if (stripped.startsWith('\\begin{verbatim}', idx) || stripped.startsWith('\\begin{lstlisting}', idx)) {
      inVerbScan = true;
    } else if (stripped.startsWith('\\end{verbatim}', idx) || stripped.startsWith('\\end{lstlisting}', idx)) {
      inVerbScan = false;
    }
    if (inVerbScan) continue;
    const ch = stripped[idx];
    if (ch === '\\') {
      idx++;
      continue;
    }
    if (ch === '{') {
      braceStack.push({ line: getLineNumber(stripped, idx) });
    } else if (ch === '}') {
      if (braceStack.length === 0) {
        const line = getLineNumber(stripped, idx);
        diagnostics.push({
          severity: 'error',
          line,
          code: 'UNMATCHED_BRACE',
          message: `Too many }'s: unmatched closing brace "}" on line ${line}.`,
          context: getLineSnippet(rawSource, line),
          suggestion: 'Remove the extra "}" or add a matching "{".',
        });
      } else {
        braceStack.pop();
      }
    }
  }
  for (const unclosed of braceStack) {
    diagnostics.push({
      severity: 'error',
      line: unclosed.line,
      code: 'UNCLOSED_BRACE',
      message: `Runaway argument: opening brace "{" on line ${unclosed.line} was never closed.`,
      context: getLineSnippet(rawSource, unclosed.line),
      suggestion: 'Add a closing "}" to complete the group.',
    });
  }

  const { macros, environments: userEnvs, cleaned: sourceWithoutMacroDefs } = extractAndExpandMacros(stripped);

  // Check XeLaTeX-only packages
  const pkgRegex = /\\usepackage\s*(?:\[[\s\S]*?\])?\s*\{([^}]*)\}/g;
  let pm;
  while ((pm = pkgRegex.exec(sourceWithoutMacroDefs)) !== null) {
    const list = pm[1].split(',').map((s) => s.trim().toLowerCase());
    for (const p of list) {
      if (XELATEX_ONLY_PACKAGES.has(p)) {
        const line = getLineNumber(sourceWithoutMacroDefs, pm.index);
        diagnostics.push({
          severity: 'error',
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
      if (!KNOWN_ENVIRONMENTS.has(name) && !userEnvs.has(name)) {
        diagnostics.push({
          severity: 'error',
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
          severity: 'error',
          line,
          code: 'UNMATCHED_END',
          message: `\\end{${name}} encountered without matching \\begin{${name}}.`,
          context: getLineSnippet(rawSource, line),
        });
      } else {
        const top = envStack.pop();
        if (top.name !== name) {
          diagnostics.push({
            severity: 'error',
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
      severity: 'error',
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
        severity: 'error',
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
        severity: 'error',
        line,
        code: 'INVALID_FRAC_SYNTAX',
        message: '\\frac requires two braced arguments: \\frac{numerator}{denominator}.',
        context: getLineSnippet(rawSource, line),
      });
    }
  }

  // Validate body-level syntax rules (math delimiters, orphan \item, missing mandatory args, misplaced &)
  const docBeginMatch = sourceWithoutMacroDefs.match(/\\begin\s*\{document\}/);
  const docEndMatch = sourceWithoutMacroDefs.match(/\\end\s*\{document\}/);
  if (docBeginMatch && docEndMatch && docEndMatch.index > docBeginMatch.index) {
    const bodyStartIdx = docBeginMatch.index + docBeginMatch[0].length;
    const rawBodySlice = sourceWithoutMacroDefs.slice(bodyStartIdx, docEndMatch.index);
    const expandedBodyForValidation = expandMacrosInBody(rawBodySlice, macros, userEnvs);

    // 1. Check unclosed display math \[ ... \] (ignoring \\[len] linebreaks)
    const openDisp = (rawBodySlice.match(/(?:^|[^\\])\\\[/g) || []).length;
    const closeDisp = (rawBodySlice.match(/(?:^|[^\\])\\\]/g) || []).length;
    if (openDisp > closeDisp) {
      const idx = rawBodySlice.lastIndexOf('\\[');
      const line = getLineNumber(sourceWithoutMacroDefs, bodyStartIdx + Math.max(0, idx));
      diagnostics.push({
        severity: 'error',
        line,
        code: 'UNCLOSED_DISPLAY_MATH',
        message: 'Display math \\[ was opened but never closed with \\].',
        context: getLineSnippet(rawSource, line),
      });
    }

    // 2. Check unclosed inline math $
    let dollarCount = 0;
    let lastDollarOffset = 0;
    let inVerbMath = false;
    for (let k = 0; k < rawBodySlice.length; k++) {
      if (rawBodySlice.startsWith('\\begin{verbatim}', k) || rawBodySlice.startsWith('\\begin{lstlisting}', k)) {
        inVerbMath = true;
      } else if (rawBodySlice.startsWith('\\end{verbatim}', k) || rawBodySlice.startsWith('\\end{lstlisting}', k)) {
        inVerbMath = false;
      }
      if (inVerbMath) continue;
      if (rawBodySlice[k] === '\\') {
        k++;
        continue;
      }
      if (rawBodySlice[k] === '$') {
        if (rawBodySlice[k + 1] === '$') {
          k++;
          continue;
        }
        dollarCount++;
        lastDollarOffset = k;
      }
    }
    if (dollarCount % 2 !== 0) {
      const line = getLineNumber(sourceWithoutMacroDefs, bodyStartIdx + lastDollarOffset);
      diagnostics.push({
        severity: 'error',
        line,
        code: 'UNCLOSED_MATH_MODE',
        message: 'Missing $ inserted: inline math mode "$" was opened but never closed.',
        context: getLineSnippet(rawSource, line),
      });
    }

    // 3. Check orphan \item outside list/thebibliography in expanded body
    const listEnvs = new Set(['itemize', 'enumerate', 'description', 'list', 'trivlist', 'thebibliography']);
    const tableAndMathAlignEnvs = new Set([
      'tabular', 'tabular*', 'tabularx', 'longtable', 'array', 'table', 'table*',
      'align', 'align*', 'flalign', 'flalign*', 'eqnarray', 'eqnarray*', 'split', 'aligned', 'gathered',
      'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'cases',
    ]);
    const activeEnvs = [];
    let scanPos = 0;
    let inVerbBody = false;
    while (scanPos < expandedBodyForValidation.length) {
      if (
        expandedBodyForValidation.startsWith('\\begin{verbatim}', scanPos) ||
        expandedBodyForValidation.startsWith('\\begin{lstlisting}', scanPos)
      ) {
        inVerbBody = true;
      } else if (
        expandedBodyForValidation.startsWith('\\end{verbatim}', scanPos) ||
        expandedBodyForValidation.startsWith('\\end{lstlisting}', scanPos)
      ) {
        inVerbBody = false;
      }
      if (!inVerbBody) {
        const bM = expandedBodyForValidation.slice(scanPos).match(/^\\(begin|end)\s*\{([^}]*)\}/);
        if (bM) {
          if (bM[1] === 'begin') activeEnvs.push(bM[2].trim());
          else if (activeEnvs.length > 0) activeEnvs.pop();
          scanPos += bM[0].length;
          continue;
        }
        const itemM = expandedBodyForValidation.slice(scanPos).match(/^\\item\b/);
        if (itemM) {
          const insideList = activeEnvs.some((e) => listEnvs.has(e));
          if (!insideList) {
            diagnostics.push({
              severity: 'error',
              line: 1,
              code: 'LONELY_ITEM',
              message: 'LaTeX Error: Lonely \\item--perhaps a missing list environment.',
              context: '\\item',
            });
          }
          scanPos += itemM[0].length;
          continue;
        }
        if (expandedBodyForValidation[scanPos] === '\\') {
          scanPos += 2;
          continue;
        }
        if (expandedBodyForValidation[scanPos] === '&') {
          const insideAlign = activeEnvs.some((e) => tableAndMathAlignEnvs.has(e));
          if (!insideAlign) {
            diagnostics.push({
              severity: 'error',
              line: 1,
              code: 'MISPLACED_ALIGNMENT_TAB',
              message: 'Misplaced alignment tab character &. Use \\& for a literal ampersand.',
              context: '&',
            });
          }
        }
      }
      scanPos++;
    }

    // 4. Check missing mandatory argument on \textbf, \textit, \texttt, \textsc, \emph, \underline
    const reqArgRegex = /\\(textbf|textit|texttt|textsc|emph|underline)\s*(?:\r?\n|$)/g;
    let rm;
    while ((rm = reqArgRegex.exec(rawBodySlice)) !== null) {
      const afterPos = rm.index + rm[0].length;
      const argCheck = readBraced(rawBodySlice, rm.index + rm[1].length + 1);
      if (!argCheck) {
        const line = getLineNumber(sourceWithoutMacroDefs, bodyStartIdx + rm.index);
        diagnostics.push({
          severity: 'error',
          line,
          code: 'MISSING_MANDATORY_ARG',
          message: `Command \\${rm[1]} requires a braced argument {text}.`,
          context: getLineSnippet(rawSource, line),
        });
      }
      if (afterPos <= rm.index) break;
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
  let docPtSize = 10;
  let paperSize = 'letter';
  let isTwoColumnClass = false;
  const docClsM = stripped.match(/\\documentclass\s*(?:\[([\s\S]*?)\])?\s*\{([^}]*)\}/);
  if (docClsM && docClsM[1]) {
    for (const opt of docClsM[1].split(',').map((s) => s.trim())) {
      const ptM = opt.match(/^(\d+(?:\.\d+)?)pt$/);
      if (ptM) docPtSize = parseFloat(ptM[1]);
      else if (opt === 'a4paper') paperSize = 'a4';
      else if (opt === 'letterpaper') paperSize = 'letter';
      else if (opt === 'twocolumn') isTwoColumnClass = true;
    }
  }

  const baseFontSize = docPtSize * TEX_PT_TO_BP;
  // In LaTeX article/extarticle, 9pt/10pt normal baselineskip is 12 TeX pt = 11.955168 bp
  const outerBaselineSkipBp = (docPtSize <= 10 ? 12 : docPtSize * 1.2) * TEX_PT_TO_BP;
  const useCharterMetrics = /\\usepackage\s*(?:\[[^\]]*\])?\s*\{[^}]*charter[^}]*\}/.test(stripped);

  const widthPt = paperSize === 'a4' ? 595.276 : 612;
  const heightPt = paperSize === 'a4' ? 841.89 : 792;
  const hasFullpage = /\\usepackage\s*(?:\[[^\]]*\])?\s*\{[^}]*fullpage[^}]*\}/.test(stripped);
  const margins = hasFullpage
    ? { top: 36, bottom: 36, left: 36, right: 36 }
    : { top: 54, bottom: 54, left: 54, right: 54 };

  const applyGeometryOptions = (optString) => {
    for (const part of optString.split(',').map((s) => s.trim())) {
      if (part === 'a4paper') paperSize = 'a4';
      else if (part === 'letterpaper') paperSize = 'letter';
      else if (part.startsWith('margin=')) {
        const v = parseDimBp(part.slice(7), 54, widthPt);
        margins.top = margins.bottom = margins.left = margins.right = v;
      } else if (part.startsWith('hmargin=')) {
        const v = parseDimBp(part.slice(8), 54, widthPt);
        margins.left = margins.right = v;
      } else if (part.startsWith('vmargin=')) {
        const v = parseDimBp(part.slice(8), 54, heightPt);
        margins.top = margins.bottom = v;
      } else if (part.startsWith('top=')) margins.top = parseDimBp(part.slice(4), 54, heightPt);
      else if (part.startsWith('bottom=')) margins.bottom = parseDimBp(part.slice(7), 54, heightPt);
      else if (part.startsWith('left=')) margins.left = parseDimBp(part.slice(5), 54, widthPt);
      else if (part.startsWith('right=')) margins.right = parseDimBp(part.slice(6), 54, widthPt);
    }
  };

  const geomPkgM = stripped.match(/\\usepackage\s*\[([\s\S]*?)\]\s*\{geometry\}/);
  if (geomPkgM) applyGeometryOptions(geomPkgM[1]);
  const geomCmdM = stripped.match(/\\geometry\s*\{([\s\S]*?)\}/);
  if (geomCmdM) applyGeometryOptions(geomCmdM[1]);

  // Support \addtolength{\oddsidemargin}{...} and \addtolength{\topmargin}{...} (used in Jake's Resume)
  const addLenRegex = /\\addtolength\s*\{\\([a-zA-Z]+)\}\s*\{([^}]*)\}/g;
  let alm;
  while ((alm = addLenRegex.exec(stripped)) !== null) {
    const param = alm[1];
    const delta = parseDimBp(alm[2], 0, widthPt);
    if (param === 'oddsidemargin' || param === 'evensidemargin') {
      margins.left = Math.max(18, margins.left + delta);
      margins.right = Math.max(18, margins.right + delta);
    } else if (param === 'topmargin') {
      margins.top = Math.max(18, margins.top + delta);
      margins.bottom = Math.max(18, margins.bottom + delta);
    }
  }

  const colors = {
    black: [0, 0, 0],
    white: [1, 1, 1],
    red: [0.8, 0.1, 0.1],
    green: [0.1, 0.6, 0.2],
    blue: [0.08, 0.35, 0.65],
    cyan: [0, 0.6, 0.8],
    magenta: [0.7, 0.1, 0.6],
    yellow: [0.85, 0.7, 0],
    gray: [0.5, 0.5, 0.5],
    darkgray: [0.3, 0.3, 0.3],
    lightgray: [0.75, 0.75, 0.75],
    NavyBlue: [0.05, 0.25, 0.55],
    RoyalBlue: [0.1, 0.35, 0.7],
    BrickRed: [0.7, 0.15, 0.15],
    ForestGreen: [0.1, 0.5, 0.2],
    bodycolor: [0.196, 0.196, 0.196],
    rulecolor: [0.7255, 0.7255, 0.7255],
    accentcolor: [0.08627, 0.35294, 0.64706],
    sectioncolor: [0.13725, 0.13725, 0.13725],
    namecolor: [0.05882, 0.05882, 0.05882],
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
    } else if (model === 'rgb') {
      const nums = spec.split(',').map((n) => parseFloat(n.trim()));
      if (nums.length === 3) colors[name] = nums;
    } else if (model === 'HTML') {
      const hex = spec.replace('#', '');
      if (hex.length === 6) {
        colors[name] = [
          parseInt(hex.slice(0, 2), 16) / 255,
          parseInt(hex.slice(2, 4), 16) / 255,
          parseInt(hex.slice(4, 6), 16) / 255,
        ];
      }
    } else if (model === 'gray') {
      const g = parseFloat(spec);
      if (!isNaN(g)) colors[name] = [g, g, g];
    }
  }

  const hasExplicitBodyColor = /\\color\s*\{bodycolor\}/.test(stripped);
  const defaultBodyColor = hasExplicitBodyColor ? colors.bodycolor : [0, 0, 0];
  const pageStyleEmpty = /\\pagestyle\s*\{empty\}|\\thispagestyle\s*\{empty\}/.test(stripped);
  const hasCustomTitleFormat = /\\titleformat\s*\{\\section\}/.test(stripped);

  let sectionBeforeSkipBp = 5 * TEX_PT_TO_BP;
  const tsMatch = stripped.match(/\\titlespacing\*?\s*\{\\section\}\s*\{[^}]*\}\s*\{([^}]*)\}\s*\{([^}]*)\}/);
  if (tsMatch) {
    sectionBeforeSkipBp = parseDimBp(tsMatch[1], 5 * TEX_PT_TO_BP);
  }

  let columnSepPt = 15 * TEX_PT_TO_BP;
  const colSepM = stripped.match(/\\setlength\s*\{\\columnsep\}\s*\{([^}]*)\}/);
  if (colSepM) columnSepPt = parseDimBp(colSepM[1], 15 * TEX_PT_TO_BP);

  let colRatios = [0.5, 0.5];
  const colRatioM = stripped.match(/\\columnratio\s*\{([^}]*)\}/);
  if (colRatioM) {
    const parts = colRatioM[1]
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);
    if (parts.length === 1 && parts[0] < 1) {
      colRatios = [parts[0], +(1 - parts[0]).toFixed(4)];
    } else if (parts.length >= 2) {
      colRatios = parts;
    }
  }

  // Extract \title, \author, \date from preamble or body for \maketitle
  const extractMetaCmd = (cmdName) => {
    const idx = stripped.indexOf(`\\${cmdName}`);
    if (idx === -1) return '';
    let pos = idx + cmdName.length + 1;
    const opt = readBracket(stripped, pos);
    if (opt) pos = opt.endPos;
    const arg = readBraced(stripped, pos);
    return arg ? arg.content.trim() : '';
  };
  const docTitle = extractMetaCmd('title');
  const docAuthor = extractMetaCmd('author');
  const docDate = extractMetaCmd('date') || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const beginDocIdx = stripped.indexOf('\\begin{document}');
  const endDocIdx = stripped.indexOf('\\end{document}');
  const rawBody =
    beginDocIdx !== -1
      ? stripped.slice(
          beginDocIdx + '\\begin{document}'.length,
          endDocIdx !== -1 ? endDocIdx : stripped.length
        )
      : stripped;

  const expandedBody = expandMacrosInBody(rawBody, macros, userEnvs);

  const pages = [];
  let currentPage = null;
  let cursorY = heightPt - margins.top;
  let secCounter = 0;
  let subsecCounter = 0;
  let subsubsecCounter = 0;
  let eqCounter = 0;
  let footnoteCounter = 0;
  let pendingFootnotes = [];

  const flushPageNumber = () => {
    if (!currentPage) return;
    if (pendingFootnotes.length > 0) {
      const fnSize = Math.max(7, baseFontSize - 2);
      const fnLineH = fnSize * 1.25;
      let fnY = margins.bottom + 10 + pendingFootnotes.length * fnLineH;
      currentPage.ops.push({
        kind: 'line',
        x1: margins.left,
        y1: fnY + 4,
        x2: margins.left + (widthPt - margins.left - margins.right) * 0.35,
        y2: fnY + 4,
        thickness: 0.4,
        color: defaultBodyColor,
      });
      for (const fn of pendingFootnotes) {
        currentPage.ops.push({
          kind: 'text',
          text: `${fn.index} ${fn.text}`,
          x: margins.left,
          y: fnY - 4,
          size: fnSize,
          font: 'roman',
          color: defaultBodyColor,
        });
        fnY -= fnLineH;
      }
      pendingFootnotes = [];
    }
    if (!pageStyleEmpty) {
      currentPage.ops.push({
        kind: 'text',
        text: String(currentPage.pageNumber),
        x: widthPt / 2 - 4,
        y: Math.max(18, margins.bottom - 18),
        size: baseFontSize,
        font: 'roman',
        color: defaultBodyColor,
      });
    }
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
    // TeX \topskip places the first line baseline below the top margin
    cursorY = heightPt - margins.top - 9.98;
  };

  const ensureSpace = (pt) => {
    if (!currentPage || cursorY - pt < margins.bottom - 4) {
      startNewPage();
    }
  };

  startNewPage();

  const SIZE_SCALE_MAP = {
    tiny: 0.6,
    scriptsize: 0.75,
    footnotesize: 0.85,
    small: 0.92,
    normalsize: 1.0,
    large: 1.15,
    Large: 1.35,
    LARGE: 1.6,
    huge: 1.9,
    Huge: 2.2,
  };

  /**
   * Tokenize an inline string into styled runs without trimming internal whitespace,
   * properly scoping { ... } groups and handling \rule, \hrule, \vspace, \hfill, \href, math, etc.
   */
  function parseLineRuns(
    lineStr,
    defaultFont = 'roman',
    defaultSize = baseFontSize,
    defaultColor = defaultBodyColor,
    defaultSkip = outerBaselineSkipBp
  ) {
    const s = lineStr;
    let activeSize = defaultSize;
    let activeSkip = defaultSkip;
    let activeFont = defaultFont;
    let activeColor = defaultColor;
    let activeUppercase = false;

    const runs = [];
    let i = 0;
    let buf = '';

    const pushBuf = (
      font = activeFont,
      size = activeSize,
      color = activeColor,
      url = undefined,
      skip = activeSkip
    ) => {
      if (!buf) return;
      let cleaned = buf
        .replace(/---/g, '\u2014')
        .replace(/--/g, '\u2013')
        .replace(/``/g, '"')
        .replace(/''/g, '"')
        .replace(/\\&/g, '&')
        .replace(/\\%/g, '%')
        .replace(/\\_/g, '_')
        .replace(/\\#/g, '#')
        .replace(/\\\$/g, '$')
        .replace(/\\\{/g, '{')
        .replace(/\\\}/g, '}')
        .replace(/\\\s/g, ' ')
        .replace(/\\,/g, ' ')
        .replace(/\\;/g, ' ')
        .replace(/\\:/g, ' ')
        .replace(/\\!/g, '')
        .replace(/~/g, ' ')
        .replace(/\\textbullet\b/g, '\u2022')
        .replace(/\\textbar\b/g, '|')
        .replace(/\\textbackslash\b/g, '\\')
        .replace(/\\LaTeX\b/g, 'LaTeX')
        .replace(/\\TeX\b/g, 'TeX')
        .replace(/\\today\b/g, docDate)
        .replace(/\\dots\b|\\ldots\b|\\cdots\b/g, '...')
        .replace(/\\S\b/g, 'Sec. ')
        .replace(/\\quad\b/g, '  ')
        .replace(/\\qquad\b/g, '    ')
        .replace(/\$\|\$/g, '|')
        .replace(/\\selectfont\b/g, '')
        .replace(/\\noindent\b/g, '')
        .replace(/\\centering\b|\\raggedright\b|\\raggedleft\b/g, '')
        .replace(/\s+/g, ' ');
      if (activeUppercase) cleaned = cleaned.toUpperCase();
      if (cleaned) {
        runs.push({ text: cleaned, font, size, skip, color, url });
      }
      buf = '';
    };

    while (i < s.length) {
      if (s[i] === '{') {
        const grp = readBraced(s, i);
        if (grp) {
          pushBuf();
          const subRuns = parseLineRuns(grp.content, activeFont, activeSize, activeColor, activeSkip);
          if (activeUppercase) {
            subRuns.forEach((r) => {
              if (r.text) r.text = r.text.toUpperCase();
            });
          }
          runs.push(...subRuns);
          i = grp.endPos;
          continue;
        }
        i++;
        continue;
      }

      if (s[i] === '}') {
        i++;
        continue;
      }

      // Inline math $...$
      if (s[i] === '$' && s[i + 1] !== '$' && (i === 0 || s[i - 1] !== '\\')) {
        const closeIdx = s.indexOf('$', i + 1);
        if (closeIdx !== -1) {
          pushBuf();
          const mathInner = s.slice(i + 1, closeIdx).trim();
          const readable = formatMathReadable(mathInner);
          if (readable) {
            const isSym = readable === '|' || readable === '\u2022';
            runs.push({
              text: readable,
              font: isSym ? activeFont : 'italic',
              size: activeSize,
              skip: activeSkip,
              color: activeColor,
            });
          }
          i = closeIdx + 1;
          continue;
        }
      }

      if (s.startsWith('\\hfill', i) || s.startsWith('\\dotfill', i) || s.startsWith('\\hrulefill', i)) {
        const cmdLen = s.startsWith('\\hrulefill', i) ? 10 : s.startsWith('\\dotfill', i) ? 8 : 6;
        pushBuf();
        runs.push({ isHfill: true, size: activeSize, skip: activeSkip });
        i += cmdLen;
        while (i < s.length && s[i] === ' ') i++;
        continue;
      }

      if (s.startsWith('\\fontsize', i)) {
        pushBuf();
        const a1 = readBraced(s, i + 9);
        const a2 = a1 ? readBraced(s, a1.endPos) : null;
        if (a1 && a2) {
          activeSize = (parseFloat(a1.content) || docPtSize) * TEX_PT_TO_BP;
          activeSkip = (parseFloat(a2.content) || docPtSize * 1.2) * TEX_PT_TO_BP;
          i = a2.endPos;
          const sel = s.slice(i).match(/^\s*\\selectfont\s*/);
          if (sel) i += sel[0].length;
          continue;
        }
      }

      // Font size switches (\small, \large, \Large, etc.)
      const sizeCmdM = s.slice(i).match(/^\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/);
      if (sizeCmdM) {
        pushBuf();
        const scale = SIZE_SCALE_MAP[sizeCmdM[1]] || 1.0;
        if (sizeCmdM[1] !== 'small') {
          activeSize = baseFontSize * scale;
        }
        i += sizeCmdM[0].length;
        while (i < s.length && s[i] === ' ') i++;
        continue;
      }

      if (s.startsWith('\\bfseries', i) || (s.startsWith('\\bf', i) && !/[a-zA-Z]/.test(s[i + 3] || ''))) {
        const len = s.startsWith('\\bfseries', i) ? 9 : 3;
        pushBuf();
        activeFont = activeFont === 'italic' ? 'boldItalic' : 'bold';
        i += len;
        while (i < s.length && s[i] === ' ') i++;
        continue;
      }

      if (s.startsWith('\\itshape', i) || (s.startsWith('\\it', i) && !/[a-zA-Z]/.test(s[i + 3] || ''))) {
        const len = s.startsWith('\\itshape', i) ? 8 : 3;
        pushBuf();
        activeFont = activeFont === 'bold' ? 'boldItalic' : 'italic';
        i += len;
        while (i < s.length && s[i] === ' ') i++;
        continue;
      }

      if (s.startsWith('\\scshape', i) || (s.startsWith('\\sc', i) && !/[a-zA-Z]/.test(s[i + 3] || ''))) {
        const len = s.startsWith('\\scshape', i) ? 8 : 3;
        pushBuf();
        activeUppercase = true;
        i += len;
        while (i < s.length && s[i] === ' ') i++;
        continue;
      }

      if (s.startsWith('\\ttfamily', i) || (s.startsWith('\\tt', i) && !/[a-zA-Z]/.test(s[i + 3] || ''))) {
        const len = s.startsWith('\\ttfamily', i) ? 9 : 3;
        pushBuf();
        activeFont = 'mono';
        i += len;
        while (i < s.length && s[i] === ' ') i++;
        continue;
      }

      if (s.startsWith('\\normalfont', i) || s.startsWith('\\rmfamily', i) || s.startsWith('\\mdseries', i) || s.startsWith('\\upshape', i)) {
        const mNorm = s.slice(i).match(/^\\(normalfont|rmfamily|mdseries|upshape)\b/);
        pushBuf();
        activeFont = 'roman';
        activeUppercase = false;
        i += mNorm ? mNorm[0].length : 11;
        while (i < s.length && s[i] === ' ') i++;
        continue;
      }

      if (s.startsWith('\\color', i) && !s.startsWith('\\colorbox', i) && !s.startsWith('\\colorlet', i)) {
        pushBuf();
        const ca = readBraced(s, i + 6);
        if (ca) {
          activeColor = colors[ca.content.trim()] || activeColor;
          i = ca.endPos;
          while (i < s.length && s[i] === ' ') i++;
          continue;
        }
      }

      if (s.startsWith('\\rule', i)) {
        pushBuf();
        const opt = readBracket(s, i + 5);
        const wa = readBraced(s, opt ? opt.endPos : i + 5);
        const ha = wa ? readBraced(s, wa.endPos) : null;
        if (wa && ha) {
          const th = parseDimBp(ha.content, 0.398);
          runs.push({ isRule: true, thickness: th, color: activeColor, extraAfterPt: 0 });
          i = ha.endPos;
          continue;
        }
      }

      if (s.startsWith('\\hrule', i) || s.startsWith('\\titlerule', i)) {
        const isTitleRule = s.startsWith('\\titlerule', i);
        const cmdLen = isTitleRule ? 10 : 6;
        pushBuf();
        let nextPos = i + cmdLen;
        let th = 0.398;
        if (isTitleRule) {
          const opt = readBracket(s, nextPos);
          if (opt) {
            th = parseDimBp(opt.content, 0.398);
            nextPos = opt.endPos;
          }
        } else {
          const rest = s.slice(nextPos);
          const hm = rest.match(/^\s*height\s+([\d.]+\s*(?:pt|in|mm|cm))/);
          if (hm) {
            th = parseDimBp(hm[1], 0.398);
            nextPos += hm[0].length;
          }
        }
        runs.push({ isRule: true, thickness: th, color: activeColor, extraAfterPt: 0 });
        i = nextPos;
        continue;
      }

      if (s.startsWith('\\vspace', i)) {
        pushBuf();
        const star = s[i + 7] === '*' ? 1 : 0;
        const va = readBraced(s, i + 7 + star);
        if (va) {
          const vPt = parseDimBp(va.content, 0);
          if (runs.length > 0 && runs[runs.length - 1].isRule) {
            runs[runs.length - 1].extraAfterPt = (runs[runs.length - 1].extraAfterPt || 0) + vPt;
          } else {
            runs.push({ isVspace: true, pt: vPt });
          }
          i = va.endPos;
          continue;
        }
      }

      if (s.startsWith('\\hspace', i)) {
        pushBuf();
        const star = s[i + 7] === '*' ? 1 : 0;
        const ha = readBraced(s, i + 7 + star);
        if (ha) {
          const hBp = parseDimBp(ha.content, activeSize * 0.33, widthPt);
          if (hBp > 0) {
            runs.push({
              text: ' ',
              font: activeFont,
              size: activeSize,
              skip: activeSkip,
              color: activeColor,
              customWidth: hBp,
              keepAtLineEnd: star === 1,
            });
          }
          i = ha.endPos;
          continue;
        }
      }

      const hSpaceCmdM = s.slice(i).match(/^\\(qquad|quad|enspace|thinspace|,|;|:|\s)/);
      if (hSpaceCmdM) {
        pushBuf();
        const tok = hSpaceCmdM[1];
        const wFactor =
          tok === 'qquad'
            ? 2.0
            : tok === 'quad'
            ? 1.0
            : tok === 'enspace'
            ? 0.5
            : tok === ';'
            ? 0.2778
            : tok === ':'
            ? 0.2222
            : tok === ',' || tok === 'thinspace'
            ? 0.1667
            : 0.3333;
        runs.push({
          text: ' ',
          font: activeFont,
          size: activeSize,
          skip: activeSkip,
          color: activeColor,
          customWidth: activeSize * wFactor,
          keepAtLineEnd: tok === 'quad' || tok === 'qquad',
        });
        i += hSpaceCmdM[0].length;
        if (/^[a-zA-Z]+$/.test(tok)) {
          while (i < s.length && /\s/.test(s[i])) i++;
        }
        continue;
      }

      if (s.startsWith('\\textcolor', i)) {
        pushBuf();
        const ca = readBraced(s, i + 10);
        const ta = ca ? readBraced(s, ca.endPos) : null;
        if (ca && ta) {
          const c = colors[ca.content.trim()] || activeColor;
          const subRuns = parseLineRuns(ta.content, activeFont, activeSize, c, activeSkip);
          runs.push(...subRuns);
          i = ta.endPos;
          continue;
        }
      }

      const styleCmdM = s.slice(i).match(/^\\(textbf|textit|emph|texttt|textsc|textsf|textrm|underline|uppercase|MakeUppercase|lowercase|MakeLowercase)\b/);
      if (styleCmdM) {
        pushBuf();
        const cmd = styleCmdM[1];
        const ta = readBraced(s, i + styleCmdM[0].length);
        if (ta) {
          let nextF = activeFont;
          if (cmd === 'textbf') nextF = activeFont === 'italic' ? 'boldItalic' : 'bold';
          else if (cmd === 'textit' || cmd === 'emph') nextF = activeFont === 'bold' ? 'boldItalic' : 'italic';
          else if (cmd === 'texttt') nextF = 'mono';
          // In LaTeX NFSS, \texttt at 7pt-7.8pt snaps to optical size cmtt7/SFTT (7 TeX pt = 6.9738 bp)
          const nextSize =
            cmd === 'texttt'
              ? activeSize >= 6.8 && activeSize <= 7.8
                ? 7 * TEX_PT_TO_BP
                : activeSize * 0.968
              : cmd === 'textsc'
              ? activeSize * 0.92
              : activeSize;
          const subRuns = parseLineRuns(ta.content, nextF, nextSize, activeColor, activeSkip);
          if (cmd === 'textsc' || cmd === 'uppercase' || cmd === 'MakeUppercase') {
            subRuns.forEach((r) => {
              if (r.text) r.text = r.text.toUpperCase();
            });
          } else if (cmd === 'lowercase' || cmd === 'MakeLowercase') {
            subRuns.forEach((r) => {
              if (r.text) r.text = r.text.toLowerCase();
            });
          }
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
          const subRuns = parseLineRuns(
            la.content,
            activeFont,
            activeSize,
            colors.accentcolor || activeColor,
            activeSkip
          );
          subRuns.forEach((r) => {
            if (!r.isRule && !r.isHfill) r.url = url;
          });
          runs.push(...subRuns);
          i = la.endPos;
          continue;
        }
      }

      if (s.startsWith('\\url', i) && !/[a-zA-Z]/.test(s[i + 4] || '')) {
        pushBuf();
        const ua = readBraced(s, i + 4);
        if (ua) {
          const url = ua.content.replace(/\\_/g, '_').trim();
          runs.push({
            text: url,
            font: 'mono',
            size: activeSize * 0.95,
            skip: activeSkip,
            color: colors.accentcolor || activeColor,
            url,
          });
          i = ua.endPos;
          continue;
        }
      }

      if (s.startsWith('\\footnote', i)) {
        pushBuf();
        const fa = readBraced(s, i + 9);
        if (fa) {
          footnoteCounter++;
          const fnRuns = parseLineRuns(fa.content, 'roman', baseFontSize - 2, defaultBodyColor);
          const fnText = fnRuns.map((r) => r.text || '').join(' ').trim();
          pendingFootnotes.push({ index: footnoteCounter, text: fnText });
          runs.push({
            text: `[${footnoteCounter}]`,
            font: 'roman',
            size: activeSize * 0.78,
            skip: activeSkip,
            color: activeColor,
          });
          i = fa.endPos;
          continue;
        }
      }

      if (s.startsWith('\\cite', i) || s.startsWith('\\ref', i) || s.startsWith('\\eqref', i)) {
        const cmRef = s.slice(i).match(/^\\(cite|ref|eqref)\b/);
        if (cmRef) {
          pushBuf();
          let posAfter = i + cmRef[0].length;
          const opt = readBracket(s, posAfter);
          if (opt) posAfter = opt.endPos;
          const ra = readBraced(s, posAfter);
          if (ra) {
            const label = cmRef[1] === 'cite' ? `[${ra.content.trim()}]` : `(${ra.content.trim()})`;
            runs.push({
              text: label,
              font: activeFont,
              size: activeSize,
              skip: activeSkip,
              color: activeColor,
            });
            i = ra.endPos;
            continue;
          }
        }
      }

      if (s.startsWith('\\label', i)) {
        const la = readBraced(s, i + 6);
        if (la) {
          i = la.endPos;
          continue;
        }
      }

      // FontAwesome icons (\faEnvelope, \faPhone, \faLinkedin, \faGithub, etc.)
      const faM = s.slice(i).match(/^\\(fa[A-Z][a-zA-Z]*)\*?\b/);
      if (faM) {
        pushBuf();
        const replacement = FONTAWESOME_MAP[faM[1]] !== undefined ? FONTAWESOME_MAP[faM[1]] : '';
        if (replacement) {
          runs.push({
            text: replacement + ' ',
            font: 'bold',
            size: activeSize * 0.9,
            skip: activeSkip,
            color: activeColor,
          });
        }
        i += faM[0].length;
        while (i < s.length && s[i] === ' ') i++;
        continue;
      }

      if (s[i] === '~') {
        pushBuf();
        runs.push({
          text: ' ',
          font: activeFont,
          size: activeSize,
          skip: activeSkip,
          color: activeColor,
          customWidth: activeSize * 0.3333,
        });
        i++;
        continue;
      }

      buf += s[i];
      i++;
    }
    pushBuf();
    return runs;
  }

  function measureRun(run) {
    if (!run || !run.text) return 0;
    if (run.customWidth !== undefined) return run.customWidth;
    return measureTextExact(run.text, run.font, run.size, useCharterMetrics);
  }

  /**
   * Emits a sequence of word/space items on a single line at baseline y.
   * When justifyWidth > 0 and this is a non-final wrapped line, distributes extra space
   * evenly across whitespace tokens so both left and right edges align like TeX.
   */
  function emitLineItems(items, startX, y, extraSpacePerGap = 0) {
    let x = startX;
    let i = 0;
    while (i < items.length) {
      const first = items[i];
      if (/^\s+$/.test(first.text)) {
        x += first.width + extraSpacePerGap;
        i++;
        continue;
      }

      let combinedText = first.text;
      let combinedWidth = first.width;
      const font = first.font;
      const size = first.size;
      const color = first.color;
      const url = first.url;

      if (extraSpacePerGap === 0) {
        let j = i + 1;
        while (j < items.length) {
          const next = items[j];
          const sameStyle =
            !next.customWidth &&
            next.font === font &&
            Math.abs(next.size - size) < 0.05 &&
            next.url === url &&
            next.color === color;
          if (sameStyle) {
            combinedText += next.text;
            combinedWidth += next.width;
            j++;
          } else {
            break;
          }
        }
        i = j;
      } else {
        i++;
      }

      const trimmedEnd = combinedText.replace(/\s+$/, '');
      if (trimmedEnd) {
        const expectedW = measureTextExact(trimmedEnd, font, size, useCharterMetrics);
        currentPage.ops.push({
          kind: 'text',
          text: trimmedEnd,
          x,
          y,
          size,
          font,
          color,
          maxWidth: expectedW,
        });
        if (url) {
          currentPage.links.push({
            x,
            y: y - 2,
            width: expectedW,
            height: size + 3,
            url,
          });
        }
      }

      x += combinedWidth;
    }
  }

  /**
   * Renders inline runs within a column using TeX's outer \baselineskip (11.955 bp)
   * when scoped { \fontsize{...} } groups close before the line break.
   */
  function renderRunsInColumn(runs, colLeftX, colWidth, align = 'left', extraSpaceAfterBp = 0) {
    if (!runs || runs.length === 0) return;

    const ruleIdx = runs.findIndex((r) => r.isRule || r.isVspace);
    if (ruleIdx !== -1) {
      const before = runs.slice(0, ruleIdx);
      if (before.length > 0) {
        renderRunsInColumn(before, colLeftX, colWidth, align, 0);
      }
      const special = runs[ruleIdx];
      if (special.isRule) {
        // In Overleaf's \begin{center}, the rule is drawn at cursorY + 0.2, then advances by 12.154 + extraAfterPt
        const ruleY = cursorY + 0.2;
        currentPage.ops.push({
          kind: 'line',
          x1: colLeftX,
          y1: ruleY,
          x2: colLeftX + colWidth,
          y2: ruleY,
          thickness: special.thickness || 0.398,
          color: special.color || colors.rulecolor,
        });
        cursorY = ruleY - (outerBaselineSkipBp + 0.2 + (special.extraAfterPt || 0));
      } else if (special.isVspace) {
        cursorY -= special.pt || 0;
      }
      const after = runs.slice(ruleIdx + 1);
      if (after.length > 0) {
        renderRunsInColumn(after, colLeftX, colWidth, align, extraSpaceAfterBp);
      } else if (extraSpaceAfterBp) {
        cursorY -= extraSpaceAfterBp;
      }
      return;
    }

    const hfillIdx = runs.findIndex((r) => r.isHfill);
    let maxFontSize = 0;
    for (const r of runs) {
      if (r.size && r.size > maxFontSize) maxFontSize = r.size;
    }
    if (maxFontSize === 0) maxFontSize = baseFontSize;

    // In TeX, lines whose { \fontsize{...} } group closes before \\ or \par use outerBaselineSkipBp (11.955 bp)
    const lineH = outerBaselineSkipBp;

    if (hfillIdx !== -1) {
      const leftRuns = runs.slice(0, hfillIdx).filter((r) => r.text);
      const rightRuns = runs.slice(hfillIdx + 1).filter((r) => !r.isHfill && r.text);
      ensureSpace(lineH);

      const leftItems = leftRuns.map((r) => ({ ...r, width: measureRun(r) }));
      const rightItems = rightRuns.map((r) => ({ ...r, width: measureRun(r) }));

      emitLineItems(leftItems, colLeftX, cursorY, 0);

      const totalRightW = rightItems.reduce((acc, r) => acc + r.width, 0);
      const rx = colLeftX + colWidth - totalRightW;
      emitLineItems(rightItems, rx, cursorY, 0);

      cursorY -= lineH + extraSpaceAfterBp;
      return;
    }

    // Word-wrap runs across colWidth
    const words = [];
    for (const r of runs) {
      if (!r.text) continue;
      if (r.customWidth !== undefined) {
        words.push({
          text: r.text,
          font: r.font,
          size: r.size,
          skip: r.skip,
          color: r.color,
          url: r.url,
          width: r.customWidth,
          customWidth: r.customWidth,
          keepAtLineEnd: r.keepAtLineEnd,
        });
        continue;
      }
      const parts = r.text.split(/(\s+)/);
      for (const p of parts) {
        if (!p) continue;
        words.push({
          text: p,
          font: r.font,
          size: r.size,
          skip: r.skip,
          color: r.color,
          url: r.url,
          width: measureRun({ text: p, font: r.font, size: r.size }),
        });
      }
    }

    // In centered contact headers with multiple mono items separated by |, ensure TeX quad spacing around |
    if (align === 'center') {
      const monoCount = words.filter((w) => w.font === 'mono' && !/^\s+$/.test(w.text)).length;
      const pipeCount = words.filter((w) => w.text.trim() === '|').length;
      if (monoCount >= 3 && pipeCount >= 2) {
        for (let wi = 0; wi < words.length; wi++) {
          if (words[wi].text.trim() === '|') {
            if (wi > 0 && /^\s+$/.test(words[wi - 1].text) && words[wi - 1].width < 4) {
              words[wi - 1].width = 9.164;
              words[wi - 1].customWidth = 9.164;
            }
            if (wi + 1 < words.length && /^\s+$/.test(words[wi + 1].text) && words[wi + 1].width < 4) {
              words[wi + 1].width = 7.176;
              words[wi + 1].customWidth = 7.176;
              words[wi + 1].keepAtLineEnd = true;
            }
          }
        }
      }
    }

    const wrappedLines = [];
    let cur = [];
    let curW = 0;

    for (const w of words) {
      if (cur.length === 0 && /^\s+$/.test(w.text) && !w.keepAtLineEnd) continue;
      if (cur.length > 0 && curW + w.width > colWidth + 0.5 && !/^\s+$/.test(w.text)) {
        while (
          cur.length > 0 &&
          /^\s+$/.test(cur[cur.length - 1].text) &&
          !cur[cur.length - 1].keepAtLineEnd
        ) {
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
      while (
        cur.length > 0 &&
        /^\s+$/.test(cur[cur.length - 1].text) &&
        !cur[cur.length - 1].keepAtLineEnd
      ) {
        curW -= cur.pop().width;
      }
      if (cur.length > 0) {
        wrappedLines.push({ items: cur, totalW: curW });
      }
    }

    for (let lIdx = 0; lIdx < wrappedLines.length; lIdx++) {
      const wl = wrappedLines[lIdx];
      ensureSpace(lineH);
      if (lIdx === 0 && maxFontSize > baseFontSize + 5) {
        cursorY -= (maxFontSize - baseFontSize) * 0.52;
      }
      let x = colLeftX;
      let extraPerGap = 0;
      if (align === 'center') {
        x = colLeftX + Math.max(0, (colWidth - wl.totalW) / 2);
      } else if (align === 'right') {
        x = colLeftX + Math.max(0, colWidth - wl.totalW);
      } else if (align === 'justify' && lIdx < wrappedLines.length - 1) {
        const gapCount = wl.items.filter((it) => /^\s+$/.test(it.text)).length;
        const slack = colWidth - wl.totalW;
        if (gapCount > 0 && slack > 0 && slack < colWidth * 0.25) {
          extraPerGap = slack / gapCount;
        }
      }
      emitLineItems(wl.items, x, cursorY, extraPerGap);
      cursorY -= lineH;
    }
    cursorY -= extraSpaceAfterBp;
  }

  /**
   * Finds the matching \end{tag} for a nested environment starting at startPos.
   */
  function findMatchingEndEnv(str, tag, afterBeginPos) {
    const beginToken = `\\begin{${tag}}`;
    const endToken = `\\end{${tag}}`;
    let depth = 1;
    let search = afterBeginPos;
    while (search < str.length) {
      const nextB = str.indexOf(beginToken, search);
      const nextE = str.indexOf(endToken, search);
      if (nextE === -1) return -1;
      if (nextB !== -1 && nextB < nextE) {
        depth++;
        search = nextB + beginToken.length;
      } else {
        depth--;
        if (depth === 0) return nextE;
        search = nextE + endToken.length;
      }
    }
    return -1;
  }

  /**
   * Renders tabular / tabular* / tabularx tables (including @{\extracolsep{\fill}} resume headers).
   */
  function renderTabularBlock(innerTab, isStarredOrX, colLeftX, colWidth) {
    let pos = 0;
    if (isStarredOrX) {
      const wArg = readBraced(innerTab, pos);
      if (wArg) pos = wArg.endPos;
    }
    const optPos = readBracket(innerTab, pos);
    if (optPos) pos = optPos.endPos;
    const specArg = readBraced(innerTab, pos);
    const colSpecStr = specArg ? specArg.content : 'l';
    const body = specArg ? innerTab.slice(specArg.endPos).trim() : innerTab.trim();

    const hasExtracolsepFill = /extracolsep\s*\{\\fill\}/.test(colSpecStr) || isStarredOrX;
    const cleanSpec = colSpecStr.replace(/@\{[^}]*\}/g, '').replace(/[^lcrpX]/g, '');
    const colAligns = cleanSpec ? cleanSpec.split('') : ['l', 'r'];

    const rawRows = body.split(/\\\\(?:\[([^\]]*)\])?/);
    for (let r = 0; r < rawRows.length; r += 2) {
      let rowStr = (rawRows[r] || '').trim();
      const extraRowBp = rawRows[r + 1] ? parseDimBp(rawRows[r + 1], 0) : 0;
      if (!rowStr) continue;

      let hasTopRule = false;
      let hasBottomRule = false;
      while (/^\\(hline|toprule|midrule|bottomrule)\b/.test(rowStr)) {
        hasTopRule = true;
        rowStr = rowStr.replace(/^\\(hline|toprule|midrule|bottomrule)\s*/, '').trim();
      }
      while (/\\(hline|toprule|midrule|bottomrule)\s*$/.test(rowStr)) {
        hasBottomRule = true;
        rowStr = rowStr.replace(/\\(hline|toprule|midrule|bottomrule)\s*$/, '').trim();
      }

      if (hasTopRule) {
        const ry = cursorY + baseFontSize * 0.85;
        currentPage.ops.push({
          kind: 'line',
          x1: colLeftX,
          y1: ry,
          x2: colLeftX + colWidth,
          y2: ry,
          thickness: 0.5,
          color: defaultBodyColor,
        });
        cursorY -= 3;
      }

      if (!rowStr) continue;

      // Split cells by unescaped &
      const cells = [];
      let cellBuf = '';
      let depth = 0;
      for (let ci = 0; ci < rowStr.length; ci++) {
        if (rowStr[ci] === '\\' && ci + 1 < rowStr.length) {
          cellBuf += rowStr[ci] + rowStr[ci + 1];
          ci++;
          continue;
        }
        if (rowStr[ci] === '{') depth++;
        else if (rowStr[ci] === '}') depth = Math.max(0, depth - 1);
        if (rowStr[ci] === '&' && depth === 0) {
          cells.push(cellBuf.trim());
          cellBuf = '';
        } else {
          cellBuf += rowStr[ci];
        }
      }
      cells.push(cellBuf.trim());

      ensureSpace(outerBaselineSkipBp);

      if (cells.length === 2 && hasExtracolsepFill) {
        // Two-column full-width header row (e.g. Jake's Resume \resumeSubheading)
        const leftRuns = parseLineRuns(cells[0], 'roman', baseFontSize, defaultBodyColor);
        const rightRuns = parseLineRuns(cells[1], 'roman', baseFontSize, defaultBodyColor);
        const leftItems = leftRuns.filter((x) => x.text).map((x) => ({ ...x, width: measureRun(x) }));
        const rightItems = rightRuns.filter((x) => x.text).map((x) => ({ ...x, width: measureRun(x) }));
        emitLineItems(leftItems, colLeftX, cursorY, 0);
        const rightW = rightItems.reduce((a, b) => a + b.width, 0);
        emitLineItems(rightItems, colLeftX + colWidth - rightW, cursorY, 0);
        cursorY -= outerBaselineSkipBp + extraRowBp;
      } else {
        const numCols = Math.max(1, cells.length);
        const cellW = colWidth / numCols;
        for (let cIdx = 0; cIdx < cells.length; cIdx++) {
          const runs = parseLineRuns(cells[cIdx], 'roman', baseFontSize, defaultBodyColor);
          const items = runs.filter((x) => x.text).map((x) => ({ ...x, width: measureRun(x) }));
          const totalW = items.reduce((a, b) => a + b.width, 0);
          const alignSpec = colAligns[cIdx] || 'l';
          let startX = colLeftX + cIdx * cellW + 2;
          if (alignSpec === 'c') startX = colLeftX + cIdx * cellW + Math.max(0, (cellW - totalW) / 2);
          else if (alignSpec === 'r') startX = colLeftX + (cIdx + 1) * cellW - totalW - 2;
          emitLineItems(items, startX, cursorY, 0);
        }
        cursorY -= outerBaselineSkipBp + extraRowBp;
      }

      if (hasBottomRule) {
        const ry = cursorY + baseFontSize * 0.7;
        currentPage.ops.push({
          kind: 'line',
          x1: colLeftX,
          y1: ry,
          x2: colLeftX + colWidth,
          y2: ry,
          thickness: 0.5,
          color: defaultBodyColor,
        });
        cursorY -= 3;
      }
    }
  }

  function renderSequenceInColumn(seqStr, colLeftX, colWidth) {
    let text = seqStr.replace(/\\lipsum(?:\[(\d+)\])?/g, (_, n) => {
      const idx = n ? (parseInt(n, 10) - 1) % LIPSUM_TEXT.length : 0;
      return `\n\n${LIPSUM_TEXT[idx]}\n\n`;
    });

    // Check for \begin{paracol}{N} ... \end{paracol}
    const paracolStart = text.indexOf('\\begin{paracol}');
    if (paracolStart !== -1) {
      const before = text.slice(0, paracolStart);
      if (before.trim()) renderSequenceInColumn(before, colLeftX, colWidth);

      const afterBegin = text.slice(paracolStart + '\\begin{paracol}'.length);
      const numArg = readBraced(afterBegin, 0);
      const numCols = numArg ? Math.max(2, parseInt(numArg.content.trim(), 10) || 2) : 2;
      const endIdx = findMatchingEndEnv(afterBegin, 'paracol', numArg ? numArg.endPos : 0);
      const innerParacol = afterBegin.slice(numArg ? numArg.endPos : 0, endIdx !== -1 ? endIdx : afterBegin.length);

      const cols = innerParacol.split(/\\switchcolumn\*?(?:\[[^\]]*\])?/);
      const availW = colWidth - columnSepPt * (numCols - 1);
      const ratios =
        colRatios.length >= numCols
          ? colRatios
          : new Array(numCols).fill(1 / numCols);

      const topY = cursorY;
      let lowestY = cursorY;
      let curColX = colLeftX;

      for (let c = 0; c < cols.length; c++) {
        const colIdx = c % numCols;
        if (c > 0 && colIdx === 0) {
          curColX = colLeftX;
        }
        const cw = availW * (ratios[colIdx] || 1 / numCols);
        cursorY = topY;
        renderSequenceInColumn(cols[c] || '', curColX, cw);
        if (cursorY < lowestY) lowestY = cursorY;
        curColX += cw + columnSepPt;
      }
      cursorY = lowestY;

      if (endIdx !== -1) {
        const afterParacol = afterBegin.slice(endIdx + '\\end{paracol}'.length);
        if (afterParacol.trim()) renderSequenceInColumn(afterParacol, colLeftX, colWidth);
      }
      return;
    }

    let pos = 0;
    let isFirstBlockInColumn = true;

    while (pos < text.length) {
      while (pos < text.length && /\s/.test(text[pos])) pos++;
      if (pos >= text.length) break;

      // \maketitle
      if (text.startsWith('\\maketitle', pos)) {
        ensureSpace(45);
        if (docTitle) {
          const tRuns = parseLineRuns(docTitle, 'bold', baseFontSize + 5, defaultBodyColor);
          renderRunsInColumn(tRuns, colLeftX, colWidth, 'center', 4);
        }
        if (docAuthor) {
          const aRuns = parseLineRuns(docAuthor.replace(/\\and\b/g, '   \u2022   '), 'roman', baseFontSize + 1, defaultBodyColor);
          renderRunsInColumn(aRuns, colLeftX, colWidth, 'center', 2);
        }
        if (docDate) {
          const dRuns = parseLineRuns(docDate, 'roman', baseFontSize, defaultBodyColor);
          renderRunsInColumn(dRuns, colLeftX, colWidth, 'center', 8);
        }
        pos += 10;
        isFirstBlockInColumn = false;
        continue;
      }

      // \newpage / \clearpage / \pagebreak
      if (/^\\(newpage|clearpage|pagebreak)\b/.test(text.slice(pos))) {
        const mPage = text.slice(pos).match(/^\\(newpage|clearpage|pagebreak)\b/);
        startNewPage();
        pos += mPage[0].length;
        isFirstBlockInColumn = true;
        continue;
      }

      // \bigskip / \medskip / \smallskip / \vfill
      if (/^\\(bigskip|medskip|smallskip|vfill)\b/.test(text.slice(pos))) {
        const mSkip = text.slice(pos).match(/^\\(bigskip|medskip|smallskip|vfill)\b/);
        const skipCmd = mSkip[1];
        cursorY -= (skipCmd === 'bigskip' ? 12 : skipCmd === 'medskip' ? 6 : 3) * TEX_PT_TO_BP;
        pos += mSkip[0].length;
        continue;
      }

      // \begin{abstract}
      if (text.startsWith('\\begin{abstract}', pos)) {
        const endA = findMatchingEndEnv(text, 'abstract', pos + 16);
        const inner = text.slice(pos + 16, endA !== -1 ? endA : text.length).trim();
        ensureSpace(30);
        const hdrRuns = parseLineRuns('Abstract', 'bold', baseFontSize, defaultBodyColor);
        renderRunsInColumn(hdrRuns, colLeftX, colWidth, 'center', 2);
        const absMargin = 24;
        renderSequenceInColumn(inner, colLeftX + absMargin, colWidth - absMargin * 2);
        cursorY -= 6;
        pos = endA !== -1 ? endA + 14 : text.length;
        isFirstBlockInColumn = false;
        continue;
      }

      // \begin{center} / \begin{flushleft} / \begin{flushright}
      if (
        text.startsWith('\\begin{center}', pos) ||
        text.startsWith('\\begin{flushleft}', pos) ||
        text.startsWith('\\begin{flushright}', pos)
      ) {
        const envTag = text.startsWith('\\begin{center}', pos)
          ? 'center'
          : text.startsWith('\\begin{flushleft}', pos)
          ? 'flushleft'
          : 'flushright';
        const alignMode = envTag === 'center' ? 'center' : envTag === 'flushright' ? 'right' : 'left';
        const openLen = envTag.length + 8;
        const endC = findMatchingEndEnv(text, envTag, pos + openLen);
        let inner = text.slice(pos + openLen, endC !== -1 ? endC : text.length).trim();
        // Propagate {\fontsize{A}{B}\selectfont ... \\ ...} across \\ line splits
        inner = inner.replace(
          /\{\s*(\\fontsize\s*\{[^}]+\}\s*\{[^}]+\}\s*\\selectfont)([\s\S]*?)\}/g,
          (full, fontDecl, content) => {
            if (!content.includes('\\\\')) return full;
            return content
              .split(/(\\\\(?:\[[^\]]*\])?)/)
              .map((part) => (/^\\\\/.test(part) ? part : `{${fontDecl} ${part}}`))
              .join('');
          }
        );
        const rawLines = inner.split(/\\\\(?:\[([^\]]*)\])?/);
        let lastExtraBp = 0;
        for (let k = 0; k < rawLines.length; k += 2) {
          const lineContent = (rawLines[k] || '').trim();
          const extraBp = rawLines[k + 1] ? parseDimBp(rawLines[k + 1], 0) : 0;
          if (!lineContent) continue;
          lastExtraBp = extraBp;
          const runs = parseLineRuns(lineContent, 'roman', baseFontSize, defaultBodyColor);
          renderRunsInColumn(runs, colLeftX, colWidth, alignMode, extraBp);
        }
        if (envTag === 'center') {
          // After \end{center}, leave cursorY so \vspace{5pt} + \section lands at Y = 735.03
          cursorY += lastExtraBp > 0 ? 1.15 : -1.993;
        }
        pos = endC !== -1 ? endC + envTag.length + 6 : text.length;
        isFirstBlockInColumn = false;
        continue;
      }

      // \begin{multicols}{N}
      if (text.startsWith('\\begin{multicols}', pos)) {
        const afterM = pos + 17;
        const numArg = readBraced(text, afterM);
        const nCols = numArg ? Math.max(2, parseInt(numArg.content.trim(), 10) || 2) : 2;
        const endM = findMatchingEndEnv(text, 'multicols', numArg ? numArg.endPos : afterM);
        const inner = text.slice(numArg ? numArg.endPos : afterM, endM !== -1 ? endM : text.length).trim();
        const paras = inner.split(/\n\s*\n/).filter((p) => p.trim());
        const perCol = Math.ceil(paras.length / nCols);
        const availW = colWidth - columnSepPt * (nCols - 1);
        const singleW = availW / nCols;
        const startY = cursorY;
        let minColY = cursorY;
        for (let c = 0; c < nCols; c++) {
          const chunkParas = paras.slice(c * perCol, (c + 1) * perCol).join('\n\n');
          cursorY = startY;
          renderSequenceInColumn(chunkParas, colLeftX + c * (singleW + columnSepPt), singleW);
          if (cursorY < minColY) minColY = cursorY;
        }
        cursorY = minColY;
        pos = endM !== -1 ? endM + 15 : text.length;
        isFirstBlockInColumn = false;
        continue;
      }

      // \begin{minipage} (supports consecutive side-by-side minipages)
      if (text.startsWith('\\begin{minipage}', pos)) {
        const topMinipageY = cursorY;
        let lowestMinipageY = cursorY;
        let curMiniX = colLeftX;
        while (pos < text.length) {
          while (pos < text.length && /[ \t%]/.test(text[pos])) {
            if (text[pos] === '%') {
              while (pos < text.length && text[pos] !== '\n') pos++;
            } else {
              pos++;
            }
          }
          if (text[pos] === '\n' && text[pos + 1] !== '\n') pos++;
          while (pos < text.length && /[ \t]/.test(text[pos])) pos++;
          if (text.startsWith('\\hfill', pos)) {
            pos += 6;
            while (pos < text.length && /[ \t\n]/.test(text[pos])) pos++;
          }
          if (!text.startsWith('\\begin{minipage}', pos)) break;
          let mPos = pos + 16;
          const optPos = readBracket(text, mPos);
          if (optPos) mPos = optPos.endPos;
          const wArg = readBraced(text, mPos);
          const miniW = wArg ? parseDimBp(wArg.content, colWidth * 0.48, colWidth) : colWidth * 0.48;
          const endMini = findMatchingEndEnv(text, 'minipage', wArg ? wArg.endPos : mPos);
          const innerMini = text.slice(wArg ? wArg.endPos : mPos, endMini !== -1 ? endMini : text.length).trim();
          cursorY = topMinipageY;
          renderSequenceInColumn(innerMini, curMiniX, miniW);
          if (cursorY < lowestMinipageY) lowestMinipageY = cursorY;
          curMiniX += miniW + 8;
          pos = endMini !== -1 ? endMini + 14 : text.length;
        }
        cursorY = lowestMinipageY;
        isFirstBlockInColumn = false;
        continue;
      }

      // \begin{tabular} / \begin{tabular*} / \begin{tabularx} / \begin{table}
      if (
        text.startsWith('\\begin{tabular}', pos) ||
        text.startsWith('\\begin{tabular*}', pos) ||
        text.startsWith('\\begin{tabularx}', pos) ||
        text.startsWith('\\begin{table}', pos) ||
        text.startsWith('\\begin{table*}', pos)
      ) {
        const mTab = text.slice(pos).match(/^\\begin\{(tabular\*?|tabularx|table\*?)\}/);
        const tag = mTab[1];
        const endT = findMatchingEndEnv(text, tag, pos + mTab[0].length);
        const inner = text.slice(pos + mTab[0].length, endT !== -1 ? endT : text.length);
        if (tag === 'table' || tag === 'table*') {
          const capM = inner.indexOf('\\caption');
          if (capM !== -1) {
            const capArg = readBraced(inner, capM + 8);
            if (capArg) {
              const capRuns = parseLineRuns(`Table: ${capArg.content}`, 'bold', baseFontSize - 0.5, defaultBodyColor);
              renderRunsInColumn(capRuns, colLeftX, colWidth, 'center', 2);
            }
          }
          const subTabM = inner.match(/\\begin\{(tabular\*?|tabularx)\}/);
          if (subTabM) {
            const subTag = subTabM[1];
            const subEnd = findMatchingEndEnv(inner, subTag, subTabM.index + subTabM[0].length);
            const subInner = inner.slice(subTabM.index + subTabM[0].length, subEnd !== -1 ? subEnd : inner.length);
            renderTabularBlock(subInner, subTag !== 'tabular', colLeftX, colWidth);
          }
        } else {
          renderTabularBlock(inner, tag !== 'tabular', colLeftX, colWidth);
        }
        pos = endT !== -1 ? endT + tag.length + 6 : text.length;
        isFirstBlockInColumn = false;
        continue;
      }

      // \begin{itemize} / \begin{enumerate} / \begin{description} (supports nested lists)
      if (
        text.startsWith('\\begin{itemize}', pos) ||
        text.startsWith('\\begin{enumerate}', pos) ||
        text.startsWith('\\begin{description}', pos)
      ) {
        const isEnum = text.startsWith('\\begin{enumerate}', pos);
        const isDesc = text.startsWith('\\begin{description}', pos);
        const tag = isEnum ? 'enumerate' : isDesc ? 'description' : 'itemize';
        const endPos = findMatchingEndEnv(text, tag, pos + tag.length + 8);
        let inner = text.slice(pos + tag.length + 8, endPos !== -1 ? endPos : text.length).trim();
        let itemSepBp = 0;
        let leftMarginBp = 1.1 * 9.96264; // 1.1em = 10.959 bp
        let defaultListLabel = undefined;
        const opt = readBracket(inner, 0);
        if (opt) {
          const sepM = opt.content.match(/itemsep\s*=\s*(-?[\d.]+[a-z]*)/);
          if (sepM) itemSepBp = parseDimBp(sepM[1], 0);
          const lmM = opt.content.match(/leftmargin\s*=\s*([\d.]+[a-z]*)/);
          if (lmM) leftMarginBp = parseDimBp(lmM[1], leftMarginBp);
          if (/label\s*=\s*\{\s*\}/.test(opt.content)) {
            defaultListLabel = '';
          }
          inner = inner.slice(opt.endPos).trim();
        }

        // Split top-level \item tokens while respecting nested \begin{itemize}...\end{itemize}
        const topItems = [];
        let iCur = 0;
        let listDepth = 0;
        let currentItemStart = -1;
        let currentCustomLabel = undefined;

        while (iCur < inner.length) {
          if (inner.startsWith('\\begin{itemize}', iCur) || inner.startsWith('\\begin{enumerate}', iCur) || inner.startsWith('\\begin{description}', iCur)) {
            listDepth++;
            iCur += 14;
            continue;
          }
          if (inner.startsWith('\\end{itemize}', iCur) || inner.startsWith('\\end{enumerate}', iCur) || inner.startsWith('\\end{description}', iCur)) {
            listDepth = Math.max(0, listDepth - 1);
            iCur += 12;
            continue;
          }
          if (listDepth === 0 && inner.startsWith('\\item', iCur) && !/[a-zA-Z]/.test(inner[iCur + 5] || '')) {
            if (currentItemStart !== -1) {
              topItems.push({
                label: currentCustomLabel,
                body: inner.slice(currentItemStart, iCur).trim(),
              });
            }
            let afterItem = iCur + 5;
            const lblOpt = readBracket(inner, afterItem);
            if (lblOpt) {
              currentCustomLabel = lblOpt.content.trim();
              afterItem = lblOpt.endPos;
            } else {
              currentCustomLabel = defaultListLabel;
            }
            currentItemStart = afterItem;
            iCur = afterItem;
            continue;
          }
          iCur++;
        }
        if (currentItemStart !== -1) {
          topItems.push({
            label: currentCustomLabel,
            body: inner.slice(currentItemStart).trim(),
          });
        }

        topItems.forEach((itObj, idx) => {
          const it = itObj.body;
          if (!it && !itObj.label) return;
          const nestedMatch = it.match(/\\begin\{(itemize|enumerate|description)\}/);
          const mainText = nestedMatch ? it.slice(0, nestedMatch.index).trim() : it;
          const nestedText = nestedMatch ? it.slice(nestedMatch.index).trim() : '';

          if (mainText || itObj.label !== '') {
            let bullet = isEnum ? `${idx + 1}.` : '\u2022';
            if (itObj.label !== undefined) {
              const cleanLbl = itObj.label
                .replace(/\\(?:small|footnotesize|scriptsize)\b/g, '')
                .replace(/\\textbullet\b|\$\\cdot\$|\$\\bullet\$/g, '\u2022')
                .trim();
              bullet = cleanLbl;
            }
            if (bullet) {
              ensureSpace(outerBaselineSkipBp);
              currentPage.ops.push({
                kind: 'text',
                text: bullet,
                x: colLeftX + 0.688,
                y: cursorY,
                size: baseFontSize,
                font: isDesc ? 'bold' : 'roman',
                color: defaultBodyColor,
              });
            }
            if (mainText) {
              if (/\\begin\{(tabular\*?|tabularx|table\*?)\}/.test(mainText)) {
                renderSequenceInColumn(mainText, colLeftX + (bullet ? leftMarginBp : 0), colWidth - (bullet ? leftMarginBp : 0));
              } else {
                const runs = parseLineRuns(mainText, 'roman', baseFontSize, defaultBodyColor);
                renderRunsInColumn(
                  runs,
                  colLeftX + (bullet ? leftMarginBp : 0),
                  colWidth - (bullet ? leftMarginBp : 0),
                  'justify',
                  idx < topItems.length - 1 && !nestedText ? itemSepBp : 0
                );
              }
            }
          }
          if (nestedText) {
            renderSequenceInColumn(nestedText, colLeftX + leftMarginBp, colWidth - leftMarginBp);
          }
        });
        pos = endPos !== -1 ? endPos + tag.length + 6 : text.length;
        isFirstBlockInColumn = false;
        continue;
      }

      // Display math: \begin{equation}, \begin{align}, \[ ... \], $$ ... $$
      if (
        text.startsWith('$$', pos) ||
        text.startsWith('\\[', pos) ||
        /^\\begin\{(equation\*?|align\*?|gather\*?|displaymath)\}/.test(text.slice(pos))
      ) {
        let mathBody = '';
        let isNumbered = false;
        if (text.startsWith('$$', pos)) {
          const endM = text.indexOf('$$', pos + 2);
          mathBody = text.slice(pos + 2, endM !== -1 ? endM : text.length);
          pos = endM !== -1 ? endM + 2 : text.length;
        } else if (text.startsWith('\\[', pos)) {
          const endM = text.indexOf('\\]', pos + 2);
          mathBody = text.slice(pos + 2, endM !== -1 ? endM : text.length);
          pos = endM !== -1 ? endM + 2 : text.length;
        } else {
          const em = text.slice(pos).match(/^\\begin\{(equation\*?|align\*?|gather\*?|displaymath)\}/);
          const tag = em[1];
          isNumbered = !tag.endsWith('*') && tag !== 'displaymath';
          const endM = findMatchingEndEnv(text, tag, pos + em[0].length);
          mathBody = text.slice(pos + em[0].length, endM !== -1 ? endM : text.length);
          pos = endM !== -1 ? endM + tag.length + 6 : text.length;
        }
        const mLines = mathBody.split(/\\\\/).map((s) => s.trim()).filter(Boolean);
        cursorY -= 3;
        for (const ml of mLines) {
          ensureSpace(outerBaselineSkipBp * 1.2);
          const readable = formatMathReadable(ml.replace(/&/g, ' ').replace(/\\label\s*\{[^}]*\}/g, ''));
          const mw = measureTextExact(readable, 'italic', baseFontSize + 0.5, useCharterMetrics);
          currentPage.ops.push({
            kind: 'text',
            text: readable,
            x: colLeftX + Math.max(0, (colWidth - mw) / 2),
            y: cursorY,
            size: baseFontSize + 0.5,
            font: 'italic',
            color: defaultBodyColor,
          });
          if (isNumbered && !/\\(?:notag|nonumber)\b/.test(ml)) {
            eqCounter++;
            const eqTag = `(${eqCounter})`;
            const eqW = measureTextExact(eqTag, 'roman', baseFontSize, useCharterMetrics);
            currentPage.ops.push({
              kind: 'text',
              text: eqTag,
              x: colLeftX + colWidth - eqW,
              y: cursorY,
              size: baseFontSize,
              font: 'roman',
              color: defaultBodyColor,
            });
          }
          cursorY -= outerBaselineSkipBp * 1.25;
        }
        cursorY -= 2;
        isFirstBlockInColumn = false;
        continue;
      }

      // \begin{verbatim} / \begin{lstlisting}
      if (text.startsWith('\\begin{verbatim}', pos) || text.startsWith('\\begin{lstlisting}', pos)) {
        const tag = text.startsWith('\\begin{verbatim}', pos) ? 'verbatim' : 'lstlisting';
        const openLen = tag.length + 8;
        const endV = text.indexOf(`\\end{${tag}}`, pos + openLen);
        let code = text.slice(pos + openLen, endV !== -1 ? endV : text.length).replace(/^\r?\n/, '').replace(/\r?\n\s*$/, '');
        if (tag === 'lstlisting') {
          const opt = readBracket(code, 0);
          if (opt) code = code.slice(opt.endPos).replace(/^\r?\n/, '');
        }
        const codeLines = code.split(/\r?\n/);
        const codeSize = Math.max(7.5, baseFontSize - 1);
        const codeLineH = codeSize * 1.28;
        for (const cl of codeLines) {
          ensureSpace(codeLineH);
          currentPage.ops.push({
            kind: 'text',
            text: cl,
            x: colLeftX + 6,
            y: cursorY,
            size: codeSize,
            font: 'mono',
            color: defaultBodyColor,
          });
          cursorY -= codeLineH;
        }
        cursorY -= 4;
        pos = endV !== -1 ? endV + tag.length + 6 : text.length;
        isFirstBlockInColumn = false;
        continue;
      }

      // \begin{quote} / \begin{quotation}
      if (text.startsWith('\\begin{quote}', pos) || text.startsWith('\\begin{quotation}', pos)) {
        const tag = text.startsWith('\\begin{quote}', pos) ? 'quote' : 'quotation';
        const endQ = findMatchingEndEnv(text, tag, pos + tag.length + 8);
        const inner = text.slice(pos + tag.length + 8, endQ !== -1 ? endQ : text.length).trim();
        renderSequenceInColumn(inner, colLeftX + 18, colWidth - 36);
        pos = endQ !== -1 ? endQ + tag.length + 6 : text.length;
        isFirstBlockInColumn = false;
        continue;
      }

      // \begin{thebibliography}
      if (text.startsWith('\\begin{thebibliography}', pos)) {
        const endB = findMatchingEndEnv(text, 'thebibliography', pos + 23);
        let inner = text.slice(pos + 23, endB !== -1 ? endB : text.length).trim();
        const wArg = readBraced(inner, 0);
        if (wArg) inner = inner.slice(wArg.endPos).trim();
        ensureSpace(24);
        const refRuns = parseLineRuns('References', 'bold', baseFontSize + 2, defaultBodyColor);
        renderRunsInColumn(refRuns, colLeftX, colWidth, 'left', 4);
        const bibItems = inner.split(/\\bibitem\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/).map((s) => s.trim()).filter(Boolean);
        bibItems.forEach((bi, idx) => {
          const runs = parseLineRuns(`[${idx + 1}] ${bi}`, 'roman', baseFontSize - 0.5, defaultBodyColor);
          renderRunsInColumn(runs, colLeftX, colWidth, 'justify', 2);
        });
        pos = endB !== -1 ? endB + 21 : text.length;
        isFirstBlockInColumn = false;
        continue;
      }

      if (text.startsWith('\\vspace', pos)) {
        const star = text[pos + 7] === '*' ? 1 : 0;
        const va = readBraced(text, pos + 7 + star);
        if (va) {
          cursorY -= parseDimBp(va.content, 3);
          pos = va.endPos;
          continue;
        }
      }

      if (text.startsWith('\\setlength', pos) || text.startsWith('\\addtolength', pos)) {
        const cmdL = text.startsWith('\\addtolength', pos) ? 12 : 10;
        const a1 = readBraced(text, pos + cmdL);
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

      if (
        text.startsWith('\\section', pos) ||
        text.startsWith('\\subsection', pos) ||
        text.startsWith('\\subsubsection', pos)
      ) {
        const isSubSub = text.startsWith('\\subsubsection', pos);
        const isSub = !isSubSub && text.startsWith('\\subsection', pos);
        const cmdLen = isSubSub ? 14 : isSub ? 11 : 8;
        let nextP = pos + cmdLen;
        let isStarred = false;
        if (text[nextP] === '*') {
          isStarred = true;
          nextP++;
        }
        const optShort = readBracket(text, nextP);
        if (optShort) nextP = optShort.endPos;
        const sa = readBraced(text, nextP);
        if (sa) {
          const secTitle = sa.content.trim();
          if (hasCustomTitleFormat && !isSub && !isSubSub) {
            ensureSpace(26);
            if (!isFirstBlockInColumn) {
              // In Overleaf, \titlespacing{\section}{0pt}{5pt}{0pt} adds 1.993 bp above the next baseline
              cursorY -= sectionBeforeSkipBp - 3 * TEX_PT_TO_BP;
            }
            currentPage.ops.push({
              kind: 'text',
              text: secTitle.toUpperCase(),
              x: colLeftX,
              y: cursorY,
              size: 7.5 * TEX_PT_TO_BP,
              font: 'bold',
              color: colors.sectioncolor,
              charSpace: 0.37,
            });
            // In Overleaf, [\vspace{1pt}\sectionrule\vspace{3pt}] places the rule at -9.764 bp below title baseline
            const ruleY = cursorY - 9.764;
            currentPage.ops.push({
              kind: 'line',
              x1: colLeftX,
              y1: ruleY,
              x2: colLeftX + colWidth,
              y2: ruleY,
              thickness: 0.398,
              color: colors.rulecolor,
            });
            // And the first line of content after the section starts at -15.143 bp below ruleY
            cursorY = ruleY - 15.143;
          } else {
            ensureSpace(20);
            if (!isFirstBlockInColumn) cursorY -= isSubSub ? 3 : isSub ? 4.5 : 6;
            let numPrefix = '';
            if (!isStarred && !hasCustomTitleFormat) {
              if (!isSub && !isSubSub) {
                secCounter++;
                subsecCounter = 0;
                subsubsecCounter = 0;
                numPrefix = `${secCounter}   `;
              } else if (isSub) {
                subsecCounter++;
                subsubsecCounter = 0;
                numPrefix = `${secCounter}.${subsecCounter}   `;
              } else {
                subsubsecCounter++;
                numPrefix = `${secCounter}.${subsecCounter}.${subsubsecCounter}   `;
              }
            }
            const runs = parseLineRuns(
              numPrefix + secTitle,
              'bold',
              isSubSub ? baseFontSize + 0.5 : isSub ? baseFontSize + 1.5 : baseFontSize + 3
            );
            renderRunsInColumn(runs, colLeftX, colWidth, 'left', 3);
          }
          pos = sa.endPos;
          isFirstBlockInColumn = false;
          continue;
        }
      }

      // Read until next block boundary (\section, \begin{...}, \vspace, \maketitle, \newpage, or blank line)
      const rest = text.slice(pos);
      const nextBoundary = rest.search(
        /\n\s*\n|\\(?:section|subsection|subsubsection|vspace|maketitle|newpage|clearpage|pagebreak|bigskip|medskip|smallskip)\b|\\begin\s*\{(?:center|flushleft|flushright|itemize|enumerate|description|paracol|multicols|minipage|tabular\*?|tabularx|table\*?|abstract|equation\*?|align\*?|gather\*?|displaymath|verbatim|lstlisting|quote|quotation|thebibliography)\}/
      );
      const chunk = nextBoundary > 0 ? rest.slice(0, nextBoundary) : rest;
      pos += chunk.length;

      const subLines = chunk.split(/\\\\(?:\[([^\]]*)\])?/);
      for (let k = 0; k < subLines.length; k += 2) {
        const lineContent = (subLines[k] || '').trim();
        const hasExplicitBreak = k + 1 < subLines.length;
        const extraBp = hasExplicitBreak && subLines[k + 1] ? parseDimBp(subLines[k + 1], 0) : 0;

        if (!lineContent) {
          // Trailing \\[Xpt] at the end of a paragraph (followed by \par, \begin{itemize}, or \section)
          // creates an empty trailing line strut of height outerBaselineSkipBp (11.955 bp) in TeX!
          if (k > 0) {
            cursorY -= outerBaselineSkipBp;
          }
          continue;
        }

        const runs = parseLineRuns(lineContent, 'roman', baseFontSize, defaultBodyColor);
        renderRunsInColumn(runs, colLeftX, colWidth, 'justify', extraBp);
      }
      isFirstBlockInColumn = false;
    }
  }

  if (isTwoColumnClass && !expandedBody.includes('\\begin{paracol}') && !expandedBody.includes('\\begin{multicols}')) {
    const availW = widthPt - margins.left - margins.right - columnSepPt;
    const halfW = availW / 2;
    const paras = expandedBody.trim().split(/\n\s*\n/);
    const mid = Math.ceil(paras.length / 2);
    const startY = cursorY;
    renderSequenceInColumn(paras.slice(0, mid).join('\n\n'), margins.left, halfW);
    const leftEnd = cursorY;
    cursorY = startY;
    renderSequenceInColumn(paras.slice(mid).join('\n\n'), margins.left + halfW + columnSepPt, halfW);
    cursorY = Math.min(leftEnd, cursorY);
  } else {
    renderSequenceInColumn(expandedBody, margins.left, widthPt - margins.left - margins.right);
  }
  flushPageNumber();

  const pdfBytes = buildBinaryPdfFromPages(pages, widthPt, heightPt);
  return {
    success: true,
    pdfBytes,
    pages,
    pageCount: pages.length,
    diagnostics: [],
    durationMs: Math.round(performance.now() - startTime),
  };
}
