/* ============================================================
   ISIS Ojos — traducción entre Firestore y el estado que usa la app.
   Claude · 26/10/2026

   Acá no hay nada de Firebase: son funciones puras, para poder probarlas
   con node --test sin servidor ni red. conexion.js las usa; las pruebas
   de pruebas/adaptador.test.cjs comprueban que arman y reparten bien.

   Lo que hay acá NO es seguridad: la seguridad son las reglas.
   Esto decide QUÉ documentos se escriben; las reglas deciden si se puede.
   ============================================================ */
(function (root) {
  'use strict';

  const RAIZ = 'isisOjos/operacion';
  const copia = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));
  const igual = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const hoy = () => iso(new Date());
  const idNuevo = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function masDias(valor, n) {
    const d = new Date(valor + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  function lunesDe(valor) {
    const d = new Date(valor + 'T12:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return iso(d);
  }

  const vacio = () => ({
    schema: 2, branches: [], employees: [], base: [], weeks: {},
    exceptions: [], punctual: [], messages: [], requests: [], history: []
  });

  /* ---------- Firestore -> estado de la app ---------- */
  function armarEstado(crudo) {
    const e = vacio();
    if (crudo.config) {
      e.branches = copia(crudo.config.locales || []);
      e.schema = crudo.config.schema || 2;
    }
    e.employees = [...crudo.equipo.values()]
      .map((x) => ({ id: x.id, name: x.nombre, active: x.activa !== false }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
    for (const h of crudo.habitual.values()) e.base.push(...copia(h.assignments || []));
    for (const [lunes, s] of crudo.semanas) {
      /* Si de esa semana no hay NADA guardado, no se inventa una semana vacía:
         se deja que la app la arme sola desde el horario habitual. */
      const hayAlgo = !!s.meta || ((s.borrador && s.borrador.size) || 0) > 0 || ((s.publicado && s.publicado.size) || 0) > 0;
      if (!hayAlgo) continue;
      const borrador = [];
      for (const b of (s.borrador || new Map()).values()) borrador.push(...copia(b.assignments || []));
      const publicadas = [];
      for (const p of (s.publicado || new Map()).values()) publicadas.push(...copia(p.assignments || []));
      const confirmadoEn = (s.meta && s.meta.publicadoEn) || s.publicadoEn || '';
      e.weeks[lunes] = {
        assignments: borrador,
        dirty: s.meta ? s.meta.dirty !== false : true,
        published: confirmadoEn ? { at: confirmadoEn, assignments: publicadas } : null
      };
    }
    e.exceptions = [...crudo.ausencias.values()].map((x) => ({
      id: x.id, employeeId: x.empleadaId, from: x.desde, to: x.hasta, type: x.tipo, reason: x.motivo || ''
    }));
    e.punctual = [...crudo.puntuales.values()].map((x) => ({
      id: x.id, employeeId: x.empleadaId, from: x.desde, to: x.hasta, type: x.tipo,
      start: x.entrada || null, end: x.salida || null, branchId: x.localId || null
    }));
    e.messages = [...crudo.comunicados.values()]
      .sort((a, b) => String(b.creado).localeCompare(String(a.creado)))
      .map((m) => ({
        id: m.id, title: m.titulo, body: m.cuerpo, audience: m.destino,
        created: m.creado, scopeWeek: m.semana || null,
        recipients: copia(m.destinatarios || []),
        read: copia(crudo.lecturas.get(m.id) || [])
      }));
    e.requests = [...crudo.solicitudes.values()]
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
      .map((r) => ({
        id: r.id, employeeId: r.empleadaId, type: r.tipo, date: r.fecha,
        detail: r.detalle, status: r.estado, note: r.respuesta || ''
      }));
    e.history = copia(crudo.historial || []);
    return e;
  }

  /* ---------- reparto ---------- */
  function porLocal(asignaciones, locales) {
    const m = new Map((locales || []).map((b) => [b.id, []]));
    for (const a of asignaciones || []) { if (!m.has(a.branchId)) m.set(a.branchId, []); m.get(a.branchId).push(a); }
    return m;
  }
  function porEmpleada(asignaciones, empleadas) {
    const m = new Map((empleadas || []).map((e) => [e.id, []]));
    for (const a of asignaciones || []) { if (!m.has(a.employeeId)) m.set(a.employeeId, []); m.get(a.employeeId).push(a); }
    return m;
  }
  function destinatariosDe(estadoNuevo, m) {
    const activas = (estadoNuevo.employees || []).filter((e) => e.active !== false);
    if (m.audience === 'all') return activas.map((e) => e.id);
    const semana = (estadoNuevo.weeks || {})[m.scopeWeek] || {};
    const fuente = (semana.assignments && semana.assignments.length ? semana.assignments : estadoNuevo.base) || [];
    const ids = new Set(fuente.filter((a) => a.branchId === m.audience).map((a) => a.employeeId));
    return activas.filter((e) => ids.has(e.id)).map((e) => e.id);
  }

  function sincronizarLista(ops, antes, ahora, base, aFirestore) {
    const previos = new Map((antes || []).map((x) => [x.id, x]));
    for (const x of ahora || []) {
      if (!igual(previos.get(x.id), x)) ops.push({ tipo: 'set', ruta: base + '/' + x.id, datos: aFirestore(x) });
      previos.delete(x.id);
    }
    for (const id of previos.keys()) ops.push({ tipo: 'delete', ruta: base + '/' + id });
  }

  /* ---------- estado de la app -> documentos a escribir ---------- */
  function cambiosDeSupervisora(previo, next, opciones) {
    const o = opciones || {};
    const nuevoId = o.id || idNuevo;
    const actor = o.actor || '';
    const ops = [];
    const antes = previo || vacio();

    if (!igual(antes.branches, next.branches))
      ops.push({ tipo: 'set', ruta: RAIZ + '/config/general', datos: { schema: 2, locales: copia(next.branches) } });

    const mapaAntes = new Map((antes.employees || []).map((e) => [e.id, e]));
    for (const e of next.employees || []) {
      const v = mapaAntes.get(e.id);
      if (!v || v.name !== e.name || (v.active !== false) !== (e.active !== false))
        ops.push({ tipo: 'set', ruta: RAIZ + '/equipo/' + e.id, datos: { nombre: e.name, activa: e.active !== false } });
      mapaAntes.delete(e.id);
    }
    /* Nunca se borra una persona: la baja es activa:false, para no perder la historia. */
    for (const e of mapaAntes.values())
      ops.push({ tipo: 'set', ruta: RAIZ + '/equipo/' + e.id, datos: { nombre: e.name, activa: false } });

    const locales = next.branches || [];
    const baseAntes = porLocal(antes.base, locales), baseAhora = porLocal(next.base, locales);
    for (const [bid, lista] of baseAhora)
      if (!igual(baseAntes.get(bid) || [], lista))
        ops.push({ tipo: 'set', ruta: RAIZ + '/habitual/' + bid, datos: { assignments: copia(lista) } });

    for (const [lunes, w] of Object.entries(next.weeks || {})) {
      const previa = (antes.weeks || {})[lunes];
      const borrAntes = porLocal((previa && previa.assignments) || [], locales);
      const borrAhora = porLocal(w.assignments || [], locales);
      for (const [bid, lista] of borrAhora)
        if (!previa || !igual(borrAntes.get(bid) || [], lista))
          ops.push({ tipo: 'set', ruta: RAIZ + '/semanas/' + lunes + '/borrador/' + bid, datos: { assignments: copia(lista) } });

      const pubAntes = (previa && previa.published) || null;
      const pubAhora = w.published || null;
      if (pubAhora && (!pubAntes || !igual(pubAntes.assignments, pubAhora.assignments) || pubAntes.at !== pubAhora.at)) {
        const reparto = porEmpleada(pubAhora.assignments || [], next.employees);
        for (const [eid, lista] of reparto)
          ops.push({
            tipo: 'set', ruta: RAIZ + '/semanas/' + lunes + '/publicado/' + eid,
            datos: { assignments: copia(lista), confirmadoEn: pubAhora.at || new Date().toISOString() }
          });
      }
      if (!previa || previa.dirty !== w.dirty || !igual(pubAntes && pubAntes.at, pubAhora && pubAhora.at))
        ops.push({
          tipo: 'set', ruta: RAIZ + '/semanas/' + lunes,
          datos: { dirty: w.dirty !== false, publicadoEn: (pubAhora && pubAhora.at) || null }
        });
    }

    sincronizarLista(ops, antes.exceptions, next.exceptions, RAIZ + '/ausencias',
      (x) => ({ empleadaId: x.employeeId, desde: x.from, hasta: x.to, tipo: x.type, motivo: x.reason || '' }));
    sincronizarLista(ops, antes.punctual, next.punctual, RAIZ + '/puntuales',
      (x) => ({ empleadaId: x.employeeId, desde: x.from, hasta: x.to, tipo: x.type,
                entrada: x.start || null, salida: x.end || null, localId: x.branchId || null }));

    const mensajesAntes = new Map((antes.messages || []).map((m) => [m.id, m]));
    for (const m of next.messages || []) {
      if (mensajesAntes.has(m.id)) continue;
      ops.push({
        tipo: 'set', ruta: RAIZ + '/comunicados/' + m.id,
        datos: {
          titulo: m.title, cuerpo: m.body, destino: m.audience,
          creado: m.created || hoy(), semana: m.scopeWeek || null,
          destinatarios: copia((m.recipients && m.recipients.length) ? m.recipients : destinatariosDe(next, m))
        }
      });
    }

    const pedidosAntes = new Map((antes.requests || []).map((r) => [r.id, r]));
    for (const r of next.requests || []) {
      const v = pedidosAntes.get(r.id);
      if (!v) continue;   /* los pedidos los crea la empleada, no la supervisora */
      if (v.status !== r.status || (v.note || '') !== (r.note || ''))
        /* Lo que escribió la empleada se manda tal cual como estaba: la
           supervisora solo cambia el estado y la respuesta. La regla de
           Firestore rechaza cualquier otra cosa, y acá ni se intenta. */
        ops.push({
          tipo: 'update', ruta: RAIZ + '/solicitudes/' + r.id,
          datos: { empleadaId: v.employeeId, tipo: v.type, fecha: v.date, detalle: v.detail,
                   estado: r.status, respuesta: r.note || '' }
        });
    }

    const historialAntes = new Set((antes.history || []).map((h) => h.date + '|' + h.text));
    for (const h of next.history || [])
      if (!historialAntes.has(h.date + '|' + h.text))
        ops.push({ tipo: 'set', ruta: RAIZ + '/historial/' + nuevoId(), datos: { fecha: h.date, texto: h.text, actor } });

    return ops;
  }

  /* ---------- lo único que puede hacer una empleada ---------- */
  function cambioDeEmpleada(previo, next, empleadaId) {
    const antes = previo || vacio();
    const nuevosPedidos = (next.requests || []).filter((r) => !(antes.requests || []).some((x) => x.id === r.id));
    const nuevasLecturas = [];
    for (const m of next.messages || []) {
      const v = (antes.messages || []).find((x) => x.id === m.id);
      const leiaAntes = v ? (v.read || []).includes(empleadaId) : false;
      if (!leiaAntes && (m.read || []).includes(empleadaId)) nuevasLecturas.push(m.id);
    }
    const otros = cambiosDeSupervisora(antes, next)
      .filter((op) => !op.ruta.startsWith(RAIZ + '/solicitudes/') && !op.ruta.startsWith(RAIZ + '/comunicados/'));
    if (otros.length)
      throw Object.assign(new Error('Desde tu usuario no se puede cambiar eso.'), { clase: 'permiso' });
    if (nuevosPedidos.length + nuevasLecturas.length !== 1)
      throw Object.assign(new Error('Desde tu usuario solo podés mandar una solicitud o marcar un comunicado como leído.'), { clase: 'permiso' });
    if (nuevosPedidos.length) {
      const r = nuevosPedidos[0];
      if (r.employeeId !== empleadaId)
        throw Object.assign(new Error('No podés mandar una solicitud a nombre de otra persona.'), { clase: 'permiso' });
      return {
        tipo: 'set', ruta: RAIZ + '/solicitudes/' + r.id,
        datos: { empleadaId, tipo: r.type, fecha: r.date, detalle: r.detail,
                 estado: 'Pendiente', creada: new Date().toISOString() }
      };
    }
    return {
      tipo: 'set', ruta: RAIZ + '/comunicados/' + nuevasLecturas[0] + '/lecturas/' + empleadaId,
      datos: { leidoEn: new Date().toISOString() }
    };
  }

  const api = { RAIZ, vacio, copia, igual, iso, hoy, masDias, lunesDe, idNuevo,
                armarEstado, porLocal, porEmpleada, destinatariosDe,
                cambiosDeSupervisora, cambioDeEmpleada };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OJOS_DATOS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
