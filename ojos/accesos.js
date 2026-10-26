(function(root){'use strict';
const $=s=>document.querySelector(s),html=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let dialog,employees=[],accounts=[];
function frame(title,body,action){
 if(!dialog){dialog=document.createElement('dialog');dialog.id='access-sheet';document.body.append(dialog);}
 dialog.innerHTML='<form><div class="sheet-head"><h2>'+title+'</h2><button type="button" class="icon-button" aria-label="Cerrar">×</button></div><div id="access-body" style="padding:20px">'+body+'</div><p id="access-error" class="form-error" role="alert"></p><div class="sheet-actions" style="padding:20px">'+(action?'<button class="btn primary" type="submit">'+action+'</button>':'')+'</div></form>';
 dialog.querySelector('.icon-button').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();return dialog.querySelector('form');
}
async function abrir(equipo){
 if(root.ISIS_SESSION?.user.role!=='supervisor')return;
 employees=equipo.filter(e=>e.active!==false);accounts=(await root.ISIS_SESSION.request('/accounts')).accounts;
 const form=frame('Accesos del equipo','<p>Habilitá el correo de Google de cada empleada. Ella entra desde su teléfono, sin crear otra contraseña.</p><div class="lista">'+accounts.map((a,i)=>'<div class="item"><div class="crece"><b>'+html(a.name)+'</b><small>'+html(a.login)+' · '+(a.active?'Habilitado':'Bloqueado')+'</small></div>'+(a.role==='supervisor'?'<small>Supervisora</small>':'<button type="button" class="btn chico" data-acceso="'+i+'">Cambiar</button>')+'</div>').join('')+'</div><button type="button" class="btn primary" id="new-access" style="margin-top:16px">+ Habilitar un correo</button>');
 form.onsubmit=e=>e.preventDefault();$('#new-access').onclick=()=>editor();dialog.querySelectorAll('[data-acceso]').forEach(b=>b.onclick=()=>editor(accounts[+b.dataset.acceso]));
}
function editor(existing){
 if(!employees.length){frame('Primero cargá el equipo','<p>Agregá a las empleadas desde Equipo y después habilitá sus correos.</p>');return;}
 const form=frame(existing?'Cambiar acceso':'Habilitar una empleada','<div class="field"><label for="access-email">Correo de Google</label><input id="access-email" type="email" autocomplete="off" autocapitalize="none" required value="'+html(existing?.login)+'" '+(existing?'readonly':'')+'></div><div class="field"><label for="access-person">Empleada</label><select id="access-person">'+employees.map(e=>'<option value="'+html(e.id)+'" '+(e.id===existing?.employeeId?'selected':'')+'>'+html(e.name)+'</option>').join('')+'</select></div><div class="field"><label for="access-active">Acceso</label><select id="access-active"><option value="true">Habilitado</option><option value="false" '+(existing?.active===false?'selected':'')+'>Bloqueado</option></select></div><p class="hint">Al bloquear el acceso se cierra su sesión. Para cambiar el correo, bloqueá el anterior y habilitá el nuevo.</p>','Guardar acceso');
 form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('[type=submit]');b.disabled=true;try{await root.ISIS_SESSION.request('/accounts',{method:'POST',body:{uid:existing?.uid,login:$('#access-email').value,employeeId:$('#access-person').value,active:$('#access-active').value==='true'}});await abrir(employees);}catch(e){$('#access-error').textContent=e.message;b.disabled=false;}};
}
root.OJOS_ACCESOS={abrir};
document.addEventListener('click',e=>{const b=e.target.closest('[data-action="accounts"]');if(b&&root.ISIS_SESSION?.conectado){e.preventDefault();e.stopImmediatePropagation();abrir(root.ISIS_SESSION.state().employees).catch(e=>alert(e.message));}},true);
})(globalThis);
