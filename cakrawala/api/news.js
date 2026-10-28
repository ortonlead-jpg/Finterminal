// GET /api/news -> berita pasar dari beberapa RSS, digabung dan diurutkan waktu
const { cached, send, UA } = require('./_lib');
const FEEDS = [
  ['CNBC ID', 'https://www.cnbcindonesia.com/market/rss'],
  ['Detik Finance', 'https://finance.detik.com/rss'],
  ['Antara', 'https://www.antaranews.com/rss/ekonomi-bisnis.xml'],
  ['IDX Channel', 'https://www.idxchannel.com/rss'],
  ['CNN ID', 'https://www.cnnindonesia.com/ekonomi/rss'],
];
const un = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)); return m ? un(m[1].trim()) : ''; };
module.exports = async (req, res) => {
  if(require('./_lib').modeOf(req)==='demo')return send(res,200,require('./_demo').education);
  const out = await cached('news', 300000, async () => {
    const all = [];
    await Promise.all(FEEDS.map(async ([src, url]) => {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
        const xml = await r.text();
        for (const it of xml.split(/<item[ >]/).slice(1, 16)) {
          const link = tag(it, 'link') || tag(it, 'guid');
          if (/^https?:\/\//.test(link)) all.push({ src, title: tag(it, 'title'), link, ts: Date.parse(tag(it, 'pubDate')) || 0 });
        }
      } catch (e) {}
    }));
    const seen = new Set();
    return all.filter(n => n.title && !seen.has(n.title) && seen.add(n.title)).sort((a, b) => b.ts - a.ts).slice(0, 60);
  });
  send(res, 200, out);
};
module.exports.FEEDS = FEEDS;
