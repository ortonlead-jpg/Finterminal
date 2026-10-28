// AI CHAT: obrolan dengan konteks data terminal. Kunci API dan model diatur di Settings; panggilan lewat server lokal.
(() => {
  let box, busy = false;
  const ctxOpt = { market: true, symbol: true, portfolio: true, news: false };
  const PROMPTS = [
    ['Ringkas pasar hari ini', 'Ringkas kondisi pasar hari ini berdasarkan indeks, kurs, komoditas, dan saham top gainers/losers pada konteks.'],
    ['Analisis saham terpilih', 'Analisis teknikal dan risiko saham yang sedang dipilih pada konteks. Sebutkan level penting, tren, dan apa yang perlu dipantau.'],
    ['Cek portofolio saya', 'Tinjau portofolio saya: konsentrasi, sektor, dan risiko utama. Beri saran umum untuk diversifikasi tanpa menyebut kepastian.'],
    ['Rangkum berita', 'Rangkum berita pasar terbaru pada konteks dan apa dampak potensialnya.'],
  ];
  const sma = (c, n) => c.length < n ? null : c.slice(-n).reduce((s, x) => s + x.close, 0) / n;
  async function buildContext() {
    const parts = ['Sumber terminal: '+(T.mode==='demo'?'SIMULASI PEMBELAJARAN, bukan fakta harga atau laporan aktual.':'Yahoo Finance, dapat tertunda.')];
    if (ctxOpt.market && T.lastQuotes) {
      const f = q => `${T.disp(q.symbol)} ${T.fmt(q.price, q.price < 100 ? 2 : 0)} (${q.pct >= 0 ? '+' : ''}${T.fmt(q.pct)}%)`;
      parts.push('Indeks/kurs/komoditas: ' + T.lastQuotes.idx.filter(q => !q.error).map(f).join('; '));
      const w = T.lastQuotes.watch;
      parts.push('Top gainers watchlist: ' + w.slice(0, 5).map(f).join('; ')); parts.push('Top losers watchlist: ' + w.slice(-5).reverse().map(f).join('; '));
    }
    if (ctxOpt.symbol && T.current) {
      try {
        const c = await T.series(T.current, '1y'), l = c[c.length - 1], at = n => c.length > n ? (l.close / c[c.length - 1 - n].close - 1) * 100 : null;
        parts.push(`Saham terpilih ${T.disp(T.current)}: terakhir ${T.fmt(l.close, 0)}; return 1B ${T.fmt(at(21))}%, 3B ${T.fmt(at(63))}%, 1T ${T.fmt((l.close / c[0].close - 1) * 100)}%; SMA20 ${T.fmt(sma(c, 20), 0)}, SMA50 ${T.fmt(sma(c, 50), 0)}, SMA200 ${T.fmt(sma(c, 200), 0)}; tertinggi 1T ${T.fmt(Math.max(...c.map(x => x.high)), 0)}, terendah 1T ${T.fmt(Math.min(...c.map(x => x.low)), 0)}`);
      } catch (e) {}
    }
    if (ctxOpt.portfolio) {
      const { list } = T.views.portfolio.positions();
      if (list.length) parts.push('Portofolio pengguna (lot @ harga rata-rata): ' + list.map(p => `${T.disp(p.symbol)} ${T.fmt(p.qty / 100, 0)} lot @ ${T.fmt(p.avg, 0)}`).join('; '));
    }
    if (ctxOpt.news) { try { parts.push('Berita terbaru: ' + (await T.api('news')).slice(0, 10).map(n => n.title).join(' | ')); } catch (e) {} }
    return parts.join('\n');
  }
  function bubbles() {
    const h = T.data.chat || [];
    $('aiChat').innerHTML = h.length ? h.map(m => `<div class="msg ${m.role === 'user' ? 'u' : m.err ? 'a e' : 'a'}">${T.esc(m.content)}</div>`).join('') : '<div class="dim">Tanyakan sesuatu tentang pasar, saham pilihan Anda, atau portofolio. Jawaban AI bisa keliru dan bukan saran investasi.</div>';
    $('aiChat').scrollTop = 1e9;
  }
  async function send(text) {
    if (busy || !text.trim()) return;
    busy = true; $('aiSend').disabled = true;
    T.data.chat = (T.data.chat || []).filter(m => !m.err).slice(-40); T.data.chat.push({ role: 'user', content: text }); bubbles();
    $('aiChat').insertAdjacentHTML('beforeend', '<div class="msg a dim" id="aiWait">berpikir…</div>'); $('aiChat').scrollTop = 1e9;
    try {
      const context = T.data.settings.ai.includeContext ? await buildContext() : '';
      const r = await T.api('ai', { method: 'POST', body: { messages: T.data.chat.map(({ role, content }) => ({ role, content })), context } });
      T.data.chat.push({ role: 'assistant', content: r.text });
    } catch (e) { T.data.chat.push({ role: 'assistant', content: 'Gagal: ' + e.message, err: true }); }
    busy = false; $('aiSend').disabled = false; bubbles(); T.save();
  }
  function draw() {
    const a = T.data.settings.ai, ready = a.keySet || a.provider === 'ollama';
    box.innerHTML = `<div class="cols"><section class="p s8"><h2><span class="t">AI CHAT · ${T.esc(a.provider)} / ${T.esc(a.model)}</span><span class="tools"><button class="btn sm" id="aiClear">BERSIHKAN</button></span></h2>
        <div class="chat" id="aiChat"></div>
        <div style="display:flex;gap:6px;padding:8px;border-top:1px solid var(--line)"><textarea id="aiIn" rows="2" placeholder="Tulis pertanyaan… (Enter kirim, Shift+Enter baris baru)"></textarea><button class="btn pri" id="aiSend">KIRIM</button></div></section>
      <section class="p s4"><h2><span class="t">KONTEKS & PENGATURAN</span></h2><div class="pad">
        ${ready ? '' : '<div class="warn" style="margin-bottom:8px">Kunci API belum diisi. Buka Settings &gt; AI.</div>'}
        <label style="flex-direction:row;align-items:center;gap:6px;margin-bottom:6px"><input type="checkbox" id="aiCtxOn" ${a.includeContext ? 'checked' : ''}> Sertakan data terminal ke AI</label>
        ${[['market', 'Pasar (indeks, top movers)'], ['symbol', 'Saham terpilih (' + T.disp(T.current) + ')'], ['portfolio', 'Portofolio saya'], ['news', 'Berita terbaru']].map(([k, l]) => `<label style="flex-direction:row;align-items:center;gap:6px;margin-bottom:4px"><input type="checkbox" data-c="${k}" ${ctxOpt[k] ? 'checked' : ''}> ${l}</label>`).join('')}
        <div class="note">Data yang dicentang dikirim ke penyedia AI yang Anda pilih. Matikan "Portofolio saya" kalau tidak ingin posisi Anda terkirim.</div>
        <div style="margin:10px 0 4px" class="dim">PROMPT CEPAT</div>
        ${PROMPTS.map(([l, p], i) => `<button class="btn" style="display:block;width:100%;margin-bottom:4px;text-align:left" data-q="${i}">${l}</button>`).join('')}
        <button class="btn" style="margin-top:8px" id="aiSet">BUKA SETTINGS AI</button></div></section></div>`;
    bubbles();
    $('aiSend').onclick = () => { const v = $('aiIn').value; $('aiIn').value = ''; send(v); };
    $('aiIn').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('aiSend').click(); } };
    $('aiClear').onclick = () => { T.data.chat = []; T.save(); bubbles(); };
    $('aiCtxOn').onchange = e => { T.data.settings.ai.includeContext = e.target.checked; T.save(); };
    box.querySelectorAll('[data-c]').forEach(i => i.onchange = () => ctxOpt[i.dataset.c] = i.checked);
    box.querySelectorAll('[data-q]').forEach(b => b.onclick = () => send(PROMPTS[+b.dataset.q][1]));
    $('aiSet').onclick = () => T.go('settings');
  }
  T.views.ai = { init() { box = $('v-ai'); }, show() { draw(); } };
})();
