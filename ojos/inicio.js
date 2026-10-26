/* ISIS Ojos — arranque sin servidor.
   Todo lo que se carga queda guardado en este teléfono. Para compartir entre
   teléfonos hace falta conectar el servidor; mientras tanto, la planilla se
   reparte con el PDF. */
(function(root){'use strict';
try{document.documentElement.lang='es-AR';}catch(e){}
const $=s=>document.querySelector(s),CLAVE='isis_ojos_datos';
const LOCALES=['Centro 54','Centro 45','Los Hornos','City Bell'];
const EJEMPLO=['Ana Gómez','Belén Ruiz','Camila Díaz','Daiana Sosa','Evelyn Paz','Florencia Ledesma','Gabriela Núñez','Rocío Medina'];
const id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
function vacio(h){
 h=h||{abre:'09:00',cambio:'14:30',cierra:'20:00',personas:2};
 const branches=LOCALES.map((name,i)=>({id:'b'+i,name,
  morning:{start:h.abre,end:h.cambio,slots:h.personas},
  afternoon:{start:h.cambio,end:h.cierra,slots:h.personas}}));
 return {schema:2,branches,employees:[],base:[],weeks:{},exceptions:[],punctual:[],history:[],requests:[],messages:[]};
}
function ejemplo(){
 const s=vacio();
 s.employees=EJEMPLO.map((name,i)=>({id:'e'+i,name,active:true}));
 let n=0;
 s.branches.forEach(b=>['morning','afternoon'].forEach(t=>{
  const p=s.employees[n++%s.employees.length];
  for(let day=0;day<6;day++)s.base.push({id:id(),employeeId:p.id,branchId:b.id,shift:t,day,start:b[t].start,end:b[t].end,pauseStart:null,pauseEnd:null});
 }));
 s.messages=[{id:'bienvenida',title:'Datos de ejemplo',body:'Estos nombres son de ejemplo para que veas cómo funciona. Entrá a Equipo y cargá a tu gente de verdad.',audience:'all',created:new Date().toISOString().slice(0,10),read:[]}];
 return s;
}
function leer(){try{const t=localStorage.getItem(CLAVE);return t?JSON.parse(t):null;}catch{return null;}}
function escribir(s){try{localStorage.setItem(CLAVE,JSON.stringify(s));return true;}catch{return false;}}
let estado=null,quien=null;

function banda(){
 if($('#banda'))return;
 const d=document.createElement('div');d.id='banda';d.className='aviso-band';
 d.innerHTML='<span>Solo en este teléfono. No se comparte automáticamente.</span>'+
  '<button type="button" id="banda-copia">Guardar copia</button>'+
  '<button type="button" id="banda-restaurar">Traer copia</button>';
 document.body.prepend(d);
 $('#banda-copia').onclick=copia;
 $('#banda-restaurar').onclick=()=>restaurar(false);
}
function copia(){
 try{
  const datos={kind:'isis-ojos-backup',version:1,createdAt:new Date().toISOString(),revision:0,state:estado};
  const url=URL.createObjectURL(new Blob([JSON.stringify(datos,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='ISIS Ojos - copia '+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
 }catch(e){alert('No se pudo guardar la copia: '+e.message);}
}
function resumen(e){
 const p=(e.employees||[]).filter(x=>x.active!==false).length;
 const se=Object.keys(e.weeks||{}).length,h=(e.base||[]).length;
 return p+' '+(p===1?'persona':'personas')+', '+h+' horarios habituales y '+se+' '+(se===1?'semana':'semanas');
}
function restaurar(desdeInicio){
 const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
 input.onchange=async()=>{
  try{
   const file=input.files[0];if(!file)return;
   if(file.size>5000000)throw Error('Ese archivo es demasiado grande para ser una copia de ISIS Ojos.');
   const datos=JSON.parse(await file.text());
   if(datos.kind!=='isis-ojos-backup'||datos.version!==1||!datos.state||datos.state.schema!==2)
    throw Error('Ese archivo no es una copia de ISIS Ojos. Elegí el que dice "ISIS Ojos - copia".');
   const actual=leer();
   const tieneDatos=!!(actual&&((actual.employees||[]).length||(actual.base||[]).length||Object.keys(actual.weeks||{}).length));
   const fecha=datos.createdAt?new Date(datos.createdAt).toLocaleString('es-AR'):'sin fecha';
   const texto='La copia es del '+fecha+' y trae '+resumen(datos.state)+'.'+
    (tieneDatos?'\n\nATENCIÓN: en este teléfono ya hay datos cargados ('+resumen(actual)+') y se van a REEMPLAZAR. Esto no se puede deshacer.\n\n¿Reemplazar igual?':'\n\n¿La cargo en este teléfono?');
   if(!confirm(texto))return;
   estado=datos.state;
   if(!escribir(estado))throw Error('El teléfono no dejó guardar la copia. Liberá espacio y probá de nuevo.');
   if(desdeInicio){pantalla();alert('Copia restaurada: '+resumen(estado)+'. Entrá y revisá los horarios.');}
   else if(root.Ojos){root.Ojos.replace(estado);alert('Copia restaurada: '+resumen(estado)+'.');}
  }catch(e){alert('No se pudo restaurar: '+e.message);}
 };
 input.click();
}
function sesion(){
 root.ISIS_SESSION={
  user:{name:quien.name,role:quien.role,employeeId:quien.employeeId||null},
  state:()=>structuredClone(estado),
  limits:()=>null,
  async save(next){const copia=structuredClone(next);if(!escribir(copia))throw Error('El teléfono no dejó guardar. Liberá espacio y guardá una copia.');estado=copia;return structuredClone(estado);},
  async reload(){},
  async archive(){throw Error('Archivar semanas necesita el servidor conectado.');},
  async restore(c){if(c&&c.state){estado=structuredClone(c.state);escribir(estado);root.Ojos.replace(estado);}},
  async request(path){
   if(path==='/backup')return {kind:'isis-ojos-backup',version:1,createdAt:new Date().toISOString(),revision:0,state:structuredClone(estado)};
   if(path==='/accounts')throw Error('Los accesos con usuario y PIN se habilitan cuando se conecte el servidor. Por ahora la planilla se reparte con el PDF.');
   throw Error('Eso necesita el servidor conectado.');}
 };
}
function entrar(elegido){
 quien=elegido;sesion();banda();
 try{document.documentElement.lang='es-AR';}catch(e){}
 document.body.classList.add('modo-simple');
 if(quien.role!=='supervisor')document.body.classList.add('modo-empleada');
 $('#logout').onclick=()=>location.reload();
 $('#session-name').textContent=quien.name;
 $('#login-panel').hidden=true;$('#application').hidden=false;
 $('#connection').textContent='Guardado en este teléfono';$('#connection').classList.add('offline');
 if(!root.Ojos){const s=document.createElement('script');s.src='app.js';document.head.append(s);}
 else root.Ojos.replace(estado,quien);
}
const hm=v=>{const m=/^(\d{1,2}):(\d{2})$/.exec(v||'');return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:NaN;};
function horarios(){
 const card=$('#login-panel .login-card');
 card.innerHTML='<div class="brand"><img class="brand-logo" src="logo.jpg" alt="Isis"><div><strong>ISIS <span>Ojos</span></strong><small>Los horarios del equipo.</small></div></div>'+
  '<h1>¿Qué horario hacen?</h1>'+
  '<p class="sub">Poné el horario que hacen normalmente. Después, si algún local es distinto, lo cambiás desde <strong>Cambiar el horario de este local</strong>.</p>'+
  '<div class="fields-row"><div class="field"><label for="h-abre">Abren</label><input type="time" id="h-abre" value="09:00"></div>'+
  '<div class="field"><label for="h-cambio">Cambio de turno</label><input type="time" id="h-cambio" value="14:30"></div></div>'+
  '<div class="fields-row"><div class="field"><label for="h-cierra">Cierran</label><input type="time" id="h-cierra" value="20:00"></div>'+
  '<div class="field"><label for="h-personas">Personas por turno</label><select id="h-personas">'+
   [1,2,3,4].map(i=>'<option value="'+i+'"'+(i===2?' selected':'')+'>'+i+'</option>').join('')+'</select></div></div>'+
  '<p class="form-error" id="h-error"></p>'+
  '<button class="btn primary" type="button" id="h-listo">Listo, empezar</button>'+
  '<button class="text-button" type="button" id="h-volver" style="margin-top:12px">Volver</button>';
 $('#h-volver').onclick=pantalla;
 $('#h-listo').onclick=()=>{
  const abre=$('#h-abre').value,cambio=$('#h-cambio').value,cierra=$('#h-cierra').value;
  if(!(hm(abre)<hm(cambio)&&hm(cambio)<hm(cierra))){$('#h-error').textContent='Revisá las horas: abren, después el cambio de turno, después cierran.';return;}
  estado=vacio({abre,cambio,cierra,personas:+$('#h-personas').value});
  escribir(estado);entrar({name:'Supervisora',role:'supervisor'});
 };
}
function pantalla(){
 const guardado=leer();
 const card=$('#login-panel .login-card');
 card.innerHTML='<div class="brand"><img class="brand-logo" src="logo.jpg" alt="Isis"><div><strong>ISIS <span>Ojos</span></strong><small>Los horarios del equipo.</small></div></div>'+
  '<h1>'+(guardado?'Hola de nuevo.':'Empecemos.')+'</h1>'+
  '<p class="sub">Armá la semana de los cuatro locales y repartila con el PDF.</p>'+
  (guardado?
   '<div class="field"><label for="quien">¿Como quién querés entrar?</label><select id="quien">'+
    '<option value="super">Supervisora (arma los cuatro locales)</option>'+
    (guardado.employees||[]).filter(e=>e.active!==false).map(e=>'<option value="'+e.id+'">'+e.name+' — ver lo que ve ella</option>').join('')+
   '</select></div><button class="btn primary" type="button" id="seguir">Seguir donde quedé</button>'
   :
   '<button class="btn primary" type="button" id="vacio">Empezar y cargar mi equipo</button>'+
   '<button class="btn" type="button" id="demo">Ver un ejemplo armado</button>')+
  '<button class="text-button" type="button" id="restaurar" style="margin-top:14px">Restaurar una copia guardada</button>'+
  '<p class="hint" style="margin-top:14px">Los datos se guardan solo en este navegador y teléfono; no se comparten automáticamente. Guardá una copia cada tanto.</p>'+
  (guardado?'<button class="text-button" type="button" id="reset">Borrar todo y empezar de cero</button>':'');
 $('#restaurar').onclick=()=>restaurar(true);
 if(guardado){
  $('#seguir').onclick=()=>{estado=guardado;const v=$('#quien').value;
   entrar(v==='super'?{name:'Supervisora',role:'supervisor'}:{name:(guardado.employees.find(e=>e.id===v)||{}).name,role:'employee',employeeId:v});};
  $('#reset').onclick=()=>{if(confirm('Se borran los horarios guardados en este teléfono. ¿Seguro?')){try{localStorage.removeItem(CLAVE);}catch{}pantalla();}};
 }else{
  $('#vacio').onclick=()=>horarios();
  $('#demo').onclick=()=>{estado=ejemplo();escribir(estado);entrar({name:'Supervisora',role:'supervisor'});};
 }
}
if(document.readyState==='loading')addEventListener('DOMContentLoaded',pantalla);else pantalla();
})(globalThis);
