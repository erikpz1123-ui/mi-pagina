/* Epzshock — panel del ENTRENADOR conectado a la nube:
   invitaciones y solicitudes por recomendación, rutinas con vigencia, bandeja de chat,
   retos publicados (top público / detalle para quien pagó), descuentos e IA solo para Erik. */
'use strict';

const portal = {
  sesion: null, solicitudes: [], invitaciones: [], cuentas: [], mensajes: [],
  rutinasDe: {}, chatAbierto: null, ia: [], iaCargando: false,
};
const portalConectado = () => portal.sesion?.perfil.rol === 'entrenador';

// Los descuentos viven en los datos del entrenador (y viajan en la copia de seguridad)
const descuentos = () => (db.descuentos = Object.assign({ lealtad: 10, meses: 3, amigo: 10, referidor: 10, iaDia: 20, iaActiva: false }, db.descuentos));
// IA de pago (API de Claude): apagada por defecto para operar a costo cero
const iaActiva = () => portalConectado() && descuentos().iaActiva;

/* ================= Sincronización ================= */
async function sincronizarPortal({ silencioso = true } = {}) {
  if (Nube.modo === 'nula') return;
  try {
    portal.sesion = await Nube.sesion();
    if (!portalConectado()) return;
    const [solicitudes, invitaciones, cuentas, mensajes] = await Promise.all([
      Nube.solicitudes(), Nube.invitaciones(), Nube.clientesNube(), Nube.mensajes(),
    ]);
    Object.assign(portal, { solicitudes, invitaciones, cuentas, mensajes });
    vincularCuentas();
    await importarEntrenos();
    if (!document.body.classList.contains('modo-cliente') && !modal.open) render();
  } catch (e) { if (!silencioso) aviso(e.message); }
}

// Une cada cuenta de la app con su cliente en la app del entrenador
function vincularCuentas() {
  let cambios = false;
  for (const cta of portal.cuentas) {
    let c = db.clientes.find(x => x.id === cta.cliente_local_id) || db.clientes.find(x => x.cuentaId === cta.id);
    if (!c) { // se registró sin cliente local (p. ej. invitación general): lo creamos
      c = { id: uid(), nombre: cta.nombre, telefono: cta.telefono || '', cuota: '', objetivo: '', notas: '', medidas: [], creado: hoyISO(), desde: cta.cliente_desde };
      db.clientes.push(c);
      Nube.actualizarCliente(cta.id, { cliente_local_id: c.id }).catch(() => {});
    }
    if (c.cuentaId !== cta.id || c.appActivo !== cta.activo) { c.cuentaId = cta.id; c.appActivo = cta.activo; cambios = true; }
    // La antigüedad que registra Erik manda (cuenta para el descuento por lealtad)
    const desde = c.desde || c.creado;
    if (desde && desde !== cta.cliente_desde) { cta.cliente_desde = desde; Nube.actualizarCliente(cta.id, { cliente_desde: desde }).catch(() => {}); }
    if (cta.referido_por && !c.referidoPor) {
      const ref = db.clientes.find(x => x.cuentaId === cta.referido_por);
      if (ref) { c.referidoPor = ref.id; cambios = true; }
    }
  }
  if (cambios) guardar();
}

// Los entrenos que hacen los clientes en la app pasan al historial (marcas, gráficas, PR)
async function importarEntrenos(soloCliente) {
  const lista = soloCliente ? [soloCliente] : db.clientes.filter(c => c.cuentaId);
  let nuevos = 0;
  for (const c of lista) {
    const entrenos = await Nube.entrenosDe(c.cuentaId);
    for (const e of entrenos) {
      if (db.registros.some(r => r.id === e.id)) continue;
      const fin = new Date(e.fecha).getTime();
      db.registros.push({
        id: e.id, clienteId: c.id, sesionId: '', sesionNombre: `📱 ${e.nombre}`, inicio: fin - (e.datos.duracion || 0) * 1000, fin,
        duracion: e.datos.duracion || 0, rpe: e.datos.rpe || '', notas: e.datos.notas || '',
        ejercicios: (e.datos.ejercicios || []).map(x => ({
          ejercicioId: db.ejercicios.find(y => normalizarNombre(y.nombre) === normalizarNombre(x.nombre))?.id || '',
          nombre: x.nombre, objetivo: x.reps, descanso: x.descanso, series: x.series,
        })),
      });
      nuevos++;
    }
  }
  if (nuevos) { guardar(); aviso(`📱 ${nuevos} entreno(s) nuevos desde la app`); }
}

