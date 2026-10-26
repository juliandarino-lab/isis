(function(root){'use strict';
const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const SHIFTS={morning:'Mañana',afternoon:'Tarde'};
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
function monday(value){const d=new Date(value+'T12:00:00');d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d);}
function plus(value,n){const d=new Date(value+'T12:00:00');d.setDate(d.getDate()+n);return iso(d);}
const mins=s=>{const m=/^(\d{2}):(\d{2})$/.exec(s||'');return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:NaN;};
const id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const validate=(state,assignments,candidate,ignoreId)=>globalThis.OJOS_HORARIOS.validate(state,assignments,candidate,ignoreId);
const turnoDe=(b,s,d)=>globalThis.OJOS_HORARIOS.turnoDe(b,s,d);
const mismoTurno=(a,b)=>globalThis.OJOS_HORARIOS.mismoTurno(a,b);
const horaCorta=v=>String(v||'').replace(/^0(\d)/,'$1');
function seed(){
 const names=['Centro 54','Centro 45','Los Hornos','City Bell'];
 const branches=names.map((name,i)=>({id:'b'+i,name,morning:{start:'09:00',end:'15:00',slots:i+1},afternoon:{start:'13:30',end:'19:30',slots:i+1}}));
 const employees=Array.from({length:20},(_,i)=>({id:'e'+i,name:'Empleada '+String(i+1).padStart(2,'0'),active:true}));
 const base=[];let n=0;branches.forEach(branch=>Object.keys(SHIFTS).forEach(shift=>{for(let k=0;k<branch[shift].slots;k++){const employeeId=employees[n++].id;for(let day=0;day<6;day++)base.push({id:id(),employeeId,branchId:branch.id,shift,day,start:branch[shift].start,end:branch[shift].end});}}));
 return {schema:1,branches,employees,base,weeks:{},messages:[{id:'bienvenida',title:'Un lugar para organizarnos',body:'Acá vas a poder consultar tu semana y los avisos del equipo. Estos son datos de ejemplo para revisar el boceto.',audience:'all',created:'2026-10-25',read:[]}],requests:[],history:[]};
}
const core={DAYS,SHIFTS,monday,plus,mins,validate,seed};if(typeof module!=='undefined'&&module.exports)module.exports=core;
if(typeof document==='undefined')return;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(!root.ISIS_SESSION)throw Error('Ingresá antes de abrir el sistema.');
let db=root.OJOS_HORARIOS.migrar(root.ISIS_SESSION.state());
const today=iso(new Date());let selectedWeek=monday(today);if(new Date(today+'T12:00:00').getDay()===0)selectedWeek=plus(selectedWeek,7);
let view=root.ISIS_SESSION.user.role,person=root.ISIS_SESSION.user.employeeId,tab=(root.ISIS_SESSION.user.role==='supervisor'?'inicio':'schedule'),branchId=db.branches[0].id,day=0,submitSheet=null,timer,saving=false;
const supervisor=()=>view==='supervisor';
const employee=eid=>db.employees.find(e=>e.id===eid);
const branch=bid=>db.branches.find(b=>b.id===bid);
const dateLabel=(v,options={day:'numeric',month:'short'})=>new Date(v+'T12:00:00').toLocaleDateString('es-AR',options);
const period=w=>`${dateLabel(w)} al ${dateLabel(plus(w,5),{day:'numeric',month:'long'})}`;
function absent(eid,date){return (db.exceptions||[]).find(e=>e.employeeId===eid&&date>=e.from&&date<=e.to);}
function espacio(){const l=root.ISIS_SESSION&&root.ISIS_SESSION.limits&&root.ISIS_SESSION.limits();
 if(!l||!l.warn)return '';
 return `<div class="warning-card"><strong>Conviene liberar lugar</strong><p class="hint">La base ocupa ${Math.round(l.bytes/1024)} KB de ${Math.round(l.maxBytes/1024)} KB. Entrá a <strong>Copias de seguridad</strong>: primero descargá la copia y después archivá lo más viejo. Si se llega al tope, no se pueden guardar más cambios.</p></div>`;}
/* La semana no se guarda en ningún lado: se calcula del horario habitual, las
   ausencias y los cambios puntuales, cada vez que alguien la mira o la imprime.
   Sirve para cualquier fecha, aunque esa semana nunca se haya abierto antes. */
const H=()=>root.OJOS_HORARIOS;
/* La semana de hoy. Si hoy es domingo, la que arranca mañana. */
const semanaDeHoy=()=>{const m=monday(today);return new Date(today+'T12:00:00').getDay()===0?plus(m,7):m;};
/* Se calcula una vez por pantalla: render() y save() la vuelven a pedir. */
let semanaCache=null;
function invalidarSemana(){semanaCache=null;}
function week(){
 if(!semanaCache||semanaCache.lunes!==selectedWeek)semanaCache={lunes:selectedWeek,datos:H().semana(db,selectedWeek)};
 return semanaCache.datos;
}
function rows(){return supervisor()?week().assignments:week().assignments.filter(a=>a.employeeId===person);}
const hoyOMas=v=>v<today?today:v;
/* Las filas del horario de siempre de una empleada, como las pide el motor. */
function filasDe(eid,fecha){
 return H().vigentesDe(db,eid,fecha).map(f=>({branchId:f.branchId,shift:f.shift,day:f.day,
  start:f.start,end:f.end,pauseStart:f.pauseStart||null,pauseEnd:f.pauseEnd||null}));
}
function ausenciaEnRango(eid,desde,hasta,dias){
 let n=0;
 for(let f=desde;f<=hasta&&n<400;f=plus(f,1),n++){
  if(dias&&!dias.includes(H().diaDe(f)))continue;
  if(H().ausenciaDe(db,eid,f))return 'Tiene una ausencia anotada el '+dateLabel(f)+'. Cancelá la ausencia o elegí otras fechas.';
 }
 return '';
}
async function save(message){invalidarSemana();if(saving){db=root.ISIS_SESSION.state();if(db)render();return toast('Esperá a que termine de guardarse.');}saving=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{db=await root.ISIS_SESSION.save(structuredClone(db));if(message)toast(message);}catch(e){db=root.ISIS_SESSION.state();toast(e.message);}finally{saving=false;invalidarSemana();if(db)render();document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
function log(text){db.history.unshift({date:new Date().toISOString(),text});db.history=db.history.slice(0,200);}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('#toast').hidden=true,4500);}
function openSheet(title,body,actions,fn){$('#sheet-title').textContent=title;$('#sheet-body').innerHTML=body;$('#sheet-actions').innerHTML=actions;$('#form-error').textContent='';submitSheet=fn;$('#sheet').showModal();}
function closeSheet(){$('#sheet').close();submitSheet=null;}
const btn=(text,action,style='')=>`<button type="button" class="btn ${style}" data-action="${action}">${text}</button>`;
const options=(list,selected)=>list.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('');
/* ── Cambiar el horario de alguien ───────────────────────────────────────
   Siempre las mismas dos opciones, bien grandes:
   · Solo por esta vez: vale una fecha o un período y después vuelve sola.
   · De ahora en adelante: pasa a ser su horario de siempre desde esa fecha,
     y lo que hacía antes queda guardado.
   Cambiar a una no toca a las demás: el motor revisa que entre y, si no
   entra, el error es de este cambio. */
function editor(existing,defaults={}){
 if(!supervisor())return;
 const b0=branch(existing?.branchId||defaults.branchId||branchId);
 const sh0=existing?.shift||defaults.shift||'morning';
 const d0=existing?existing.day:(defaults.day!==undefined?defaults.day:day);
 const t0=turnoDe(b0,sh0,d0);
 const activas=db.employees.filter(e=>e.active!==false);
 const fecha=plus(selectedWeek,d0);
 const pu=existing&&existing.puntualId?(db.punctual||[]).find(p=>p.id===existing.puntualId&&Array.isArray(p.filas)):null;
 const nombre=existing?(employee(existing.employeeId)?.name||'esta empleada'):'';
 let modo=existing?'puntual':'permanente',manual=false;
 openSheet(existing?'Cambiar el horario de '+nombre:'Asignar un horario',
  `<div class="opciones-cambio">
   <button type="button" class="accion-grande" data-modo="puntual"><span class="ico">📌</span><span><b>Solo por esta vez</b><span>Para una fecha o un período. Después vuelve sola a su horario de siempre.</span></span></button>
   <button type="button" class="accion-grande" data-modo="permanente"><span class="ico">🔁</span><span><b>De ahora en adelante</b><span>Pasa a ser su horario de siempre. Lo que hacía antes queda guardado.</span></span></button>
  </div>
  <div id="fechas-puntual" class="fields-row">
   <div class="field"><label for="p-desde">Desde</label><input type="date" id="p-desde" value="${esc(pu?pu.from:fecha)}"></div>
   <div class="field"><label for="p-hasta">Hasta</label><input type="date" id="p-hasta" value="${esc(pu?pu.to:fecha)}"></div>
  </div>
  <div id="fechas-permanente" class="field"><label for="g-desde">¿Desde qué día vale?</label>
   <input type="date" id="g-desde" value="${esc(hoyOMas(existing?fecha:selectedWeek))}">
   <p class="hint">Lo que hacía antes de esa fecha queda guardado tal cual.</p></div>
  ${existing?`<div class="field"><label>¿Quién y qué día?</label><p class="hint" style="margin:0"><strong>${esc(nombre)}</strong> · ${DAYS[d0]} ${dateLabel(fecha)}</p></div>`
   :`<div class="field"><label for="assign-person">¿Quién trabaja?</label><select id="assign-person" required><option value="">Elegir empleada</option>${options(activas)}</select></div>`}
  <div class="fields-row"><div class="field"><label for="assign-branch">Local</label><select id="assign-branch">${options(db.branches,b0.id)}</select></div>
   <div class="field"><label for="assign-shift">Turno</label><select id="assign-shift">${Object.entries(SHIFTS).map(([k,v])=>`<option value="${k}" ${k===sh0?'selected':''}>${v}</option>`).join('')}</select></div></div>
  ${existing?'':`<div class="field"><label>¿Qué días?</label><div class="days-checks">${DAYS.map((n,i)=>`<label><input type="checkbox" name="assign-day" value="${i}" ${(defaults.day===undefined||i===defaults.day)?'checked':''}>${n.slice(0,3)}</label>`).join('')}</div></div>`}
  <div class="fields-row"><div class="field"><label for="assign-start">Entrada</label><input type="time" id="assign-start" value="${esc(existing?.start||t0.start)}" required></div>
   <div class="field"><label for="assign-end">Salida</label><input type="time" id="assign-end" value="${esc(existing?.end||t0.end)}" required></div></div>
  <details><summary class="hint">Corte dentro del turno (opcional)</summary><div class="fields-row">
   <div class="field"><label for="assign-pause-start">Empieza el corte</label><input type="time" id="assign-pause-start" value="${esc(existing?.pauseStart||'')}"></div>
   <div class="field"><label for="assign-pause-end">Termina el corte</label><input type="time" id="assign-pause-end" value="${esc(existing?.pauseEnd||'')}"></div></div></details>
  <div class="field"><label for="p-motivo">¿Por qué? (opcional)</label><input id="p-motivo" maxlength="120" value="${esc(pu?.motivo||'')}" placeholder="Por ejemplo: cubre a Belén"></div>
  <p class="hint">Si no tocás las horas, se usan las del turno de ese local. Se comprueba que no quede en dos locales el mismo día, con horarios pisados ni con gente de más.</p>`,
  `${existing?'<button type="button" class="btn danger" id="quitar">Quitar</button>':''}<button type="button" class="btn" data-action="close">Cancelar</button><button class="btn primary" type="submit" id="guardar-cambio">Guardar</button>`,
  ()=>guardarCambio());

 function leer(){
  const eid=existing?existing.employeeId:$('#assign-person').value;
  if(!eid)return {error:'Elegí una empleada.'};
  const bid=$('#assign-branch').value,sh=$('#assign-shift').value;
  const dias=existing?[d0]:[...document.querySelectorAll('[name="assign-day"]:checked')].map(x=>+x.value);
  if(!dias.length)return {error:'Elegí al menos un día.'};
  const filas=dias.map(d=>{
   const t=turnoDe(branch(bid),sh,d),automatico=!manual&&!existing;
   return {branchId:bid,shift:sh,day:d,
    start:automatico?t.start:$('#assign-start').value,end:automatico?t.end:$('#assign-end').value,
    pauseStart:$('#assign-pause-start').value||null,pauseEnd:$('#assign-pause-end').value||null};
  });
  return {eid,dias,filas,motivo:$('#p-motivo').value.trim()};
 }
 function guardarCambio(){
  const d=leer();if(d.error)return d.error;
  if(modo==='puntual'){
   const desde=$('#p-desde').value,hasta=$('#p-hasta').value||desde;
   if(!desde)return 'Elegí la fecha del cambio.';
   if(hasta<desde)return 'La fecha de fin tiene que ser posterior a la de inicio.';
   let dias=d.dias,filas=d.filas,pid,tipo='horario',motivo=d.motivo;
   if(pu){pid=pu.id;tipo=pu.tipo||'horario';
    filas=(pu.filas||[]).filter(f=>f.day!==d0).concat(d.filas);
    dias=[...new Set((pu.dias||[]).concat(d.dias))];}
   const falta=ausenciaEnRango(d.eid,desde,hasta,dias);if(falta)return falta;
   const r=H().aplicarPuntual(db,{id:pid,employeeId:d.eid,desde,hasta,dias,filas,tipo,motivo});
   if(r.error)return r.error;
   db=r.state;log('Cambio puntual de '+(employee(d.eid)?.name||'')+', del '+desde+' al '+hasta);
   closeSheet();save('Guardado solo para esas fechas. Después vuelve sola a su horario de siempre.');
   return;
  }
  const desde=$('#g-desde').value;
  if(!desde)return 'Elegí desde qué día vale el horario nuevo.';
  let conjunto=filasDe(d.eid,desde);
  if(existing)conjunto=conjunto.filter(f=>!(f.day===d0&&f.shift===existing.shift&&f.branchId===existing.branchId));
  /* Solo se reemplaza el mismo local y turno del mismo día. Si ya trabaja en
     otro local ese día, no se la saca a escondidas: el motor avisa. */
  for(const f of d.filas)conjunto=conjunto.filter(x=>!(x.day===f.day&&x.shift===f.shift&&x.branchId===f.branchId));
  const r=H().aplicarPermanente(db,d.eid,desde,conjunto.concat(d.filas));
  if(r.error)return r.error;
  db=r.state;log('Horario de siempre de '+(employee(d.eid)?.name||'')+', desde el '+desde);
  closeSheet();save('Horario guardado. Se repite solo todas las semanas desde esa fecha.');
 }
 function quitar(){
  if(modo==='puntual'){
   let r;
   if(pu){
    r=H().aplicarPuntual(db,{id:pu.id,employeeId:existing.employeeId,desde:pu.from,hasta:pu.to,
     dias:[...new Set((pu.dias||[]).concat([d0]))],filas:(pu.filas||[]).filter(f=>f.day!==d0),
     tipo:pu.tipo,motivo:pu.motivo});
   }else{
    const desde=$('#p-desde').value||fecha,hasta=$('#p-hasta').value||desde;
    if(hasta<desde)return 'La fecha de fin tiene que ser posterior a la de inicio.';
    r=H().aplicarPuntual(db,{employeeId:existing.employeeId,desde,hasta,dias:[d0],filas:[],
     tipo:'horario',motivo:$('#p-motivo').value.trim()||'Ese día no trabaja'});
   }
   if(r.error)return r.error;
   db=r.state;log('Día libre puntual de '+nombre);
   closeSheet();save('Ese día queda libre. Las demás semanas siguen igual.');
   return;
  }
  const desde=$('#g-desde').value;if(!desde)return 'Elegí desde qué día.';
  const conjunto=filasDe(existing.employeeId,desde)
   .filter(f=>!(f.day===d0&&f.shift===existing.shift&&f.branchId===existing.branchId));
  const r=H().aplicarPermanente(db,existing.employeeId,desde,conjunto);
  if(r.error)return r.error;
  db=r.state;log('Se quitó '+DAYS[d0]+' del horario de siempre de '+nombre);
  closeSheet();save('Se le quitó ese día de ahora en adelante. Lo anterior queda guardado.');
 }
 const pintar=()=>{
  document.querySelectorAll('[data-modo]').forEach(x=>x.classList.toggle('destacada',x.dataset.modo===modo));
  $('#fechas-puntual').style.display=modo==='puntual'?'':'none';
  $('#fechas-permanente').style.display=modo==='permanente'?'':'none';
  $('#guardar-cambio').textContent=modo==='puntual'?'Guardar solo por esta vez':'Guardar de ahora en adelante';
  if($('#quitar'))$('#quitar').textContent=modo==='puntual'?'Quitar ese día':'Quitar de ahora en adelante';
 };
 document.querySelectorAll('[data-modo]').forEach(x=>x.onclick=()=>{modo=x.dataset.modo;pintar();});
 pintar();
 if(existing)$('#quitar').onclick=()=>{const e=quitar();$('#form-error').textContent=e||'';};
 const horasDeTurno=()=>{
  const elegidos=existing?[d0]:[...document.querySelectorAll('[name="assign-day"]:checked')].map(x=>+x.value);
  const h=turnoDe(branch($('#assign-branch').value),$('#assign-shift').value,elegidos.length?elegidos[0]:d0);
  $('#assign-start').value=h.start;$('#assign-end').value=h.end;
 };
 const cambiarTurno=()=>{manual=false;horasDeTurno();$('#assign-pause-start').value='';$('#assign-pause-end').value='';};
 $('#assign-branch').onchange=cambiarTurno;$('#assign-shift').onchange=cambiarTurno;
 $('#assign-start').oninput=$('#assign-end').oninput=()=>{manual=true;};
 document.querySelectorAll('[name="assign-day"]').forEach(c=>c.onchange=()=>{if(!manual)horasDeTurno();});
}
function visibleMessages(){return db.messages;}
function recipients(m){if(Array.isArray(m.recipients))return db.employees.filter(e=>m.recipients.includes(e.id));if(m.audience==='all')return db.employees.filter(e=>e.active!==false);const ids=new Set(week().assignments.filter(a=>a.branchId===m.audience).map(a=>a.employeeId));return db.employees.filter(e=>ids.has(e.id)&&e.active!==false);}
function messages(){return `<div class="page-title"><div><h1>Para estar al tanto.</h1><p class="sub">Avisos del equipo, juntos en un lugar.</p></div>${supervisor()?btn('+ Nuevo comunicado','new-message','primary'):''}</div><div class="cards">${visibleMessages().map(m=>`<article class="message-card"><div class="message-meta"><span class="audience">${m.audience==='all'?'Todo Ojos':esc(branch(m.audience)?.name)}</span>${dateLabel(m.created)}</div><h2>${esc(m.title)}</h2><p class="message-body">${esc(m.body)}</p><div class="message-foot">${supervisor()?`<button class="text-button" data-readers="${m.id}">${m.read.filter(x=>recipients(m).some(e=>e.id===x)).length} de ${recipients(m).length} confirmaron lectura</button>`:m.read.includes(person)?'<span class="status published">✓ Leído</span>':`<button class="btn soft small" data-read="${m.id}">Marcar como leído</button>`}</div></article>`).join('')||'<div class="empty"><strong>Sin comunicados</strong>Los avisos del equipo aparecerán acá.</div>'}</div>`;}
function requests(){const list=supervisor()?db.requests:db.requests.filter(r=>r.employeeId===person);return `<div class="page-title"><div><h1>${supervisor()?'Lo que necesita el equipo.':'Tus solicitudes.'}</h1><p class="sub">Cambios de horario, días libres y avisos de ausencia.</p></div>${!supervisor()?btn('+ Nueva solicitud','new-request','primary'):''}</div><div class="cards">${list.map(r=>`<article class="request-card"><div class="message-meta"><span class="status ${r.status==='Aprobada'?'published':'draft'}">${esc(r.status)}</span>${dateLabel(r.date)}</div><h2>${esc(r.type)}${supervisor()?' · '+esc(employee(r.employeeId)?.name):''}</h2><p class="request-detail">${esc(r.detail)}</p>${r.note?`<p class="hint">Respuesta: ${esc(r.note)}</p>`:''}${supervisor()&&r.status==='Pendiente'?`<div class="actions"><button class="btn primary small" data-resolve="${r.id}|Aprobada">Aprobar</button><button class="btn small" data-resolve="${r.id}|No aprobada">No aprobar</button></div>`:''}</article>`).join('')||`<div class="empty"><strong>${supervisor()?'Todo al día':'Todavía no hiciste solicitudes'}</strong>${supervisor()?'Las solicitudes del equipo aparecerán acá.':'Podés pedir un cambio o avisar una ausencia.'}</div>`}</div>`;}
function camposTurno(pref,t){
 return Object.entries(SHIFTS).map(([s,n])=>`<div class="turno-bloque"><strong>${n}</strong><div class="fields-row"><div class="field"><label for="${pref}${s}-start">Entrada</label><input type="time" id="${pref}${s}-start" value="${esc(t(s).start)}"></div><div class="field"><label for="${pref}${s}-end">Salida</label><input type="time" id="${pref}${s}-end" value="${esc(t(s).end)}"></div><div class="field"><label for="${pref}${s}-slots">Personas</label><select id="${pref}${s}-slots">${[1,2,3,4].map(i=>`<option value="${i}" ${i===t(s).slots?'selected':''}>${i}</option>`).join('')}</select></div></div></div>`).join('');
}
function leerTurnos(pref){
 const out={};
 for(const s of Object.keys(SHIFTS)){
  const start=$('#'+pref+s+'-start').value,end=$('#'+pref+s+'-end').value,slots=+$('#'+pref+s+'-slots').value;
  if(!Number.isFinite(mins(start))||!Number.isFinite(mins(end))||mins(end)<=mins(start))return {error:'Revisá las horas de '+SHIFTS[s].toLowerCase()+'.'};
  out[s]={start,end,slots};
 }
 return {turnos:out};
}
function settings(){
 if(!supervisor())return;
 if(tab!=='inicio')return settingsLocal();
 openSheet('Horario de los locales',`<p class="hint">Elegí el local que querés configurar. Los demás conservan su horario.</p><div class="lista">${db.branches.map(b=>`<button type="button" class="accion-grande" data-settings-local="${esc(b.id)}"><span><b>${esc(b.name)}</b><span>${horaCorta(b.morning.start)} a ${horaCorta(b.afternoon.end)} · mañana y tarde</span></span></button>`).join('')}</div>`,btn('Cerrar','close'),()=>{});
 document.querySelectorAll('[data-settings-local]').forEach(button=>button.onclick=()=>{branchId=button.dataset.settingsLocal;closeSheet();settingsLocal();});
}
function settingsLocal(){
 if(!supervisor())return;
 const b=branch(branchId),dias=structuredClone(b.dias||{});
 openSheet(b.name+' · horario',
  `<p class="hint">El horario que hacen normalmente, y los días que son distintos. Los horarios ya asignados se conservan.</p>
   <h3>Todos los días</h3>${camposTurno('base-',s=>b[s])}
   <h3 style="margin-top:18px">¿Algún día es distinto?</h3>
   <p class="hint">Por ejemplo, si el sábado cierran más temprano.</p>
   ${DAYS.map((n,d)=>{const propio=!!(dias[d]);return `<details class="dia-distinto" ${propio?'open':''}><summary>${n}${propio?` · ${horaCorta(turnoDe(b,'morning',d).start)}–${horaCorta(turnoDe(b,'afternoon',d).end)}`:' · igual al de siempre'}</summary><label class="hint dia-check"><input type="checkbox" id="d${d}-distinto" ${propio?'checked':''}> Este día es distinto</label><div id="d${d}-campos">${camposTurno('d'+d+'-',s=>turnoDe(b,s,d))}</div></details>`;}).join('')}`,
  `<button type="button" class="btn" data-action="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button>`,
  ()=>{
   const base=leerTurnos('base-');if(base.error)return base.error;
   const nuevos={};
   for(let d=0;d<6;d++){
    if(!$('#d'+d+'-distinto').checked)continue;
    const r=leerTurnos('d'+d+'-');if(r.error)return DAYS[d]+': '+r.error;
    nuevos[d]=r.turnos;
   }
   for(let d=0;d<6;d++)for(const s of Object.keys(SHIFTS)){
    const cupo=(nuevos[d]&&nuevos[d][s]?nuevos[d][s]:base.turnos[s]).slots;
    if(week().assignments.filter(a=>a.branchId===b.id&&a.day===d&&a.shift===s).length>cupo)
     return DAYS[d]+' a la '+SHIFTS[s].toLowerCase()+': antes de bajar las personas, quitá las asignaciones que sobren.';
   }
   Object.assign(b,base.turnos);
   if(Object.keys(nuevos).length)b.dias=nuevos;else delete b.dias;
   closeSheet();save('Horario del local guardado.');
  });
 DAYS.forEach((n,d)=>{
  const check=$('#d'+d+'-distinto'),campos=$('#d'+d+'-campos');
  const pintar=()=>{campos.style.display=check.checked?'':'none';};
  check.onchange=pintar;pintar();
 });
}
function team(){if(!supervisor())return;openSheet('El equipo de Ojos',`<p class="hint">Agregá a tu equipo o corregí un nombre. Si elegiste el ejemplo, reemplazá esos nombres por los reales.</p><div class="employee-list">${db.employees.filter(e=>e.active!==false).map(e=>`<div class="employee-row"><span>${esc(e.name)}</span><button class="text-button" type="button" data-rename="${e.id}">Cambiar nombre</button></div>`).join('')}</div><div class="field"><label for="new-person">Agregar una empleada</label><input id="new-person" maxlength="65" placeholder="Nombre y apellido"></div>`,`<button type="button" class="btn" data-action="close">Cerrar</button><button class="btn primary" type="submit">Agregar</button>`,()=>{const name=$('#new-person').value.trim();if(!name)return 'Escribí el nombre.';if(db.employees.some(e=>e.name.toLowerCase()===name.toLowerCase()))return 'Ese nombre ya está en el equipo.';db.employees.push({id:id(),name,active:true});closeSheet();save('Empleada agregada.');});document.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>rename(b.dataset.rename));}
function rename(eid){const e=employee(eid);closeSheet();openSheet('Nombre de la empleada',`<div class="field"><label for="rename-person">Nombre y apellido</label><input id="rename-person" value="${esc(e.name)}" maxlength="65" required></div>`,`<button type="button" class="btn" data-action="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button>`,()=>{const name=$('#rename-person').value.trim();if(!name)return 'Escribí un nombre.';if(db.employees.some(x=>x.id!==eid&&x.name.toLowerCase()===name.toLowerCase()))return 'Ya hay otra empleada con ese nombre.';e.name=name;closeSheet();save('Nombre actualizado.');});}
function newMessage(){if(!supervisor())return;openSheet('Nuevo comunicado',`<div class="field"><label for="message-title">Título</label><input id="message-title" required maxlength="100" placeholder="Por ejemplo: cambio del sábado"></div><div class="field"><label for="message-audience">¿Para quién?</label><select id="message-audience"><option value="all">Todo Ojos</option>${options(db.branches)}</select></div><div class="field"><label for="message-body">Mensaje</label><textarea id="message-body" required maxlength="2000"></textarea></div>`,`<button class="btn" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Publicar comunicado</button>`,()=>{const title=$('#message-title').value.trim(),body=$('#message-body').value.trim();if(!title||!body)return 'Completá el título y el mensaje.';db.messages.unshift({id:id(),title,body,audience:$('#message-audience').value,scopeWeek:selectedWeek,created:today,read:[]});closeSheet();save('Comunicado publicado para el equipo.');});}
function newRequest(){if(supervisor())return;openSheet('Nueva solicitud',`<div class="field"><label for="request-type">¿Qué necesitás?</label><select id="request-type"><option>Cambiar un horario</option><option>Pedir un día libre</option><option>Avisar una ausencia</option></select></div><div class="field"><label for="request-date">Fecha</label><input id="request-date" type="date" value="${today}" required></div><div class="field"><label for="request-detail">Contale a la supervisora</label><textarea id="request-detail" maxlength="1200" required placeholder="Indicá el cambio que necesitás."></textarea></div>`,`<button class="btn" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Enviar solicitud</button>`,()=>{const detail=$('#request-detail').value.trim();if(!detail)return 'Escribí qué necesitás.';db.requests.unshift({id:id(),employeeId:person,type:$('#request-type').value,date:$('#request-date').value,detail,status:'Pendiente'});closeSheet();save('Solicitud enviada a la supervisora.');});}
function resolveRequest(rid,status){const r=db.requests.find(x=>x.id===rid);if(!supervisor()||!r)return;openSheet(status==='Aprobada'?'Aprobar solicitud':'Responder solicitud',`<p>${esc(employee(r.employeeId)?.name)} · ${esc(r.type)} · ${dateLabel(r.date)}</p><p class="hint">${esc(r.detail)}</p><div class="field"><label for="request-note">Respuesta</label><textarea id="request-note" maxlength="800" placeholder="Un mensaje para la empleada"></textarea></div><p class="hint">La respuesta no modifica el horario automáticamente. Si aprobás un cambio, ajustalo en Horarios.</p>`,`<button class="btn" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Confirmar respuesta</button>`,()=>{r.status=status;r.note=$('#request-note').value.trim();closeSheet();save('Respuesta guardada.');});}
function showReaders(mid){const m=db.messages.find(x=>x.id===mid);if(!supervisor()||!m)return;
 const conectado=!!(root.ISIS_SESSION&&root.ISIS_SESSION.conectado);
 openSheet('¿A quién le toca este comunicado?',
  `<h3>${esc(m.title)}</h3>
   ${conectado?'':'<p class="hint"><strong>Todavía no hay conexión entre teléfonos</strong>, así que no se puede saber de verdad quién lo leyó. Esta es la lista de a quiénes les corresponde.</p>'}
   <div class="employee-list">${recipients(m).map(e=>`<div class="employee-row"><span>${esc(e.name)}</span><span>${conectado?(m.read.includes(e.id)?'✓ Leído':'Pendiente'):''}</span></div>`).join('')||'<p class="hint">Todavía no hay nadie en el equipo.</p>'}</div>`,
  btn('Cerrar','close'),()=>{});}
