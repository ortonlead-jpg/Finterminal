// PORTFOLIO: transaksi -> posisi (harga rata-rata bergerak), P&L, sektor, risiko
(() => {
  const SECTOR = {};
  const add = (sec, list) => list.split(' ').forEach(s => SECTOR[s + '.JK'] = sec);
  add('Keuangan', 'BBCA BBRI BMRI BBNI BRIS ARTO BTPS BNGA PNBN MEGA'); add('Energi', 'ADRO PTBA ITMG HRUM MEDC PGAS AKRA INDY BYAN PGEO');
  add('Bahan Baku', 'ANTM INCO MDKA AMMN BRPT TPIA SMGR INKP TKIM ESSA NCKL MBMA'); add('Barang Konsumen Primer', 'UNVR ICBP INDF CPIN MYOR AMRT JPFA GGRM HMSP');
  add('Telekomunikasi', 'TLKM EXCL ISAT TOWR MTEL'); add('Teknologi', 'GOTO BUKA EMTK'); add('Properti', 'BSDE CTRA PWON SMRA'); add('Infrastruktur', 'JSMR BREN');
  add('Barang Konsumen Non-Primer', 'ASII MAPI ACES'); add('Kesehatan', 'KLBF SIDO MIKA HEAL'); add('Industri', 'UNTR');
  const sec = s => SECTOR[s] || 'Lainnya';
  let box, chart, line, risk = null;

  function positions() {
    return Ledger.replay(T.data.portfolio.tx || []);
  }

  async function render() {
    const { list, realized } = positions();
    let quotes = {};
    if (list.length) { try { (await T.api('quote?symbols=' + list.map(p => p.symbol).join(','))).forEach(q => quotes[q.symbol] = q); } catch (e) {} }
    let mv = 0, cost = 0, day = 0;
    list.forEach(p => { const q = quotes[p.symbol] || {}; p.last = q.price ?? p.avg; p.prev = q.prev ?? p.last; p.mv = p.qty * p.last; mv += p.mv; cost += p.cost; day += p.qty * (p.last - p.prev); });
    list.forEach(p => { p.w = mv ? p.mv / mv * 100 : 0; p.pnl = p.mv - p.cost; p.pnlPct = p.cost ? p.pnl / p.cost * 100 : 0; p.sec = sec(p.symbol); });
    list.sort((a, b) => b.mv - a.mv);
    const bySec = {}; list.forEach(p => bySec[p.sec] = (bySec[p.sec] || 0) + p.mv);
    const hhi = list.reduce((s, p) => s + (p.w / 100) ** 2, 0);
    const tx = [...(T.data.portfolio.tx || [])].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const today = new Date().toISOString().slice(0, 10);
    box.innerHTML = `
    <div class="kpi">
      <div><small>NILAI PASAR</small><b>${T.idr(mv)}</b></div>
      <div><small>MODAL (BIAYA)</small><b>${T.idr(cost)}</b></div>
      <div><small>UNREALIZED P&amp;L</small><b class="${T.cls(mv - cost)}">${T.idr(mv - cost)}</b><br><span class="${T.cls(mv - cost)}">${cost ? T.arrow((mv - cost) / cost * 100) : '—'}</span></div>
      <div><small>HARI INI</small><b class="${T.cls(day)}">${T.idr(day)}</b></div>
      <div><small>REALIZED P&amp;L</small><b class="${T.cls(realized)}">${T.idr(realized)}</b></div>
      <div><small>POSISI / KONSENTRASI</small><b>${list.length}</b> <span class="dim">HHI ${T.fmt(hhi, 2)}</span></div>
    </div>
    <div class="cols">
      <section class="p s8"><h2><span class="t">POSISI</span></h2><div class="body"><table><thead><tr><th>KODE</th><th>LOT</th><th>RATA2</th><th>HARGA</th><th>NILAI</th><th>P&amp;L</th><th>P&amp;L%</th><th>BOBOT</th><th class="l">SEKTOR</th></tr></thead><tbody>
        ${list.map(p => `<tr data-s="${p.symbol}"><td>${T.disp(p.symbol)}</td><td>${T.fmt(p.qty / 100, 2).replace(/,00$/, '')}</td><td>${T.fmt(p.avg, 0)}</td><td>${T.fmt(p.last, 0)}</td><td>${T.fmt(p.mv, 0)}</td><td class="${T.cls(p.pnl)}">${T.fmt(p.pnl, 0)}</td><td class="${T.cls(p.pnl)}">${T.arrow(p.pnlPct)}</td><td>${T.fmt(p.w, 1)}%</td><td class="l dim">${p.sec}</td></tr>`).join('') || '<tr class="nohov"><td colspan="9" class="dim l">Belum ada posisi. Catat transaksi beli di bawah.</td></tr>'}</tbody></table></div></section>
      <section class="p s4"><h2><span class="t">ALOKASI SEKTOR</span></h2><div class="body pad">
        ${Object.entries(bySec).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between"><span>${k}</span><span>${T.fmt(v / mv * 100, 1)}%</span></div><div style="height:6px;background:#1c1c20"><div style="height:6px;width:${v / mv * 100}%;background:var(--acc)"></div></div></div>`).join('') || '<span class="dim">—</span>'}</div></section>
    </div>
    <div class="cols" style="margin-top:8px">
      <section class="p s7"><h2><span class="t">KINERJA 1 TAHUN (komposisi sekarang, dihitung mundur)</span></h2><div id="pfChart" style="height:240px"></div></section>
      <section class="p s5"><h2><span class="t">RISIKO (1 tahun harian)</span></h2><div class="body pad" id="pfRisk"><span class="dim">menghitung…</span></div></section>
    </div>
    <div class="cols" style="margin-top:8px">
      <section class="p s5"><h2><span class="t">CATAT TRANSAKSI</span></h2><div class="pad">
        <div class="row"><label>Tanggal<input type="date" id="tDate" value="${today}"></label><label>Kode<input id="tSym" style="width:90px" placeholder="BBCA"></label>
          <label>Jenis<select id="tSide"><option>BUY</option><option>SELL</option></select></label></div>
        <div class="row"><label>Jumlah<input id="tQty" type="number" min="1" style="width:90px"></label><label>Satuan<select id="tUnit"><option value="100">Lot</option><option value="1">Lembar</option></select></label>
          <label>Harga<input id="tPrice" type="number" min="0" step="any" style="width:100px"></label><label>Biaya (Rp)<input id="tFee" type="number" min="0" style="width:100px" placeholder="otomatis"></label></div>
        <button class="btn pri" id="tAdd">SIMPAN</button> <span id="tMsg" class="note"></span>
        <div class="note">Biaya kosong = otomatis memakai fee beli/jual di Settings (${T.data.settings.feeBuy}% / ${T.data.settings.feeSell}%). Satu lot = 100 lembar.</div></div></section>
      <section class="p s7"><h2><span class="t">RIWAYAT TRANSAKSI</span><span class="tools"><button class="btn sm" id="tCsv">CSV</button></span></h2><div class="body"><table><thead><tr><th class="l">TGL</th><th class="l">KODE</th><th class="l">JENIS</th><th>LOT</th><th>HARGA</th><th>BIAYA</th><th></th></tr></thead><tbody>
        ${tx.map(t => `<tr class="nohov"><td class="l">${t.date}</td><td class="l">${T.disp(t.symbol)}</td><td class="l ${t.side === 'BUY' ? 'up' : 'dn'}">${t.side}</td><td>${T.fmt(t.qty / 100, 2).replace(/,00$/, '')}</td><td>${T.fmt(t.price, 0)}</td><td>${T.fmt(t.fee || 0, 0)}</td><td><button class="btn sm red" data-del="${t.id}">×</button></td></tr>`).join('') || '<tr class="nohov"><td colspan="7" class="l dim">—</td></tr>'}</tbody></table></div></section>
    </div>`;
    box.querySelectorAll('tr[data-s]').forEach(tr => tr.onclick = () => { T.pickSymbol(tr.dataset.s); T.go('equity'); });
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (!confirm('Hapus transaksi ini?')) return; const next=T.data.portfolio.tx.filter(t=>t.id!=b.dataset.del);try{Ledger.replay(next);}catch(e){T.toast(e.message,true);return;}T.data.portfolio.tx=next;T.save();render(); });
    $('tCsv').onclick = () => T.download('transaksi.csv', 'tanggal,kode,jenis,lembar,harga,biaya\n' + tx.map(t => [t.date, t.symbol, t.side, t.qty, t.price, t.fee || 0].join(',')).join('\n'), 'text/csv');
    $('tAdd').onclick = addTx;
    if (list.length) computeRisk(list, mv); else { $('pfRisk').innerHTML = '<span class="dim">Butuh minimal satu posisi.</span>'; }
  }

  function addTx() {
    const sym = T.sym($('tSym').value || ''), qty = (+$('tQty').value) * (+$('tUnit').value), price = +$('tPrice').value, side = $('tSide').value, date = $('tDate').value;
    const msg = t => { $('tMsg').textContent = t; $('tMsg').className = 'note dn'; };
    if (sym === '.JK' || !(qty > 0) || !(price > 0) || !date) return msg('Lengkapi kode, jumlah, harga, dan tanggal.');
    if (side === 'SELL') { const h = positions().list.find(p => p.symbol === sym); if (!h || h.qty < qty) return msg('Jumlah jual melebihi posisi yang dimiliki.'); }
    let fee = $('tFee').value === '' ? Math.round(qty * price * (side === 'BUY' ? T.data.settings.feeBuy : T.data.settings.feeSell) / 100) : +$('tFee').value;
    const id = Date.now(), next=[...T.data.portfolio.tx,{ id, date, symbol: sym, side, qty, price, fee }];
    try{Ledger.replay(next);}catch(e){return msg(e.message);}
    T.data.portfolio.tx=next; T.save(); render();
  }

  async function computeRisk(list, mv) {
    const el = () => $('pfRisk');
    try {
      const top = list.slice(0, 15);
      const [ser, bench] = await Promise.all([Promise.all(top.map(p => T.series(p.symbol).catch(() => []))), T.series('^JKSE').catch(() => [])]);
      const byDay = s => Object.fromEntries(s.map(c => [new Date(c.time * 1000).toISOString().slice(0, 10), c.close]));
      const maps = ser.map(byDay), bm = byDay(bench);
      const days = Object.keys(bm).sort();
      const wsum = top.reduce((s, p) => s + p.mv, 0);
      const val = []; let lastv = top.map(() => null);
      for (const d of days) {
        let tot = 0, ok = true;
        top.forEach((p, i) => { const px = maps[i][d] ?? lastv[i]; if (px == null) ok = false; else { lastv[i] = px; tot += p.qty * px; } });
        if (ok) val.push({ d, v: tot, b: bm[d] });
      }
      if (val.length < 30) { el().innerHTML = '<span class="dim">Data harga tidak cukup.</span>'; return; }
      const ret = (a, k) => a.slice(1).map((x, i) => x[k] / a[i][k] - 1);
      const r = ret(val, 'v'), rb = ret(val, 'b');
      const vol = T.stats.sd(r) * Math.sqrt(252) * 100, volb = T.stats.sd(rb) * Math.sqrt(252) * 100;
      const cov = (() => { const mx = T.stats.mean(r), my = T.stats.mean(rb); return r.reduce((s, x, i) => s + (x - mx) * (rb[i] - my), 0) / (r.length - 1); })();
      const beta = cov / (T.stats.sd(rb) ** 2);
      const tot = val[val.length - 1].v / val[0].v - 1, totb = val[val.length - 1].b / val[0].b - 1;
      const ann = Math.pow(1 + tot, 252 / r.length) - 1, rf = 0.05;
      const sharpe = (ann - rf) / (vol / 100);
      const mdd = T.stats.mdd(val.map(x => x.v));
      const rs = r.slice().sort((a, b) => a - b), var95 = rs[Math.floor(rs.length * 0.05)] * 100;
      const rr = top.slice(0, 6).map((p, i) => ret(val.map((x, j) => ({ c: maps[i][x.d] ?? 0 })).filter(x => x.c), 'c'));
      const names = top.slice(0, 6).map(p => T.disp(p.symbol));
      el().innerHTML = `<table>
        ${[['Volatilitas tahunan', T.pct(vol), ''], ['Volatilitas IHSG', T.pct(volb), ''], ['Beta vs IHSG', T.fmt(beta), ''], ['Return 1T (komposisi kini)', T.pct(tot * 100), T.cls(tot)], ['Return IHSG 1T', T.pct(totb * 100), T.cls(totb)],
        ['Sharpe (rf 5%)', T.fmt(sharpe), ''], ['Max drawdown', T.pct(mdd), 'dn'], ['VaR harian 95% (historis)', T.pct(var95), 'dn'], ['Bobot terbesar', T.disp(list[0].symbol) + ' ' + T.pct(list[0].w, 1), '']].map(([k, v, c]) => `<tr class="nohov"><td class="l dim">${k}</td><td class="${c}">${v}</td></tr>`).join('')}</table>
        <div class="note" style="margin-top:6px">Korelasi (return harian)</div>
        <table><thead><tr><th></th>${names.map(n => `<th>${n}</th>`).join('')}</tr></thead><tbody>${names.map((n, i) => `<tr class="nohov"><td class="l">${n}</td>${names.map((_, j) => { const c = i === j ? 1 : T.stats.corr(rr[i], rr[j]); return `<td style="background:rgba(232,115,26,${c == null ? 0 : Math.max(0, c) * .45})">${c == null ? '—' : T.fmt(c)}</td>`; }).join('')}</tr>`).join('')}</tbody></table>
        <div class="note">Dihitung dari komposisi saat ini (maks. 15 posisi terbesar) ke belakang 1 tahun. Ini bukan kinerja riil Anda.${list.length > 15 ? ' Posisi lain diabaikan.' : ''}</div>`;
      if (!chart) { chart = LightweightCharts.createChart($('pfChart'), { autoSize: true, layout: { background: { color: '#111113' }, textColor: '#7d7d85' }, grid: { vertLines: { color: '#17171a' }, horzLines: { color: '#17171a' } }, rightPriceScale: { borderColor: '#222226' }, timeScale: { borderColor: '#222226' } }); }
      else { chart.remove(); chart = LightweightCharts.createChart($('pfChart'), { autoSize: true, layout: { background: { color: '#111113' }, textColor: '#7d7d85' }, grid: { vertLines: { color: '#17171a' }, horzLines: { color: '#17171a' } }, rightPriceScale: { borderColor: '#222226' }, timeScale: { borderColor: '#222226' } }); }
      const a = chart.addLineSeries({ color: '#e8731a', lineWidth: 2, title: 'Portofolio' }), b = chart.addLineSeries({ color: '#7d7d85', lineWidth: 1, title: 'IHSG' });
      a.setData(val.map(x => ({ time: x.d, value: x.v / val[0].v * 100 }))); b.setData(val.map(x => ({ time: x.d, value: x.b / val[0].b * 100 })));
      chart.timeScale().fitContent();
    } catch (e) { if (el()) el().innerHTML = `<span class="err">Risiko gagal dihitung: ${T.esc(e.message)}</span>`; }
  }
  T.views.portfolio = { init() { box = $('v-portfolio'); }, show() { chart = null; render(); }, positions };
})();
