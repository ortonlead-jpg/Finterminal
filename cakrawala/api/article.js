// GET /api/article?url=... -> teks artikel (hanya untuk diringkas AI; tidak ditampilkan utuh di UI)
const { cached, send, UA } = require('./_lib');
const ALLOW = ['cnbcindonesia.com', 'detik.com', 'antaranews.com', 'idxchannel.com', 'cnnindonesia.com'];
const un = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x').searchParams.get('url') || '';
  let host; try { const p = new URL(u); if (p.protocol !== 'https:') throw 0; host = p.hostname; } catch (e) { return send(res, 400, { error: 'URL tidak valid' }); }
  if (!ALLOW.some(d => host === d || host.endsWith('.' + d))) return send(res, 400, { error: 'domain tidak diizinkan' });
  try {
    const text = await cached('art:' + u, 3600000, async () => {
      const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
      if (!ALLOW.some(d => new URL(r.url).hostname.endsWith(d))) throw new Error('dialihkan ke domain lain');
      let h = await r.text();
      h = h.replace(/<(script|style|nav|header|footer|aside|figure|noscript)[\s\S]*?<\/\1>/gi, ' ');
      const ps = [...h.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => un(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()).filter(t => t.length > 40);
      return ps.join('\n').slice(0, 7000);
    });
    if (text.length < 200) throw new Error('isi artikel tidak terbaca (mungkin berbayar/dinamis)');
    send(res, 200, { text });
  } catch (e) { send(res, 502, { error: e.message }); }
};
