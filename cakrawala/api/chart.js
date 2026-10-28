// GET /api/chart?symbol=BBCA.JK&range=6mo&interval=1d -> candle OHLCV
const { cached, yahooChart, send, modeOf, symbolOf } = require('./_lib');
module.exports = async (req, res) => {
  const p = new URL(req.url, 'http://x').searchParams;
  const symbol = p.get('symbol') || '^JKSE', range = p.get('range') || '6mo', interval = p.get('interval') || '1d';
  try {
    symbolOf(symbol);
    if(!['1d','5d','1mo','3mo','6mo','1y','2y','3y','5y','10y'].includes(range)||!['5m','30m','1d','1wk'].includes(interval))return send(res,422,{error:'Rentang atau interval tidak didukung.'});
    if(modeOf(req)==='demo')return send(res,200,require('./_demo').chart(symbol,range,interval));
    const out = await cached(`c:${symbol}:${range}:${interval}`, 60000, async () => {
      const c = await yahooChart(symbol, range, interval);
      const q = c.indicators.quote[0], t = c.timestamp || [];
      const candles = [];
      for (let i = 0; i < t.length; i++)
        if ([q.open[i],q.high[i],q.low[i],q.close[i]].every(Number.isFinite))
          candles.push({ time: t[i], open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] || 0 });
      return {symbol,name:c.meta.shortName||symbol,currency:c.meta.currency,candles,mode:'live',source:'Yahoo Finance · dapat tertunda',asOf:candles.length?new Date(candles.at(-1).time*1000).toISOString():null,fetchedAt:new Date().toISOString()};
    });
    send(res, 200, out);
  } catch (e) { send(res, 502, { error: e.message }); }
};
