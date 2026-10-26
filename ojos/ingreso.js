/* ============================================================
   ISIS Ojos — pantalla de ingreso real (correo + contraseña de Firebase)
   Claude · 26/10/2026

   Reemplaza al selector local de inicio.js cuando hay conexión configurada.
   No elige empleada de una lista: cada una entra con su propio usuario.
   La barra de arriba muestra el estado REAL de la conexión; no dice
   "guardado" cuando no se pudo confirmar.
   ============================================================ */
(function (root) {
  'use strict';

  const CFG = root.ISIS_OJOS_CONFIG;
  if (!CFG || !CFG.firebase || !CFG.firebase.apiKey) return;   /* sin conexión: manda inicio.js */

  const $ = (s) => document.querySelector(s);
  const API = root.OJOS_CONEXION;

  /* ---------- pantalla de ingreso ---------- */
  function pantalla(mensaje) {
    const card = $('#login-panel .login-card');
    if (!card) return;
    card.innerHTML =
      '<div class="brand"><img class="brand-logo" src="logo.jpg" alt="Isis"><div><strong>ISIS <span>Ojos</span></strong><small>Los horarios del equipo.</small></div></div>' +
      '<h1>Hola, ingresá.</h1>' +
      '<p class="sub">Elegí tu cuenta de Google. No necesitás crear otra contraseña.</p>' +
      '<p class="form-error" id="error-ingreso" role="alert"></p>' +
      '<button class="btn primary" type="button" id="boton-ingresar" style="width:100%;min-height:56px">Entrar con Google</button>' +
      '<p class="hint" style="margin-top:14px">Usá el correo que Romi habilitó para vos. Cada una ve solamente sus horarios, avisos y solicitudes.</p>';
    $('#error-ingreso').textContent = mensaje || '';
    $('#boton-ingresar').onclick = async () => {
      const boton = $('#boton-ingresar');
      boton.disabled = true; $('#error-ingreso').textContent = '';
      try {
        await API.entrarGoogle();
      } catch (e) {
        $('#error-ingreso').textContent = e.message || 'No se pudo entrar.';
      } finally { boton.disabled = false; }
    };
    $('#login-panel').hidden = false;
    $('#application').hidden = true;
    const banda = $('#banda'); if (banda) banda.remove();
  }

  /* ---------- barra de estado honesta ---------- */
  function banda() {
    if ($('#banda')) return;
    const d = document.createElement('div');
    d.id = 'banda'; d.className = 'aviso-band';
    d.innerHTML = '<span id="banda-estado">Conectando…</span>' +
      (root.ISIS_SESSION?.user.role === 'supervisor' ? '<button type="button" data-ir="copias">Copias</button>' : '');
    document.body.prepend(d);
  }
  function estado(texto, problema) {
    banda();
    const s = $('#banda-estado'); if (s) s.textContent = texto;
    const c = $('#connection');
    if (c) { c.hidden = !problema; c.textContent = problema ? texto : ''; c.classList.toggle('offline', !!problema); }
  }

  /* ---------- enganches con la conexión ---------- */
  API.alAviso = (texto) => { if (texto) pantalla(texto); };
  API.alSalir = () => pantalla('');
  API.alEntrar = (usuario) => {
    banda();
    estado(navigator.onLine ? 'Conectado · cambios compartidos' : 'Sin internet. Esperá a recuperar la conexión para guardar.', !navigator.onLine);
    $('#session-name').textContent = usuario.name || '';
    $('#login-panel').hidden = true;
    $('#application').hidden = false;
    if (!root.Ojos) {
      const s = document.createElement('script');
      s.src = 'app.js';
      s.onerror = () => pantalla('No se pudo cargar el sistema. Recargá la página.');
      document.head.append(s);
    } else {
      root.Ojos.replace(root.ISIS_SESSION.state(), usuario);
    }
  };
  if (API.estadoDeConexion) API.estadoDeConexion((texto, problema) => estado(texto, problema));

  /* ---------- copias: el mismo recorrido que en modo local ---------- */
  root.OJOS_COPIA = {
    async guardar() {
      try {
        const datos = await root.ISIS_SESSION.request('/backup');
        const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'ISIS Ojos - copia ' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (e) { alert('No se pudo guardar la copia: ' + (e.message || e)); }
    },
    traer() {
      if (!root.ISIS_SESSION || root.ISIS_SESSION.user.role !== 'supervisor') {
        alert('Solo la supervisora puede traer una copia.');
        return;
      }
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.json,application/json';
      input.onchange = async () => {
        try {
          const archivo = input.files[0]; if (!archivo) return;
          if (archivo.size > 5000000) throw Error('Ese archivo es demasiado grande para ser una copia de ISIS Ojos.');
          const datos = JSON.parse(await archivo.text());
          root.OJOS_VALIDAR_COPIA(datos);
          const g = datos.state.employees ? datos.state.employees.length : 0;
          const se = datos.state.weeks ? Object.keys(datos.state.weeks).length : 0;
          if (!confirm('La copia trae ' + g + ' personas y ' + se + ' semanas.\n\n' +
            'ATENCIÓN: reemplaza los datos de TODO el equipo, no solo los de este teléfono. ' +
            'Antes de reemplazar se guarda una copia del estado actual en el servidor.\n\n¿Reemplazar?')) return;
          const r = await root.ISIS_SESSION.restore(datos);
          alert('Copia restaurada. Se guardó el estado anterior (respaldo ' + (r.respaldoPrevio || '') + ').');
        } catch (e) { alert('No se pudo restaurar: ' + (e.message || e)); }
      };
      input.click();
    }
  };

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('#logout');
    if (b) { ev.preventDefault(); API.salir(); }
  });

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => pantalla(''));
  else pantalla('');
})(globalThis);
