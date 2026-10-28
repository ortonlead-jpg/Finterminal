// Bahasa formula mirip AmiBroker AFL (vektor). Kompilasi ke closure; tanpa eval.
// Contoh:  Buy = Cross(MA(C,20), MA(C,50));  Sell = Cross(MA(C,50), MA(C,20));
// Param dioptimasi dengan Optimize("nama", default, min, max, step).
(function (root) {
  const isArr = x => typeof x !== 'number';
  const mk = n => new Float64Array(n).fill(NaN);
  const bin = (a, b, f, n) => {
    if (!isArr(a) && !isArr(b)) return f(a, b);
    const o = new Float64Array(n);
    for (let i = 0; i < n; i++) o[i] = f(isArr(a) ? a[i] : a, isArr(b) ? b[i] : b);
    return o;
  };
  const un = (a, f, n) => { if (!isArr(a)) return f(a); const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = f(a[i]); return o; };
  const V = (a, n) => isArr(a) ? a : new Float64Array(n).fill(a);

  // ---------- indikator ----------
  function rollSum(x, p, n) {
    const o = mk(n); let s = 0, bad = 0;
    for (let i = 0; i < n; i++) {
      const v = x[i]; if (v !== v) bad++; else s += v;
      if (i >= p) { const u = x[i - p]; if (u !== u) bad--; else s -= u; }
      if (i >= p - 1 && bad === 0) o[i] = s;
    }
    return o;
  }
  const ma = (x, p, n) => { const s = rollSum(V(x, n), p, n); for (let i = 0; i < n; i++) s[i] /= p; return s; };
  function ema(x, p, n, alpha) {
    x = V(x, n); const a = alpha || 2 / (p + 1), o = mk(n); let prev = NaN;
    for (let i = 0; i < n; i++) { const v = x[i]; if (v !== v) { o[i] = prev; continue; } prev = prev !== prev ? v : prev + a * (v - prev); o[i] = prev; }
    return o;
  }
  function hhv(x, p, n, isMax) {
    x = V(x, n); const o = mk(n), dq = [];
    for (let i = 0; i < n; i++) {
      const v = x[i];
      while (dq.length && (isMax ? x[dq[dq.length - 1]] <= v : x[dq[dq.length - 1]] >= v)) dq.pop();
      dq.push(i); if (dq[0] <= i - p) dq.shift();
      if (i >= p - 1) o[i] = x[dq[0]];
    }
    return o;
  }
  function stdev(x, p, n) {
    x = V(x, n); const o = mk(n);
    for (let i = p - 1; i < n; i++) { let s = 0, s2 = 0, ok = true; for (let k = i - p + 1; k <= i; k++) { const v = x[k]; if (v !== v) { ok = false; break; } s += v; s2 += v * v; } if (ok) { const m = s / p; o[i] = Math.sqrt(Math.max(0, (s2 - p * m * m) / Math.max(1, p - 1))); } }
    return o;
  }
  function rsi(c, p, n) {
    const o = mk(n); let ag = 0, al = 0;
    for (let i = 1; i < n; i++) {
      const d = c[i] - c[i - 1], g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
      if (d !== d) continue;
      if (i <= p) { ag += g / p; al += l / p; if (i === p) o[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); }
      else { ag = (ag * (p - 1) + g) / p; al = (al * (p - 1) + l) / p; o[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); }
    }
    return o;
  }
  function trueRange(H, L, C, n) { const t = mk(n); for (let i = 0; i < n; i++) t[i] = i === 0 ? H[i] - L[i] : Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])); return t; }
  function adx(H, L, C, p, n) {
    const pdm = mk(n), mdm = mk(n), tr = trueRange(H, L, C, n);
    for (let i = 1; i < n; i++) { const up = H[i] - H[i - 1], dn = L[i - 1] - L[i]; pdm[i] = up > dn && up > 0 ? up : 0; mdm[i] = dn > up && dn > 0 ? dn : 0; }
    const a = 1 / p, str = ema(tr, p, n, a), sp = ema(pdm, p, n, a), sm = ema(mdm, p, n, a), dx = mk(n);
    for (let i = 0; i < n; i++) { const pd = 100 * sp[i] / str[i], md = 100 * sm[i] / str[i]; dx[i] = 100 * Math.abs(pd - md) / (pd + md); }
    return ema(dx, p, n, a);
  }

  // ---------- fungsi bawaan: (args, ctx) ----------
  const F = {
    ma: (a, c) => ma(a[0], a[1], c.n), ema: (a, c) => ema(a[0], a[1], c.n), wilder: (a, c) => ema(a[0], a[1], c.n, 1 / a[1]),
    hhv: (a, c) => hhv(a[0], a[1], c.n, true), llv: (a, c) => hhv(a[0], a[1], c.n, false), highest: (a, c) => hhv(a[0], a[1], c.n, true), lowest: (a, c) => hhv(a[0], a[1], c.n, false),
    sum: (a, c) => rollSum(V(a[0], c.n), a[1], c.n), stdev: (a, c) => stdev(a[0], a[1], c.n),
    rsi: (a, c) => rsi(c.env.c, a[0], c.n), atr: (a, c) => ema(trueRange(c.env.h, c.env.l, c.env.c, c.n), a[0], c.n, 1 / a[0]), adx: (a, c) => adx(c.env.h, c.env.l, c.env.c, a[0], c.n),
    roc: (a, c) => { const x = V(a[0], c.n), p = a[1], o = mk(c.n); for (let i = p; i < c.n; i++) o[i] = (x[i] / x[i - p] - 1) * 100; return o; },
    ref: (a, c) => {
      const k = a[1]; if (isArr(k) || k > 0) throw new Error('Ref() dengan nilai positif melihat masa depan (look-ahead) dan tidak diizinkan. Pakai Ref(x,-1) untuk kemarin.');
      const x = V(a[0], c.n), s = -k, o = mk(c.n); for (let i = s; i < c.n; i++) o[i] = x[i - s]; return o;
    },
    cross: (a, c) => { const x = V(a[0], c.n), y = V(a[1], c.n), o = new Float64Array(c.n); for (let i = 1; i < c.n; i++) o[i] = x[i] > y[i] && x[i - 1] <= y[i - 1] ? 1 : 0; return o; },
    iif: (a, c) => { const k = V(a[0], c.n), x = V(a[1], c.n), y = V(a[2], c.n), o = new Float64Array(c.n); for (let i = 0; i < c.n; i++) o[i] = k[i] ? x[i] : y[i]; return o; },
    max: (a, c) => bin(a[0], a[1], (x, y) => x > y ? x : y, c.n), min: (a, c) => bin(a[0], a[1], (x, y) => x < y ? x : y, c.n),
    abs: (a, c) => un(a[0], Math.abs, c.n), log: (a, c) => un(a[0], Math.log, c.n), sqrt: (a, c) => un(a[0], Math.sqrt, c.n), int: (a, c) => un(a[0], Math.trunc, c.n),
    count: (a, c) => rollSum(V(a[0], c.n).map(v => v ? 1 : 0), a[1], c.n),
    barssince: (a, c) => { const x = V(a[0], c.n), o = mk(c.n); let last = -1; for (let i = 0; i < c.n; i++) { if (x[i]) last = i; if (last >= 0) o[i] = i - last; } return o; },
    exrem: (a, c) => { const b = V(a[0], c.n), s = V(a[1], c.n), o = new Float64Array(c.n); let on = 0; for (let i = 0; i < c.n; i++) { if (!on && b[i]) { o[i] = 1; on = 1; } else if (on && s[i]) on = 0; } return o; },
    flip: (a, c) => { const b = V(a[0], c.n), s = V(a[1], c.n), o = new Float64Array(c.n); let on = 0; for (let i = 0; i < c.n; i++) { if (b[i]) on = 1; else if (s[i]) on = 0; o[i] = on; } return o; },
    bbandtop: (a, c) => { const x = V(a[0], c.n), m = ma(x, a[1], c.n), s = stdev(x, a[1], c.n); return bin(m, s, (p, q) => p + a[2] * q, c.n); },
    bbandbot: (a, c) => { const x = V(a[0], c.n), m = ma(x, a[1], c.n), s = stdev(x, a[1], c.n); return bin(m, s, (p, q) => p - a[2] * q, c.n); },
    macd: (a, c) => bin(ema(c.env.c, a[0], c.n), ema(c.env.c, a[1], c.n), (p, q) => p - q, c.n),
    signal: (a, c) => ema(bin(ema(c.env.c, a[0], c.n), ema(c.env.c, a[1], c.n), (p, q) => p - q, c.n), a[2], c.n),
    optimize: (a, c) => (c.over && a[0] in c.over) ? c.over[a[0]] : a[1], param: (a, c) => (c.over && a[0] in c.over) ? c.over[a[0]] : a[1],
  };
  const periods={ma:[1],ema:[1],wilder:[1],hhv:[1],llv:[1],highest:[1],lowest:[1],sum:[1],stdev:[1],rsi:[0],atr:[0],adx:[0],roc:[1],count:[1],bbandtop:[1],bbandbot:[1],macd:[0,1],signal:[0,1,2]};
  for(const [name,indices] of Object.entries(periods)){const original=F[name];F[name]=(args,ctx)=>{for(const index of indices)if(!Number.isSafeInteger(args[index])||args[index]<=0||args[index]>100000)throw new Error(name+'(): periode harus bilangan bulat positif (maks. 100000).');return original(args,ctx);};}
  const refFn=F.ref;F.ref=(args,ctx)=>{if(!Number.isSafeInteger(args[1])||args[1]>0||args[1]<-100000)throw new Error('Ref(): nilai positif melihat masa depan; offset harus bilangan bulat 0 atau negatif.');return refFn(args,ctx);};
  const ARITY_MIN = { ma: 2, ema: 2, hhv: 2, llv: 2, rsi: 1, atr: 1, adx: 1, roc: 2, ref: 2, cross: 2, iif: 3, optimize: 5, param: 5, macd: 2, signal: 3 };

  // ---------- tokenizer + parser ----------
  function tokenize(src) {
    src = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    const re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|("[^"]*"|'[^']*')|(==|!=|<=|>=|&&|\|\||[-+*\/^(),;=<>&|!]))/gy, out = [];
    let m, last = 0;
    while (last < src.length && (m = (re.lastIndex = last, re.exec(src)))) {
      last = re.lastIndex;
      if (m[1] !== undefined) out.push({ t: 'num', v: +m[1], p: m.index });
      else if (m[2] !== undefined) { const u = m[2].toUpperCase(); out.push(u === 'AND' || u === 'OR' || u === 'NOT' ? { t: 'op', v: u, p: m.index } : { t: 'id', v: m[2].toLowerCase(), raw: m[2], p: m.index }); }
      else if (m[3] !== undefined) out.push({ t: 'str', v: m[3].slice(1, -1), p: m.index });
      else out.push({ t: 'op', v: m[4], p: m.index });
    }
    if (src.slice(last).trim()) throw new Error('Karakter tidak dikenal di: "' + src.slice(last).trim().slice(0, 20) + '"');
    return out;
  }
  const CONST = { c: 'c', close: 'c', o: 'o', open: 'o', h: 'h', high: 'h', l: 'l', low: 'l', v: 'v', volume: 'v', benchc: 'benchc' };
  function compile(src) {
    const tk = tokenize(src); let i = 0; const params = [], names = new Set();
    const peek = () => tk[i], take = () => tk[i++];
    const isOp = (...v) => tk[i] && tk[i].t === 'op' && v.includes(tk[i].v);
    const expect = v => { if (!isOp(v)) throw new Error(`Diharapkan "${v}"` + (tk[i] ? ` tetapi ada "${tk[i].v}"` : ' di akhir formula')); i++; };
    function prim() {
      const t = take(); if (!t) throw new Error('Formula berakhir tiba-tiba');
      if (t.t === 'num') return () => t.v;
      if (t.t === 'str') return () => t.v;
      if (t.t === 'op' && t.v === '(') { const e = or(); expect(')'); return e; }
      if (t.t === 'op' && t.v === '-') { const e = pow(); return c => un(e(c), x => -x, c.n); }
      if (t.t === 'id') {
        if (isOp('(')) {
          i++; const args = []; if (!isOp(')')) { do { args.push(or()); } while (isOp(',') && ++i); } expect(')');
          const f = F[t.v]; if (!f) throw new Error(`Fungsi tidak dikenal: ${t.raw}()`);
          if (ARITY_MIN[t.v] && args.length < ARITY_MIN[t.v]) throw new Error(`${t.raw}() butuh minimal ${ARITY_MIN[t.v]} argumen`);
          if (t.v === 'optimize' || t.v === 'param') {
            const probe = args.map(a => { try { return a({ n: 0, vars: new Map(), env: {} }); } catch (e) { return undefined; } });
            if (typeof probe[0] !== 'string' || probe.slice(1, 5).some(v => typeof v !== 'number' || v !== v)) throw new Error(`${t.raw}("nama", default, min, max, step) harus berisi angka literal`);
            if (!names.has(probe[0])) { names.add(probe[0]); params.push({ name: probe[0], def: probe[1], min: probe[2], max: probe[3], step: probe[4] || 1 }); }
          }
          return c => f(args.map(a => a(c)), c);
        }
        return c => {
          if (c.vars.has(t.v)) return c.vars.get(t.v);
          const k = CONST[t.v]; if (k) { const r = c.env[k]; if (!r) throw new Error(`Data ${t.raw} tidak tersedia`); return r; }
          throw new Error(`Variabel belum didefinisikan: ${t.raw}`);
        };
      }
      throw new Error(`Token tak terduga: "${t.v}"`);
    }
    function pow() { let l = prim(); while (isOp('^')) { i++; const r = pow(); const a = l; l = c => bin(a(c), r(c), Math.pow, c.n); } return l; }
    function unary() { if (isOp('-')) { i++; const e = unary(); return c => un(e(c), x => -x, c.n); } return pow(); }
    function mul() { let l = unary(); while (isOp('*', '/')) { const op = take().v, r = unary(), a = l; l = op === '*' ? c => bin(a(c), r(c), (x, y) => x * y, c.n) : c => bin(a(c), r(c), (x, y) => x / y, c.n); } return l; }
    function add() { let l = mul(); while (isOp('+', '-')) { const op = take().v, r = mul(), a = l; l = op === '+' ? c => bin(a(c), r(c), (x, y) => x + y, c.n) : c => bin(a(c), r(c), (x, y) => x - y, c.n); } return l; }
    const CMP = { '==': (x, y) => x === y ? 1 : 0, '!=': (x, y) => x !== y ? 1 : 0, '<': (x, y) => x < y ? 1 : 0, '>': (x, y) => x > y ? 1 : 0, '<=': (x, y) => x <= y ? 1 : 0, '>=': (x, y) => x >= y ? 1 : 0 };
    function cmp() { let l = add(); while (isOp('==', '!=', '<', '>', '<=', '>=')) { const f = CMP[take().v], r = add(), a = l; l = c => bin(a(c), r(c), f, c.n); } return l; }
    function not() { if (isOp('NOT', '!')) { i++; const e = not(); return c => un(e(c), x => x ? 0 : 1, c.n); } return cmp(); }
    function and() { let l = not(); while (isOp('AND', '&', '&&')) { i++; const r = not(), a = l; l = c => bin(a(c), r(c), (x, y) => x && y ? 1 : 0, c.n); } return l; }
    function or() { let l = and(); while (isOp('OR', '|', '||')) { i++; const r = and(), a = l; l = c => bin(a(c), r(c), (x, y) => x || y ? 1 : 0, c.n); } return l; }
    const stmts = [];
    while (i < tk.length) {
      if (isOp(';')) { i++; continue; }
      if (tk[i].t === 'id' && tk[i + 1] && tk[i + 1].t === 'op' && tk[i + 1].v === '=') {
        const name = take().v; i++; const e = or(); stmts.push([name, e]);
      } else { const e = or(); stmts.push([null, e]); }
      if (i < tk.length && !isOp(';')) throw new Error(`Tanda ";" hilang sebelum "${tk[i].v}"`);
    }
    return {
      params,
      // env: {o,h,l,c,v,benchc,n}; over: {namaParam: nilai}
      run(env, over) {
        const ctx = { n: env.n, env, vars: new Map(), over: over || null };
        for (const [name, e] of stmts) { const v = e(ctx); if (name) ctx.vars.set(name, v); }
        const get = k => ctx.vars.get(k);
        const toU8 = x => { if (x === undefined) return null; const a = V(x, env.n), o = new Uint8Array(env.n); for (let q = 0; q < env.n; q++) o[q] = a[q] ? 1 : 0; return o; };
        const buy = toU8(get('buy')), sell = toU8(get('sell'));
        if (!buy) throw new Error('Formula harus mengisi variabel Buy, misalnya: Buy = Cross(MA(C,20), MA(C,50));');
        const sc = get('positionscore');
        return { buy, sell: sell || new Uint8Array(env.n), score: sc === undefined ? null : Float32Array.from(V(sc, env.n)), short: get('short') !== undefined };
      },
    };
  }
  root.AFL = { compile, FUNCTIONS: Object.keys(F) };
})(typeof window !== 'undefined' ? window : globalThis);
