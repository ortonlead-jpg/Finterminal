// SETTINGS & PROFILE
(() => {
  const S = () => T.data.settings;
  function settings() {
    const s = S(), a = s.ai, box = $('v-settings');
    box.innerHTML = `<div class="cols">
      <section class="p s6"><h2><span class="t">UMUM</span></h2><div class="pad">
        <div class="row">${[['stRef', 'Refresh data (detik)', s.refreshSec, 90], ['stFb', 'Fee beli (%)', s.feeBuy, 90], ['stFs', 'Fee jual (%)', s.feeSell, 90]].map(([i, l, v, w]) => `<label>${l}<input id="${i}" type="number" step="any" value="${v}" style="width:${w}px"></label>`).join('')}</div>
        <label>Watchlist (kode dipisah spasi atau koma)<textarea id="stWl" rows="5">${T.esc((s.watchlist || []).join(' '))}</textarea></label>
        <div class="note">Fee default 0,15% beli dan 0,25% jual (kisaran umum broker; sesuaikan dengan broker Anda). Dipakai di Portfolio, Backtest, dan Algo.</div></div></section>
      <section class="p s6"><h2><span class="t">AI</span></h2><div class="pad">
        <div class="row"><label>Provider<select id="aiProv">${[['anthropic', 'Anthropic (Claude)'], ['openai', 'OpenAI'], ['openrouter', 'OpenRouter'], ['groq', 'Groq'], ['deepseek', 'DeepSeek'], ['ollama', 'Ollama (lokal)'], ['custom', 'Kustom (OpenAI-compatible)']].map(([v, l]) => `<option value="${v}" ${v === a.provider ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Model<input id="aiModel" list="aiModels" value="${T.esc(a.model)}" style="width:200px"></label><datalist id="aiModels"><option>claude-sonnet-5-5</option><option>claude-opus-5-5</option><option>claude-haiku-5-5</option></datalist></div>
        <div class="row"><label>Kunci API ${a.keySet ? `<span class="up">tersimpan (…${T.esc(a.keyLast4)})</span>` : '<span class="warn">belum diisi</span>'}<input id="aiKey" type="password" autocomplete="off" placeholder="${a.keySet ? 'kosongkan = tetap pakai yang tersimpan' : 'tempel kunci API'}" style="width:290px"></label>
          ${a.keySet ? '<button class="btn red" id="aiKeyDel">HAPUS KUNCI</button>' : ''}</div>
        <label>Base URL (opsional; wajib untuk provider kustom)<input id="aiBase" value="${T.esc(a.baseUrl || '')}" placeholder="kosong = bawaan provider" style="width:100%"></label>
        <div class="row" style="margin-top:8px"><label>Temperature<input id="aiTemp" type="number" step="0.1" min="0" max="1" value="${a.temperature}" style="width:80px"></label><label>Maks token jawaban<input id="aiMax" type="number" value="${a.maxTokens}" style="width:100px"></label></div>
        <label>System prompt<textarea id="aiSys" rows="4">${T.esc(a.system)}</textarea></label>
        <div class="row" style="margin-top:8px"><button class="btn" id="aiTest">TES KONEKSI</button><span id="aiTestMsg" class="note"></span></div>
        <div class="note">Kunci disimpan di <b>data/store.json</b> di server (izin 600) dan tidak pernah dikirim balik ke browser. Dengan Ollama tidak perlu kunci.</div></div></section>
      <section class="p s12"><h2><span class="t">DATA</span></h2><div class="pad"><div class="row">
        <button class="btn" id="dExp">EKSPOR DATA (JSON)</button><label style="flex-direction:row;align-items:center;gap:6px">Impor <input type="file" id="dImp" accept=".json"></label>
        <span class="note">Ekspor berisi transaksi, paper trading, pengaturan, dan obrolan AI, tanpa kunci API.</span></div></div></section></div>
      <div class="row" style="margin-top:8px"><button class="btn pri" id="stSave">SIMPAN PENGATURAN</button><span id="stMsg" class="note"></span></div>`;
    $('stSave').onclick = async () => {
      s.refreshSec = Math.max(15, +$('stRef').value || 45); s.feeBuy = +$('stFb').value || 0; s.feeSell = +$('stFs').value || 0;
      s.watchlist = [...new Set($('stWl').value.toUpperCase().split(/[\s,]+/).filter(Boolean).map(x => x.replace(/\.JK$/, '')))];
      Object.assign(a, { provider: $('aiProv').value, model: $('aiModel').value.trim(), baseUrl: $('aiBase').value.trim(), temperature: +$('aiTemp').value, maxTokens: +$('aiMax').value, system: $('aiSys').value });
      const k = $('aiKey').value.trim(); if (k) a.apiKey = k;
      try { await T.saveNow(); T.board.reload(); $('stMsg').textContent = 'Tersimpan.'; $('stMsg').className = 'note up'; settings(); } catch (e) { $('stMsg').textContent = 'Gagal: ' + e.message; $('stMsg').className = 'note dn'; }
    };
    if ($('aiKeyDel')) $('aiKeyDel').onclick = async () => { if (!confirm('Hapus kunci API tersimpan?')) return; a.apiKey = '__clear__'; await T.saveNow(); settings(); };
    $('aiTest').onclick = async () => { const m = $('aiTestMsg'); m.textContent = 'menguji… (simpan dulu bila baru mengubah)'; m.className = 'note';
      try { const r = await T.api('ai', { method: 'POST', body: { messages: [{ role: 'user', content: 'Balas satu kata: siap' }] } }); m.textContent = 'Berhasil: ' + r.text.slice(0, 60); m.className = 'note up'; } catch (e) { m.textContent = 'Gagal: ' + e.message; m.className = 'note dn'; } };
    $('dExp').onclick = () => T.download('terminal-idx-data.json', JSON.stringify(T.data, null, 1));
    $('dImp').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (!confirm('Impor akan menimpa data (kecuali kunci API). Lanjut?')) return; delete (j.settings || {}).ai?.keySet; T.data = { ...T.data, ...j }; await T.saveNow(); location.reload(); } catch (err) { alert('File tidak valid: ' + err.message); } };
  }
  function profile() {
    const p = T.data.profile, box = $('v-profile'), tx = T.data.portfolio.tx.length, pp = T.data.paper;
    box.innerHTML = `<div class="cols"><section class="p s6"><h2><span class="t">PROFIL</span></h2><div class="pad">
      <label>Nama<input id="pfName" value="${T.esc(p.name)}" style="width:100%"></label>
      <label style="margin-top:8px">Profil risiko<select id="pfRisk">${['konservatif', 'moderat', 'agresif'].map(r => `<option ${r === p.risk ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label style="margin-top:8px">Catatan pribadi (strategi, aturan, tujuan)<textarea id="pfNotes" rows="8">${T.esc(p.notes)}</textarea></label>
      <div class="row" style="margin-top:8px"><button class="btn pri" id="pfSave">SIMPAN</button><span id="pfMsg" class="note"></span></div></div></section>
      <section class="p s6"><h2><span class="t">RINGKASAN AKUN</span></h2><div class="pad">${[['Transaksi portofolio tercatat', tx], ['Posisi portofolio aktif', T.views.portfolio.positions().list.length], ['Saham di watchlist', T.data.settings.watchlist.length], ['Strategi paper', (pp.strategies || []).length], ['Order paper', (pp.orders || []).length], ['Pesan AI tersimpan', (T.data.chat || []).length], ['Provider AI', T.data.settings.ai.provider + (T.data.settings.ai.keySet ? ' (kunci tersimpan)' : ' (belum ada kunci)')]].map(([k, v]) => `<div style="display:flex;justify-content:space-between;border-bottom:1px solid #17171a;padding:5px 0"><span class="dim">${k}</span><b>${T.esc(v)}</b></div>`).join('')}
      <div class="note">Data pribadi tersimpan di server lokal (data/store.json), tidak dikirim ke pihak ketiga kecuali konteks yang Anda izinkan ke penyedia AI.</div></div></section></div>`;
    $('pfSave').onclick = async () => { p.name = $('pfName').value; p.risk = $('pfRisk').value; p.notes = $('pfNotes').value; try { await T.saveNow(); $('pfMsg').textContent = 'Tersimpan.'; $('pfMsg').className = 'note up'; } catch (e) { $('pfMsg').textContent = e.message; } };
  }
  T.views.settings = { show: settings };
  T.views.profile = { show: profile };
})();
