// GET /api/store -> seluruh data pribadi (kunci API disamarkan). PUT /api/store -> simpan.
// Disimpan di data/store.json (lokal). Untuk hosting nanti, ganti ke KV/DB dengan antarmuka sama.
const fs = require('fs'), path = require('path');
const { readBody, send } = require('./_lib');
const {replay,validateOrder}=require('../public/js/ledger');
const FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'store.json');
const DEFAULT = {
  profile: { name: '', risk: 'moderat', notes: '' },
  settings: { refreshSec: 45, watchlist: 'BBCA BBRI BMRI BBNI TLKM ASII UNVR ICBP INDF GOTO AMMN BREN BRPT TPIA CPIN ADRO PTBA ITMG UNTR KLBF SMGR ANTM INCO MDKA MEDC PGAS AKRA EXCL ISAT TOWR MAPI ESSA INKP JSMR BSDE CTRA ARTO BRIS AMRT'.split(' '),
    feeBuy: 0.15, feeSell: 0.25,
    ai: { provider: 'anthropic', model: 'claude-sonnet-5-5', baseUrl: '', temperature: 0.3, maxTokens: 1500, includeContext: true,
          system: 'Kamu adalah asisten riset pasar modal Indonesia. Jawab dalam bahasa Indonesia, ringkas dan berbasis data yang diberikan. Jangan memberi kepastian harga atau janji keuntungan; sebut asumsi dan risikonya.' } },
  portfolio: { positions: [], tx: [] },
  paper: { cash: 100000000, positions: {}, orders: [], strategies: [] },
};
function load() {
  try { const d = JSON.parse(fs.readFileSync(FILE, 'utf8')); return { ...DEFAULT, ...d, settings: { ...DEFAULT.settings, ...d.settings, ai: { ...DEFAULT.settings.ai, ...(d.settings || {}).ai } } }; }
  catch (e) { return JSON.parse(JSON.stringify(DEFAULT)); }
}
function save(d) { fs.mkdirSync(path.dirname(FILE), { recursive: true });const temp=FILE+'.tmp';fs.writeFileSync(temp,JSON.stringify(d,null,1),{mode:0o600});fs.renameSync(temp,FILE); }
function masked(d) {
  const c = JSON.parse(JSON.stringify(d)); const k = c.settings.ai.apiKey || '';
  delete c.settings.ai.apiKey; c.settings.ai.keySet = !!k; c.settings.ai.keyLast4 = k.slice(-4);
  return c;
}
module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') return send(res, 200, masked(load()));
    if (req.method === 'PUT') {
      const inc = await readBody(req), old = load();
      const ai = { ...(inc.settings && inc.settings.ai) };
      let key = old.settings.ai.apiKey || '';
      if (ai.apiKey === '__clear__') key = ''; else if (typeof ai.apiKey === 'string' && ai.apiKey.trim()) key = ai.apiKey.trim();
      delete ai.keySet; delete ai.keyLast4; ai.apiKey = key;
      const next = { ...old, ...inc, settings: { ...old.settings, ...inc.settings, ai: { ...old.settings.ai, ...ai } } };
      try {
       replay(next.portfolio.tx||[]);
       if(!Array.isArray(next.settings.watchlist)||next.settings.watchlist.length>80||!next.settings.watchlist.every(s=>/^[A-Z0-9^][A-Z0-9.^=\-]{0,23}$/.test(s)))throw new Error('Watchlist tidak valid (maksimal 80 kode).');
       if(!Number.isFinite(next.paper.cash)||next.paper.cash<0)throw new Error('Saldo paper tidak valid.');
       for(const o of next.paper.orders||[])validateOrder(o.side,o.qty/100,o.price,next.settings.feeBuy,next.settings.feeSell);
      }catch(e){return send(res,422,{error:e.message});}
      save(next); return send(res, 200, masked(next));
    }
    send(res, 405, { error: 'method' });
  } catch (e) { send(res, 500, { error: e.message }); }
};
module.exports.load = load;
