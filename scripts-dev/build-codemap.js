#!/usr/bin/env node
/**
 * build-codemap.js — static architecture extractor for the Ghostmaxxing webapp.
 *
 * Produces codemap.json: modules, import edges, event-bus edges, entry points.
 * Ignores scripts-dev/ and scripts/vendor/ by design.
 *
 * Usage: node scripts-dev/build-codemap.js [--out codemap.json]
 */

const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const walk = require('acorn-walk');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const BUS_RECEIVERS = new Set(['gstmxxEvents', 'events', 'bus', 'gstmxxEvents']);

/** Flatten a member expression to dotted text, e.g. state.gstmxxEvents */
function memberText(node) {
   if (!node) return '';
   if (node.type === 'Identifier') return node.name;
   if (node.type === 'ThisExpression') return 'this';
   if (node.type === 'MemberExpression' && !node.computed) {
      return `${memberText(node.object)}.${memberText(node.property)}`;
   }
   return '?';
}

/** Is this call receiver the in-app event bus rather than a DOM node? */
function isBus(receiver) {
   const tail = receiver.split('.').pop();
   if (receiver === 'window' || receiver === 'document') return false;
   return BUS_RECEIVERS.has(tail) || /Events$/.test(tail);
}

function firstStringArg(args) {
   const a = args && args[0];
   return a && a.type === 'Literal' && typeof a.value === 'string' ? a.value : null;
}

/** CustomEvent name from `new CustomEvent('x', ...)` */
function customEventName(arg) {
   if (arg && arg.type === 'NewExpression' && memberText(arg.callee) === 'CustomEvent') {
      return firstStringArg(arg.arguments);
   }
   if (arg && arg.type === 'Literal' && typeof arg.value === 'string') return arg.value;
   return null;
}

function analyzeModule(file) {
   const rel = path.relative(SCRIPTS, file).replace(/\\/g, '/');
   const src = fs.readFileSync(file, 'utf8');
   const out = {
      id: rel,
      loc: src.split('\n').length,
      imports: [],
      dynamicImports: [],
      exports: [],
      dispatches: [],
      listens: [],
      domListeners: [],
      globals: [],
   };

   let ast;
   try {
      ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
   } catch (err) {
      out.parseError = err.message;
      return out;
   }

   walk.simple(ast, {
      ImportDeclaration(n) {
         const spec = n.source.value;
         if (!spec.startsWith('.')) return;
         out.imports.push({
            target: path.normalize(path.join(path.dirname(rel), spec)).replace(/\\/g, '/'),
            symbols: n.specifiers.map((s) => s.local.name),
            line: n.loc.start.line,
         });
      },
      ExportNamedDeclaration(n) {
         if (n.declaration) {
            const d = n.declaration;
            if (d.type === 'FunctionDeclaration' && d.id) {
               out.exports.push({ name: d.id.name, kind: 'function', line: d.loc.start.line });
            } else if (d.type === 'VariableDeclaration') {
               for (const decl of d.declarations) {
                  if (decl.id.type === 'Identifier') {
                     out.exports.push({ name: decl.id.name, kind: 'const', line: d.loc.start.line });
                  }
               }
            } else if (d.type === 'ClassDeclaration' && d.id) {
               out.exports.push({ name: d.id.name, kind: 'class', line: d.loc.start.line });
            }
         }
         for (const s of n.specifiers || []) {
            out.exports.push({ name: s.exported.name, kind: 'reexport', line: n.loc.start.line });
         }
      },
      ExportDefaultDeclaration(n) {
         out.exports.push({ name: 'default', kind: 'default', line: n.loc.start.line });
      },
      ImportExpression(n) {
         const v = n.source.type === 'Literal' ? n.source.value : '<dynamic>';
         out.dynamicImports.push({ target: v, line: n.loc.start.line });
      },
      CallExpression(n) {
         if (n.callee.type !== 'MemberExpression') return;
         const method = memberText(n.callee.property);
         const receiver = memberText(n.callee.object);
         const line = n.loc.start.line;

         if (method === 'dispatchEvent') {
            const name = customEventName(n.arguments[0]);
            if (!name) return;
            const target = receiver === 'window' || receiver === 'document' ? receiver : 'bus';
            out.dispatches.push({ event: name, via: target, receiver, line });
         }

         if (method === 'addEventListener') {
            const name = firstStringArg(n.arguments);
            if (!name) return;
            if (isBus(receiver)) {
               out.listens.push({ event: name, receiver, line });
            } else if (receiver === 'window' || receiver === 'document') {
               // window-level lifecycle events are part of the app protocol
               out.listens.push({ event: name, receiver, line, scope: receiver });
            } else {
               out.domListeners.push({ event: name, receiver, line });
            }
         }
      },
      AssignmentExpression(n) {
         const lhs = memberText(n.left);
         if (/^window\.[A-Za-z_$][\w$]*$/.test(lhs)) {
            out.globals.push({ name: lhs.slice(7), line: n.loc.start.line });
         }
      },
   });

   return out;
}