function history(){if(!supervisor())return;openSheet('Últimos cambios',db.history.length?db.history.slice(0,20).map(h=>`<p class="hint">${new Date(h.date).toLocaleString('es-AR')}<br>${esc(h.text)}</p>`).join(''):'<p class="hint">Los cambios de horario y publicaciones aparecerán acá.</p>',btn('Cerrar','close'),()=>{});}
let anexoPendiente=null;
function datosPDF(formato){
 return {jsPDF:root.jspdf&&root.jspdf.jsPDF,branches:db.branches,employees:db.employees,
  assignments:week().assignments,
  periodLabel:period(selectedWeek),mode:'HORARIO DEL EQUIPO',
  dayNumbers:DAYS.map((_,i)=>new Date(plus(selectedWeek,i)+'T12:00:00').getDate()),
  layout:formato==='cuadrantes'?'cuadrantes':'porLocal',
  branchIds:(formato==='cuadrantes'||formato==='todos')?null:[formato]};
}
function nombrePDF(formato){
 if(formato==='cuadrantes')return 'ISIS Ojos - los cuatro locales '+selectedWeek+'.pdf';
 if(formato==='todos')return 'ISIS Ojos - planillas por local '+selectedWeek+'.pdf';
 return 'ISIS Ojos - '+(branch(formato)?.name||'local')+' '+selectedWeek+'.pdf';
}
function bajarAnexo(){
 try{
  if(!anexoPendiente)return toast('No hay anexo para esta planilla.');
  const a=root.ISIS_PDF.annex(anexoPendiente.datos,anexoPendiente.groups);
  if(!a)return toast('No hay anexo para esta planilla.');
  a.doc.save('ISIS Ojos - anexo '+selectedWeek+'.pdf');
  toast('Anexo descargado: '+a.count+' horarios propios y pausas.');
 }catch(e){toast(e.message);}
}
$('#role').onchange=e=>{view=e.target.value;render();};$('#person').onchange=e=>{person=e.target.value;render();};$('#close-sheet').onclick=closeSheet;
$('#sheet-form').onsubmit=e=>{e.preventDefault();if(submitSheet){const error=submitSheet();if(error)$('#form-error').textContent=error;}};
document.addEventListener('click',e=>{const el=e.target.closest('button');if(!el)return;
 if(el.dataset.tab){tab=el.dataset.tab;render();return;}if(el.dataset.branch){branchId=el.dataset.branch;render();return;}if(el.dataset.day!==undefined){day=+el.dataset.day;render();return;}
 if(el.dataset.edit){const a=week().assignments.find(a=>a.id===el.dataset.edit);if(a)editor(a);return;}
 if(el.dataset.add){const [branchId,shift,day]=el.dataset.add.split('|');editor(null,{branchId,shift,day:+day});return;}
 if(el.dataset.read){const m=db.messages.find(m=>m.id===el.dataset.read);if(m&&!supervisor()&&visibleMessages().includes(m)&&!m.read.includes(person)){m.read.push(person);save('Lectura confirmada.');}return;}
 if(el.dataset.readers){showReaders(el.dataset.readers);return;}if(el.dataset.resolve){resolveRequest(...el.dataset.resolve.split('|'));return;}
 const actions={assign:()=>editor(),settings,history,'new-message':newMessage,'new-request':newRequest,close:closeSheet,prev:()=>{selectedWeek=plus(selectedWeek,-7);render();},next:()=>{selectedWeek=plus(selectedWeek,7);render();},hoy:()=>{selectedWeek=semanaDeHoy();render();}};
 if(actions[el.dataset.action])actions[el.dataset.action]();
});
// Mismo recorrido de horarios, ahora respaldado por identidad y datos del servidor.
const originalTeam=team;
team=function(){if(!supervisor())return;originalTeam();const body=$('#sheet-body');body.innerHTML=`<div class="actions team-tools">${btn('Accesos','accounts')}${btn('Ausencias y licencias','absences')}${btn('Respaldo','backup')}</div><p class="hint">Agregá las empleadas y habilitá su usuario desde Accesos.</p><div class="employee-list">${db.employees.filter(e=>e.active!==false).map(e=>`<div class="employee-row"><span>${esc(e.name)}</span><div class="actions"><button class="text-button" type="button" data-rename="${e.id}">Nombre</button><button class="text-button" type="button" data-offboard="${e.id}">Dar de baja</button></div></div>`).join('')||'<p class="hint">Todavía no hay empleadas cargadas.</p>'}</div>${db.employees.some(e=>e.active===false)?`<details><summary class="hint">Empleadas dadas de baja</summary>${db.employees.filter(e=>e.active===false).map(e=>`<div class="employee-row"><span>${esc(e.name)}</span><button type="button" class="text-button" data-reactivate="${e.id}">Reincorporar</button></div>`).join('')}</details>`:''}<div class="field"><label for="new-person">Agregar una empleada</label><input id="new-person" maxlength="65" placeholder="Nombre y apellido"></div>`;document.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>rename(b.dataset.rename));document.querySelectorAll('[data-offboard]').forEach(b=>b.onclick=()=>offboard(b.dataset.offboard));document.querySelectorAll('[data-reactivate]').forEach(b=>b.onclick=()=>{employee(b.dataset.reactivate).active=true;closeSheet();save('Empleada reincorporada. Revisá su horario y habilitá su acceso.');});if(!db.employees.length){const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Importar equipo desde ISIS';button.onclick=importISIS;$('#sheet-actions').prepend(button);}};
function offboard(eid){const e=employee(eid);closeSheet();openSheet('Dar de baja a '+e.name,`<p>Se le quita el horario <strong>de hoy en adelante</strong>. Lo que hizo antes, el historial y los comunicados se conservan.</p><p class="hint">Después revisá si quedaron lugares sin cubrir. La podés reincorporar cuando quieras.</p>`,`<button class="btn" type="button" data-action="close">Volver</button><button class="btn danger" type="submit">Confirmar baja</button>`,()=>{const r=H().aplicarPermanente(db,eid,today,[]);if(r.error)return r.error;db=r.state;db.punctual=(db.punctual||[]).filter(p=>!(p.employeeId===eid&&p.to>=today));employee(eid).active=false;log('Baja de '+e.name);closeSheet();save('Baja guardada. Su horario anterior se conserva.');});}
function backup(){if(!supervisor())return;closeSheet();openSheet('Respaldo de Ojos',`<p>Guardá una copia de horarios, equipo, avisos y solicitudes. La copia no incluye PIN ni sesiones.</p><p class="hint">Conservala en un lugar privado. Al restaurar se guarda además una copia previa en el servidor.</p>`,`<button class="btn" type="button" data-action="close">Cerrar</button><button class="btn" type="button" id="archive-weeks">Archivar lo más viejo</button><button class="btn" type="button" id="restore-backup">Restaurar copia</button><button class="btn primary" type="button" id="download-backup">Descargar copia</button>`,()=>{});$('#download-backup').onclick=async()=>{try{const data=await root.ISIS_SESSION.request('/backup'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='ISIS Ojos - respaldo '+today+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Copia descargada.');}catch(e){toast(e.message);}};$('#archive-weeks').onclick=()=>archivar();$('#restore-backup').onclick=()=>{const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{const file=input.files[0];if(file.size>900000)throw Error('El archivo es demasiado grande para un respaldo de Ojos.');const data=JSON.parse(await file.text());if(data.kind!=='isis-ojos-backup'||data.version!==1||![2,3].includes(data.state?.schema))throw Error('Elegí un respaldo descargado desde ISIS Ojos.');closeSheet();openSheet('Revisar restauración',`<p>Se reemplazarán los horarios, equipo, avisos y solicitudes actuales por la copia del ${esc(new Date(data.createdAt).toLocaleString('es-AR'))}.</p><p class="hint">Los accesos y PIN no se reemplazan. El servidor conservará una copia del estado anterior.</p><label class="hint"><input type="checkbox" id="restore-confirm" required> Revisé la copia y quiero reemplazar los datos actuales.</label>`,`<button class="btn" type="button" data-action="close">Cancelar</button><button class="btn danger" type="submit">Restaurar esta copia</button>`,()=>{if(!$('#restore-confirm').checked)return 'Confirmá que revisaste la copia.';$('#sheet-actions button[type="submit"]').disabled=true;root.ISIS_SESSION.restore(data).then(()=>{closeSheet();toast('Copia restaurada.');}).catch(e=>{$('#form-error').textContent=e.message;$('#sheet-actions button[type="submit"]').disabled=false;});});}catch(e){toast(e.message);}};input.click();};}
function archivar(){if(!supervisor())return;const l=root.ISIS_SESSION.limits&&root.ISIS_SESSION.limits();
 const corte=plus(monday(today),-7*26);
 closeSheet();openSheet('Archivar lo más viejo',`<p>Se quitan de la app las ausencias y los cambios puntuales terminados antes de la fecha que elijas. El horario de siempre y sus etapas se conservan. Antes se guarda una copia completa en el servidor, y conviene que además descargues la tuya.</p>${l?`<p class="hint">Hoy hay ${l.weeks} semanas guardadas y la base ocupa ${Math.round(l.bytes/1024)} KB de ${Math.round(l.maxBytes/1024)} KB.</p>`:''}<div class="field"><label for="archive-before">Archivar todo lo anterior a</label><input type="date" id="archive-before" value="${corte}" required></div><label class="hint"><input type="checkbox" id="archive-confirm" required> Ya descargué la copia y quiero liberar lugar.</label>`,
 `<button class="btn" type="button" data-action="close">Cancelar</button><button class="btn danger" type="submit">Archivar</button>`,()=>{
  if(!$('#archive-confirm').checked)return 'Confirmá que descargaste la copia.';
  const before=$('#archive-before').value;if(!before)return 'Elegí una fecha.';
  $('#sheet-actions button[type="submit"]').disabled=true;
  root.ISIS_SESSION.archive(before).then(r=>{closeSheet();toast('Listo, se archivó lo viejo. La copia quedó guardada.');}).catch(e=>{$('#form-error').textContent=e.message;$('#sheet-actions button[type="submit"]').disabled=false;});});}
function importISIS(){if(!supervisor()||db.employees.length)return;const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{const extracted=root.ISIS_IMPORT.extract(JSON.parse(await input.files[0].text()),db.branches);if(!extracted.employees.length)throw Error('No hay empleadas activas de Ojos en el respaldo.');const proposed=H().migrar({...structuredClone(db),employees:extracted.employees,base:extracted.base,exceptions:extracted.exceptions,punctual:extracted.punctual});const prueba=H().semana(proposed,monday(today)).conflicts.filter(c=>!c.aviso);if(prueba.length)throw Error(prueba[0].text+' Revisá la configuración del local antes de importar.');closeSheet();openSheet('Importar solo Ojos',`<p>${extracted.employees.length} empleadas, ${extracted.base.length} horarios y ${extracted.exceptions.length} ausencias.</p><p class="hint">Queda como el horario de siempre: se repite solo todas las semanas. No se importan clientas, teléfonos, comisiones ni Caja.</p>`,`<button class="btn" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Confirmar importación</button>`,()=>{db=proposed;closeSheet();save('Equipo y horarios de Ojos importados.');});}catch(e){toast(e.message);}};input.click();}
async function accounts(){if(!supervisor())return;try{const data=await root.ISIS_SESSION.request('/accounts');openSheet('Accesos del equipo',`<p class="hint">Cada persona ingresa con su usuario y PIN. Restablecer o bloquear un acceso cierra sus sesiones anteriores.</p><div class="employee-list">${data.accounts.map(a=>`<div class="employee-row"><span>${esc(a.name)}<small style="display:block">${esc(a.login)} · ${a.active?'Habilitado':'Bloqueado'}</small></span><button class="text-button" type="button" data-account="${esc(a.login)}">Cambiar</button></div>`).join('')}</div>`,`<button class="btn" type="button" data-action="close">Cerrar</button><button class="btn primary" type="button" id="create-account">+ Dar acceso</button>`,()=>{});$('#create-account').onclick=()=>accountEditor();document.querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>accountEditor(data.accounts.find(a=>a.login===b.dataset.account)));}catch(e){toast(e.message);}}
function accountEditor(existing){closeSheet();openSheet(existing?'Cambiar acceso':'Dar acceso a una empleada',`<div class="field"><label for="account-login">Usuario para ingresar</label><input id="account-login" autocomplete="off" maxlength="40" value="${esc(existing?.login||'')}" ${existing?'readonly':''} required></div>${existing?.role==='supervisor'?'':`<div class="field"><label for="account-employee">Empleada</label><select id="account-employee">${options(db.employees.filter(e=>e.active!==false),existing?.employeeId)}</select></div>`}<div class="field"><label for="account-pin">${existing?'Nuevo PIN (dejar vacío para conservar)':'PIN de cuatro números'}</label><input id="account-pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="new-password" ${existing?'':'required'}></div>${existing?.role==='supervisor'?'':`<div class="field"><label for="account-active">Estado del acceso</label><select id="account-active"><option value="true">Habilitado</option><option value="false" ${existing?.active===false?'selected':''}>Bloqueado</option></select></div>`}`,`<button class="btn" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Guardar acceso</button>`,()=>{const body={login:$('#account-login').value,employeeId:$('#account-employee')?.value,pin:$('#account-pin').value,active:$('#account-active')?.value!=='false'};root.ISIS_SESSION.request('/accounts',{method:'POST',body}).then(()=>{closeSheet();toast('Acceso guardado. Comunicá el usuario y PIN personalmente.');}).catch(e=>$('#form-error').textContent=e.message);});}
function absences(){if(!supervisor())return;openSheet('Ausencias y licencias',`<p class="hint">Esos días la persona no aparece en la planilla. Su horario de siempre no se toca: cuando termina la ausencia, vuelve sola.</p><div class="employee-list">${(db.exceptions||[]).map(e=>`<div class="employee-row"><span>${esc(employee(e.employeeId)?.name)} · ${esc(e.type)}<small style="display:block">${dateLabel(e.from)} al ${dateLabel(e.to)} · ${esc(e.reason)}</small></span><button type="button" class="text-button" data-cancel-absence="${esc(e.id)}">Cancelar</button></div>`).join('')||'<p class="hint">Sin ausencias registradas.</p>'}</div>`,`<button class="btn" type="button" data-action="close">Cerrar</button><button class="btn primary" type="button" id="new-absence">+ Registrar ausencia</button>`,()=>{});$('#new-absence').onclick=absenceEditor;document.querySelectorAll('[data-cancel-absence]').forEach(b=>b.onclick=()=>{db.exceptions=db.exceptions.filter(e=>e.id!==b.dataset.cancelAbsence);closeSheet();save('Ausencia cancelada. Revisá y reasigná los horarios de las semanas que ya estaban armadas.');});}
function absenceEditor(){closeSheet();openSheet('Registrar ausencia',`<div class="field"><label for="absence-employee">Empleada</label><select id="absence-employee">${options(db.employees.filter(e=>e.active!==false))}</select></div><div class="field"><label for="absence-type">Motivo</label><select id="absence-type"><option value="vacaciones">Vacaciones</option><option value="licencia">Licencia</option><option value="ausencia">Ausencia</option></select></div><div class="fields-row"><div class="field"><label for="absence-from">Desde</label><input type="date" id="absence-from" value="${today}" required></div><div class="field"><label for="absence-to">Hasta</label><input type="date" id="absence-to" value="${today}" required></div></div><div class="field"><label for="absence-reason">Detalle</label><input id="absence-reason" required maxlength="300"></div><p class="hint">Esos días no va a aparecer en la planilla. Su horario de siempre no se toca: cuando termina la ausencia, vuelve sola.</p>`,`<button class="btn" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Guardar ausencia</button>`,()=>{const employeeId=$('#absence-employee').value,from=$('#absence-from').value,to=$('#absence-to').value,reason=$('#absence-reason').value.trim();if(!employeeId||!from||to<from||!reason)return 'Revisá las fechas y el detalle.';if(db.exceptions.some(e=>e.employeeId===employeeId&&e.from<=to&&e.to>=from))return 'Ya hay una ausencia para esos días.';db.exceptions.push({id:id(),employeeId,from,to,reason,type:$('#absence-type').value});closeSheet();save('Ausencia guardada. Esos días quedan libres y después vuelve sola.');});}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(['accounts','absences'].includes(b.dataset.action))closeSheet();({accounts,absences,backup})[b.dataset.action]?.();});

/* ================= Rediseño 26/10/2026 =================
   Portada con acciones grandes, pantallas completas y nada escondido.
   Reusa las reglas, las hojas de formulario y el PDF que ya andaban. */
const conectado=()=>!!(root.ISIS_SESSION&&root.ISIS_SESSION.conectado);
const TITULOS={
 inicio:['Ojos','Los horarios del equipo'],
 schedule:['Horarios','Horario habitual y cambios, local por local'],
 absences:['Ausencias y reemplazos','Quién falta y quién la cubre'],
 planillas:['Planillas','Para imprimir y repartir'],
 team:['Equipo','Quiénes trabajan en Ojos'],
 messages:['Comunicados','Avisos para el equipo'],
 requests:['Solicitudes','Pedidos del equipo'],
 copias:['Copias de seguridad','Guardar y recuperar los horarios']
};
function nav(destino){tab=destino;window.scrollTo(0,0);render();}

/* Lugares sin cubrir de la semana que se está viendo. */
function faltantes(){
 const w=week(),out=[];
 for(const b of db.branches)for(let d=0;d<6;d++)for(const s of Object.keys(SHIFTS)){
  const cupo=turnoDe(b,s,d).slots;
  const hay=w.assignments.filter(a=>a.branchId===b.id&&a.day===d&&a.shift===s).length;
  if(hay<cupo)out.push({b,day:d,shift:s,faltan:cupo-hay});
 }
 return out;
}
function navegadorSemana(){
 const estaSemana=selectedWeek===semanaDeHoy();
 return `<div class="contexto"><div class="linea">
   <button class="flecha" data-action="prev" aria-label="Semana anterior">‹</button>
   <div class="semana">${period(selectedWeek)}</div>
   <button class="flecha" data-action="next" aria-label="Semana siguiente">›</button>
  </div><div class="linea"><span class="estado confirmada">Se repite solo</span>
  ${estaSemana?'<span class="hint">Esta semana</span>':'<button class="btn chico" data-action="hoy">Volver a esta semana</button>'}</div></div>`;
}
const avisoLocal=()=>conectado()?`<div class="aviso info"><strong>Horario compartido</strong>Los cambios guardados se comparten con el equipo. Cada empleada entra con su cuenta de Google y ve solamente lo suyo.</div>`:`<div class="aviso info"><strong>Esto se guarda solo en este teléfono</strong>
 Todavía no está conectado entre teléfonos: lo que cargás acá no le llega sola a nadie. Para repartir los horarios, usá <strong>Planillas</strong> y mandá el PDF. Guardá una copia cada tanto.</div>`;

/* ---------------- Portada ---------------- */
function pantallaInicio(){
 const pendientes=db.requests.filter(r=>r.status==='Pendiente').length;
 const sinLeer=db.messages.length;
 const faltan=faltantes().reduce((n,x)=>n+x.faltan,0);
 const gente=db.employees.filter(e=>e.active!==false).length;
 const ejemplo=db.ejemplo?`<div class="aviso atencion"><strong>Estás viendo datos de ejemplo</strong>
   Los nombres y horarios son inventados, para que veas cómo funciona. Entrá a <strong>Equipo</strong> y cargá a tu gente, o empezá de cero desde la pantalla de inicio.</div>`:'';
 const sinEquipo=!gente?`<div class="aviso atencion"><strong>Todavía no hay nadie cargado</strong>
   Empezá por <strong>Equipo</strong>: agregá a las chicas y cargá su horario habitual una sola vez. Después se repite automáticamente.</div>`:'';
 return `<div class="portada">
  ${ejemplo}${sinEquipo}
  ${navegadorSemana()}
  <button class="accion-grande destacada" data-ir="schedule">
   <span class="ico">🗓</span><span><b>Horarios</b><span>El horario de los cuatro locales, día por día${!gente?'':faltan?` · faltan ${faltan} lugares`:' · todo cubierto'}</span></span></button>
  <button class="accion-grande" data-ir="absences">
   <span class="ico">🔄</span><span><b>Ausencias y reemplazos</b><span>Vacaciones, licencias, faltas y quién cubre</span></span></button>
  <button class="accion-grande" data-ir="planillas">
   <span class="ico">🖨</span><span><b>Planillas</b><span>El PDF para imprimir y mandar por WhatsApp</span></span></button>
  <div class="grupo-titulo">El equipo</div>
  <div class="fila-3">
   <button class="accion-media" data-ir="team"><span class="ico">👥</span>Equipo${gente?`<span class="marca">${gente}</span>`:''}</button>
   <button class="accion-media" data-ir="messages"><span class="ico">📣</span>Comunicados${sinLeer?`<span class="marca">${sinLeer}</span>`:''}</button>
   <button class="accion-media" data-ir="requests"><span class="ico">✋</span>Solicitudes${pendientes?`<span class="marca">${pendientes}</span>`:''}</button>
  </div>
  <div class="grupo-titulo">Ajustes y copias</div>
  <div class="ajustes-fila">
   <button class="btn" data-action="settings">⏰ Horario de los locales</button>
   <button class="btn" data-ir="copias">💾 Copias de seguridad</button>
   <button class="btn" data-action="history">🕘 Historial de cambios</button>
  </div>
  ${avisoLocal()}
 </div>`;
}

/* ---------------- Horarios ---------------- */
function tarjetaDia(b,d){
 const w=week();
 return `<article class="dia-card"><header><b>${DAYS[d]}</b><span>${dateLabel(plus(selectedWeek,d))}</span></header>
 ${Object.entries(SHIFTS).map(([s,nombre])=>{
  const t=turnoDe(b,s,d),gente=w.assignments.filter(a=>a.branchId===b.id&&a.day===d&&a.shift===s);
  const libres=Math.max(0,t.slots-gente.length);
  return `<div class="turno"><div class="turno-cab"><b>${nombre}</b><span>${horaCorta(t.start)} a ${horaCorta(t.end)} · ${t.slots} ${t.slots===1?'persona':'personas'}</span></div>
   ${gente.map(a=>`<button class="persona" data-edit="${esc(a.id)}"><span><b>${esc(employee(a.employeeId)?.name||'Empleada')}</b><small>${horaCorta(a.start)} a ${horaCorta(a.end)}${a.pauseStart?` · corte ${horaCorta(a.pauseStart)} a ${horaCorta(a.pauseEnd)}`:''}${a.origen==='puntual'?' · solo por esta vez':''}</small></span><span class="editar">Cambiar</span></button>`).join('')}
   ${supervisor()?Array.from({length:libres},()=>`<button class="vacio-slot" data-add="${b.id}|${s}|${d}">+ Asignar a alguien</button>`).join('')
    :(gente.length?'':'<p class="sin-nadie">Sin asignar.</p>')}
  </div>`;
 }).join('')}</article>`;
}
function pantallaHorarios(){
 if(!supervisor())return mySchedula();
 const b=branch(branchId),faltan=faltantes(),problemas=week().conflicts.filter(c=>!c.aviso);
 const porLocal=lid=>faltan.filter(x=>x.b.id===lid).reduce((n,x)=>n+x.faltan,0);
 return `${navegadorSemana()}
 ${problemas.length?`<div class="aviso atencion"><strong>Revisá estos días</strong>
   Quedaron horarios que no se pudieron ubicar: dos locales el mismo día, turnos pisados o gente de más en un turno. No se perdió nada; acomodalos cuando puedas.
   <ul>${problemas.map(c=>`<li>${esc(c.text)}</li>`).join('')}</ul></div>`:''}
 <div class="grupo-titulo">¿Qué local?</div>
 <div class="locales">${db.branches.map(x=>`<button class="local-btn ${x.id===branchId?'active':''} ${porLocal(x.id)?'falta':''}" data-branch="${x.id}">${esc(x.name)}<small>${porLocal(x.id)?`faltan ${porLocal(x.id)}`:'completo'}</small></button>`).join('')}</div>
 <button class="accion-grande destacada" data-action="assign" style="margin-top:12px"><span class="ico">＋</span><span><b>Asignar a alguien</b><span>Elegís la persona, el turno, los días y si es para siempre o solo por esta vez</span></span></button>
 <div class="grupo-titulo">${esc(b.name)} · semana completa</div>
 <div class="dias">${DAYS.map((_,d)=>tarjetaDia(b,d)).join('')}</div>
 <div class="grupo-titulo">Para este local</div>
 <div class="ajustes-fila">
  <button class="btn" data-action="settings">Horario de ${esc(b.name)}</button>
  <button class="btn" data-ir="planillas">Bajar la planilla</button>
 </div>
 <div class="aviso info" style="margin-top:14px"><strong>El horario se repite solo</strong>
  No hay semanas que armar ni confirmar: cargás el horario una vez y aparece todas las semanas. Las semanas acá son para <strong>mirar e imprimir</strong>.
  Cuando tocás a alguien, elegís si el cambio es <strong>solo por esta vez</strong> (vuelve sola después) o <strong>de ahora en adelante</strong> (lo anterior queda guardado).</div>`;
}
function pantallaAusencias(){
 if(!supervisor())return '<div class="aviso info">Esta pantalla es de la supervisora.</div>';
 const lista=db.exceptions||[],faltan=faltantes();
 const puntuales=(db.punctual||[]).filter(p=>p.to>=today).slice()
  .sort((a,b)=>a.from<b.from?-1:a.from>b.from?1:0);
 const linea=f=>`${DAYS[f.day]} · ${esc(branch(f.branchId)?.name||'')} · ${horaCorta(f.start)} a ${horaCorta(f.end)}`;
 return `${navegadorSemana()}
 <div class="aviso info"><strong>Tres cosas distintas</strong>
  <strong>Ausencia</strong>: no viene (vacaciones, licencia o falta). <strong>Cambio puntual</strong>: trabaja distinto unos días y después vuelve sola. <strong>Horario de siempre</strong>: se cambia desde Horarios, eligiendo “de ahora en adelante”.</div>
 <div class="grupo-titulo">1 · Anotar que alguien no viene</div>
 <button class="accion-grande destacada" data-action="absences-new"><span class="ico">📅</span><span><b>Registrar ausencia</b><span>Vacaciones, licencia o falta, con fechas y motivo</span></span></button>
 <div class="lista" style="margin-top:12px">${lista.length?lista.map(e=>`<div class="item"><div class="crece"><b>${esc(employee(e.employeeId)?.name||'Empleada')}</b><small>${esc(e.type)} · ${dateLabel(e.from)} al ${dateLabel(e.to)}${e.reason?` · ${esc(e.reason)}`:''}</small></div><div class="acciones"><button class="btn chico danger" data-cancel-absence="${esc(e.id)}">Cancelar</button></div></div>`).join(''):'<div class="aviso info">Todavía no hay ausencias anotadas.</div>'}</div>
 <div class="grupo-titulo">2 · Cambios puntuales en curso</div>
 <div class="lista">${puntuales.length?puntuales.map(p=>`<div class="item"><div class="crece"><b>${esc(employee(p.employeeId)?.name||'Empleada')}</b><small>${dateLabel(p.from)} al ${dateLabel(p.to)} · ${p.filas&&p.filas.length?p.filas.map(linea).join(' · '):'esos días no trabaja'}${p.motivo?` · ${esc(p.motivo)}`:''}</small></div><div class="acciones"><button class="btn chico danger" data-quitar-puntual="${esc(p.id)}">Cancelar</button></div></div>`).join(''):'<div class="aviso info">No hay cambios puntuales anotados. Cada una está en su horario de siempre.</div>'}</div>
 <div class="grupo-titulo">3 · Lugares sin cubrir esta semana</div>
 ${faltan.length?`<div class="lista">${db.branches.map(b=>{
   const suyos=faltan.filter(x=>x.b.id===b.id),total=suyos.reduce((n,x)=>n+x.faltan,0);
   if(!total)return `<div class="item"><div class="crece"><b>${esc(b.name)}</b><small>✓ Cubierto</small></div></div>`;
   return `<div class="item"><div class="crece"><b>${esc(b.name)}</b><small>Faltan ${total} ${total===1?'lugar':'lugares'}</small>
     <details class="dia-distinto" style="margin-top:10px"><summary>Ver qué días</summary>
      <div class="lista" style="margin-top:10px">${suyos.map(x=>`<div class="item"><div class="crece"><b>${DAYS[x.day]}</b><small>${SHIFTS[x.shift]} · faltan ${x.faltan}</small></div><div class="acciones"><button class="btn chico primary" data-add="${x.b.id}|${x.shift}|${x.day}">Asignar</button></div></div>`).join('')}</div>
     </details></div>
    <div class="acciones"><button class="btn chico" data-local="${b.id}">Completar en Horarios</button></div></div>`;
  }).join('')}</div>`
  :'<div class="aviso ok"><strong>Esta semana está cubierta</strong>Todos los turnos tienen la gente que pediste.</div>'}
 <button class="accion-media" data-ir="schedule" style="margin-top:12px"><span class="ico">🗓</span>Ir a Horarios</button>`;
}
function pantallaPlanillas(){
 if(!supervisor())return '<div class="aviso info">Esta pantalla es de la supervisora.</div>';
 return `${navegadorSemana()}
 <div class="aviso info"><strong>Qué sale en la hoja</strong>
  El horario de esa semana, lunes a sábado, mañana y tarde, con los cambios puntuales ya aplicados. Si no hay cambios, sale igual todas las semanas.</div>
 <div class="grupo-titulo">Una hoja con todo</div>
 <button class="accion-grande" data-pdf="cuadrantes"><span class="ico">🗂</span><span><b>Los cuatro locales en una hoja</b><span>A4 horizontal, cuatro cuadrantes</span></span></button>
 <button class="accion-grande" data-pdf="todos"><span class="ico">📄</span><span><b>Una planilla por cada local</b><span>Cuatro hojas en un mismo archivo</span></span></button>
 <div class="grupo-titulo">Un local solo</div>
 <div class="lista">${db.branches.map(b=>`<div class="item"><div class="crece"><b>${esc(b.name)}</b><small>Una hoja entera para este local</small></div><div class="acciones"><button class="btn chico" data-pdf="${b.id}">Bajar</button></div></div>`).join('')}</div>
 <div id="pdf-resultado" style="margin-top:14px"></div>`;
}
/* ---------------- Equipo ---------------- */
function pantallaEquipo(){
 if(!supervisor())return '<div class="aviso info">Esta pantalla es de la supervisora.</div>';
 const activas=db.employees.filter(e=>e.active!==false),bajas=db.employees.filter(e=>e.active===false);
 return `<div class="aviso info"><strong>Las bajas no borran nada</strong>
  Si das de baja a alguien, se le quita el horario de hoy en adelante, pero lo que hizo antes y el historial se conservan. Después la podés reincorporar.</div>
 <button class="accion-grande destacada" data-action="team-add"><span class="ico">＋</span><span><b>Agregar una empleada</b><span>Nombre y apellido</span></span></button>
 <div class="grupo-titulo">En el equipo (${activas.length})</div>
 <div class="lista">${activas.length?activas.map(e=>`<div class="item"><div class="crece"><b>${esc(e.name)}</b><small>${horariosDe(e.id)}</small></div><div class="acciones"><button class="btn chico" data-ficha="${e.id}">Ver su horario</button><button class="btn chico" data-rename="${e.id}">Nombre</button><button class="btn chico danger" data-offboard="${e.id}">Dar de baja</button></div></div>`).join(''):'<div class="aviso atencion"><strong>Todavía no hay nadie</strong>Agregá a las chicas con el botón de arriba.</div>'}</div>
 ${bajas.length?`<div class="grupo-titulo">Dadas de baja (${bajas.length})</div><div class="lista">${bajas.map(e=>`<div class="item"><div class="crece"><b>${esc(e.name)}</b><small>Fuera del equipo. Su horario anterior se conserva.</small></div><div class="acciones"><button class="btn chico" data-ficha="${e.id}">Ver su horario</button><button class="btn chico" data-reactivate="${e.id}">Reincorporar</button></div></div>`).join('')}</div>`:''}
 <div class="grupo-titulo">Accesos de cada una</div>
 ${conectado()?'<button class="accion-grande" data-action="accounts"><span class="ico">🔑</span><span><b>Habilitar accesos</b><span>Elegir el correo de Google de cada empleada</span></span></button>':`<div class="aviso info"><strong>Pendiente de conexión</strong>
  Que cada empleada entre desde su propio teléfono con su usuario necesita la conexión compartida. Por ahora esta app funciona en un teléfono y los horarios se reparten con el PDF.</div>`}
 ${!db.employees.length?'<button class="btn" data-action="import-isis" style="margin-top:10px">Importar el equipo desde una copia de ISIS</button>':''}`;
}
function horariosDe(eid){
 const hoy=H().vigentesDe(db,eid,today).length;
 const etapas=H().etapas(db,eid);
 if(!hoy)return etapas.length?'Sin horario vigente hoy':'Sin horario de siempre todavía';
 const previas=etapas.filter(x=>x.hasta&&x.hasta<today).length;
 return `${hoy} ${hoy===1?'turno':'turnos'} por semana`+(previas?` · ${previas} ${previas===1?'horario anterior guardado':'horarios anteriores guardados'}`:'');
}
/* Su horario de siempre, sus cambios puntuales y las etapas anteriores. */
function fichaEmpleada(eid){
 const e=employee(eid);if(!e||!supervisor())return;
 const vig=H().vigentesDe(db,eid,today).slice().sort((a,b)=>a.day-b.day||String(a.start).localeCompare(String(b.start)));
 const etapas=H().etapas(db,eid),previas=etapas.filter(x=>x.hasta&&x.hasta<today);
 const pun=(db.punctual||[]).filter(p=>p.employeeId===eid&&p.to>=today)
  .sort((a,b)=>a.from<b.from?-1:a.from>b.from?1:0);
 const linea=f=>`${DAYS[f.day]} · ${esc(branch(f.branchId)?.name||'')} · ${horaCorta(f.start)} a ${horaCorta(f.end)}${f.pauseStart?` · corte ${horaCorta(f.pauseStart)} a ${horaCorta(f.pauseEnd)}`:''}`;
 closeSheet();
 openSheet('Horario de '+e.name,
  `<p class="hint">Este es su horario de siempre: se repite solo todas las semanas, sin volver a cargarlo.</p>
   <div class="lista">${vig.length?vig.map(f=>`<div class="item"><div class="crece">${linea(f)}</div></div>`).join(''):'<div class="aviso info">Todavía no tiene horario cargado. Asignale los días desde Horarios.</div>'}</div>
   ${pun.length?`<div class="grupo-titulo">Cambios puntuales</div><div class="lista">${pun.map(p=>`<div class="item"><div class="crece"><b>${dateLabel(p.from)} al ${dateLabel(p.to)}</b><small>${p.filas&&p.filas.length?p.filas.map(linea).join(' · '):'esos días no trabaja'}${p.motivo?` · ${esc(p.motivo)}`:''}</small></div><div class="acciones"><button class="btn chico danger" data-quitar-puntual="${esc(p.id)}">Cancelar</button></div></div>`).join('')}</div><p class="hint">Cuando terminan, vuelve sola a su horario de siempre.</p>`:''}
   ${previas.length?`<div class="grupo-titulo">Horarios anteriores</div><div class="lista">${previas.map(x=>`<div class="item"><div class="crece"><b>${x.desde?dateLabel(x.desde):'Desde el principio'} al ${dateLabel(x.hasta)}</b><small>${x.filas.length} ${x.filas.length===1?'turno':'turnos'} por semana</small></div></div>`).join('')}</div><p class="hint">Se guardan para poder mirar atrás. Las semanas viejas siguen mostrando lo que hacía entonces.</p>`:''}`,
  btn('Cerrar','close'),()=>{});
}

/* ---------------- Copias ---------------- */
function pantallaCopias(){
 if(!supervisor())return '<div class="aviso info">Las copias del equipo las administra la supervisora.</div>';
 if(conectado())return `<div class="aviso info"><strong>Copia de todo el equipo</strong>El horario se guarda compartido. Podés descargar además una copia con las vigencias, cambios, equipo, comunicados y solicitudes.</div><button class="accion-grande destacada" data-action="copia-guardar"><span class="ico">💾</span><span><b>Guardar una copia</b><span>Descargar el respaldo completo</span></span></button><button class="accion-grande" data-action="copia-traer"><span class="ico">📂</span><span><b>Restaurar una copia</b><span>Reemplaza los datos compartidos. Antes conserva una copia del estado anterior y pide confirmación.</span></span></button>`;
 return `<div class="aviso info"><strong>Por qué conviene</strong>
  Los horarios viven en este teléfono. Si se borran los datos del navegador o cambiás de teléfono, se pierden. Guardá una copia cada tanto y guardala donde la tengas a mano.</div>
 <button class="accion-grande destacada" data-action="copia-guardar"><span class="ico">💾</span><span><b>Guardar una copia</b><span>Baja un archivo con el equipo y los horarios</span></span></button>
 <button class="accion-grande" data-action="copia-traer"><span class="ico">📂</span><span><b>Traer una copia</b><span>Reemplaza lo que hay en este teléfono. Pide confirmación antes.</span></span></button>
 ${conectado()?'<button class="btn" data-action="archivar" style="margin-top:12px">Archivar lo más viejo</button>':`<div class="grupo-titulo">Cuando haya conexión</div><div class="aviso info">Archivar lo más viejo y guardar copias en el servidor se habilitan cuando se conecte el sistema entre teléfonos. Hoy no existen.</div>`}`;
}

/* ---------------- Comunicados y solicitudes ---------------- */
function pantallaComunicados(){
 const lista=visibleMessages();
 const estado=conectado()?'':`<div class="aviso info"><strong>Pendiente de conexión</strong>
  Los comunicados se guardan acá, pero <strong>todavía no se envían a otros teléfonos</strong> ni se puede saber de verdad quién los leyó. Cuando se conecte el sistema, esto funciona solo.</div>`;
 return `${estado}
 ${supervisor()?'<button class="accion-grande destacada" data-action="new-message"><span class="ico">📣</span><span><b>Escribir un comunicado</b><span>Para todo Ojos o para un local</span></span></button>':''}
 <div class="lista" style="margin-top:12px">${lista.length?lista.map(m=>`<article class="tarjeta"><div class="item" style="border:0;padding:0;background:transparent"><div class="crece"><b>${esc(m.title)}</b><small>${m.audience==='all'?'Todo Ojos':esc(branch(m.audience)?.name||'')} · ${dateLabel(m.created)}</small></div></div><p class="cuerpo">${esc(m.body)}</p>${supervisor()?`<button class="btn chico" data-readers="${m.id}">Ver a quién le toca</button>`:(m.read.includes(person)?'<span class="estado confirmada">✓ Lo leíste</span>':`<button class="btn chico soft" data-read="${m.id}">Marcar como leído</button>`)}</article>`).join(''):'<div class="aviso info"><strong>Sin comunicados</strong>Los avisos del equipo aparecen acá.</div>'}</div>`;
}
function pantallaSolicitudes(){
 const lista=supervisor()?db.requests:db.requests.filter(r=>r.employeeId===person);
 const estado=conectado()?'':`<div class="aviso info"><strong>Pendiente de conexión</strong>
  Las solicitudes se guardan en este teléfono. Cuando el sistema esté conectado, las chicas las van a poder mandar desde el suyo.</div>`;
 return `${estado}
 ${!supervisor()?'<button class="accion-grande destacada" data-action="new-request"><span class="ico">✋</span><span><b>Pedir un cambio</b><span>Cambiar un horario, un día libre o avisar una falta</span></span></button>':''}
 <div class="aviso info"><strong>Aprobar no cambia el horario solo</strong>
  Cuando aprobás un pedido, después tenés que guardar el cambio en <strong>Horarios</strong>, como puntual o permanente según corresponda. Aprobar el pedido no modifica los horarios automáticamente.</div>
 <div class="lista">${lista.length?lista.map(r=>`<article class="tarjeta"><div class="item" style="border:0;padding:0;background:transparent"><div class="crece"><b>${esc(r.type)}${supervisor()?' · '+esc(employee(r.employeeId)?.name||''):''}</b><small>${dateLabel(r.date)}</small></div><span class="estado ${r.status==='Aprobada'?'confirmada':'borrador'}">${esc(r.status)}</span></div><p class="cuerpo">${esc(r.detail)}</p>${r.note?`<p class="hint">Respuesta: ${esc(r.note)}</p>`:''}${supervisor()&&r.status==='Pendiente'?`<div class="ajustes-fila"><button class="btn chico primary" data-resolve="${r.id}|Aprobada">Aprobar</button><button class="btn chico" data-resolve="${r.id}|No aprobada">No aprobar</button></div>`:''}</article>`).join(''):`<div class="aviso info"><strong>${supervisor()?'No hay pedidos':'Todavía no pediste nada'}</strong>${supervisor()?'Los pedidos del equipo aparecen acá.':'Podés pedir un cambio o avisar una ausencia.'}</div>`}</div>`;
}

/* ---------------- La semana de una empleada (demostración local) ---------------- */
function mySchedula(){
 const mine=week().assignments.filter(a=>a.employeeId===person);
 return `${conectado()?'':`<div class="aviso atencion"><strong>Demostración</strong>
  Estás viendo la app como la vería ${esc(employee(person)?.name||'una empleada')}. No es un acceso con contraseña: es una vista de prueba en este mismo teléfono.</div>`}
 ${navegadorSemana()}
 <div class="aviso ok"><strong>Tu horario</strong>Es el horario que armó la supervisora. Se repite solo todas las semanas; si algún día cambia, lo vas a ver acá.</div>
 <div class="semana-mia">${DAYS.map((d,i)=>{const r=mine.filter(a=>a.day===i);
   return `<div class="mi-dia ${r.length?'':'libre'}"><div class="dayname">${d} ${dateLabel(plus(selectedWeek,i))}</div>${r.length?r.map(a=>`<h3>${esc(branch(a.branchId)?.name||'')}</h3><p>${SHIFTS[a.shift]} · ${horaCorta(a.start)} a ${horaCorta(a.end)}</p>${a.pauseStart?`<p class="hint">Corte: ${horaCorta(a.pauseStart)} a ${horaCorta(a.pauseEnd)}</p>`:''}${a.origen==='puntual'?'<p class="hint">Solo por esta vez.</p>':''}`).join(''):'<h3>Día libre</h3>'}</div>`;}).join('')}</div>
 <div class="ajustes-fila" style="margin-top:14px"><button class="btn" data-ir="messages">📣 Comunicados</button><button class="btn" data-ir="requests">✋ Mis solicitudes</button></div>`;
}

/* ---------------- Render ---------------- */
function render(){
 invalidarSemana();
 if(!TITULOS[tab])tab=supervisor()?'inicio':'schedule';
 const pintar={inicio:pantallaInicio,schedule:pantallaHorarios,absences:pantallaAusencias,
  planillas:pantallaPlanillas,team:pantallaEquipo,copias:pantallaCopias,
  messages:pantallaComunicados,requests:pantallaSolicitudes}[tab];
 $('#content').innerHTML=pintar();
 const [t,sub]=TITULOS[tab];
 $('#titulo-pantalla').textContent=tab==='inicio'?'Ojos':t;
 $('#subtitulo-pantalla').textContent=sub;
 $('#volver').hidden=(tab==='inicio')||!supervisor();
 $('#person').hidden=true;$('#role').hidden=true;
 if($('#pdf-resultado'))pintarEleccionPDF();
};
$('#volver').onclick=()=>nav('inicio');

/* ---------------- Acciones nuevas ---------------- */
function pintarEleccionPDF(){}
function bajarPlanilla(formato){
 try{
  const datos=datosPDF(formato),r=root.ISIS_PDF.build(datos),nombre=nombrePDF(formato);
  r.doc.save(nombre);
  anexoPendiente=r.groups&&r.groups.length?{datos,groups:r.groups}:null;
  const caja=$('#pdf-resultado');
  if(caja)caja.innerHTML=anexoPendiente
   ?`<div class="aviso atencion"><strong>Listo: ${esc(nombre)}</strong>Quedaron ${r.plan.details} horarios propios o cortes fuera de la planilla. Bajá el anexo para tenerlos completos.<div class="ajustes-fila" style="margin-top:10px"><button class="btn" data-action="anexo">Bajar el anexo</button></div></div>`
   :`<div class="aviso ok"><strong>Listo: ${esc(nombre)}</strong>Entró todo en la planilla, no hace falta anexo.</div>`;
 }catch(e){toast(e.message);}
}
document.addEventListener('click',e=>{
 const el=e.target.closest('button');if(!el)return;
 if(el.dataset.ir){nav(el.dataset.ir);return;}
 if(el.dataset.local){branchId=el.dataset.local;nav('schedule');return;}
 if(el.dataset.ficha){fichaEmpleada(el.dataset.ficha);return;}
 if(el.dataset.quitarPuntual){quitarPuntual(el.dataset.quitarPuntual);return;}
 if(el.dataset.pdf){bajarPlanilla(el.dataset.pdf);return;}
 const extra={
  'absences-new':()=>absenceEditor(),
  'team-add':()=>agregarEmpleada(),
  'copia-guardar':()=>root.OJOS_COPIA&&root.OJOS_COPIA.guardar(),
  'copia-traer':()=>root.OJOS_COPIA&&root.OJOS_COPIA.traer(),
  'archivar':()=>archivar(),
  'anexo':()=>bajarAnexo(),
  'import-isis':()=>importISIS()
 };
 if(extra[el.dataset.action]){extra[el.dataset.action]();return;}
 if(el.dataset.reactivate){const p=employee(el.dataset.reactivate);if(p){p.active=true;save('Empleada reincorporada. Revisá su horario y asignale los días.');}return;}
 if(el.dataset.offboard){offboard(el.dataset.offboard);return;}
 if(el.dataset.rename){rename(el.dataset.rename);return;}
 if(el.dataset.cancelAbsence){cancelarAusencia(el.dataset.cancelAbsence);return;}
});
function cancelarAusencia(aid){
 const a=(db.exceptions||[]).find(x=>x.id===aid);if(!a||!supervisor())return;
 openSheet('Cancelar la ausencia',
  `<p>Se borra la ausencia de <strong>${esc(employee(a.employeeId)?.name||'')}</strong> del ${dateLabel(a.from)} al ${dateLabel(a.to)}.</p>
   <p class="hint">Se vuelve a aplicar el horario que le corresponde en esas fechas. Si otra persona la estaba cubriendo, revisá ese reemplazo.</p>`,
  `<button type="button" class="btn" data-action="close">Volver</button><button class="btn danger" type="submit">Cancelar la ausencia</button>`,
  ()=>{db.exceptions=db.exceptions.filter(x=>x.id!==aid);closeSheet();
   save('Ausencia cancelada. Revisá si hay un reemplazo que acomodar.');});
}
function agregarEmpleada(){
 if(!supervisor())return;
 openSheet('Agregar una empleada',
  '<div class="field"><label for="nueva-persona">Nombre y apellido</label><input id="nueva-persona" maxlength="65" placeholder="Por ejemplo: Ana Gómez" required></div><p class="hint">Después le armás el horario desde Horarios.</p>',
  '<button type="button" class="btn" data-action="close">Cancelar</button><button class="btn primary" type="submit">Agregar</button>',
  ()=>{const name=$('#nueva-persona').value.trim();
   if(!name)return 'Escribí el nombre.';
   if(db.employees.some(e=>e.name.toLowerCase()===name.toLowerCase()))return 'Ya hay alguien con ese nombre en el equipo.';
   db.employees.push({id:id(),name,active:true});closeSheet();save('Empleada agregada.');});
}

function quitarPuntual(pid){
 const p=(db.punctual||[]).find(x=>x.id===pid);if(!p||!supervisor())return;
 closeSheet();
 openSheet('Cancelar el cambio puntual',
  `<p>Se borra el cambio de <strong>${esc(employee(p.employeeId)?.name||'')}</strong> del ${dateLabel(p.from)} al ${dateLabel(p.to)}.</p>
   <p class="hint">Esos días vuelven a su horario de siempre.</p>`,
  `<button type="button" class="btn" data-action="close">Volver</button><button class="btn danger" type="submit">Cancelar el cambio</button>`,
  ()=>{const r=H().quitarPuntual(db,pid);if(r.error)return r.error;db=r.state;
   log('Se canceló un cambio puntual de '+(employee(p.employeeId)?.name||''));
   closeSheet();save('Cambio cancelado. Vuelve a su horario de siempre.');});
}
root.Ojos={version:'2.0.0-horario-unico',replace(next,newUser){db=root.OJOS_HORARIOS.migrar(next);if(newUser){view=newUser.role;person=newUser.employeeId;tab=newUser.role==='supervisor'?'inicio':'schedule';branchId=db.branches[0].id;}if(!saving)render();},lock(){db=null;$('#sheet').close();$('#content').innerHTML='';}};
render();
})(globalThis);

