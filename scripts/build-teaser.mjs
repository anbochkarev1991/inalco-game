// Inlines the teaser-src JPEGs into the teaser template as data URIs, then writes:
//   press/teaser.html          — full standalone page (double-click / screen-record)
//   press/teaser.artifact.html — body-only (for the Artifact publisher)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const keys = ['sign','shore','estancia','corridor','leanfar','draft','fire','veil','child','congregation','her','pshot'];

let html = readFileSync(join(root, 'press/teaser.template.html'), 'utf8');
for (const k of keys) {
  const b64 = readFileSync(join(root, `press/teaser-src/${k}.jpg`)).toString('base64');
  html = html.replaceAll(`__IMG_${k}__`, `data:image/jpeg;base64,${b64}`);
}
const left = html.indexOf('__IMG_');
if (left !== -1) throw new Error('unreplaced image token near ' + html.slice(left, left + 30));

// standalone
writeFileSync(join(root, 'press/teaser.html'), html);

// body-only for the Artifact tool (everything between <body> and </body>)
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>')).trim();
writeFileSync(join(root, 'press/teaser.artifact.html'), body);

const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`built press/teaser.html (${kb} KB) and press/teaser.artifact.html`);
