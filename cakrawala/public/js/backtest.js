// BACKTEST (gaya AmiBroker): formula AFL, portofolio multi-saham, ranking, stop, optimasi, walk-forward, Monte Carlo, scan.
(() => {
  const PRESETS = {
    'Persilangan SMA (optimasi)': `// Beli saat SMA cepat memotong naik SMA lambat
f = Optimize("cepat", 20, 10, 40, 10);
s = Optimize("lambat", 50, 40, 120, 20);
Buy  = Cross(MA(C,f), MA(C,s));
Sell = Cross(MA(C,s), MA(C,f));
PositionScore = ROC(C,60);   // jika slot terbatas, pilih momentum terkuat`,
    'Rotasi momentum + filter pasar': `// Pegang saham dengan momentum terkuat, hanya saat IHSG di atas MA200
n   = Optimize("momentum", 60, 20, 120, 20);
mk  = BenchC > MA(BenchC,200);
Buy  = mk AND ROC(C,n) > 0 AND C > MA(C,100);
Sell = NOT mk OR ROC(C,n) < 0 OR C < MA(C,100);
PositionScore = ROC(C,n);`,
    'Breakout Donchian': `// Beli tembus tertinggi N hari, keluar di terendah M hari
n = Optimize("masuk", 55, 20, 100, 20);
m = Optimize("keluar", 20, 10, 30, 10);
Buy  = C > Ref(HHV(H,n),-1) AND V > MA(V,20);
Sell = C < Ref(LLV(L,m),-1);
PositionScore = ROC(C,60);`,
    'RSI rebound dalam tren naik': `// Beli koreksi (RSI rendah) hanya jika tren jangka panjang naik
lo = Optimize("RSI beli", 30, 20, 40, 5);
hi = Optimize("RSI jual", 55, 50, 70, 5);
up = C > MA(C,200);
Buy  = up AND RSI(14) < lo;
Sell = RSI(14) > hi OR C < MA(C,200);
PositionScore = 100 - RSI(14);`,
    'Breakout volatilitas (ATR)': `// Beli saat harga naik melebihi kemarin + k x ATR, dengan volume di atas rata-rata
k = Optimize("k ATR", 1.5, 1, 3, 0.5);
Buy  = C > Ref(C,-1) + k * ATR(14) AND V > 1.5 * MA(V,20) AND C > MA(C,50);
Sell = C < MA(C,20);
PositionScore = (C - Ref(C,-1)) / ATR(14);`,
    'Buy & Hold (pembanding)': `Buy  = 1;
Sell = 0;`,
  };
  const DEFAULT = { formula: PRESETS['Persilangan SMA (optimasi)'], universe: 'watch', single: 'BBCA', custom: '', years: 5, equity: 1e9, maxPos: 10, sizing: 'equal', pct: 10, fixed: 1e8, slip: 0.1, sl: 0, trail: 0, tp: 0, nbar: 0, obj: 'cagr', minTr: 30, isM: 36, oosM: 12, ranges: {} };
  let box, st, tab = 'res', over = {}, lastRun = null, cancel = false, busy = false;
  const num = (id, d = 0) => { const v = parseFloat(String(($(id) || {}).value).replace(',', '.')); return Number.isFinite(v) ? v : d; };
  const fetchRange = y => y <= 3 ? '5y' : '10y';
  const dataCache = {};

  // ---- legacy untuk menu Algo (sinyal bar-terakhir per strategi bawaan) ----
  const smaArr = (v, n) => v.map((_, i) => i < n - 1 ? null : v.slice(i - n + 1, i + 1).reduce((s, x) => s + x, 0) / n);
  function legacySignals(kind, c, p) {
    const n = c.length, cl = c.map(x => x.close), sig = new Array(n).fill(0);
    if (kind === 'sma') { const f = smaArr(cl, p.fast), s = smaArr(cl, p.slow); for (let i = 0; i < n; i++) sig[i] = f[i] != null && s[i] != null && f[i] > s[i] ? 1 : 0; return sig; }
    if (kind === 'rsi') { const arr = new Float64Array(n).fill(NaN); let ag = 0, al = 0; for (let i = 1; i < n; i++) { const d = cl[i] - cl[i - 1], g = Math.max(d, 0), l = Math.max(-d, 0); if (i <= p.n) { ag += g / p.n; al += l / p.n; if (i === p.n) arr[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); } else { ag = (ag * (p.n - 1) + g) / p.n; al = (al * (p.n - 1) + l) / p.n; arr[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); } } let s = 0; for (let i = 0; i < n; i++) { if (arr[i] === arr[i]) { if (arr[i] < p.lo) s = 1; else if (arr[i] > p.hi) s = 0; } sig[i] = s; } return sig; }
    if (kind === 'don') { let s = 0; for (let i = 0; i < n; i++) { if (i >= p.n && cl[i] > Math.max(...c.slice(i - p.n, i).map(x => x.high))) s = 1; if (i >= p.m && cl[i] < Math.min(...c.slice(i - p.m, i).map(x => x.low))) s = 0; sig[i] = s; } return sig; }
    return sig.fill(1);
  }

  // ---- data ----
  const universe = () => st.universe === 'single' ? [T.sym(st.single)] : st.universe === 'custom' ? st.custom.toUpperCase().split(/[\s,]+/).filter(Boolean).map(T.sym) : T.data.settings.watchlist.map(T.sym);
  const setStatus = t => { const e = $('btStatus'); if (e) e.innerHTML = t; };
  async function load() {
    const syms = universe(), range = fetchRange(st.years), key = syms.join(',') + '|' + range;
    if (!dataCache[key]) {
      setStatus(`<span class="dim">Mengunduh ${syms.length} saham + IHSG (${range}) …</span>`);
      const bench = await T.series('^JKSE', range, '1d'), got = [];
      for (let i = 0; i < syms.length; i += 6) await Promise.all(syms.slice(i, i + 6).map(async s => { try { const c = await T.series(s, range, '1d'); if (c.length > 100) got.push({ sym: s, candles: c }); } catch (e) {} }));
      if (!got.length) throw new Error('Tidak ada data saham yang berhasil diunduh.');
      got.sort((a, b) => syms.indexOf(a.sym) - syms.indexOf(b.sym));
      dataCache[key] = BT.prepare(got, bench);
    }
    const data = dataCache[key], days = Math.round(st.years * 252), t0 = Math.max(1, data.n - days);
    return { data, t0, t1: data.n };
  }
  const cfgOf = () => ({ maxPos: st.maxPos, sizing: st.sizing, pct: st.pct, fixed: st.fixed, feeBuy: T.data.settings.feeBuy, feeSell: T.data.settings.feeSell, slip: st.slip, sl: st.sl, trail: st.trail, tp: st.tp, nbar: st.nbar, lot: 100 });
  function readForm() {
    Object.assign(st, { formula: $('btFormula').value, universe: $('btUni').value, single: $('btSingle').value, custom: $('btCustom').value, years: num('btYears', 5), equity: num('btEq', 1e9), maxPos: Math.max(1, num('btMax', 10)), sizing: $('btSize').value,
      pct: num('btPct', 10), fixed: num('btFixed', 1e8), slip: num('btSlip', 0.1), sl: num('btSl'), trail: num('btTr'), tp: num('btTp'), nbar: num('btNb') });
    T.data.bt = st; T.save();
  }
  const compileFormula = () => { try { return AFL.compile(st.formula); } catch (e) { throw new Error('Formula: ' + e.message); } };
  const bench = (data, t0, startEq) => { const e = new Float64Array(data.n - t0), ref = data.bench[t0 - 1]; for (let i = t0; i < data.n; i++) e[i - t0] = startEq * data.bench[i] / ref; return { eq: e, invested: new Float64Array(e.length), trades: [], startEq, dates: data.dates.slice(t0) }; };

  // ---- tampilan umum ----
  const k = (l, v, c = '') => `<div><small>${l}</small><b class="${c}">${v}</b></div>`;
  function chartBox(id, h) { return `<div id="${id}" style="height:${h}px"></div>`; }
  function mkChart(id, opt = {}) { return LightweightCharts.createChart($(id), { autoSize: true, layout: { background: { color: '#111113' }, textColor: '#7d7d85', fontFamily: 'ui-monospace,Menlo,monospace' }, grid: { vertLines: { color: '#17171a' }, horzLines: { color: '#17171a' } }, rightPriceScale: { borderColor: '#222226' }, timeScale: { borderColor: '#222226' }, ...opt }); }
  const pctS = (v, d = 1) => (v > 0 ? '+' : '') + T.fmt(v, d) + '%';
  const fover = o => Object.entries(o).map(([a, b]) => `${a}=${b}`).join(', ') || 'bawaan';

  function resultsHTML(r, m, bm, res) {
    const reasons = {}; r.trades.forEach(t => reasons[t.why] = (reasons[t.why] || 0) + 1);
    const mo = BT.monthly(r), years = [...new Set(Object.keys(mo).map(x => x.slice(0, 4)))];
    const heat = v => v == null ? '' : `background:${v >= 0 ? 'rgba(34,197,94,' + Math.min(.55, v / 15) : 'rgba(239,68,68,' + Math.min(.55, -v / 15)})`;
    return `<div class="kpi">${k('CAGR', pctS(m.cagr), T.cls(m.cagr))}${k('Return total', pctS(m.total, 0), T.cls(m.total))}${k('Max drawdown', T.pct(m.mdd), 'dn')}${k('Sharpe', T.fmt(m.sharpe))}${k('Sortino', T.fmt(m.sortino))}${k('Calmar', T.fmt(m.calmar))}${k('Profit factor', T.fmt(m.pf))}
      ${k('Win rate', T.pct(m.win, 0))}${k('Jumlah trade', m.nTrades)}${k('Waktu di pasar', T.pct(m.exposure, 0))}${k('Ulcer index', T.fmt(m.ulcer))}${k('Rata2 hari dipegang', T.fmt(m.avgBars, 0))}</div>
      <div class="cols"><section class="p s8"><h2><span class="t">EKUITAS vs IHSG (awal = 100) · parameter: ${T.esc(fover(over))}</span></h2>${chartBox('btEqC', 300)}</section>
        <section class="p s4"><h2><span class="t">PEMBANDING IHSG (periode sama)</span></h2><div class="body"><table><thead><tr><th class="l"></th><th>STRATEGI</th><th>IHSG</th></tr></thead>
          ${[['CAGR', m.cagr, bm.cagr, pctS], ['Max drawdown', m.mdd, bm.mdd, v => T.pct(v)], ['Sharpe', m.sharpe, bm.sharpe, v => T.fmt(v)], ['Calmar', m.calmar, bm.calmar, v => T.fmt(v)]].map(([l, a, b, f]) => `<tr class="nohov"><td class="l dim">${l}</td><td class="${T.cls(a)}">${f(a)}</td><td class="${T.cls(b)}">${f(b)}</td></tr>`).join('')}</table>
          <div class="pad" style="border-top:1px solid var(--line)"><div class="dim" style="margin-bottom:4px">Alasan keluar</div>${Object.entries(reasons).map(([a, b]) => `<span class="tag">${a}: ${b}</span>`).join('') || '—'}
          <div class="dim" style="margin:8px 0 4px">Trade</div>Rata2 menang <span class="up">${pctS(m.avgWin)}</span> · rata2 kalah <span class="dn">${pctS(m.avgLoss)}</span> · payoff ${T.fmt(m.payoff)}<br>Ekspektasi/trade ${pctS(m.expect, 2)} · kalah beruntun maks ${m.maxLossStreak}<br>Terbaik ${pctS(m.best)} · terburuk ${pctS(m.worst)}<br>Drawdown terlama ${m.ddDays} hari bursa</div></div></section></div>
      <div class="p" style="margin-top:8px"><h2><span class="t">DRAWDOWN</span></h2>${chartBox('btDd', 130)}</div>
      <div class="p" style="margin-top:8px"><h2><span class="t">RETURN BULANAN (%)</span></h2><div class="body"><table><thead><tr><th class="l">TAHUN</th>${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'].map(x => `<th>${x}</th>`).join('')}<th>TAHUN</th></tr></thead><tbody>
        ${years.map(y => { let comp = 1; const cells = Array.from({ length: 12 }, (_, i) => { const v = mo[`${y}-${String(i + 1).padStart(2, '0')}`]; if (v != null) comp *= 1 + v / 100; return `<td style="${heat(v)}">${v == null ? '' : T.fmt(v, 1)}</td>`; }); return `<tr class="nohov"><td class="l">${y}</td>${cells.join('')}<td class="${T.cls(comp - 1)}"><b>${T.fmt((comp - 1) * 100, 1)}</b></td></tr>`; }).join('')}</tbody></table></div></div>
      <div class="p" style="margin-top:8px"><h2><span class="t">DAFTAR TRADE (${r.trades.length} selesai, ${r.open.length} terbuka)</span></h2><div class="body" style="max-height:340px"><table><thead><tr><th class="l">KODE</th><th class="l">MASUK</th><th class="l">KELUAR</th><th>HARGA M</th><th>HARGA K</th><th>LOT</th><th>RETURN</th><th>P&amp;L (Rp)</th><th>HARI</th><th class="l">ALASAN</th></tr></thead><tbody>
        ${r.open.map(t => `<tr class="nohov"><td class="l">${T.disp(t.sym)}</td><td class="l">${t.d0}</td><td class="l"><span class="tag">terbuka</span></td><td>${T.fmt(t.p0, 0)}</td><td>${T.fmt(t.p1, 0)}</td><td>${t.qty / 100}</td><td class="${T.cls(t.ret)}">${pctS(t.ret * 100)}</td><td class="${T.cls(t.pnl)}">${T.fmt(t.pnl, 0)}</td><td></td><td class="l dim">belum keluar</td></tr>`).join('')}
        ${r.trades.slice().reverse().slice(0, 200).map(t => `<tr class="nohov"><td class="l">${T.disp(t.sym)}</td><td class="l">${t.d0}</td><td class="l">${t.d1}</td><td>${T.fmt(t.p0, 0)}</td><td>${T.fmt(t.p1, 0)}</td><td>${t.qty / 100}</td><td class="${T.cls(t.ret)}">${pctS(t.ret * 100)}</td><td class="${T.cls(t.pnl)}">${T.fmt(t.pnl, 0)}</td><td>${t.bars}</td><td class="l dim">${t.why}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function drawResultCharts(r, bres) {
    const eq = mkChart('btEqC'); const a = eq.addLineSeries({ color: '#e8731a', lineWidth: 2, title: 'Strategi' }), b = eq.addLineSeries({ color: '#7d7d85', lineWidth: 1, title: 'IHSG' });
    a.setData(r.dates.map((d, i) => ({ time: d, value: r.eq[i] / r.startEq * 100 }))); b.setData(bres.dates.map((d, i) => ({ time: d, value: bres.eq[i] / bres.startEq * 100 }))); eq.timeScale().fitContent();
    const dd = mkChart('btDd'), s = dd.addAreaSeries({ lineColor: '#ef4444', topColor: 'rgba(239,68,68,.05)', bottomColor: 'rgba(239,68,68,.35)', invertFilteredRange: true }); let pk = 0;
    s.setData(r.dates.map((d, i) => { pk = Math.max(pk, r.eq[i]); return { time: d, value: (r.eq[i] / pk - 1) * 100 }; })); dd.timeScale().fitContent();
  }

  // ---- aksi ----
  async function run() {
    if (busy) return; busy = true; readForm(); const out = $('btOut');
    try {
      const prog = compileFormula(); out.innerHTML = '<div class="pad dim">menghitung…</div>';
      const { data, t0, t1 } = await load(); setStatus('');
      const sg = BT.signals(prog, data, over), r = BT.simulate(data, sg, cfgOf(), t0, t1, st.equity), m = BT.metrics(r), bres = bench(data, t0, st.equity), bm = BT.metrics(bres);
      if (sg.some(g => g.short)) setStatus('<span class="warn">Short/Cover diabaikan: hanya long-only.</span>');
      lastRun = { r, m, prog, data, t0, t1 }; tab = 'res'; tabs();
      $('btOut').innerHTML = resultsHTML(r, m, bm, r); drawResultCharts(r, bres);
      if (!r.trades.length && !r.open.length) $('btOut').insertAdjacentHTML('afterbegin', '<div class="pad warn">Tidak ada trade. Periksa Buy/Sell, atau perluas universe dan periode.</div>');
    } catch (e) { out.innerHTML = `<div class="err">${T.esc(e.message)}</div>`; setStatus(''); }
    busy = false;
  }
  function rangesUI(prog) {
    if (!prog.params.length) return '<div class="note">Formula belum punya parameter. Tambahkan <b>Optimize("nama", default, min, max, step)</b> untuk dioptimasi.</div>';
    return `<div class="row">${prog.params.map(p => { const r = st.ranges[p.name] || p; return `<div class="p pad" style="min-width:180px"><b>${T.esc(p.name)}</b><div class="row" style="margin:6px 0 0">${['min', 'max', 'step'].map(f => `<label>${f}<input data-r="${T.esc(p.name)}|${f}" type="number" step="any" value="${r[f]}" style="width:60px"></label>`).join('')}</div></div>`; }).join('')}</div>`;
  }
  function getGrid(prog) {
    const rg = {}; box.querySelectorAll('[data-r]').forEach(i => { const [n, f] = i.dataset.r.split('|'); (rg[n] = rg[n] || { ...(st.ranges[n] || prog.params.find(p => p.name === n)) })[f] = +i.value; });
    st.ranges = { ...st.ranges, ...rg }; T.data.bt = st; T.save();
    const combos = BT.grid(prog.params, rg); if (combos.length > 400) throw new Error(`${combos.length} kombinasi terlalu banyak (maks 400). Persempit rentang atau perbesar step.`);
    if (!combos.length) throw new Error('Rentang parameter tidak valid.'); return combos;
  }
  const progBar = (what, i, n) => setStatus(`<span class="dim">${what} ${i}${n ? '/' + n : ''} … </span><button class="btn sm red" id="btCancel">BATAL</button>`) || ($('btCancel') && ($('btCancel').onclick = () => cancel = true));

  async function optimizeRun() {
    if (busy) return; busy = true; cancel = false; readForm(); const out = $('btOpt');
    try {
      const prog = compileFormula(), combos = getGrid(prog), obj = $('btObj').value, minTr = num('btMin', 30); st.obj = obj; st.minTr = minTr;
      const { data, t0, t1 } = await load(), cfg = cfgOf();
      const sb = await BT.precompute(prog, data, combos, progBar, () => cancel);
      const rows = await BT.optimize(data, sb, combos, cfg, obj, minTr, t0, t1, st.equity, progBar, () => cancel); setStatus('');
      rows.sort((a, b) => b.score - a.score);
      const valid = rows.filter(r => r.score > -1e8), med = valid.length ? valid.map(r => r.score).sort((a, b) => a - b)[Math.floor(valid.length / 2)] : NaN, prof = valid.filter(r => r.m.cagr > 0).length;
      lastRun = { ...(lastRun || {}), opt: { rows, prog, combos, sb, data, t0, t1, cfg, obj, minTr } };
      const names = prog.params.map(p => p.name);
      let heat = '';
      if (names.length === 2) {
        const [a, b] = names, av = [...new Set(combos.map(c => c[a]))], bv = [...new Set(combos.map(c => c[b]))], map = new Map(rows.map(r => [r.over[a] + '|' + r.over[b], r])), ss = valid.map(r => r.score), lo = Math.min(...ss), hi = Math.max(...ss);
        heat = `<div class="p" style="margin-bottom:8px"><h2><span class="t">PETA PANAS ${T.esc(a)} × ${T.esc(b)} (${obj})</span></h2><div class="pad"><table><thead><tr><th class="l">${T.esc(a)} \\ ${T.esc(b)}</th>${bv.map(v => `<th>${v}</th>`).join('')}</tr></thead><tbody>${av.map(x => `<tr class="nohov"><td class="l">${x}</td>${bv.map(y => { const r = map.get(x + '|' + y), v = r && r.score > -1e8 ? r.score : null; const t = v == null ? 0 : Math.abs(v) / (Math.max(Math.abs(lo), Math.abs(hi)) || 1); return `<td style="background:${v == null ? '#1a1a1d' : v >= 0 ? `rgba(34,197,94,${.12 + t * .55})` : `rgba(239,68,68,${.12 + t * .45})`}" ${v == null ? 'title="trade kurang dari minimum"' : ''}>${v == null ? '–' : T.fmt(v, 1)}</td>`; }).join('')}</tr>`).join('')}</tbody></table><div class="note">Hijau = skor positif, merah = negatif. Cari "dataran" hijau yang luas. Satu sel hijau terang di tengah sel merah/kosong biasanya hanya kebetulan (overfit).</div></div></div>`;
      }
      out.innerHTML = `<div class="kpi">${k('Kombinasi diuji', rows.length)}${k('Memenuhi min. trade', valid.length)}${k('Untung (CAGR>0)', `${prof} / ${valid.length}`)}${k('Skor terbaik', T.fmt(rows[0].score))}${k('Skor median', T.fmt(med))}</div>${heat}
        <div class="p"><h2><span class="t">HASIL OPTIMASI (periode IN-SAMPLE, urut ${obj})</span></h2><div class="body" style="max-height:420px"><table><thead><tr><th class="l">PARAMETER</th><th>CAGR</th><th>MDD</th><th>SHARPE</th><th>CALMAR</th><th>PF</th><th>TRADE</th><th>SKOR</th><th></th></tr></thead><tbody>
        ${rows.slice(0, 40).map((r, i) => `<tr class="nohov"><td class="l">${T.esc(fover(r.over))}</td><td class="${T.cls(r.m.cagr)}">${pctS(r.m.cagr)}</td><td class="dn">${T.pct(r.m.mdd)}</td><td>${T.fmt(r.m.sharpe)}</td><td>${T.fmt(r.m.calmar)}</td><td>${T.fmt(r.m.pf)}</td><td>${r.m.nTrades}</td><td>${r.score > -1e8 ? T.fmt(r.score) : '<span class="dim">trade sedikit</span>'}</td><td><button class="btn sm" data-use="${i}">PAKAI</button></td></tr>`).join('')}</tbody></table></div></div>
        <div class="note warn">Ini hasil in-sample: parameter terbaik dipilih dengan melihat data yang sama. Jangan percaya angka ini sendirian. Uji di tab WALK-FORWARD untuk melihat apakah parameter itu bertahan di data yang belum dilihat.</div>`;
      out.querySelectorAll('[data-use]').forEach(b => b.onclick = () => { over = { ...rows[+b.dataset.use].over }; tab = 'res'; tabs(); run(); });
    } catch (e) { out.innerHTML = `<div class="err">${T.esc(e.message)}</div>`; setStatus(''); }
    busy = false;
  }
  async function wfRun() {
    if (busy) return; busy = true; cancel = false; readForm(); const out = $('btWf');
    try {
      const prog = compileFormula(); if (!prog.params.length) throw new Error('Walk-forward butuh parameter Optimize() di formula.');
      const combos = getGrid(prog), obj = $('btObj').value, minTr = num('btMin', 30), isM = num('btIs', 36), oosM = num('btOos', 12); st.isM = isM; st.oosM = oosM; st.obj = obj; st.minTr = minTr;
      const { data, t0 } = await load(), cfg = cfgOf();
      const first = Math.max(1, data.n - Math.round((st.years + 0) * 252));
      const sb = await BT.precompute(prog, data, combos, progBar, () => cancel);
      const w = await BT.walkForward(data, sb, combos, cfg, obj, minTr, first, Math.round(isM * 21), Math.round(oosM * 21), st.equity, progBar, () => cancel); setStatus('');
      const base = bench(data, data.dates.indexOf(w.wf.dates[0]), st.equity), wm = w.m, cm = w.cheatM, bm = BT.metrics(base);
      lastRun = { ...(lastRun || {}), wf: w };
      out.innerHTML = `<div class="kpi">${k('Jumlah fold', w.folds.length)}${k('CAGR in-sample rata2', pctS(w.avgIsCagr), T.cls(w.avgIsCagr))}${k('CAGR out-of-sample (WF)', pctS(wm.cagr), T.cls(wm.cagr))}${k('Walk-forward efficiency', w.wfe == null ? 'n/a (CAGR IS ≤ 0)' : T.fmt(w.wfe * 100, 0) + '%')}${k('MDD (WF)', T.pct(wm.mdd), 'dn')}${k('IHSG periode sama', pctS(bm.cagr), T.cls(bm.cagr))}</div>
        <div class="p"><h2><span class="t">EKUITAS OUT-OF-SAMPLE</span></h2>${chartBox('btWfc', 280)}</div>
        <div class="note">Oranye = walk-forward jujur (parameter dipilih hanya dari masa lalu). Abu-abu putus = parameter "terbaik" dipilih dengan melihat seluruh periode (curang, CAGR ${pctS(cm ? cm.cagr : 0)}). Jarak antar keduanya adalah ukuran overfit. Efisiensi di bawah ~50% berarti hasil in-sample banyak yang tidak bertahan.</div>
        <div class="p" style="margin-top:8px"><h2><span class="t">FOLD</span></h2><div class="body"><table><thead><tr><th class="l">IN-SAMPLE</th><th class="l">OUT-OF-SAMPLE</th><th class="l">PARAMETER TERPILIH</th><th>CAGR IS</th><th>CAGR OOS</th><th>MDD OOS</th><th>TRADE OOS</th></tr></thead><tbody>
        ${w.folds.map(f => `<tr class="nohov"><td class="l">${f.isFrom} → ${f.isTo}</td><td class="l">${f.oosFrom} → ${f.oosTo}</td><td class="l">${T.esc(fover(f.over))}</td><td class="${T.cls(f.isM.cagr)}">${pctS(f.isM.cagr)}</td><td class="${T.cls(f.oosM.cagr)}">${pctS(f.oosM.cagr)}</td><td class="dn">${T.pct(f.oosM.mdd)}</td><td>${f.oosM.nTrades}</td></tr>`).join('')}</tbody></table></div></div>`;
      const ch = mkChart('btWfc'), a = ch.addLineSeries({ color: '#e8731a', lineWidth: 2, title: 'Walk-forward' }), b = ch.addLineSeries({ color: '#7d7d85', lineWidth: 1, title: 'IHSG' }), c = ch.addLineSeries({ color: '#22d3ee', lineWidth: 1, lineStyle: 2, title: 'Optimasi curang' });
      a.setData(w.wf.dates.map((d, i) => ({ time: d, value: w.wf.eq[i] / st.equity * 100 }))); b.setData(base.dates.map((d, i) => ({ time: d, value: base.eq[i] / st.equity * 100 })));
      if (w.cheat) c.setData(w.cheat.dates.map((d, i) => ({ time: d, value: w.cheat.eq[i] / st.equity * 100 }))); ch.timeScale().fitContent();
    } catch (e) { out.innerHTML = `<div class="err">${T.esc(e.message)}</div>`; setStatus(''); }
    busy = false;
  }
  function mcRun() {
    const out = $('btMc'); if (!lastRun || !lastRun.r) { out.innerHTML = '<div class="pad dim">Jalankan backtest di tab HASIL dulu.</div>'; return; }
    const trades = lastRun.r.trades, mc = BT.monteCarlo(trades, num('btN', 2000));
    if (!mc) { out.innerHTML = `<div class="pad warn">Trade terlalu sedikit (${trades.length}) untuk Monte Carlo yang bermakna (minimal 8).</div>`; return; }
    const mx = Math.max(...mc.hist.map(Math.abs)), bins = 24, lo = Math.min(...mc.hist), hi = Math.max(...mc.hist), cnt = new Array(bins).fill(0); mc.hist.forEach(v => cnt[Math.min(bins - 1, Math.floor((v - lo) / ((hi - lo) || 1) * bins))]++);
    const top = Math.max(...cnt);
    out.innerHTML = `<div class="kpi">${k('Simulasi', mc.nSim)}${k('Trade diacak ulang', mc.n)}${k('Peluang rugi', T.pct(mc.pLoss, 1), mc.pLoss > 20 ? 'dn' : '')}${k('Return median', pctS(mc.fin[2], 0), T.cls(mc.fin[2]))}${k('MDD median', T.pct(mc.dd[2]), 'dn')}${k('MDD kasus buruk (5%)', T.pct(mc.dd[0]), 'dn')}</div>
      <div class="cols"><section class="p s6"><h2><span class="t">PERSENTIL RETURN AKHIR</span></h2><div class="body"><table>${[['5% terburuk', mc.fin[0]], ['25%', mc.fin[1]], ['Median', mc.fin[2]], ['75%', mc.fin[3]], ['95% terbaik', mc.fin[4]]].map(([l, v]) => `<tr class="nohov"><td class="l dim">${l}</td><td class="${T.cls(v)}">${pctS(v, 0)}</td></tr>`).join('')}</table></div></section>
        <section class="p s6"><h2><span class="t">SEBARAN RETURN AKHIR</span></h2><div class="pad" style="display:flex;align-items:flex-end;gap:2px;height:150px">${cnt.map((c, i) => `<div title="${T.fmt(lo + (hi - lo) * i / bins, 0)}%" style="flex:1;height:${c / top * 100}%;background:${lo + (hi - lo) * (i + .5) / bins >= 0 ? 'var(--up)' : 'var(--dn)'};opacity:.8"></div>`).join('')}</div><div class="note pad">${T.fmt(lo, 0)}% … ${T.fmt(hi, 0)}%</div></section></div>
      <div class="note">Urutan trade diacak ulang (bootstrap) untuk melihat seberapa besar hasil bergantung pada urutan keberuntungan. Aproksimasi: tiap trade dianggap menggeser ekuitas sebesar bobot posisi × return, tanpa tumpang tindih. Tidak menguji risiko yang tidak ada di data masa lalu.</div>`;
  }
  async function scanRun() {
    if (busy) return; busy = true; readForm(); const out = $('btScan');
    try {
      const prog = compileFormula(); out.innerHTML = '<div class="pad dim">memindai…</div>'; const { data } = await load(); setStatus('');
      const rows = BT.scan(prog, data, over).sort((a, b) => (b.buy - a.buy) || ((b.score ?? -1e9) - (a.score ?? -1e9)));
      const buys = rows.filter(r => r.buy);
      out.innerHTML = `<div class="kpi">${k('Saham dipindai', rows.length)}${k('Sinyal BUY di bar terakhir', buys.length, buys.length ? 'up' : '')}${k('Sinyal SELL', rows.filter(r => r.sell).length)}${k('Bar terakhir', data.dates[data.n - 1])}</div>
        <div class="p"><div class="body" style="max-height:480px"><table><thead><tr><th class="l">KODE</th><th>CLOSE</th><th>BUY</th><th>SELL</th><th>SKOR</th></tr></thead><tbody>${rows.map(r => `<tr data-s="${r.sym}"><td class="l">${T.disp(r.sym)}</td><td>${T.fmt(r.close, 0)}</td><td class="${r.buy ? 'up' : 'dim'}">${r.buy ? '● BUY' : '–'}</td><td class="${r.sell ? 'dn' : 'dim'}">${r.sell ? '● SELL' : '–'}</td><td>${r.score == null ? '—' : T.fmt(r.score)}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="note">Sinyal dihitung dari penutupan bar terakhir; sesuai aturan backtest, order dieksekusi di pembukaan bar berikutnya. Klik baris untuk membuka saham di Equity. Bukan saran investasi.</div>`;
      out.querySelectorAll('tr[data-s]').forEach(tr => tr.onclick = () => { T.pickSymbol(tr.dataset.s); T.go('equity'); });
    } catch (e) { out.innerHTML = `<div class="err">${T.esc(e.message)}</div>`; setStatus(''); }
    busy = false;
  }
  const HELP = `<div class="note" style="line-height:1.6"><b>Variabel</b>: C/Close, O/Open, H/High, L/Low, V/Volume, BenchC (penutupan IHSG). <b>Wajib</b>: Buy; opsional: Sell, PositionScore (peringkat jika slot terbatas).<br>
    <b>Fungsi</b>: MA EMA Wilder HHV LLV Sum StDev RSI ATR ADX ROC Ref Cross IIf Max Min Abs Log Sqrt Int Count BarsSince ExRem Flip BBandTop BBandBot MACD Signal Optimize<br>
    <b>Operator</b>: + − * / ^ == != &lt; &gt; &lt;= &gt;= AND OR NOT. Komentar dengan // atau /* */. Ref(x,-1) = kemarin; nilai positif ditolak (look-ahead).</div>`;

  function tabs() {
    $('btTabs').innerHTML = [['res', 'HASIL'], ['opt', 'OPTIMASI'], ['wf', 'WALK-FORWARD'], ['mc', 'MONTE CARLO'], ['scan', 'SCAN']].map(([v, l]) => `<button data-t="${v}" class="${v === tab ? 'on' : ''}">${l}</button>`).join('');
    ['res', 'opt', 'wf', 'mc', 'scan'].forEach(v => { const el = $({ res: 'btOut', opt: 'btOptWrap', wf: 'btWfWrap', mc: 'btMcWrap', scan: 'btScanWrap' }[v]); el.style.display = v === tab ? 'block' : 'none'; });
  }
  function draw() {
    let prog = null; try { prog = AFL.compile(st.formula); } catch (e) {}
    const opt = (a, b) => `<option value="${a}" ${a === b ? 'selected' : ''}>`;
    box.innerHTML = `<div class="cols"><section class="p s6"><h2><span class="t">FORMULA (AFL)</span><span class="tools"><select id="btPre" style="padding:1px 4px"><option value="">Contoh formula…</option>${Object.keys(PRESETS).map(n => `<option>${n}</option>`).join('')}</select></span></h2>
        <div class="pad"><textarea id="btFormula" rows="11" spellcheck="false" style="font-size:12px">${T.esc(st.formula)}</textarea><div class="row" style="margin:6px 0 0"><button class="btn" id="btCheck">PERIKSA SINTAKS</button><span id="btChk" class="note"></span></div>${HELP}</div></section>
      <section class="p s6"><h2><span class="t">PENGATURAN</span></h2><div class="pad">
        <div class="row"><label>Universe<select id="btUni">${opt('watch', st.universe)}Watchlist (${T.data.settings.watchlist.length})</option>${opt('single', st.universe)}Satu saham</option>${opt('custom', st.universe)}Daftar kustom</option></select></label>
          <label>Satu saham<input id="btSingle" value="${T.esc(st.single)}" style="width:80px"></label><label>Periode uji<select id="btYears">${[2, 3, 5, 8].map(y => `${opt(String(y), String(st.years))}${y} tahun</option>`).join('')}</select></label></div>
        <label style="margin-bottom:6px">Daftar kustom (kode dipisah spasi)<input id="btCustom" value="${T.esc(st.custom)}" style="width:100%"></label>
        <div class="row"><label>Modal awal (Rp)<input id="btEq" type="number" value="${st.equity}" style="width:130px"></label><label>Maks posisi<input id="btMax" type="number" value="${st.maxPos}" style="width:70px"></label>
          <label>Ukuran posisi<select id="btSize">${opt('equal', st.sizing)}Modal ÷ maks posisi</option>${opt('pct', st.sizing)}% dari ekuitas</option>${opt('fixed', st.sizing)}Nominal tetap (Rp)</option></select></label>
          <label>%<input id="btPct" type="number" value="${st.pct}" style="width:60px"></label><label>Rp<input id="btFixed" type="number" value="${st.fixed}" style="width:110px"></label></div>
        <div class="row"><label>Slippage (%/sisi)<input id="btSlip" type="number" step="0.05" value="${st.slip}" style="width:70px"></label><label>Stop loss %<input id="btSl" type="number" value="${st.sl}" style="width:60px"></label>
          <label>Trailing %<input id="btTr" type="number" value="${st.trail}" style="width:60px"></label><label>Target profit %<input id="btTp" type="number" value="${st.tp}" style="width:60px"></label><label>Keluar setelah N hari<input id="btNb" type="number" value="${st.nbar}" style="width:60px"></label></div>
        <div class="note">Fee ${T.data.settings.feeBuy}% beli / ${T.data.settings.feeSell}% jual (Settings). Order di open bar berikutnya; stop dihitung intraday (gap memakai harga open). 0 = nonaktif. Long-only. Saham tak likuid/volume 0 tidak diperdagangkan.</div>
        <div class="row"><button class="btn pri" id="btRun">JALANKAN BACKTEST</button><button class="btn" id="btReset">RESET PARAMETER</button><span id="btStatus"></span></div></div></section></div>
      <div class="tabs" id="btTabs" style="margin-top:8px"></div>
      <div id="btOut"><div class="pad dim">Atur formula lalu klik JALANKAN BACKTEST.</div></div>
      <div id="btOptWrap" style="display:none"><div class="p"><div class="pad"><div id="btRanges">${prog ? rangesUI(prog) : '<span class="err">Formula belum valid.</span>'}</div>
        <div class="row"><label>Tujuan<select id="btObj">${[['cagr', 'CAGR'], ['sharpe', 'Sharpe'], ['calmar', 'Calmar (CAGR/MDD)'], ['upi', 'Ulcer perf. index'], ['net', 'Laba bersih'], ['pf', 'Profit factor']].map(([v, l]) => `${opt(v, st.obj)}${l}</option>`).join('')}</select></label>
          <label>Min. trade<input id="btMin" type="number" value="${st.minTr}" style="width:70px"></label><button class="btn pri" id="btOptGo">JALANKAN OPTIMASI</button></div></div></div><div id="btOpt"></div></div>
      <div id="btWfWrap" style="display:none"><div class="p"><div class="pad"><div class="note">Walk-forward memakai rentang, tujuan, dan min. trade dari tab OPTIMASI. Tiap fold: optimasi di jendela in-sample, lalu uji parameter terbaiknya di jendela out-of-sample berikutnya.</div>
        <div class="row"><label>In-sample (bulan)<input id="btIs" type="number" value="${st.isM}" style="width:80px"></label><label>Out-of-sample (bulan)<input id="btOos" type="number" value="${st.oosM}" style="width:80px"></label><button class="btn pri" id="btWfGo">JALANKAN WALK-FORWARD</button></div></div></div><div id="btWf"></div></div>
      <div id="btMcWrap" style="display:none"><div class="p"><div class="pad"><div class="row"><label>Jumlah simulasi<input id="btN" type="number" value="2000" style="width:90px"></label><button class="btn pri" id="btMcGo">JALANKAN MONTE CARLO</button></div></div></div><div id="btMc"></div></div>
      <div id="btScanWrap" style="display:none"><div class="p"><div class="pad"><button class="btn pri" id="btScanGo">PINDAI SINYAL HARI INI</button></div></div><div id="btScan"></div></div>`;
    tabs();
    $('btTabs').onclick = e => { if (e.target.dataset.t) { tab = e.target.dataset.t; tabs(); } };
    $('btPre').onchange = e => { if (!e.target.value) return; st.formula = PRESETS[e.target.value]; over = {}; T.data.bt = st; T.save(); draw(); };
    $('btCheck').onclick = () => { try { const p = AFL.compile($('btFormula').value); $('btChk').textContent = 'Sintaks benar. Parameter: ' + (p.params.map(x => x.name).join(', ') || 'tidak ada'); $('btChk').className = 'note up'; } catch (e) { $('btChk').textContent = e.message; $('btChk').className = 'note dn'; } };
    $('btFormula').onchange = () => { st.formula = $('btFormula').value; over = {}; try { $('btRanges').innerHTML = rangesUI(AFL.compile(st.formula)); } catch (e) { $('btRanges').innerHTML = '<span class="err">' + T.esc(e.message) + '</span>'; } };
    $('btRun').onclick = run; $('btReset').onclick = () => { over = {}; run(); }; $('btOptGo').onclick = optimizeRun; $('btWfGo').onclick = wfRun; $('btMcGo').onclick = mcRun; $('btScanGo').onclick = scanRun;
  }
  T.views.backtest = { init() { box = $('v-backtest'); st = { ...DEFAULT, ...(T.data.bt || {}), ranges: { ...((T.data.bt || {}).ranges || {}) } }; }, show() { if (!$('btOut')) draw(); }, signals: legacySignals };
})();
