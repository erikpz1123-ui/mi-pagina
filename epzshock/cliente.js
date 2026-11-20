/* Epzshock — arranque por rol y app del CLIENTE.
   Entrenador → app completa (app.js). Cliente → solo sus rutinas vigentes, retos, chat de ayuda y perfil. */
'use strict';

const CLAVE_MODO = 'epzshock:modo';
const CLAVE_CLI = 'epzshock:cliente';
const cli = {
  tab: 'rutinas', vista: null, id: null,
  perfil: null, rutinas: [], retos: [], accesos: [], mensajes: [], beneficios: null, entrenos: [],
  local: cargarCli(), cargando: false, error: '',
};

function cargarCli() {
  try { return Object.assign({ descargas: {}, cola: [], activo: null, cache: [] }, JSON.parse(localStorage.getItem(CLAVE_CLI) || '{}')); }
  catch (e) { return { descargas: {}, cola: [], activo: null, cache: [] }; }
}
function guardarCli() { try { localStorage.setItem(CLAVE_CLI, JSON.stringify(cli.local)); } catch (e) { aviso('⚠️ Sin espacio para guardar'); } }
const params = new URLSearchParams(location.search);
const NAV_ENTRENADOR = document.querySelector('.tabs').innerHTML;

/* ================= Arranque ================= */
async function arrancar() {
  if (Nube.vieneDeRecuperacion) return pantallaNuevaPassword();
  if (params.get('invitacion')) return pantallaRegistro(params.get('invitacion'));
  if (params.get('ref')) return pantallaSolicitud(params.get('ref'));
  if (params.has('unete')) return pantallaSolicitud('');

  let modo = localStorage.getItem(CLAVE_MODO);
  // Compatibilidad: quien ya usaba la app como entrenador sigue entrando directo
  if (!modo && (db.clientes.length || db.registros.length || db.sesiones.length)) {
    modo = 'entrenador'; localStorage.setItem(CLAVE_MODO, modo);
  }
  if (modo === 'entrenador') return arrancarEntrenador();
  try {
    const s = await Nube.sesion();
    if (s?.perfil.rol === 'entrenador') { localStorage.setItem(CLAVE_MODO, 'entrenador'); return arrancarEntrenador(); }
    if (s?.perfil.rol === 'cliente') { cli.perfil = s.perfil; return arrancarCliente(); }
  } catch (e) {
    // Sin internet: si este teléfono ya tenía sesión de cliente, entra con lo descargado
    if (cli.local.perfil) { cli.perfil = cli.local.perfil; return arrancarCliente(); }
  }
  pantallaBienvenida();
}

function arrancarEntrenador() {
  document.body.classList.remove('modo-cliente', 'modo-publico');
  const nav = $('.tabs'); nav.innerHTML = NAV_ENTRENADOR; nav.style.gridTemplateColumns = '';
  if (db.activo) ruta = { tab: 'hoy', vista: 'entreno' };
  render();
  if (typeof sincronizarPortal === 'function') sincronizarPortal();
}

function modoPublico(html) {
  document.body.classList.add('modo-publico');
  document.body.classList.remove('modo-cliente');
  vista.innerHTML = `<div class="publico">${html}</div>`;
}

/* ================= Pantallas sin sesión ================= */
function pantallaBienvenida(msg = '') {
  modoPublico(`
    <div class="bienvenida">
      <img src="icon-512.png" alt="" class="bienvenida-logo">
      <h1>EPZ<span class="marca-shock">SHOCK</span></h1>
      <p class="sub">Entrenamiento personalizado con Erik Perez</p>
    </div>
    ${msg ? `<div class="tarjeta">${esc(msg)}</div>` : ''}
    <form data-form="c-entrar" class="tarjeta">
      <h2 style="margin-top:0">Entrar</h2>
      <label>Correo</label><input name="email" type="email" autocomplete="email" required>
      <label>Contraseña</label><input name="password" type="password" autocomplete="current-password" required>
      <div class="botones"><button class="boton ancho" type="submit">Entrar</button></div>
      <p style="text-align:center;margin-top:10px"><button class="enlace" type="button" data-action="c-olvide">¿Olvidaste tu contraseña?</button></p>
    </form>
    <div class="tarjeta">
      <b>¿Aún no tienes cuenta?</b>
      <p class="sub">El registro es solo por invitación. Abre el link que te envió Erik o pégalo aquí.</p>
      <form data-form="c-link" class="fila" style="margin-top:8px"><input name="link" placeholder="Link o código de invitación"><button class="boton" type="submit">Usar</button></form>
    </div>
    <p class="sub" style="text-align:center;margin-top:18px">
      ${Nube.modo === 'demo' ? '🧪 Modo demo: entrenador <b>erik@demo.mx</b> / <b>demo1234</b><br>' : ''}
      <button class="enlace" data-action="c-soy-entrenador">Soy el entrenador</button></p>
  `);
}

function pantallaRegistro(codigo) {
  modoPublico(`
    <div class="bienvenida"><img src="icon-512.png" alt="" class="bienvenida-logo">
      <h1>¡Bienvenido a EPZ<span class="marca-shock">SHOCK</span>!</h1>
      <p class="sub">Erik te invitó a su app. Crea tu cuenta para ver tus rutinas.</p></div>
    <form data-form="c-registro" class="tarjeta" data-codigo="${esc(codigo)}">
      <label>Tu nombre *</label><input name="nombre" required maxlength="80" autocomplete="name">
      <label>WhatsApp</label><input name="telefono" inputmode="tel" maxlength="20" autocomplete="tel">
      <label>Correo *</label><input name="email" type="email" required autocomplete="email">
      <label>Contraseña * (mínimo 8)</label><input name="password" type="password" minlength="8" required autocomplete="new-password">
      <div class="botones"><button class="boton ancho" type="submit">Crear mi cuenta</button></div>
      <p class="aviso-nota">Al registrarte aceptas que Erik vea tus entrenos y mensajes para darte seguimiento.</p>
    </form>`);
}

function pantallaSolicitud(ref) {
  modoPublico(`
    <div class="bienvenida"><img src="icon-512.png" alt="" class="bienvenida-logo">
      <h1>${ref ? 'Un amigo te recomendó ' : 'Entrena con '}EPZ<span class="marca-shock">SHOCK</span> 🔥</h1>
      <p class="sub">Entrenamiento personalizado con Erik Perez, licenciado en Entrenamiento Deportivo. Deja tus datos y Erik te escribe por WhatsApp${ref ? '. Por venir recomendado tienes un <b>descuento de bienvenida</b>' : ' para empezar'}.</p></div>
    <div id="planes-publicos"></div>
    <form data-form="c-solicitud" class="tarjeta" data-ref="${esc(ref)}" id="form-solicitud">
      <label for="sol-servicio">¿Qué te interesa?</label>
      <select id="sol-servicio" name="servicio"><option value="">Aún no lo sé, quiero información</option></select>
      <label>Tu nombre *</label><input name="nombre" required maxlength="80">
      <label>WhatsApp *</label><input name="telefono" inputmode="tel" required maxlength="20">
      <label>¿Qué te gustaría lograr?</label><textarea name="mensaje" maxlength="500" placeholder="Ej. bajar de peso, ganar fuerza, prepararme para un deporte…"></textarea>
      <input name="sitio" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
      <div class="botones"><button class="boton ancho" type="submit">Quiero entrenar con Erik</button></div>
    </form>`);
  Nube.servicios().then(lista => {
    if (!lista.length) return;
    $('#planes-publicos').innerHTML = `<h2>Planes y precios</h2>${htmlPlanes(lista, 'publico')}`;
    $('#sol-servicio').insertAdjacentHTML('beforeend', lista.map(s => `<option value="${esc(s.nombre)}">${esc(s.nombre)}${mostrarPrecios() && s.precio != null ? ` · ${esc(precioTexto(s))}` : ''}</option>`).join(''));
  }).catch(() => {});
}

