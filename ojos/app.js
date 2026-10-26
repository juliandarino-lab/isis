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
let db=root.ISIS_SESSION.state();
const today=iso(new Date());let selectedWeek=monday(today);if(new Date(today+'T12:00:00').getDay()===0)selectedWeek=plus(selectedWeek,7);
let view=root.ISIS_SESSION.user.role,person=root.ISIS_SESSION.user.employeeId,tab='schedule',branchId=db.branches[0].id,day=0,submitSheet=null,timer,saving=false;
const supervisor=()=>view==='supervisor';
const employee=eid=>db.employees.find(e=>e.id===eid);
const branch=bid=>db.branches.find(b=>b.id===bid);
const dateLabel=(v,options={day:'numeric',month:'short'})=>new Date(v+'T12:00:00').toLocaleDateString('es-AR',options);
const period=w=>`${dateLabel(w)} al ${dateLabel(plus(w,5),{day:'numeric',month:'long'})}`;
function absent(eid,date){return (db.exceptions||[]).find(e=>e.employeeId===eid&&date>=e.from&&date<=e.to);}
const avisos={};
function espacio(){const l=root.ISIS_SESSION&&root.ISIS_SESSION.limits&&root.ISIS_SESSION.limits();
 if(!l||!l.warn)return '';
 return `<div class="warning-card"><strong>Conviene archivar semanas viejas</strong><p class="hint">Hay ${l.weeks} semanas guardadas de ${l.maxWeeks} y la base ocupa ${Math.round(l.bytes/1024)} KB de ${Math.round(l.maxBytes/1024)} KB. Entrá a <strong>Equipo → Respaldo → Archivar semanas viejas</strong>: primero se descarga la copia y después se libera lugar. Si se llega al tope, no se pueden guardar más cambios.</p></div>`;}
