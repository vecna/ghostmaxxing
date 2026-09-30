#!/usr/bin/env node
/**
 * Export the editable HTML social cards with Playwright element screenshots.
 * node scripts-dev/build-social-cards.cjs [--format jpg|png] [--only glasses,pole,canopy,generic,gallery]
 * node scripts-dev/build-social-cards.cjs --update-docs
 * Uses existing @playwright/test; writes images/social/ and a capture manifest.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const ROOT=path.resolve(__dirname,'..');
const IDS=['glasses','pole','canopy','generic','gallery'];
const DOCS=`## Social cards

Edit \`scripts-dev/social-cards.html\` to change copy, layout, or the embedded SVG artwork.
All four cards use the existing Newsreader Bold (700) font and project colour tokens.
Each card is exactly 1200 × 630 CSS pixels; export uses an element screenshot at
1× device scale after fonts load. The page is maintainer tooling and has \`noindex\`.

\`\`\`sh
npm ci
npm run prepare:e2e
node scripts-dev/build-social-cards.cjs
node scripts-dev/build-social-cards.cjs --format png
node scripts-dev/build-social-cards.cjs --only generic
\`\`\`

Default output: \`images/social/ghostmaxxing-{glasses,pole,canopy,generic}.jpg\`,
plus \`images/social/cards-manifest.json\`. \`--format png\` exports PNG instead.
\`--output /path/to/folder\` changes the destination. Existing named output files
are overwritten. Images of the other format and unselected cards are retained.
The manifest describes only the most recent selected export.

Preview the layout at \`/scripts-dev/social-cards.html\` using a local server;
\`?card=generic\` shows one card. Export starts its own temporary localhost server,
so no separately running server is needed. All artwork is embedded in the page;
fonts and CSS are loaded from this checkout. Nothing is downloaded at export time.
Changes to icons elsewhere do not automatically update the embedded artwork.

Set each page's \`og:image\` and \`twitter:image\` to an absolute HTTPS URL for the
chosen exported image. Use width \`1200\`, height \`630\`, the appropriate MIME type,
and each page's own canonical URL and \`og:url\`. The exporter does not rewrite
public-page metadata. \`ghostmaxxing-generic.jpg\` is the default general-purpose card.

\`--update-docs\` refreshes a marked section in this README and in the relevant
folder descriptions, preserving all text outside those sections. It performs
only documentation updates and does not launch a browser.
`;
const FOLDER='`social-cards.html` is the editable 1200 × 630 social-card layout: four cards with embedded project SVGs, Newsreader Bold typography and shared palette tokens. `build-social-cards.cjs` exports the card elements through Playwright after font readiness, writing JPEG/PNG files and a manifest under `images/social/`. It starts a local server, overwrites selected outputs, and supports `--update-docs` to refresh these documentation sections without replacing unrelated text. See `README.md` for commands.';
async function section(file,text){
 const start='<!-- ghostmaxxing-social-cards:start -->',end='<!-- ghostmaxxing-social-cards:end -->';
 let body=await fs.readFile(file,'utf8');const a=body.indexOf(start),b=body.indexOf(end);
 if((a<0)!==(b<0)||b<a)throw new Error(`Malformed managed section: ${file}`);
 const block=`${start}\n${text.trim()}\n${end}`;
 body=a<0?body.trimEnd()+'\n\n'+block+'\n':body.slice(0,a)+block+body.slice(b+end.length);
 await fs.writeFile(file,body);
}
async function updateDocs(){
 await section(path.join(ROOT,'scripts-dev/README.md'),DOCS);
 await section(path.join(ROOT,'scripts-dev/FOLDER-DESCRIPTION.md'),FOLDER);
 await section(path.join(ROOT,'images/social/FOLDER-DESCRIPTION.md'),'The `ghostmaxxing-glasses`, `ghostmaxxing-pole`, `ghostmaxxing-canopy` and `ghostmaxxing-generic` JPEG/PNG files are generated social-preview cards. Edit `scripts-dev/social-cards.html`, then run `node scripts-dev/build-social-cards.cjs`. Each output is 1200 × 630; the capture manifest records selected exports. The old root SVG cards are legacy assets, not inputs to this export. Public metadata must be switched to an absolute URL for one of the new raster images separately.');
 console.log('Updated scripts-dev/README.md and both affected FOLDER-DESCRIPTION.md sections.');
}
async function main(){
 let format='jpg',ids=IDS,output=path.join(ROOT,'images/social');const args=process.argv.slice(2);
  if(args.includes('--help')){console.log('Usage: node scripts-dev/build-social-cards.cjs [--format jpg|png] [--only glasses,pole,canopy,generic,gallery] [--output directory]\n       node scripts-dev/build-social-cards.cjs --update-docs');return;}
 if(args.length===1&&args[0]==='--update-docs')return updateDocs();
 for(let i=0;i<args.length;i++){
  const flag=args[i],value=args[++i];if(!value)throw new Error(`Missing value: ${flag}`);
  if(flag==='--format')format=value;else if(flag==='--only')ids=[...new Set(value.split(','))];else if(flag==='--output')output=path.resolve(value);else throw new Error(`Unknown option: ${flag}`);
 }
 if(!['jpg','png'].includes(format)||!ids.length||ids.some(id=>!IDS.includes(id)))throw new Error('Use jpg/png and card IDs glasses,pole,canopy,generic,gallery.');
 const {chromium}=require('@playwright/test');
 const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
 const server=http.createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(pathname.split('/').some(p=>p.startsWith('.')))throw new Error('Hidden path');
   const file=path.resolve(ROOT,'.'+pathname);if(!file.startsWith(ROOT+path.sep))throw new Error('Outside root');
   res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
  }catch{res.statusCode=404;res.end('Not found');}
 });
 let browser;
 try{
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:760},deviceScaleFactor:1,reducedMotion:'reduce'});
  const failures=[];page.on('requestfailed',r=>failures.push(r.url()));page.on('response',r=>{if(r.status()>=400)failures.push(`${r.status()} ${r.url()}`);});
  await fs.mkdir(output,{recursive:true});const captures=[];
  for(const id of ids){
   failures.length=0;
   await page.goto(`http://127.0.0.1:${server.address().port}/scripts-dev/social-cards.html?card=${id}`,{waitUntil:'networkidle'});
   await page.evaluate(()=>document.fonts.ready);
   if(failures.length)throw new Error(`Missing resources: ${failures.join(', ')}`);
   const element=page.locator(`#card-${id}`);
   const metrics=await element.evaluate(e=>{
    const r=e.getBoundingClientRect();return {width:r.width,height:r.height,fontReady:document.fonts.check('700 96px Newsreader'),overflow:[...e.querySelectorAll('.brand,.message')].some(n=>n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1)};
   });
   if(metrics.width!==1200||metrics.height!==630||!metrics.fontReady||metrics.overflow)throw new Error(`Invalid card layout: ${id} ${JSON.stringify(metrics)}`);
   const filename=`ghostmaxxing-${id}.${format}`;
   await element.screenshot({path:path.join(output,filename),type:format==='jpg'?'jpeg':'png',...(format==='jpg'?{quality:95}:{}),animations:'disabled'});
   captures.push({id,file:filename,width:1200,height:630,format,bytes:(await fs.stat(path.join(output,filename))).size});console.log(`Exported ${filename}`);
  }
  await fs.writeFile(path.join(output,'cards-manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),source:'scripts-dev/social-cards.html',captures},null,2)+'\n');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
