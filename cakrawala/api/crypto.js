// GET /api/crypto -> 12 pasangan IDR dengan volume terbesar dari Indodax
const { cached, send, UA } = require('./_lib');
module.exports = async (req, res) => {
  try {
    if(require('./_lib').modeOf(req)==='demo')return send(res,200,[{pair:'BTC',last:1750000000,high:1780000000,low:1690000000,volIdr:425000000000,pct:1.84},{pair:'ETH',last:62500000,high:64000000,low:61000000,volIdr:175000000000,pct:-.72},{pair:'SOL',last:3150000,high:3220000,low:3000000,volIdr:98000000000,pct:2.43}].map(q=>({...q,mode:'demo'})));
    const out = await cached('crypto', 20000, async () => {
      const r = await fetch('https://indodax.com/api/summaries', { headers: { 'User-Agent': UA } });
      const j = await r.json();
      const rows = Object.entries(j.tickers).filter(([k]) => k.endsWith('_idr')).map(([k, v]) => {
        const last = +v.last, prev = +(j.prices_24h[k.replace('_', '')] || 0);
        return { pair: k.replace('_idr', '').toUpperCase(), last, high: +v.high, low: +v.low,
                 volIdr: +v.vol_idr, pct: prev ? (last - prev) / prev * 100 : 0 };
      });
      return rows.sort((a, b) => b.volIdr - a.volIdr).slice(0, 12);
    });
    send(res, 200, out);
  } catch (e) { send(res, 502, { error: e.message }); }
};
