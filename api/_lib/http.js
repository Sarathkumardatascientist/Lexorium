function sendJson(res,status,payload){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(payload));}
function sendError(res,status,message,extra){return sendJson(res,status,{ok:false,message,...(extra||{})});}
async function readRawBody(req){if(typeof req.body==='string') return req.body;if(Buffer.isBuffer(req.body)) return req.body.toString('utf8');if(req.body&&typeof req.body==='object') return JSON.stringify(req.body);return new Promise((resolve,reject)=>{const chunks=[];req.on('data',c=>chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c)));req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));req.on('error',reject);});}
async function parseJsonBody(req){const raw=await readRawBody(req);if(!raw) return {};try{return JSON.parse(raw);}catch(error){error.statusCode=400;error.message='Request body must be valid JSON.';throw error;}}
function requireMethod(req,res,method){if(req.method===method) return true;res.setHeader('Allow',method);sendError(res,405,'Method not allowed.');return false;}
function getQueryValue(req,key){if(req.query&&Object.prototype.hasOwnProperty.call(req.query,key)) return req.query[key];return new URL(req.url||'/','http://localhost').searchParams.get(key);}
module.exports={getQueryValue,parseJsonBody,readRawBody,requireMethod,sendError,sendJson};
