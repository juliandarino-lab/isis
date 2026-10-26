(function(root){'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const MAX_BYTES=750000;
const camposHorario=['habitualVersions','habitualChanges','dateOverrides','scheduleChanges','baseVersions','baseChanges'];
function vacio(){return {schema:3,branches:['Centro 54','Centro 45','Los Hornos','City Bell'].map((name,i)=>({id:'b'+i,name,morning:{start:'09:00',end:'14:30',slots:2},afternoon:{start:'14:30',end:'20:00',slots:2}})),employees:[],base:[],weeks:{},exceptions:[],punctual:[],messages:[],requests:[],history:[]};}
function encode(state){const json=JSON.stringify(state);if(new TextEncoder().encode(json).length>MAX_BYTES)throw Error('Hay demasiados datos para guardar de una vez. Guardá una copia y avisale al administrador.');return json;}
function decode(json){const s=JSON.parse(json);if(![2,3].includes(s.schema)||!Array.isArray(s.branches)||s.branches.length!==4||!Array.isArray(s.employees))throw Error('No se pudo leer el horario compartido. No se reemplazó nada.');const h=root.OJOS_HORARIOS||(typeof require==='function'?require('./horarios.js'):null);return h?h.migrar(s):s;}
function administrativo(s){const c=clone(s);c.messages=[];c.requests=[];delete c.ejemplo;return c;}
function persona(s,eid,extra=[]){
 const limpiar=x=>Array.isArray(x)?x.filter(v=>!v||typeof v!=='object'||!('employeeId' in v)||v.employeeId===eid).map(limpiar):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,limpiar(v)])):x;
 const propia=a=>limpiar(clone((a||[]).filter(x=>x.employeeId===eid)));
 const e=s.employees.find(x=>x.id===eid);
 const p={schema:s.schema,branches:clone(s.branches),employees:e?[clone(e)]:[],base:propia(s.base),exceptions:propia(s.exceptions),punctual:propia(s.punctual),weeks:{},history:[],messages:[],requests:[]};
 for(const [w,v] of Object.entries(s.weeks||{}))if(v.published)p.weeks[w]={assignments:[],dirty:false,published:{at:v.published.at,assignments:propia(v.published.assignments)}};
 for(const k of new Set([...camposHorario,...extra]))if(Array.isArray(s[k]))p[k]=propia(s[k]);
 // Scalar schedule version markers contain no other employee's information.
 for(const k of ['scheduleVersion','scheduleConfirmedAt','habitualConfirmedAt'])if(['string','number','boolean'].includes(typeof s[k]))p[k]=s[k];
 return p;
}
const api={clone,vacio,encode,decode,administrativo,persona,MAX_BYTES,camposHorario};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OJOS_ESTADO=api;
})(globalThis);
