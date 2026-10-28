// ALGO: paper trading (simulasi). Tidak ada koneksi broker dan tidak ada uang sungguhan.
(() => {
  let box, busy = false;
  const P = () => T.data.paper;
  const DEF = { sma: { fast: 20, slow: 50 }, rsi: { n: 14, lo: 30, hi: 55 }, don: { n: 55, m: 20 } };
  const NAME = { sma: 'SMA cross', rsi: 'RSI mean reversion', don: 'Breakout Donchian' };

  function fill(symbol, side, lots, price, note) {
    try{Ledger.validateOrder(side,lots,price,T.data.settings.feeBuy,T.data.settings.feeSell);}catch(e){return e.message;}
    const p = P(), qty = lots * 100, gross = qty * price;
    const fee = Math.round(gross * (side === 'BUY' ? T.data.settings.feeBuy : T.data.settings.feeSell) / 100);
    if (side === 'BUY') {
      if (p.cash < gross + fee) return 'Kas tidak cukup.';
      p.cash -= gross + fee; const h = p.positions[symbol] || { qty: 0, avg: 0 };
      h.avg = (h.avg * h.qty + gross + fee) / (h.qty + qty); h.qty += qty; p.positions[symbol] = h;
    } else {
      const h = p.positions[symbol]; if (!h || h.qty < qty) return 'Posisi tidak cukup.';
      p.cash += gross - fee; h.qty -= qty; if (!h.qty) delete p.positions[symbol];
    }
    p.orders.unshift({ id: Date.now() + Math.random(), t: new Date().toISOString(), symbol, side, qty, price, fee, note: note || 'manual' });
    p.orders = p.orders.slice(0, 500); return null;
  }
  async function quotes(syms) { const m = {}; if (syms.length) (await T.api('quote?symbols=' + syms.join(','))).forEach(q => m[q.symbol] = q); return m; }

  async function evaluate() {
    if (busy) return; busy = true; const log = [];
    try {
      const ss = P().strategies.filter(s => s.enabled);
      const q = await quotes([...new Set(ss.map(s => s.symbol))]);
      for (const s of ss) {
        const c = await T.series(s.symbol, '2y'); if (c.length < 120 || !q[s.symbol] || q[s.symbol].error) { log.push(`${T.disp(s.symbol)}: data tidak cukup`); continue; }
        const sig = T.views.backtest.signals(s.kind, c, s.params), want = sig[sig.length - 1], px = q[s.symbol].price, held = P().positions[s.symbol];
        if (want && !(held && held.qty)) {
          const lots = Math.floor((s.alloc / px) / 100);
          if (lots < 1) { log.push(`${T.disp(s.symbol)}: sinyal BELI tapi alokasi terlalu kecil untuk 1 lot`); continue; }
          const err = fill(s.symbol, 'BUY', lots, px, s.kind); log.push(`${T.disp(s.symbol)}: ${err || 'BELI ' + lots + ' lot @ ' + T.fmt(px, 0)}`);
        } else if (!want && held && held.qty) {
          const err = fill(s.symbol, 'SELL', held.qty / 100, px, s.kind); log.push(`${T.disp(s.symbol)}: ${err || 'JUAL ' + (held.qty / 100) + ' lot @ ' + T.fmt(px, 0)}`);
        } else log.push(`${T.disp(s.symbol)}: tidak ada perubahan (sinyal ${want ? 'ON' : 'OFF'})`);
      }
      if (!ss.length) log.push('Belum ada strategi aktif.');
      T.save();
    } catch (e) { log.push('Gagal: ' + e.message); }
    busy = false; await draw(log);
  }

  async function draw(log) {
    const p = P(), syms = Object.keys(p.positions);
    let q = {}; try { q = await quotes(syms); } catch (e) {}
    let mv = 0; syms.forEach(s => mv += p.positions[s].qty * ((q[s] || {}).price ?? p.positions[s].avg));
    const eq = p.cash + mv, init = p.initial || 100000000;
    box.innerHTML = `<div class="note warn">PAPER TRADING: simulasi saja. Tidak terhubung ke broker mana pun dan tidak mengirim order sungguhan.</div>
    <div class="kpi"><div><small>EKUITAS</small><b>${T.idr(eq)}</b></div><div><small>KAS</small><b>${T.idr(p.cash)}</b></div><div><small>NILAI POSISI</small><b>${T.idr(mv)}</b></div>
      <div><small>P&amp;L VS MODAL AWAL</small><b class="${T.cls(eq - init)}">${T.idr(eq - init)}</b><br><span class="${T.cls(eq - init)}">${T.arrow((eq / init - 1) * 100)}</span></div></div>
    ${log ? `<div class="p" style="margin-bottom:8px"><h2><span class="t">HASIL EVALUASI</span></h2><div class="pad">${log.map(T.esc).join('<br>')}</div></div>` : ''}
    <div class="cols">
      <section class="p s6"><h2><span class="t">STRATEGI OTOMATIS</span><span class="tools"><button class="btn sm pri" id="alEval">EVALUASI SEKARANG</button></span></h2><div class="body"><table><thead><tr><th class="l">KODE</th><th class="l">STRATEGI</th><th>ALOKASI</th><th>AKTIF</th><th></th></tr></thead><tbody>
        ${p.strategies.map(s => `<tr class="nohov"><td class="l">${T.disp(s.symbol)}</td><td class="l">${NAME[s.kind]} <span class="dim">${Object.values(s.params).join('/')}</span></td><td>${T.idr(s.alloc)}</td><td><input type="checkbox" data-en="${s.id}" ${s.enabled ? 'checked' : ''}></td><td><button class="btn sm red" data-ds="${s.id}">×</button></td></tr>`).join('') || '<tr class="nohov"><td colspan="5" class="l dim">Belum ada strategi.</td></tr>'}</tbody></table></div>
        <div class="pad" style="border-top:1px solid var(--line)"><div class="row"><label>Kode<input id="sSym" style="width:90px" placeholder="BBCA"></label>
          <label>Strategi<select id="sKind">${Object.entries(NAME).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>Alokasi (Rp)<input id="sAlloc" type="number" value="10000000" style="width:120px"></label><button class="btn" id="sAdd">TAMBAH</button></div>
          <div class="note">Parameter bawaan (SMA 20/50, RSI 14/30/55, Donchian 55/20). Evaluasi memakai sinyal bar terakhir dan harga pasar saat ini sebagai harga isi; dijalankan manual saat Anda klik tombol. Data tertunda 10–15 menit.</div></div></section>
      <section class="p s6"><h2><span class="t">POSISI</span></h2><div class="body"><table><thead><tr><th class="l">KODE</th><th>LOT</th><th>RATA2</th><th>HARGA</th><th>P&amp;L</th></tr></thead><tbody>
        ${syms.map(s => { const h = p.positions[s], px = (q[s] || {}).price ?? h.avg, pnl = (px - h.avg) * h.qty; return `<tr class="nohov"><td class="l">${T.disp(s)}</td><td>${h.qty / 100}</td><td>${T.fmt(h.avg, 0)}</td><td>${T.fmt(px, 0)}</td><td class="${T.cls(pnl)}">${T.fmt(pnl, 0)}</td></tr>`; }).join('') || '<tr class="nohov"><td colspan="5" class="l dim">—</td></tr>'}</tbody></table></div>
        <div class="pad" style="border-top:1px solid var(--line)"><div class="row"><label>Kode<input id="oSym" style="width:90px"></label><label>Jenis<select id="oSide"><option>BUY</option><option>SELL</option></select></label>
          <label>Lot<input id="oLot" type="number" min="1" value="1" style="width:80px"></label><button class="btn" id="oGo">ORDER MANUAL (harga pasar)</button></div><div id="oMsg" class="note"></div></div></section>
    </div>
    <div class="p" style="margin-top:8px"><h2><span class="t">RIWAYAT ORDER</span><span class="tools"><button class="btn sm red" id="alReset">RESET AKUN</button></span></h2><div class="body"><table><thead><tr><th class="l">WAKTU</th><th class="l">KODE</th><th class="l">JENIS</th><th>LOT</th><th>HARGA</th><th>FEE</th><th class="l">SUMBER</th></tr></thead><tbody>
      ${p.orders.slice(0, 60).map(o => `<tr class="nohov"><td class="l">${new Date(o.t).toLocaleString('id-ID')}</td><td class="l">${T.disp(o.symbol)}</td><td class="l ${o.side === 'BUY' ? 'up' : 'dn'}">${o.side}</td><td>${o.qty / 100}</td><td>${T.fmt(o.price, 0)}</td><td>${T.fmt(o.fee, 0)}</td><td class="l dim">${T.esc(o.note)}</td></tr>`).join('') || '<tr class="nohov"><td colspan="7" class="l dim">—</td></tr>'}</tbody></table></div></div>`;
    $('alEval').onclick = evaluate;
    $('sAdd').onclick = () => { const s = T.sym($('sSym').value || ''); if (s === '.JK') return; const k = $('sKind').value;
      p.strategies.push({ id: Date.now(), symbol: s, kind: k, params: { ...DEF[k] }, alloc: +$('sAlloc').value || 10000000, enabled: true }); T.save(); draw(); };
    box.querySelectorAll('[data-en]').forEach(c => c.onchange = () => { p.strategies.find(s => s.id == c.dataset.en).enabled = c.checked; T.save(); });
    box.querySelectorAll('[data-ds]').forEach(b => b.onclick = () => { p.strategies = p.strategies.filter(s => s.id != b.dataset.ds); T.save(); draw(); });
    $('oGo').onclick = async () => { const s = T.sym($('oSym').value || ''); const lots = +$('oLot').value;
      try { const qq = await quotes([s]); if (!qq[s] || qq[s].error) throw new Error('harga tidak ditemukan'); const err = fill(s, $('oSide').value, lots, qq[s].price, 'manual'); if (err) { $('oMsg').textContent = err; $('oMsg').className = 'note dn'; return; } T.save(); draw(); }
      catch (e) { $('oMsg').textContent = e.message; $('oMsg').className = 'note dn'; } };
    $('alReset').onclick = () => { const v = prompt('Modal awal baru (Rp)?', '100000000'); if (v == null) return; if (!confirm('Reset akun paper: posisi dan riwayat order dihapus. Lanjut?')) return;
      T.data.paper = { cash: +v || 100000000, initial: +v || 100000000, positions: {}, orders: [], strategies: p.strategies }; T.save(); draw(); };
  }
  T.views.algo = { init() { box = $('v-algo'); const p = P(); if (!p.positions) p.positions = {}; if (!p.orders) p.orders = []; if (!p.strategies) p.strategies = []; if (p.cash == null) p.cash = 100000000; if (!p.initial) p.initial = p.cash; }, show() { draw(); } };
})();
