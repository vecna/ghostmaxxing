#!/usr/bin/env node
/**
 * build-codemap.js — static map of what each maintainer script does.
 *
 * For every script a person can run directly (the `node …` and `python3 …`
 * invocations in package.json `scripts`, plus the executables in scripts-dev/)
 * this extractor reads the source without running it and records:
 *
 *   - the summary from the file's header comment (the "why" a parser cannot
 *     invent, so it is taken from the people who wrote the script);
 *   - the command-line options, their defaults, and the subcommands;
 *   - the top-level functions `main()` calls, in order, each with the first
 *     sentence of its JSDoc;
 *   - every filesystem, process, server and network side effect ("sink"):
 *     what is read, written, deleted or executed, the path as an expression
 *     (`ROOT/images/workshops`, `← --output`, `$TMPDIR/gstmxx-capture-*`),
 *     the function it lives in, and the option condition that gates it.
 *
 * It then draws one Mermaid flowchart per script: options → subcommand →
 * functions → files, folders and external processes.
 *
 * Depth is deliberately shallow: one level of functions below `main()`, and
 * only `if (options.x)`-style conditions. Anything the source computes from
 * data at run time is shown as `<computed>`, never guessed. Paths that cannot
 * be resolved are a reason to name a constant in the script, not to trust a
 * runtime trace instead.
 *
 * Aggregation scripts (`npm run htmls` and friends) are not mapped; they are
 * `&&` chains of the entries that are.
 *
 * Outputs (defaults): codemap/codemap.json and codemap/mmd/<script>.mmd.
 * The viewer is assembled by build-codemap-html.js.
 *
 * Usage: node scripts-dev/build-codemap.js [--out codemap/codemap.json] [--mmd-dir codemap/mmd] [--only <substring>]
 */

const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const walk = require('acorn-walk');

const ROOT = path.resolve(__dirname, '..');
const PKG = require(path.join(ROOT, 'package.json'));

// ---------------------------------------------------------------------------
// Entry points: which files can a person run, and under which npm names?
// ---------------------------------------------------------------------------

function findEntries() {
   const entries = new Map(); // rel path -> { npm: [{name, args}] }
   const add = (rel, npm) => {
      rel = rel.replace(/^\.\//, '');
      if (!fs.existsSync(path.join(ROOT, rel))) return;
      if (!entries.has(rel)) entries.set(rel, { npm: [] });
      if (npm) entries.get(rel).npm.push(npm);
   };
   for (const [name, cmd] of Object.entries(PKG.scripts || {})) {
      // `node -e "…"` one-liners that spawn a script count as an invocation of it.
      for (const m of cmd.matchAll(/(?:node|python3)\s+((?:[\w.-]+\/)*[\w.-]+\.(?:c?js|mjs|py))((?:\s+(?!&&)[^\s&]+)*)/g)) {
         add(m[1], { name, args: m[2].trim() });
      }
      for (const m of cmd.matchAll(/'((?:scripts-dev|projects|references)\/[\w./-]+\.(?:c?js|py))'/g)) {
         add(m[1], { name, args: '(from an inline node -e loop)' });
      }
   }
   // Executables in scripts-dev/ that package.json does not alias.
   const dir = path.join(ROOT, 'scripts-dev');
   for (const f of fs.readdirSync(dir)) {
      if (!/\.(c?js|mjs|py)$/.test(f)) continue;
      const head = fs.readFileSync(path.join(dir, f), 'utf8').slice(0, 64);
      if (head.startsWith('#!')) add(`scripts-dev/${f}`, null);
   }
   return entries;
}

// ---------------------------------------------------------------------------
// Small helpers over the AST
// ---------------------------------------------------------------------------

function memberText(node) {
   if (!node) return '';
   if (node.type === 'Identifier') return node.name;
   if (node.type === 'ThisExpression') return 'this';
   if (node.type === 'MemberExpression') {
      if (node.computed) return `${memberText(node.object)}[…]`;
      return `${memberText(node.object)}.${memberText(node.property)}`;
   }
   if (node.type === 'CallExpression') return `${memberText(node.callee)}()`;
   return '?';
}

function isStr(n) {
   return n && n.type === 'Literal' && typeof n.value === 'string';
}

/** First sentence of a block comment, stripped of `*` gutters and JSDoc tags. */
function commentSummary(text, max = 160) {
   const body = text
      .split('\n')
      .map((l) => l.replace(/^\s*\/?\*+\/?\s?/, '').replace(/\s*\*\/\s*$/, ''))
      .join('\n')
      .trim();
   const firstPara = body.split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
   const sentence = firstPara.split(/(?<=\.)\s/)[0] || firstPara;
   const clean = sentence.replace(/^@\w+\s*/, '').replace(/\{@link\s+([^}]+)\}/g, '$1');
   return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Header comment: the first block comment in the file, as paragraphs. */
function headerDoc(comments) {
   let first = comments.find((c) => c.type === 'Block');
   // a run of `//` lines at the top of the file is a header too
   const lines = [];
   for (const c of comments) {
      if (c.type !== 'Line' || (lines.length && c.start - lines[lines.length - 1].end > 2)) break;
      if (first && c.start > first.start) break;
      lines.push(c);
   }
   if (lines.length >= 2 && (!first || lines[0].start < first.start)) {
      first = { value: lines.map((l) => l.value).join('\n') };
   }
   if (!first) return { summary: '', text: '' };
   const text = first.value
      .split('\n')
      .map((l) => l.replace(/^\s*\*\s?/, ''))
      .join('\n')
      .trim();
   // the header summary is the whole first paragraph, within reason
   const para = text.split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
   const summary = para.length > 320 ? `${para.slice(0, para.lastIndexOf(' ', 320))}…` : para;
   return { summary, text };
}

// ---------------------------------------------------------------------------
// Path expressions → readable text, without executing anything
// ---------------------------------------------------------------------------

function makePathRenderer(ctx) {
   // ctx.consts: name -> rendered text; ctx.optionProps: prop -> flag
   const render = (n, depth = 0) => {
      if (!n || depth > 8) return '<computed>';
      switch (n.type) {
         case 'Literal':
            return typeof n.value === 'string' ? n.value : String(n.value);
         case 'TemplateLiteral': {
            let s = '';
            n.quasis.forEach((q, i) => {
               s += q.value.cooked;
               if (n.expressions[i]) s += `\${${render(n.expressions[i], depth + 1)}}`;
            });
            return s.replace(/\$\{(<[^}]*>|← --[\w-]+|\$\w+)\}/g, '$1');
         }
         case 'Identifier': {
            if (n.name === '__dirname') return ctx.dirAlias;
            if (n.name === 'undefined') return '<computed>';
            if (Object.prototype.hasOwnProperty.call(ctx.consts, n.name)) return ctx.consts[n.name];
            if (ctx.localConsts && ctx.localConsts[n.name]) return ctx.localConsts[n.name];
            if (ctx.optionProps[n.name]) return `← ${ctx.optionProps[n.name]}`;
            return `<${n.name}>`;
         }
         case 'MemberExpression': {
            const t = memberText(n);
            if (/^(options|opts|config|args)\.(\w+)$/.test(t)) {
               const prop = t.split('.')[1];
               return ctx.optionProps[prop] ? `← ${ctx.optionProps[prop]}` : `<${prop}>`;
            }
            if (t === 'process.env[…]' || t.startsWith('process.env.')) return `$${t.split('.').pop()}`;
            if (/^\w+\.\w+$/.test(t) && ctx.consts[t]) return ctx.consts[t];
            return `<${t}>`;
         }
         case 'CallExpression': {
            const c = memberText(n.callee);
            if (c === 'path.join' || c === 'path.resolve') {
               let parts = n.arguments.map((a) => render(a, depth + 1));
               if (c === 'path.resolve' && parts.length && !/^(ROOT|\$|<|←|\/)/.test(parts[0])) parts.unshift('$CWD');
               return normalize(parts.join('/'));
            }
            if (c === 'os.tmpdir') return '$TMPDIR';
            if (/^fsp?\.mkdtemp(Sync)?$/.test(c)) return `${render(n.arguments[0], depth + 1)}*`;
            if (/^fsp?\.realpath(Sync)?$/.test(c)) return render(n.arguments[0], depth + 1);
            if (c === 'process.cwd') return '$CWD';
            if (c === 'os.homedir') return '$HOME';
            if (c === 'path.dirname') return `${render(n.arguments[0], depth + 1)}/..`;
            if (c === 'path.basename' || c === 'path.extname') return `<${c.split('.')[1]} of ${render(n.arguments[0], depth + 1)}>`;
            if (c === 'path.relative') return `<relative path>`;
            if (c === 'Date.now' || c === 'new Date') return '<timestamp>';
            if (/\.replace$|\.toLowerCase$|\.trim$/.test(c) && n.callee.object) return render(n.callee.object, depth + 1);
            return '<computed>';
         }
         case 'BinaryExpression':
            if (n.operator === '+') return `${render(n.left, depth + 1)}${render(n.right, depth + 1)}`;
            return '<computed>';
         case 'LogicalExpression':
            return `${render(n.left, depth + 1)} ?? ${render(n.right, depth + 1)}`;
         case 'ConditionalExpression':
            return `${render(n.consequent, depth + 1)} | ${render(n.alternate, depth + 1)}`;
         case 'NewExpression':
            return memberText(n.callee) === 'URL' ? render(n.arguments[0], depth + 1) : '<computed>';
         default:
            return '<computed>';
      }
   };
   return render;
}

