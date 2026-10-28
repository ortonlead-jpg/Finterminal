const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {send}=require('./api/_lib');
const PORT=Number(process.env.PORT||3100),HOST=process.env.HOST||'127.0.0.1',PUBLIC=path.join(__dirname,'public');
const routes=new Set(['quote','chart','summary','crypto','news','article','store','ai','search','screener','health']);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),host=new URL('http://'+(req.headers.host||'invalid')).hostname;
 const hosts=new Set(['localhost','127.0.0.1','[::1]',...(process.env.ALLOWED_HOSTS||'').split(',').filter(Boolean)]);
 if(!hosts.has(host))return send(res,403,{error:'Host tidak diizinkan.'});
 if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'Origin tidak diizinkan.'});
 if(!['GET','HEAD'].includes(req.method)&&req.headers['x-terminal']!=='1')return send(res,403,{error:'Header X-Terminal wajib.'});
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 if(url.pathname.startsWith('/api/')){const name=url.pathname.slice(5);if(!routes.has(name))return send(res,404,{error:'Endpoint tidak ditemukan.'});return await require('./api/'+name+'.js')(req,res);}
 if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method tidak didukung.'});
 const file=path.resolve(PUBLIC,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(PUBLIC+path.sep))return send(res,404,{error:'Tidak ditemukan.'});
 let stat;try{stat=await fs.promises.stat(file);}catch{return send(res,404,{error:'Tidak ditemukan.'});}
 if(!stat.isFile())return send(res,404,{error:'Berkas tidak ditemukan.'});
 res.setHeader('Content-Type',MIME[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');if(req.method==='HEAD')return res.end();
 const stream=fs.createReadStream(file);stream.on('error',()=>{if(!res.headersSent)res.writeHead(500);res.end('Berkas tidak dapat dibaca.');});stream.pipe(res);
}catch(e){if(!res.headersSent)send(res,e instanceof URIError?400:500,{error:'Permintaan tidak dapat diproses.'});else res.end();}});
server.requestTimeout=30000;server.headersTimeout=15000;
server.on('error',error=>{console.error('Server gagal dimulai:',error.message);process.exitCode=1;});
server.listen(PORT,HOST,()=>{console.log(`Terminal Cakrawala University siap pada port ${server.address().port} (${HOST}).`);process.send?.({port:server.address().port});});
module.exports=server;
