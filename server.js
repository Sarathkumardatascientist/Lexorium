const fs=require('fs');
const http=require('http');
const path=require('path');
const ROOT=__dirname;
const LOCAL_CONFIG_OVERRIDE=/^(FREE_DAILY_LIMIT|PRO_DAILY_LIMIT|ENTERPRISE_DAILY_LIMIT|PRO_PLAN_PRICE_PAISE|PLAN_DURATION_DAYS|PRO_PLAN_DURATION_DAYS|CONTACT_SALES_EMAIL|PAYMENT_PROVIDER|CASHFREE_ENV|GOOGLE_FORM_|LEXORIUM_)/;
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
const envFromFile={};
for (const line of (fs.existsSync(path.join(ROOT,'.env')) ? fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/) : [])) {
  const t=line.trim(); if(!t||t.startsWith('#')) continue; const i=t.indexOf('='); if(i===-1) continue; const k=t.slice(0,i).trim(); let v=t.slice(i+1).trim();
  if(v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1);
  envFromFile[k]=v;
}
for (const [k,v] of Object.entries(envFromFile)) {
  const existing=String(process.env[k]||'').trim();
  const shouldOverride=!existing||/^your_/i.test(existing)||/xxxxx/i.test(existing)||(LOCAL_CONFIG_OVERRIDE.test(k)&&existing!==String(v).trim());
  if(!(k in process.env)||shouldOverride) process.env[k]=v;
}
const PORT=parseInt(process.env.PORT||'3000',10)||3000;
if(!process.env.PUBLIC_APP_URL||/your-domain\\.com/i.test(process.env.PUBLIC_APP_URL)) process.env.PUBLIC_APP_URL="http://localhost:" + PORT;
function respond(res,status,body,type='text/plain; charset=utf-8'){res.statusCode=status;res.setHeader('Content-Type',type);res.end(body);}
function jsonError(message){return JSON.stringify({ok:false,message});}
function decorate(res){res.status=code=>(res.statusCode=code,res);res.json=payload=>respond(res,res.statusCode||200,JSON.stringify(payload),'application/json; charset=utf-8');res.send=payload=>respond(res,res.statusCode||200,String(payload));}
function safe(target){const full=path.resolve(ROOT,target);return full.startsWith(ROOT)?full:null;}
function clearWorkspaceModuleCache(){
  for (const key of Object.keys(require.cache)) {
    if (key !== __filename && key.startsWith(ROOT)) delete require.cache[key];
  }
}
async function handleApi(req,res,url){
  decorate(res); let file=safe(url.pathname.replace(/^\/+/, '') + '.js'); if(!file||!fs.existsSync(file)) file=safe(path.join(url.pathname.replace(/^\/+/, ''), 'index.js'));
  if(!file||!fs.existsSync(file)) return respond(res,404,jsonError('API route not found.'),'application/json; charset=utf-8');

  clearWorkspaceModuleCache();
  req.query=Object.fromEntries(url.searchParams.entries());
  req.pathname=url.pathname;
  try{ await require(file)(req,res); if(!res.writableEnded) res.end(); }
  catch(err){ console.error('[lexorium] API error', url.pathname, err); if(!res.writableEnded) respond(res,500,jsonError(err&&err.message?err.message:'Internal server error.'),'application/json; charset=utf-8'); }
}
function handleStatic(req,res,url){
  let name=decodeURIComponent(url.pathname); if(name==='/') name='/index.html';
  const file=safe(name.replace(/^\/+/, ''));
  if(!file||!fs.existsSync(file)||fs.statSync(file).isDirectory()) return respond(res,404,'File not found.');
  const ext=path.extname(file).toLowerCase(); res.statusCode=200; res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
}
http.createServer((req,res)=>{
  const host=req.headers.host || ('localhost:' + PORT);
  const url=new URL(req.url,'http://' + host);
  if(url.pathname.startsWith('/api/')) return handleApi(req,res,url);
  return handleStatic(req,res,url);
}).listen(PORT,()=>console.log('[lexorium] listening on http://localhost:' + PORT));
