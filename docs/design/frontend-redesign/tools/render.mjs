// Local preview of the design canvas screens (.dc.html). It is a small stand-in for the canvas
// runtime (holes, sc-for, sc-if, onClick, data-props defaults), good enough to screenshot a screen
// and compare an implementation against it. Run from the repository root:
//
//   node docs/design/frontend-redesign/tools/render.mjs <screen.dc.html> <width> <height|full> <out.png|out.jpg>
//   node docs/design/frontend-redesign/tools/render.mjs --all <outDir>        # every board in canvas.json
//
// Needs the root devDependency playwright-core and a local Chrome (CHROME_BIN overrides the path).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('playwright-core');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGN = path.resolve(HERE, '..');
const SEED = path.resolve(process.cwd(), 'apps/api/prisma/seed-images');
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Canvas image assets (/_blob/<id>) are the seed product photos.
const BLOBS = {
  '8b1ea881a6a5dfb6b26870b7665f6bf7': '2000101-0.jpg', '481fa4046b60562e760e35a7cf197229': '2000101-1.jpg',
  'd1dfdca9ed87c9b5e1f99644852d1263': '2000102-0.jpg', 'fb656fc944dc63c0108bc7d580349618': '2000103-0.jpg',
  'c28f8ed47564e5755bc09bdaf3ffd662': '2000104-0.jpg', '03b72af9e4b083f1eeb371175fcc889a': '2000105-0.jpg',
  'fac837997aad851b1664e58d48ddc16f': '2000106-0.jpg', 'b6e8caf26b507ac351edc2b1b6516f8d': '2000201-0.jpg',
  '241315b3505604a8d4c0eff30ac8967e': '2000202-0.jpg', '5d4e23ad48a4c91c1d047316046f4701': '2000203-0.jpg',
  'c47a4cb92b55a772f7e32d8eb335cf67': '2000204-0.jpg', '3be8423c8e1c4c047c2ba2fcdf7bd0a8': '2000301-0.jpg',
  '11e6e70e3b68cd9da6435eaffff48a32': '2000302-0.jpg', 'ad2daf964e8dda25fc5a663402e09d31': '2000303-0.jpg',
  '0b7fb3bb9e22d675bb234bec0de20229': '2000401-0.jpg', '8c724ac0b8cb58f953427e6723292016': '2000402-0.jpg',
};

function previewHtml(src) {
  const text = fs.readFileSync(src, 'utf8').replace(/\/_blob\/([0-9a-f]{32})/g, (_, id) => `file://${SEED}/${BLOBS[id]}`);
  const helmet = (text.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1];
  const body = (text.match(/<x-dc>([\s\S]*?)<\/x-dc>/) || [, ''])[1].replace(/<helmet>[\s\S]*?<\/helmet>/, '');
  const tag = text.match(/<script type="text\/x-dc"[^>]*data-props='([^']*)'[^>]*>([\s\S]*?)<\/script>/);
  const props = tag ? JSON.parse(tag[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&')) : {};
  const logic = tag ? tag[2] : 'class Component extends DCLogic { renderVals() { return {}; } }';
  const engine = `
class DCLogic { constructor(p) { this.props = p; this.state = null; } setState(s) { this.state = Object.assign({}, this.state, s); window.__render(); } }
${logic}
const P = ${JSON.stringify(props)}; const defaults = {};
for (const k in P) if (k[0] !== '$' && P[k] && 'default' in P[k]) defaults[k] = P[k].default;
const comp = new Component(defaults);
const HOLE = /\\{\\{\\s*([^}]+?)\\s*\\}\\}/g;
function look(scope, p) { p = p.trim(); if (p === 'true') return true; if (p === 'false') return false; if (/^-?\\d+(\\.\\d+)?$/.test(p)) return Number(p); return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope); }
function fill(str, scope) { const m = str.match(/^\\s*\\{\\{\\s*([^}]+?)\\s*\\}\\}\\s*$/); if (m) return look(scope, m[1]); return str.replace(HOLE, (_, p) => { const v = look(scope, p); return v == null ? '' : String(v); }); }
function walk(node, scope, parent) {
  if (node.nodeType === 3) { parent.appendChild(document.createTextNode(fill(node.nodeValue, scope))); return; }
  if (node.nodeType !== 1) return;
  const tag = node.tagName.toLowerCase();
  if (tag === 'sc-for') { const list = look(scope, (node.getAttribute('list') || '').replace(/[{}]/g, '')) || []; const as = node.getAttribute('as');
    list.forEach((item, i) => { const s = Object.assign({}, scope, { [as]: item, $index: i }); node.childNodes.forEach((c) => walk(c, s, parent)); }); return; }
  if (tag === 'sc-if') { if (look(scope, (node.getAttribute('value') || '').replace(/[{}]/g, ''))) node.childNodes.forEach((c) => walk(c, scope, parent)); return; }
  const el = node.namespaceURI === 'http://www.w3.org/2000/svg' ? document.createElementNS(node.namespaceURI, node.tagName) : document.createElement(node.tagName);
  for (const a of node.attributes) { if (/^hint-/.test(a.name)) continue; const v = fill(a.value, scope);
    if (/^on[a-z]/i.test(a.name) && typeof v === 'function') { el.addEventListener(a.name.slice(2).toLowerCase(), v); continue; }
    if (typeof v === 'boolean') { if (v) el.setAttribute(a.name, ''); continue; }
    el.setAttribute(a.name, v == null ? '' : String(v)); }
  (node.content ? node.content.childNodes : node.childNodes).forEach((c) => walk(c, scope, el)); parent.appendChild(el);
}
window.__render = () => { const root = document.getElementById('root'); root.innerHTML = ''; const vals = comp.renderVals(); document.getElementById('tpl').content.childNodes.forEach((n) => walk(n, vals, root)); };
window.__render();`;
  return `<!doctype html><html><head><meta charset="utf-8">${helmet}</head><body><div id="root"></div><template id="tpl">${body}</template><script>${engine}</script></body></html>`;
}

async function shoot(browser, src, width, height, out) {
  const tmp = path.join(path.dirname(out), `.preview-${process.pid}-${path.basename(src)}.html`);
  fs.writeFileSync(tmp, previewHtml(src));
  const page = await browser.newPage({ viewport: { width, height: height === 'full' ? 900 : height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + tmp, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  const jpeg = /\.jpe?g$/i.test(out);
  await page.screenshot({ path: out, fullPage: height === 'full', type: jpeg ? 'jpeg' : 'png', ...(jpeg ? { quality: 72 } : {}) });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.close();
  fs.unlinkSync(tmp);
  return { out: path.relative(process.cwd(), out), overflow, errors };
}

const args = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
try {
  if (args[0] === '--all') {
    const outDir = path.resolve(args[1] || path.join(DESIGN, 'screenshots'));
    fs.mkdirSync(outDir, { recursive: true });
    const canvas = JSON.parse(fs.readFileSync(path.join(DESIGN, 'canvas.json'), 'utf8'));
    for (const file of canvas.order) {
      const b = canvas.boards[file];
      const out = path.join(outDir, file.replace(/\.dc\.html$/, '.jpg'));
      const r = await shoot(browser, path.join(DESIGN, 'screens', file), b.w, b.w < 600 ? b.h : 'full', out);
      console.log(JSON.stringify(r));
    }
  } else {
    const [src, w, h, out] = args;
    console.log(JSON.stringify(await shoot(browser, path.resolve(src), Number(w), h === 'full' ? 'full' : Number(h), path.resolve(out))));
  }
} finally {
  await browser.close();
}
