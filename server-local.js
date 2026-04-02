const fs=require('fs'),http=require('http'),path=require('path'),ROOT=__dirname;
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
for(const line of(fs.existsSync(path.join(ROOT,'.env'))?fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\\r?\\n/):[])){
  const t=line.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i===-1)continue;const k=t.slice(0,i).trim();if(k in process.env)continue;let v=t.slice(i+1).trim();
  if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);process.env[k]=v;}
