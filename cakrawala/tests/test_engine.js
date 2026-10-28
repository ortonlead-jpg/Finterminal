require(__dirname + '/../public/js/afl.js'); require(__dirname + '/../public/js/btengine.js');
let ok = 0, bad = 0; const t = (name, cond, info) => { if (cond) ok++; else { bad++; console.log('GAGAL', name, info === undefined ? '' : JSON.stringify(info)); } };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
// generator candle: random walk deterministik
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
function candles(n, start, drift, vol) { const out = []; let p = start, t0 = 1600000000; for (let i = 0; i < n; i++) { const o = p * (1 + (rnd() - .5) * vol * .5), c = o * (1 + drift + (rnd() - .5) * vol), h = Math.max(o, c) * (1 + rnd() * vol * .3), l = Math.min(o, c) * (1 - rnd() * vol * .3); out.push({ time: t0 + i * 86400, open: o, high: h, low: l, close: c, volume: 1e6 }); p = c; } return out; }
const N = 600, bench = candles(N, 5000, .0002, .01);
const uni = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE'].map((s, i) => ({ sym: s + '.JK', candles: candles(N, 1000 + i * 500, .0003, .03) }));
const data = BT.prepare(uni, bench);
const base = { maxPos: 5, sizing: 'equal', feeBuy: 0, feeSell: 0, slip: 0, lot: 100 };

// 1) Buy&Hold 1 saham tanpa biaya: ekuitas akhir ~ modal * C_akhir / O_hari2 (selisih hanya pembulatan lot)
{ const d1 = BT.prepare([uni[0]], bench), p = AFL.compile('Buy = 1; Sell = 0;'), sg = BT.signals(p, d1);
  const r = BT.simulate(d1, sg, { ...base, maxPos: 1 }, 0, N, 1e9), s = d1.syms[0];
  const expect = 1e9 * s.C[N - 1] / s.O[1]; t('B&H hasil', near(r.eq[N - 1], expect, 0.01), [r.eq[N - 1], expect]);
  t('B&H entry di open bar 2 (bukan close bar 1)', Math.abs(r.open[0].p0 - s.O[1]) < 1e-9, [r.open[0].p0, s.O[1], s.C[0]]); }

// 2) TANPA LOOK-AHEAD: sinyal beli hanya di bar k -> entry harus di O[k+1]
{ const d1 = BT.prepare([uni[1]], bench), s = d1.syms[0], k = 100;
  const sg = [{ buy: new Uint8Array(N).fill(0), sell: new Uint8Array(N), score: null }]; sg[0].buy[k] = 1; sg[0].sell[k + 20] = 1;
  const r = BT.simulate(d1, sg, { ...base, maxPos: 1 }, 0, N, 1e9);
  t('entry = open k+1', r.trades.length === 1 && Math.abs(r.trades[0].p0 - s.O[k + 1]) < 1e-9, r.trades[0]);
  t('exit = open k+21', Math.abs(r.trades[0].p1 - s.O[k + 21]) < 1e-9, [r.trades[0].p1, s.O[k + 21]]);
  t('bars = 20', r.trades[0].bars === 20, r.trades[0].bars); }

// 3) Akuntansi: closeAtEnd -> ekuitas akhir = modal + jumlah pnl semua trade (dengan fee & slip)
{ const p = AFL.compile('Buy = Cross(MA(C,5), MA(C,20)); Sell = Cross(MA(C,20), MA(C,5));'), sg = BT.signals(p, data);
  const cfg = { ...base, feeBuy: .15, feeSell: .25, slip: .1, closeAtEnd: true }, r = BT.simulate(data, sg, cfg, 30, N, 5e8);
  const sum = r.trades.reduce((a, x) => a + x.pnl, 0); t('ekuitas akhir = modal + sum(pnl)', near(r.eq[r.eq.length - 1], 5e8 + sum, 1e-9), [r.eq[r.eq.length - 1], 5e8 + sum]);
  t('ada trade', r.trades.length > 5, r.trades.length); }

// 4) Batas posisi & kas tidak negatif
{ const p = AFL.compile('Buy = 1; Sell = 0;'), sg = BT.signals(p, data), r = BT.simulate(data, sg, { ...base, maxPos: 2 }, 0, N, 1e8);
  const syms = new Set(r.open.map(o => o.sym)); t('maxPos=2 dihormati', r.open.length <= 2, r.open.length); t('kas >= 0', r.cash >= -1e-6, r.cash); }

// 5) Ranking: skor tertinggi diambil lebih dulu
{ const sc = Float64Array.from({ length: N }, () => 0), p = AFL.compile('Buy = 1; Sell = 0; PositionScore = C;'), sg = BT.signals(p, data);
  const r = BT.simulate(data, sg, { ...base, maxPos: 1 }, 0, N, 1e9); const best = data.syms.map((s, i) => [s.C[0], s.sym]).sort((a, b) => b[0] - a[0])[0][1];
  t('ranking pilih skor C tertinggi', r.open[0].sym === best, [r.open[0].sym, best]); }

