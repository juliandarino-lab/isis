/* ISIS Ojos — reglas de horarios.

   Hay UN SOLO horario habitual por empleada y se repite siempre.
   Las semanas no se guardan: se calculan cada vez que alguien las mira o las
   imprime, con semana(estado, lunes), que funciona para cualquier fecha sin
   que esa semana se haya abierto nunca.

   Un cambio permanente le pone fecha de fin al horario viejo y arranca uno
   nuevo (el pasado queda guardado). Un cambio puntual vale para una fecha o un
   período y después vuelve solo al habitual.

   Todo está escrito en CONTRATO DATOS.md. Este archivo no guarda estado: todo
   entra por parámetro y las funciones que cambian algo devuelven un estado
   nuevo sin tocar el que recibieron. */
(function(root){'use strict';
const SHIFTS={morning:'Mañana',afternoon:'Tarde'};
const mins=s=>{const m=/^(\d{2}):(\d{2})$/.exec(s||'');return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:NaN;};
const esFecha=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
function plus(value,n){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
/* 0 = lunes … 5 = sábado. El domingo no se trabaja: devuelve -1. */
function diaDe(fecha){const d=new Date(fecha+'T12:00:00Z').getUTCDay();return d===0?-1:d-1;}
function lunesDe(fecha){const d=new Date(fecha+'T12:00:00Z').getUTCDay();return plus(fecha,-((d+6)%7));}
const orden=(a,b)=>String(a.from||'')<String(b.from||'')?-1:String(a.from||'')>String(b.from||'')?1:String(a.id).localeCompare(String(b.id));
const nuevoId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const clon=x=>typeof structuredClone==='function'?structuredClone(x):JSON.parse(JSON.stringify(x));

/* El horario de un turno en un día puntual.
   Cada local tiene su horario de siempre (branch.morning / branch.afternoon) y,
   si Romi lo cambió para un día, branch.dias[0..5] pisa lo que haga falta. */
function turnoDe(branch,shift,day){
 const base=(branch&&branch[shift])||{};
 const propio=branch&&branch.dias&&branch.dias[day]&&branch.dias[day][shift];
 if(!propio)return {start:base.start,end:base.end,slots:base.slots,propio:false};
 return {start:propio.start||base.start,end:propio.end||base.end,
  slots:Number.isInteger(propio.slots)?propio.slots:base.slots,propio:true};
}
const mismoTurno=(a,b)=>a.start===b.start&&a.end===b.end&&a.slots===b.slots;

/* Una persona no puede estar en dos locales el mismo día, ni en dos turnos
   superpuestos, ni pasar los lugares del turno. */
function validate(state,assignments,candidate,ignoreId){
 if(!state.employees.some(e=>e.id===candidate.employeeId&&e.active!==false))return 'Elegí una empleada del equipo.';
 const branch=state.branches.find(b=>b.id===candidate.branchId);
 if(!branch||!SHIFTS[candidate.shift]||!Number.isInteger(candidate.day)||candidate.day<0||candidate.day>5)return 'Revisá el local y el día.';
 const start=mins(candidate.start),end=mins(candidate.end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 'La salida tiene que ser posterior a la entrada.';
 const rest=assignments.filter(a=>a.id!==ignoreId);
 if(rest.filter(a=>a.branchId===candidate.branchId&&a.day===candidate.day&&a.shift===candidate.shift).length>=turnoDe(branch,candidate.shift,candidate.day).slots)return 'Ese turno ya tiene todas sus personas asignadas.';
 for(const a of rest.filter(a=>a.employeeId===candidate.employeeId&&a.day===candidate.day)){
  if(a.branchId!==candidate.branchId)return 'Esa empleada ya está asignada a otro local ese día.';
  if(a.shift===candidate.shift)return 'Esa empleada ya está en ese turno.';
  if(start<mins(a.end)&&end>mins(a.start))return 'Ese horario se superpone con otro de la misma empleada.';
 }
 return '';
}

/* ── El horario habitual y sus vigencias ───────────────────────────────── */
const rige=(f,fecha)=>(!f.desde||f.desde<=fecha)&&(!f.hasta||fecha<=f.hasta);
function vigentes(s,fecha){return (s.base||[]).filter(f=>rige(f,fecha));}
function vigentesDe(s,id,fecha){return vigentes(s,fecha).filter(f=>f.employeeId===id);}
/* La historia del habitual de una empleada, de la etapa más vieja a la actual. */
function etapas(s,id){
 const grupos=new Map();
 for(const f of (s.base||[]).filter(x=>x.employeeId===id)){
  const k=(f.desde||'')+'|'+(f.hasta||'');
  if(!grupos.has(k))grupos.set(k,{desde:f.desde||null,hasta:f.hasta||null,filas:[]});
  grupos.get(k).filas.push(f);
 }
 return [...grupos.values()].sort((a,b)=>String(a.desde||'').localeCompare(String(b.desde||'')));
}

/* ── Ausencias y cambios puntuales ─────────────────────────────────────── */
function diasDe(p){
 if(Array.isArray(p.dias))return p.dias.map(Number).filter(d=>Number.isInteger(d)&&d>=0&&d<=5);
 if(Array.isArray(p.filas))return [...new Set(p.filas.map(f=>f.day))].filter(d=>Number.isInteger(d)&&d>=0&&d<=5);
 return null;   /* cambio puntual viejo (schema 2): parchea el habitual */
}
const enRango=(e,fecha)=>fecha>=e.from&&fecha<=e.to;
function ausenciasEn(s,id,fecha){return (s.exceptions||[]).filter(e=>e.employeeId===id&&enRango(e,fecha)).sort(orden);}
function puntualesEn(s,id,fecha){
 const d=diaDe(fecha);
 return (s.punctual||[]).filter(e=>{
  if(e.employeeId!==id||!enRango(e,fecha))return false;
  const dd=diasDe(e);return dd===null||dd.includes(d);
 }).sort(orden);
}
function ausenciaDe(s,id,fecha){return ausenciasEn(s,id,fecha)[0]||null;}
function puntualDe(s,id,fecha){return puntualesEn(s,id,fecha)[0]||null;}
/* La ausencia gana siempre: de vacaciones no trabaja aunque tenga un cambio
   anotado. Entre varias del mismo tipo gana la que empieza antes, así el
   resultado no depende del orden de la lista. */
function excepcionDe(s,id,fecha){
 const faltas=ausenciasEn(s,id,fecha),cambios=puntualesEn(s,id,fecha);
 return {absence:faltas[0]||null,change:cambios[0]||null,superpuestas:faltas.length+cambios.length>1};
}

/* ── Calcular un día ───────────────────────────────────────────────────── */
function contexto(s){return {...s,employees:(s.employees||[]).map(e=>({...e,active:true}))};}
function ordenDeEquipo(s){
 const m=new Map();(s.employees||[]).forEach((e,i)=>m.set(e.id,i));
 return id=>m.has(id)?m.get(id):9999;
}
function filaPuntual(p,f,i){
 return {id:f.id||(p.id+':'+i),employeeId:p.employeeId,branchId:f.branchId,shift:f.shift,day:f.day,
  start:f.start,end:f.end,pauseStart:f.pauseStart||null,pauseEnd:f.pauseEnd||null,
  origen:'puntual',puntualId:p.id,tipo:p.tipo||'horario',motivo:p.motivo||''};
}
/* Compatibilidad: un cambio puntual viejo parchea las filas del habitual. */
function parcheViejo(p,fila){
 const row={...fila,origen:'puntual',puntualId:p.id,tipo:p.type||'horario',motivo:p.motivo||''};
 if(p.type==='traslado'){
  if(!p.branchId)return null;                  /* ese día trabaja fuera de Ojos */
  row.branchId=p.branchId;row.pauseStart=null;row.pauseEnd=null;
 }
 row.start=p.start||fila.start;row.end=p.end||fila.end;
 row.shift=row.start<'12:00'?'morning':'afternoon';
 return row;
}
/* Las filas candidatas de una empleada para una fecha, antes de los controles. */
function candidatasDe(s,id,fecha,day){
 const {absence,change}=excepcionDe(s,id,fecha);
 if(absence)return [];
 const propias=vigentesDe(s,id,fecha).filter(f=>f.day===day)
  .map(f=>({...f,origen:'habitual',fecha}));
 if(!change)return propias;
 const dd=diasDe(change);
 if(dd===null)return propias.map(f=>parcheViejo(change,f)).filter(Boolean).map(f=>({...f,fecha}));
 return (change.filas||[]).filter(f=>f.day===day).map((f,i)=>({...filaPuntual(change,f,i),fecha}));
}
function horariosDe(s,fecha){
 const assignments=[],conflicts=[],day=diaDe(fecha);
 if(day<0)return {assignments,conflicts};
 const ctx=contexto(s),pos=ordenDeEquipo(s);
 const nombre=id=>(s.employees.find(e=>e.id===id)||{}).name||'Una empleada';
 const local=id=>(s.branches.find(b=>b.id===id)||{}).name||'otro local';
 const ids=[...new Set([...(s.base||[]).map(f=>f.employeeId),...(s.punctual||[]).map(p=>p.employeeId)])]
  .filter(id=>(s.employees||[]).some(e=>e.id===id))
  .sort((a,b)=>pos(a)-pos(b)||String(a).localeCompare(String(b)));
 /* Primero los cambios puntuales (la decisión más reciente de Romi), después
    el horario habitual. Siempre en el mismo orden, así el resultado no cambia
    de una vez a la otra. */
 const tandas=[[],[]];
 for(const id of ids){
  const filas=candidatasDe(s,id,fecha,day);
  for(const f of filas)tandas[f.origen==='puntual'?0:1].push(f);
  const {superpuestas}=excepcionDe(s,id,fecha);
  if(superpuestas)conflicts.push({day,date:fecha,employeeId:id,aviso:true,
   text:nombre(id)+' tiene más de una excepción para el '+fecha+'. Se aplicó la primera.'});
 }
 for(const row of [...tandas[0],...tandas[1]]){
  const problema=validate(ctx,assignments,row,row.id);
  if(problema){conflicts.push({day,date:fecha,employeeId:row.employeeId,
   text:nombre(row.employeeId)+' · '+local(row.branchId)+' · '+row.start+'-'+row.end+': '+problema});continue;}
  assignments.push(row);
 }
 return {assignments,conflicts};
}
/* Los seis días de una semana. Pura: no necesita que la semana exista. */
function semana(s,lunes){
 const inicio=lunesDe(lunes),assignments=[],conflicts=[];
 for(let day=0;day<6;day++){
  const r=horariosDe(s,plus(inicio,day));
  assignments.push(...r.assignments);conflicts.push(...r.conflicts);
 }
 return {assignments,conflicts};
}

/* ── Controles de las filas que carga Romi ─────────────────────────────── */
function revisarFila(s,f){
 if(!f||typeof f!=='object')return 'Revisá el horario que cargaste.';
 if(!(s.branches||[]).some(b=>b.id===f.branchId))return 'Elegí uno de los cuatro locales.';
 if(!SHIFTS[f.shift])return 'Elegí mañana o tarde.';
 if(!Number.isInteger(f.day)||f.day<0||f.day>5)return 'Elegí un día de lunes a sábado.';
 const a=mins(f.start),b=mins(f.end);
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return 'La salida tiene que ser posterior a la entrada.';
 if(f.pauseStart||f.pauseEnd){
  const p=mins(f.pauseStart),q=mins(f.pauseEnd);
  if(!Number.isFinite(p)||!Number.isFinite(q)||q<=p)return 'Revisá el horario del corte.';
  if(p<a||q>b)return 'El corte tiene que quedar adentro del horario de ese día.';
 }
 return '';
}
/* Que las filas nuevas de UNA empleada entren sin tocar a las demás.
   `sinNuevas` es el estado nuevo pero sin las filas que se están agregando: así
   se cuentan primero todas las demás (y las de ella que se conservan) y, si no
   entra, el error es de este cambio y no de otra persona. */
function cabeEn(sinNuevas,employeeId,fechas,filas){
 const ctx=contexto(sinNuevas);
 for(const fecha of fechas){
  const day=diaDe(fecha);if(day<0)continue;
  const otras=horariosDe(sinNuevas,fecha).assignments;
  const aceptadas=[];
  for(const f of filas.filter(x=>x.day===day)){
   const row={...f,employeeId};
   const problema=validate(ctx,otras.concat(aceptadas),row,row.id);
   if(problema)return problema;
   aceptadas.push(row);
  }
 }
 return '';
}
const sinCambios=(s,error)=>({state:s,error});

/* Between effective-date boundaries the same weekdays repeat. Check those
   boundaries, including ones far ahead, without creating future weeks. */
function fechasCriticas(s,desde,hasta,filas){
 const puntos=new Set([desde]);
 const agregar=f=>{if(f&&f>=desde&&(!hasta||f<=hasta))puntos.add(f);};
 for(const f of s.base||[]){agregar(f.desde);if(f.hasta)agregar(plus(f.hasta,1));}
 for(const p of [...(s.punctual||[]),...(s.exceptions||[])]){agregar(p.from);if(p.to)agregar(plus(p.to,1));}
 const fechas=new Set(),dias=[...new Set(filas.map(f=>f.day))];
 for(const p of puntos)for(const d of dias){let fecha=plus(lunesDe(p),d);if(fecha<p)fecha=plus(fecha,7);if(!hasta||fecha<=hasta)fechas.add(fecha);}
 return [...fechas].sort();
}

/* ── Cambio permanente ─────────────────────────────────────────────────── */
/* Cierra el horario anterior el día antes de `desde` y arranca el nuevo.
   No toca ninguna fila de otra empleada. */
function aplicarPermanente(s,employeeId,desde,filas){
 if(!esFecha(desde))return sinCambios(s,'Elegí desde qué día vale el horario nuevo.');
 if(!(s.employees||[]).some(e=>e.id===employeeId))return sinCambios(s,'Elegí una empleada del equipo.');
 const lista=(filas||[]).map(f=>({id:nuevoId(),employeeId,branchId:f.branchId,shift:f.shift,day:f.day,
  start:f.start,end:f.end,pauseStart:f.pauseStart||null,pauseEnd:f.pauseEnd||null,desde,hasta:null}));
 for(const f of lista){const e=revisarFila(s,f);if(e)return sinCambios(s,e);}
 const ayer=plus(desde,-1);
 const base=[];
 for(const f of (s.base||[])){
  if(f.employeeId!==employeeId){base.push(f);continue;}
  if((f.desde||'')>=desde)continue;                      /* etapa que se reemplaza */
  if(!f.hasta||f.hasta>=desde)base.push({...f,hasta:ayer});
  else base.push(f);
 }
 const nuevo={...s,base:base.concat(lista)};
 const fechas=fechasCriticas(nuevo,desde,null,lista);
 const problema=cabeEn({...nuevo,base},employeeId,fechas,lista);
 if(problema)return sinCambios(s,problema);
 return {state:nuevo,error:''};
}
/* Deshace una etapa: borra sus filas y reabre la anterior. */
function quitarPermanente(s,employeeId,desde){
 const suyas=(s.base||[]).filter(f=>f.employeeId===employeeId);
 if(!suyas.some(f=>(f.desde||null)===(desde||null)))return sinCambios(s,'Ese horario ya no está cargado.');
 const ayer=desde?plus(desde,-1):null;
 const base=[];
 for(const f of (s.base||[])){
  if(f.employeeId!==employeeId){base.push(f);continue;}
  if((f.desde||null)===(desde||null))continue;
  base.push(ayer&&f.hasta===ayer?{...f,hasta:null}:f);
 }
 return {state:{...s,base},error:''};
}

/* ── Cambio puntual ────────────────────────────────────────────────────── */
function aplicarPuntual(s,datos){
 const d=datos||{},employeeId=d.employeeId;
 if(!(s.employees||[]).some(e=>e.id===employeeId))return sinCambios(s,'Elegí una empleada del equipo.');
 const from=d.desde||d.from,to=d.hasta||d.to||from;
 if(!esFecha(from)||!esFecha(to))return sinCambios(s,'Elegí la fecha o el período del cambio.');
 if(to<from)return sinCambios(s,'La fecha de fin tiene que ser posterior a la de inicio.');
 const filas=(d.filas||[]).map((f,i)=>({id:f.id||(nuevoId()+'-'+i),branchId:f.branchId,shift:f.shift,day:f.day,
  start:f.start,end:f.end,pauseStart:f.pauseStart||null,pauseEnd:f.pauseEnd||null}));
 for(const f of filas){const e=revisarFila(s,f);if(e)return sinCambios(s,e);}
 let dias=Array.isArray(d.dias)?d.dias.map(Number):[...new Set(filas.map(f=>f.day))];
 dias=[...new Set(dias)].filter(x=>Number.isInteger(x)&&x>=0&&x<=5).sort((a,b)=>a-b);
 if(!dias.length)return sinCambios(s,'Elegí qué días cambian.');
 for(const f of filas)if(!dias.includes(f.day))return sinCambios(s,'Hay un horario cargado en un día que no elegiste.');
 const p={id:d.id||nuevoId(),employeeId,from,to,tipo:d.tipo||'horario',motivo:d.motivo||'',dias,filas};
 const nuevo={...s,punctual:(s.punctual||[]).filter(x=>x.id!==p.id).concat([p])};
 /* Se revisa cada fecha del rango que caiga en un día cambiado. */
 const fechas=fechasCriticas(nuevo,from,to,filas);
 /* Sin las filas nuevas, pero con los días ya tomados por el cambio: así no
    reaparece su horario de siempre al revisar. */
 const sinNuevas={...nuevo,punctual:nuevo.punctual.map(x=>x.id===p.id?{...p,filas:[]}:x)};
 const problema=cabeEn(sinNuevas,employeeId,fechas,filas);
 if(problema)return sinCambios(s,problema);
 return {state:nuevo,error:'',id:p.id};
}
function quitarPuntual(s,id){
 if(!(s.punctual||[]).some(p=>p.id===id))return sinCambios(s,'Ese cambio ya no está cargado.');
 return {state:{...s,punctual:(s.punctual||[]).filter(p=>p.id!==id)},error:''};
}

/* ── Copias viejas (schema 2 → 3) ──────────────────────────────────────── */
/* No se pierde nada: las filas del habitual sin fechas rigen siempre, que es
   lo que significaban, y los cambios puntuales viejos se siguen entendiendo.
   `weeks` queda quieto donde está: el motor no lo lee nunca. */
function migrar(entrada){
 const s=clon(entrada||{});
 s.schema=3;
 for(const k of ['branches','employees','base','exceptions','punctual','history','messages','requests'])
  if(!Array.isArray(s[k]))s[k]=[];
 if(!s.weeks||typeof s.weeks!=='object'||Array.isArray(s.weeks))s.weeks={};
 s.base=s.base.map(f=>({...f,desde:f.desde||null,hasta:f.hasta||null}));
 /* Los cambios puntuales viejos pasan a la forma nueva: se calcula qué hacía
    esos días con el habitual vigente al empezar el cambio, y eso queda como
    `filas`. Un traslado viejo sin local queda como día sin filas, o sea que
    ese día no trabaja, igual que antes. */
 s.punctual=s.punctual.map(p=>{
  if(!p||typeof p!=='object')return p;
  if(Array.isArray(p.filas))return {...p,tipo:p.tipo||p.type||'horario',motivo:p.motivo||p.reason||'',
   dias:Array.isArray(p.dias)?p.dias:[...new Set(p.filas.map(f=>f.day))]};
  const cae=new Set();
  let n=0;
  for(let f=p.from;f<=p.to&&n<370&&cae.size<6;f=plus(f,1),n++){const d=diaDe(f);if(d>=0)cae.add(d);}
  const suyas=s.base.filter(f=>f.employeeId===p.employeeId&&rige(f,p.from)&&cae.has(f.day));
  const dias=[...new Set(suyas.map(f=>f.day))].sort((a,b)=>a-b);
  if(!dias.length)return null;                            /* no tocaba ningún día */
  const filas=[];
  for(const f of suyas){
   const r=parcheViejo(p,f);
   if(r)filas.push({branchId:r.branchId,shift:r.shift,day:r.day,start:r.start,end:r.end,
    pauseStart:r.pauseStart||null,pauseEnd:r.pauseEnd||null});
  }
  return {id:p.id,employeeId:p.employeeId,from:p.from,to:p.to,
   tipo:p.type||'horario',motivo:p.motivo||p.reason||'',dias,filas};
 }).filter(Boolean);
 return s;
}

/* Alias viejos: la app y las pruebas de antes pedían la semana así. */
function resolve(s,lunes){return semana(s,lunes);}
function materialize(s,lunes){return semana(s,lunes).assignments;}

const api={semana,horariosDe,vigentes,vigentesDe,etapas,puntualDe,ausenciaDe,excepcionDe,
 aplicarPermanente,quitarPermanente,aplicarPuntual,quitarPuntual,
 validate,revisarFila,turnoDe,mismoTurno,plus,mins,diaDe,lunesDe,esFecha,migrar,
 resolve,materialize};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OJOS_HORARIOS=api;
})(globalThis);
