const {send}=require('./_lib'),{ALL}=require('./_demo');
module.exports=(req,res)=>{const q=(new URL(req.url,'http://localhost').searchParams.get('q')||'').slice(0,80).toLowerCase();send(res,200,ALL.filter(a=>(a.code+' '+a.name).toLowerCase().includes(q)).map(({base,...a})=>a).slice(0,q?15:60));};