/* ================= Descuentos (lealtad y recomendaciones) ================= */
function mesesComoCliente(c) {
  const d = new Date((c.desde || c.creado || hoyISO()) + 'T12:00:00'), h = new Date();
  let m = (h.getFullYear() - d.getFullYear()) * 12 + h.getMonth() - d.getMonth();
  if (h.getDate() < d.getDate()) m--;
  return Math.max(0, m);
}
function cuotaConDescuento(c) {
  const D = descuentos(), motivos = [];
  let pct = 0;
  if (mesesComoCliente(c) >= D.meses) { pct += D.lealtad; motivos.push(`${D.lealtad}% lealtad`); }
  const yaPago = db.pagos.some(p => p.clienteId === c.id && p.pagado);
  if (c.referidoPor && !yaPago) { pct += D.amigo; motivos.push(`${D.amigo}% bienvenida`); }
  if ((c.bonosReferido || 0) > 0) { pct += D.referidor; motivos.push(`${D.referidor}% por recomendar`); }
  pct = Math.min(pct, 50);
  return { pct, motivos, monto: Math.round(Number(c.cuota || 0) * (100 - pct)) / 100 };
}
function textoCuota(c) {
  const d = cuotaConDescuento(c);
  return d.pct ? `<s>${dinero(c.cuota)}</s> <b>${dinero(d.monto)}</b> · 🎁 ${d.motivos.join(' + ')}` : `Cuota ${dinero(c.cuota)}`;
}
function aplicarDescuentoAlCobrar(c) {
  const d = cuotaConDescuento(c);
  if ((c.bonosReferido || 0) > 0) c.bonosReferido--;
  // Primer pago de un recomendado: quien lo recomendó gana un bono
  const primerPago = !db.pagos.some(p => p.clienteId === c.id && p.pagado);
  if (c.referidoPor && primerPago && !c.bonoEntregado) {
    const ref = porId('clientes', c.referidoPor);
    if (ref) { ref.bonosReferido = (ref.bonosReferido || 0) + 1; c.bonoEntregado = true; setTimeout(() => aviso(`🎁 ${ref.nombre.split(' ')[0]} ganó ${descuentos().referidor}% por recomendar`), 1600); }
  }
  return d;
}

/* ================= Hoy ================= */
function bloquePortalHoy() {
  if (!portalConectado()) return '';
  const pend = portal.solicitudes.filter(s => s.estado === 'pendiente').length;
  const urg = conversaciones().filter(c => c.urgente).length;
  return `
    ${pend || urg ? `<div class="tarjeta click reto-cab" data-action="ir-app-clientes" style="margin-top:10px">
      <b>📱 App de clientes</b><div class="sub">${pend ? `${pend} solicitud(es) nuevas` : ''}${pend && urg ? ' · ' : ''}${urg ? `${urg} chat(s) esperan tu respuesta` : ''}</div></div>` : ''}
    ${iaActiva() ? `<div class="tarjeta asistente" style="margin-top:10px">
      <div><b>🤖 Asistente IA</b><p class="sub">Pídele rutinas, dietas o mensajes. Solo tú tienes acceso.</p></div>
      <button class="boton" data-action="ia-abrir">Abrir</button></div>` : ''}`;
}

/* ================= Clientes → App ================= */
function segmentoClientes(activo) {
  if (Nube.modo === 'nula') return '';
  const n = portal.solicitudes.filter(s => s.estado === 'pendiente').length + conversaciones().filter(c => c.noLeidos).length;
  return `<div class="segmento">
    <button class="${activo === 'clientes' ? 'activo' : ''}" data-action="tab" data-tab="clientes">Mis clientes</button>
    <button class="${activo === 'app' ? 'activo' : ''}" data-action="ir-app-clientes">📱 App${n ? ` <span class="chip fuego">${n}</span>` : ''}</button>
  </div>`;
}

function conversaciones() {
  const por = {};
  for (const m of portal.mensajes) (por[m.cliente_id] = por[m.cliente_id] || []).push(m);
  return Object.entries(por).map(([id, ms]) => {
    const ultimo = ms[ms.length - 1];
    return {
      id, ultimo, nombre: portal.cuentas.find(c => c.id === id)?.nombre || 'Cliente',
      noLeidos: ms.filter(m => m.autor !== 'entrenador' && !m.leido_entrenador).length,
      urgente: ms.some(m => !m.leido_entrenador && (m.necesita_entrenador || (!descuentos().iaActiva && m.autor === 'cliente'))),
    };
  }).sort((a, b) => b.ultimo.creado_en.localeCompare(a.ultimo.creado_en));
}

