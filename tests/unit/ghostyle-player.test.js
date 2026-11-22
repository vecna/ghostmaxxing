import { describe, expect, it, vi } from 'vitest';
import { containedFrame } from '../../lab-js/ghostyle-player/brush.js';
import { ghostyleDefaults, loadCatalog } from '../../lab-js/ghostyle-player/catalog.js';
import { indentJavaScript, readJavaScript } from '../../lab-js/ghostyle-player/editor.js';

describe('Ghostyle Player data', () => {
   it('resolves bundled names and module paths from the catalog location', async () => {
      const request = vi.fn(async () => ({
         ok: true,
         json: async () => [{ id: 'demo', name: 'Demo', url: 'ghostyles/demo.js' }],
      }));
      const manifest = new URL('https://example.test/nested/ghostyles.json');
      expect(await loadCatalog(manifest, request)).toEqual([
         { id: 'demo', name: 'Demo', url: 'https://example.test/nested/ghostyles/demo.js' },
      ]);
   });

   it('types UV defaults for existing modules and rejects source with no painter', () => {
      expect(ghostyleDefaults({
         paintUV() {},
         params: [
            { name: 'color', type: 'color', default: '#7af' },
            { name: 'alpha', type: 'range', default: 0.4 },
            { name: 'gap', type: 'bool', default: true },
         ],
      })).toEqual({ color: [119, 170, 255], alpha: 0.4, gap: true });
      expect(() => ghostyleDefaults({})).toThrow('Export onDraw or paintUV');
   });

   it('keeps brush coordinates inside the same letterboxed camera image', () => {
      expect(containedFrame({ left: 10, top: 20, width: 400, height: 300 }, 800, 400)).toEqual({
         left: 10, top: 70, width: 400, height: 200, scale: 0.5,
      });
      expect(containedFrame({ left: 10, top: 20, width: 300, height: 400 }, 400, 800)).toEqual({
         left: 60, top: 20, width: 200, height: 400, scale: 0.5,
      });
   });
});


describe('Ghostyle editor', () => {
   it('classifies comments, keywords, literals and numbers in an unfinished draft', () => {
      const source = '// test\nexport const color = "#f00"; const n = 2; "';
      const result = readJavaScript(source);
      expect(result.complete).toBe(false);
      const styled = result.tokens.filter(token => token.style);
      expect(styled.map(token => [source.slice(token.start, token.end), token.style])).toEqual([
         ['// test', 'comment'],
         ['export', 'keyword'],
         ['const', 'keyword'],
         ['"#f00"', 'string'],
         ['const', 'keyword'],
         ['2', 'number'],
      ]);
   });

   it('indents delimiters while preserving multiline template and comment content', () => {
      const source = [
         'export function onDraw(ctx) {',
         'const sample = `first',
         '  second ${ctx.canvas.width}`;',
         '/* {',
         ' literal text */',
         'if (sample) {',
         'ctx.fillRect(',
         '0, 0, 10, 10',
         ');',
         '}',
         '}',
         '',
      ].join('\r\n');
      expect(indentJavaScript(source)).toBe([
         'export function onDraw(ctx) {',
         '   const sample = `first',
         '  second ${ctx.canvas.width}`;',
         '   /* {',
         ' literal text */',
         '   if (sample) {',
         '      ctx.fillRect(',
         '         0, 0, 10, 10',
         '      );',
         '   }',
         '}',
         '',
      ].join('\r\n'));
   });
});
