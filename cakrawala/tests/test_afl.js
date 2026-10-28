require(__dirname + '/../public/js/afl.js');
const n = 10, c = Float64Array.from([1,2,3,4,5,4,3,2,3,4]);
const env = { n, c, o: c, h: c.map(x => x + 1), l: c.map(x => x - 1), v: new Float64Array(n).fill(100) };
let ok = 0, bad = 0; const eq = (name, got, exp) => { const g = JSON.stringify(Array.from(got, x => Number.isNaN(x) ? null : +x.toFixed(4))), e = JSON.stringify(exp); if (g === e) ok++; else { bad++; console.log('GAGAL', name, g, 'harusnya', e); } };
const run = (src, over) => AFL.compile(src).run(env, over);
eq('MA3', run('Buy = MA(C,3) > 0; x=1;').buy, [0,0,1,1,1,1,1,1,1,1]);                 // warm-up -> NaN > 0 = 0
eq('Cross', run('Buy = Cross(C, 3.5);').buy, [0,0,0,1,0,0,0,0,0,1]);                  // naik melewati 3.5 di idx 3 dan 9
eq('Ref', run('Buy = C > Ref(C,-1);').buy, [0,1,1,1,1,0,0,0,1,1]);
eq('HHV3', run('x = HHV(C,3); Buy = x == 5;').buy, [0,0,0,0,1,1,1,0,0,0]);
eq('ExRem', run('Buy = ExRem(C>2, C>4);').buy, [0,0,1,0,0,1,0,0,0,0]);
eq('operator', run('Buy = (C>=3 AND C<=4) OR C==1;').buy, [1,0,1,1,0,1,1,0,1,1]);
eq('NOT', run('Buy = NOT (C>2);').buy, [1,1,0,0,0,0,0,1,0,0]);
// RSI wilder: seri naik terus -> 100
const e2 = { ...env, c: Float64Array.from([1,2,3,4,5,6,7,8,9,10]) }; const r = AFL.compile('Buy = RSI(3) == 100;').run(e2); eq('RSI100', r.buy, [0,0,0,1,1,1,1,1,1,1]);
// Optimize: param ditemukan dan dapat di-override
const p = AFL.compile('n = Optimize("n", 3, 2, 5, 1); Buy = C > MA(C,n);'); console.log('params', JSON.stringify(p.params));
if (JSON.stringify(p.run(env, { n: 2 }).buy) === JSON.stringify(p.run(env, { n: 3 }).buy)) { bad++; console.log('GAGAL override tak berpengaruh'); } else ok++;
// pengaman look-ahead & error
for (const [s, pat] of [['Buy = Ref(C,1) > C;', /masa depan/], ['Buy = foo(C);', /tidak dikenal/], ['Buy = C >;', /tiba-tiba|tak terduga/], ['Sell = C>1;', /harus mengisi/], ['Buy = x > 1;', /belum didefinisikan/], ['Buy = C > 1', null]]) {
  try { run(s); if (pat) { bad++; console.log('GAGAL harus error:', s); } else ok++; } catch (e) { if (pat && pat.test(e.message)) ok++; else if (!pat) ok++; else { bad++; console.log('GAGAL pesan:', s, e.message); } } }
console.log(`afl: ${ok} lolos, ${bad} gagal`); process.exitCode=bad?1:0;