function vAppClientes() {
  if (!portalConectado()) {
    return `${segmentoClientes('app')}
      <div class="vacio">Conéctate como entrenador para gestionar la app de tus clientes.<br><br>
        <button class="boton" data-action="ajustes">Conectar en ⚙︎ Ajustes</button></div>`;
  }
  const pend = portal.solicitudes.filter(s => s.estado === 'pendiente');
  const invPend = portal.invitaciones.filter(i => !i.usada_por && i.expira_en > new Date().toISOString());
  const convs = conversaciones();
  return `
    ${segmentoClientes('app')}
    <div class="cabecera"><div><h1>App de clientes</h1><p class="sub">${portal.cuentas.length} cuentas · ${Nube.modo === 'demo' ? '🧪 modo demo' : '☁️ en la nube'}</p></div>
      <button class="boton sec" data-action="portal-refrescar">↻</button></div>
    <div class="tarjeta">
      <b>🔗 Invitar a alguien nuevo</b>
      <p class="sub">El registro es solo con tu link. Desde la ficha de cada cliente también puedes invitarlo.</p>
      <div class="botones"><button class="boton" data-action="invitar-nuevo">Crear invitación</button></div>
    </div>
    <div class="tarjeta">
      <b>📣 Link para tus redes</b>
      <p class="sub">Ponlo en tu bio o en tus reels. Quien lo abra te deja sus datos y te aparece aquí en Solicitudes; tú decides a quién invitar. Sirve igual en iPhone y Android.</p>
      <input readonly value="${esc(linkRedes())}" aria-label="Link para redes" style="margin-top:8px">
      <div class="botones"><button class="boton sec" data-action="copiar-link-redes">Copiar</button>
        <a class="boton sec" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('¿Quieres entrenar conmigo? 💪 Déjame tus datos aquí y te escribo: ' + linkRedes())}">Compartir por WhatsApp</a></div>
    </div>

    <h2>Solicitudes ${pend.length ? `<span class="chip fuego">${pend.length}</span>` : ''}</h2>
    ${pend.length ? pend.map(s => `
      <div class="tarjeta">
        <div class="fila"><b>${esc(s.nombre)}</b><span class="sub">${fechaBonita(s.creada_en)}</span></div>
        <div class="sub">📞 ${esc(s.telefono)}${s.referido_por ? ` · 👯 Recomendado por ${esc(portal.cuentas.find(c => c.id === s.referido_por)?.nombre || 'un cliente')}` : ' · 📣 desde tus redes'}</div>
        ${s.mensaje ? `<p style="margin-top:6px">“${esc(s.mensaje)}”</p>` : ''}
        <div class="botones"><button class="boton mini" data-action="aceptar-solicitud" data-id="${s.id}">Aceptar e invitar</button>
          <a class="boton sec mini" target="_blank" rel="noopener" href="${linkWhats(s.telefono, `Hola ${s.nombre.split(' ')[0]} 👋, soy Erik de EPZSHOCK. ¡Gracias por tu interés!`)}">WhatsApp</a>
          <button class="boton sec mini" data-action="descartar-solicitud" data-id="${s.id}">Descartar</button></div>
      </div>`).join('') : '<div class="vacio">Sin solicitudes nuevas.</div>'}

    <h2>Chats de ayuda</h2>
    ${convs.length ? convs.map(c => `
      <div class="tarjeta click" data-action="abrir-chat" data-id="${c.id}" ${c.urgente ? 'style="border-color:var(--fuego)"' : ''}>
        <div class="fila"><b>${esc(c.nombre)}</b>${c.urgente ? `<span class="chip fuego">${descuentos().iaActiva ? 'Te necesita' : 'Por responder'}</span>` : c.noLeidos ? `<span class="chip acento">${c.noLeidos} nuevos</span>` : ''}</div>
        <div class="sub trunc">${c.ultimo.autor === 'cliente' ? '' : c.ultimo.autor === 'asistente' ? '🤖 ' : 'Tú: '}${esc(c.ultimo.texto)}</div>
      </div>`).join('') : '<div class="vacio">Aún no hay conversaciones.</div>'}

    ${invPend.length ? `<h2>Invitaciones sin usar</h2>${invPend.map(i => `
      <div class="tarjeta fila"><div class="trunc"><b>${esc(i.nombre)}</b><div class="sub">Vence ${fechaBonita(i.expira_en)}</div></div>
        <button class="boton sec mini" data-action="reenviar-invitacion" data-id="${esc(i.codigo)}">Reenviar</button></div>`).join('')}` : ''}

    <h2>Cuentas en la app</h2>
    ${portal.cuentas.length ? portal.cuentas.map(c => `
      <div class="tarjeta fila">
        <div class="fila-izq"><div class="avatar">${esc(iniciales(c.nombre))}</div>
          <div class="trunc"><b>${esc(c.nombre)}</b><div class="sub">Desde ${fechaBonita(c.cliente_desde)}${c.referido_por ? ' · 👯 recomendado' : ''}</div></div></div>
        <button class="boton ${c.activo ? 'sec' : ''} mini" data-action="pausar-cuenta" data-id="${c.id}" data-activo="${c.activo ? '0' : '1'}">${c.activo ? 'Pausar acceso' : 'Reactivar'}</button>
      </div>`).join('') : '<div class="vacio">Cuando tus clientes se registren aparecerán aquí.</div>'}
  `;
}