function normalize(p) {
   // ROOT/../x stays; collapse "a/./b", "$DIR/../.." left as is (readable enough)
   let s = p.replace(/\/\.\//g, '/').replace(/([^/])\/\/+/g, '$1/');
   // "ROOT/scripts-dev/.." → "ROOT": a script resolving its own parent
   let prev;
   do { prev = s; s = s.replace(/\/[\w.-]+\/\.\.(?=\/|$)/, ''); } while (s !== prev && !/^\.\./.test(s));
   return s;
}

// ---------------------------------------------------------------------------
// Sinks: calls with side effects on files, processes, servers, network
// ---------------------------------------------------------------------------

const FS_KINDS = {
   read: ['readFileSync', 'readFile', 'createReadStream', 'readdirSync', 'readdir', 'existsSync', 'statSync', 'stat', 'lstatSync', 'accessSync', 'access', 'opendirSync'],
   write: ['writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'createWriteStream', 'copyFileSync', 'copyFile', 'cpSync', 'cp', 'renameSync', 'rename', 'mkdirSync', 'mkdir', 'mkdtempSync', 'mkdtemp', 'symlinkSync', 'utimesSync', 'chmodSync'],
   delete: ['rmSync', 'rm', 'rmdirSync', 'rmdir', 'unlinkSync', 'unlink'],
};
const FS_LISTISH = new Set(['readdirSync', 'readdir', 'opendirSync', 'mkdirSync', 'mkdir', 'mkdtempSync', 'mkdtemp', 'rmSync', 'rm', 'rmdirSync', 'rmdir', 'cpSync', 'cp']);
const PROBE = new Set(['existsSync', 'statSync', 'stat', 'lstatSync', 'accessSync', 'access']);
const EXEC = new Set(['spawnSync', 'spawn', 'execSync', 'exec', 'execFileSync', 'execFile', 'fork']);

function fsKind(method) {
   for (const [kind, list] of Object.entries(FS_KINDS)) if (list.includes(method)) return kind;
   return null;
}

/** The option condition that gates a node: nearest enclosing if/ternary/&& test naming an option. */
function gatingCondition(ancestors, ctx) {
   const describe = (test) => {
      const t = test;
      const neg = t.type === 'UnaryExpression' && t.operator === '!';
      const inner = neg ? t.argument : t;
      const txt = memberText(inner);
      const m = txt.match(/^(?:options|opts|config|args)\.(\w+)$/);
      if (m) {
         const flag = ctx.optionProps[m[1]] || m[1];
         return neg ? `${flag} not set` : `${flag} set`;
      }
      if (inner.type === 'BinaryExpression' && /^[!=]==?$/.test(inner.operator)) {
         const l = memberText(inner.left);
         const lm = l.match(/^(?:options|opts|config|args)\.(\w+)$/);
         if (lm && isStr(inner.right)) {
            const flag = ctx.optionProps[lm[1]] || lm[1];
            const eq = inner.operator.startsWith('=') !== neg;
            return `${flag} ${eq ? '=' : '≠'} ${inner.right.value}`;
         }
      }
      if (inner.type === 'LogicalExpression') {
         const a = describe(inner.left);
         const b = describe(inner.right);
         if (a && b) return `${a} ${inner.operator === '&&' ? 'and' : 'or'} ${b}`;
         return a || b;
      }
      if (inner.type === 'Identifier' && ctx.optionProps[inner.name]) {
         return `${ctx.optionProps[inner.name]} ${neg ? 'not set' : 'set'}`;
      }
      return null;
   };
   for (let i = ancestors.length - 2; i >= 0; i -= 1) {
      const a = ancestors[i];
      const child = ancestors[i + 1];
      if (a.type === 'IfStatement' && child !== a.test) {
         const d = describe(a.test);
         if (d) return child === a.alternate ? invert(d) : d;
      }
      if (a.type === 'ConditionalExpression' && child !== a.test) {
         const d = describe(a.test);
         if (d) return child === a.alternate ? invert(d) : d;
      }
      if (a.type === 'LogicalExpression' && child === a.right) {
         const d = describe(a.left);
         if (d) return a.operator === '&&' ? d : invert(d);
      }
      if (/Function/.test(a.type)) break; // do not cross function boundaries
   }
   return null;
}

function invert(d) {
   if (d.endsWith(' not set')) return d.replace(/ not set$/, ' set');
   if (d.endsWith(' set')) return d.replace(/ set$/, ' not set');
   if (d.includes(' = ')) return d.replace(' = ', ' ≠ ');
   if (d.includes(' ≠ ')) return d.replace(' ≠ ', ' = ');
   return `not (${d})`;
}

// ---------------------------------------------------------------------------
// Per-script analysis (JavaScript)
// ---------------------------------------------------------------------------

function analyzeJs(rel) {
   const file = path.join(ROOT, rel);
   const src = fs.readFileSync(file, 'utf8');
   const comments = [];
   let ast;
   const opts = { ecmaVersion: 'latest', locations: true, allowHashBang: true, onComment: comments, allowAwaitOutsideFunction: true };
   try {
      ast = acorn.parse(src, { ...opts, sourceType: 'script' });
   } catch {
      try {
         ast = acorn.parse(src, { ...opts, sourceType: 'module' });
      } catch (err) {
         return { id: rel, lang: 'js', parseError: err.message, options: [], subcommands: [], functions: [], sinks: [], flow: [] };
      }
   }

   const doc = headerDoc(comments);
   const headerSubdocs = {};
   {
      const block = doc.text.match(/(?:Subcommands|Commands|Modes):\s*\n([\s\S]*?)(?:\n\s*\n|$)/i);
      if (block) {
         let cur = null;
         for (const l of block[1].split('\n')) {
            const m = l.match(/^\s{0,4}([a-z][\w:-]*)\s{2,}(.+)$/);
            if (m) { cur = m[1]; headerSubdocs[cur] = m[2].trim(); } else if (cur && /^\s{6,}\S/.test(l)) headerSubdocs[cur] += ` ${l.trim()}`;
         }
         for (const k of Object.keys(headerSubdocs)) headerSubdocs[k] = commentSummary(`/* ${headerSubdocs[k]} */`);
      }
   }
   const out = {
      id: rel,
      lang: 'js',
      loc: src.split('\n').length,
      summary: doc.summary,
      header: doc.text,
      version: (src.match(/\bVERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null,
      options: [],
      subcommands: [],
      positional: [],
      functions: [],
      sinks: [],
      flow: [],
      requires: [],
   };

   // ---- top-level functions and their leading JSDoc
   const fnByName = new Map();
   const commentBefore = (node) => {
      const prev = comments.filter((c) => c.type === 'Block' && c.end <= node.start && node.start - c.end < 80).pop();
      return prev ? commentSummary(prev.value) : '';
   };
   const registerFn = (name, node, declNode) => {
      const params = (node.params || []).map((p) => (p.type === 'Identifier' ? p.name : p.type === 'AssignmentPattern' && p.left.type === 'Identifier' ? p.left.name : null));
      fnByName.set(name, { name, node, params, line: node.loc.start.line, doc: commentBefore(declNode || node), calls: [], sinks: [] });
   };
   for (const st of ast.body) {
      if (st.type === 'FunctionDeclaration' && st.id) registerFn(st.id.name, st, st);
      if (st.type === 'VariableDeclaration') {
         for (const d of st.declarations) {
            if (d.id.type === 'Identifier' && d.init && /FunctionExpression|ArrowFunctionExpression/.test(d.init.type)) {
               registerFn(d.id.name, d.init, st);
            }
         }
      }
   }

   // ---- requires (what the script leans on)
   walk.simple(ast, {
      CallExpression(n) {
         if (n.callee.type === 'Identifier' && n.callee.name === 'require' && isStr(n.arguments[0])) {
            out.requires.push(n.arguments[0].value);
         }
      },
   });
   out.requires = [...new Set(out.requires)];

   // ---- options: literal flag comparisons, assignment targets, defaults object
   const flags = new Map(); // flag -> { flag, prop, type, aliases }
   const optionProps = {}; // prop -> flag
   const dirAlias = `ROOT/${path.dirname(rel)}`;
   const ctx = { consts: {}, optionProps, dirAlias };

   const noteFlag = (flag, prop, type) => {
      if (!/^--?[a-zA-Z]/.test(flag)) return;
      const canon = flag.startsWith('--') ? flag : null;
      if (!canon) {
         // short alias: attach to the closest long flag registered in the same comparison, else keep alone
         if (!flags.has(flag)) flags.set(flag, { flag, prop: prop || null, type: type || 'boolean', aliases: [] });
         return;
      }
      if (!flags.has(canon)) flags.set(canon, { flag: canon, prop: null, type: 'value', aliases: [] });
      const f = flags.get(canon);
      if (prop) { f.prop = prop; optionProps[prop] = canon; }
      if (type) f.type = type;
   };

   /** In `if (arg === '--x' || arg === '-x') { … }` or `case '--x':`, find what gets assigned. */
   const assignedIn = (body) => {
      let prop = null;
      let type = 'value';
      walk.simple(body, {
         AssignmentExpression(a) {
            const l = memberText(a.left);
            const m = l.match(/^(?:options|opts|config|args|result|parsed)\.(\w+)$/) || (a.left.type === 'Identifier' ? [null, a.left.name] : null);
            if (m && !prop) {
               prop = m[1];
               if (a.right.type === 'Literal' && typeof a.right.value === 'boolean') type = 'boolean';
            }
         },
      });
      return { prop, type };
   };

   walk.ancestor(ast, {
      BinaryExpression(n, _state, anc) {
         if (!/^[=!]==?$/.test(n.operator)) return;
         const lit = isStr(n.right) ? n.right : isStr(n.left) ? n.left : null;
         if (!lit || !lit.value.startsWith('-')) return;
         // find enclosing if / case body
         let body = null;
         for (let i = anc.length - 2; i >= 0; i -= 1) {
            if (anc[i].type === 'IfStatement' && anc[i].test === anc[i + 1]) { body = anc[i].consequent; break; }
            if (anc[i].type === 'ConditionalExpression' && anc[i].test === anc[i + 1]) { body = anc[i].consequent; break; }
            if (/Function/.test(anc[i].type)) break;
         }
         const { prop, type } = body ? assignedIn(body) : { prop: null, type: null };
         // boolean when the test of a same-line `|| arg === '-h'` style: detect multiple literals in same test
         noteFlag(lit.value, prop, body && !/.{0}/.test('') ? type : type);
         if (body && !prop) {
            // things like `process.exit(0)` after printing usage
            const txt = src.slice(body.start, body.end);
            if (/usage|help/i.test(txt)) noteFlag(lit.value, null, 'boolean');
            if (/VERSION/.test(txt)) noteFlag(lit.value, null, 'boolean');
         }
      },
      SwitchStatement(n) {
         let pending = [];
         for (const c of n.cases) {
            if (!isStr(c.test) || !c.test.value.startsWith('-')) { pending = []; continue; }
            pending.push(c.test.value);
            if (!c.consequent.length) continue; // fallthrough: alias of the next case
            const { prop, type } = assignedIn({ type: 'BlockStatement', body: c.consequent });
            const long = pending.filter((f) => f.startsWith('--'));
            const canon = long[0] || pending[0];
            noteFlag(canon, prop, type);
            if (flags.has(canon)) for (const a of pending) if (a !== canon) flags.get(canon).aliases.push(a);
            pending = [];
         }
      },
      CallExpression(n) {
         const c = memberText(n.callee);
         if (/\.(includes|indexOf)$/.test(c) && isStr(n.arguments[0]) && n.arguments[0].value.startsWith('-')) {
            noteFlag(n.arguments[0].value, null, /indexOf$/.test(c) ? 'value' : 'boolean');
         }
      },
   });

   // group short aliases that share an `||` with a long flag
   walk.simple(ast, {
      LogicalExpression(n) {
         if (n.operator !== '||') return;
         const lits = [];
         walk.simple(n, { Literal(l) { if (typeof l.value === 'string' && l.value.startsWith('-')) lits.push(l.value); } });
         const long = lits.find((l) => l.startsWith('--'));
         if (!long || !flags.has(long)) return;
         for (const l of lits) if (l !== long && !l.startsWith('--')) { flags.get(long).aliases.push(l); flags.delete(l); }
      },
   });

   // defaults object: `const options = { a: 1, b: null }` with ≥3 props, in a function that mentions flags
   let defaults = {};
   walk.simple(ast, {
      VariableDeclarator(d) {
         if (d.id.type !== 'Identifier' || !/^(options|opts|config|defaults|parsed|result)$/.test(d.id.name)) return;
         if (!d.init || d.init.type !== 'ObjectExpression' || d.init.properties.length < 3) return;
         const o = {};
         for (const p of d.init.properties) {
            if (p.type !== 'Property' || p.key.type !== 'Identifier') continue;
            const v = p.value;
            if (v.type === 'Literal') o[p.key.name] = v.value === null ? null : v.value;
            else if (v.type === 'ArrayExpression') o[p.key.name] = v.elements.map((e) => (e && e.type === 'Literal' ? e.value : '…'));
            else if (v.type === 'Identifier') o[p.key.name] = v.name === 'undefined' ? null : `<${v.name}>`;
            else if (v.type === 'UnaryExpression' && v.argument.type === 'Literal') o[p.key.name] = `${v.operator}${v.argument.value}`;
            else o[p.key.name] = '<computed>';
         }
         if (Object.keys(o).length > Object.keys(defaults).length) defaults = o;
      },
   });

   // positional / subcommands: an array of plain words compared against the first positional
   const subcommandSets = [];
   walk.simple(ast, {
      VariableDeclarator(d) {
         if (d.id.type !== 'Identifier' || !/command|subcommand|mode|action/i.test(d.id.name)) return;
         if (!d.init || d.init.type !== 'ArrayExpression') return;
         const vals = d.init.elements.map((e) => (isStr(e) ? e.value : null));
         if (vals.length >= 2 && vals.every((v) => v && /^[a-z][\w:-]*$/.test(v))) subcommandSets.push(vals);
      },
      CallExpression(n) {
         // ['a', 'b'].includes(command)
         const c = n.callee;
         if (c.type !== 'MemberExpression' || memberText(c.property) !== 'includes' || c.object.type !== 'ArrayExpression') return;
         if (!n.arguments[0] || !/command|cmd|subcommand|mode|action/i.test(memberText(n.arguments[0]))) return;
         const vals = c.object.elements.map((e) => (isStr(e) ? e.value : null));
         if (vals.length >= 2 && vals.every((v) => v && /^[a-z][\w:-]*$/.test(v))) subcommandSets.push(vals);
      },
   });
   const commandProp = Object.keys(defaults).find((k) => /^(command|cmd|subcommand|mode|action)$/.test(k)) || null;
   const dispatchLits = new Set();
   walk.simple(ast, {
      BinaryExpression(n) {
         if (!/^===?$/.test(n.operator)) return;
         const l = memberText(n.left);
         if (/^(?:options|opts|config)\.(command|cmd|subcommand|mode|action)$/.test(l) || /^(command|cmd|subcommand|mode|action)$/.test(l)) {
            if (isStr(n.right)) dispatchLits.add(n.right.value);
         }
      },
   });
   let subcommands = [...dispatchLits];
   if (!subcommands.length) {
      if (subcommandSets[0]) subcommands = subcommandSets[0];
   }
   // make sure the dispatch set is complete if an array lists them
   for (const s of subcommandSets) if (subcommands.length && s.filter((v) => subcommands.includes(v)).length >= 2) subcommands = [...new Set([...subcommands, ...s])];
   out.subcommands = subcommands;
   // a bare positional (no subcommand): `process.argv[2]` consumed directly
   if (!subcommands.length && /process\.argv\[2\]/.test(src)) out.positional.push('<file>');

   out.options = [...flags.values()]
      .map((f) => ({
         flag: f.flag,
         aliases: f.aliases,
         prop: f.prop,
         type: f.type,
         default: f.prop && Object.prototype.hasOwnProperty.call(defaults, f.prop) ? defaults[f.prop] : undefined,
      }))
      .sort((a, b) => a.flag.localeCompare(b.flag));

   // ---- constants: top-level const X = path.join(…) etc.
   const render = makePathRenderer(ctx);
   for (const st of ast.body) {
      if (st.type !== 'VariableDeclaration') continue;
      for (const d of st.declarations) {
         if (d.id.type !== 'Identifier' || !d.init) continue;
         if (/^[A-Z][A-Z0-9_]*$/.test(d.id.name) || /path\.|os\.|process\.cwd/.test(src.slice(d.init.start, d.init.end))) {
            let v = render(d.init);
            if (d.id.name === 'ROOT') v = 'ROOT';
            if (!v.includes('<computed>') || /^[A-Z]/.test(d.id.name)) ctx.consts[d.id.name] = v;
         }
      }
   }
   // second pass so constants defined from earlier constants resolve
   for (const st of ast.body) {
      if (st.type !== 'VariableDeclaration') continue;
      for (const d of st.declarations) {
         if (d.id.type === 'Identifier' && d.init && ctx.consts[d.id.name] && /<[A-Z_]+>/.test(ctx.consts[d.id.name])) {
            ctx.consts[d.id.name] = render(d.init);
         }
      }
   }
   // a script whose own folder is the root (projects/, references/) uses __dirname directly
   if (!ctx.consts.ROOT) ctx.consts.ROOT = 'ROOT';

   // ---- sinks and the call graph, with the enclosing top-level function
   const enclosingFn = (anc) => {
      for (let i = anc.length - 1; i >= 0; i -= 1) {
         const a = anc[i];
         if (a.type === 'FunctionDeclaration' && a.id && fnByName.has(a.id.name) && fnByName.get(a.id.name).node === a) return a.id.name;
         if (/FunctionExpression|ArrowFunctionExpression/.test(a.type)) {
            for (const [name, f] of fnByName) if (f.node === a) return name;
         }
      }
      return '<top level>';
   };
   const topLevel = { name: '<top level>', line: 1, doc: '', calls: [], sinks: [], node: ast };
   const fnOf = (name) => fnByName.get(name) || topLevel;

   const pushSink = (anc, sink) => {
      const fnName = enclosingFn(anc);
      // local consts inside the function (const outFile = path.join(…)) make paths readable
      sink.fn = fnName;
      sink.when = gatingCondition(anc, ctx);
      fnOf(fnName).sinks.push(sink);
      out.sinks.push(sink);
   };

   // local const table per function: name -> rendered path (first assignment wins)
   const localConstsByFn = new Map();
   walk.ancestor(ast, {
      VariableDeclarator(d, _s, anc) {
         if (d.id.type !== 'Identifier' || !d.init) return;
         const fnName = enclosingFn(anc);
         if (fnName === '<top level>') return;
         const txt = src.slice(d.init.start, d.init.end);
         if (!/path\.|tmpdir|cwd\(|options\.|opts\.|`/.test(txt)) return;
         if (!localConstsByFn.has(fnName)) localConstsByFn.set(fnName, {});
         const table = localConstsByFn.get(fnName);
         if (table[d.id.name]) return;
         ctx.localConsts = table;
         const v = render(d.init);
         delete ctx.localConsts;
         if (!/^<computed>$/.test(v)) table[d.id.name] = v;
      },
   });
   const renderIn = (fnName, node) => {
      ctx.localConsts = localConstsByFn.get(fnName) || {};
      const v = render(node);
      delete ctx.localConsts;
      return v;
   };

   walk.ancestor(ast, {
      CallExpression(n, _s, anc) {
         const callee = n.callee;
         const text = memberText(callee);
         const method = callee.type === 'MemberExpression' ? memberText(callee.property) : text;
         const receiver = callee.type === 'MemberExpression' ? memberText(callee.object) : '';
         const fnName = enclosingFn(anc);
         const line = n.loc.start.line;

         // call graph between top-level functions
         if (callee.type === 'Identifier' && fnByName.has(callee.name) && callee.name !== fnName) {
            const f = fnOf(fnName);
            if (!f.calls.some((c) => c.name === callee.name)) {
               f.calls.push({ name: callee.name, line, when: gatingCondition(anc, ctx), args: n.arguments.map((a) => renderIn(fnName, a)) });
            }
         }

         // fs.*
         const kind = fsKind(method);
         if (kind && /^(fs|fsp|fsPromises|fs\.promises|promises)$/.test(receiver)) {
            const target = n.arguments[0] ? renderIn(fnName, n.arguments[0]) : '<computed>';
            const second = kind === 'write' && /copy|rename|cp/.test(method) && n.arguments[1] ? renderIn(fnName, n.arguments[1]) : null;
            pushSink(anc, {
               kind: PROBE.has(method) ? 'probe' : kind,
               op: method,
               target: (second || target) + (/mkdtemp/.test(method) ? '*' : ''),
               source: second ? target : undefined,
               folder: FS_LISTISH.has(method) || /Dir$|dir$/.test(method),
               line,
            });
            return;
         }
         // child processes
         if (EXEC.has(method) && (receiver === '' || /child_process|cp|childProcess/.test(receiver))) {
            const a0 = n.arguments[0];
            let program = a0 ? renderIn(fnName, a0) : '<computed>';
            if (a0 && a0.type === 'MemberExpression' && memberText(a0) === 'process.execPath') program = 'node';
            if (method === 'execSync' || method === 'exec') program = program.split(/\s+/)[0];
            const a1 = n.arguments[1];
            let argv = [];
            if (a1 && a1.type === 'ArrayExpression') argv = a1.elements.slice(0, 2).map((e) => (e ? renderIn(fnName, e) : '…'));
            pushSink(anc, { kind: 'exec', op: method, target: program, args: argv, line });
            return;
         }
         // servers, browsers, network
         if (/^(httpServer|http-server|hs)\.createServer$/.test(text) || text === 'http.createServer' || text === 'https.createServer' || method === 'listen') {
            if (method === 'listen') {
               const port = n.arguments[0] ? renderIn(fnName, n.arguments[0]) : '<computed>';
               const label = port === '0' ? 'local HTTP server, free port' : /^<computed>$/.test(port) ? 'local HTTP server' : `local HTTP server :${port}`;
               pushSink(anc, { kind: 'serve', op: text, target: label, line });
            }
            return;
         }
         if (/^(chromium|firefox|webkit|playwright\.\w+|browserType)\.(launch|launchPersistentContext|connect)$/.test(text)) {
            pushSink(anc, { kind: 'browser', op: text, target: 'Chromium', line });
            return;
         }
         if (text === 'fetch' || /^(https?|axios|got)\.(get|post|request)$/.test(text)) {
            pushSink(anc, { kind: 'network', op: text, target: n.arguments[0] ? renderIn(fnName, n.arguments[0]) : '<computed>', line });
            return;
         }
         if (text === 'process.exit' && n.arguments[0] && n.arguments[0].type === 'Literal' && n.arguments[0].value !== 0) {
            const f = fnOf(fnName);
            f.exits = (f.exits || 0) + 1;
         }
      },
   });

   // ---- flow: the main function (main / run / IIFE / top level) and its direct callees
   let mainName = ['main', 'run', 'cli', 'start'].find((n) => fnByName.has(n)) || null;
   const isEntryCall = (st) => {
      const e = st.type === 'ExpressionStatement' ? st.expression : null;
      if (!e) return null;
      const inner = e.type === 'AwaitExpression' ? e.argument : e;
      const c = inner.type === 'CallExpression' ? inner : null;
      if (!c) return null;
      // main().catch(...)  →  callee.object is main()
      let callee = c.callee;
      if (callee.type === 'MemberExpression' && callee.object.type === 'CallExpression') callee = callee.object.callee;
      if (callee.type === 'Identifier' && fnByName.has(callee.name)) return callee.name;
      return null;
   };
   for (const st of ast.body) {
      const n = isEntryCall(st);
      if (n && (!mainName || n === mainName)) mainName = n;
      // if (require.main === module) main(...)
      if (st.type === 'IfStatement' && st.consequent) {
         const body = st.consequent.type === 'BlockStatement' ? st.consequent.body : [st.consequent];
         for (const b of body) { const m = isEntryCall(b); if (m) mainName = m; }
      }
   }
   const mainFn = mainName ? fnByName.get(mainName) : topLevel;
   out.main = mainName || '<top level>';

   // functions appearing in the flow: main's callees that do something (have transitive sinks or callees with sinks)
   const bind = (text, bindings) => String(text).replace(/<(\w+)>/g, (m, v) => (bindings[v] != null ? bindings[v] : m));
   const transitiveSinks = (name, seen = new Set(), bindings = {}) => {
      if (seen.has(name)) return [];
      seen.add(name);
      const f = fnOf(name);
      let acc = f.sinks.map((s) => ({ ...s, target: bind(s.target, bindings), source: s.source ? bind(s.source, bindings) : undefined }));
      for (const c of f.calls) {
         const callee = fnOf(c.name);
         const next = {};
         (callee.params || []).forEach((p, i) => { if (p && c.args && c.args[i] != null) next[p] = bind(c.args[i], bindings); });
         acc = acc.concat(transitiveSinks(c.name, seen, next));
      }
      return acc;
   };
   const transitiveCalls = (name, seen = new Set()) => {
      if (seen.has(name)) return seen;
      seen.add(name);
      for (const c of fnOf(name).calls) transitiveCalls(c.name, seen);
      return seen;
   };

   const level1 = mainFn.calls.filter((c) => c.name !== mainName);
   const shownNames = new Set(level1.map((c) => c.name));
   const steps = [];
   for (const c of level1) {
      const f = fnOf(c.name);
      // sinks of this function and of helpers that are not themselves drawn
      const seen = new Set([mainName, ...shownNames].filter(Boolean));
      seen.delete(c.name);
      const bindings = {};
      (f.params || []).forEach((p, i) => { if (p && c.args && c.args[i] != null) bindings[p] = c.args[i]; });
      const sinks = transitiveSinks(c.name, seen, bindings);
      const helpers = [...transitiveCalls(c.name, new Set([mainName, ...shownNames].filter((n) => n !== c.name)))].filter((n) => n !== c.name);
      const isOptionParser = f.name === 'parseArgs' || /parse(Args|Argv|Options)|usage/i.test(f.name);
      if (!sinks.length && !isOptionParser && !/parse/i.test(f.name)) continue; // pure helpers are not drawn
      steps.push({
         fn: c.name,
         line: f.line,
         doc: f.doc || headerSubdocs[c.name] || headerSubdocs[(c.when || '').split(' = ').pop()] || '',
         when: c.when,
         role: isOptionParser ? 'options' : 'step',
         helpers,
         sinks: dedupeSinks(sinks),
      });
   }
   // sinks directly in main (or at top level) that no step owns
   const direct = dedupeSinks(mainFn.sinks);
   out.flow = { main: out.main, steps, direct };
   out.functions = [...fnByName.values()].map((f) => ({ name: f.name, line: f.line, doc: f.doc, calls: f.calls.map((c) => c.name), sinks: f.sinks.length }));
   return out;
}

function dedupeSinks(sinks) {
   const seen = new Map();
   for (const s of sinks) {
      const key = `${s.kind}|${s.target}|${s.when || ''}`;
      if (!seen.has(key)) seen.set(key, { ...s, lines: [s.line] });
      else seen.get(key).lines.push(s.line);
   }
   const list = [...seen.values()].map(({ line, ...rest }) => rest);
   const written = new Set(list.filter((s) => s.kind === 'write' && !s.target.endsWith('/..')).map((s) => s.target));
   return list.filter((s) => !(s.folder && s.kind === 'write' && s.target.endsWith('/..') && written.has(s.target.slice(0, -3))));
}

// ---------------------------------------------------------------------------
// Per-script analysis (Python) — regex level, enough for the one script here
// ---------------------------------------------------------------------------

function analyzePy(rel) {
   const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
   const docm = src.match(/^(?:#![^\n]*\n)?(?:#[^\n]*\n)*\s*(?:"""|''')([\s\S]*?)(?:"""|''')/);
   const header = docm ? docm[1].trim() : '';
   const summary = header ? commentSummary(`/* ${header} */`) : '';
   const out = { id: rel, lang: 'py', loc: src.split('\n').length, summary, header, options: [], subcommands: [], positional: [], functions: [], sinks: [], requires: [], main: 'main' };
   for (const m of src.matchAll(/add_argument\(\s*["'](-[-\w]+)["'](?:,\s*["'](-[-\w]+)["'])?/g)) {
      const long = [m[1], m[2]].find((x) => x && x.startsWith('--')) || m[1];
      out.options.push({ flag: long, aliases: [m[1], m[2]].filter((x) => x && x !== long), type: 'value' });
   }
   if (/sys\.argv\[1\]/.test(src)) out.positional.push('<arg>');
   const consts = { ROOT: 'ROOT', __dir: path.dirname(rel) };
   for (const m of src.matchAll(/^([A-Z][A-Z0-9_]*)\s*=\s*((?:os\.path\.|pathlib\.Path\(|Path\()[^\n]*)$/gm)) {
      consts[m[1]] = pyPath(m[2], consts);
   }
   const fnOfLine = (idx) => {
      const before = src.slice(0, idx);
      const m = [...before.matchAll(/^def\s+(\w+)\s*\(/gm)].pop();
      return m ? m[1] : '<top level>';
   };
   const defs = [...src.matchAll(/^def\s+(\w+)\s*\([^)]*\):\s*\n(?:\s+(?:"""|''')([\s\S]*?)(?:"""|'''))?/gm)];
   for (const d of defs) {
      out.functions.push({ name: d[1], line: src.slice(0, d.index).split('\n').length, doc: d[2] ? commentSummary(`/* ${d[2]} */`) : '', calls: [], sinks: 0 });
   }
   for (const m of src.matchAll(/^\s+([a-z_]\w*)\s*=\s*(os\.path\.join\((?:[^()]|\([^()]*\))*\))\s*$/gm)) {
      if (!consts[m[1]]) consts[m[1]] = pyPath(m[2], consts);
   }
   for (const m of src.matchAll(/\bopen\(\s*((?:[^(),]|\((?:[^()]|\([^()]*\))*\))+?)\s*(?:,\s*["'](\w+)["'])?\s*(?:,[^)]*)?\)/g)) {
      const mode = m[2] || 'r';
      const kind = /[wa]/.test(mode) ? 'write' : 'read';
      const fn = fnOfLine(m.index);
      const sink = { kind, op: `open(${mode})`, target: pyPath(m[1], consts), folder: false, fn, when: null, line: src.slice(0, m.index).split('\n').length };
      out.sinks.push(sink);
      const f = out.functions.find((x) => x.name === fn);
      if (f) f.sinks += 1;
   }
   for (const m of src.matchAll(/(?:\(([^()\n]+)\)|\b([\w.]+))\.(write_text|write_bytes|read_text|read_bytes|mkdir|unlink|rmdir)\(/g)) {
      const op = m[3];
      const kind = /^write|mkdir/.test(op) ? 'write' : /unlink|rmdir/.test(op) ? 'delete' : 'read';
      const fn = fnOfLine(m.index);
      out.sinks.push({ kind, op, target: pyPath(m[1] || m[2], consts), folder: /mkdir|rmdir/.test(op), fn, when: null, line: src.slice(0, m.index).split('\n').length });
   }
   for (const m of src.matchAll(/svg2png\(([^;]*?write_to\s*=\s*(str\([^)]*\)|[^,)\n]+))/g)) {
      const fn = fnOfLine(m.index);
      out.sinks.push({ kind: 'write', op: 'cairosvg.svg2png', target: pyPath(m[2], consts), folder: false, fn, when: null, line: src.slice(0, m.index).split('\n').length });
   }
   for (const m of src.matchAll(/\b(?:shutil\.(copy\w*|rmtree)|os\.(makedirs|mkdir|remove|unlink|listdir)|subprocess\.(run|check_output|Popen|call))\(\s*([^,)]+)/g)) {
      const op = m[1] || m[2] || m[3];
      const kind = m[3] ? 'exec' : /rm|remove|unlink/.test(op) ? 'delete' : /listdir/.test(op) ? 'read' : 'write';
      const fn = fnOfLine(m.index);
      out.sinks.push({ kind, op, target: pyPath(m[4], consts), folder: /dir|tree/.test(op), fn, when: null, line: src.slice(0, m.index).split('\n').length });
   }
   // flow: main's direct callees in source order, Python style (`def main` and the calls inside it)
   const mainBody = src.match(/^def\s+main\s*\([^)]*\):\n([\s\S]*?)(?=^\S)/m);
   const steps = [];
   if (mainBody) {
      const names = [...new Set([...mainBody[1].matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/g)].map((x) => x[1]))].filter((n) => out.functions.some((f) => f.name === n && n !== 'main'));
      for (const n of names) {
         const f = out.functions.find((x) => x.name === n);
         const sinks = out.sinks.filter((s) => s.fn === n);
         if (!sinks.length) continue;
         steps.push({ fn: n, line: f.line, doc: f.doc, when: null, role: 'step', helpers: [], sinks: dedupeSinks(sinks) });
      }
   }
   out.flow = { main: mainBody ? 'main' : '<top level>', steps, direct: dedupeSinks(out.sinks.filter((s) => s.fn === 'main' || s.fn === '<top level>')) };
   return out;
}

function pyPath(expr, consts) {
   expr = expr.trim()
      .replace(/^str\((.*)\)$/, '$1')
      .replace(/(?:pathlib\.)?Path\(__file__\)\.resolve\(\)\.parents\[1\]/g, 'ROOT')
      .replace(/(?:pathlib\.)?Path\(__file__\)\.resolve\(\)\.parent\.parent/g, 'ROOT')
      .replace(/(?:pathlib\.)?Path\(__file__\)\.resolve\(\)\.parent/g, `ROOT/${consts.__dir || 'scripts-dev'}`)
      .replace(/\bf(["'])(.*?)\1/g, (m, q, body) => q + body.replace(/\{([^}:]+)[^}]*\}/g, '<$1>') + q)
      .replace(/os\.path\.dirname\(os\.path\.abspath\(__file__\)\)/g, '<thisdir>')
      .replace(/os\.path\.abspath\(__file__\)/g, '<this script>')
      .replace(/os\.path\.dirname\(<thisdir>\)/g, '<thisdir>/..');
   if (/ \/ /.test(expr) && !/^os\.path/.test(expr)) {
      // pathlib: A / "b" / f"c-{x}.svg"
      return normalize(expr.split(/\s*\/\s*/).map((p) => {
         p = p.trim().replace(/^\(|\)$/g, '');
         if (/^["']/.test(p)) return p.replace(/^["']|["']$/g, '');
         if (p === 'ROOT') return 'ROOT';
         if (consts[p]) return consts[p];
         if (/^(?:pathlib\.)?Path\((\w+)\)$/.test(p)) return `<${p.match(/\((\w+)\)/)[1]}>`;
         return `<${p}>`;
      }).join('/'));
   }
   if (/^<thisdir>(\/\.\.)*$/.test(expr)) return normalize(expr.replace(/<thisdir>/, `ROOT/${consts.__dir || 'scripts-dev'}`));
   const inner = expr.match(/^os\.path\.join\(([\s\S]*)\)$/);
   const parts = (inner ? inner[1] : expr).split(/\s*,\s*/).map((p) => {
      p = p.trim();
      if (/^["']/.test(p)) return p.replace(/^["']|["']$/g, '');
      if (consts[p]) return consts[p];
      if (p === '__file__') return '<this script>';
      return `<${p}>`;
   });
   return normalize(parts.join('/').replace(/<thisdir>/g, `ROOT/${consts.__dir || 'scripts-dev'}`));
}

// ---------------------------------------------------------------------------
// Mermaid
// ---------------------------------------------------------------------------

function esc(s) {
   return String(s)
      .replace(/"/g, '#quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\|/g, '#124;')
      .replace(/\[/g, '#91;')
      .replace(/\]/g, '#93;');
}

function sinkLabel(s) {
   const verb = { read: 'read', write: 'write', delete: 'delete', probe: 'check', exec: 'run', serve: 'serve', browser: 'open', network: 'fetch' }[s.kind] || s.kind;
   let t = s.target;
   if (s.kind === 'exec' && s.args && s.args.length) t = `${t} ${s.args.join(' ')}${s.args.length >= 2 ? ' …' : ''}`;
   return `${verb}: ${t}`;
}

function sinkShape(s, label) {
   const l = `"${esc(label)}"`;
   switch (s.kind) {
      case 'read': return s.folder ? `[(${l})]` : `[\\${l}\\]`;
      case 'probe': return `[\\${l}\\]`;
      case 'write': return s.folder ? `[(${l})]` : `[/${l}/]`;
      case 'delete': return `[/${l}\\]`;
      case 'exec': return `{{${l}}}`;
      case 'serve': return `([${l}])`;
      case 'browser': return `([${l}])`;
      case 'network': return `>${l}]`;
      default: return `[${l}]`;
   }
}

function mermaidFor(script) {
   const lines = ['flowchart LR'];
   let id = 0;
   const nid = () => `n${(id += 1)}`;
   const classes = { read: [], write: [], delete: [], exec: [], serve: [], browser: [], network: [], probe: [], fn: [], opt: [], dec: [] };

   const npm = (script.npm || []).map((n) => `npm run ${n.name}${n.args ? ' ' + n.args : ''}`);
   const invoke = script.lang === 'py' ? `python3 ${script.id}` : `node ${script.id}`;
   const nOpt = script.options.length;
   const optText = nOpt > 6
      ? `${nOpt} options (table below)`
      : nOpt ? script.options.map((o) => o.flag + (o.type === 'boolean' ? '' : ' <v>')).join('  ')
      : script.positional.length ? script.positional.join(' ') : '(no options)';
   const head = nid();
   lines.push(`  ${head}["${esc(invoke)}${npm.length ? '<br/><i>' + esc(npm.join(' · ')) + '</i>' : ''}<br/>${esc(optText).replace(/&lt;br\/&gt;/g, '<br/>')}"]`);
   classes.opt.push(head);

   let from = head;
   const usesDispatch = (script.flow && script.flow.steps || []).some((st) => /(?:command|cmd|subcommand|mode|action) = /.test(st.when || ''));
   if (script.subcommands.length && usesDispatch) {
      const d = nid();
      lines.push(`  ${d}{"subcommand"}`);
      lines.push(`  ${head} --> ${d}`);
      classes.dec.push(d);
      from = d;
   }

   const flow = script.flow || { steps: [], direct: [] };
   const subcommandOf = (when) => {
      if (!when) return null;
      const m = when.match(/(?:command|cmd|subcommand|mode|action) = (\S+)/);
      return m ? m[1] : null;
   };

   const drawSinks = (parent, sinks) => {
      for (const s of sinks) {
         if (s.kind === 'probe' && /<[^>]+>/.test(s.target)) continue; // a guard on a run-time value says nothing about the flow
         const sid = nid();
         lines.push(`  ${sid}${sinkShape(s, sinkLabel(s))}`);
         const edge = s.when ? `-- "${esc(s.when)}" -->` : '-->';
         lines.push(`  ${parent} ${edge} ${sid}`);
         classes[s.kind] && classes[s.kind].push(sid);
      }
   };

   for (const step of flow.steps) {
      const sid = nid();
      const label = step.role === 'options' ? `${step.fn}()<br/><i>${esc(step.doc || 'read the command line')}</i>` : `${step.fn}()${step.doc ? '<br/><i>' + esc(step.doc) + '</i>' : ''}`;
      lines.push(`  ${sid}["${label}"]`);
      classes.fn.push(sid);
      const sub = subcommandOf(step.when);
      if (sub) lines.push(`  ${from} -- "${esc(sub)}" --> ${sid}`);
      else if (step.when) lines.push(`  ${head} -- "${esc(step.when)}" --> ${sid}`);
      else lines.push(`  ${head} --> ${sid}`);
      drawSinks(sid, step.sinks);
   }
   if (flow.direct && flow.direct.length) drawSinks(head, flow.direct);

   const styles = {
      opt: 'fill:#2c2318,stroke:#f3c747,color:#f6ece0',
      dec: 'fill:#211a12,stroke:#fd5503,color:#f6ece0',
      fn: 'fill:#211a12,stroke:#ffe7a8,color:#f6ece0',
      read: 'fill:#14100c,stroke:#7fe3b0,color:#b9a892',
      probe: 'fill:#14100c,stroke:#7fe3b0,color:#8a7b6a,stroke-dasharray:4 3',
      write: 'fill:#14100c,stroke:#f3c747,color:#f6ece0',
      delete: 'fill:#14100c,stroke:#ff5b5b,color:#f6ece0',
      exec: 'fill:#14100c,stroke:#fd5503,color:#f6ece0',
      serve: 'fill:#14100c,stroke:#fd5503,color:#f6ece0,stroke-dasharray:4 3',
      browser: 'fill:#14100c,stroke:#fd5503,color:#f6ece0,stroke-dasharray:4 3',
      network: 'fill:#14100c,stroke:#fd5503,color:#f6ece0',
   };
   for (const [k, ids] of Object.entries(classes)) {
      if (!ids.length || !styles[k]) continue;
      lines.push(`  classDef ${k} ${styles[k]}`);
      lines.push(`  class ${ids.join(',')} ${k}`);
   }
   return lines.join('\n');
}

// ---------------------------------------------------------------------------

function main() {
   const argv = process.argv.slice(2);
   const options = { out: 'codemap/codemap.json', mmdDir: 'codemap/mmd', only: null };
   for (let i = 0; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === '--out') options.out = argv[++i];
      else if (arg === '--mmd-dir') options.mmdDir = argv[++i];
      else if (arg === '--only') options.only = argv[++i];
      else if (arg === '--help' || arg === '-h') { process.stdout.write('Usage: node scripts-dev/build-codemap.js [--out codemap/codemap.json] [--mmd-dir codemap/mmd] [--only <substring>]\n'); process.exit(0); }
      else throw new Error(`Unknown option: ${arg}`);
   }
   const outPath = path.resolve(ROOT, options.out);
   const mmdDir = path.resolve(ROOT, options.mmdDir);
   const only = options.only;

   const entries = findEntries();
   const scripts = [];
   for (const [rel, meta] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
      if (only && !rel.includes(only)) continue;
      const analysis = rel.endsWith('.py') ? analyzePy(rel) : analyzeJs(rel);
      analysis.npm = meta.npm;
      analysis.mermaid = mermaidFor(analysis);
      scripts.push(analysis);
   }

   const unresolved = scripts.reduce((n, s) => n + (s.sinks || []).filter((k) => /<computed>/.test(k.target)).length, 0);
   const codemap = {
      generatedAt: new Date().toISOString(),
      root: path.basename(ROOT),
      legend: {
         'ROOT': 'repository root',
         '$CWD': 'the directory the command is run from',
         '$TMPDIR': 'the system temporary directory',
         '← --flag': 'a path supplied by that option',
         '<computed>': 'built from data at run time; not resolvable statically',
      },
      scripts,
   };

   fs.mkdirSync(path.dirname(outPath), { recursive: true });
   fs.writeFileSync(outPath, JSON.stringify(codemap, null, 2));
   fs.mkdirSync(mmdDir, { recursive: true });
   for (const s of scripts) {
      fs.writeFileSync(path.join(mmdDir, `${path.basename(s.id).replace(/\.\w+$/, '')}.mmd`), `%% generated by scripts-dev/build-codemap.js from ${s.id}\n${s.mermaid}\n`);
   }
   const parseErrors = scripts.filter((s) => s.parseError);
   console.log(`codemap: ${scripts.length} scripts, ${scripts.reduce((n, s) => n + (s.sinks || []).length, 0)} side effects (${unresolved} unresolved paths) -> ${path.relative(ROOT, outPath)}, ${path.relative(ROOT, mmdDir)}/`);
   for (const s of parseErrors) console.warn(`  parse error in ${s.id}: ${s.parseError}`);
}

main();