/* ===== Planes y precios (servicios del entrenador) ===== */
const CATEGORIAS = { reto: '🔥 Retos', plan: '💪 Planes personalizados', otro: '✨ Otros servicios' };
// En las apps de las tiendas (iPhone/Android) no se venden servicios digitales por fuera: solo en la web
const esAppNativa = () => !!window.Capacitor?.isNativePlatform?.();
const mostrarPrecios = () => !(window.Capacitor?.getPlatform?.() === 'ios');
const ofertaVigente = s => s.precio_antes != null && s.precio != null && s.precio_antes > s.precio && (!s.oferta_hasta || new Date() < new Date(s.oferta_hasta));
const precioVigente = s => (s.oferta_hasta && new Date() >= new Date(s.oferta_hasta) && s.precio_antes != null) ? s.precio_antes : s.precio;
const precioTexto = s => s.precio == null ? 'Consultar precio' : `${dinero(precioVigente(s))} MXN${s.periodo ? ' ' + s.periodo : ''}`;
const disponible = s => s.activo !== false && (!s.disponible_hasta || new Date() < new Date(s.disponible_hasta));
const fechaCorta = iso => new Date(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' });

function htmlPlanes(lista, modo, cupos = {}) {
  return Object.entries(CATEGORIAS).map(([cat, titulo]) => {
    const grupo = lista.filter(s => (s.categoria || 'plan') === cat && (modo === 'previa' || disponible(s)));
    if (!grupo.length) return '';
    return `<h3 class="cat-planes">${titulo}</h3>` + grupo.map(s => {
      const quedan = s.cupo ? Math.max(0, s.cupo - (cupos[s.id] || 0)) : null;
      const agotado = quedan === 0;
      const sePuedeComprar = modo === 'cliente' && s.precio != null && !esAppNativa() && cli.pago?.clabe && !agotado;
      return `
      <div class="tarjeta plan ${s.destacado ? 'plan-destacado' : ''} ${s.activo === false ? 'plan-oculto' : ''}">
        <div class="filtros" style="margin:0">${s.destacado ? '<span class="chip acento">⭐ Más elegido</span>' : ''}${s.activo === false ? '<span class="chip no">Oculto</span>' : ''}
          ${quedan != null ? `<span class="chip ${quedan <= 3 ? 'fuego' : ''}">${agotado ? 'Agotado' : `Quedan ${quedan} de ${s.cupo} lugares`}</span>` : ''}</div>
        <b class="plan-nombre">${esc(s.nombre)}</b>
        ${mostrarPrecios() ? `<div class="plan-precio">${esc(precioTexto(s))}${ofertaVigente(s) ? ` <s class="plan-antes">${esc(dinero(s.precio_antes))}</s>` : ''}</div>` : ''}
        ${mostrarPrecios() && ofertaVigente(s) && s.oferta_hasta ? `<span class="chip fuego">Preventa hasta el ${esc(fechaCorta(s.oferta_hasta))}</span>` : ''}
        ${s.disponible_hasta ? `<p class="sub">⏳ Inscripciones hasta el ${esc(fechaCorta(s.disponible_hasta))}</p>` : ''}
        ${s.descripcion ? `<p class="sub">${esc(s.descripcion)}</p>` : ''}
        ${(s.incluye || []).length ? `<ul class="plan-incluye">${s.incluye.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
        ${modo === 'cliente' ? (agotado ? '<button class="boton sec ancho" disabled>Agotado</button>'
            : sePuedeComprar ? `<button class="boton ancho" data-action="c-comprar" data-id="${esc(s.id)}">Comprar</button>`
            : `<button class="boton ancho" data-action="c-quiero" data-id="${esc(s.id)}">Lo quiero</button>`)
          : modo === 'publico' ? `<button class="boton sec ancho" data-action="c-me-interesa" data-nombre="${esc(s.nombre)}">Me interesa</button>` : ''}
      </div>`;
    }).join('');
  }).join('');
}

EXTRA.acciones['c-me-interesa'] = el => {
  $('#sol-servicio').value = el.dataset.nombre;
  $('#form-solicitud').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => $('#form-solicitud [name=nombre]')?.focus(), 400);
};

function pantallaOlvide() {
  modoPublico(`
    <div class="bienvenida"><img src="icon-512.png" alt="" class="bienvenida-logo"><h1>Recupera tu acceso</h1>
      <p class="sub">Escribe el correo de tu cuenta y te enviaremos un link para crear una contraseña nueva.</p></div>
    <form data-form="c-olvide" class="tarjeta">
      <label for="olvide-email">Correo</label><input id="olvide-email" name="email" type="email" autocomplete="email" required>
      <div class="botones"><button class="boton ancho" type="submit">Enviarme el link</button></div>
    </form>
    <p style="text-align:center"><button class="enlace" data-action="c-volver">← Volver</button></p>`);
}

async function pantallaNuevaPassword() {
  await Nube.sesion().catch(() => null); // termina de leer el link del correo
  modoPublico(`
    <div class="bienvenida"><img src="icon-512.png" alt="" class="bienvenida-logo"><h1>Nueva contraseña</h1>
      <p class="sub">Elige una contraseña de al menos 8 caracteres.</p></div>
    <form data-form="c-nueva-password" class="tarjeta">
      <label for="np1">Contraseña nueva</label><input id="np1" name="p1" type="password" minlength="8" autocomplete="new-password" required>
      <label for="np2">Repítela</label><input id="np2" name="p2" type="password" minlength="8" autocomplete="new-password" required>
      <div class="botones"><button class="boton ancho" type="submit">Guardar y entrar</button></div>
    </form>`);
}

EXTRA.acciones['c-olvide'] = () => pantallaOlvide();
EXTRA.acciones['c-volver'] = () => pantallaBienvenida();
EXTRA.forms['c-olvide'] = async (d, form) => {
  const boton = form.querySelector('[type=submit]'); boton.disabled = true;
  try {
    await Nube.recuperar(d.email);
    pantallaBienvenida(`Si ${d.email} tiene cuenta, te llegará un correo con el link para crear tu contraseña nueva. Revisa también la carpeta de spam.`);
  } catch (e) { aviso(e.message); boton.disabled = false; }
};
EXTRA.forms['c-nueva-password'] = async (d, form) => {
  if (d.p1 !== d.p2) { aviso('Las contraseñas no coinciden'); return; }
  if (String(d.p1).length < 8) { aviso('Usa al menos 8 caracteres'); return; }
  const boton = form.querySelector('[type=submit]'); boton.disabled = true;
  try {
    await Nube.cambiarPassword(d.p1);
    history.replaceState(null, '', location.pathname);
    aviso('Contraseña guardada ✓');
    const s = await Nube.sesion();
    if (s?.perfil.rol === 'entrenador') { localStorage.setItem(CLAVE_MODO, 'entrenador'); return arrancarEntrenador(); }
    if (s?.perfil.rol === 'cliente') { cli.perfil = s.perfil; return arrancarCliente(); }
    pantallaBienvenida('Contraseña guardada. Ya puedes entrar.');
  } catch (e) { aviso(/expired|invalid|jwt|sesión/i.test(e.message) ? 'El link venció. Pide uno nuevo con «¿Olvidaste tu contraseña?».' : e.message); boton.disabled = false; }
};

EXTRA.forms['c-entrar'] = async d => {
  try {
    const s = await Nube.entrar(d.email, d.password);
    if (!s) throw new Error('Tu cuenta no tiene perfil. Escríbele a Erik.');
    if (s.perfil.rol === 'entrenador') { localStorage.setItem(CLAVE_MODO, 'entrenador'); limpiarUrl(); return arrancarEntrenador(); }
    cli.perfil = s.perfil; limpiarUrl(); arrancarCliente();
  } catch (e) { aviso(e.message); }
};
EXTRA.forms['c-link'] = d => {
  const v = String(d.link || '').trim();
  const codigo = (v.match(/invitacion=([^&\s]+)/) || [, v])[1];
  if (codigo) location.search = `?invitacion=${encodeURIComponent(codigo)}`;
};
EXTRA.forms['c-registro'] = async (d, form) => {
  const boton = form.querySelector('[type=submit]'); boton.disabled = true;
  try {
    await Nube.registrar({ ...d, codigo: form.dataset.codigo });
    const s = await Nube.entrar(d.email, d.password);
    cli.perfil = s.perfil; limpiarUrl();
    if (estaInstalada()) { arrancarCliente(); aviso('¡Cuenta creada! 💪'); }
    else pantallaInstalar(true);
  } catch (e) { aviso(e.message); boton.disabled = false; }
};
EXTRA.forms['c-solicitud'] = async (d, form) => {
  const boton = form.querySelector('[type=submit]'); boton.disabled = true;
  try {
    await Nube.enviarSolicitud({ ...d, ref: form.dataset.ref });
    modoPublico(`<div class="bienvenida"><img src="icon-512.png" alt="" class="bienvenida-logo">
      <h1>¡Listo, ${esc(d.nombre.split(' ')[0])}! 🙌</h1>
      <p class="sub">Erik recibió tus datos y te escribirá por WhatsApp para empezar.</p></div>`);
  } catch (e) { aviso(e.message); boton.disabled = false; }
};
EXTRA.acciones['c-soy-entrenador'] = () => {
  if (Nube.modo === 'nula') {
    if (confirm('Usar la app de entrenador en este dispositivo (sin nube)?')) { localStorage.setItem(CLAVE_MODO, 'entrenador'); arrancarEntrenador(); }
    return;
  }
  aviso('Entra con tu correo de entrenador en el formulario de arriba');
  $('input[name=email]')?.focus();
};
function limpiarUrl() { if (location.search) history.replaceState(null, '', location.pathname); }

/* ================= App del cliente ================= */
const TABS_CLIENTE = [['rutinas', '⚡', 'Rutinas'], ['retos', '🔥', 'Retos'], ['planes', '🛒', 'Planes'], ['ayuda', '💬', 'Ayuda'], ['perfil', '☺', 'Perfil']];

function arrancarCliente() {
  document.body.classList.add('modo-cliente');
  document.body.classList.remove('modo-publico');
  cli.local.perfil = cli.perfil; guardarCli();
  purgarVencidas();
  renderCliente();
  refrescarCliente();
}

function purgarVencidas() {
  const ahora = new Date().toISOString();
  for (const [id, r] of Object.entries(cli.local.descargas)) if (r.activa_hasta <= ahora) delete cli.local.descargas[id];
  cli.local.cache = cli.local.cache.filter(r => r.activa_hasta > ahora);
  guardarCli();
}

async function refrescarCliente() {
  if (!Nube.enLinea()) { renderCliente(); return; }
  cli.cargando = true;
  try {
    await sincronizarCola();
    const [rutinas, retos, accesos, mensajes, beneficios, entrenos, ajustes, servicios, compras, cupos] = await Promise.all([
      Nube.misRutinas(), Nube.retosPublicos(), Nube.misAccesos(), Nube.mensajes(), Nube.beneficios(), Nube.misEntrenos(), Nube.ajustes(), Nube.servicios(), Nube.misCompras(), Nube.cupos(),
    ]);
    Object.assign(cli, { rutinas, retos, accesos, mensajes, beneficios, entrenos, servicios, compras, cupos: Object.fromEntries((cupos || []).map(x => [x.servicio_id, Number(x.ocupados)])), pago: { clabe: ajustes?.clabe, banco: ajustes?.banco, titular: ajustes?.titular, correo: ajustes?.correo }, whatsappErik: ajustes?.whatsapp || '', iaActiva: !!ajustes?.ia_activa, error: '' });
    cli.local.cache = rutinas;
    // Las descargas se actualizan si Erik cambió la rutina; las que ya no están activas se borran
    for (const id of Object.keys(cli.local.descargas)) {
      const r = rutinas.find(x => x.id === id);
      if (r) cli.local.descargas[id] = r; else delete cli.local.descargas[id];
    }
    guardarCli();
  } catch (e) {
    cli.error = e.message;
    if (/sesión|permiso|pausada/i.test(e.message)) { cli.perfil = null; delete cli.local.perfil; guardarCli(); return pantallaBienvenida(e.message); }
  } finally { cli.cargando = false; }
  if (document.body.classList.contains('modo-cliente')) renderCliente();
}

async function sincronizarCola() {
  while (cli.local.cola.length) {
    await Nube.guardarEntreno(cli.local.cola[0]);
    cli.local.cola.shift(); guardarCli();
  }
}
window.addEventListener('online', () => { if (document.body.classList.contains('modo-cliente')) { aviso('Conexión recuperada ✓'); refrescarCliente(); } });
window.addEventListener('offline', () => { if (document.body.classList.contains('modo-cliente')) renderCliente(); });

function rutinasVisibles() {
  const ahora = new Date().toISOString();
  const base = Nube.enLinea() && !cli.error ? cli.local.cache : Object.values(cli.local.descargas);
  return base.filter(r => r.activa_hasta > ahora).sort((a, b) => a.activa_hasta.localeCompare(b.activa_hasta));
}

function quedan(iso) {
  const ms = new Date(iso) - Date.now();
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5);
  return d >= 1 ? `${d} día${d > 1 ? 's' : ''}` : h >= 1 ? `${h} h` : 'menos de 1 h';
}

function renderCliente() {
  const nav = $('.tabs');
  nav.style.gridTemplateColumns = `repeat(${TABS_CLIENTE.length}, 1fr)`;
  nav.innerHTML = TABS_CLIENTE.map(([k, i, t]) => `<button data-action="c-tab" data-tab-c="${k}" class="${cli.tab === k ? 'activo' : ''}"><span>${i}</span>${t}</button>`).join('');
  const v = { rutinas: cRutinas, rutina: cRutina, entreno: cEntreno, retos: cRetos, reto: cReto, planes: cPlanes, ayuda: cAyuda, perfil: cPerfil };
  vista.innerHTML = (sinConexion() + (v[cli.vista || cli.tab] || cRutinas)());
  if (cli.vista === 'entreno') tickCliente();
  if (cli.tab === 'ayuda' && !cli.vista) $('#chat-fin')?.scrollIntoView();
}
const sinConexion = () => Nube.enLinea() ? '' : '<div class="tarjeta offline">📴 Sin conexión: ves tus rutinas descargadas. Tus entrenos se guardan y se envían al volver el internet.</div>';

/* ===== Instalación según el teléfono (iPhone / Android) ===== */
const UA = navigator.userAgent || '';
const esIOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const esAndroid = /Android/.test(UA);
const navegadorDentroDeApp = /Instagram|FBAN|FBAV|TikTok|musical_ly|Line\/|Snapchat/i.test(UA);
const estaInstalada = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
let avisoInstalar = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); avisoInstalar = e; });

function guiaInstalacion() {
  if (navegadorDentroDeApp) {
    return `<div class="tarjeta"><b>Primero ábrela en tu navegador</b>
      <p class="sub" style="margin-top:6px">Estás dentro de otra app (Instagram, TikTok…). Toca <b>•••</b> o el menú de arriba y elige <b>«Abrir en ${esIOS ? 'Safari' : 'el navegador'}»</b>. Luego sigue los pasos.</p></div>`;
  }
  if (esIOS) {
    return `<div class="tarjeta"><b>📲 Instálala en tu iPhone</b>
      <ol class="sub pasos"><li>Asegúrate de estar en <b>Safari</b>.</li>
        <li>Toca <b>Compartir</b> <span aria-hidden="true">⬆︎</span> (o <b>•••</b> → <b>Compartir</b>).</li>
        <li>Toca <b>«Añadir a pantalla de inicio»</b> y luego <b>Añadir</b>.</li>
        <li>Abre la app desde el icono <b>EP</b> de tu pantalla.</li></ol></div>`;
  }
  return `<div class="tarjeta"><b>📲 Instálala en tu ${esAndroid ? 'Android' : 'teléfono'}</b>
    ${avisoInstalar ? '<div class="botones"><button class="boton ancho" data-action="c-instalar">Instalar EPZSHOCK</button></div>' : ''}
    <ol class="sub pasos"><li>En <b>Chrome</b>, toca el menú <b>⋮</b> (arriba a la derecha).</li>
      <li>Toca <b>«Instalar aplicación»</b> o <b>«Añadir a pantalla de inicio»</b>.</li>
      <li>Abre la app desde el icono <b>EP</b>.</li></ol></div>`;
}

function pantallaInstalar(recienRegistrado) {
  modoPublico(`
    <div class="bienvenida"><img src="icon-512.png" alt="" class="bienvenida-logo">
      <h1>${recienRegistrado ? '¡Cuenta creada! 💪' : 'Instala la app'}</h1>
      <p class="sub">Instálala en tu pantalla de inicio para abrirla como cualquier app y entrenar aunque no tengas internet.</p></div>
    ${guiaInstalacion()}
    <div class="botones"><button class="boton sec ancho" data-action="c-continuar">Continuar en el navegador</button></div>`);
}

EXTRA.acciones['c-instalar'] = async () => {
  if (!avisoInstalar) return;
  avisoInstalar.prompt();
  const r = await avisoInstalar.userChoice.catch(() => null);
  avisoInstalar = null;
  if (r?.outcome === 'accepted') aviso('Instalada ✓ Ábrela desde tu pantalla de inicio');
};
EXTRA.acciones['c-continuar'] = () => arrancarCliente();
EXTRA.acciones['c-guia-instalar'] = () => pantallaInstalar(false);
EXTRA.acciones['c-ocultar-instalar'] = () => { try { localStorage.setItem('epzshock:sin-aviso-instalar', '1'); } catch (e) { /* sin almacenamiento */ } renderCliente(); };
const mostrarAvisoInstalar = () => { try { return !estaInstalada() && !localStorage.getItem('epzshock:sin-aviso-instalar'); } catch (e) { return !estaInstalada(); } };

// Animación del ejercicio: la que trae la rutina o, si es una rutina antigua, la de la biblioteca por nombre
const demoDe = it => it.demo || (DEMOS[it.nombre] ? `ejercicios/${DEMOS[it.nombre]}` : '');

const ESTADO_COMPRA = {
  pendiente: ['no', 'Pendiente de pago'], avisado: ['acento', 'Erik está verificando tu pago'],
  pagado: ['ok', 'Pagado ✓'], rechazado: ['fuego', 'Pago no recibido'], cancelado: ['', 'Cancelada'],
};
function cPlanes() {
  const lista = cli.servicios || [];
  const compras = (cli.compras || []).filter(c => c.estado !== 'cancelado').slice(0, 5);
  return `
    <h1>Planes 🛒</h1>
    <p class="sub">${esAppNativa() ? 'Elige tu plan y Erik te contacta para confirmarlo.' : 'Compra tu plan con transferencia bancaria. Erik confirma tu pago y te activa.'}</p>
    ${compras.length ? `<h2>Mis compras</h2>${compras.map(c => {
      const [cls, txt] = ESTADO_COMPRA[c.estado] || ['', c.estado];
      return `<div class="tarjeta"><div class="fila"><b class="trunc">${esc(c.servicio_nombre)}</b><span class="chip ${cls}">${txt}</span></div>
        <div class="sub">${esc(dinero(c.monto))} MXN · referencia <b>${esc(c.referencia)}</b> · ${fechaBonita(c.creada_en)}</div>
        ${c.estado === 'pendiente' ? `<div class="botones"><button class="boton mini" data-action="c-ver-pago" data-id="${esc(c.id)}">Ver datos de pago</button></div>` : ''}
        ${c.estado === 'avisado' && linkCorreoComprobante(c) ? `<div class="botones"><a class="boton sec mini" href="${esc(linkCorreoComprobante(c))}">📧 Enviar comprobante</a></div>` : ''}</div>`;
    }).join('')}` : ''}
    ${lista.length ? htmlPlanes(lista, 'cliente', cli.cupos || {}) : `<div class="vacio">${Nube.enLinea() ? 'Pronto verás aquí los planes disponibles.' : 'Conéctate a internet para ver los planes.'}</div>`}`;
}

// Abre el correo del cliente ya dirigido a Erik; el cliente solo adjunta la captura
function linkCorreoComprobante(c) {
  const correo = cli.pago?.correo;
  if (!correo || !/^[^@\s<>"?&]+@[^@\s<>"?&]+$/.test(correo)) return '';
  const asunto = `Comprobante ${c.referencia} · ${c.servicio_nombre}`;
  const cuerpo = `Hola Erik:\n\nTe envío el comprobante de mi transferencia.\n\nServicio: ${c.servicio_nombre}\nMonto: ${dinero(c.monto)} MXN\nReferencia: ${c.referencia}\nNombre: ${cli.perfil?.nombre || ''}\n\n(Adjunta aquí la captura de tu transferencia)`;
  return `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}
const botonesComprobante = c => {
  const mail = linkCorreoComprobante(c);
  return `${mail ? `<a class="boton ancho" href="${esc(mail)}">📧 Enviar comprobante por correo</a>` : ''}
    ${cli.whatsappErik ? `<a class="boton sec ancho" target="_blank" rel="noopener noreferrer" href="${linkWhats(cli.whatsappErik, `Hola Erik, te envío mi comprobante de ${c.servicio_nombre} (${dinero(c.monto)} MXN) · referencia ${c.referencia}`)}">Enviar comprobante por WhatsApp</a>` : ''}`;
};
const formatoClabe = c => String(c || '').replace(/^(\d{3})(\d{3})(\d{11})(\d)$/, '$1 $2 $3 $4');
function modalPago(c) {
  const p = cli.pago || {};
  abrirModal(`
    <h2>Paga tu ${esc(c.servicio_nombre)}</h2>
    <p class="sub">Haz una transferencia (SPEI) desde la app de tu banco con estos datos:</p>
    <div class="tarjeta pago">
      <div><span class="sub">Monto exacto</span><b class="plan-precio">${esc(dinero(c.monto))} MXN</b></div>
      <div><span class="sub">CLABE</span><b class="clabe">${esc(formatoClabe(p.clabe))}</b>
        <button class="boton sec mini" data-action="c-copiar" data-valor="${esc(p.clabe)}">Copiar CLABE</button></div>
      <div><span class="sub">Banco</span><b>${esc(p.banco || '')}</b></div>
      <div><span class="sub">Beneficiario</span><b>${esc(p.titular || '')}</b></div>
      <div><span class="sub">Concepto / referencia (escríbelo en la transferencia)</span><b class="clabe">${esc(c.referencia)}</b>
        <button class="boton sec mini" data-action="c-copiar" data-valor="${esc(c.referencia)}">Copiar referencia</button></div>
    </div>
    <p class="aviso-nota">Cuando Erik vea tu pago en su cuenta lo confirma y te activa el servicio. Si algo no cuadra, te escribe por el chat.</p>
    <div class="botones">
      <button class="boton ancho" data-action="c-ya-transferi" data-id="${esc(c.id)}">Ya hice la transferencia</button>
      <button class="boton sec ancho" data-action="cerrar">La hago después</button>
    </div>`);
}

EXTRA.acciones['c-comprar'] = el => {
  const s = (cli.servicios || []).find(x => x.id === el.dataset.id);
  if (!s) return;
  abrirModal(`
    <h2>${esc(s.nombre)}</h2>
    <p class="plan-precio">${esc(precioTexto(s))}</p>
    ${(s.incluye || []).length ? `<ul class="plan-incluye">${s.incluye.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
    <p class="sub" style="margin-top:8px">Se pagará por transferencia bancaria. Al continuar te damos los datos y una referencia única.</p>
    <div class="botones"><button class="boton ancho" data-action="c-confirmar-compra" data-id="${esc(s.id)}">Continuar al pago</button>
      <button class="boton sec ancho" data-action="cerrar">Cancelar</button></div>`);
};
EXTRA.acciones['c-confirmar-compra'] = async el => {
  el.disabled = true;
  try {
    const c = await Nube.comprar(el.dataset.id);
    cli.compras = [c, ...(cli.compras || [])];
    if (c.servicio_id) cli.cupos = { ...(cli.cupos || {}), [c.servicio_id]: ((cli.cupos || {})[c.servicio_id] || 0) + 1 };
    modalPago(c);
  } catch (e) { aviso(e.message); el.disabled = false; }
};
EXTRA.acciones['c-ver-pago'] = el => { const c = (cli.compras || []).find(x => x.id === el.dataset.id); if (c) modalPago(c); };
EXTRA.acciones['c-copiar'] = el => {
  navigator.clipboard?.writeText(el.dataset.valor).then(() => aviso('Copiado ✓'), () => aviso(el.dataset.valor));
};
EXTRA.acciones['c-ya-transferi'] = async el => {
  const c = (cli.compras || []).find(x => x.id === el.dataset.id);
  try {
    await Nube.avisarTransferencia(c.id);
    c.estado = 'avisado';
    await Nube.pedirServicio(`💸 Ya transferí ${dinero(c.monto)} MXN por ${c.servicio_nombre} · referencia ${c.referencia}`).catch(() => {});
    renderCliente();
    abrirModal(`<h2>¡Gracias! 🙌</h2>
      <p class="sub">Último paso: manda la captura de tu transferencia a Erik para que la confirme más rápido.</p>
      <div class="botones">${botonesComprobante(c)}<button class="boton sec ancho" data-action="cerrar">Listo</button></div>`);
  } catch (e) { aviso(e.message); }
};

EXTRA.acciones['c-quiero'] = el => {
  const s = (cli.servicios || []).find(x => x.id === el.dataset.id);
  if (!s) return;
  const texto = `🛒 Quiero contratar: ${s.nombre}${mostrarPrecios() && s.precio != null ? ` (${precioTexto(s)})` : ''}`;
  abrirModal(`
    <h2>${esc(s.nombre)}</h2>
    ${mostrarPrecios() ? `<p class="plan-precio">${esc(precioTexto(s))}</p>` : ''}
    <p class="sub">Le avisamos a Erik que te interesa este plan. Él te escribe para confirmarlo y acordar el pago.</p>
    <div class="botones">
      <button class="boton ancho" data-action="c-pedir" data-texto="${esc(texto)}">Enviar pedido a Erik</button>
      ${cli.whatsappErik ? `<a class="boton sec ancho" target="_blank" rel="noopener noreferrer" href="${linkWhats(cli.whatsappErik, texto + ' — ' + (cli.perfil?.nombre || ''))}">Escribirle por WhatsApp</a>` : ''}
      <button class="boton sec ancho" data-action="cerrar">Cancelar</button>
    </div>`);
};
EXTRA.acciones['c-pedir'] = async el => {
  try {
    await Nube.pedirServicio(el.dataset.texto);
    cli.mensajes.push({ autor: 'cliente', texto: el.dataset.texto, creado_en: new Date().toISOString() });
    cerrarModal(); aviso('Pedido enviado a Erik ✓ Te contactará pronto');
  } catch (e) { aviso(e.message); }
};

function cRutinas() {
  const lista = rutinasVisibles();
  const nombre = (cli.perfil?.nombre || '').split(' ')[0];
  return `
    <h1>Hola, ${esc(nombre)} ⚡</h1>
    <p class="sub">Tus rutinas activas${cli.local.cola.length ? ` · ${cli.local.cola.length} entreno(s) por enviar` : ''}</p>
    ${mostrarAvisoInstalar() ? `<div class="tarjeta asistente"><div><b>📲 Instala la app</b><p class="sub">Ábrela desde tu pantalla de inicio y entrena sin internet.</p></div>
      <div class="botones" style="margin:0;flex-direction:column"><button class="boton mini" data-action="c-guia-instalar">Cómo</button>
      <button class="enlace" style="font-size:.8rem" data-action="c-ocultar-instalar">Ahora no</button></div></div>` : ''}
    ${cli.local.activo ? `<div class="tarjeta" style="border-color:var(--acento)"><div class="fila"><div><span class="chip acento">EN CURSO</span><h3 style="margin-top:6px">${esc(cli.local.activo.nombre)}</h3></div>
      <button class="boton" data-action="c-ver-entreno">Continuar</button></div></div>` : ''}
    ${lista.length ? lista.map(r => {
      const desc = !!cli.local.descargas[r.id];
      return `<div class="tarjeta">
        <div class="click" data-action="c-ver-rutina" data-id="${r.id}">
          <div class="fila"><b class="trunc">${esc(r.nombre)}</b><span class="chip ${new Date(r.activa_hasta) - Date.now() < 2 * 864e5 ? 'no' : ''}">⏳ ${quedan(r.activa_hasta)}</span></div>
          <div class="sub">${(r.contenido.items || []).length} ejercicios</div>
        </div>
        <div class="botones">
          <button class="boton mini" data-action="c-ver-rutina" data-id="${r.id}">Ver y entrenar</button>
          ${desc ? '<span class="chip ok">⬇ Descargada</span>' : `<button class="boton sec mini" data-action="c-descargar" data-id="${r.id}">⬇ Descargar</button>`}
        </div></div>`;
    }).join('') : `<div class="vacio">${cli.cargando ? 'Cargando…' : 'No tienes rutinas activas ahora mismo.<br>Erik te las activará pronto 💪'}</div>`}
    ${cli.entrenos.length ? `<h2>Tus últimos entrenos</h2>${cli.entrenos.slice(0, 5).map(e => `<div class="tarjeta fila"><b class="trunc">${esc(e.nombre)}</b><span class="sub">${fechaBonita(e.fecha)}</span></div>`).join('')}` : ''}
  `;
}

const rutinaPorId = id => rutinasVisibles().find(r => r.id === id) || cli.local.descargas[id];

function cRutina() {
  const r = rutinaPorId(cli.id);
  if (!r) { cli.vista = null; return cRutinas(); }
  const c = r.contenido;
  return `
    <button class="enlace" data-action="c-tab" data-tab-c="rutinas">← Rutinas</button>
    <h1 style="margin-top:6px">${esc(r.nombre)}</h1>
    <p class="sub">Disponible ${quedan(r.activa_hasta)} más · hasta ${fechaBonita(r.activa_hasta)}</p>
    ${c.notas ? `<div class="tarjeta sub">${esc(c.notas)}</div>` : ''}
    <div class="botones"><button class="boton" data-action="c-empezar" data-id="${r.id}">⚡ Empezar entreno</button>
      ${cli.local.descargas[r.id] ? '<span class="chip ok">⬇ Disponible sin internet</span>' : `<button class="boton sec" data-action="c-descargar" data-id="${r.id}">⬇ Descargar</button>`}</div>
    <h2>Ejercicios</h2>
    ${(c.items || []).map((it, i) => `
      <details class="tarjeta">
        <summary class="fila-izq">${htmlDemo(demoDe(it), 'mini')}<div style="min-width:0"><b>${i + 1}. ${esc(it.nombre)}</b><div class="sub">${esc(it.series)} × ${esc(it.reps)}${it.carga ? ` · ${esc(it.carga)} kg` : ''} · descanso ${esc(it.descanso)}s</div></div></summary>
        ${demoDe(it) ? `<div style="margin-top:10px">${htmlDemo(demoDe(it))}</div>` : ''}
        ${it.notas ? `<p style="margin-top:8px">📌 ${esc(it.notas)}</p>` : ''}
        ${it.como ? `<p class="sub" style="margin-top:8px"><b>Cómo se hace:</b> ${esc(it.como)}</p>` : ''}
        ${it.clave ? `<p class="sub" style="margin-top:6px"><b>Clave:</b> ${esc(it.clave)}</p>` : ''}
        ${urlSegura(it.video) ? `<a class="boton sec mini" style="margin-top:8px" href="${esc(urlSegura(it.video))}" target="_blank" rel="noopener noreferrer">▶ Ver vídeo</a>` : ''}
      </details>`).join('')}
  `;
}

/* ----- Entreno del cliente (se guarda en el teléfono en cada toque) ----- */
function cEntreno() {
  const a = cli.local.activo;
  if (!a) { cli.vista = null; return cRutinas(); }
  return `
    <div class="entreno-cab fila"><b class="trunc">${esc(a.nombre)}</b><span class="reloj" id="c-reloj">${duracion((Date.now() - a.inicio) / 1000)}</span></div>
    ${a.ejercicios.map((e, ei) => `
      <div class="tarjeta"><b>${ei + 1}. ${esc(e.nombre)}</b>
        ${demoDe(e) ? `<div style="margin:8px 0">${htmlDemo(demoDe(e), 'media')}</div>` : ''}
        <div class="sub">Objetivo: ${esc(e.reps)} reps · descanso ${e.descanso}s</div>
        <div class="serie-cab"><span>#</span><span>kg</span><span>reps</span><span></span></div>
        ${e.series.map((s, si) => `<div class="serie"><span class="n">${si + 1}</span>
          <input type="number" inputmode="decimal" step="0.5" value="${esc(s.carga)}" placeholder="kg" data-input="c-serie" data-campo="carga" data-e="${ei}" data-s="${si}" aria-label="Kilos">
          <input type="number" inputmode="numeric" value="${esc(s.reps)}" placeholder="${esc(e.reps)}" data-input="c-serie" data-campo="reps" data-e="${ei}" data-s="${si}" aria-label="Repeticiones">
          <button class="check ${s.hecha ? 'hecho' : ''}" data-action="c-check" data-e="${ei}" data-s="${si}" aria-label="Serie hecha">✓</button></div>`).join('')}
      </div>`).join('')}
    <label>¿Cómo te sentiste? (1-10)</label><input type="number" min="1" max="10" value="${esc(a.rpe)}" data-input="c-activo" data-campo="rpe">
    <label>Notas para Erik</label><textarea data-input="c-activo" data-campo="notas">${esc(a.notas)}</textarea>
    <div class="botones"><button class="boton ancho" data-action="c-terminar">✓ Terminar y guardar</button>
      <button class="boton peligro ancho" data-action="c-descartar">Descartar</button></div>`;
}
let cReloj;
function tickCliente() {
  clearInterval(cReloj);
  cReloj = setInterval(() => {
    const a = cli.local.activo, r = $('#c-reloj');
    if (!a || !r) return clearInterval(cReloj);
    r.textContent = duracion((Date.now() - a.inicio) / 1000);
    if (descanso.fin && descanso.fin <= Date.now()) {
      descanso.fin = 0; $('#descanso')?.remove();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]); pitido(); aviso('⚡ ¡Siguiente serie!');
    } else if (descanso.fin) { const t = $('#descanso-t'); if (t) t.textContent = duracion((descanso.fin - Date.now()) / 1000); }
  }, 250);
}

/* ----- Retos ----- */
function cRetos() {
  return `
    <h1>Retos 🔥</h1><p class="sub">El top de cada reto es público; el progreso completo es para los inscritos.</p>
    ${cli.retos.length ? cli.retos.map(r => {
      const dentro = cli.accesos.includes(r.id);
      return `<div class="tarjeta reto-cab">
        <div class="fila"><b class="trunc">${esc(r.nombre)}</b>${dentro ? '<span class="chip ok">Inscrito</span>' : ''}</div>
        <div class="sub">${fechaBonita(r.inicio)} → ${fechaBonita(r.fin)}${r.premio ? ` · 🏆 ${esc(r.premio)}` : ''}</div>
        ${r.ganador ? `<p style="margin-top:6px"><b>🏆 Ganador: ${esc(r.ganador)}</b></p>` : ''}
        <div style="margin-top:8px">${(r.top || []).map(t => `<div class="fila"><span>${['🥇', '🥈', '🥉'][t.puesto - 1] || t.puesto} ${esc(t.nombre)}</span><b class="puntos" style="font-size:.95rem">${esc(t.puntos)}</b></div>`).join('') || '<p class="sub">Aún sin resultados</p>'}</div>
        <div class="botones">${dentro ? `<button class="boton mini" data-action="c-ver-reto" data-id="${esc(r.id)}">Ver mi progreso y ranking completo</button>`
          : '<span class="sub">🔒 Pídele a Erik que te inscriba para ver el progreso completo.</span>'}</div>
      </div>`;
    }).join('') : '<div class="vacio">No hay retos publicados ahora mismo.</div>'}`;
}

let detalleReto = null;
function cReto() {
  const r = cli.retos.find(x => x.id === cli.id);
  if (!r) { cli.vista = null; return cRetos(); }
  const d = detalleReto;
  const yo = cli.perfil?.id;
  return `
    <button class="enlace" data-action="c-tab" data-tab-c="retos">← Retos</button>
    <h1 style="margin-top:6px">${esc(r.nombre)}</h1>
    ${!d ? '<div class="vacio">Cargando…</div>' : `
      <h2>Ranking completo</h2>
      ${d.ranking.map(x => `<div class="tarjeta ranking-fila" ${x.cuenta === yo ? 'style="border-color:var(--acento)"' : ''}>
        <span class="puesto">${x.puesto <= 3 && x.puntos !== '—' ? ['🥇', '🥈', '🥉'][x.puesto - 1] : x.puesto}</span>
        <div class="trunc"><b>${esc(x.nombre)}${x.cuenta === yo ? ' (tú)' : ''}</b>${x.meta ? `<div class="barra-meta"><i style="width:${x.meta}%"></i></div>` : ''}</div>
        <span class="puntos">${esc(x.puntos)}</span></div>`).join('')}
      <h2>Muro de resultados</h2>
      ${d.muro.length ? d.muro.map(m => `<div class="tarjeta post"><div class="fila"><b>${esc(m.nombre)}</b><span class="sub">${fechaBonita(m.fecha)}</span></div>
        <div><span class="puntos" style="font-size:1rem">${esc(m.valor)}</span>${m.nota ? ` · <span class="sub">${esc(m.nota)}</span>` : ''}</div></div>`).join('') : '<div class="vacio">Aún no hay publicaciones.</div>'}`}
  `;
}

/* ----- Chat de ayuda ----- */
let enviandoChat = false;
const CLASE_BURBUJA = { cliente: 'yo', asistente: 'bot', entrenador: 'erik' };
function cAyuda() {
  return `
    <h1>Ayuda 💬</h1>
    <p class="sub">${cli.iaActiva ? 'Pregunta tus dudas sobre tus rutinas. Responde el asistente de Erik; cuando haga falta, Erik te contesta en persona.'
      : 'Escríbele a Erik tus dudas sobre tus rutinas: te responde aquí en cuanto pueda. Para técnica, abre cada ejercicio de tu rutina.'}</p>
    <div class="chat">
      ${cli.mensajes.length ? cli.mensajes.map(m => `<div class="burbuja ${CLASE_BURBUJA[m.autor]}">
        ${m.autor === 'entrenador' ? '<b>Erik</b><br>' : m.autor === 'asistente' ? '<b>Asistente EPZ</b><br>' : ''}${esc(m.texto).replace(/\n/g, '<br>')}</div>`).join('')
        : `<div class="vacio">¿Tienes dudas de técnica, series o descansos? Escríbele${cli.iaActiva ? 's aquí' : ' a Erik aquí'}.</div>`}
      ${enviandoChat && cli.iaActiva ? '<div class="burbuja bot escribiendo">Escribiendo…</div>' : ''}
      <span id="chat-fin"></span>
    </div>
    <form data-form="c-chat" class="chat-entrada">
      <textarea name="texto" maxlength="1000" placeholder="${Nube.enLinea() ? 'Escribe tu pregunta…' : 'Necesitas internet para el chat'}" ${Nube.enLinea() ? '' : 'disabled'} required></textarea>
      <button class="boton" type="submit" ${Nube.enLinea() && !enviandoChat ? '' : 'disabled'}>Enviar</button>
    </form>`;
}
EXTRA.forms['c-chat'] = async d => {
  const texto = String(d.texto || '').trim();
  if (!texto || enviandoChat) return;
  cli.mensajes.push({ autor: 'cliente', texto, creado_en: new Date().toISOString() });
  enviandoChat = true; renderCliente();
  try {
    const r = await Nube.enviarChat(texto);
    if (r.respuesta) cli.mensajes.push({ autor: 'asistente', texto: r.respuesta, creado_en: new Date().toISOString() });
    else aviso('Enviado a Erik ✓');
  } catch (e) { aviso(e.message); cli.mensajes.pop(); }
  enviandoChat = false; renderCliente();
};

/* ----- Perfil, beneficios y recomendaciones ----- */
function cPerfil() {
  const b = cli.beneficios, p = cli.perfil || {};
  const link = b ? Nube.linkReferido(b.codigo_referido) : '';
  return `
    <h1>${esc(p.nombre || 'Mi perfil')}</h1>
    <p class="sub">Cliente desde ${fechaBonita(p.cliente_desde)}</p>
    ${b ? `
      <div class="tarjeta asistente" style="display:block">
        <b>🎁 Tus beneficios</b>
        <p style="margin-top:6px">${b.descuento_lealtad ? `🎉 Tienes <b>${b.descuento_lealtad}% de descuento</b> por llevar ${b.meses} meses entrenando con Erik.`
          : `Llevas ${b.meses} ${b.meses === 1 ? 'mes' : 'meses'}. A los ${b.meses_lealtad} meses desbloqueas un descuento por lealtad. 💪`}</p>
      </div>
      <div class="tarjeta">
        <b>👯 Invita a un amigo</b>
        <p class="sub" style="margin-top:4px">Comparte tu link: tu amigo tiene ${b.descuento_amigo}% de descuento al empezar y tú ganas ${b.premio_referidor}% cuando se una.
          ${b.referidos_activos ? `<br>Amigos que se unieron: <b>${b.referidos_activos}</b> 🔥` : ''}</p>
        <input readonly value="${esc(link)}" style="margin-top:8px" aria-label="Tu link de recomendación">
        <div class="botones">
          <button class="boton" data-action="c-compartir-ref">Compartir</button>
          <a class="boton sec" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`¡Entreno con Erik Perez en EPZSHOCK y me está funcionando! 🔥 Únete con mi link y obtén un descuento: ${link}`)}">WhatsApp</a>
        </div>
      </div>` : `<div class="vacio">${Nube.enLinea() ? 'Cargando…' : 'Conéctate para ver tus beneficios.'}</div>`}
    <form data-form="c-perfil" class="tarjeta">
      <b>Mis datos</b>
      <label>Nombre</label><input name="nombre" value="${esc(p.nombre)}" maxlength="80" required>
      <label>WhatsApp</label><input name="telefono" value="${esc(p.telefono)}" maxlength="20" inputmode="tel">
      <div class="botones"><button class="boton sec" type="submit">Guardar</button></div>
    </form>
    <div class="tarjeta">${bloqueTema()}</div>
    <div class="botones"><button class="boton peligro" data-action="c-salir">Cerrar sesión</button></div>
    <p class="aviso-nota" style="text-align:center"><a class="enlace" href="privacidad.html" target="_blank" rel="noopener">Política de privacidad</a> ·
      <button class="enlace" style="color:var(--peligro)" data-action="c-eliminar">Eliminar mi cuenta</button></p>`;
}
EXTRA.forms['c-perfil'] = async d => {
  try { await Nube.actualizarPerfil(cli.perfil.id, d); Object.assign(cli.perfil, d); cli.local.perfil = cli.perfil; guardarCli(); aviso('Guardado ✓'); renderCliente(); }
  catch (e) { aviso(e.message); }
};

/* ----- Acciones del cliente ----- */
Object.assign(EXTRA.acciones, {
  'c-tab'(el) { cli.tab = el.dataset.tabC; cli.vista = null; renderCliente(); window.scrollTo(0, 0); if (Nube.enLinea() && cli.tab !== 'rutinas') refrescarCliente(); },
  'c-ver-rutina'(el) { cli.tab = 'rutinas'; cli.vista = 'rutina'; cli.id = el.dataset.id; renderCliente(); window.scrollTo(0, 0); },
  'c-descargar'(el) {
    const r = rutinaPorId(el.dataset.id);
    if (!r) return;
    cli.local.descargas[r.id] = r; guardarCli();
    // Guarda también las fotos de los ejercicios para verlas sin internet (las cachea el service worker)
    (r.contenido.items || []).map(demoDe).filter(Boolean).forEach(d => ['0', '1'].forEach(n => fetch(`${d}/${n}.jpg`).catch(() => {})));
    aviso('⬇ Descargada: disponible sin internet'); renderCliente();
  },
  'c-empezar'(el) {
    if (cli.local.activo && !confirm('Tienes un entreno en curso. ¿Empezar uno nuevo y descartarlo?')) return;
    const r = rutinaPorId(el.dataset.id);
    cli.local.activo = {
      id: crypto.randomUUID ? crypto.randomUUID() : uid(), rutina_id: r.id, nombre: r.nombre, inicio: Date.now(), rpe: '', notas: '',
      ejercicios: (r.contenido.items || []).map(it => ({ nombre: it.nombre, demo: demoDe(it), reps: it.reps, descanso: Number(it.descanso) || 0,
        series: Array.from({ length: Number(it.series) || 1 }, () => ({ carga: it.carga || '', reps: '', hecha: false })) })),
    };
    guardarCli(); cli.vista = 'entreno'; renderCliente(); window.scrollTo(0, 0);
  },
  'c-ver-entreno'() { cli.vista = 'entreno'; renderCliente(); },
  'c-check'(el) {
    const e = cli.local.activo.ejercicios[Number(el.dataset.e)], s = e.series[Number(el.dataset.s)];
    s.hecha = !s.hecha;
    if (s.hecha && !s.reps) s.reps = String(e.reps).split(/[-–]/).pop().replace(/\D/g, '');
    const sig = e.series[Number(el.dataset.s) + 1];
    if (s.hecha && sig && !sig.carga) sig.carga = s.carga;
    guardarCli(); renderCliente();
    if (s.hecha) { if (navigator.vibrate) navigator.vibrate(30); iniciarDescanso(e.descanso); }
  },
  async 'c-terminar'() {
    const a = cli.local.activo;
    const fin = Date.now();
    cli.local.cola.push({ id: a.id, rutina_id: a.rutina_id, nombre: a.nombre, fecha: new Date(fin).toISOString(),
      datos: { duracion: Math.round((fin - a.inicio) / 1000), rpe: a.rpe, notas: a.notas, ejercicios: a.ejercicios } });
    cli.local.activo = null; descanso.fin = 0; guardarCli();
    cli.vista = null; cli.tab = 'rutinas';
    aviso(Nube.enLinea() ? 'Entreno guardado 💪' : 'Guardado en el teléfono: se enviará al tener internet');
    renderCliente();
    if (Nube.enLinea()) refrescarCliente();
  },
  'c-descartar'() { if (confirm('¿Descartar este entreno?')) { cli.local.activo = null; descanso.fin = 0; guardarCli(); cli.vista = null; renderCliente(); } },
  async 'c-ver-reto'(el) {
    cli.tab = 'retos'; cli.vista = 'reto'; cli.id = el.dataset.id; detalleReto = null; renderCliente();
    try { detalleReto = await Nube.retoDetalle(cli.id); } catch (e) { aviso(e.message); }
    detalleReto = detalleReto || { ranking: [], muro: [] }; renderCliente();
  },
  async 'c-compartir-ref'() {
    const link = Nube.linkReferido(cli.beneficios.codigo_referido);
    const texto = '¡Entreno con Erik Perez en EPZSHOCK! 🔥 Únete con mi link y obtén un descuento:';
    if (navigator.share) { try { await navigator.share({ title: 'EPZSHOCK', text: texto, url: link }); } catch (e) { /* cancelado */ } }
    else { navigator.clipboard?.writeText(`${texto} ${link}`); aviso('Link copiado ✓'); }
  },
  async 'c-eliminar'() {
    if (!confirm('Se borrará tu cuenta con tus entrenos, mensajes y rutinas. No se puede deshacer. ¿Eliminar?')) return;
    if (!confirm('Última confirmación: ¿eliminar tu cuenta definitivamente?')) return;
    try {
      await Nube.eliminarCuenta();
      localStorage.removeItem(CLAVE_CLI); cli.local = cargarCli(); cli.perfil = null;
      pantallaBienvenida('Tu cuenta y tus datos se eliminaron. ¡Gracias por entrenar con nosotros!');
    } catch (e) { aviso(e.message); }
  },
  async 'c-salir'() {
    if (cli.local.cola.length && !confirm('Tienes entrenos sin enviar. Si cierras sesión se perderán. ¿Continuar?')) return;
    await Nube.salir();
    localStorage.removeItem(CLAVE_CLI); cli.local = cargarCli(); cli.perfil = null;
    pantallaBienvenida();
  },
});

EXTRA.inputs['c-serie'] = el => {
  const s = cli.local.activo.ejercicios[Number(el.dataset.e)].series[Number(el.dataset.s)];
  s[el.dataset.campo] = el.value; guardarCli();
};
EXTRA.inputs['c-activo'] = el => { cli.local.activo[el.dataset.campo] = el.value; guardarCli(); };