function vChatCliente() {
  const id = ruta.id;
  const cta = portal.cuentas.find(c => c.id === id);
  const ms = portal.mensajes.filter(m => m.cliente_id === id);
  return `
    <button class="enlace" data-action="ir-app-clientes">← App de clientes</button>
    <h1 style="margin-top:6px">${esc(cta?.nombre || 'Cliente')}</h1>
    <div class="chat">${ms.map(m => `<div class="burbuja ${m.autor === 'cliente' ? 'erik' : m.autor === 'entrenador' ? 'yo' : 'bot'}">
      ${m.autor === 'asistente' ? '<b>🤖 Asistente</b><br>' : m.autor === 'entrenador' ? '<b>Tú</b><br>' : ''}${esc(m.texto).replace(/\n/g, '<br>')}
      ${m.necesita_entrenador ? '<div class="chip fuego" style="margin-top:6px">Pidió hablar contigo</div>' : ''}</div>`).join('')}
      <span id="chat-fin"></span></div>
    <form data-form="responder-chat" data-id="${esc(id)}" class="chat-entrada">
      <textarea name="texto" maxlength="4000" placeholder="Responde como Erik…" required></textarea>
      <button class="boton" type="submit">Enviar</button>
    </form>`;
}

EXTRA.vistas.appClientes = vAppClientes;
EXTRA.vistas.chatCliente = vChatCliente;

/* ================= Ficha del cliente ================= */
function bloqueAppCliente(c) {
  if (Nube.modo === 'nula') return '';
  if (!c.cuentaId) {
    return `<div class="tarjeta fila"><div><b>📱 App</b><div class="sub">${c.telefono ? 'Aún no tiene cuenta.' : 'Añade su WhatsApp para enviarle el link.'}</div></div>
      <button class="boton mini" data-action="invitar-cliente" data-id="${c.id}" ${portalConectado() ? '' : 'disabled'}>Invitar a la app</button></div>`;
  }
  const rutinas = portal.rutinasDe[c.cuentaId];
  const ahora = new Date().toISOString();
  if (!rutinas && portalConectado()) cargarRutinasDe(c);
  const vigentes = (rutinas || []).filter(r => r.activa_hasta > ahora);
  return `
    <div class="tarjeta">
      <div class="fila"><b>📱 En la app ${c.appActivo === false ? '<span class="chip no">pausado</span>' : '<span class="chip ok">activo</span>'}</b>
        <button class="boton mini" data-action="enviar-rutina-app" data-cliente="${c.id}">+ Activar rutina</button></div>
      ${rutinas === undefined ? '<p class="sub">Cargando…</p>' : vigentes.length ? vigentes.map(r => `
        <div class="fila" style="margin-top:8px"><div class="trunc">${esc(r.nombre)}<div class="sub">⏳ hasta ${fechaBonita(r.activa_hasta)} (${quedan(r.activa_hasta)})</div></div>
          <button class="boton sec mini" data-action="quitar-rutina-app" data-id="${r.id}" data-cliente="${c.id}">Quitar</button></div>`).join('')
        : '<p class="sub" style="margin-top:6px">Sin rutinas activas en la app.</p>'}
    </div>`;
}
async function cargarRutinasDe(c) {
  portal.rutinasDe[c.cuentaId] = portal.rutinasDe[c.cuentaId] || null;
  try { portal.rutinasDe[c.cuentaId] = await Nube.rutinasDe(c.cuentaId); } catch (e) { portal.rutinasDe[c.cuentaId] = []; }
  if (ruta.vista === 'cliente' && ruta.id === c.id && !modal.open) render();
}

const DURACIONES = [[1, '1 día'], [2, '2 días'], [3, '3 días'], [5, '5 días'], [7, '1 semana'], [14, '2 semanas'], [21, '3 semanas'], [28, '4 semanas']];

