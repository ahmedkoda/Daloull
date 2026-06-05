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

// Arabic labels for the document fields uploaded by visitors.
const FILE_LABELS = {
  passport: 'جواز السفر',
  idcard: 'بطاقة الهوية',
  photo: 'صورة شخصية',
  extra: 'مرفقات إضافية',
};
function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

app.get('/admin', requireAdmin, (req, res) => {
  const list = readSubmissions();
  const totalFiles = list.reduce((sum, s) => sum + (s.files || []).length, 0);

  // One self-contained card per submission, with a clearly separated documents section.
  const cards = list.map(s => {
    const files = s.files || [];
    const filesBlock = files.length
      ? `<div class="files">
           ${files.map(f => `
             <a class="file" href="/admin/file/${encodeURIComponent(s.id)}/${encodeURIComponent(f.stored)}" download>
               <span class="file-ic">📎</span>
               <span class="file-meta">
                 <strong>${esc(FILE_LABELS[f.field] || f.field)}</strong>
                 <small>${esc(f.original)} · ${esc(fmtSize(f.size))}</small>
               </span>
               <span class="file-dl">تحميل ↓</span>
             </a>`).join('')}
         </div>`
      : `<p class="no-files">لا توجد ملفات مرفقة مع هذا الطلب.</p>`;

    return `
    <article class="card">
      <header class="card-head">
        <span class="service">${esc(s.service)}</span>
        <span class="ref"><code>${esc(s.id)}</code> · ${esc(new Date(s.created).toLocaleString('ar-EG'))}</span>
      </header>

      <section class="info">
        <div class="field"><label>الاسم (عربي)</label><span>${esc(s.nameAr) || '—'}</span></div>
        <div class="field"><label>الاسم (لاتيني)</label><span>${esc(s.nameLatin) || '—'}</span></div>
        <div class="field"><label>الجنسية</label><span>${esc(s.nationality) || '—'}</span></div>
        <div class="field"><label>رقم الجواز</label><span>${esc(s.passportNo) || '—'}</span></div>
        <div class="field"><label>تاريخ الميلاد</label><span>${esc(s.dob) || '—'}</span></div>
        <div class="field"><label>الهاتف</label><span>${esc(s.phone) || '—'}</span></div>
        <div class="field"><label>البريد الإلكتروني</label><span>${esc(s.email) || '—'}</span></div>
      </section>

      ${s.notes ? `<section class="notes"><label>ملاحظات الزائر</label><p>${esc(s.notes)}</p></section>` : ''}

      <section class="docs">
        <h3>📁 الملفات المرفوعة <span class="badge">${files.length}</span></h3>
        ${filesBlock}
      </section>
    </article>`;
  }).join('');

  res.send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>لوحة تحكم دلول — الطلبات</title>
    <style>
      :root{--navy:#0b2447;--ink:#1b2a41;--muted:#6b7a90;--line:#e1e8f0;--bg:#f4f7fb;--blue:#1763c6;--green:#0f7b4f}
      *{box-sizing:border-box}
      body{font-family:system-ui,'Segoe UI',Tahoma,sans-serif;margin:0;color:var(--ink);background:var(--bg)}
      .topbar{background:var(--navy);color:#fff;padding:18px 24px;display:flex;flex-wrap:wrap;
        align-items:center;justify-content:space-between;gap:12px;position:sticky;top:0;z-index:5}
      .topbar h1{margin:0;font-size:20px}
      .topbar .stats{display:flex;gap:20px;font-size:14px;color:#cbd6e6}
      .topbar .stats b{color:#fff;font-size:16px}
      .topbar a{color:#fff;background:rgba(255,255,255,.12);padding:8px 14px;border-radius:8px;
        text-decoration:none;font-size:14px}
      .topbar a:hover{background:rgba(255,255,255,.22)}
      .wrap{max-width:1100px;margin:0 auto;padding:24px}
      .empty{background:#fff;border:1px dashed var(--line);border-radius:12px;padding:48px;
        text-align:center;color:var(--muted)}

      /* one separated card per submission */
      .card{background:#fff;border:1px solid var(--line);border-radius:14px;margin-bottom:22px;
        box-shadow:0 1px 4px rgba(11,36,71,.06);overflow:hidden}
      .card-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;
        padding:14px 18px;background:#f0f5fb;border-bottom:1px solid var(--line)}
      .card-head .service{font-weight:700;font-size:16px;color:var(--navy)}
      .card-head .ref{font-size:12px;color:var(--muted)} .card-head code{font-size:12px}

      .info{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px 18px;padding:18px}
      .field{display:flex;flex-direction:column;gap:3px}
      .field label{font-size:12px;color:var(--muted)}
      .field span{font-size:14px;font-weight:600}

      .notes{padding:0 18px 16px} .notes label{font-size:12px;color:var(--muted)}
      .notes p{margin:4px 0 0;background:#fffbe9;border:1px solid #f0e3b8;border-radius:8px;padding:10px 12px;font-size:14px}

      /* the highlighted "uploaded files" section */
      .docs{padding:16px 18px;background:#eef8f1;border-top:2px solid #cdeedd}
      .docs h3{margin:0 0 12px;font-size:15px;color:var(--green);display:flex;align-items:center;gap:8px}
      .docs .badge{background:var(--green);color:#fff;border-radius:999px;font-size:12px;padding:1px 9px}
      .files{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
      .file{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #cdeedd;
        border-radius:10px;padding:10px 12px;text-decoration:none;color:var(--ink);transition:.15s}
      .file:hover{border-color:var(--green);box-shadow:0 2px 8px rgba(15,123,79,.15)}
      .file-ic{font-size:20px}
      .file-meta{display:flex;flex-direction:column;flex:1;min-width:0}
      .file-meta strong{font-size:14px} .file-meta small{color:var(--muted);font-size:12px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .file-dl{font-size:12px;color:var(--green);font-weight:700;white-space:nowrap}
      .no-files{margin:0;color:var(--muted);font-size:14px}
    </style></head><body>
    <div class="topbar">
      <h1>لوحة تحكم دلول للسياحة</h1>
      <div class="stats">
        <span>الطلبات <b>${list.length}</b></span>
        <span>إجمالي الملفات <b>${totalFiles}</b></span>
      </div>
      <a href="/admin/content">✏️ تعديل نصوص الموقع</a>
    </div>
    <div class="wrap">
      ${cards || '<div class="empty">لا توجد طلبات بعد. ستظهر طلبات الزوار هنا فور إرسالها.</div>'}
    </div>
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
