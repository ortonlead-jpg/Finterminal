const {send,modeOf,symbolOf}=require('./_lib'),{CATALOG,quote,summary}=require('./_demo');
module.exports=async(req,res)=>{try{
 const p=new URL(req.url,'http://localhost').searchParams,mode=modeOf(req),symbols=p.get('symbols')?[...new Set(p.get('symbols').split(',').filter(Boolean).map(symbolOf))].slice(0,80):CATALOG.map(a=>a.symbol);
 const rows=new Array(symbols.length);let next=0;
 await Promise.all(Array.from({length:Math.min(4,symbols.length)},async()=>{while(next<symbols.length){const i=next++,symbol=symbols[i],meta=CATALOG.find(a=>a.symbol===symbol)||{symbol,name:symbol,sector:'Belum terklasifikasi'};
  try{const q=mode==='demo'?quote(symbol):await require('./quote').one(symbol);if(q.error)throw new Error(q.error);let s=null,error=null;
   if(mode==='demo')s=summary(symbol);else{const response={statusCode:200,setHeader(){},end(body){const data=JSON.parse(body);if(this.statusCode===200)s=data;else error=data.error;}};await require('./summary')({url:'/api/summary?mode=live&symbol='+encodeURIComponent(symbol)},response);}
   rows[i]={...meta,...q,pe:s?.detail?.trailingPE??null,pb:s?.stats?.priceToBook??null,roe:s?.fin?.returnOnEquity!=null?s.fin.returnOnEquity*100:null,dividendYield:s?.detail?.dividendYield!=null?s.detail.dividendYield*100:null,marketCap:s?.detail?.marketCap??null,revenueGrowth:s?.fin?.revenueGrowth!=null?s.fin.revenueGrowth*100:null,sector:s?.profile?.sector||meta.sector,fundamentalError:error};
  }catch(e){rows[i]={symbol,name:meta.name,sector:meta.sector,error:e.message,mode};}
 }}));
 send(res,200,{rows,mode,coverage:{requested:symbols.length,quotes:rows.filter(r=>!r.error).length,fundamentals:rows.filter(r=>r.pe!=null).length},source:mode==='demo'?'Dataset simulasi pembelajaran':'Yahoo Finance · harga dapat tertunda',universe:'Katalog terbatas / daftar pilihan, bukan seluruh BEI',fetchedAt:new Date().toISOString()});
}catch(e){send(res,422,{error:e.message});}};