function formEnviarRutina({ sesionId = '', clienteId = '' }) {
  const conCuenta = db.clientes.filter(c => c.cuentaId && c.appActivo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (!portalConectado()) { aviso('Conéctate como entrenador en ⚙︎ Ajustes'); return; }
  if (!conCuenta.length) { aviso('Ningún cliente tiene la app todavía: invítalos desde su ficha'); return; }
  if (!db.sesiones.length) { aviso('Primero crea una sesión'); return; }
  abrirModal(`
    <h2>📱 Activar rutina en la app</h2>
    <form data-form="enviar-rutina">
      <label>Cliente</label><select name="clienteId">${conCuenta.map(c => `<option value="${c.id}" ${c.id === clienteId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
      <label>Sesión</label><select name="sesionId">${db.sesiones.map(s => `<option value="${s.id}" ${s.id === sesionId ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select>
      <label>Disponible durante</label><select name="dias">${DURACIONES.map(([d, t]) => `<option value="${d}" ${d === 7 ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <p class="aviso-nota">Al vencer desaparece de su app, también de la copia descargada.</p>
      <div class="botones"><button class="boton" type="submit">Activar</button><button class="boton sec" type="button" data-action="cerrar">Cancelar</button></div>
    </form>`);
}

function contenidoRutina(s) {
  return {
    notas: s.notas || '',
    items: s.items.map(it => {
      const e = porId('ejercicios', it.ejercicioId) || {};
      return { nombre: e.nombre || 'Ejercicio', series: it.series, reps: it.reps, carga: it.carga, descanso: it.descanso, notas: it.notas,
        como: e.como || '', clave: e.clave || '', video: e.video || '', musculos: e.musculos || '' };
    }),
  };
}

EXTRA.forms['enviar-rutina'] = async d => {
  const c = porId('clientes', d.clienteId), s = porId('sesiones', d.sesionId);
  try {
    await Nube.publicarRutina({ cliente_id: c.cuentaId, nombre: s.nombre, contenido: contenidoRutina(s),
      activa_hasta: new Date(Date.now() + Number(d.dias) * 864e5).toISOString() });
    cerrarModal();
    aviso(`✓ ${s.nombre} activa ${DURACIONES.find(x => x[0] === Number(d.dias))[1]} para ${c.nombre.split(' ')[0]}`);
    delete portal.rutinasDe[c.cuentaId];
    render();
  } catch (e) { aviso(e.message); }
};

/* ================= Invitaciones y solicitudes ================= */
function mensajeInvitacion(nombre, codigo) {
  return `¡Hola ${nombre.split(' ')[0]}! 💪 Te doy acceso a EPZSHOCK, mi app de entrenamiento.

1️⃣ Crea tu cuenta con este link personal (válido 14 días):
${Nube.linkInvitacion(codigo)}

2️⃣ Instálala en tu celular:
📱 iPhone: ábrelo en Safari → Compartir → «Añadir a pantalla de inicio».
🤖 Android: ábrelo en Chrome → menú ⋮ → «Instalar aplicación».

— Erik`;
}
async function invitar(c, referidoPor) {
  const inv = await Nube.crearInvitacion({ nombre: c.nombre, telefono: c.telefono || null, cliente_local_id: c.id, referido_por: referidoPor || null });
  portal.invitaciones.unshift(inv);
  compartirTexto(`Invitación para ${c.nombre.split(' ')[0]}`, mensajeInvitacion(c.nombre, inv.codigo), c.telefono);
}

/* ================= Retos en la app ================= */
const linkRedes = () => `${Nube.appUrl()}?unete`;
EXTRA.acciones['copiar-link-redes'] = () => navigator.clipboard?.writeText(linkRedes()).then(() => aviso('Link copiado ✓'), () => aviso(linkRedes()));

const nombrePublico = n => { const p = String(n).trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0]; };
const cuentaDeParticipante = p => (p.clienteId && porId('clientes', p.clienteId)?.cuentaId) || null;

function botonPagado(r, p) {
  if (!r.publicado) return '';
  return `<button class="boton ${p.pagado ? '' : 'sec'} mini" data-action="reto-pagado" data-id="${r.id}" data-p="${p.id}">${p.pagado ? '✓ Pagó' : 'Marcar pagado'}</button>`;
}
function bloqueRetoApp(r) {
  if (Nube.modo === 'nula') return '';
  const pagados = r.participantes.filter(p => p.pagado).length;
  return `<div class="tarjeta fila">
    <div><b>📱 ${r.publicado ? 'Publicado en la app' : 'No publicado en la app'}</b>
      <div class="sub">${r.publicado ? `Todos ven el top 5 · ${pagados} pagado(s) ven el progreso completo` : 'Publícalo para que tus clientes vean el top 5'}</div></div>
    <button class="boton ${r.publicado ? 'sec' : ''} mini" data-action="reto-publicar" data-id="${r.id}">${r.publicado ? 'Retirar' : 'Publicar'}</button></div>`;
}

async function publicarRetoSiAplica(r) {
  if (!r?.publicado || !portalConectado()) return;
  const rk = ranking(r);
  const conPuntos = rk.filter(x => x.v !== null);
  const meta = Number(r.meta);
  const publico = {
    id: r.id, nombre: r.nombre, premio: r.premio || null, reglas: r.reglas || null, inicio: r.inicio, fin: r.fin,
    hashtag: r.hashtag || null, unidad: r.unidad || null, estado: estadoReto(r),
    top: conPuntos.slice(0, 5).map((x, i) => ({ puesto: i + 1, nombre: nombrePublico(x.p.nombre), puntos: formatoPuntos(r, x.v) })),
    ganador: r.ganador ? nombrePublico(r.ganador) : null,
  };
  const detalle = {
    ranking: rk.map((x, i) => ({ puesto: i + 1, nombre: nombrePublico(x.p.nombre), puntos: formatoPuntos(r, x.v), cuenta: cuentaDeParticipante(x.p),
      meta: meta && x.v !== null ? Math.max(0, Math.min(100, Math.round((x.v / meta) * 100))) : null })),
    muro: r.participantes.flatMap(p => (p.entradas || []).map(e => ({ nombre: nombrePublico(p.nombre), fecha: e.fecha, valor: `${e.valor} ${r.unidad || ''}`.trim(), nota: e.nota || '' })))
      .sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 100),
  };
  const accesos = [...new Set(r.participantes.filter(p => p.pagado).map(cuentaDeParticipante).filter(Boolean))];
  try { await Nube.publicarReto({ publico, detalle, accesos }); } catch (e) { aviso('No se pudo actualizar el reto en la app: ' + e.message); }
}

// Cualquier cambio en un reto publicado se refleja en la app de los clientes
for (const k of ['form-participante', 'quitar-participante', 'borrar-resultado', 'cerrar-reto', 'editar-reto']) {
  const original = EXTRA.acciones[k];
  if (original) EXTRA.acciones[k] = async el => { await original(el); if (k !== 'form-participante' && k !== 'editar-reto') publicarRetoSiAplica(porId('retos', el.dataset.id)); };
}
for (const k of ['participante', 'resultado', 'reto']) {
  const original = EXTRA.forms[k];
  if (original) EXTRA.forms[k] = async (d, form) => { await original(d, form); publicarRetoSiAplica(porId('retos', form.dataset.id)); };
}

/* ================= Ajustes ================= */
function bloquePortalAjustes() {
  if (Nube.modo === 'nula') {
    return `<h2>App de clientes</h2><p class="sub">Para activar la app de clientes, configura Supabase en <code>config.js</code> (ver la guía de publicación).</p>`;
  }
  const D = descuentos();
  return `
    <h2>App de clientes ${Nube.modo === 'demo' ? '<span class="chip no">demo</span>' : '<span class="chip ok">nube</span>'}</h2>
    ${portalConectado() ? `<p class="sub">Conectado como <b>${esc(portal.sesion.email)}</b></p>
      <div class="botones"><button class="boton sec" data-action="portal-salir">Cerrar sesión de entrenador</button></div>`
    : `<form data-form="portal-entrar">
        <p class="sub">${Nube.modo === 'demo' ? '🧪 Demo: <b>erik@demo.mx</b> / <b>demo1234</b>' : 'Entra con tu cuenta de entrenador.'}</p>
        <label>Correo</label><input name="email" type="email" required autocomplete="email">
        <label>Contraseña</label><input name="password" type="password" required autocomplete="current-password">
        <div class="botones"><button class="boton" type="submit">Conectar</button></div></form>`}
    <h2>Descuentos</h2>
    <form data-form="descuentos">
      <div class="rejilla-2">
        <div><label>% por lealtad</label><input name="lealtad" type="number" min="0" max="50" value="${D.lealtad}"></div>
        <div><label>…a partir de (meses)</label><input name="meses" type="number" min="1" max="24" value="${D.meses}"></div>
        <div><label>% bienvenida a recomendados</label><input name="amigo" type="number" min="0" max="50" value="${D.amigo}"></div>
        <div><label>% para quien recomienda</label><input name="referidor" type="number" min="0" max="50" value="${D.referidor}"></div>
        <div><label>Mensajes de chat IA por cliente/día</label><input name="iaDia" type="number" min="0" max="200" value="${D.iaDia}"></div>
      </div>
      <label class="tarjeta" style="display:flex;gap:10px;align-items:flex-start;margin-top:12px;color:var(--texto)">
        <input type="checkbox" name="iaActiva" ${D.iaActiva ? 'checked' : ''} style="width:auto;min-height:auto;margin-top:4px">
        <span><b>🤖 IA de pago (Claude)</b><br><span class="sub">Apagada = costo $0: tus clientes te escriben directo y tú usas «Copiar» para pegar en tu Claude.
          Encendida = el asistente responde a tus clientes y a ti (≈ 0.02 USD por mensaje, requiere la clave de Claude en Supabase).</span></span>
      </label>
      <p class="aviso-nota">Los descuentos se suman (máx. 50 %) y se aplican solos en Pagos.</p>
      <div class="botones"><button class="boton sec" type="submit">Guardar descuentos</button></div>
    </form>`;
}

EXTRA.forms['portal-entrar'] = async d => {
  try {
    const s = await Nube.entrar(d.email, d.password);
    if (s?.perfil.rol !== 'entrenador') { await Nube.salir(); throw new Error('Esa cuenta no es de entrenador.'); }
    portal.sesion = s; aviso('Conectado ✓'); vAjustes(); sincronizarPortal({ silencioso: false });
    Nube.guardarAjustes(ajustesNube()).catch(() => {});
  } catch (e) { aviso(e.message); }
};
const ajustesNube = () => { const D = descuentos(); return { descuento_lealtad: D.lealtad, meses_lealtad: D.meses, descuento_amigo: D.amigo, premio_referidor: D.referidor, mensajes_ia_dia: D.iaDia, ia_activa: !!D.iaActiva }; };
EXTRA.forms.descuentos = async d => {
  const n = (v, min, max) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
  db.descuentos = { lealtad: n(d.lealtad, 0, 50), meses: n(d.meses, 1, 24), amigo: n(d.amigo, 0, 50), referidor: n(d.referidor, 0, 50), iaDia: n(d.iaDia, 0, 200), iaActiva: !!d.iaActiva };
  guardar(); aviso(db.descuentos.iaActiva ? 'Guardado ✓ · IA de pago encendida' : 'Guardado ✓ · modo costo $0');
  if (portalConectado()) { try { await Nube.guardarAjustes(ajustesNube()); } catch (e) { aviso(e.message); } }
};

/* ================= Asistente IA (solo entrenador) ================= */
function vIA() {
  abrirModal(`
    <h2>🤖 Asistente IA</h2>
    <div class="chat chat-modal">${portal.ia.length ? portal.ia.map(m => `<div class="burbuja ${m.role === 'user' ? 'yo' : 'bot'}">${esc(m.content).replace(/\n/g, '<br>')}</div>`).join('')
      : '<p class="sub">Ejemplos: «Rutina de 4 días para principiante con dolor lumbar», «Dieta de 1800 kcal sin lácteos», «Ideas de reto para diciembre».</p>'}
      ${portal.iaCargando ? '<div class="burbuja bot escribiendo">Pensando…</div>' : ''}<span id="ia-fin"></span></div>
    <form data-form="ia" class="chat-entrada">
      <textarea name="texto" placeholder="Escribe tu petición…" required ${portal.iaCargando ? 'disabled' : ''}></textarea>
      <button class="boton" type="submit" ${portal.iaCargando ? 'disabled' : ''}>Enviar</button></form>
    <div class="botones">${portal.ia.length ? '<button class="boton sec mini" data-action="ia-copiar">Copiar última respuesta</button><button class="boton sec mini" data-action="ia-nuevo">Nueva conversación</button>' : ''}
      <button class="boton sec mini" data-action="cerrar">Cerrar</button></div>`);
  $('#ia-fin')?.scrollIntoView();
}
async function preguntarIA(texto) {
  portal.ia.push({ role: 'user', content: texto }); portal.iaCargando = true; vIA();
  try { const r = await Nube.iaEntrenador(portal.ia); portal.ia.push({ role: 'assistant', content: r.respuesta }); }
  catch (e) { portal.ia.pop(); aviso(e.message); }
  portal.iaCargando = false; if (modal.open) vIA();
}
EXTRA.forms.ia = d => { const t = String(d.texto || '').trim(); if (t) preguntarIA(t); };

/* ================= Acciones ================= */
Object.assign(EXTRA.acciones, {
  'ir-app-clientes'() { ir({ tab: 'clientes', vista: 'appClientes' }); sincronizarPortal(); },
  'portal-refrescar'() { sincronizarPortal({ silencioso: false }).then(() => aviso('Actualizado ✓')); },
  async 'portal-salir'() { await Nube.salir(); portal.sesion = null; cerrarModal(); render(); aviso('Sesión cerrada'); },
  'invitar-nuevo'() {
    abrirModal(`<h2>Nueva invitación</h2><form data-form="invitar-nuevo">
      <label>Nombre *</label><input name="nombre" required maxlength="80">
      <label>WhatsApp</label><input name="telefono" inputmode="tel" maxlength="20">
      <label>Cuota mensual</label><input name="cuota" type="number" min="0" step="0.01">
      <div class="botones"><button class="boton" type="submit">Crear y enviar</button><button class="boton sec" type="button" data-action="cerrar">Cancelar</button></div></form>`);
  },
  async 'invitar-cliente'(el) { try { await invitar(porId('clientes', el.dataset.id)); } catch (e) { aviso(e.message); } },
  'reenviar-invitacion'(el) {
    const inv = portal.invitaciones.find(i => i.codigo === el.dataset.id);
    compartirTexto(`Invitación para ${inv.nombre.split(' ')[0]}`, mensajeInvitacion(inv.nombre, inv.codigo), inv.telefono);
  },
  async 'aceptar-solicitud'(el) {
    const s = portal.solicitudes.find(x => x.id === el.dataset.id);
    const ref = db.clientes.find(c => c.cuentaId && c.cuentaId === s.referido_por);
    const c = { id: uid(), nombre: s.nombre, telefono: s.telefono, cuota: '', objetivo: s.mensaje || '', notas: '', medidas: [], creado: hoyISO(), desde: hoyISO(), referidoPor: ref?.id || '' };
    db.clientes.push(c); guardar();
    try { await Nube.marcarSolicitud(s.id, 'aceptada'); s.estado = 'aceptada'; await invitar(c, s.referido_por); }
    catch (e) { aviso(e.message); }
  },
  async 'descartar-solicitud'(el) {
    if (!confirm('¿Descartar esta solicitud?')) return;
    try { await Nube.marcarSolicitud(el.dataset.id, 'descartada'); portal.solicitudes.find(x => x.id === el.dataset.id).estado = 'descartada'; render(); }
    catch (e) { aviso(e.message); }
  },
  async 'pausar-cuenta'(el) {
    const activo = el.dataset.activo === '1';
    if (!activo && !confirm('Mientras esté pausado no verá rutinas ni retos. ¿Pausar?')) return;
    try { await Nube.actualizarCliente(el.dataset.id, { activo }); await sincronizarPortal(); aviso(activo ? 'Acceso reactivado ✓' : 'Acceso pausado'); }
    catch (e) { aviso(e.message); }
  },
  async 'abrir-chat'(el) {
    ir({ tab: 'clientes', vista: 'chatCliente', id: el.dataset.id });
    $('#chat-fin')?.scrollIntoView();
    try { await Nube.marcarLeidos(el.dataset.id); portal.mensajes.filter(m => m.cliente_id === el.dataset.id).forEach(m => { m.leido_entrenador = true; }); } catch (e) { /* sin conexión */ }
  },
  'enviar-rutina-app'(el) { formEnviarRutina({ sesionId: el.dataset.id || '', clienteId: el.dataset.cliente || '' }); },
  async 'quitar-rutina-app'(el) {
    if (!confirm('¿Quitar esta rutina de su app? Dejará de verla de inmediato.')) return;
    const c = porId('clientes', el.dataset.cliente);
    try { await Nube.quitarRutina(el.dataset.id); delete portal.rutinasDe[c.cuentaId]; render(); aviso('Rutina retirada'); } catch (e) { aviso(e.message); }
  },
  'reto-publicar'(el) {
    const r = porId('retos', el.dataset.id);
    if (!portalConectado()) { aviso('Conéctate como entrenador en ⚙︎ Ajustes'); return; }
    if (r.publicado) {
      if (!confirm('¿Retirar el reto de la app de tus clientes?')) return;
      r.publicado = false; guardar(); render(); Nube.despublicarReto(r.id).catch(e => aviso(e.message));
    } else { r.publicado = true; guardar(); render(); publicarRetoSiAplica(r).then(() => aviso('📱 Publicado: tus clientes ya ven el top 5')); }
  },
  'reto-pagado'(el) {
    const r = porId('retos', el.dataset.id), p = r.participantes.find(x => x.id === el.dataset.p);
    p.pagado = !p.pagado; guardar(); render();
    if (p.pagado && !cuentaDeParticipante(p)) aviso(`${p.nombre.split(' ')[0]} no tiene la app: invítalo para que vea su progreso`);
    publicarRetoSiAplica(r);
  },
  'ia-abrir'() { if (!iaActiva()) { aviso('Activa la IA de pago en ⚙︎ Ajustes'); return; } vIA(); },
  'ia-nuevo'() { portal.ia = []; vIA(); },
  'ia-copiar'() { const u = [...portal.ia].reverse().find(m => m.role === 'assistant'); navigator.clipboard?.writeText(u?.content || '').then(() => aviso('Copiado ✓')); },
  'ia-enviar-prompt'() { const t = $('#prompt-claude').value; vIA(); preguntarIA(t); },
});

EXTRA.forms['invitar-nuevo'] = async d => {
  const c = { id: uid(), nombre: d.nombre.trim(), telefono: d.telefono || '', cuota: d.cuota || '', objetivo: '', notas: '', medidas: [], creado: hoyISO(), desde: hoyISO() };
  db.clientes.push(c); guardar();
  try { await invitar(c); } catch (e) { aviso(e.message); }
};
EXTRA.forms['responder-chat'] = async (d, form) => {
  const texto = String(d.texto || '').trim();
  if (!texto) return;
  try {
    await Nube.responder(form.dataset.id, texto);
    portal.mensajes.push({ cliente_id: form.dataset.id, autor: 'entrenador', texto, leido_entrenador: true, creado_en: new Date().toISOString() });
    render(); $('#chat-fin')?.scrollIntoView();
  } catch (e) { aviso(e.message); }
};
