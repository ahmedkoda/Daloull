// Downloads royalty-free slider images from Wikimedia Commons (free-licensed).
// Run: node scripts/fetch-slider-images.js
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'public', 'img', 'slider');
fs.mkdirSync(outDir, { recursive: true });

const UA = 'DalloulToursSite/1.0 (https://dalloul.example; dalloultours@gmail.com)';

const items = [
  { name: 'entry',   q: 'Pyramids of Giza Egypt' },
  { name: 'umrah',   q: 'Kaaba Mecca' },
  { name: 'flights', q: 'airliner aircraft flying sky' },
  { name: 'docs',    q: 'passport travel documents' },
];

async function pickUrl(q) {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search'
    + '&gsrnamespace=6&gsrsearch=' + encodeURIComponent(q)
    + '&gsrlimit=8&prop=imageinfo&iiprop=url|mime&iiurlwidth=1600&format=json';
  const r = await fetch(api, { headers: { 'User-Agent': UA } });
  const j = await r.json();
  const pages = j.query && j.query.pages ? Object.values(j.query.pages) : [];
  pages.sort((a, b) => (a.index || 0) - (b.index || 0));
  for (const p of pages) {
    const ii = p.imageinfo && p.imageinfo[0];
    if (ii && ii.thumburl && /jpe?g/i.test(ii.mime || ii.thumburl)) {
      return { url: ii.thumburl, title: p.title };
    }
  }
  return null;
}

(async () => {
  for (const it of items) {
    try {
      const hit = await pickUrl(it.q);
      if (!hit) { console.log('NO IMAGE:', it.q); continue; }
      const ir = await fetch(hit.url, { headers: { 'User-Agent': UA } });
      const buf = Buffer.from(await ir.arrayBuffer());
      fs.writeFileSync(path.join(outDir, it.name + '.jpg'), buf);
      console.log('saved', it.name + '.jpg', buf.length, 'bytes  <-', hit.title);
    } catch (e) {
      console.log('ERROR', it.name, e.message);
    }
  }
})();
