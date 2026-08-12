/* ============================================================
   Garage — vehicle diagnostic & maintenance companion
   ============================================================ */
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { api } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 2026);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));
app.use(cookieParser());

// Web Bluetooth requires a secure context. On plain http that means
// localhost only — so tell the client what it is dealing with.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/healthz', (req, res) => {
  try {
    const r = db.prepare('SELECT COUNT(*) c FROM users').get();
    res.json({ ok: true, users: r.c, version: '1.0.0', port: PORT, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.use('/api', api);

app.use(express.static(path.join(__dirname, '..', 'public'), {
  extensions: ['html'],
  setHeaders: (res, p) => {
    if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'No such endpoint.' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`\n  GARAGE  ·  vehicle diagnostic & maintenance`);
  console.log(`  listening on http://${HOST}:${PORT}`);
  console.log(`  data dir: ${process.env.DATA_DIR || '/data'}\n`);
});
