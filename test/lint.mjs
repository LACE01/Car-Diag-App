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

/* ============================================================
   6. Inline handlers that call a function nobody defined.

   The whole client is strings of HTML with onclick="doThing()".
   A typo or a renamed helper produces no build error, no console
   warning until the moment the user clicks — and then a dead
   button with a ReferenceError they'll never see. This has
   already happened twice (openOdo, vehLabel) in one sitting.

   Collect every identifier called from an inline handler, and
   every function/const declared across the client bundle plus
   the browser globals we legitimately use. Anything called but
   never declared is a button that does nothing.
   ============================================================ */
{
  const jsDir = path.join(root, 'public/js');
  const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
  const sources = jsFiles.map(f => ({ file: 'public/js/' + f, src: fs.readFileSync(path.join(jsDir, f), 'utf8') }));
  const htmlPath = path.join(root, 'public/index.html');
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
  const allJs = sources.map(s => s.src).join('\n');

  const declared = new Set();
  for (const re of [
    /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?(?:function|\()/g,
    /window\.([A-Za-z_$][\w$]*)\s*=/g
  ]) for (const m of allJs.matchAll(re)) declared.add(m[1]);

  /* browser and platform globals the handlers are allowed to reach */
  const GLOBALS = new Set([
    'alert', 'confirm', 'prompt', 'console', 'window', 'document', 'location', 'history',
    'event', 'this', 'navigator', 'fetch', 'setTimeout', 'setInterval', 'clearTimeout',
    'localStorage', 'sessionStorage', 'JSON', 'Math', 'Date', 'Number', 'String', 'Boolean',
    'Array', 'Object', 'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent',
    'Promise', 'Set', 'Map', 'URL', 'FormData', 'Intl', 'requestAnimationFrame', 'if', 'return',
    'for', 'while', 'typeof', 'new', 'await', 'function', 'else', 'switch', 'catch', 'try'
  ]);

  const called = new Map();                  // name -> "file:line"

  /* Two shapes carry handler code in this codebase, and both have to
     be checked. The first is a literal HTML attribute. The second is
     a string passed as component options — `onClick:` on a metric or
     gauge, `run:` on an empty-state action — which only becomes an
     attribute later, inside charts.js. A dead handler is just as dead
     either way, so both forms are scanned. */
  const PATTERNS = [
    /\son(?:click|change|input|submit|keydown|keyup|focus|blur|pointerdown)\s*=\s*(["'])([\s\S]*?)\1/g,
    /\b(?:onClick|onChange|onKey|run)\s*:\s*(["'])([\s\S]*?)\1/g
  ];

  for (const { file, src } of [...sources, { file: 'public/index.html', src: html }]) {
    const lines = src.split('\n');
    lines.forEach((ln, i) => {
      for (const HANDLER of PATTERNS) {
        HANDLER.lastIndex = 0;
        for (const m of ln.matchAll(HANDLER)) {
          const code = m[2];
          for (const c of code.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
            const name = c[1];
            if (GLOBALS.has(name)) continue;
            // skip method calls:  foo.bar()  and  this.bar()
            const at = c.index;
            if (at > 0 && code[at - 1] === '.') continue;
            if (!called.has(name)) called.set(name, `${file}:${i + 1}`);
          }
        }
      }
    });
  }

  for (const [name, where] of called) {
    if (declared.has(name)) continue;
    const [file, line] = where.split(':');
    report(file, +line, `inline handler calls ${name}(), which is never defined — the control will do nothing when clicked`);
  }
}

console.log(problems ? `\n${problems} problem(s) found\n` : '  ✓ lint clean\n');
process.exit(problems ? 1 : 0);
