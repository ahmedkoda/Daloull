'use strict';

/*
 * Dalloul Tours — official website MVP
 * Service-presentation pages + a single default document-intake form.
 * Uploaded documents are stored server-side (outside the public folder) and
 * are retrievable ONLY through the password-protected /admin area.
 * No payment and no live flight booking in this MVP (per project decisions 2026-06-03).
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOADS_DIR = path.join(ROOT, 'uploads');   // private — never statically served
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'submissions.json');

for (const dir of [UPLOADS_DIR, DATA_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]');

// Editable site text (admin overrides over the built-in i18n defaults).
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const EMPTY_CONTENT = { ar: {}, en: {}, zh: {} };
if (!fs.existsSync(CONTENT_FILE)) fs.writeFileSync(CONTENT_FILE, JSON.stringify(EMPTY_CONTENT, null, 2));
function readContent() {
  try { return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8')); }
  catch { return { ar: {}, en: {}, zh: {} }; }
}
function writeContent(c) { fs.writeFileSync(CONTENT_FILE, JSON.stringify(c, null, 2)); }

// ---- tiny JSON store -------------------------------------------------------
function readSubmissions() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return []; }
}
function writeSubmissions(list) {
  fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2));
}

// ---- service catalogue (kept in sync with the public pages) ----------------
const SERVICES = {
  entry_approval: 'موافقة دخول مصر',
  umrah_hajj: 'تأشيرة وبرامج العمرة والحج',
  rafah: 'تنسيق معبر رفح',
  pa_documents: 'استخراج وتصديق الأوراق من رام الله',
  driving_license: 'رخصة قيادة دولية / فلسطينية',
  flights: 'تذاكر طيران',
  hotels: 'حجز فنادق',
  airport: 'استقبال مطار',
  car_rental: 'تأجير سيارات وتنقلات',
  insurance: 'تأمين السفر',
  tourism: 'برامج سياحية في مصر',
  other_visas: 'تأشيرات دول أخرى',
  other: 'خدمة أخرى',
};

// ---- app -------------------------------------------------------------------
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '2mb' }));

// Assign a submission id BEFORE multer so uploads land in a per-submission folder.
function assignSubmissionId(req, res, next) {
  req.submissionId = 'DT-' + Date.now().toString(36) + '-' +
    crypto.randomBytes(3).toString('hex');
  req.submissionDir = path.join(UPLOADS_DIR, req.submissionId);
  fs.mkdirSync(req.submissionDir, { recursive: true });
  next();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, req.submissionDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-؀-ۿ]/g, '_').slice(-80);
    cb(null, `${file.fieldname}-${Date.now()}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024, files: 8 }, // 12MB/file, tolerant of phone photos
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|png|jpg|webp|heic|heif)|application\/pdf/.test(file.mimetype);
    cb(null, ok);
  },
});

// ---- intake submission -----------------------------------------------------
app.post(
  '/apply',
  assignSubmissionId,
  upload.fields([
    { name: 'passport', maxCount: 1 },
    { name: 'idcard', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'extra', maxCount: 5 },
  ]),
  (req, res) => {
    const b = req.body || {};
    const files = req.files || {};
    const fileList = Object.values(files).flat().map(f => ({
      field: f.fieldname,
      original: f.originalname,
      stored: path.basename(f.path),
      size: f.size,
    }));

    const submission = {
      id: req.submissionId,
      created: new Date().toISOString(),
      service: SERVICES[b.service] || b.service || '—',
      serviceKey: b.service || '',
      nameAr: (b.nameAr || '').trim(),
      nameLatin: (b.nameLatin || '').trim(),
      nationality: (b.nationality || '').trim(),
      passportNo: (b.passportNo || '').trim(),
      dob: (b.dob || '').trim(),
      phone: (b.phone || '').trim(),
      email: (b.email || '').trim(),
      notes: (b.notes || '').trim(),
      files: fileList,
    };

    const list = readSubmissions();
    list.unshift(submission);
    writeSubmissions(list);

    res.redirect('/thank-you.html?ref=' + encodeURIComponent(submission.id));
  }
);

// ---- admin (basic auth) ----------------------------------------------------
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
    const okUser = user === ADMIN_USER;
    const okPass = pass === ADMIN_PASS;
    if (okUser && okPass) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Dalloul Admin"');
  return res.status(401).send('Authentication required.');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

app.get('/admin', requireAdmin, (req, res) => {
  const list = readSubmissions();
  const rows = list.map(s => `
    <tr>
      <td><code>${esc(s.id)}</code><br><small>${esc(new Date(s.created).toLocaleString())}</small></td>
      <td><strong>${esc(s.service)}</strong></td>
      <td>${esc(s.nameAr)}<br><small>${esc(s.nameLatin)}</small></td>
      <td>${esc(s.nationality)}<br><small>${esc(s.passportNo)} · ${esc(s.dob)}</small></td>
      <td>${esc(s.phone)}<br><small>${esc(s.email)}</small></td>
      <td>${(s.files || []).map(f =>
        `<a href="/admin/file/${encodeURIComponent(s.id)}/${encodeURIComponent(f.stored)}">${esc(f.field)}</a>`
      ).join('<br>') || '—'}</td>
      <td><small>${esc(s.notes)}</small></td>
    </tr>`).join('');

  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Dalloul Admin — Submissions</title>
    <style>
      body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:24px;color:#0b2447;background:#f4f7fb}
      h1{color:#0b2447} .count{color:#6b7a90}
      table{border-collapse:collapse;width:100%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.08)}
      th,td{border:1px solid #e1e8f0;padding:8px 10px;text-align:left;vertical-align:top;font-size:14px}
      th{background:#0b2447;color:#fff;position:sticky;top:0}
      a{color:#1763c6} code{font-size:12px} small{color:#6b7a90}
    </style></head><body>
    <h1>Dalloul Tours — Submissions <span class="count">(${list.length})</span></h1>
    <p class="count">Documents are private; only this admin area can open them.
      &nbsp;|&nbsp; <a href="/admin/content">✏️ Edit site text →</a></p>
    <table>
      <thead><tr><th>Ref / Time</th><th>Service</th><th>Name</th><th>Nationality / Passport / DOB</th><th>Contact</th><th>Documents</th><th>Notes</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7">No submissions yet.</td></tr>'}</tbody>
    </table>
  </body></html>`);
});

app.get('/admin/file/:id/:name', requireAdmin, (req, res) => {
  const id = path.basename(req.params.id);
  const name = path.basename(req.params.name);
  const filePath = path.join(UPLOADS_DIR, id, name);
  if (!filePath.startsWith(UPLOADS_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).send('Not found.');
  }
  res.download(filePath);
});

// ---- editable content (CMS) ----
// Public: the public pages overlay these admin edits onto the built-in defaults.
app.get('/api/content', (req, res) => res.json(readContent()));

// Admin: the text editor UI.
app.get('/admin/content', requireAdmin, (req, res) => {
  res.sendFile(path.join(ROOT, 'admin', 'content-editor.html'));
});

// Admin: save edited text. Body = { ar:{key:val}, en:{...}, zh:{...} } with only changed keys.
app.post('/admin/content', requireAdmin, (req, res) => {
  const body = req.body || {};
  const clean = { ar: {}, en: {}, zh: {} };
  for (const lang of ['ar', 'en', 'zh']) {
    const m = body[lang] || {};
    for (const k of Object.keys(m)) {
      const v = m[k];
      if (typeof k === 'string' && typeof v === 'string' && v.length <= 4000) clean[lang][k] = v;
    }
  }
  writeContent(clean);
  const n = clean.ar && Object.keys(clean.ar).length + Object.keys(clean.en).length + Object.keys(clean.zh).length;
  res.json({ ok: true, overrides: n });
});

// ---- static public site (served last so it can't shadow routes) ------------
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));

app.listen(PORT, () => {
  console.log(`Dalloul Tours site running:  http://localhost:${PORT}`);
  console.log(`Admin area:                  http://localhost:${PORT}/admin  (user: ${ADMIN_USER})`);
});
