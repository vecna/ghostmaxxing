import { expect, test } from '@playwright/test';

test('exported bands follow the lips and leave the moving eyes clear', async ({ page }) => {
   await page.goto('/data/face_canonical_uv.json');
   const result = await page.evaluate(async () => {
      const core = await import('/scripts-dev/ghostyle-fuzz/fuzz-core.mjs');
      const { compileSource } = await import('/lab-js/ghostyle-player/catalog.js');
      const { createUvRenderer } = await import('/lab-js/ghostyle3d-uv-renderer.js');
      const atlas = await fetch('/data/face_canonical_uv.json').then(response => response.json());
      const size = 400;
      const closed = atlas.uv.map(([u, v]) => [u, 1 - v, 0]);
      const rightIris = [[127, 151], [131, 151], [127, 155], [123, 151], [127, 147]];
      rightIris.forEach(([x, y], i) => { closed[468 + i] = [x / size, y / size, 0]; });
      const anchor = { ...atlas, meshPx: core.meshToPx(closed, size, size), pxPerCm: 25 };
      const recipe = core.normaliseRecipe({ name: 'expressions', count: 2, lengthCm: 5, widthCm: 3, opacity: 1 });
      const palette = { colours: [{ hex: '#000000', xterm: 16, deltaL: 60 }] };
      // Horizontal strokes centred on the inner upper lip and right lower eyelid.
      const draws = [13.5 / 468, 0, 0, 145.5 / 468, 0, 0];
      const { strokes, coverage } = core.drawStrokes(() => draws.shift(), anchor, recipe, palette.colours);
      const source = core.buildGhostyleSource({ recipe, recipeId: core.trialRecipeId(recipe), seed: 1, strokes, palette, date: '2026-11-23' });
      const ghostyle = await compileSource(source);
      const renderer = createUvRenderer({ atlas });
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const render = (mesh) => {
         ctx.clearRect(0, 0, size, size);
         renderer.render(ghostyle, ctx, mesh.map(([x, y, z]) => ({ x, y, z })));
      };
      const alpha = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];

      render(closed);
      const closedLips = [alpha(205, 273), alpha(205, 280)];
      const eye = [alpha(127, 151), alpha(146, 153)];
      const eyelid = alpha(136, 168);

      // Move the lower jaw down by 32 px and the iris sideways inside the open eye.
      const open = closed.map(([x, y, z], i) => {
         if (i >= 468 && i <= 472) return [x + 0.045, y, z];
         return [x, y > 0.694 ? y + 0.08 : y, z];
      });
      render(open);
      const openLips = [alpha(205, 273), alpha(205, 312)];
      const insideMouth = alpha(205, 293);
      const movedIris = alpha(146, 153);

      // Bring both eyelid edges together. The lower eyelid's paint moves with it.
      const blink = open.map(([x, y, z], i) => [x, core.LANDMARK_SETS.rightEye.includes(i) ? 0.39 : y, z]);
      render(blink);
      const blinkEyelid = alpha(136, 159);

      return { closedLips, openLips, insideMouth, eye, movedIris, eyelid, blinkEyelid, coverage, fragments: strokes.map(s => s.uvPolygons.length) };
   });

   expect(result.fragments.every(count => count > 1)).toBe(true);
   expect(result.coverage).toBeGreaterThan(0);
   for (const alpha of [...result.closedLips, ...result.openLips, result.eyelid, result.blinkEyelid]) {
      expect(alpha).toBeGreaterThan(128);
   }
   expect([result.insideMouth, ...result.eye, result.movedIris]).toEqual([0, 0, 0, 0]);
});
