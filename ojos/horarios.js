/* ISIS Ojos - reglas de horarios.
   Mismas reglas que ISIS (horarioBase / excepcionDe / horarioDe), con dos
   diferencias deliberadas, anotadas abajo, y una garantia: la semana que se
   arma nunca queda con superposiciones ni turnos pasados de gente. */
(function(root){'use strict';
const SHIFTS={morning:'Mañana',afternoon:'Tarde'};
const mins=s=>{const m=/^(\d{2}):(\d{2})$/.exec(s||'');return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:NaN;};
function plus(value,n){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
const orden=(a,b)=>a.from<b.from?-1:a.from>b.from?1:String(a.id).localeCompare(String(b.id));

/* El horario de un turno en un dia puntual.
   Cada local tiene su horario de siempre (branch.morning / branch.afternoon) y,
   si Romi lo cambio para un dia, branch.dias[0..5] pisa lo que haga falta. */
function turnoDe(branch,shift,day){
 const base=(branch&&branch[shift])||{};
 const propio=branch&&branch.dias&&branch.dias[day]&&branch.dias[day][shift];
 if(!propio)return {start:base.start,end:base.end,slots:base.slots,propio:false};
 return {start:propio.start||base.start,end:propio.end||base.end,
  slots:Number.isInteger(propio.slots)?propio.slots:base.slots,propio:true};
}
const mismoTurno=(a,b)=>a.start===b.start&&a.end===b.end&&a.slots===b.slots;

/* Misma regla que validate() de ISIS Ojos: una persona no puede estar en dos
   locales el mismo dia, ni en dos turnos superpuestos, ni pasar los lugares. */
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

/* Excepcion vigente para esa persona ese dia.
   ISIS toma la primera que encuentra, sea del tipo que sea. Aca la ausencia
   gana siempre (una persona de vacaciones no trabaja aunque ademas tenga
   anotado un cambio de horario) y, entre varias del mismo tipo, gana la que
   empieza antes: asi el resultado no depende del orden de la lista. */
function excepcionDe(s,employeeId,day){
 const faltas=(s.exceptions||[]).filter(e=>e.employeeId===employeeId&&day>=e.from&&day<=e.to).sort(orden);
 const cambios=(s.punctual||[]).filter(e=>e.employeeId===employeeId&&day>=e.from&&day<=e.to).sort(orden);
 return {absence:faltas[0]||null,change:cambios[0]||null,superpuestas:faltas.length+cambios.length>1};
}

/* Arma la semana a partir del horario habitual + ausencias + cambios puntuales.
   Devuelve tambien lo que no pudo entrar, para avisarlo en pantalla. */
function resolve(s,w){
 const assignments=[],conflicts=[];
 const nombre=id=>(s.employees.find(e=>e.id===id)||{}).name||'Una empleada';
 const local=id=>(s.branches.find(b=>b.id===id)||{}).name||'otro local';
 for(const a of s.base||[]){
  const day=plus(w,a.day),{absence,change,superpuestas}=excepcionDe(s,a.employeeId,day);
  if(absence)continue;                                   /* no, vacaciones o licencia */
  let row={...a};
  if(change){
   if(change.type==='traslado'){
    if(!change.branchId){continue;}                      /* ese dia trabaja fuera de Ojos */
    row.branchId=change.branchId;row.pauseStart=null;row.pauseEnd=null;
   }
   row.start=change.start||a.start;row.end=change.end||a.end;
   row.shift=row.start<'12:00'?'morning':'afternoon';
  }
  const problema=validate(s,assignments,row,row.id);
  if(problema){conflicts.push({day:a.day,date:day,employeeId:a.employeeId,
   text:nombre(a.employeeId)+' · '+local(row.branchId)+' · '+row.start+'-'+row.end+': '+problema});continue;}
  if(superpuestas)conflicts.push({day:a.day,date:day,employeeId:a.employeeId,aviso:true,
   text:nombre(a.employeeId)+' tiene más de una excepción para el '+day+'. Se aplicó la primera.'});
  assignments.push(row);
 }
 return {assignments,conflicts};
}
function materialize(s,w){return resolve(s,w).assignments;}
const api={materialize,resolve,validate,excepcionDe,turnoDe,mismoTurno,plus,mins};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OJOS_HORARIOS=api;
})(globalThis);
