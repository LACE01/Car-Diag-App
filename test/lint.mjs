/* ============================================================
   lint.mjs — static checks for bug classes that have already
   shipped once. Cheap to run, and each one maps to a real outage.

     1. Double-quoted strings inside SQL. SQLite reads "x" as an
        identifier, so `COALESCE(d,"9999")` becomes "no such column".
        This has bitten three times: documents ordering, datetime("now"),
        and the store key concat.
     2. Body state flags that collide with element class names.
        `.modal{display:none}` on <body> blanks the entire app.

     node test/lint.mjs
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let problems = 0;
const report = (file, line, msg, snippet) => {
  problems++;
  console.log(`  ✗ ${file}:${line}  ${msg}`);
  if (snippet) console.log(`      ${snippet.trim().slice(0, 160)}`);
};

/* ---------- 1. double quotes inside SQL ---------- */
const SQL_HINT = /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|ALTER TABLE|COALESCE|datetime\()/i;

for (const f of fs.readdirSync(path.join(root, 'server')).filter(f => f.endsWith('.js'))) {
  const file = path.join('server', f);
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
  lines.forEach((ln, i) => {
    // find single-quoted or backticked string literals that look like SQL
    const literals = ln.match(/'[^']*'|`[^`]*`/g) || [];
    for (const lit of literals) {
      if (!SQL_HINT.test(lit)) continue;
      if (lit.includes('"')) {
        report(file, i + 1, 'double-quoted string inside SQL — SQLite reads it as an identifier; use single quotes', ln);
      }
    }
  });
}

/* ---------- 2. body flag / element class collision ---------- */
const cssPath = path.join(root, 'public/css/app.css');
if (fs.existsSync(cssPath)) {
  const css = fs.readFileSync(cssPath, 'utf8');
  const jsDir = path.join(root, 'public/js');
  const js = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
  const flags = new Set([...js.matchAll(/body\.classList\.(?:add|remove|toggle)\('([a-z0-9-]+)'/g)].map(m => m[1]));
  for (const flag of flags) {
    if (new RegExp(`(^|[},])\\.${flag}\\s*[{,:.]`, 'm').test(css)) {
      report('public/css/app.css', 0,
        `body flag "${flag}" also exists as a bare element class — a body carrying it inherits that rule`);
    }
  }
  if (!flags.size) report('public/js', 0, 'no body flags found — the collision guard is not actually running');
}

/* ---------- 3. every renderer referenced by the nav must exist ---------- */
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const navScreens = [...html.matchAll(/data-go="([a-z]+)"/g)].map(m => m[1]);
const jsAll = fs.readdirSync(path.join(root, 'public/js')).filter(f => f.endsWith('.js'))
  .map(f => fs.readFileSync(path.join(root, 'public/js', f), 'utf8')).join('\n');
for (const s of navScreens) {
  if (!new RegExp(`renderers\\.${s}\\s*=`).test(jsAll)) {
    report('public/index.html', 0, `nav links to "${s}" but no renderers.${s} is defined`);
  }
  if (!new RegExp(`id="s-${s}"`).test(html)) {
    report('public/index.html', 0, `nav links to "${s}" but there is no <section id="s-${s}">`);
  }
}

/* ---------- 4. every script the shell loads must exist on disk ---------- */
for (const m of html.matchAll(/<script src="\/js\/([^"]+)"><\/script>/g)) {
  if (!fs.existsSync(path.join(root, 'public/js', m[1]))) {
    report('public/index.html', 0, `loads /js/${m[1]} which does not exist`);
  }
}


/* ---------- 5. theme integrity ----------
   Every var() referenced must be defined in :root itself. Checking
   "defined anywhere in the file" is not enough — a token present only
   in a theme variant leaves the DEFAULT theme rendering that property
   with nothing at all, which is exactly the sort of failure that looks
   fine on the machine where it was written. */
if (fs.existsSync(cssPath)) {
  const css = fs.readFileSync(cssPath, 'utf8');
  const rootBlock = (css.match(/:root\s*\{([\s\S]*?)\}/) || [, ''])[1];
  if (!rootBlock.trim()) report('public/css/app.css', 0, 'no :root token block found');
  const defined = new Set([...rootBlock.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));

  const jsDir = path.join(root, 'public/js');
  const js = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');

  const seen = new Set();
  for (const [label, src] of [['public/css/app.css', css], ['public/js', js]]) {
    for (const m of src.matchAll(/var\((--[a-z0-9-]+)/g)) {
      const key = label + m[1];
      if (defined.has(m[1]) || seen.has(key)) continue;
      seen.add(key);
      report(label, 0, `uses ${m[1]}, which is not defined in :root`);
    }
  }

  let depth = 0;
  for (const ch of css) { if (ch === '{') depth++; else if (ch === '}') depth--; }
  if (depth !== 0) report('public/css/app.css', 0, `unbalanced braces (depth ${depth})`);
}

console.log(problems ? `\n${problems} problem(s) found\n` : '  ✓ lint clean\n');
process.exit(problems ? 1 : 0);
