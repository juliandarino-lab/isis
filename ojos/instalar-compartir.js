(function(){'use strict';
let installEvent=null;
const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;});
window.addEventListener('appinstalled',()=>{installEvent=null;document.querySelector('#instalar-ojos')?.setAttribute('hidden','');});
function iniciar(){
 const tools=document.createElement('div');tools.id='herramientas-acceso';tools.style.cssText='display:flex;flex-wrap:wrap;gap:10px;justify-content:center;padding:12px 16px';
 tools.innerHTML='<button type="button" class="btn" id="compartir-ojos" style="min-height:48px">Compartir acceso</button><button type="button" class="btn" id="instalar-ojos" style="min-height:48px">Instalar en el celular</button>';
 document.body.append(tools);
 const install=document.querySelector('#instalar-ojos');install.hidden=standalone();
 const dialog=document.createElement('dialog');dialog.id='access-help';dialog.style.cssText='padding:24px;max-width:500px';document.body.append(dialog);
 function mostrar(title,text,link){
  dialog.replaceChildren();const h=document.createElement('h2');h.textContent=title;dialog.append(h);
  const p=document.createElement('p');p.style.cssText='line-height:1.6;margin:16px 0';p.textContent=text;dialog.append(p);
  if(link){const field=document.createElement('input');field.value=link;field.readOnly=true;field.setAttribute('aria-label','Enlace de acceso a Ojos');field.style.cssText='width:100%;min-height:48px;margin-bottom:16px';dialog.append(field);field.onclick=()=>field.select();
   const wa=document.createElement('a');wa.textContent='Enviar por WhatsApp';wa.className='btn primary';wa.href='https://wa.me/?text='+encodeURIComponent('Entrá a ISIS Ojos para ver tus horarios: '+link+' . Usá tu cuenta de Google habilitada por Romi.');wa.target='_blank';wa.rel='noopener';dialog.append(wa);
  }
  const close=document.createElement('button');close.type='button';close.className='btn';close.textContent='Cerrar';close.style.cssText='margin:12px 0 0 10px;min-height:48px';close.onclick=()=>dialog.close();dialog.append(close);dialog.showModal();
 }
 document.querySelector('#compartir-ojos').onclick=async()=>{
  const url=new URL('./',location.href);url.search='';url.hash='';
  if(!['https:'].includes(url.protocol)||['localhost','127.0.0.1'].includes(url.hostname)){mostrar('Enlace para las empleadas','El enlace definitivo estará disponible al publicar Ojos. Este enlace de prueba solo abre en esta computadora.');return;}
  const link=url.href;
  if(navigator.share){try{await navigator.share({title:'ISIS Ojos',text:'Entrá con tu cuenta de Google habilitada por Romi para consultar tus horarios.',url:link});return;}catch(e){if(e.name==='AbortError')return;}}
  let copiado=false;try{await navigator.clipboard.writeText(link);copiado=true;}catch{}
  mostrar('Compartir acceso',copiado?'Enlace copiado. Pegalo en WhatsApp y enviáselo a las empleadas.':'Copiá este enlace o tocá «Enviar por WhatsApp».',link);
 };
 install.onclick=async()=>{
  if(installEvent){const p=installEvent;installEvent=null;await p.prompt();await p.userChoice;return;}
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);
  mostrar('Dejar Ojos en la pantalla del celular',ios?'Abrí este enlace en Safari, tocá Compartir y elegí «Agregar a inicio». El ícono de Ojos queda junto a tus aplicaciones.':'Abrí el enlace en Chrome. Tocá los tres puntos y elegí «Instalar aplicación» o «Agregar a la pantalla principal». El ícono de Ojos queda junto a tus aplicaciones.');
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();
