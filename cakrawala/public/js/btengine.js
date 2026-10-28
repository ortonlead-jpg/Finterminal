// Mesin backtest portofolio ala AmiBroker (long-only): ranking sinyal, ukuran posisi, stop, optimasi, walk-forward, Monte Carlo.
// Aturan waktu: sinyal dihitung dari bar t-1 (penutupan), order dieksekusi di open bar t. Tidak ada informasi masa depan.
(function (root) {
  const mk = n => new Float64Array(n).fill(NaN);
  const dkey = t => new Date(t * 1000).toISOString().slice(0, 10);
  const mean = a => { let s = 0; for (const x of a) s += x; return a.length ? s / a.length : 0; };
  const sd = a => { const m = mean(a); let s = 0; for (const x of a) s += (x - m) ** 2; return Math.sqrt(s / Math.max(1, a.length - 1)); };
  const pctl = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const tick = () => new Promise(r => setTimeout(r, 0));

  // Selaraskan semua saham ke kalender benchmark (IHSG); bar kosong diisi harga sebelumnya dengan volume 0 (tidak bisa ditransaksikan).
  function prepare(universe, bench) {
    const dates = bench.map(c => dkey(c.time)), n = dates.length, idx = new Map(dates.map((d, i) => [d, i]));
    const syms = universe.map(u => {
      const O = mk(n), H = mk(n), L = mk(n), C = mk(n), V = new Float64Array(n), have = new Uint8Array(n);
      for (const c of u.candles) { const i = idx.get(dkey(c.time)); if (i == null) continue; O[i] = c.open; H[i] = c.high; L[i] = c.low; C[i] = c.close; V[i] = c.volume || 0; have[i] = 1; }
      let last = NaN; for (let i = 0; i < n; i++) { if (have[i]) last = C[i]; else if (last === last) { O[i] = H[i] = L[i] = C[i] = last; } }
      return { sym: u.sym, O, H, L, C, V };
    });
    return { dates, n, syms, bench: Float64Array.from(bench.map(c => c.close)) };
  }

  function signals(prog, data, over) {
    return data.syms.map(s => {
      try { return prog.run({ n: data.n, c: s.C, o: s.O, h: s.H, l: s.L, v: s.V, benchc: data.bench }, over); }
      catch (e) { throw new Error(`[${s.sym}] ${e.message}`); }
    });
  }

  function simulate(data, sigs, cfg, t0, t1, startEq) {
    const { syms, dates } = data, S = syms.length, lotSz = cfg.lot || 100, fb = (cfg.feeBuy || 0) / 100, fs = (cfg.feeSell || 0) / 100, slip = (cfg.slip || 0) / 100, maxPos = cfg.maxPos || 10;
    let cash = startEq; let pos = []; const held = new Uint8Array(S), trades = [], len = t1 - t0, eq = new Float64Array(len), invested = new Float64Array(len), lastPx = new Float64Array(S).fill(NaN);
    const close = (p, px, t, why) => {
      const sp = px * (1 - slip), proceeds = p.qty * sp * (1 - fs); cash += proceeds; held[p.si] = 0;
      trades.push({ sym: syms[p.si].sym, d0: dates[p.t0], d1: dates[t], p0: p.px, p1: sp, qty: p.qty, pnl: proceeds - p.cost, ret: proceeds / p.cost - 1, bars: t - p.t0, why, frac: p.frac });
    };
    for (let t = t0; t < t1; t++) {
      // 1) keluar di open karena sinyal Sell / batas waktu kemarin
      if (t > 0) {
        const keep = [];
        for (const p of pos) {
          const s = syms[p.si];
          if ((sigs[p.si].sell[t - 1] || p.exitNext) && s.V[t] > 0 && s.O[t] === s.O[t]) close(p, s.O[t], t, p.exitNext && !sigs[p.si].sell[t - 1] ? 'waktu' : 'sinyal');
          else keep.push(p);
        }
        pos = keep;
        // 2) masuk di open: kandidat Buy kemarin, urut skor
        const free = maxPos - pos.length;
        if (free > 0) {
          const cand = [];
          for (let si = 0; si < S; si++) if (!held[si] && sigs[si].buy[t - 1] && syms[si].V[t] > 0 && syms[si].O[t] === syms[si].O[t]) cand.push(si);
          if (cand.length) {
            const score = si => { const sc = sigs[si].score; const v = sc ? sc[t - 1] : 0; return v === v ? v : -Infinity; };
            cand.sort((a, b) => score(b) - score(a) || a - b);
            let mv = 0; for (const p of pos) { const c = syms[p.si].C[t - 1]; mv += p.qty * (c === c ? c : p.px); }
            const eqNow = cash + mv; let slots = free;
            for (const si of cand) {
              if (slots <= 0) break;
              const s = syms[si], px = s.O[t] * (1 + slip);
              let alloc = cfg.sizing === 'pct' ? eqNow * (cfg.pct || 10) / 100 : cfg.sizing === 'fixed' ? (cfg.fixed || 1e7) : eqNow / maxPos;
              alloc = Math.min(alloc, cash);
              const lots = Math.floor(alloc / (px * (1 + fb) * lotSz)); if (lots < 1) continue;
              const qty = lots * lotSz, cost = qty * px * (1 + fb); cash -= cost; held[si] = 1; slots--;
              pos.push({ si, qty, px, cost, t0: t, hh: px, exitNext: false, frac: cost / eqNow });
            }
          }
        }
      }
      // 3) stop intraday
      const keep2 = [];
      for (const p of pos) {
        const s = syms[p.si]; let ex = null;
        if (s.V[t] > 0) {
          let stop = 0, lbl = 'SL';
          if (cfg.sl) stop = p.px * (1 - cfg.sl / 100);
          if (cfg.trail) { const tr = p.hh * (1 - cfg.trail / 100); if (tr > stop) { stop = tr; lbl = 'TS'; } }
          if (stop > 0) { if (s.O[t] <= stop) ex = [s.O[t], lbl]; else if (s.L[t] <= stop) ex = [stop, lbl]; }
          if (!ex && cfg.tp) { const tp = p.px * (1 + cfg.tp / 100); if (s.O[t] >= tp) ex = [s.O[t], 'TP']; else if (s.H[t] >= tp) ex = [tp, 'TP']; }
        }
        if (ex) close(p, ex[0], t, ex[1]);
        else { if (s.H[t] > p.hh) p.hh = s.H[t]; if (cfg.nbar && t - p.t0 + 1 >= cfg.nbar) p.exitNext = true; keep2.push(p); }
      }
      pos = keep2;
      // 4) tandai ekuitas di close
      let mv = 0; for (const p of pos) { const c = syms[p.si].C[t]; if (c === c) lastPx[p.si] = c; mv += p.qty * (lastPx[p.si] === lastPx[p.si] ? lastPx[p.si] : p.px); }
      eq[t - t0] = cash + mv; invested[t - t0] = mv;
    }
    const open = pos.map(p => { const c = lastPx[p.si] === lastPx[p.si] ? lastPx[p.si] : p.px; return { sym: syms[p.si].sym, d0: dates[p.t0], p0: p.px, p1: c, qty: p.qty, ret: p.qty * c * (1 - fs) / p.cost - 1, pnl: p.qty * c * (1 - fs) - p.cost }; });
    if (cfg.closeAtEnd && pos.length) { for (const p of pos) close(p, lastPx[p.si] === lastPx[p.si] ? lastPx[p.si] : p.px, t1 - 1, 'akhir'); pos = []; open.length=0; eq[len - 1] = cash; invested[len - 1] = 0; }
    return { eq, invested, dates: dates.slice(t0, t1), trades, open, cash, startEq };
  }

  function metrics(res) {
    const eq = res.eq, n = eq.length, s0 = res.startEq, out = { n };
    if (!n) return out;
    const yrs = Math.max(n / 252, 1e-6), end = eq[n - 1];
    out.total = (end / s0 - 1) * 100; out.net = end - s0; out.cagr = end > 0 ? (Math.pow(end / s0, 1 / yrs) - 1) * 100 : -100;
    const r = new Float64Array(n); r[0] = eq[0] / s0 - 1; for (let i = 1; i < n; i++) r[i] = eq[i] / eq[i - 1] - 1;
    const m = mean(r), s = sd(r), dn = Math.sqrt(mean(Array.from(r, x => x < 0 ? x * x : 0)));
    out.sharpe = s ? m / s * Math.sqrt(252) : 0; out.sortino = dn ? m / dn * Math.sqrt(252) : 0;
    let pk = s0, mdd = 0, ddLen = 0, curLen = 0, ssq = 0;
    for (let i = 0; i < n; i++) { if (eq[i] > pk) { pk = eq[i]; curLen = 0; } else curLen++; const dd = (eq[i] / pk - 1) * 100; if (dd < mdd) mdd = dd; if (curLen > ddLen) ddLen = curLen; ssq += dd * dd; }
    out.mdd = mdd; out.ddDays = ddLen; out.ulcer = Math.sqrt(ssq / n); out.calmar = mdd ? out.cagr / Math.abs(mdd) : 0; out.upi = out.ulcer ? out.cagr / out.ulcer : 0;
    out.exposure = mean(Array.from(res.invested, (v, i) => eq[i] ? v / eq[i] : 0)) * 100; out.rar = out.exposure ? out.cagr / (out.exposure / 100) : 0;
    const T = res.trades, w = T.filter(t => t.pnl > 0), l = T.filter(t => t.pnl <= 0);
    out.nTrades = T.length; out.win = T.length ? w.length / T.length * 100 : 0;
    out.avgWin = w.length ? mean(w.map(t => t.ret)) * 100 : 0; out.avgLoss = l.length ? mean(l.map(t => t.ret)) * 100 : 0;
    out.payoff = out.avgLoss ? Math.abs(out.avgWin / out.avgLoss) : 0;
    const gp = w.reduce((a, t) => a + t.pnl, 0), gl = Math.abs(l.reduce((a, t) => a + t.pnl, 0)); out.pf = gl ? gp / gl : (gp ? 99 : 0);
    out.expect = T.length ? mean(T.map(t => t.ret)) * 100 : 0; out.avgBars = T.length ? mean(T.map(t => t.bars)) : 0;
    let run = 0, mx = 0; for (const t of T) { if (t.pnl <= 0) { run++; mx = Math.max(mx, run); } else run = 0; } out.maxLossStreak = mx;
    out.best = T.length ? Math.max(...T.map(t => t.ret)) * 100 : 0; out.worst = T.length ? Math.min(...T.map(t => t.ret)) * 100 : 0;
    return out;
  }

  function monthly(res) {
    const by = {}; const d = res.dates, eq = res.eq; let prev = res.startEq, prevM = null, lastEq = res.startEq;
    for (let i = 0; i < eq.length; i++) { const m = d[i].slice(0, 7); if (prevM && m !== prevM) { by[prevM] = (lastEq / prev - 1) * 100; prev = lastEq; } prevM = m; lastEq = eq[i]; }
    if (prevM) by[prevM] = (lastEq / prev - 1) * 100; return by;
  }

  function grid(params, ranges) {
    let combos = [{}];
    for (const p of params) {
      const r = ranges[p.name] || p, vals = [];
      if(![r.min,r.max,r.step].every(Number.isFinite)||r.step<=0||r.min>r.max)throw new Error('Rentang parameter tidak valid.');
      if(combos.length*(Math.floor((r.max-r.min)/r.step+1e-9)+1)>400)throw new Error('Maksimal 400 kombinasi parameter.'); const step = r.step > 0 ? r.step : 1;
      for (let v = r.min; v <= r.max + 1e-9; v += step) vals.push(+v.toFixed(6));
      combos = combos.flatMap(c => vals.map(v => ({ ...c, [p.name]: v })));
    }
    return combos;
  }
  const OBJ = { cagr: m => m.cagr, sharpe: m => m.sharpe, calmar: m => m.calmar, upi: m => m.upi, net: m => m.net, pf: m => Math.min(m.pf, 20) };
  const score = (m, obj, minTr) => !m.nTrades || m.nTrades < minTr ? -1e9 : OBJ[obj](m);

  async function precompute(prog, data, combos, progress, cancel) {
    const out = [];
    for (let i = 0; i < combos.length; i++) {
      if (cancel && cancel()) throw new Error('dibatalkan');
      out.push(signals(prog, data, combos[i]));
      if (i % 2 === 1) { if (progress) progress('sinyal', i + 1, combos.length); await tick(); }
    }
    return out;
  }
  async function optimize(data, sigsBy, combos, cfg, obj, minTr, t0, t1, startEq, progress, cancel) {
    const rows = [];
    for (let i = 0; i < combos.length; i++) {
      if (cancel && cancel()) throw new Error('dibatalkan');
      const res = simulate(data, sigsBy[i], { ...cfg, closeAtEnd: true }, t0, t1, startEq), m = metrics(res);
      rows.push({ over: combos[i], m, score: score(m, obj, minTr) });
      if (i % 4 === 3) { if (progress) progress('simulasi', i + 1, combos.length); await tick(); }
    }
    return rows;
  }

  async function walkForward(data, sigsBy, combos, cfg, obj, minTr, t0, isLen, oosLen, startEq, progress, cancel) {
    const investedAll=[]; const folds = []; let eqCarry = startEq; const eqAll = [], dAll = [];
    for (let s = t0; s + isLen + oosLen <= data.n; s += oosLen) {
      if (cancel && cancel()) throw new Error('dibatalkan');
      let best = -1, bestScore = -Infinity, bestM = null;
      for (let i = 0; i < combos.length; i++) {
        const m = metrics(simulate(data, sigsBy[i], { ...cfg, closeAtEnd: true }, s, s + isLen, startEq)), sc = score(m, obj, minTr);
        if (sc > bestScore) { bestScore = sc; best = i; bestM = m; }
      }
      if (best < 0) best = 0;
      const oos = simulate(data, sigsBy[best], { ...cfg, closeAtEnd: true }, s + isLen, s + isLen + oosLen, eqCarry), om = metrics(oos);
      folds.push({ isFrom: data.dates[s], isTo: data.dates[s + isLen - 1], oosFrom: data.dates[s + isLen], oosTo: data.dates[s + isLen + oosLen - 1], over: combos[best], isM: bestM, oosM: om, trades: oos.trades });
      for (let k = 0; k < oos.eq.length; k++) { eqAll.push(oos.eq[k]); investedAll.push(oos.invested[k]); dAll.push(oos.dates[k]); }
      eqCarry = oos.eq[oos.eq.length - 1];
      if (progress) progress('fold', folds.length, 0); await tick();
    }
    if (!folds.length) throw new Error('Data terlalu pendek untuk walk-forward dengan panjang jendela ini.');
    const trades = folds.flatMap(f => f.trades);
    const wf = { eq: Float64Array.from(eqAll), dates: dAll, startEq, trades, invested: Float64Array.from(investedAll), open: [] };
    const first = t0 + isLen;
    // pembanding: pilih parameter terbaik dari seluruh periode OOS (melihat masa depan) -> menunjukkan seberapa besar overfit
    let cb = -Infinity, cbRes = null, cbOver = null;
    for (let i = 0; i < combos.length; i++) { const r = simulate(data, sigsBy[i], { ...cfg, closeAtEnd: true }, first, first + (dAll.length), startEq), m = metrics(r), sc = score(m, obj, minTr); if (sc > cb) { cb = sc; cbRes = r; cbOver = combos[i]; } }
    const isC = mean(folds.map(f => f.isM.cagr)), oosM = metrics(wf);
    return { folds, wf, m: oosM, cheat: cbRes, cheatM: cbRes ? metrics(cbRes) : null, cheatOver: cbOver, avgIsCagr: isC, wfe: isC > 0 ? oosM.cagr / isC : null };
  }

  // Bootstrap urutan trade: ekuitas *= 1 + frac*ret. Aproksimasi (mengabaikan tumpang tindih posisi).
  function monteCarlo(trades, nSim) {
    if (trades.length < 8) return null;
    const fin = [], dds = [], n = trades.length;
    for (let k = 0; k < nSim; k++) {
      let e = 1, pk = 1, dd = 0;
      for (let i = 0; i < n; i++) { const t = trades[Math.floor(Math.random() * n)]; e *= 1 + t.frac * t.ret; if (e > pk) pk = e; const d = e / pk - 1; if (d < dd) dd = d; }
      fin.push((e - 1) * 100); dds.push(dd * 100);
    }
    fin.sort((a, b) => a - b); dds.sort((a, b) => a - b);
    return { fin: [.05, .25, .5, .75, .95].map(p => pctl(fin, p)), dd: [.05, .25, .5].map(p => pctl(dds, p)), pLoss: fin.filter(x => x < 0).length / nSim * 100, n, nSim, hist: fin };
  }

  function scan(prog, data, over) {
    const sg = signals(prog, data, over), n = data.n, rows = [];
    data.syms.forEach((s, i) => { const g = sg[i]; rows.push({ sym: s.sym, buy: g.buy[n - 1], sell: g.sell[n - 1], score: g.score ? g.score[n - 1] : null, close: s.C[n - 1], buyPrev: g.buy[n - 2] }); });
    return rows;
  }

  root.BT = { prepare, signals, simulate, metrics, monthly, grid, precompute, optimize, walkForward, monteCarlo, scan, OBJ };
})(typeof window !== 'undefined' ? window : globalThis);