function week(){if(!db.weeks[selectedWeek]){const r=root.OJOS_HORARIOS.resolve(db,selectedWeek);db.weeks[selectedWeek]={assignments:r.assignments,published:null,dirty:true};if(r.conflicts.length)avisos[selectedWeek]=r.conflicts;}return db.weeks[selectedWeek];}
function rows(){return supervisor()?week().assignments:(week().published?.assignments||[]);}
async function save(message){if(saving){db=root.ISIS_SESSION.state();if(db)render();return toast('Esperá a que termine de guardarse.');}saving=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{db=await root.ISIS_SESSION.save(structuredClone(db));if(message)toast(message);}catch(e){db=root.ISIS_SESSION.state();toast(e.message);}finally{saving=false;if(db)render();document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
function log(text){db.history.unshift({date:new Date().toISOString(),text});db.history=db.history.slice(0,200);}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('#toast').hidden=true,4500);}
function openSheet(title,body,actions,fn){$('#sheet-title').textContent=title;$('#sheet-body').innerHTML=body;$('#sheet-actions').innerHTML=actions;$('#form-error').textContent='';submitSheet=fn;$('#sheet').showModal();}
function closeSheet(){$('#sheet').close();submitSheet=null;}
const btn=(text,action,style='')=>`<button type="button" class="btn ${style}" data-action="${action}">${text}</button>`;
const options=(list,selected)=>list.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('');
function editor(existing,defaults={}){
 if(!supervisor())return;
 const b=branch(existing?.branchId||defaults.branchId||branchId),shift=existing?.shift||defaults.shift||'morning';
 const t=turnoDe(b,shift,defaults.day!==undefined?defaults.day:day);
 const active=db.employees.filter(e=>e.active!==false);
 openSheet(existing?'Cambiar horario':'Asignar horario',`
 <div class="field"><label for="assign-person">¿Quién trabaja?</label><select id="assign-person" required><option value="">Elegir empleada</option>${options(active,existing?.employeeId)}</select></div>
 <div class="fields-row"><div class="field"><label for="assign-branch">Local</label><select id="assign-branch">${options(db.branches,b.id)}</select></div><div class="field"><label for="assign-shift">Turno</label><select id="assign-shift">${Object.entries(SHIFTS).map(([k,v])=>`<option value="${k}" ${k===shift?'selected':''}>${v}</option>`).join('')}</select></div></div>
 <div class="field"><label>${existing?'Día':'¿Qué días?'}</label><div class="days-checks">${DAYS.map((n,i)=>`<label><input type="checkbox" name="assign-day" value="${i}" ${(existing?i===existing.day:defaults.day===undefined||i===defaults.day)?'checked':''} ${existing?'disabled':''}>${n.slice(0,3)}</label>`).join('')}</div></div>
 <div class="fields-row"><div class="field"><label for="assign-start">Entrada</label><input type="time" id="assign-start" value="${esc(existing?.start||t.start)}" required></div><div class="field"><label for="assign-end">Salida</label><input type="time" id="assign-end" value="${esc(existing?.end||t.end)}" required></div></div>
 <p class="hint">Se comprueba que no esté en otro local ni tenga horarios superpuestos.</p>`,
 `${existing?'<button type="button" class="btn danger" id="remove-assignment">Quitar de este día</button>':''}<button type="button" class="btn" data-action="close">Cancelar</button><button class="btn primary" type="submit">Guardar horario</button>`,()=>{
  const days=existing?[existing.day]:[...document.querySelectorAll('[name="assign-day"]:checked')].map(x=>+x.value);if(!days.length)return 'Elegí al menos un día.';
  const copy=week().assignments.filter(a=>a.id!==existing?.id);
  for(const d of days){const a={id:existing?.id||id(),employeeId:$('#assign-person').value,branchId:$('#assign-branch').value,shift:$('#assign-shift').value,day:d,start:$('#assign-start').value,end:$('#assign-end').value,pauseStart:$('#assign-pause-start')?.value||null,pauseEnd:$('#assign-pause-end')?.value||null};if(absent(a.employeeId,plus(selectedWeek,d)))return DAYS[d]+': esa empleada tiene una ausencia registrada.';const error=validate(db,copy,a);if(error)return DAYS[d]+': '+error;copy.push(a);}
  week().assignments=copy;week().dirty=true;log(`Horario de ${$('#assign-person').selectedOptions[0].text} actualizado en ${b.name}`);closeSheet();save('Horario guardado en el borrador.');
 });
 const defaultHours=()=>{const b2=branch($('#assign-branch').value),s=$('#assign-shift').value;$('#assign-start').value=b2[s].start;$('#assign-end').value=b2[s].end;};$('#assign-branch').onchange=defaultHours;$('#assign-shift').onchange=defaultHours;
 if(existing)$('#remove-assignment').onclick=()=>{week().assignments=week().assignments.filter(a=>a.id!==existing.id);week().dirty=true;log(`Se quitó un horario de ${employee(existing.employeeId)?.name}`);closeSheet();save('Horario quitado del borrador.');};
}
function coverage(){let empty=0;for(const b of db.branches)for(const shift of Object.keys(SHIFTS))for(let d=0;d<6;d++)empty+=Math.max(0,turnoDe(b,shift,d).slots-week().assignments.filter(a=>a.branchId===b.id&&a.day===d&&a.shift===shift).length);return empty;}
function schedule(){
 if(!supervisor())return mySchedule();const w=week(),b=branch(branchId),empty=coverage();
 return `<div class="page-title"><div><h1>La semana, en orden.</h1><p class="sub">Organizá Ojos en los cuatro locales. Cada una verá su horario publicado.</p></div><div class="actions">${btn('+ Asignar horario','assign','primary')}${btn('PDF e imprimir','pdf')}${btn('Equipo','team')}</div></div>
 <div class="toolbar"><div class="week-picker"><button data-action="prev" aria-label="Semana anterior">‹</button><input id="week" type="date" value="${selectedWeek}" aria-label="Semana"><button data-action="next" aria-label="Semana siguiente">›</button><strong class="small-muted">${period(selectedWeek)}</strong></div><div class="week-status"><span class="status ${w.dirty||!w.published?'draft':'published'}">${w.dirty||!w.published?'● Borrador':'✓ Publicada'}</span>${btn(w.published?'Publicar cambios':'Publicar semana','publish','small soft')}</div></div>
 <div class="toolbar"><div class="branch-tabs">${db.branches.map(b=>`<button class="branch-button ${b.id===branchId?'active':''}" data-branch="${b.id}">${esc(b.name)}</button>`).join('')}</div></div>
 ${espacio()}
 ${(avisos[selectedWeek]||[]).length?`<div class="warning-card"><strong>Revisá estos días antes de publicar</strong><p class="hint">Al armar la semana con el horario habitual quedaron casos que no se pudieron ubicar solos. Nada se perdió: agregá vos el horario que corresponda.</p><ul class="hint">${avisos[selectedWeek].map(c=>`<li>${esc(c.text)}</li>`).join('')}</ul></div>`:''}
 <div class="schedule-card"><div class="card-heading"><div><h2>${esc(b.name)}</h2><p class="sub">${DAYS[day]}: ${turnoDe(b,'morning',day).slots} ${turnoDe(b,'morning',day).slots===1?'persona':'personas'} a la mañana · ${turnoDe(b,'afternoon',day).slots} a la tarde</p></div><span class="branch-tag">${db.branches.indexOf(b)+1}</span></div>
 <div class="day-tabs">${DAYS.map((d,i)=>`<button class="day-button ${day===i?'active':''}" data-day="${i}">${d.slice(0,3)}<small>${new Date(plus(selectedWeek,i)+'T12:00:00').getDate()}</small></button>`).join('')}</div>
 <div class="roster"><div class="corner"></div>${DAYS.map((d,i)=>`<div class="day-head">${d}<span>${dateLabel(plus(selectedWeek,i))}</span>${Object.keys(SHIFTS).some(s=>turnoDe(b,s,i).propio)?`<span class="dia-propio">${horaCorta(turnoDe(b,'morning',i).start)}–${horaCorta(turnoDe(b,'afternoon',i).end)}</span>`:''}</div>`).join('')}${Object.entries(SHIFTS).map(([s,name])=>`<div class="row-label">${name}<small>${horaCorta(turnoDe(b,s,day).start)}–${horaCorta(turnoDe(b,s,day).end)}</small></div>${DAYS.map((_,d)=>{
 const people=w.assignments.filter(a=>a.branchId===b.id&&a.day===d&&a.shift===s);
 return `<div class="cell ${day===d?'current-day':''}" data-day="${d}">${people.map(a=>`<button class="assignment" data-edit="${a.id}"><strong>${esc(employee(a.employeeId)?.name||'Empleada')}</strong><small>${a.start} a ${a.end}</small></button>`).join('')}${Array.from({length:Math.max(0,turnoDe(b,s,d).slots-people.length)},()=>`<button class="empty-slot" data-add="${b.id}|${s}|${d}">+ Asignar</button>`).join('')}</div>`;
 }).join('')}`).join('')}</div><div class="schedule-bottom"><button class="text-button" data-action="copy">Copiar la semana anterior</button><button class="text-button" data-action="settings">Cambiar el horario de este local</button><button class="text-button" data-action="history">Ver cambios</button></div></div>
 <div class="below-grid"><div class="mini-card"><div><strong>${empty?'Lugares por cubrir':'Todos los turnos cubiertos'}</strong><p>${empty?'En los cuatro locales de esta semana.':'Listo para revisar y publicar.'}</p></div><span class="pill-number">${empty||'✓'}</span></div><div class="mini-card"><div><strong>Una sola planilla</strong><p>Los cuatro locales, en cuatro cuadrantes.</p></div><button class="text-button" data-action="pdf">Descargar PDF</button></div></div>`;
}
function mySchedule(){const w=week(),mine=(w.published?.assignments||[]).filter(a=>a.employeeId===person);return `<div class="page-title"><div><h1>Tu semana.</h1><p class="sub">${esc(employee(person)?.name)} · ${period(selectedWeek)}</p></div>${btn('Solicitar un cambio','new-request','primary')}</div><div class="toolbar"><div class="week-picker"><button data-action="prev" aria-label="Semana anterior">‹</button><input id="week" type="date" value="${selectedWeek}" aria-label="Semana"><button data-action="next" aria-label="Semana siguiente">›</button></div></div>${!w.published?'<div class="empty"><strong>Tu semana todavía no está publicada</strong>Cuando la supervisora la confirme, tus horarios aparecerán acá.</div>':`<div class="employee-banner">✓ Estos son tus horarios confirmados por la supervisora.</div><div class="employee-week">${DAYS.map((d,i)=>{const r=mine.filter(a=>a.day===i);return `<div class="my-day ${r.length?'':'free'}"><div class="dayname">${d} ${dateLabel(plus(selectedWeek,i))}</div>${r.length?r.map(a=>`<h3>${esc(branch(a.branchId).name)}</h3><p>${SHIFTS[a.shift]} · ${a.start} a ${a.end}</p>${a.pauseStart?`<p class="pause-info">Pausa: ${a.pauseStart} a ${a.pauseEnd}</p>`:''}`).join(''):'<h3>Sin horario asignado</h3>'}</div>`;}).join('')}</div>`}`;}
function visibleMessages(){return db.messages;}
function recipients(m){if(Array.isArray(m.recipients))return db.employees.filter(e=>m.recipients.includes(e.id));if(m.audience==='all')return db.employees.filter(e=>e.active!==false);const ids=new Set(week().assignments.filter(a=>a.branchId===m.audience).map(a=>a.employeeId));return db.employees.filter(e=>ids.has(e.id)&&e.active!==false);}
function messages(){return `<div class="page-title"><div><h1>Para estar al tanto.</h1><p class="sub">Avisos del equipo, juntos en un lugar.</p></div>${supervisor()?btn('+ Nuevo comunicado','new-message','primary'):''}</div><div class="cards">${visibleMessages().map(m=>`<article class="message-card"><div class="message-meta"><span class="audience">${m.audience==='all'?'Todo Ojos':esc(branch(m.audience)?.name)}</span>${dateLabel(m.created)}</div><h2>${esc(m.title)}</h2><p class="message-body">${esc(m.body)}</p><div class="message-foot">${supervisor()?`<button class="text-button" data-readers="${m.id}">${m.read.filter(x=>recipients(m).some(e=>e.id===x)).length} de ${recipients(m).length} confirmaron lectura</button>`:m.read.includes(person)?'<span class="status published">✓ Leído</span>':`<button class="btn soft small" data-read="${m.id}">Marcar como leído</button>`}</div></article>`).join('')||'<div class="empty"><strong>Sin comunicados</strong>Los avisos del equipo aparecerán acá.</div>'}</div>`;}
function requests(){const list=supervisor()?db.requests:db.requests.filter(r=>r.employeeId===person);return `<div class="page-title"><div><h1>${supervisor()?'Lo que necesita el equipo.':'Tus solicitudes.'}</h1><p class="sub">Cambios de horario, días libres y avisos de ausencia.</p></div>${!supervisor()?btn('+ Nueva solicitud','new-request','primary'):''}</div><div class="cards">${list.map(r=>`<article class="request-card"><div class="message-meta"><span class="status ${r.status==='Aprobada'?'published':'draft'}">${esc(r.status)}</span>${dateLabel(r.date)}</div><h2>${esc(r.type)}${supervisor()?' · '+esc(employee(r.employeeId)?.name):''}</h2><p class="request-detail">${esc(r.detail)}</p>${r.note?`<p class="hint">Respuesta: ${esc(r.note)}</p>`:''}${supervisor()&&r.status==='Pendiente'?`<div class="actions"><button class="btn primary small" data-resolve="${r.id}|Aprobada">Aprobar</button><button class="btn small" data-resolve="${r.id}|No aprobada">No aprobar</button></div>`:''}</article>`).join('')||`<div class="empty"><strong>${supervisor()?'Todo al día':'Todavía no hiciste solicitudes'}</strong>${supervisor()?'Las solicitudes del equipo aparecerán acá.':'Podés pedir un cambio o avisar una ausencia.'}</div>`}</div>`;}
function render(){const content=tab==='schedule'?schedule():tab==='messages'?messages():requests();$('#content').innerHTML=content;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));$('#person').hidden=supervisor();$('#person').innerHTML=options(db.employees.filter(e=>e.active!==false),person);const unread=supervisor()?0:visibleMessages().filter(m=>!m.read.includes(person)).length;$('#unread').textContent=unread;$('#unread').hidden=!unread;const pending=db.requests.filter(r=>r.status==='Pendiente'&&(supervisor()||r.employeeId===person)).length;$('#pending').textContent=pending;$('#pending').hidden=!pending;if($('#week'))$('#week').onchange=e=>{if(e.target.value){selectedWeek=monday(e.target.value);render();}};}
function publish(){if(!supervisor())return;const empty=coverage();openSheet('Publicar esta semana',`<p class="sub">Del ${period(selectedWeek)}.</p><div class="publish-summary">${week().assignments.length} asignaciones en los cuatro locales.<br>${empty?`Quedan <strong>${empty} lugares sin cubrir</strong>. Podés publicar y completarlos después.`:'Todos los turnos están cubiertos.'}</div><p class="hint">En este boceto podés ver el resultado cambiando a la vista de Empleada. Todavía no se envía a otros teléfonos.</p>`,`<button type="button" class="btn" data-action="close">Volver</button><button class="btn primary" type="submit">Confirmar publicación</button>`,()=>{week().published={at:new Date().toISOString(),assignments:structuredClone(week().assignments)};week().dirty=false;db.base=structuredClone(week().assignments);log('Semana '+selectedWeek+' publicada');closeSheet();save('Semana publicada en la vista de prueba.');});}
function copyPrevious(){const prev=db.weeks[plus(selectedWeek,-7)];if(!prev)return toast('Todavía no hay una semana anterior guardada. Al abrir una semana nueva se repite el horario habitual.');openSheet('Copiar la semana anterior',`<p>Se reemplazará el borrador de esta semana por los horarios del ${period(plus(selectedWeek,-7))}.</p>`,`<button type="button" class="btn" data-action="close">Cancelar</button><button class="btn primary" type="submit">Copiar horarios</button>`,()=>{week().assignments=structuredClone(prev.published?.assignments||prev.assignments).map(a=>({...a,id:id()}));week().dirty=true;log('Se copió la semana anterior a '+selectedWeek);closeSheet();save('Horarios copiados al borrador.');});}
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
function showReaders(mid){const m=db.messages.find(x=>x.id===mid);if(!supervisor()||!m)return;openSheet('Lectura del comunicado',`<h3>${esc(m.title)}</h3><div class="employee-list">${recipients(m).map(e=>`<div class="employee-row"><span>${esc(e.name)}</span><span>${m.read.includes(e.id)?'✓ Leído':'Pendiente'}</span></div>`).join('')}</div>`,btn('Cerrar','close'),()=>{});}
function history(){if(!supervisor())return;openSheet('Últimos cambios',db.history.length?db.history.slice(0,20).map(h=>`<p class="hint">${new Date(h.date).toLocaleString('es-AR')}<br>${esc(h.text)}</p>`).join(''):'<p class="hint">Los cambios de horario y publicaciones aparecerán acá.</p>',btn('Cerrar','close'),()=>{});}
let anexoPendiente=null;
function datosPDF(published,formato){
 const w=week(),assignments=published?(w.published?.assignments||[]):w.assignments;
 const confirmed=published||(!w.dirty&&!!w.published);
 return {jsPDF:root.jspdf&&root.jspdf.jsPDF,branches:db.branches,employees:db.employees,assignments,
  periodLabel:period(selectedWeek),mode:confirmed?'SEMANA PUBLICADA':'BORRADOR',
  dayNumbers:DAYS.map((_,i)=>new Date(plus(selectedWeek,i)+'T12:00:00').getDate()),
  layout:formato==='cuadrantes'?'cuadrantes':'porLocal',
  branchIds:(formato==='cuadrantes'||formato==='todos')?null:[formato]};
}
function nombrePDF(formato){
 if(formato==='cuadrantes')return 'ISIS Ojos - los cuatro locales '+selectedWeek+'.pdf';
 if(formato==='todos')return 'ISIS Ojos - planillas por local '+selectedWeek+'.pdf';
 return 'ISIS Ojos - '+(branch(formato)?.name||'local')+' '+selectedWeek+'.pdf';
}
function buildPDF(published=false,formato='cuadrantes'){
 if(!root.ISIS_PDF)throw Error('No se pudo cargar la herramienta de PDF. Volvé a abrir la página.');
 return root.ISIS_PDF.build(datosPDF(published,formato));
}
function pdfOptions(){
 if(!supervisor())return;
 const published=week().published;
 openSheet('Las planillas en PDF',
  '<div class="field"><label for="pdf-formato">¿Qué planilla querés?</label><select id="pdf-formato">'+
   '<option value="cuadrantes">Los cuatro locales en una sola hoja</option>'+
   '<option value="todos">Una planilla por cada local (4 hojas)</option>'+
   db.branches.map(b=>'<option value="'+b.id+'">Solo '+esc(b.name)+'</option>').join('')+
  '</select></div>'+
  '<div class="field"><label for="pdf-version">¿Qué horarios?</label><select id="pdf-version">'+
   '<option value="draft">El borrador que estoy viendo</option>'+
   (published?'<option value="published">La última semana publicada</option>':'')+
  '</select></div>'+
  '<p class="hint">Del '+period(selectedWeek)+'. Lunes a sábado, mañana y tarde. El borrador se identifica en la hoja para no confundirlo con la semana confirmada.</p>'+
  '<p class="hint" id="pdf-estado"></p>',
  '<button type="button" class="btn" data-action="close">Cerrar</button>'+
  '<button type="button" class="btn" id="pdf-anexo" hidden>Bajar el anexo</button>'+
  '<button type="button" class="btn" id="print-pdf">Imprimir</button>'+
  '<button class="btn primary" type="submit">Descargar PDF</button>',
  ()=>{salidaPDF(false);});
 $('#print-pdf').onclick=()=>salidaPDF(true);
 $('#pdf-anexo').onclick=()=>bajarAnexo();
}
function salidaPDF(print){
 try{
  const formato=$('#pdf-formato')?.value||'cuadrantes',published=$('#pdf-version')?.value==='published';
  const datos=datosPDF(published,formato),r=root.ISIS_PDF.build(datos),nombre=nombrePDF(formato);
  if(print){
   r.doc.autoPrint();const url=r.doc.output('bloburl');
   if(!window.open(url,'_blank')){r.doc.save(nombre);toast('Se descargó el PDF. Podés imprimirlo al abrirlo.');}
   else toast('Planilla abierta para imprimir.');
  }else{r.doc.save(nombre);}
  anexoPendiente=r.groups&&r.groups.length?{datos,groups:r.groups}:null;
  const estado=$('#pdf-estado'),boton=$('#pdf-anexo');
  if(estado)estado.textContent=anexoPendiente
   ?'Listo: '+nombre+'. Quedaron '+r.plan.details+' horarios propios o pausas fuera de la planilla; bajá el anexo para tenerlos completos.'
   :'Listo: '+nombre+'. Entró todo en la planilla, no hace falta anexo.';
  if(boton)boton.hidden=!anexoPendiente;
 }catch(e){toast(e.message);}
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
function downloadPDF(print){salidaPDF(print);}
$('#role').onchange=e=>{view=e.target.value;render();};$('#person').onchange=e=>{person=e.target.value;render();};$('#close-sheet').onclick=closeSheet;
$('#sheet-form').onsubmit=e=>{e.preventDefault();if(submitSheet){const error=submitSheet();if(error)$('#form-error').textContent=error;}};
document.addEventListener('click',e=>{const el=e.target.closest('button');if(!el)return;
 if(el.dataset.tab){tab=el.dataset.tab;render();return;}if(el.dataset.branch){branchId=el.dataset.branch;render();return;}if(el.dataset.day!==undefined){day=+el.dataset.day;render();return;}
 if(el.dataset.edit){const a=week().assignments.find(a=>a.id===el.dataset.edit);if(a)editor(a);return;}
 if(el.dataset.add){const [branchId,shift,day]=el.dataset.add.split('|');editor(null,{branchId,shift,day:+day});return;}
 if(el.dataset.read){const m=db.messages.find(m=>m.id===el.dataset.read);if(m&&!supervisor()&&visibleMessages().includes(m)&&!m.read.includes(person)){m.read.push(person);save('Lectura confirmada.');}return;}
 if(el.dataset.readers){showReaders(el.dataset.readers);return;}if(el.dataset.resolve){resolveRequest(...el.dataset.resolve.split('|'));return;}
 const actions={assign:()=>editor(),pdf:pdfOptions,publish,copy:copyPrevious,settings,team,history,'new-message':newMessage,'new-request':newRequest,close:closeSheet,prev:()=>{selectedWeek=plus(selectedWeek,-7);render();},next:()=>{selectedWeek=plus(selectedWeek,7);render();}};
 if(actions[el.dataset.action])actions[el.dataset.action]();
});
// Mismo recorrido de horarios, ahora respaldado por identidad y datos del servidor.
const originalSchedule=schedule;
schedule=function(){return originalSchedule().replace('Copiar la semana anterior</button>','Copiar la semana anterior</button><button class="text-button" data-action="habitual">Guardar como horario habitual</button>');};
const originalTeam=team;
team=function(){if(!supervisor())return;originalTeam();const body=$('#sheet-body');body.innerHTML=`<div class="actions team-tools">${btn('Accesos','accounts')}${btn('Ausencias y licencias','absences')}${btn('Respaldo','backup')}</div><p class="hint">Agregá las empleadas y habilitá su usuario desde Accesos.</p><div class="employee-list">${db.employees.filter(e=>e.active!==false).map(e=>`<div class="employee-row"><span>${esc(e.name)}</span><div class="actions"><button class="text-button" type="button" data-rename="${e.id}">Nombre</button><button class="text-button" type="button" data-offboard="${e.id}">Dar de baja</button></div></div>`).join('')||'<p class="hint">Todavía no hay empleadas cargadas.</p>'}</div>${db.employees.some(e=>e.active===false)?`<details><summary class="hint">Empleadas dadas de baja</summary>${db.employees.filter(e=>e.active===false).map(e=>`<div class="employee-row"><span>${esc(e.name)}</span><button type="button" class="text-button" data-reactivate="${e.id}">Reincorporar</button></div>`).join('')}</details>`:''}<div class="field"><label for="new-person">Agregar una empleada</label><input id="new-person" maxlength="65" placeholder="Nombre y apellido"></div>`;document.querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>rename(b.dataset.rename));document.querySelectorAll('[data-offboard]').forEach(b=>b.onclick=()=>offboard(b.dataset.offboard));document.querySelectorAll('[data-reactivate]').forEach(b=>b.onclick=()=>{employee(b.dataset.reactivate).active=true;closeSheet();save('Empleada reincorporada. Revisá su horario y habilitá su acceso.');});if(!db.employees.length){const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Importar equipo desde ISIS';button.onclick=importISIS;$('#sheet-actions').prepend(button);}};
function offboard(eid){const e=employee(eid);closeSheet();openSheet('Dar de baja a '+e.name,`<p>Se impedirá su ingreso y se quitarán sus horarios del habitual y de los borradores. Los horarios ya publicados y el historial se conservan.</p><p class="hint">Después revisá la cobertura y publicá los cambios necesarios.</p>`,`<button class="btn" type="button" data-action="close">Volver</button><button class="btn danger" type="submit">Confirmar baja</button>`,()=>{e.active=false;db.base=db.base.filter(a=>a.employeeId!==eid);for(const w of Object.values(db.weeks)){const count=w.assignments.length;w.assignments=w.assignments.filter(a=>a.employeeId!==eid);if(count!==w.assignments.length)w.dirty=true;}log('Baja de '+e.name);closeSheet();save('Baja guardada. El historial se conserva.');});}
function backup(){if(!supervisor())return;closeSheet();openSheet('Respaldo de Ojos',`<p>Guardá una copia de horarios, equipo, avisos y solicitudes. La copia no incluye PIN ni sesiones.</p><p class="hint">Conservala en un lugar privado. Al restaurar se guarda además una copia previa en el servidor.</p>`,`<button class="btn" type="button" data-action="close">Cerrar</button><button class="btn" type="button" id="archive-weeks">Archivar semanas viejas</button><button class="btn" type="button" id="restore-backup">Restaurar copia</button><button class="btn primary" type="button" id="download-backup">Descargar copia</button>`,()=>{});$('#download-backup').onclick=async()=>{try{const data=await root.ISIS_SESSION.request('/backup'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='ISIS Ojos - respaldo '+today+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Copia descargada.');}catch(e){toast(e.message);}};$('#archive-weeks').onclick=()=>archivar();$('#restore-backup').onclick=()=>{const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{const file=input.files[0];if(file.size>900000)throw Error('El archivo es demasiado grande para un respaldo de Ojos.');const data=JSON.parse(await file.text());if(data.kind!=='isis-ojos-backup'||data.version!==1||data.state?.schema!==2)throw Error('Elegí un respaldo descargado desde ISIS Ojos.');closeSheet();openSheet('Revisar restauración',`<p>Se reemplazarán los horarios, equipo, avisos y solicitudes actuales por la copia del ${esc(new Date(data.createdAt).toLocaleString('es-AR'))}.</p><p class="hint">Los accesos y PIN no se reemplazan. El servidor conservará una copia del estado anterior.</p><label class="hint"><input type="checkbox" id="restore-confirm" required> Revisé la copia y quiero reemplazar los datos actuales.</label>`,`<button class="btn" type="button" data-action="close">Cancelar</button><button class="btn danger" type="submit">Restaurar esta copia</button>`,()=>{if(!$('#restore-confirm').checked)return 'Confirmá que revisaste la copia.';$('#sheet-actions button[type="submit"]').disabled=true;root.ISIS_SESSION.restore(data).then(()=>{closeSheet();toast('Copia restaurada.');}).catch(e=>{$('#form-error').textContent=e.message;$('#sheet-actions button[type="submit"]').disabled=false;});});}catch(e){toast(e.message);}};input.click();};}
function archivar(){if(!supervisor())return;const l=root.ISIS_SESSION.limits&&root.ISIS_SESSION.limits();
 const corte=plus(monday(today),-7*26);
 closeSheet();openSheet('Archivar semanas viejas',`<p>Se quitan de la app las semanas terminadas antes de la fecha que elijas. Antes se guarda una copia completa en el servidor, y conviene que además descargues la tuya.</p>${l?`<p class="hint">Hoy hay ${l.weeks} semanas guardadas y la base ocupa ${Math.round(l.bytes/1024)} KB de ${Math.round(l.maxBytes/1024)} KB.</p>`:''}<div class="field"><label for="archive-before">Archivar todo lo anterior a</label><input type="date" id="archive-before" value="${corte}" required></div><label class="hint"><input type="checkbox" id="archive-confirm" required> Ya descargué la copia y quiero liberar lugar.</label>`,
 `<button class="btn" type="button" data-action="close">Cancelar</button><button class="btn danger" type="submit">Archivar</button>`,()=>{
  if(!$('#archive-confirm').checked)return 'Confirmá que descargaste la copia.';
  const before=$('#archive-before').value;if(!before)return 'Elegí una fecha.';
  $('#sheet-actions button[type="submit"]').disabled=true;
  root.ISIS_SESSION.archive(before).then(r=>{closeSheet();toast('Se archivaron '+r.archived+' semanas. La copia quedó guardada.');}).catch(e=>{$('#form-error').textContent=e.message;$('#sheet-actions button[type="submit"]').disabled=false;});});}
const originalEditor=editor;
editor=function(existing,defaults){originalEditor(existing,defaults);$('#sheet-body').insertAdjacentHTML('beforeend',`<details><summary class="hint">Pausa dentro del turno (opcional)</summary><div class="fields-row"><div class="field"><label for="assign-pause-start">Inicio de pausa</label><input type="time" id="assign-pause-start" value="${esc(existing?.pauseStart||'')}"></div><div class="field"><label for="assign-pause-end">Fin de pausa</label><input type="time" id="assign-pause-end" value="${esc(existing?.pauseEnd||'')}"></div></div></details>`);};
const originalRender=render;
render=function(){originalRender();$('#person').hidden=true;$('#role').hidden=true;};
publish=function(){if(!supervisor())return;const empty=coverage();openSheet('Publicar esta semana',`<p>Del ${period(selectedWeek)}.</p><div class="publish-summary">${week().assignments.length} asignaciones.<br>${empty?empty+' lugares por cubrir.':'Todos los turnos cubiertos.'}</div><p class="hint">Las empleadas verán estos horarios en sus teléfonos al conectarse. Los cambios en borrador no se muestran hasta publicar.</p>`,`<button class="btn" type="button" data-action="close">Volver</button><button class="btn primary" type="submit">Publicar horarios</button>`,()=>{week().published={at:new Date().toISOString(),assignments:structuredClone(week().assignments)};week().dirty=false;log('Semana '+selectedWeek+' publicada');closeSheet();save('Horarios publicados para el equipo.');});};
function habitual(){if(!supervisor())return;if((db.exceptions||[]).some(e=>e.from<=plus(selectedWeek,5)&&e.to>=selectedWeek))return toast('Esta semana tiene ausencias. Elegí una semana sin ausencias para guardar el horario habitual.');openSheet('Horario habitual',`<p>Las semanas nuevas tomarán los horarios que estás viendo. Los cambios puntuales de otras semanas se conservan.</p>`,`<button class="btn" type="button" data-action="close">Volver</button><button class="btn primary" type="submit">Usar estos horarios</button>`,()=>{db.base=structuredClone(week().assignments);closeSheet();save('Horario habitual guardado.');});}
function importISIS(){if(!supervisor()||db.employees.length)return;const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{const extracted=root.ISIS_IMPORT.extract(JSON.parse(await input.files[0].text()),db.branches);if(!extracted.employees.length)throw Error('No hay empleadas activas de Ojos en el respaldo.');const proposed={...structuredClone(db),employees:extracted.employees,base:extracted.base,exceptions:extracted.exceptions,punctual:extracted.punctual};for(const a of proposed.base){const problem=validate(proposed,proposed.base,a,a.id);if(problem)throw Error(problem+' Revisá la configuración del local antes de importar.');}closeSheet();openSheet('Importar solo Ojos',`<p>${extracted.employees.length} empleadas, ${extracted.base.length} horarios habituales y ${extracted.exceptions.length} ausencias.</p><p class="hint">No se importan clientas, teléfonos, comisiones ni Caja. Los accesos se crean después.</p>`,`<button class="btn" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Confirmar importación</button>`,()=>{db=proposed;for(const w of Object.keys(db.weeks)){if(!db.weeks[w].published&&!db.weeks[w].assignments.length)delete db.weeks[w];}closeSheet();save('Equipo y horarios de Ojos importados.');});}catch(e){toast(e.message);}};input.click();}
async function accounts(){if(!supervisor())return;try{const data=await root.ISIS_SESSION.request('/accounts');openSheet('Accesos del equipo',`<p class="hint">Cada persona ingresa con su usuario y PIN. Restablecer o bloquear un acceso cierra sus sesiones anteriores.</p><div class="employee-list">${data.accounts.map(a=>`<div class="employee-row"><span>${esc(a.name)}<small style="display:block">${esc(a.login)} · ${a.active?'Habilitado':'Bloqueado'}</small></span><button class="text-button" type="button" data-account="${esc(a.login)}">Cambiar</button></div>`).join('')}</div>`,`<button class="btn" type="button" data-action="close">Cerrar</button><button class="btn primary" type="button" id="create-account">+ Dar acceso</button>`,()=>{});$('#create-account').onclick=()=>accountEditor();document.querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>accountEditor(data.accounts.find(a=>a.login===b.dataset.account)));}catch(e){toast(e.message);}}
function accountEditor(existing){closeSheet();openSheet(existing?'Cambiar acceso':'Dar acceso a una empleada',`<div class="field"><label for="account-login">Usuario para ingresar</label><input id="account-login" autocomplete="off" maxlength="40" value="${esc(existing?.login||'')}" ${existing?'readonly':''} required></div>${existing?.role==='supervisor'?'':`<div class="field"><label for="account-employee">Empleada</label><select id="account-employee">${options(db.employees.filter(e=>e.active!==false),existing?.employeeId)}</select></div>`}<div class="field"><label for="account-pin">${existing?'Nuevo PIN (dejar vacío para conservar)':'PIN de cuatro números'}</label><input id="account-pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="new-password" ${existing?'':'required'}></div>${existing?.role==='supervisor'?'':`<div class="field"><label for="account-active">Estado del acceso</label><select id="account-active"><option value="true">Habilitado</option><option value="false" ${existing?.active===false?'selected':''}>Bloqueado</option></select></div>`}`,`<button class="btn" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Guardar acceso</button>`,()=>{const body={login:$('#account-login').value,employeeId:$('#account-employee')?.value,pin:$('#account-pin').value,active:$('#account-active')?.value!=='false'};root.ISIS_SESSION.request('/accounts',{method:'POST',body}).then(()=>{closeSheet();toast('Acceso guardado. Comunicá el usuario y PIN personalmente.');}).catch(e=>$('#form-error').textContent=e.message);});}
function absences(){if(!supervisor())return;openSheet('Ausencias y licencias',`<p class="hint">Se quitan del borrador los horarios de esos días. Después publicá las semanas afectadas. El horario habitual se conserva.</p><div class="employee-list">${(db.exceptions||[]).map(e=>`<div class="employee-row"><span>${esc(employee(e.employeeId)?.name)} · ${esc(e.type)}<small style="display:block">${dateLabel(e.from)} al ${dateLabel(e.to)} · ${esc(e.reason)}</small></span><button type="button" class="text-button" data-cancel-absence="${esc(e.id)}">Cancelar</button></div>`).join('')||'<p class="hint">Sin ausencias registradas.</p>'}</div>`,`<button class="btn" type="button" data-action="close">Cerrar</button><button class="btn primary" type="button" id="new-absence">+ Registrar ausencia</button>`,()=>{});$('#new-absence').onclick=absenceEditor;document.querySelectorAll('[data-cancel-absence]').forEach(b=>b.onclick=()=>{db.exceptions=db.exceptions.filter(e=>e.id!==b.dataset.cancelAbsence);closeSheet();save('Ausencia cancelada. Revisá y reasigná los horarios de las semanas que ya estaban armadas.');});}
function absenceEditor(){closeSheet();openSheet('Registrar ausencia',`<div class="field"><label for="absence-employee">Empleada</label><select id="absence-employee">${options(db.employees.filter(e=>e.active!==false))}</select></div><div class="field"><label for="absence-type">Motivo</label><select id="absence-type"><option value="vacaciones">Vacaciones</option><option value="licencia">Licencia</option><option value="ausencia">Ausencia</option></select></div><div class="fields-row"><div class="field"><label for="absence-from">Desde</label><input type="date" id="absence-from" value="${today}" required></div><div class="field"><label for="absence-to">Hasta</label><input type="date" id="absence-to" value="${today}" required></div></div><div class="field"><label for="absence-reason">Detalle</label><input id="absence-reason" required maxlength="300"></div>`,`<button class="btn" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Guardar ausencia</button>`,()=>{const employeeId=$('#absence-employee').value,from=$('#absence-from').value,to=$('#absence-to').value,reason=$('#absence-reason').value.trim();if(!employeeId||!from||to<from||!reason)return 'Revisá las fechas y el detalle.';if(db.exceptions.some(e=>e.employeeId===employeeId&&e.from<=to&&e.to>=from))return 'Ya hay una ausencia para esos días.';db.exceptions.push({id:id(),employeeId,from,to,reason,type:$('#absence-type').value});for(const [w,v]of Object.entries(db.weeks)){const before=v.assignments.length;v.assignments=v.assignments.filter(a=>!(a.employeeId===employeeId&&plus(w,a.day)>=from&&plus(w,a.day)<=to));if(v.assignments.length!==before)v.dirty=true;}closeSheet();save('Ausencia guardada. Publicá los cambios de las semanas afectadas.');});}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(['accounts','absences'].includes(b.dataset.action))closeSheet();({accounts,absences,habitual,backup})[b.dataset.action]?.();});
root.Ojos={version:'1.0.0',replace(next,newUser){db=structuredClone(next);if(newUser){view=newUser.role;person=newUser.employeeId;tab='schedule';branchId=db.branches[0].id;}if(!saving)render();},lock(){db=null;$('#sheet').close();$('#content').innerHTML='';}};
render();
})(globalThis);

