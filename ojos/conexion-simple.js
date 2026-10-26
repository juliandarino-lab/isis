/* ISIS Ojos: un horario compartido, vigencias y acceso individual. Sin Functions. */
(function(root){'use strict';
const CFG=root.ISIS_OJOS_CONFIG;if(!CFG?.firebase?.apiKey)return;
const C=root.OJOS_ESTADO,D=root.OJOS_DATOS,R='isisOjos/operacion';
const clone=C.clone,uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,10);
const API={alEntrar:null,alSalir:null,alAviso:null};root.OJOS_CONEXION=API;
let FB,app,auth,db,user=null,profile=null,data=null,revision=0,delivered=0,generation='',busy=false,ready=false,epoch=0;
let stops=[],generationStops=[],receiptStops=[],messages=[],requests=[],profiles=[],invitations=[],notify=()=>{};
const fail=(m,clase='error')=>Object.assign(Error(m),{clase});
const sup=()=>profile?.rol==='supervisora';
const stamp=()=>new Date().toISOString();
const ref=p=>FB.store.doc(db,R+'/'+p);
const col=p=>FB.store.collection(db,R+'/'+p);
const firstDoc=r=>(FB.store.getDocFromServer||FB.store.getDoc)(r);
const open=()=>typeof document!=='undefined'&&!!document.querySelector('dialog[open]');
const state=()=>({...clone(data||C.vacio()),messages:clone(messages),requests:clone(requests)});
function apply(){if(!ready||busy||!data)return;if(open())return;delivered=revision;root.Ojos?.replace(state());}
if(typeof document!=='undefined')document.addEventListener('close',()=>apply(),true);
function clear(){for(const f of [...stops,...generationStops,...receiptStops])try{f();}catch{}stops=[];generationStops=[];receiptStops=[];ready=false;data=null;messages=[];requests=[];profiles=[];invitations=[];generation='';revision=delivered=0;}
function listen(target,fn,list=stops){
 let initial=true;
 return new Promise((resolve,reject)=>{
  const stop=FB.store.onSnapshot(target,{includeMetadataChanges:true},snap=>{
   Promise.resolve(fn(snap)).then(()=>{
    if(initial&&!snap.metadata?.fromCache){initial=false;resolve();}
    if(!snap.metadata?.fromCache)notify('Conectado · cambios compartidos',false);
   }).catch(e=>{if(initial)reject(e);notify(e.message||'No se pudieron leer los cambios.',true);});
  },e=>{
   if(initial)reject(e);
   notify('No se pudo consultar el servidor. Revisá la conexión y tu acceso.',true);
   // A revoked rule may close a data listener before the profile event arrives.
   if(e.code==='permission-denied'&&user){const checkingUid=user.uid,checkingEpoch=epoch;
    firstDoc(ref('usuarios/'+checkingUid)).then(p=>{
     if(epoch!==checkingEpoch)return;
     if(!p.exists()||p.data().activa===false)logout('Tu acceso fue cerrado por la supervisora.');
     else if(ready)start(user); // A restored generation closes old queries: rebuild every listener.
    }).catch(()=>{});
   }
  });
  list.push(stop);
 });
}
async function sdk(){
 if(FB)return FB;
 if(root.ISIS_OJOS_SDK)return FB=root.ISIS_OJOS_SDK;
 const url=CFG.sdk||'https://www.gstatic.com/firebasejs/12.19.0/';
 const [app,auth,store]=await Promise.all(['app','auth','firestore'].map(x=>import(url+'firebase-'+x+'.js')));
 return FB={app,auth,store};
}
function validate(s){if(root.OJOS_VALIDAR_COPIA)return root.OJOS_VALIDAR_COPIA({kind:'isis-ojos-backup',version:1,state:s});return C.decode(C.encode(s));}
function messageDoc(m,s){let destinatarios=m.recipients;if(!destinatarios){const activas=s.employees.filter(e=>e.active!==false);if(m.audience==='all')destinatarios=activas.map(e=>e.id);else{const filas=root.OJOS_HORARIOS?root.OJOS_HORARIOS.semana(s,m.scopeWeek||D.lunesDe(D.hoy())).assignments:s.base;const ids=new Set(filas.filter(a=>a.branchId===m.audience).map(a=>a.employeeId));destinatarios=activas.filter(e=>ids.has(e.id)).map(e=>e.id);}}return {titulo:m.title,cuerpo:m.body,destino:m.audience,creado:m.created,semana:m.scopeWeek||null,destinatarios};}
function requestDoc(r){return {empleadaId:r.employeeId,tipo:r.type,fecha:r.date,detalle:r.detail,estado:r.status,respuesta:r.note||''};}
function publication(s,eid){return {json:C.encode(C.persona(s,eid,CFG.camposHorario||[]))};}
async function streams(gen,myEpoch){
 for(const f of [...generationStops,...receiptStops])f();generationStops=[];receiptStops=[];
 generation=gen;messages=[];requests=[];
 const {query,where}=FB.store;
 const base='generaciones/'+gen+'/';
 const qm=sup()?col(base+'comunicados'):query(col(base+'comunicados'),where('destinatarios','array-contains',profile.empleadaId));
 const qr=sup()?col(base+'solicitudes'):query(col(base+'solicitudes'),where('empleadaId','==',profile.empleadaId));
 await Promise.all([
  listen(qm,s=>{
   if(myEpoch!==epoch)return;
   const reads=new Map(messages.map(m=>[m.id,m.read]));
   messages=s.docs.map(d=>{const m=d.data();return {id:d.id,title:m.titulo,body:m.cuerpo,audience:m.destino,created:m.creado,scopeWeek:m.semana||null,recipients:m.destinatarios,read:reads.get(d.id)||[]};}).sort((a,b)=>b.created.localeCompare(a.created));
   for(const f of receiptStops)f();receiptStops=[];
   for(const m of messages){
    const p=base+'comunicados/'+m.id+'/lecturas';
    listen(sup()?col(p):ref(p+'/'+profile.empleadaId),s=>{if(myEpoch!==epoch)return;const live=messages.find(x=>x.id===m.id);if(live)live.read=sup()?s.docs.map(d=>d.id):(s.exists()?[profile.empleadaId]:[]);apply();},receiptStops).catch(()=>{});
   }
   apply();
  },generationStops),
  listen(qr,s=>{if(myEpoch!==epoch)return;requests=s.docs.map(d=>{const r=d.data();return {id:d.id,employeeId:r.empleadaId,type:r.tipo,date:r.fecha,detail:r.detalle,status:r.estado,note:r.respuesta||''};}).sort((a,b)=>b.date.localeCompare(a.date));apply();},generationStops)
 ]);
}
async function claim(u){
 const p=await firstDoc(ref('usuarios/'+u.uid));if(p.exists())return p.data();
 const email=String(u.email||'').toLowerCase();if(!email)throw fail('Elegí la cuenta de Google habilitada por Romi.');
 const i=await firstDoc(ref('invitaciones/'+email));
 if(!i.exists()||i.data().activa!==true)throw fail('Ese correo todavía no está habilitado. Pedile a Romi que te dé acceso.');
 const d=i.data();const ficha={rol:d.rol,empleadaId:d.empleadaId||'',activa:true,nombre:d.nombre||'',correo:email,actualizado:stamp()};
 await FB.store.setDoc(ref('usuarios/'+u.uid),ficha);return ficha;
}
async function bootstrap(){
 await FB.store.runTransaction(db,async tx=>{
  const r=ref('estadoCompartido/general'),s=await tx.get(r);
  if(!s.exists())tx.set(r,{json:C.encode(C.vacio()),revision:0,generation:uid(),actualizado:stamp()});
 });
}
async function start(u){
 const myEpoch=++epoch;clear();user=u;
 try{
  profile=await claim(u);if(myEpoch!==epoch)return;
  if(profile.activa===false)throw fail('Tu acceso está dado de baja.');
  if(!sup()&&(!profile.empleadaId||!['empleada'].includes(profile.rol)))throw fail('Tu acceso está incompleto. Pedile a Romi que lo revise.');
  if(sup())await bootstrap();
  const own=sup()?ref('estadoCompartido/general'):ref('horariosCompartidos/'+profile.empleadaId);
  const initial=[listen(own,async s=>{
   if(myEpoch!==epoch)return;
   if(!s.exists())throw fail('Romi todavía no compartió tu horario. Pedile que revise tu acceso.');
   const d=s.data();const next=C.decode(d.json);
   if(d.generation!==generation)await streams(d.generation,myEpoch);
   if(myEpoch!==epoch)return;data=next;revision=d.revision||0;apply();
  }),listen(ref('usuarios/'+u.uid),s=>{if(myEpoch!==epoch)return;if(!s.exists()||s.data().activa===false){logout('Tu acceso fue cerrado por la supervisora.');}})];
  if(sup())initial.push(listen(col('usuarios'),s=>{profiles=s.docs.map(d=>({uid:d.id,...d.data()}));}),listen(col('invitaciones'),s=>{invitations=s.docs.map(d=>({login:d.id,...d.data()}));}));
  await Promise.all(initial);if(myEpoch!==epoch)return;
  ready=true;delivered=revision;session();API.alEntrar?.(root.ISIS_SESSION.user);notify('Conectado · cambios compartidos',false);
 }catch(e){if(myEpoch!==epoch)return;await logout(e.message||'No se pudo abrir tu acceso.');}
}
async function logout(message=''){
 ++epoch;clear();user=null;profile=null;root.ISIS_SESSION=null;root.Ojos?.lock();
 try{await FB.auth.signOut(auth);}catch{}API.alSalir?.();if(message)API.alAviso?.(message);
}
function requireSup(){if(!sup()||!ready)throw fail('Esta acción es de la supervisora.','permiso');}
function baseDoc(){return ref('estadoCompartido/general');}
async function commit(next,{restore=false}={}){
 requireSup();if(root.navigator?.onLine===false)throw fail('No hay internet. Esperá a recuperar la conexión para guardar.','red');
 const checked=validate(next),myEpoch=epoch,expected=delivered,prev=state(),gen=restore?uid():generation;
 const json=C.encode(C.administrativo(checked));
 const eids=new Set([...prev.employees,...checked.employees].map(e=>e.id));
 const activas=new Set(checked.employees.filter(e=>e.active!==false).map(e=>e.id));
 const bajas=profiles.filter(u=>u.rol==='empleada'&&u.activa!==false&&!activas.has(u.empleadaId));
 const invitacionesBaja=invitations.filter(u=>u.rol==='empleada'&&u.activa!==false&&!activas.has(u.empleadaId));
 const mensajesNuevos=checked.messages.filter(m=>restore||!prev.messages.some(a=>a.id===m.id));
 const pedidosCambiados=checked.requests.filter(r=>restore||prev.requests.some(a=>a.id===r.id&&(a.status!==r.status||a.note!==r.note)));
 const operaciones=1+eids.size+bajas.length+invitacionesBaja.length+mensajesNuevos.length+pedidosCambiados.length+(restore?1+checked.messages.reduce((n,m)=>n+(m.read||[]).length,0):0);
 if(operaciones>430)throw fail('Hay demasiados cambios para una sola operación. Pedile ayuda al administrador.');
 const publicaciones=new Map([...eids].map(id=>[id,publication(checked,id)]));
 busy=true;notify('Guardando…',true);
 try{
  let committed;
  await FB.store.runTransaction(db,async tx=>{
   const actual=await tx.get(baseDoc());const d=actual.data();
   if(d.revision!==expected||d.generation!==generation)throw fail('Otro teléfono guardó cambios. Revisá lo actualizado y volvé a guardar.','conflicto');
   const paths=[];
   if(!restore){
    for(const r of checked.requests){const a=prev.requests.find(x=>x.id===r.id);if(a&&(a.status!==r.status||a.note!==r.note))paths.push({r,a,s:await tx.get(ref('generaciones/'+gen+'/solicitudes/'+r.id))});}
    for(const x of paths)if(!x.s.exists()||x.s.data().estado!==x.a.status||String(x.s.data().respuesta||'')!==String(x.a.note||''))throw fail('Otra persona respondió esa solicitud. Revisá los cambios.','conflicto');
   }
   if(restore)tx.set(ref('respaldos/'+gen),{json:C.encode(prev),revision:expected,generation,creado:stamp(),por:user.uid});
   const nr=expected+1;
   tx.set(baseDoc(),{json,revision:nr,generation:gen,actualizado:stamp(),por:user.uid});
   for(const [eid,p] of publicaciones)tx.set(ref('horariosCompartidos/'+eid),{...p,revision:nr,generation:gen,actualizado:stamp()});
   for(const u of bajas)tx.set(ref('usuarios/'+u.uid),{activa:false,actualizado:stamp()},{merge:true});
   for(const u of invitacionesBaja)tx.set(ref('invitaciones/'+u.login),{activa:false,actualizado:stamp()},{merge:true});
   const oldMessages=new Set(prev.messages.map(m=>m.id));
   for(const m of checked.messages)if(restore||!oldMessages.has(m.id)){
    tx.set(ref('generaciones/'+gen+'/comunicados/'+m.id),messageDoc(m,checked));
    if(restore)for(const eid of m.read||[])tx.set(ref('generaciones/'+gen+'/comunicados/'+m.id+'/lecturas/'+eid),{leidoEn:stamp(),restaurado:true});
   }
   if(restore)for(const r of checked.requests)tx.set(ref('generaciones/'+gen+'/solicitudes/'+r.id),requestDoc(r));
   else for(const x of paths)tx.set(ref('generaciones/'+gen+'/solicitudes/'+x.r.id),{estado:x.r.status,respuesta:x.r.note||''},{merge:true});
   committed=nr;
  });
  if(myEpoch!==epoch)throw fail('La sesión cambió. Volvé a ingresar.');
  // Read the authoritative commit. UI is never told that an unconfirmed local write was saved.
  const s=await firstDoc(baseDoc()),d=s.data();data=C.decode(d.json);revision=d.revision;
  if(d.generation!==generation)await streams(d.generation,myEpoch);
  // Also refresh independent activity after the transaction, without relying on listener timing.
  const [ms,rs]=await Promise.all(['comunicados','solicitudes'].map(c=>FB.store.getDocs(col('generaciones/'+generation+'/'+c))));
  messages=ms.docs.map(d=>{const m=d.data();return {id:d.id,title:m.titulo,body:m.cuerpo,audience:m.destino,created:m.creado,scopeWeek:m.semana||null,recipients:m.destinatarios,read:checked.messages.find(x=>x.id===d.id)?.read||[]};});
  requests=rs.docs.map(d=>{const r=d.data();return {id:d.id,employeeId:r.empleadaId,type:r.tipo,date:r.fecha,detail:r.detalle,status:r.estado,note:r.respuesta||''};});
  delivered=revision;notify('Guardado · cambios compartidos',false);
  return restore?{ok:true,respaldoPrevio:gen}:state();
 }catch(e){notify(e.clase==='conflicto'?e.message:'No se pudo confirmar el guardado. Revisá la conexión antes de repetir.',true);throw e;}finally{busy=false;apply();}
}
async function employeeSave(next){
 if(!ready||sup())throw fail('Volvé a ingresar.');
 if(root.navigator?.onLine===false)throw fail('No hay internet. Probá cuando vuelva la conexión.');
 const operation=D.cambioDeEmpleada(state(),next,profile.empleadaId);
 const route=operation.ruta.slice((R+'/').length);
 await FB.store.setDoc(ref('generaciones/'+generation+'/'+route),operation.datos);
 // A server read confirms exactly the document this user was allowed to change.
 await firstDoc(ref('generaciones/'+generation+'/'+route));
 if(route.startsWith('solicitudes/')){const r=next.requests.find(x=>!requests.some(a=>a.id===x.id));if(r&&!requests.some(a=>a.id===r.id))requests.unshift({...clone(r),status:'Pendiente',note:''});}
 else {const id=route.split('/')[1],m=messages.find(m=>m.id===id);if(m&&!m.read.includes(profile.empleadaId))m.read.push(profile.empleadaId);}
 apply();return state();
}
function accounts(){
 const normalize=e=>String(e||'').trim().toLowerCase();
 const hidden=new Set(invitations.filter(i=>i.ocultarEnListado===true).map(i=>normalize(i.login)));
 const seen=new Map(invitations.map(i=>[normalize(i.login),{login:i.login,name:i.nombre,employeeId:i.empleadaId,role:i.rol==='supervisora'?'supervisor':'employee',active:i.activa!==false}]));
 for(const p of profiles)seen.set(normalize(p.correo),{uid:p.uid,login:p.correo,name:p.nombre,employeeId:p.empleadaId,role:p.rol==='supervisora'?'supervisor':'employee',active:p.activa!==false});
 return {accounts:[...seen.values()].filter(a=>!hidden.has(normalize(a.login))||normalize(a.login)===normalize(user?.email))};
}
async function access(body){
 requireSup();const email=String(body.login||'').trim().toLowerCase(),person=data.employees.find(e=>e.id===body.employeeId&&e.active!==false);
 if(!/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(email)||email.length>200)throw fail('Escribí un correo válido de Google.');
 const existing=profiles.find(p=>p.uid===body.uid||p.correo===email),inv=invitations.find(i=>i.login===email);
 if(existing?.rol==='supervisora'||inv?.rol==='supervisora')throw fail('El acceso de la supervisora lo administra el responsable del sistema.');
 if(!person)throw fail('Elegí una empleada activa del equipo.');
 const other=[...profiles,...invitations].find(p=>(p.correo||p.login)!==email&&p.empleadaId===person.id&&p.activa!==false);
 if(other)throw fail('Esa empleada ya tiene otro correo habilitado. Bloqueá el anterior primero.');
 const d={rol:'empleada',empleadaId:person.id,nombre:person.name,correo:email,activa:body.active!==false,actualizado:stamp()};
 const batch=FB.store.writeBatch(db);batch.set(ref('invitaciones/'+email),d);if(existing)batch.set(ref('usuarios/'+existing.uid),d);await batch.commit();return {ok:true};
}
async function request(path,o={}){
 requireSup();if(path==='/backup')return {kind:'isis-ojos-backup',version:1,createdAt:stamp(),revision,state:state()};
 if(path==='/accounts'&&o.method==='POST')return access(o.body||{});
 if(path==='/accounts')return accounts();
 throw fail('Esa opción no está disponible.');
}
function session(){root.ISIS_SESSION={conectado:true,user:{name:profile.nombre||user.email,role:sup()?'supervisor':'employee',employeeId:profile.empleadaId||null},state,limits:()=>({weeks:Object.keys(data?.weeks||{}).length,maxWeeks:9999,bytes:new TextEncoder().encode(JSON.stringify(state())).length,maxBytes:C.MAX_BYTES,warn:false}),save:next=>sup()?commit(next):employeeSave(next),reload:async()=>{const s=await firstDoc(sup()?baseDoc():ref('horariosCompartidos/'+profile.empleadaId));const d=s.data();data=C.decode(d.json);revision=d.revision;apply();return state();},restore:backup=>{requireSup();if(backup?.kind!=='isis-ojos-backup'||backup.version!==1)throw fail('Elegí una copia de ISIS Ojos.');return commit(backup.state,{restore:true});},archive:async()=>{throw fail('El horario habitual no necesita archivar semanas. Guardá una copia antes de modificar datos históricos.');},request,semana:async()=>null};}
API.estadoDeConexion=fn=>{notify=fn||(()=>{});};
API.entrar=async(email,password)=>FB.auth.signInWithEmailAndPassword(auth,email.trim(),password);
API.entrarGoogle=async()=>{try{await FB.auth.setPersistence(auth,FB.auth.browserLocalPersistence);return await FB.auth.signInWithPopup(auth,new FB.auth.GoogleAuthProvider());}catch(e){throw fail(e.code==='auth/popup-closed-by-user'?'Se cerró la ventana de Google. Podés volver a intentar.':'No se pudo ingresar con Google. Revisá la conexión y probá de nuevo.');}};
API.salir=()=>logout();
API.mandarResetDeClave=email=>FB.auth.sendPasswordResetEmail(auth,email.trim());
API.arrancar=async()=>{await sdk();app=FB.app.initializeApp(CFG.firebase);auth=FB.auth.getAuth(app);db=FB.store.getFirestore(app);FB.auth.onAuthStateChanged(auth,u=>{if(u)start(u);else if(user){++epoch;clear();user=null;profile=null;root.ISIS_SESSION=null;root.Ojos?.lock();API.alSalir?.();}else API.alSalir?.();});};
if(typeof root.addEventListener==='function'){root.addEventListener('offline',()=>notify('Sin internet. Esperá a recuperar la conexión para guardar.',true));root.addEventListener('online',()=>{notify('Reconectando…',true);root.ISIS_SESSION?.reload().then(()=>notify('Conectado · cambios compartidos',false)).catch(()=>{});});}
API.arrancar().catch(e=>{console.error('Conexión Ojos:',e.code||e.message);API.alAviso?.('No se pudo conectar. Revisá internet y volvé a abrir la página.');});
})(globalThis);
