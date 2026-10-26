(function(root){'use strict';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function extract(source,branches){
 if(!source||!Array.isArray(source.areas)||!Array.isArray(source.profesionales)||!Array.isArray(source.horarios)||!Array.isArray(source.asign)||!Array.isArray(source.sucursales))throw Error('Elegí un respaldo JSON exportado de ISIS.');
 const areaMap=new Map();for(const a of source.areas){if(a.activa===false||!['cejasy pestanas','cejasypestanas','ojos'].map(norm).includes(norm(a.nombre)))continue;const local=source.sucursales.find(s=>s.id===a.sucursalId);const b=branches.find(b=>norm(b.name)===norm(local?.nombre));if(b)areaMap.set(a.id,b.id);}
 if(!areaMap.size)throw Error('El respaldo no tiene el área Cejas y pestañas/Ojos en los cuatro locales.');
 const assignments=source.asign.filter(a=>a.activa!==false&&areaMap.has(a.areaId));const people=new Set(assignments.map(a=>a.profId));const employees=source.profesionales.filter(p=>p.activa!==false&&people.has(p.id)).map(p=>({id:p.id,name:p.nombre,active:true}));
 const base=[],warnings=[];
 for(const h of source.horarios){const a=assignments.find(a=>a.id===h.asignId);if(!a||!employees.some(e=>e.id===a.profId)||h.dia===0)continue;if(!Number.isInteger(h.dia)||h.dia<1||h.dia>6)throw Error('Un horario de ISIS tiene un día inválido.');
  base.push({id:h.id,employeeId:a.profId,branchId:areaMap.get(a.areaId),day:h.dia-1,shift:h.desde<'12:00'?'morning':'afternoon',start:h.desde,end:h.hasta,pauseStart:h.pausaD||null,pauseEnd:h.pausaH||null});
 }
 const exceptions=[];for(const e of source.excepciones||[]){if(!employees.some(p=>p.id===e.profId))continue;if(['no','vacaciones','licencia'].includes(e.tipo))exceptions.push({id:e.id,employeeId:e.profId,from:e.desdeF,to:e.hastaF,type:e.tipo==='no'?'ausencia':e.tipo,reason:e.motivo||e.tipo});else if(['horario','traslado'].includes(e.tipo))warnings.push({id:e.id,employeeId:e.profId,type:e.tipo,from:e.desdeF,to:e.hastaF,start:e.desde||null,end:e.hasta||null,branchId:areaMap.get(e.areaId)||null});}
 return {employees,base,exceptions,punctual:warnings};
}
if(typeof module!=='undefined'&&module.exports)module.exports={extract};else root.ISIS_IMPORT={extract};
})(globalThis);
