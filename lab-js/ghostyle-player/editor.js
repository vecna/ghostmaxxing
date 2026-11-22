/** @module ghostyle-player/editor */
import { tokenizer } from '../vendor/acorn-8.18.0.mjs';

const OPEN = new Set(['{', '[', '(', '${']);
const CLOSE = new Set(['}', ']', ')']);
const CONTEXTUAL = new Set(['as', 'async', 'await', 'from', 'of']);

/**
 * Reads JavaScript tokens and comments without requiring a complete program.
 * @param {string} source Current editor draft.
 * @returns {{tokens:object[], complete:boolean}} Tokens in source order.
 */
export function readJavaScript(source) {
   const tokens = [];
   const lexer = tokenizer(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      onComment: (_block, _text, start, end, from, to) => {
         tokens.push({ start, end, loc: { start: from, end: to }, style: 'comment' });
      },
   });

   try {
      for (const token of lexer) {
         const label = token.type.label;
         let style;
         if (token.type.keyword || (label === 'name' && CONTEXTUAL.has(token.value))) style = 'keyword';
         else if (['string', 'regexp', 'template', '`', 'invalidTemplate'].includes(label)) style = 'string';
         else if (label === 'num') style = 'number';
         tokens.push({ ...token, label, style });
      }
      return { tokens, complete: true };
   } catch {
      return { tokens, complete: false };
   }
}

/**
 * Reindents lines by delimiter nesting, preserving line endings and the
 * contents of multiline strings, templates and comments.
 * @param {string} source JavaScript draft.
 * @returns {string} Draft with normalized indentation.
 */
export function indentJavaScript(source) {
   const { tokens, complete } = readJavaScript(source);
   if (!complete) return source;

   const lines = source.split(/(\r\n|[\n\r\u2028\u2029])/);
   const protectedLines = new Set();
   const byLine = new Map();
   for (const token of tokens) {
      const { start, end } = token.loc;
      for (let line = start.line + 1; line <= end.line; line++) protectedLines.add(line);
      if (!token.label) continue;
      if (!byLine.has(start.line)) byLine.set(start.line, []);
      byLine.get(start.line).push(token.label);
   }

   let depth = 0;
   for (let index = 0; index < lines.length; index += 2) {
      const line = index / 2 + 1;
      const labels = byLine.get(line) ?? [];
      let leading = 0;
      while (CLOSE.has(labels[leading])) leading++;
      if (!protectedLines.has(line)) {
         const content = lines[index].replace(/^[\t ]+/, '');
         lines[index] = content ? '   '.repeat(Math.max(0, depth - leading)) + content : '';
      }
      for (const label of labels) {
         if (OPEN.has(label)) depth++;
         if (CLOSE.has(label)) depth = Math.max(0, depth - 1);
      }
   }
   return lines.join('');
}

/**
 * Mirrors the editable textarea with a decorative, scroll-synced token layer.
 * @param {HTMLTextAreaElement} input Native editable control.
 * @param {HTMLElement} code Highlighted layer excluded from the accessibility tree.
 * @returns {{update:Function}} Updates highlighting after programmatic edits.
 */
export function createSourceHighlight(input, code) {
   /** Aligns rendered token positions with the textarea in both axes. */
   function syncScroll() {
      code.style.transform = 'translate(' + -input.scrollLeft + 'px,' + -input.scrollTop + 'px)';
   }

   /** Rebuilds the decorative token spans using plain text nodes. */
   function update() {
      const source = input.value;
      const content = document.createDocumentFragment();
      let past = 0;
      for (const token of readJavaScript(source).tokens) {
         if (!token.style) continue;
         content.append(source.slice(past, token.start));
         const span = document.createElement('span');
         span.className = 'source-' + token.style;
         span.textContent = source.slice(token.start, token.end);
         content.append(span);
         past = token.end;
      }
      content.append(source.slice(past));
      if (source.endsWith('\n')) content.append('\n');
      code.replaceChildren(content);
      syncScroll();
   }

   input.addEventListener('scroll', syncScroll);
   input.addEventListener('input', update);
   return { update };
}

/**
 * Downloads the editor text as a local JavaScript file.
 * @param {string} source Current draft, including unapplied changes.
 * @param {string} id Active Ghostyle catalog ID.
 * @returns {void}
 */
export function downloadGhostyle(source, id) {
   const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
   const link = document.createElement('a');
   link.href = url;
   link.download = id.replace(/[^a-z0-9_-]/gi, '_') + '.js';
   document.body.append(link);
   link.click();
   link.remove();
   setTimeout(() => URL.revokeObjectURL(url), 1000);
}
