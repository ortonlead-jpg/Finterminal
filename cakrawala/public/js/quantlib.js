// QUANTLIB: kalkulator keuangan kuantitatif, dihitung lokal di browser (tanpa layanan cloud).
(() => {
  let box, tab = 'opt';
  const N = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804014327 * Math.exp(-x * x / 2); const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return x >= 0 ? 1 - p : p; };
  const n = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  function bs(S, K, T, r, v, q, call) {
    const d1 = (Math.log(S / K) + (r - q + v * v / 2) * T) / (v * Math.sqrt(T)), d2 = d1 - v * Math.sqrt(T), df = Math.exp(-r * T), dq = Math.exp(-q * T);
    const price = call ? S * dq * N(d1) - K * df * N(d2) : K * df * N(-d2) - S * dq * N(-d1);
    return { price, delta: call ? dq * N(d1) : dq * (N(d1) - 1), gamma: dq * n(d1) / (S * v * Math.sqrt(T)), vega: S * dq * n(d1) * Math.sqrt(T) / 100,
      theta: (-(S * dq * n(d1) * v) / (2 * Math.sqrt(T)) + (call ? -r * K * df * N(d2) + q * S * dq * N(d1) : r * K * df * N(-d2) - q * S * dq * N(-d1))) / 365,
      rho: (call ? K * T * df * N(d2) : -K * T * df * N(-d2)) / 100 };
  }
  function bond(face, cpn, freq, yrs, y) {
    const nPer = Math.round(yrs * freq), c = face * cpn / freq, i = y / freq; let pv = 0, dur = 0, cv = 0;
    for (let k = 1; k <= nPer; k++) { const cf = c + (k === nPer ? face : 0), d = Math.pow(1 + i, -k); pv += cf * d; dur += (k / freq) * cf * d; cv += cf * d * k * (k + 1); }
    const mac = dur / pv; return { price: pv, mac, mod: mac / (1 + i), conv: cv / (pv * Math.pow(1 + i, 2) * freq * freq) };
  }
  const solve = (f, lo, hi) => { for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; } return (lo + hi) / 2; };
  const irr = cfs => { const f = r => cfs.reduce((s, c, i) => s + c / Math.pow(1 + r, i), 0); try { if (f(-0.99) * f(10) > 0) return null; return solve(f, -0.99, 10); } catch (e) { return null; } };
  const inp = (id, l, v, w = 100, step = 'any') => `<label>${l}<input id="${id}" type="number" step="${step}" value="${v}" style="width:${w}px"></label>`;
  const val = id => +$(id).value;
  const res = (rows) => `<table style="max-width:420px">${rows.map(([k, v, c]) => `<tr class="nohov"><td class="l dim">${k}</td><td class="${c || ''}">${v}</td></tr>`).join('')}</table>`;

  const TABS = {
    opt: { name: 'OPSI (Black-Scholes)', html: () => `<div class="row">${inp('oS', 'Harga aset (S)', 5000)}${inp('oK', 'Strike (K)', 5000)}${inp('oT', 'Jatuh tempo (tahun)', 0.5)}${inp('oR', 'Suku bunga (%)', 5.5)}${inp('oV', 'Volatilitas (%)', 25)}${inp('oQ', 'Dividen yield (%)', 0)}
        <label>Jenis<select id="oC"><option value="1">Call</option><option value="0">Put</option></select></label><button class="btn pri" id="oGo">HITUNG</button></div><div id="out"></div>
        <div class="note">Model Eropa, tanpa dividen diskrit. Opsi saham IDX hampir tidak diperdagangkan, jadi ini alat belajar dan pembanding, bukan harga pasar.</div>`,
      go() { const S = val('oS'), K = val('oK'), Tt = val('oT'), r = val('oR') / 100, v = val('oV') / 100, q = val('oQ') / 100, call = $('oC').value === '1';
        if (!(S > 0 && K > 0 && Tt > 0 && v > 0)) return $('out').innerHTML = '<div class="err">Isi S, K, T, dan volatilitas dengan benar.</div>';
        const g = bs(S, K, Tt, r, v, q, call); $('out').innerHTML = res([['Harga opsi', T.fmt(g.price)], ['Delta', T.fmt(g.delta, 4)], ['Gamma', T.fmt(g.gamma, 6)], ['Vega (per 1% vol)', T.fmt(g.vega, 4)], ['Theta (per hari)', T.fmt(g.theta, 4)], ['Rho (per 1% bunga)', T.fmt(g.rho, 4)]]); } },
    bond: { name: 'OBLIGASI', html: () => `<div class="row">${inp('bF', 'Nilai nominal', 100)}${inp('bC', 'Kupon (%/thn)', 6.5)}${inp('bQ', 'Frekuensi/thn', 2, 80)}${inp('bY', 'Sisa tenor (thn)', 5)}${inp('bYld', 'Yield (%)', 6.8)}
        <button class="btn pri" id="bGo">HARGA DARI YIELD</button></div><div class="row">${inp('bP', 'Harga pasar', 99)}<button class="btn" id="bYtm">YIELD (YTM) DARI HARGA</button></div><div id="out"></div>
        <div class="note">Cash flow periodik sederhana (tanpa accrued interest dan konvensi hari SBN). Untuk indikasi kasar.</div>`,
      go(e) { const F = val('bF'), c = val('bC') / 100, q = val('bQ'), y = val('bY');
        if (e && e.target.id === 'bYtm') { const P = val('bP'), ytm = solve(yy => bond(F, c, q, y, yy).price - P, -0.5, 1.5) * 100; const b = bond(F, c, q, y, ytm / 100);
          return $('out').innerHTML = res([['YTM', T.pct(ytm, 3)], ['Duration Macaulay (thn)', T.fmt(b.mac)], ['Modified duration', T.fmt(b.mod)], ['Konveksitas', T.fmt(b.conv)]]); }
        const b = bond(F, c, q, y, val('bYld') / 100); $('out').innerHTML = res([['Harga', T.fmt(b.price, 4)], ['Duration Macaulay (thn)', T.fmt(b.mac)], ['Modified duration', T.fmt(b.mod)], ['Konveksitas', T.fmt(b.conv)], ['Harga jika yield +1%', T.fmt(bond(F, c, q, y, val('bYld') / 100 + .01).price, 4)], ['Harga jika yield −1%', T.fmt(bond(F, c, q, y, val('bYld') / 100 - .01).price, 4)]]); } },
    tvm: { name: 'NILAI WAKTU UANG / IRR', html: () => `<div class="row">${inp('tPV', 'Nilai sekarang (PV)', 100000000, 140)}${inp('tR', 'Bunga/imbal (%/thn)', 8)}${inp('tN', 'Tahun', 10, 70)}${inp('tPm', 'Setoran tiap tahun', 12000000, 130)}<button class="btn pri" id="tGo">HITUNG NILAI AKHIR</button></div>
        <div class="row"><label>Arus kas per periode (pisah koma; awal negatif)<input id="tCf" value="-100,10,10,10,110" style="width:360px"></label><button class="btn" id="tIrr">HITUNG IRR / NPV</button></div><div id="out"></div>`,
      go(e) { if (e && e.target.id === 'tIrr') { const cf = $('tCf').value.split(',').map(Number).filter(x => !isNaN(x)), r = irr(cf), d = val('tR') / 100;
          return $('out').innerHTML = res([['IRR', r == null ? 'tidak ada solusi' : T.pct(r * 100, 3)], [`NPV @ ${val('tR')}%`, T.fmt(cf.reduce((s, c, i) => s + c / Math.pow(1 + d, i), 0))]]); }
        const pv = val('tPV'), r = val('tR') / 100, nn = val('tN'), pm = val('tPm'), fvA = r===0?pm*nn:pm*((Math.pow(1+r,nn)-1)/r);
        $('out').innerHTML = res([['Nilai akhir lump-sum', T.idr(pv * Math.pow(1 + r, nn))], ['Nilai akhir setoran (akhir tahun)', T.idr(fvA)], ['Total', T.idr(pv * Math.pow(1 + r, nn) + fvA)], ['Total uang dimasukkan', T.idr(pv + pm * nn)]]); } },
    mc: { name: 'SIMULASI MONTE CARLO', html: () => `<div class="row">${inp('mS', 'Harga awal', 5000)}${inp('mMu', 'Return tahunan (%)', 10)}${inp('mV', 'Volatilitas (%)', 25)}${inp('mT', 'Horizon (hari bursa)', 252, 90)}${inp('mN', 'Jumlah lintasan', 5000, 90)}<button class="btn pri" id="mGo">SIMULASI</button></div><div id="out"></div>
        <div class="note">Gerak Brownian geometrik: asumsi return normal dan volatilitas konstan. Pasar nyata punya ekor tebal, jadi risiko sebenarnya bisa lebih buruk dari hasil di sini.</div>`,
      go() { const S = val('mS'), mu = val('mMu') / 100, v = val('mV') / 100, H = Math.round(val('mT')), Np = Math.min(20000, Math.round(val('mN')));
        const dt = 1 / 252, fin = []; const gauss = () => { let u = 0, w = 0; while (!u) u = Math.random(); while (!w) w = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); };
        for (let i = 0; i < Np; i++) { let x = S; for (let k = 0; k < H; k++) x *= Math.exp((mu - v * v / 2) * dt + v * Math.sqrt(dt) * gauss()); fin.push(x); }
        fin.sort((a, b) => a - b); const pc = p => fin[Math.min(fin.length - 1, Math.floor(p * fin.length))], tail = fin.slice(0, Math.max(1, Math.floor(fin.length * .05)));
        $('out').innerHTML = res([['Persentil 5%', T.fmt(pc(.05), 0), 'dn'], ['Persentil 25%', T.fmt(pc(.25), 0)], ['Median', T.fmt(pc(.5), 0)], ['Persentil 75%', T.fmt(pc(.75), 0)], ['Persentil 95%', T.fmt(pc(.95), 0), 'up'],
          ['Peluang rugi', T.pct(fin.filter(x => x < S).length / fin.length * 100, 1)], ['VaR 95% (rugi dari harga awal)', T.pct((pc(.05) / S - 1) * 100), 'dn'], ['Expected shortfall 95%', T.pct((T.stats.mean(tail) / S - 1) * 100), 'dn']]); } },
  };
  function draw() {
    box.innerHTML = `<div class="tabs" id="qlTabs">${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${v.name}</button>`).join('')}</div><div id="qlBody">${TABS[tab].html()}</div>`;
    $('qlTabs').onclick = e => { if (e.target.dataset.t) { tab = e.target.dataset.t; draw(); } };
    $('qlBody').querySelectorAll('button.btn').forEach(b => b.onclick = e => TABS[tab].go(e));
  }
  T.views.quantlib = { init() { box = $('v-quantlib'); }, show() { draw(); } };
})();
