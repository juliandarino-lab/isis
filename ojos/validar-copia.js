/* Revisa una copia de ISIS Ojos antes de reemplazar nada.
   Acepta copias viejas (schema 2) y nuevas (schema 3) y siempre devuelve un
   estado 3, conservando las vigencias del horario de siempre (desde/hasta) y
   los cambios puntuales (dias/filas/tipo/motivo). Ver CONTRATO DATOS.md. */
(function(root){'use strict';
const objeto=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const texto=(x,max)=>typeof x==='string'&&!!x.trim()&&x.length<=max;
const identificador=x=>typeof x==='string'&&/^[a-zA-Z0-9_:-]{1,100}$/.test(x);
const fecha=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
function validar(backup){
 const mal=()=>{throw Error('La copia está incompleta o tiene datos inválidos. No se reemplazó nada.');};
 if(!objeto(backup)||backup.kind!=='isis-ojos-backup'||backup.version!==1||!objeto(backup.state))mal();
 const reglas=root.OJOS_HORARIOS||(typeof require==='function'?require('./horarios.js'):null);
 if(!reglas)throw Error('No se pudo revisar la copia. Volvé a abrir el sistema e intentá de nuevo.');
 if(backup.state.schema!==2&&backup.state.schema!==3)mal();
 for(const k of ['branches','employees','base','exceptions','history','messages','requests'])if(!Array.isArray(backup.state[k]))mal();
 if(!objeto(backup.state.weeks))mal();
 if(backup.state.punctual!==undefined&&!Array.isArray(backup.state.punctual))mal();
 const s=reglas.migrar(backup.state);                    /* 2 → 3 sin pérdida */
 if(!Array.isArray(s.branches)||s.branches.length!==4||!Array.isArray(s.employees)||!objeto(s.weeks))mal();
 for(const k of ['base','exceptions','punctual','history','messages','requests'])if(!Array.isArray(s[k]))mal();

 const unicos=list=>{const ids=new Set();for(const x of list){if(!objeto(x)||!identificador(x.id)||ids.has(x.id))mal();ids.add(x.id);}return ids;};
 const locales=unicos(s.branches),personas=unicos(s.employees);
 const turno=t=>{if(!objeto(t)||!Number.isInteger(t.slots)||t.slots<1||t.slots>4||!Number.isFinite(reglas.mins(t.start))||!Number.isFinite(reglas.mins(t.end))||reglas.mins(t.end)<=reglas.mins(t.start))mal();};
 for(const b of s.branches){
  if(!texto(b.name,60))mal();turno(b.morning);turno(b.afternoon);
  if(b.dias!==undefined){
   if(!objeto(b.dias))mal();
   for(const [d,v]of Object.entries(b.dias)){
    if(!/^[0-5]$/.test(d)||!objeto(v))mal();
    for(const [k,t]of Object.entries(v)){if(!['morning','afternoon'].includes(k))mal();turno(t);}
   }
  }
 }
 for(const e of s.employees)if(!texto(e.name,65))mal();

 /* Los cupos y las altas de hoy no se aplican a los horarios de antes: una
    etapa vieja no se rechaza por cosas que cambiaron después. */
 const historia={...s,employees:s.employees.map(e=>({...e,active:true})),
  branches:s.branches.map(b=>({...b,morning:{...b.morning,slots:4},afternoon:{...b.afternoon,slots:4},
   dias:Object.fromEntries(Object.entries(b.dias||{}).map(([d,v])=>[d,Object.fromEntries(Object.entries(v).map(([k,t])=>[k,{...t,slots:4}]))]))}))};

 /* El horario de siempre, etapa por etapa. Las filas de una etapa vieja no
    tienen que convivir con las de la nueva: nunca estuvieron juntas. */
 unicos(s.base);
 const etapas=new Map();
 for(const f of s.base){
  if(!personas.has(f.employeeId)||!locales.has(f.branchId))mal();
  if(f.desde!==null&&f.desde!==undefined&&!fecha(f.desde))mal();
  if(f.hasta!==null&&f.hasta!==undefined&&!fecha(f.hasta))mal();
  if(f.desde&&f.hasta&&f.hasta<f.desde)mal();
  if(reglas.revisarFila(historia,f))mal();
  const k=(f.desde||'')+'|'+(f.hasta||'');
  if(!etapas.has(k))etapas.set(k,[]);
  etapas.get(k).push(f);
 }
 for(const filas of etapas.values())for(const a of filas)if(reglas.validate(historia,filas,a,a.id))mal();

 /* Los cambios puntuales. */
 unicos(s.punctual);
 for(const p of s.punctual){
  if(!personas.has(p.employeeId)||!fecha(p.from)||!fecha(p.to)||p.to<p.from)mal();
  if(!Array.isArray(p.dias)||!p.dias.length||!p.dias.every(d=>Number.isInteger(d)&&d>=0&&d<=5))mal();
  if(!Array.isArray(p.filas)||p.filas.length>12)mal();
  if(typeof p.tipo!=='string'||p.tipo.length>40)mal();
  if(p.motivo!==undefined&&(typeof p.motivo!=='string'||p.motivo.length>300))mal();
  const marcadas=p.filas.map((f,i)=>{
   if(!objeto(f)||!locales.has(f.branchId)||!p.dias.includes(f.day))mal();
   if(reglas.revisarFila(historia,f))mal();
   return {...f,id:identificador(f.id)?f.id:p.id+':'+i,employeeId:p.employeeId};
  });
  for(const a of marcadas)if(reglas.validate(historia,marcadas,a,a.id))mal();
 }

 /* Ausencias, licencias y vacaciones. */
 unicos(s.exceptions);
 for(const a of s.exceptions)if(!personas.has(a.employeeId)||!fecha(a.from)||!fecha(a.to)||a.to<a.from)mal();

 /* `weeks` ya no se usa (ver CONTRATO DATOS.md, punto 6). Se conserva lo que
    venga en la copia, pero solo se revisa que tenga una forma sensata. */
 for(const [w,v]of Object.entries(s.weeks)){
  if(!fecha(w)||new Date(w+'T12:00:00Z').getUTCDay()!==1||!objeto(v))mal();
  if(v.assignments!==undefined&&!Array.isArray(v.assignments))mal();
 }

 unicos(s.messages);
 for(const m of s.messages)if(!texto(m.title,100)||!texto(m.body,2000)||!fecha(m.created)||!Array.isArray(m.read)||m.read.some(id=>!personas.has(id))||(m.audience!=='all'&&!locales.has(m.audience))||(m.recipients&&(!Array.isArray(m.recipients)||m.recipients.some(id=>!personas.has(id)))))mal();
 unicos(s.requests);
 for(const r of s.requests)if(!personas.has(r.employeeId)||!fecha(r.date)||!texto(r.detail,1200)||!['Pendiente','Aprobada','No aprobada'].includes(r.status)||!['Cambiar un horario','Pedir un día libre','Avisar una ausencia'].includes(r.type))mal();
 for(const h of s.history)if(!objeto(h)||typeof h.text!=='string'||typeof h.date!=='string')mal();
 return s;
}
if(typeof module!=='undefined'&&module.exports)module.exports={validar};else root.OJOS_VALIDAR_COPIA=validar;
})(globalThis);
