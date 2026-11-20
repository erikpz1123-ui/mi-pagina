/* Epzshock — capa de nube. Misma interfaz para:
   · real: Supabase (la seguridad la imponen las políticas RLS del servidor)
   · demo: simula el servidor en este dispositivo para probar sin configurar nada
   · nula: sin nube (solo la app del entrenador en modo local) */
'use strict';

const Nube = (() => {
  const C = window.EPZ_CONFIG || {};
  const esReal = !!(C.supabaseUrl && C.supabaseAnonKey && window.supabase);
  const esDemo = !esReal && !!C.demo;
  const appUrl = () => (C.appUrl || (location.origin + location.pathname)).split('?')[0].split('#')[0];

  const TRADUCCIONES = [
    [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
    [/email not confirmed/i, 'Confirma tu correo antes de entrar.'],
    [/failed to fetch|network/i, 'Sin conexión. Revisa tu internet.'],
    [/jwt|token/i, 'Tu sesión caducó. Vuelve a entrar.'],
  ];
  const traducir = m => (TRADUCCIONES.find(([re]) => re.test(m)) || [, m])[1];

  /* ================= Supabase real ================= */
  function crearReal() {
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'epzshock:auth' },
    });
    const ok = ({ data, error }) => { if (error) throw new Error(traducir(error.message)); return data; };
    async function fn(nombre, body) {
      const { data, error } = await sb.functions.invoke(nombre, { body });
      if (error) {
        let msg = 'No se pudo conectar con el servidor.';
        try { msg = (await error.context.json()).error || msg; } catch (e) { /* respuesta sin JSON */ }
        throw new Error(msg);
      }
      return data;
    }
    return {
      modo: 'real',
      async sesion() {
        const { data } = await sb.auth.getSession();
        if (!data.session) return null;
        const perfil = ok(await sb.from('perfiles').select('*').eq('id', data.session.user.id).maybeSingle());
        return perfil ? { email: data.session.user.email, perfil } : null;
      },
      async entrar(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); return this.sesion(); },
      async salir() { await sb.auth.signOut(); },
      registrar: d => fn('registro', d),
      enviarSolicitud: d => fn('solicitud', d),
      // ---- cliente ----
      async misRutinas() { return ok(await sb.from('rutinas').select('*').order('activa_hasta')); },
      async guardarEntreno(e) { ok(await sb.from('entrenos').upsert(e, { onConflict: 'id', ignoreDuplicates: true })); },
      async misEntrenos() { return ok(await sb.from('entrenos').select('*').order('fecha', { ascending: false }).limit(30)); },
      async retosPublicos() { return ok(await sb.from('retos_publicos').select('*').order('fin', { ascending: false })); },
      async retoDetalle(id) { return ok(await sb.from('retos_detalle').select('datos').eq('reto_id', id).maybeSingle())?.datos ?? null; },
      async misAccesos() { return ok(await sb.from('reto_accesos').select('reto_id')).map(a => a.reto_id); },
      async mensajes(clienteId) {
        let q = sb.from('mensajes').select('*').order('creado_en');
        if (clienteId) q = q.eq('cliente_id', clienteId);
        return ok(await q.limit(300));
      },
      async enviarChat(texto) {
        const { data } = await sb.from('ajustes').select('ia_activa').eq('id', 1).single();
        if (data?.ia_activa) return fn('chat-ayuda', { texto });
        const { data: u } = await sb.auth.getUser();
        ok(await sb.from('mensajes').insert({ cliente_id: u.user.id, autor: 'cliente', texto: String(texto).trim().slice(0, 1000) }));
        return { respuesta: null };
      },
      async beneficios() { return ok(await sb.rpc('mis_beneficios')); },
      async actualizarPerfil(id, d) { ok(await sb.from('perfiles').update(d).eq('id', id)); },
      async eliminarCuenta() { await fn('eliminar-cuenta', {}); await sb.auth.signOut(); },
      // ---- entrenador ----
      async crearInvitacion(d) { return ok(await sb.from('invitaciones').insert(d).select().single()); },
      async invitaciones() { return ok(await sb.from('invitaciones').select('*').order('creada_en', { ascending: false })); },
      async solicitudes() { return ok(await sb.from('solicitudes').select('*').order('creada_en', { ascending: false })); },
      async marcarSolicitud(id, estado) { ok(await sb.from('solicitudes').update({ estado }).eq('id', id)); },
      async clientesNube() { return ok(await sb.from('perfiles').select('*').eq('rol', 'cliente').order('nombre')); },
      async actualizarCliente(id, d) {
        ok(await sb.rpc('entrenador_actualizar_cliente', {
          p_id: id, p_activo: d.activo ?? null, p_cliente_desde: d.cliente_desde ?? null, p_cliente_local_id: d.cliente_local_id ?? null,
        }));
      },
      async publicarRutina(d) { return ok(await sb.from('rutinas').insert(d).select().single()); },
      async rutinasDe(clienteId) { return ok(await sb.from('rutinas').select('*').eq('cliente_id', clienteId).order('activa_hasta', { ascending: false })); },
      async quitarRutina(id) { ok(await sb.from('rutinas').delete().eq('id', id)); },
      async entrenosDe(clienteId) { return ok(await sb.from('entrenos').select('*').eq('cliente_id', clienteId).order('fecha', { ascending: false }).limit(100)); },
      async responder(clienteId, texto) { ok(await sb.from('mensajes').insert({ cliente_id: clienteId, autor: 'entrenador', texto })); },
      async marcarLeidos(clienteId) { ok(await sb.from('mensajes').update({ leido_entrenador: true }).eq('cliente_id', clienteId).eq('leido_entrenador', false)); },
      async publicarReto({ publico, detalle, accesos }) {
        ok(await sb.from('retos_publicos').upsert(publico));
        ok(await sb.from('retos_detalle').upsert({ reto_id: publico.id, datos: detalle }));
        const actuales = ok(await sb.from('reto_accesos').select('cliente_id').eq('reto_id', publico.id)).map(a => a.cliente_id);
        const quitar = actuales.filter(x => !accesos.includes(x));
        const poner = accesos.filter(x => !actuales.includes(x));
        if (quitar.length) ok(await sb.from('reto_accesos').delete().eq('reto_id', publico.id).in('cliente_id', quitar));
        if (poner.length) ok(await sb.from('reto_accesos').insert(poner.map(c => ({ reto_id: publico.id, cliente_id: c }))));
      },
      async despublicarReto(id) { ok(await sb.from('retos_publicos').delete().eq('id', id)); },
      iaEntrenador: mensajes => fn('ia-entrenador', { mensajes }),
      async ajustes() { return ok(await sb.from('ajustes').select('*').eq('id', 1).single()); },
      async guardarAjustes(d) { ok(await sb.from('ajustes').update(d).eq('id', 1)); },
    };
  }

  /* ================= Demo: servidor simulado en este dispositivo ================= */
  function crearDemo() {
    const CLAVE = 'epzshock:demo-nube', SESION = 'epzshock:demo-sesion';
    const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(16) + Math.random().toString(16).slice(2));
    const ahora = () => new Date().toISOString();
    const codigo = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
    function inicial() {
      const erik = nuevoId();
      return {
        usuarios: [{ id: erik, email: 'erik@demo.mx', password: 'demo1234' }],
        perfiles: [{ id: erik, rol: 'entrenador', nombre: 'Erik Perez', telefono: '', cliente_desde: ahora().slice(0, 10), codigo_referido: 'ERIK0001', referido_por: null, cliente_local_id: null, activo: true, creado_en: ahora() }],
        invitaciones: [], solicitudes: [], rutinas: [], entrenos: [], mensajes: [],
        retos_publicos: [], retos_detalle: [], reto_accesos: [],
        ajustes: { id: 1, descuento_lealtad: 10, meses_lealtad: 3, descuento_amigo: 10, premio_referidor: 10, mensajes_ia_dia: 20, ia_activa: false },
      };
    }
    const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || inicial(); } catch (e) { return inicial(); } };
    const escribir = s => localStorage.setItem(CLAVE, JSON.stringify(s));
    const espera = v => new Promise(r => setTimeout(() => r(v), 120));
    const copia = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
    let s = leer(); escribir(s);
    const yo = () => s.perfiles.find(p => p.id === localStorage.getItem(SESION));
    const exigir = rol => { const p = yo(); if (!p || (rol && p.rol !== rol)) throw new Error('No tienes permiso.'); if (p.rol === 'cliente' && !p.activo) throw new Error('Tu cuenta está pausada. Escríbele a Erik.'); return p; };
    const vigente = r => ahora() >= r.activa_desde && ahora() < r.activa_hasta;
    const guardarS = () => escribir(s);
    // Atómica: leer, cambiar y guardar sin ceder el turno, para que dos operaciones no se pisen
    function op(f) {
      try { s = leer(); const r = f(); guardarS(); return espera(copia(r)); }
      catch (e) { return Promise.reject(e); }
    }

    return {
      modo: 'demo',
      async sesion() { s = leer(); const p = yo(); return espera(p ? { email: s.usuarios.find(u => u.id === p.id)?.email, perfil: copia(p) } : null); },
      async entrar(email, password) {
        s = leer();
        const u = s.usuarios.find(x => x.email === String(email).trim().toLowerCase() && x.password === password);
        if (!u) throw new Error('Correo o contraseña incorrectos.');
        localStorage.setItem(SESION, u.id);
        return this.sesion();
      },
      async salir() { localStorage.removeItem(SESION); },
      registrar: d => op(() => {
        const inv = s.invitaciones.find(i => i.codigo === d.codigo);
        if (!inv || inv.usada_por || inv.expira_en < ahora()) throw new Error('Esta invitación no es válida o ya se usó. Pide a Erik un link nuevo.');
        const email = String(d.email || '').trim().toLowerCase();
        if (!d.nombre || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || String(d.password || '').length < 8) throw new Error('Revisa tus datos: nombre, correo válido y contraseña de al menos 8 caracteres.');
        if (s.usuarios.some(u => u.email === email)) throw new Error('Ese correo ya tiene cuenta. Inicia sesión.');
        const id = nuevoId();
        s.usuarios.push({ id, email, password: d.password });
        s.perfiles.push({ id, rol: 'cliente', nombre: d.nombre.trim(), telefono: d.telefono || inv.telefono || '', cliente_desde: ahora().slice(0, 10), codigo_referido: codigo(4).toUpperCase(), referido_por: inv.referido_por, cliente_local_id: inv.cliente_local_id, activo: true, creado_en: ahora() });
        Object.assign(inv, { usada_por: id, usada_en: ahora() });
        return { ok: true };
      }),
      enviarSolicitud: d => op(() => {
        if (d.sitio) return { ok: true };
        const tel = String(d.telefono || '').replace(/[^\d+]/g, '');
        if (!d.nombre || tel.length < 7) throw new Error('Escribe tu nombre y un WhatsApp válido.');
        if (s.solicitudes.some(x => x.telefono === tel && x.estado === 'pendiente')) return { ok: true, repetida: true };
        const ref = s.perfiles.find(p => p.codigo_referido === String(d.ref || '').toUpperCase() && p.activo);
        s.solicitudes.push({ id: nuevoId(), nombre: d.nombre.trim(), telefono: tel, mensaje: d.mensaje || null, referido_por: ref?.id || null, estado: 'pendiente', creada_en: ahora() });
        return { ok: true };
      }),
      // ---- cliente ----
      misRutinas: () => op(() => { const p = exigir('cliente'); return s.rutinas.filter(r => r.cliente_id === p.id && vigente(r)); }),
      guardarEntreno: e => op(() => { const p = exigir('cliente'); if (!s.entrenos.some(x => x.id === e.id)) s.entrenos.push({ ...e, cliente_id: p.id, creado_en: ahora() }); }),
      misEntrenos: () => op(() => { const p = exigir(); return s.entrenos.filter(e => e.cliente_id === p.id).reverse().slice(0, 30); }),
      retosPublicos: () => op(() => { exigir(); return s.retos_publicos; }),
      retoDetalle: id => op(() => {
        const p = exigir();
        const permitido = p.rol === 'entrenador' || s.reto_accesos.some(a => a.reto_id === id && a.cliente_id === p.id);
        return permitido ? (s.retos_detalle.find(d => d.reto_id === id)?.datos ?? null) : null;
      }),
      misAccesos: () => op(() => { const p = exigir(); return s.reto_accesos.filter(a => a.cliente_id === p.id).map(a => a.reto_id); }),
      mensajes: clienteId => op(() => {
        const p = exigir();
        const id = p.rol === 'entrenador' ? clienteId : p.id;
        return s.mensajes.filter(m => !id || m.cliente_id === id);
      }),
      enviarChat: texto => op(() => {
        const p = exigir('cliente');
        texto = String(texto || '').trim().slice(0, 1000);
        if (!texto) throw new Error('Escribe un mensaje.');
        const hoy = ahora().slice(0, 10);
        if (s.ajustes.ia_activa && s.mensajes.filter(m => m.cliente_id === p.id && m.autor === 'cliente' && m.creado_en.startsWith(hoy)).length >= s.ajustes.mensajes_ia_dia) {
          throw new Error('Llegaste al límite de mensajes de hoy. Mañana seguimos. 💪');
        }
        s.mensajes.push({ id: Date.now(), cliente_id: p.id, autor: 'cliente', texto, necesita_entrenador: false, leido_entrenador: false, creado_en: ahora() });
        if (!s.ajustes.ia_activa) return { respuesta: null }; // sin IA: le llega directo a Erik
        const rutinas = s.rutinas.filter(r => r.cliente_id === p.id && vigente(r)).map(r => r.nombre);
        const necesita = /dolor|duele|lesi|pago|precio|cobr|cambi/i.test(texto);
        const respuesta = necesita
          ? 'Eso lo tiene que ver Erik directamente; ya le avisé para que te responda. 🙌'
          : `🤖 (Modo demo) Recibí tu pregunta. Con la nube conectada, Claude te responde aquí usando tus rutinas activas${rutinas.length ? `: ${rutinas.join(', ')}` : ''}.`;
        s.mensajes.push({ id: Date.now() + 1, cliente_id: p.id, autor: 'asistente', texto: respuesta, necesita_entrenador: necesita, leido_entrenador: false, creado_en: ahora() });
        return { respuesta, necesita_entrenador: necesita };
      }),
      beneficios: () => op(() => {
        const p = exigir('cliente'), a = s.ajustes;
        const d = new Date(p.cliente_desde + 'T12:00:00'), h = new Date();
        let meses = (h.getFullYear() - d.getFullYear()) * 12 + h.getMonth() - d.getMonth();
        if (h.getDate() < d.getDate()) meses--;
        return {
          meses, meses_lealtad: a.meses_lealtad, descuento_lealtad: meses >= a.meses_lealtad ? a.descuento_lealtad : 0,
          codigo_referido: p.codigo_referido, descuento_amigo: a.descuento_amigo, premio_referidor: a.premio_referidor,
          referidos_activos: s.perfiles.filter(r => r.referido_por === p.id && r.activo).length,
        };
      }),
      eliminarCuenta: () => op(() => {
        const p = exigir('cliente');
        for (const t of ['rutinas', 'entrenos', 'mensajes', 'reto_accesos']) s[t] = s[t].filter(x => x.cliente_id !== p.id);
        s.perfiles = s.perfiles.filter(x => x.id !== p.id).map(x => (x.referido_por === p.id ? { ...x, referido_por: null } : x));
        s.usuarios = s.usuarios.filter(u => u.id !== p.id);
        localStorage.removeItem(SESION);
      }),
      actualizarPerfil: (id, d) => op(() => { const p = exigir(); if (p.id !== id) throw new Error('No tienes permiso.'); Object.assign(p, { nombre: d.nombre ?? p.nombre, telefono: d.telefono ?? p.telefono }); }),
      // ---- entrenador ----
      crearInvitacion: d => op(() => {
        exigir('entrenador');
        const inv = { codigo: codigo(9), nombre: d.nombre, telefono: d.telefono || null, cliente_local_id: d.cliente_local_id || null, referido_por: d.referido_por || null, creada_en: ahora(), expira_en: new Date(Date.now() + 14 * 864e5).toISOString(), usada_por: null, usada_en: null };
        s.invitaciones.push(inv); return inv;
      }),
      invitaciones: () => op(() => { exigir('entrenador'); return [...s.invitaciones].reverse(); }),
      solicitudes: () => op(() => { exigir('entrenador'); return [...s.solicitudes].reverse(); }),
      marcarSolicitud: (id, estado) => op(() => { exigir('entrenador'); const x = s.solicitudes.find(y => y.id === id); if (x) x.estado = estado; }),
      clientesNube: () => op(() => { exigir('entrenador'); return s.perfiles.filter(p => p.rol === 'cliente'); }),
      actualizarCliente: (id, d) => op(() => {
        exigir('entrenador');
        const p = s.perfiles.find(x => x.id === id && x.rol === 'cliente');
        if (p) { if (d.activo != null) p.activo = d.activo; if (d.cliente_desde) p.cliente_desde = d.cliente_desde; if (d.cliente_local_id) p.cliente_local_id = d.cliente_local_id; }
      }),
      publicarRutina: d => op(() => { exigir('entrenador'); const r = { id: nuevoId(), activa_desde: ahora(), creada_en: ahora(), ...d }; s.rutinas.push(r); return r; }),
      rutinasDe: clienteId => op(() => { exigir('entrenador'); return s.rutinas.filter(r => r.cliente_id === clienteId).reverse(); }),
      quitarRutina: id => op(() => { exigir('entrenador'); s.rutinas = s.rutinas.filter(r => r.id !== id); }),
      entrenosDe: clienteId => op(() => { exigir('entrenador'); return s.entrenos.filter(e => e.cliente_id === clienteId).reverse(); }),
      responder: (clienteId, texto) => op(() => { exigir('entrenador'); s.mensajes.push({ id: Date.now(), cliente_id: clienteId, autor: 'entrenador', texto, necesita_entrenador: false, leido_entrenador: true, creado_en: ahora() }); }),
      marcarLeidos: clienteId => op(() => { exigir('entrenador'); s.mensajes.filter(m => m.cliente_id === clienteId).forEach(m => { m.leido_entrenador = true; }); }),
      publicarReto: ({ publico, detalle, accesos }) => op(() => {
        exigir('entrenador');
        s.retos_publicos = s.retos_publicos.filter(r => r.id !== publico.id).concat({ ...publico, actualizado: ahora() });
        s.retos_detalle = s.retos_detalle.filter(r => r.reto_id !== publico.id).concat({ reto_id: publico.id, datos: detalle });
        s.reto_accesos = s.reto_accesos.filter(a => a.reto_id !== publico.id).concat(accesos.map(c => ({ reto_id: publico.id, cliente_id: c })));
      }),
      despublicarReto: id => op(() => {
        exigir('entrenador');
        s.retos_publicos = s.retos_publicos.filter(r => r.id !== id);
        s.retos_detalle = s.retos_detalle.filter(r => r.reto_id !== id);
        s.reto_accesos = s.reto_accesos.filter(a => a.reto_id !== id);
      }),
      iaEntrenador: () => op(() => { exigir('entrenador'); if (!s.ajustes.ia_activa) throw new Error('La IA de pago está desactivada.'); return { respuesta: '🤖 (Modo demo) Conecta la nube y la clave de Claude para que el asistente IA responda aquí con rutinas y dietas completas.' }; }),
      ajustes: () => op(() => { exigir(); return s.ajustes; }),
      guardarAjustes: d => op(() => { exigir('entrenador'); Object.assign(s.ajustes, d); }),
    };
  }

  function crearNula() {
    const sinNube = () => Promise.reject(new Error('La nube no está configurada todavía.'));
    return new Proxy({ modo: 'nula', sesion: () => Promise.resolve(null), salir: () => Promise.resolve() }, {
      get: (o, k) => (k in o ? o[k] : sinNube),
    });
  }

  const api = esReal ? crearReal() : esDemo ? crearDemo() : crearNula();
  api.appUrl = appUrl;
  api.linkInvitacion = codigo => `${appUrl()}?invitacion=${encodeURIComponent(codigo)}`;
  api.linkReferido = codigo => `${appUrl()}?ref=${encodeURIComponent(codigo)}`;
  api.enLinea = () => navigator.onLine !== false;
  return api;
})();