// 6) Stop loss: gap turun -> keluar di open (bukan di level stop); non-gap -> tepat di level stop
{ const cs = []; for (let i = 0; i < 40; i++) cs.push({ time: 1600000000 + i * 86400, open: 1000, high: 1010, low: 990, close: 1000, volume: 1e6 });
  cs[20] = { ...cs[20], open: 1000, high: 1005, low: 900, close: 910 };           // intraday jatuh menembus SL 5% (950) -> keluar di 950
  const bnch = cs.map(c => ({ ...c })), d1 = BT.prepare([{ sym: 'X.JK', candles: cs }], bnch);
  const sg = [{ buy: Uint8Array.from({ length: 40 }, (_, i) => i === 5 ? 1 : 0), sell: new Uint8Array(40), score: null }];
  let r = BT.simulate(d1, sg, { ...base, maxPos: 1, sl: 5 }, 0, 40, 1e8); t('SL intraday keluar di level 950', r.trades.length === 1 && r.trades[0].why === 'SL' && near(r.trades[0].p1, 950), r.trades[0]);
  cs[20] = { ...cs[20], open: 900, high: 920, low: 880, close: 890 };            // gap turun: open 900 < 950 -> keluar di 900
  const d2 = BT.prepare([{ sym: 'X.JK', candles: cs }], bnch); r = BT.simulate(d2, sg, { ...base, maxPos: 1, sl: 5 }, 0, 40, 1e8);
  t('SL gap keluar di open 900', near(r.trades[0].p1, 900), r.trades[0]);
  cs[20] = { ...cs[20], open: 1000, high: 1100, low: 995, close: 1090 };         // TP 8% (1080) tersentuh -> keluar 1080
  const d3 = BT.prepare([{ sym: 'X.JK', candles: cs }], bnch); r = BT.simulate(d3, sg, { ...base, maxPos: 1, tp: 8 }, 0, 40, 1e8);
  t('TP keluar di 1080', r.trades[0].why === 'TP' && near(r.trades[0].p1, 1080), r.trades[0]); }

// 7) Optimasi + metrik masuk akal; walk-forward jalan; Monte Carlo
(async () => {
  const p = AFL.compile('f = Optimize("f",5,5,15,5); s = Optimize("s",20,20,40,10); Buy = Cross(MA(C,f), MA(C,s)); Sell = Cross(MA(C,s), MA(C,f));');
  const combos = BT.grid(p.params, {}); t('grid 3x3=9', combos.length === 9, combos.length);
  const sb = await BT.precompute(p, data, combos), rows = await BT.optimize(data, sb, combos, { ...base }, 'cagr', 3, 50, N, 1e9);
  t('optimasi 9 baris', rows.length === 9 && rows.every(r => Number.isFinite(r.m.cagr)), rows.length);
  const m = rows[0].m; t('metrik lengkap', ['sharpe', 'mdd', 'pf', 'win', 'exposure'].every(k => Number.isFinite(m[k])), m);
  t('mdd <= 0', rows.every(r => r.m.mdd <= 0));
  const wf = await BT.walkForward(data, sb, combos, base, 'cagr', 3, 40, 200, 100, 1e9);
  t('WF punya fold', wf.folds.length >= 2, wf.folds.length); t('WF ekuitas bersambung (panjang = fold*100)', wf.wf.eq.length === wf.folds.length * 100, [wf.wf.eq.length, wf.folds.length]);
  t('WF periode OOS tidak tumpang tindih IS', wf.folds.every(f => f.oosFrom > f.isTo), wf.folds[0]);
  const trades = rows[0].m.nTrades > 8 ? (BT.simulate(data, sb[0], { ...base, closeAtEnd: true }, 50, N, 1e9).trades) : [];
  const mc = BT.monteCarlo(trades.length >= 8 ? trades : Array.from({ length: 20 }, (_, i) => ({ frac: .2, ret: i % 3 ? .05 : -.04 })), 500); t('MC persentil terurut', mc.fin[0] <= mc.fin[2] && mc.fin[2] <= mc.fin[4], mc.fin);
  // look-ahead guard di formula tidak bisa dilewati lewat optimasi
  try { AFL.compile('Buy = Ref(C,1)>C;').run({ n: 5, c: new Float64Array(5), o: new Float64Array(5), h: new Float64Array(5), l: new Float64Array(5), v: new Float64Array(5) }); t('Ref(+1) ditolak', false); } catch (e) { t('Ref(+1) ditolak', true); }
  console.log(`btengine: ${ok} lolos, ${bad} gagal`); process.exitCode=bad?1:0;
})();
