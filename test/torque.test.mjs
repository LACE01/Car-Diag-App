import fs from 'node:fs';
const src = fs.readFileSync('public/js/torque.js','utf8');
const mod = new Function(src.slice(src.indexOf('const LAYOUTS'), src.indexOf('/* ---------- render')) +
  '; return {circularOrder, centreOutOrder, positionsFor, buildPattern};')();
let pass=0, fail=0;
const t=(name,ok,extra)=>{ ok?pass++:fail++; console.log((ok?'  ✓ ':'  ✗ ')+name+(extra&&!ok?'  '+extra:'')); };

const expect = { 4:'1,3,2,4', 5:'1,3,5,2,4', 6:'1,4,2,5,3,6', 8:'1,5,3,7,2,6,4,8', 10:'1,6,3,8,5,10,2,7,4,9' };
for (const n of Object.keys(expect).map(Number)) {
  const got = mod.circularOrder(n).map(x=>x+1).join(',');
  t(`${n}-lug star = ${expect[n]}`, got===expect[n], 'got '+got);
}
const p = mod.buildPattern({layout:'head-inline', bolt_count:10, rows:2});
const cx = p.positions.reduce((s,q)=>s+q.x,0)/10;
const worst = Math.max(...p.positions.map(q=>Math.abs(q.x-cx)));
t('head: first two are the centre pair', p.order.slice(0,2).every(i=>Math.abs(p.positions[i].x-cx) < worst*0.2), p.number.join(','));
t('head: first two are on different rows', p.positions[p.order[0]].y !== p.positions[p.order[1]].y);
const sides = p.order.slice(2,6).map(i => p.positions[i].x < cx ? 'L':'R').join('');
t('head: alternates side to side working out', /LR|RL/.test(sides), sides);
t('head: last bolt is an outer one', Math.abs(p.positions[p.order[9]].x-cx) > worst*0.8);
for (const [lay,n] of [['rect',12],['circular',6],['linear',6],['wheel',5],['head-v',8],['head-inline',14]]) {
  const q = mod.buildPattern({layout:lay, bolt_count:n});
  t(`${lay} ${n}: every position numbered 1..${n} once`,
    new Set(q.number).size===n && q.number.slice().sort((a,b)=>a-b).every((v,i)=>v===i+1));
  t(`${lay} ${n}: no NaN coordinates`, q.positions.every(z=>Number.isFinite(z.x)&&Number.isFinite(z.y)));
}
const e2 = mod.buildPattern({layout:'circular', bolt_count:2});
t('degenerate 2-bolt does not crash', e2.n===2 && new Set(e2.number).size===2);
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
