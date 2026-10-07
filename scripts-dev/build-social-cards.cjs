#!/usr/bin/env node
/**
 * Export the editable HTML social cards with Playwright element screenshots.
 * node scripts-dev/build-social-cards.cjs [--format jpg|png] [--only glasses,pole,canopy,generic,gallery]
 *   [--variants landscape,square,wide]
 * node scripts-dev/build-social-cards.cjs --update-docs
 * Uses existing @playwright/test; writes images/social/ and a capture manifest.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const ROOT=path.resolve(__dirname,'..');
const IDS=['glasses','pole','canopy','generic','gallery'];
const VARIANTS={
 landscape:{width:1200,height:630,suffix:''},
 square:{width:1200,height:1200,suffix:'-square'},
 wide:{width:1500,height:500,suffix:'-wide'}
};
const DOCS=`## Social cards

Edit \`scripts-dev/social-cards.html\` to change copy, layout, or the embedded SVG artwork.
All five cards use the existing Newsreader Bold (700) font and project colour tokens.
Each card has 1200 × 630 landscape, 1200 × 1200 square, and 1500 × 500 wide
layouts. Export uses an element screenshot at 1× device scale after fonts load.
The page is maintainer tooling and has \`noindex\`.

\`\`\`sh
npm ci
npm run prepare:e2e
node scripts-dev/build-social-cards.cjs
node scripts-dev/build-social-cards.cjs --format png
node scripts-dev/build-social-cards.cjs --only generic
node scripts-dev/build-social-cards.cjs --variants square,wide
\`\`\`

Default output: \`images/social/ghostmaxxing-{glasses,pole,canopy,generic,gallery}.jpg\`,
their \`-square\` and \`-wide\` variants, plus \`images/social/cards-manifest.json\`.
\`--format png\` exports PNG instead. \`--variants\` limits the exported layouts.
\`--output /path/to/folder\` changes the destination. Existing named output files
are overwritten. Images of the other format and unselected cards are retained.
The manifest describes only the most recent selected export.

Preview the layout at \`/scripts-dev/social-cards.html\` using a local server;
\`?card=generic\` shows one card and \`?card=generic&variant=wide\` selects a layout.
Export starts its own temporary localhost server, so no separately running server
is needed. All artwork is embedded in the page; fonts and CSS are loaded from this
checkout. Nothing is downloaded at export time. Changes to icons elsewhere do not
automatically update the embedded artwork.

Set each page's \`og:image\` and \`twitter:image\` to an absolute HTTPS URL for the
chosen exported image. Use the selected variant's dimensions, the appropriate MIME
type, and each page's own canonical URL and \`og:url\`. The exporter does not rewrite
public-page metadata. \`ghostmaxxing-generic.jpg\` is the default general-purpose card.

\`--update-docs\` refreshes a marked section in this README and in the relevant
folder descriptions, preserving all text outside those sections. It performs
only documentation updates and does not launch a browser.
`;
const FOLDER='`social-cards.html` contains the editable landscape, square and wide social-card layouts: five cards with embedded project SVGs, Newsreader Bold typography and shared palette tokens. `build-social-cards.cjs` exports the card elements through Playwright after font readiness, writing JPEG/PNG files and a manifest under `images/social/`. It starts a local server, overwrites selected outputs, and supports `--update-docs` to refresh these documentation sections without replacing unrelated text. See `README.md` for commands.';
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
 await section(path.join(ROOT,'images/social/FOLDER-DESCRIPTION.md'),'The `ghostmaxxing-{glasses,pole,canopy,generic,gallery}` JPEG/PNG files are generated social-preview cards. Edit `scripts-dev/social-cards.html`, then run `node scripts-dev/build-social-cards.cjs`. Landscape outputs are 1200 × 630, `-square` outputs are 1200 × 1200, and `-wide` outputs are 1500 × 500; the capture manifest records selected exports. The old root SVG cards are legacy assets, not inputs to this export. Public metadata must be switched to an absolute URL for one of the raster images separately.');
 console.log('Updated scripts-dev/README.md and both affected FOLDER-DESCRIPTION.md sections.');
}
async function main(){
 let format='jpg',ids=IDS,variants=Object.keys(VARIANTS),output=path.join(ROOT,'images/social');const args=process.argv.slice(2);
  if(args.includes('--help')){console.log('Usage: node scripts-dev/build-social-cards.cjs [--format jpg|png] [--only glasses,pole,canopy,generic,gallery] [--variants landscape,square,wide] [--output directory]\n       node scripts-dev/build-social-cards.cjs --update-docs');return;}
 if(args.length===1&&args[0]==='--update-docs')return updateDocs();
 for(let i=0;i<args.length;i++){
  const flag=args[i],value=args[++i];if(!value)throw new Error(`Missing value: ${flag}`);
  if(flag==='--format')format=value;else if(flag==='--only')ids=[...new Set(value.split(','))];else if(flag==='--variants')variants=[...new Set(value.split(','))];else if(flag==='--output')output=path.resolve(value);else throw new Error(`Unknown option: ${flag}`);
 }
 if(!['jpg','png'].includes(format)||!ids.length||ids.some(id=>!IDS.includes(id)))throw new Error('Use jpg/png and card IDs glasses,pole,canopy,generic,gallery.');
 if(!variants.length||variants.some(variant=>!VARIANTS[variant]))throw new Error('Use variants landscape,square,wide.');
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
  const page=await browser.newPage({viewport:{width:1580,height:1280},deviceScaleFactor:1,reducedMotion:'reduce'});
  const failures=[];page.on('requestfailed',r=>failures.push(r.url()));page.on('response',r=>{if(r.status()>=400)failures.push(`${r.status()} ${r.url()}`);});
  await fs.mkdir(output,{recursive:true});const captures=[];
  for(const id of ids){
   for(const variant of variants){
    const {width,height,suffix}=VARIANTS[variant];failures.length=0;
    await page.goto(`http://127.0.0.1:${server.address().port}/scripts-dev/social-cards.html?card=${id}&variant=${variant}`,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    if(failures.length)throw new Error(`Missing resources: ${failures.join(', ')}`);
    const element=page.locator(`#card-${id}`);
    const metrics=await element.evaluate(e=>{
     const r=e.getBoundingClientRect();
     const overflow=[...e.querySelectorAll('.brand,.message')]
      .filter(n=>n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1)
      .map(n=>({className:n.className,client:[n.clientWidth,n.clientHeight],scroll:[n.scrollWidth,n.scrollHeight]}));
     return {width:r.width,height:r.height,fontReady:document.fonts.check('700 96px Newsreader'),overflow};
    });
    if(metrics.width!==width||metrics.height!==height||!metrics.fontReady||metrics.overflow.length)throw new Error(`Invalid card layout: ${id}/${variant} ${JSON.stringify(metrics)}`);
    const filename=`ghostmaxxing-${id}${suffix}.${format}`;
    await element.screenshot({path:path.join(output,filename),type:format==='jpg'?'jpeg':'png',...(format==='jpg'?{quality:95}:{}),animations:'disabled'});
    captures.push({id,variant,file:filename,width,height,format,bytes:(await fs.stat(path.join(output,filename))).size});console.log(`Exported ${filename}`);
   }
  }
  await fs.writeFile(path.join(output,'cards-manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),source:'scripts-dev/social-cards.html',captures},null,2)+'\n');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