/** Parse HTML pages for <script src> entry points. */
function findEntryPoints() {
   const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
   const entries = [];
   for (const page of pages) {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      const scripts = [...html.matchAll(/<script([^>]*)src=["']([^"']+)["']/g)].map((m) => ({
         src: m[2],
         module: /type=["']module["']/.test(m[1]),
      }));
      const own = scripts
         .filter((s) => s.src.startsWith('scripts/') && !s.src.includes('/vendor/'))
         .map((s) => ({ id: s.src.replace(/^scripts\//, ''), module: s.module }));
      const vendor = scripts.filter((s) => s.src.includes('/vendor/')).map((s) => s.src);
      // page-to-page navigation, ignoring commented-out blocks
      const live = html.replace(/<!--[\s\S]*?-->/g, '');
      const links = [
         ...new Set(
            [...live.matchAll(/href=["']([^"']+\.html)["']/g)]
               .map((m) => m[1].replace(/^\.?\//, ''))
               .filter((h) => !h.startsWith('http') && pages.includes(h))
         ),
      ];
      entries.push({ page, scripts: own, vendor, links });
   }
   return entries;
}

function main() {
   const files = fs
      .readdirSync(SCRIPTS)
      .filter((f) => f.endsWith('.js'))
      .map((f) => path.join(SCRIPTS, f));

   const modules = files.map(analyzeModule);
   const entries = findEntryPoints();

   // Reachability: which pages can reach which modules (via script tags + imports)
   const byId = new Map(modules.map((m) => [m.id, m]));
   for (const e of entries) {
      const seen = new Set();
      const stack = e.scripts.map((s) => s.id);
      while (stack.length) {
         const id = stack.pop();
         if (seen.has(id) || !byId.has(id)) continue;
         seen.add(id);
         for (const imp of byId.get(id).imports) stack.push(imp.target);
      }
      e.reachable = [...seen].sort();
   }
   for (const m of modules) {
      m.pages = entries.filter((e) => e.reachable.includes(m.id)).map((e) => e.page);
   }

   // Event topology
   const events = new Map();
   const bump = (name, key, mod, line) => {
      if (!events.has(name)) events.set(name, { name, emitters: [], listeners: [] });
      events.get(name)[key].push({ module: mod, line });
   };
   for (const m of modules) {
      for (const d of m.dispatches) bump(d.event, 'emitters', m.id, d.line);
      for (const l of m.listens) bump(l.event, 'listeners', m.id, l.line);
   }

   const codemap = {
      generatedAt: new Date().toISOString(),
      entries,
      modules,
      events: [...events.values()].sort((a, b) => a.name.localeCompare(b.name)),
   };

   const outArg = process.argv.indexOf('--out');
   const outPath = outArg > -1 ? process.argv[outArg + 1] : path.join(ROOT, 'codemap', 'codemap.json');
   fs.writeFileSync(outPath, JSON.stringify(codemap, null, 2));
   console.log(
      `codemap: ${modules.length} modules, ${codemap.events.length} events, ${entries.length} pages -> ${outPath}`
   );
}

main();
