/* Epzshock (EPZ) — app de entrenamiento de Erik Perez.
   Todo se guarda en este dispositivo (localStorage) y funciona sin conexión. */
'use strict';

const CLAVE = 'epzshock:v1';
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const vista = $('#vista');
// Registro para los módulos extra (dieta, asistente, retos)
const EXTRA = { vistas: {}, acciones: {}, forms: {}, inputs: {} };
const modal = $('#modal');
const modalCuerpo = $('#modal-cuerpo');

/* ================= Datos ================= */
const GRUPOS = ['Pierna', 'Glúteo', 'Pecho', 'Espalda', 'Hombro', 'Brazo', 'Core', 'Cuerpo completo', 'Cardio', 'Movilidad', 'Otro'];


function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function estadoInicial() {
  return {
    version: 1,
    clientes: [],
    ejercicios: BIBLIOTECA.map(b => ({ id: uid(), video: '', notas: '', ...b })),
    biblioteca: BIBLIOTECA.length,
    sesiones: [],
    registros: [],
    pagos: [],
    dietas: [],
    retos: [],
    activo: null, // entreno en curso
  };
}

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) {
      const guardados = JSON.parse(crudo);
      const datos = Object.assign(estadoInicial(), guardados);
      if (guardados.biblioteca === BIBLIOTECA.length) return datos;
      // Datos de una versión anterior: añade los ejercicios nuevos sin tocar los del usuario
      if (!Array.isArray(guardados.ejercicios)) datos.ejercicios = [];
      sincronizarBiblioteca(datos);
      localStorage.setItem(CLAVE, JSON.stringify(datos));
      return datos;
    }
  } catch (e) { console.warn('No se pudieron leer los datos', e); }
  return estadoInicial();
}

let db = cargar();

function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(db));
  } catch (e) {
    aviso('⚠️ No se pudo guardar. Haz una copia de seguridad.');
  }
}

/* ================= Utilidades ================= */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const hoyISO = () => new Date().toISOString().slice(0, 10);
const mesISO = (d = new Date()) => d.toISOString().slice(0, 7);
function fechaBonita(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}
function mesBonito(ym) {
  const d = new Date(ym + '-15T12:00:00');
  const t = d.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function iniciales(nombre) {
  return nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
}
function dinero(n) {
  return '$' + (Number(n) || 0).toLocaleString('es', { maximumFractionDigits: 2 });
}
function duracion(seg) {
  const m = Math.floor(seg / 60), s = Math.floor(seg % 60);
  const h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
const porId = (lista, id) => db[lista].find(x => x.id === id);
const nombreEj = id => porId('ejercicios', id)?.nombre ?? 'Ejercicio borrado';

let toastTimer;
function aviso(texto) {
  const t = $('#toast');
  t.textContent = texto;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 2200);
}

function abrirModal(html) {
  modalCuerpo.innerHTML = html;
  if (!modal.open) modal.showModal();
  const primero = modalCuerpo.querySelector('input, select, textarea');
  if (primero) setTimeout(() => primero.focus(), 50);
}
function cerrarModal() { if (modal.open) modal.close(); }
modal.addEventListener('click', e => { if (e.target === modal) cerrarModal(); });

function datosForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

/* ================= Navegación ================= */
let ruta = { tab: 'hoy' };

function ir(nueva) {
  ruta = nueva;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('activo', b.dataset.tab === ruta.tab));
  render();
  window.scrollTo(0, 0);
}

function redirigir(r) {
  setTimeout(() => ir(r));
  return '';
}

function render() {
  const vistas = {
    hoy: vHoy, clientes: vClientes, cliente: vCliente, sesiones: vSesiones, sesion: vSesion,
    ejercicios: vEjercicios, pagos: vPagos, entreno: vEntreno, registro: vRegistro,
    ...EXTRA.vistas,
  };
  vista.innerHTML = (vistas[ruta.vista || ruta.tab] || vHoy)();
  if (ruta.vista === 'entreno') tickReloj();
}

/* ================= Vista: Hoy ================= */
function vHoy() {
  const mes = mesISO();
  const pendientes = db.clientes.filter(c => Number(c.cuota) > 0 && !pagoDe(c.id, mes)?.pagado);
  const ultimos = [...db.registros].sort((a, b) => b.fin - a.fin).slice(0, 5);
  const semana = db.registros.filter(r => Date.now() - r.fin < 7 * 864e5).length;
  const saludo = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 20 ? 'Buenas tardes' : 'Buenas noches';

  return `
    <h1>${saludo}, Erik ⚡</h1>
    <p class="sub">${new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</p>

    ${db.activo ? `
      <div class="tarjeta" style="border-color:var(--acento)">
        <div class="fila">
          <div><span class="chip acento">EN CURSO</span>
            <h3 style="margin-top:6px">${esc(db.activo.sesionNombre)}</h3>
            <p class="sub">${esc(porId('clientes', db.activo.clienteId)?.nombre ?? 'Sin cliente')}</p></div>
          <button class="boton" data-action="ver-entreno">Continuar</button>
        </div>
      </div>` : ''}

    <div class="stats">
      <div class="stat"><b>${db.clientes.length}</b><span>Clientes</span></div>
      <div class="stat"><b>${semana}</b><span>Entrenos 7 días</span></div>
      <div class="stat"><b>${pendientes.length}</b><span>Pagos pendientes</span></div>
    </div>

    <button class="boton ancho" data-action="nuevo-entreno">⚡ Empezar entreno</button>
    ${typeof bloqueRetosHoy === 'function' ? bloqueRetosHoy() : ''}

    ${pendientes.length ? `
      <h2>Cobros pendientes · ${mesBonito(mes)}</h2>
      ${pendientes.map(c => `
        <div class="tarjeta fila">
          <div class="fila-izq"><div class="avatar">${esc(iniciales(c.nombre))}</div>
            <div class="trunc"><b>${esc(c.nombre)}</b><div class="sub">${dinero(c.cuota)}</div></div></div>
          <button class="boton mini" data-action="marcar-pago" data-id="${c.id}" data-mes="${mes}">Cobrado</button>
        </div>`).join('')}` : ''}

    <h2>Últimos entrenos</h2>
    ${ultimos.length ? ultimos.map(tarjetaRegistro).join('') : `<div class="vacio">Aún no hay entrenos registrados.<br>Crea una sesión y pulsa «Empezar entreno».</div>`}
  `;
}

function tarjetaRegistro(r) {
  const cli = porId('clientes', r.clienteId);
  const series = r.ejercicios.reduce((n, e) => n + e.series.filter(s => s.hecha).length, 0);
  return `
    <div class="tarjeta click" data-action="ver-registro" data-id="${r.id}">
      <div class="fila"><b class="trunc">${esc(r.sesionNombre)}</b><span class="sub">${fechaBonita(new Date(r.fin).toISOString())}</span></div>
      <div class="sub">${esc(cli?.nombre ?? 'Sin cliente')} · ${series} series · ${duracion(r.duracion)}${r.rpe ? ` · RPE ${esc(r.rpe)}` : ''}</div>
    </div>`;
}

/* ================= Vista: Clientes ================= */
let filtroClientes = '';
function vClientes() {
  const lista = db.clientes
    .filter(c => c.nombre.toLowerCase().includes(filtroClientes.toLowerCase()))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  return `
    <div class="cabecera"><div><h1>Clientes</h1><p class="sub">${db.clientes.length} en total</p></div>
      <button class="boton" data-action="form-cliente">+ Nuevo</button></div>
    <input class="buscar" type="search" placeholder="Buscar cliente…" value="${esc(filtroClientes)}" data-input="filtro-clientes">
    ${lista.length ? lista.map(c => {
      const pago = pagoDe(c.id, mesISO());
      return `
        <div class="tarjeta click fila" data-action="ver-cliente" data-id="${c.id}">
          <div class="fila-izq"><div class="avatar">${esc(iniciales(c.nombre))}</div>
            <div class="trunc"><b>${esc(c.nombre)}</b><div class="sub trunc">${esc(c.objetivo || 'Sin objetivo definido')}</div></div></div>
          ${Number(c.cuota) > 0 ? `<span class="chip ${pago?.pagado ? 'ok' : 'no'}">${pago?.pagado ? 'Al día' : 'Pendiente'}</span>` : ''}
        </div>`;
    }).join('') : `<div class="vacio">${db.clientes.length ? 'Ningún cliente coincide.' : 'Añade tu primer cliente.'}</div>`}
  `;
}

function formCliente(c = {}) {
  abrirModal(`
    <h2>${c.id ? 'Editar cliente' : 'Nuevo cliente'}</h2>
    <form data-form="cliente" data-id="${c.id ?? ''}">
      <label>Nombre *</label><input name="nombre" required value="${esc(c.nombre)}">
      <div class="rejilla-2">
        <div><label>WhatsApp (con lada)</label><input name="telefono" inputmode="tel" placeholder="5215512345678" value="${esc(c.telefono)}"></div>
        <div><label>Cuota mensual</label><input name="cuota" type="number" min="0" step="0.01" value="${esc(c.cuota)}"></div>
      </div>
      <label>Objetivo</label><input name="objetivo" placeholder="Ej. bajar 6 kg, mejorar sentadilla…" value="${esc(c.objetivo)}">
      <label>Lesiones / notas</label><textarea name="notas">${esc(c.notas)}</textarea>
      <div class="botones">
        <button class="boton" type="submit">Guardar</button>
        <button class="boton sec" type="button" data-action="cerrar">Cancelar</button>
        ${c.id ? `<button class="boton peligro" type="button" data-action="borrar-cliente" data-id="${c.id}">Borrar</button>` : ''}
      </div>
    </form>`);
}

function vCliente() {
  const c = porId('clientes', ruta.id);
  if (!c) return redirigir({ tab: 'clientes' });
  const medidas = [...(c.medidas || [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const registros = db.registros.filter(r => r.clienteId === c.id).sort((a, b) => b.fin - a.fin);
  const prs = marcasPersonales(c.id);
  const ultima = medidas[medidas.length - 1];
  const primera = medidas[0];
  const dif = ultima && primera && ultima !== primera && ultima.peso && primera.peso ? (ultima.peso - primera.peso) : null;

  return `
    <button class="enlace" data-action="tab" data-tab="clientes">← Clientes</button>
    <div class="cabecera" style="margin-top:6px">
      <div class="fila-izq"><div class="avatar" style="width:52px;height:52px;font-size:1.2rem">${esc(iniciales(c.nombre))}</div>
        <div><h1>${esc(c.nombre)}</h1><p class="sub">${esc(c.objetivo || 'Sin objetivo definido')}</p></div></div>
    </div>
    ${c.notas ? `<div class="tarjeta sub">⚠︎ ${esc(c.notas)}</div>` : ''}
    <div class="botones">
      <button class="boton" data-action="nuevo-entreno" data-cliente="${c.id}">⚡ Entrenar</button>
      <button class="boton sec" data-action="form-medida" data-id="${c.id}">+ Medidas</button>
      <button class="boton sec" data-action="editar-cliente" data-id="${c.id}">Editar</button>
      <button class="boton sec" data-action="form-rutina" data-cliente="${c.id}">⚡ Rutina</button>
      <button class="boton sec" data-action="form-dieta" data-cliente="${c.id}">⚡ Dieta</button>
    </div>

    <div class="stats">
      <div class="stat"><b>${registros.length}</b><span>Entrenos</span></div>
      <div class="stat"><b>${ultima?.peso ? esc(ultima.peso) + '<small> kg</small>' : '—'}</b><span>Peso actual</span></div>
      <div class="stat"><b>${dif === null ? '—' : (dif > 0 ? '+' : '') + dif.toFixed(1)}</b><span>Cambio kg</span></div>
    </div>

    <h2>Evolución del peso</h2>
    <div class="tarjeta">${grafica(medidas.filter(m => m.peso).map(m => ({ x: m.fecha, y: Number(m.peso) })))}</div>

    ${medidas.length ? `
      <h2>Medidas</h2>
      <div class="tarjeta" style="overflow-x:auto"><table>
        <tr><th>Fecha</th><th>Peso</th><th>% grasa</th><th>Cintura</th><th>Cadera</th><th>Brazo</th><th></th></tr>
        ${[...medidas].reverse().map(m => `<tr>
          <td>${fechaBonita(m.fecha)}</td><td>${esc(m.peso || '—')}</td><td>${esc(m.grasa || '—')}</td>
          <td>${esc(m.cintura || '—')}</td><td>${esc(m.cadera || '—')}</td><td>${esc(m.brazo || '—')}</td>
          <td><button class="enlace" data-action="borrar-medida" data-id="${c.id}" data-medida="${m.id}" aria-label="Borrar medida">✕</button></td></tr>`).join('')}
      </table></div>` : ''}

    ${prs.length ? `
      <h2>Marcas personales 🏆</h2>
      <div class="tarjeta"><table>
        <tr><th>Ejercicio</th><th>Mejor carga</th><th>Reps</th></tr>
        ${prs.map(p => `<tr><td>${esc(p.nombre)}</td><td><b>${esc(p.carga)} kg</b></td><td>${esc(p.reps)}</td></tr>`).join('')}
      </table></div>` : ''}

    <h2>Historial</h2>
    ${registros.length ? registros.map(tarjetaRegistro).join('') : '<div class="vacio">Sin entrenos todavía.</div>'}
  `;
}

function formMedida(clienteId) {
  abrirModal(`
    <h2>Nuevas medidas</h2>
    <form data-form="medida" data-id="${clienteId}">
      <label>Fecha</label><input type="date" name="fecha" value="${hoyISO()}" required>
      <div class="rejilla-3">
        <div><label>Peso (kg)</label><input name="peso" type="number" step="0.1" inputmode="decimal"></div>
        <div><label>% grasa</label><input name="grasa" type="number" step="0.1" inputmode="decimal"></div>
        <div><label>Cintura (cm)</label><input name="cintura" type="number" step="0.1" inputmode="decimal"></div>
        <div><label>Cadera (cm)</label><input name="cadera" type="number" step="0.1" inputmode="decimal"></div>
        <div><label>Pecho (cm)</label><input name="pecho" type="number" step="0.1" inputmode="decimal"></div>
        <div><label>Brazo (cm)</label><input name="brazo" type="number" step="0.1" inputmode="decimal"></div>
      </div>
      <div class="botones"><button class="boton" type="submit">Guardar</button>
        <button class="boton sec" type="button" data-action="cerrar">Cancelar</button></div>
    </form>`);
}

function marcasPersonales(clienteId) {
  const mejor = {};
  db.registros.filter(r => r.clienteId === clienteId).forEach(r => r.ejercicios.forEach(e => e.series.forEach(s => {
    const carga = Number(s.carga);
    if (!s.hecha || !carga) return;
    if (!mejor[e.ejercicioId] || carga > mejor[e.ejercicioId].carga) {
      mejor[e.ejercicioId] = { nombre: e.nombre, carga, reps: s.reps };
    }
  })));
  return Object.values(mejor).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function grafica(puntos) {
  if (puntos.length < 2) return '<p class="sub">Registra al menos dos pesos para ver la gráfica.</p>';
  const W = 320, H = 120, P = 22;
  const ys = puntos.map(p => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const x = i => P + (i * (W - P * 2)) / (puntos.length - 1);
  const y = v => H - P - ((v - min) / (max - min)) * (H - P * 2);
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  return `<svg class="grafica" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Evolución del peso">
    <line class="eje" x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}"/>
    <path class="linea" d="${d}"/>
    ${puntos.map((p, i) => `<circle class="punto" cx="${x(i)}" cy="${y(p.y)}" r="3.5"/>`).join('')}
    <text x="${P}" y="12">${max.toFixed(1)} kg</text>
    <text x="${P}" y="${H - 6}">${min.toFixed(1)} kg</text>
  </svg>`;
}

/* ================= Vista: Sesiones ================= */
function vSesiones() {
  const lista = [...db.sesiones].sort((a, b) => a.nombre.localeCompare(b.nombre));
  return `
    ${segmentoEntreno('sesiones')}
    <div class="cabecera"><div><h1>Sesiones</h1><p class="sub">Tus plantillas de entrenamiento</p></div>
      <button class="boton" data-action="form-sesion">+ Nueva</button></div>
    <div class="tarjeta asistente">
      <div><b>⚡ Asistente EPZ</b><p class="sub">Genera una rutina completa en segundos según objetivo, días y lugar.</p></div>
      <button class="boton" data-action="form-rutina">Crear rutina</button>
    </div>
    ${lista.length ? lista.map(s => `
      <div class="tarjeta click" data-action="ver-sesion" data-id="${s.id}">
        <div class="fila"><b class="trunc">${esc(s.nombre)}</b><span class="chip">${s.items.length} ejercicios</span></div>
        <div class="sub trunc">${esc(s.items.map(i => nombreEj(i.ejercicioId)).join(' · ') || 'Sin ejercicios aún')}</div>
      </div>`).join('') : '<div class="vacio">Crea tu primera sesión (ej. «Pierna A», «Full body principiante»).</div>'}
  `;
}

function formSesion(s = {}) {
  abrirModal(`
    <h2>${s.id ? 'Renombrar sesión' : 'Nueva sesión'}</h2>
    <form data-form="sesion" data-id="${s.id ?? ''}">
      <label>Nombre *</label><input name="nombre" required value="${esc(s.nombre)}" placeholder="Ej. Pierna A">
      <label>Notas / calentamiento</label><textarea name="notas">${esc(s.notas)}</textarea>
      <div class="botones"><button class="boton" type="submit">Guardar</button>
        <button class="boton sec" type="button" data-action="cerrar">Cancelar</button></div>
    </form>`);
}

function vSesion() {
  const s = porId('sesiones', ruta.id);
  if (!s) return redirigir({ tab: 'sesiones' });
  return `
    <button class="enlace" data-action="tab" data-tab="sesiones">← Sesiones</button>
    <h1 style="margin-top:6px">${esc(s.nombre)}</h1>
    ${s.notas ? `<p class="sub">${esc(s.notas)}</p>` : ''}
    <div class="botones">
      <button class="boton" data-action="nuevo-entreno" data-sesion="${s.id}">⚡ Entrenar</button>
      <button class="boton sec" data-action="compartir-sesion" data-id="${s.id}">Enviar por WhatsApp</button>
      <button class="boton sec" data-action="editar-sesion" data-id="${s.id}">Renombrar</button>
      <button class="boton sec" data-action="duplicar-sesion" data-id="${s.id}">Duplicar</button>
    </div>
    <h2>Ejercicios</h2>
    ${s.items.length ? s.items.map((it, i) => `
      <div class="tarjeta item-ej">
        <div class="click" data-action="form-item" data-id="${s.id}" data-i="${i}">
          <b>${i + 1}. ${esc(nombreEj(it.ejercicioId))}</b>
          <div class="detalle">${esc(it.series)} × ${esc(it.reps)}${it.carga ? ` · ${esc(it.carga)} kg` : ''} · descanso ${esc(it.descanso)}s${it.notas ? ` · ${esc(it.notas)}` : ''}</div>
        </div>
        <div class="mover">
          <button data-action="mover-item" data-id="${s.id}" data-i="${i}" data-dir="-1" aria-label="Subir">↑</button>
          <button data-action="mover-item" data-id="${s.id}" data-i="${i}" data-dir="1" aria-label="Bajar">↓</button>
        </div>
      </div>`).join('') : '<div class="vacio">Añade ejercicios a esta sesión.</div>'}
    <button class="boton ancho" style="margin-top:6px" data-action="form-item" data-id="${s.id}">+ Añadir ejercicio</button>
    <div class="botones"><button class="boton peligro" data-action="borrar-sesion" data-id="${s.id}">Borrar sesión</button></div>
  `;
}

function opcionesEjercicios(sel) {
  return GRUPOS.map(g => {
    const ejs = db.ejercicios.filter(e => e.grupo === g).sort((a, b) => a.nombre.localeCompare(b.nombre));
    return ejs.length ? `<optgroup label="${g}">${ejs.map(e => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</optgroup>` : '';
  }).join('');
}

function formItem(sesionId, i) {
  const s = porId('sesiones', sesionId);
  const it = i !== undefined ? s.items[i] : { series: 3, reps: '10', carga: '', descanso: 90, notas: '' };
  abrirModal(`
    <h2>${i !== undefined ? 'Editar ejercicio' : 'Añadir ejercicio'}</h2>
    <form data-form="item" data-id="${sesionId}" data-i="${i ?? ''}">
      <label>Ejercicio</label><select name="ejercicioId" required>${opcionesEjercicios(it.ejercicioId)}</select>
      <div class="rejilla-2">
        <div><label>Series</label><input name="series" type="number" min="1" max="20" value="${esc(it.series)}" required></div>
        <div><label>Reps (ej. 8-10)</label><input name="reps" value="${esc(it.reps)}" required></div>
        <div><label>Carga (kg)</label><input name="carga" type="number" step="0.5" inputmode="decimal" value="${esc(it.carga)}"></div>
        <div><label>Descanso (seg)</label><input name="descanso" type="number" min="0" step="1" value="${esc(it.descanso)}"></div>
      </div>
      <label>Indicaciones</label><input name="notas" value="${esc(it.notas)}" placeholder="Tempo 3-1-1, RIR 2…">
      <div class="botones"><button class="boton" type="submit">Guardar</button>
        <button class="boton sec" type="button" data-action="cerrar">Cancelar</button>
        ${i !== undefined ? `<button class="boton peligro" type="button" data-action="borrar-item" data-id="${sesionId}" data-i="${i}">Quitar</button>` : ''}
      </div>
    </form>`);
}

function textoSesion(s) {
  const lineas = [`⚡ *${s.nombre}* — Epzshock`, ''];
  if (s.notas) lineas.push(s.notas, '');
  s.items.forEach((it, i) => {
    const ej = porId('ejercicios', it.ejercicioId);
    lineas.push(`${i + 1}. *${ej?.nombre ?? 'Ejercicio'}* — ${it.series}×${it.reps}${it.carga ? ` @ ${it.carga} kg` : ''} (desc. ${it.descanso}s)`);
    if (it.notas) lineas.push(`   ${it.notas}`);
    if (ej?.video) lineas.push(`   ▶ ${ej.video}`);
  });
  lineas.push('', '💪 ¡A darle! — Erik Perez');
  return lineas.join('\n');
}

function segmentoEntreno(activo) {
  return `<div class="segmento">
    <button class="${activo === 'sesiones' ? 'activo' : ''}" data-action="tab" data-tab="sesiones">Sesiones</button>
    <button class="${activo === 'ejercicios' ? 'activo' : ''}" data-action="ir-ejercicios">Ejercicios</button>
  </div>`;
}

/* ================= Vista: Ejercicios ================= */
let filtroEj = '';
let filtroTag = '';
function vEjercicios() {
  const f = normalizarNombre(filtroEj);
  const pasa = e => normalizarNombre(e.nombre + ' ' + (e.musculos || '')).includes(f) && (!filtroTag || (e.tags || []).includes(filtroTag));
  const grupos = GRUPOS.map(g => [g, db.ejercicios.filter(e => e.grupo === g && pasa(e)).sort((a, b) => a.nombre.localeCompare(b.nombre))]).filter(([, l]) => l.length);
  const total = grupos.reduce((n, [, l]) => n + l.length, 0);
  return `
    ${segmentoEntreno('ejercicios')}
    <div class="cabecera"><div><h1>Ejercicios</h1><p class="sub">${db.ejercicios.length} en tu biblioteca, explicados paso a paso</p></div>
      <button class="boton" data-action="form-ejercicio">+ Nuevo</button></div>
    <input class="buscar" type="search" placeholder="Buscar por nombre o músculo…" value="${esc(filtroEj)}" data-input="filtro-ej">
    <div class="filtros">
      <button class="filtro ${filtroTag ? '' : 'activo'}" data-action="filtro-tag" data-tag="">Todos</button>
      ${Object.entries(ETIQUETAS).map(([k, [ico, txt]]) => `<button class="filtro ${filtroTag === k ? 'activo' : ''}" data-action="filtro-tag" data-tag="${k}">${ico} ${txt}</button>`).join('')}
    </div>
    ${filtroTag || f ? `<p class="sub" style="margin-bottom:6px">${total} resultados</p>` : ''}
    ${filtroTag === 'rehab' ? '<div class="tarjeta sub">🩹 Ejercicios de recuperación orientativos. Ante lesión aguda, dolor fuerte o cirugía, coordina con fisioterapeuta o médico. Regla práctica: molestia ≤ 3/10 que no empeora al día siguiente.</div>' : ''}
    ${filtroTag === 'plio' ? '<div class="tarjeta sub">🦘 Progresión: primero aterrizajes y pogos, luego saltos al cajón y horizontales, al final drop jumps. Pocas repeticiones, máxima calidad y descanso completo.</div>' : ''}
    ${grupos.length ? grupos.map(([g, l]) => `
      <h2>${g} <span class="sub">(${l.length})</span></h2>
      ${l.map(e => `
        <div class="tarjeta click fila" data-action="ver-ejercicio" data-id="${e.id}">
          <div class="trunc"><b>${esc(e.nombre)}</b>
            <div class="sub trunc">${(e.tags || []).map(t => ETIQUETAS[t]?.[0] || '').join(' ')} ${esc(e.nivel || '')}${e.musculos ? ' · ' + esc(e.musculos) : ''}</div></div>
          ${e.video ? '<span class="chip acento">▶</span>' : ''}
        </div>`).join('')}`).join('') : '<div class="vacio">No hay ejercicios que coincidan.</div>'}
  `;
}

function verEjercicio(id) {
  const e = porId('ejercicios', id);
  if (!e) return;
  abrirModal(`
    <h2>${esc(e.nombre)}</h2>
    <div class="filtros" style="margin-bottom:6px">
      <span class="chip">${esc(e.grupo)}</span>${e.nivel ? `<span class="chip">${esc(e.nivel)}</span>` : ''}
      ${(e.tags || []).map(t => `<span class="chip acento">${ETIQUETAS[t]?.join(' ') || t}</span>`).join('')}
    </div>
    ${e.musculos ? `<p class="sub"><b>Músculos:</b> ${esc(e.musculos)}</p>` : ''}
    ${e.equipo ? `<p class="sub"><b>Material:</b> ${esc(e.equipo)}</p>` : ''}
    ${e.como ? `<h3 style="margin-top:14px">Cómo se hace</h3><p>${esc(e.como)}</p>` : ''}
    ${e.clave ? `<h3 style="margin-top:14px">Clave / errores comunes</h3><p>${esc(e.clave)}</p>` : ''}
    ${e.notas ? `<h3 style="margin-top:14px">Mis notas</h3><p>${esc(e.notas)}</p>` : ''}
    ${!e.como && !e.notas ? '<p class="sub">Aún no tiene explicación. Pulsa «Editar» para añadirla.</p>' : ''}
    <div class="botones">
      ${e.video ? `<a class="boton" href="${esc(e.video)}" target="_blank" rel="noopener">▶ Ver vídeo</a>` : ''}
      <button class="boton sec" data-action="form-ejercicio" data-id="${e.id}">Editar</button>
      <button class="boton sec" data-action="cerrar">Cerrar</button>
    </div>`);
}

function formEjercicio(id) {
  const e = id ? porId('ejercicios', id) : { grupo: 'Pierna', tags: [] };
  abrirModal(`
    <h2>${id ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h2>
    <form data-form="ejercicio" data-id="${id ?? ''}">
      <label>Nombre *</label><input name="nombre" required value="${esc(e.nombre)}">
      <div class="rejilla-2">
        <div><label>Grupo</label><select name="grupo">${GRUPOS.map(g => `<option ${g === e.grupo ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
        <div><label>Nivel</label><select name="nivel">${['', 'Principiante', 'Intermedio', 'Avanzado'].map(n => `<option ${n === (e.nivel || '') ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      </div>
      <label>Categorías</label>
      <div class="filtros">${Object.entries(ETIQUETAS).map(([k, [ico, txt]]) => `<label class="filtro check-tag"><input type="checkbox" name="tag-${k}" ${(e.tags || []).includes(k) ? 'checked' : ''}> ${ico} ${txt}</label>`).join('')}</div>
      <label>Músculos</label><input name="musculos" value="${esc(e.musculos)}">
      <label>Material</label><input name="equipo" value="${esc(e.equipo)}">
      <label>Cómo se hace</label><textarea name="como">${esc(e.como)}</textarea>
      <label>Clave / errores comunes</label><textarea name="clave">${esc(e.clave)}</textarea>
      <label>Enlace de vídeo (YouTube, Instagram, Drive…)</label><input name="video" type="url" placeholder="https://" value="${esc(e.video)}">
      <label>Mis notas</label><textarea name="notas">${esc(e.notas)}</textarea>
      <div class="botones"><button class="boton" type="submit">Guardar</button>
        <button class="boton sec" type="button" data-action="cerrar">Cancelar</button>
        ${id ? `<button class="boton peligro" type="button" data-action="borrar-ejercicio" data-id="${id}">Borrar</button>` : ''}
      </div>
    </form>`);
}

/* ================= Vista: Pagos ================= */
let mesPagos = mesISO();
const pagoDe = (clienteId, mes) => db.pagos.find(p => p.clienteId === clienteId && p.mes === mes);

function vPagos() {
  const conCuota = db.clientes.filter(c => Number(c.cuota) > 0).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const cobrado = conCuota.reduce((t, c) => { const p = pagoDe(c.id, mesPagos); return t + (p?.pagado ? Number(p.monto) : 0); }, 0);
  const esperado = conCuota.reduce((t, c) => t + Number(c.cuota), 0);
  return `
    <div class="cabecera"><div><h1>Pagos</h1><p class="sub">Controla quién te ha pagado</p></div></div>
    <div class="fila tarjeta">
      <button class="boton sec mini" data-action="mes" data-dir="-1" aria-label="Mes anterior">←</button>
      <b>${mesBonito(mesPagos)}</b>
      <button class="boton sec mini" data-action="mes" data-dir="1" aria-label="Mes siguiente">→</button>
    </div>
    <div class="stats">
      <div class="stat"><b>${dinero(cobrado)}</b><span>Cobrado</span></div>
      <div class="stat"><b>${dinero(Math.max(esperado - cobrado, 0))}</b><span>Por cobrar</span></div>
      <div class="stat"><b>${dinero(esperado)}</b><span>Esperado</span></div>
    </div>
    ${conCuota.length ? conCuota.map(c => {
      const p = pagoDe(c.id, mesPagos);
      return `
        <div class="tarjeta fila">
          <div class="fila-izq"><div class="avatar">${esc(iniciales(c.nombre))}</div>
            <div class="trunc"><b>${esc(c.nombre)}</b><div class="sub">${p?.pagado ? `Pagó ${dinero(p.monto)} · ${fechaBonita(p.fecha)}` : `Cuota ${dinero(c.cuota)}`}</div></div></div>
          ${p?.pagado
            ? `<button class="boton sec mini" data-action="desmarcar-pago" data-id="${c.id}" data-mes="${mesPagos}">Deshacer</button>`
            : `<div class="botones" style="margin:0">
                 ${c.telefono ? `<a class="boton sec mini" target="_blank" rel="noopener" href="${linkWhats(c.telefono, `Hola ${c.nombre.split(' ')[0]} 👋, te recuerdo la cuota de ${mesBonito(mesPagos)}: ${dinero(c.cuota)}. ¡Gracias! — Erik`)}">Recordar</a>` : ''}
                 <button class="boton mini" data-action="marcar-pago" data-id="${c.id}" data-mes="${mesPagos}">Cobrado</button></div>`}
        </div>`;
    }).join('') : '<div class="vacio">Pon una cuota mensual a tus clientes para llevar aquí los cobros.</div>'}
  `;
}

function linkWhats(tel, texto) {
  const num = String(tel || '').replace(/\D/g, '');
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}

/* ================= Entreno en vivo ================= */
function formNuevoEntreno(clienteId = '', sesionId = '') {
  if (db.activo) { ir({ tab: 'hoy', vista: 'entreno' }); return; }
  if (!db.sesiones.length) { aviso('Primero crea una sesión'); ir({ tab: 'sesiones' }); return; }
  abrirModal(`
    <h2>Empezar entreno</h2>
    <form data-form="nuevo-entreno">
      <label>Cliente</label>
      <select name="clienteId"><option value="">Yo mismo / sin cliente</option>
        ${[...db.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(c => `<option value="${c.id}" ${c.id === clienteId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
      <label>Sesión</label>
      <select name="sesionId" required>${db.sesiones.map(s => `<option value="${s.id}" ${s.id === sesionId ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select>
      <div class="botones"><button class="boton" type="submit">⚡ Empezar</button>
        <button class="boton sec" type="button" data-action="cerrar">Cancelar</button></div>
    </form>`);
}

function ultimaSerie(clienteId, ejercicioId) {
  const regs = db.registros.filter(r => r.clienteId === clienteId).sort((a, b) => b.fin - a.fin);
  for (const r of regs) {
    const e = r.ejercicios.find(x => x.ejercicioId === ejercicioId);
    if (e) return e.series.filter(s => s.hecha);
  }
  return [];
}

function empezarEntreno(clienteId, sesionId) {
  const s = porId('sesiones', sesionId);
  db.activo = {
    id: uid(), clienteId, sesionId, sesionNombre: s.nombre, inicio: Date.now(),
    ejercicios: s.items.map(it => {
      const previas = clienteId ? ultimaSerie(clienteId, it.ejercicioId) : [];
      return {
        ejercicioId: it.ejercicioId, nombre: nombreEj(it.ejercicioId), objetivo: it.reps,
        descanso: Number(it.descanso) || 0, notas: it.notas,
        series: Array.from({ length: Number(it.series) || 1 }, (_, k) => ({
          reps: '', carga: it.carga || previas[k]?.carga || '', hecha: false,
          previa: previas[k] ? `${previas[k].carga || 0}×${previas[k].reps}` : '',
        })),
      };
    }),
  };
  guardar();
  ir({ tab: 'hoy', vista: 'entreno' });
}

function vEntreno() {
  const a = db.activo;
  if (!a) return redirigir({ tab: 'hoy' });
  const cli = porId('clientes', a.clienteId);
  return `
    <div class="entreno-cab fila">
      <div class="trunc"><b>${esc(a.sesionNombre)}</b><div class="sub">${esc(cli?.nombre ?? 'Sin cliente')}</div></div>
      <span class="reloj" id="reloj">${duracion((Date.now() - a.inicio) / 1000)}</span>
    </div>
    ${a.ejercicios.map((e, ei) => {
      const ej = porId('ejercicios', e.ejercicioId);
      return `
      <div class="tarjeta">
        <div class="fila"><b>${ei + 1}. ${esc(e.nombre)}</b>
          <span class="filtros" style="margin:0;flex-wrap:nowrap">${ej?.video ? `<a class="chip acento" href="${esc(ej.video)}" target="_blank" rel="noopener" style="text-decoration:none">▶</a>` : ''}
          ${ej ? `<button class="chip" data-action="ver-ejercicio" data-id="${ej.id}" aria-label="Cómo se hace">ℹ︎ cómo</button>` : ''}</span></div>
        <div class="sub">Objetivo: ${esc(e.objetivo)} reps · descanso ${e.descanso}s${e.notas ? ` · ${esc(e.notas)}` : ''}</div>
        <div class="serie-cab"><span>#</span><span>kg</span><span>reps</span><span></span></div>
        ${e.series.map((s, si) => `
          <div class="serie">
            <span class="n">${si + 1}</span>
            <input type="number" inputmode="decimal" step="0.5" placeholder="${esc(s.previa ? s.previa.split('×')[0] : 'kg')}" value="${esc(s.carga)}" data-serie="carga" data-e="${ei}" data-s="${si}" aria-label="Kilos serie ${si + 1}">
            <input type="number" inputmode="numeric" placeholder="${esc(s.previa ? s.previa.split('×')[1] : e.objetivo)}" value="${esc(s.reps)}" data-serie="reps" data-e="${ei}" data-s="${si}" aria-label="Repeticiones serie ${si + 1}">
            <button class="check ${s.hecha ? 'hecho' : ''}" data-action="check" data-e="${ei}" data-s="${si}" aria-label="Serie hecha">✓</button>
          </div>`).join('')}
        ${e.series.some(s => s.previa) ? `<p class="pr" style="margin-top:6px">Última vez: ${e.series.filter(s => s.previa).map(s => esc(s.previa)).join(' · ')}</p>` : ''}
        <div class="botones"><button class="boton sec mini" data-action="add-serie" data-e="${ei}">+ Serie</button>
          ${e.series.length > 1 ? `<button class="boton sec mini" data-action="quitar-serie" data-e="${ei}">− Serie</button>` : ''}</div>
      </div>`;
    }).join('')}
    <label>RPE de la sesión (1-10)</label>
    <input type="number" min="1" max="10" value="${esc(a.rpe)}" data-entreno="rpe">
    <label>Notas</label>
    <textarea data-entreno="notas" placeholder="Sensaciones, molestias, ajustes para la próxima…">${esc(a.notas)}</textarea>
    <div class="botones">
      <button class="boton ancho" data-action="terminar-entreno">✓ Terminar y guardar</button>
      <button class="boton peligro ancho" data-action="descartar-entreno">Descartar entreno</button>
    </div>
    ${descanso.fin ? `<div class="descanso" id="descanso"><span>Descanso <span id="descanso-t">${duracion(Math.max(0, (descanso.fin - Date.now()) / 1000))}</span></span><button data-action="saltar-descanso">Saltar</button></div>` : ''}
  `;
}

let relojTimer;
const descanso = { fin: 0 };
function tickReloj() {
  clearInterval(relojTimer);
  relojTimer = setInterval(() => {
    if (ruta.vista !== 'entreno' || !db.activo) { clearInterval(relojTimer); return; }
    const r = $('#reloj');
    if (r) r.textContent = duracion((Date.now() - db.activo.inicio) / 1000);
    if (descanso.fin) {
      const queda = (descanso.fin - Date.now()) / 1000;
      const t = $('#descanso-t');
      if (queda <= 0) {
        descanso.fin = 0;
        $('#descanso')?.remove();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        pitido();
        aviso('⚡ ¡A por la siguiente serie!');
      } else if (t) t.textContent = duracion(queda);
    }
  }, 250);
}

function iniciarDescanso(seg) {
  if (!seg) return;
  descanso.fin = Date.now() + seg * 1000;
  $('#descanso')?.remove();
  vista.insertAdjacentHTML('beforeend', `<div class="descanso" id="descanso"><span>Descanso <span id="descanso-t">${duracion(seg)}</span></span><button data-action="saltar-descanso">Saltar</button></div>`);
}

let audioCtx;
function pitido() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; g.gain.value = 0.15;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.35);
  } catch (e) { /* sin audio */ }
}

function terminarEntreno() {
  const a = db.activo;
  const hechas = a.ejercicios.reduce((n, e) => n + e.series.filter(s => s.hecha).length, 0);
  if (!hechas && !confirm('No marcaste ninguna serie. ¿Guardar igualmente?')) return;
  const fin = Date.now();
  const registro = { ...a, fin, duracion: Math.round((fin - a.inicio) / 1000) };
  registro.ejercicios = a.ejercicios.map(e => ({ ...e, series: e.series.map(({ previa, ...s }) => s) }));
  db.registros.push(registro);
  db.activo = null;
  descanso.fin = 0;
  guardar();
  aviso('Entreno guardado 💪');
  ir({ tab: 'hoy', vista: 'registro', id: registro.id });
}

function vRegistro() {
  const r = porId('registros', ruta.id);
  if (!r) return redirigir({ tab: 'hoy' });
  const cli = porId('clientes', r.clienteId);
  const volumen = r.ejercicios.reduce((t, e) => t + e.series.reduce((u, s) => u + (s.hecha ? (Number(s.carga) || 0) * (Number(s.reps) || 0) : 0), 0), 0);
  return `
    <button class="enlace" data-action="tab" data-tab="${cli ? 'clientes' : 'hoy'}" ${cli ? `data-cliente="${cli.id}"` : ''}>← Volver</button>
    <h1 style="margin-top:6px">${esc(r.sesionNombre)}</h1>
    <p class="sub">${esc(cli?.nombre ?? 'Sin cliente')} · ${fechaBonita(new Date(r.fin).toISOString())}</p>
    <div class="stats">
      <div class="stat"><b>${duracion(r.duracion)}</b><span>Duración</span></div>
      <div class="stat"><b>${Math.round(volumen).toLocaleString('es')}</b><span>Volumen kg</span></div>
      <div class="stat"><b>${esc(r.rpe || '—')}</b><span>RPE</span></div>
    </div>
    ${r.ejercicios.map(e => `
      <div class="tarjeta"><b>${esc(e.nombre)}</b>
        <div class="sub">${e.series.filter(s => s.hecha).map(s => `${esc(s.carga || 0)} kg × ${esc(s.reps || '?')}`).join(' · ') || 'Sin series hechas'}</div></div>`).join('')}
    ${r.notas ? `<h2>Notas</h2><div class="tarjeta">${esc(r.notas)}</div>` : ''}
    <div class="botones">
      ${cli?.telefono ? `<a class="boton sec" target="_blank" rel="noopener" href="${linkWhats(cli.telefono, resumenRegistro(r))}">Enviar resumen por WhatsApp</a>` : ''}
      <button class="boton peligro" data-action="borrar-registro" data-id="${r.id}">Borrar registro</button>
    </div>
  `;
}

function resumenRegistro(r) {
  const l = [`⚡ *${r.sesionNombre}* — ${fechaBonita(new Date(r.fin).toISOString())}`, `Duración: ${duracion(r.duracion)}`, ''];
  r.ejercicios.forEach(e => {
    const s = e.series.filter(x => x.hecha);
    if (s.length) l.push(`• ${e.nombre}: ${s.map(x => `${x.carga || 0}×${x.reps || '?'}`).join(', ')}`);
  });
  if (r.notas) l.push('', r.notas);
  l.push('', '¡Buen trabajo! 💪 — Erik');
  return l.join('\n');
}

/* ================= Ajustes / copia de seguridad ================= */
function vAjustes() {
  abrirModal(`
    <h2>Ajustes</h2>
    <p class="sub">Tus datos viven solo en este dispositivo. Descarga una copia de seguridad con frecuencia
      y restáurala si cambias de teléfono.</p>
    <div class="botones">
      <button class="boton" data-action="exportar">⬇ Descargar copia</button>
      <label class="boton sec" style="margin:0;color:var(--texto)">⬆ Restaurar copia
        <input type="file" accept="application/json,.json" data-input="importar" hidden></label>
    </div>
    ${bloqueTema()}
    <h2>Instalar en el móvil</h2>
    <p class="sub">iPhone: Safari → Compartir → «Añadir a pantalla de inicio».<br>
      Android: Chrome → menú ⋮ → «Instalar aplicación».</p>
    <h2>Zona peligrosa</h2>
    <button class="boton peligro" data-action="reiniciar">Borrar todos los datos</button>
    <div class="botones"><button class="boton sec" data-action="cerrar">Cerrar</button></div>
  `);
}

function exportar() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `epzshock-copia-${hoyISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  localStorage.setItem(CLAVE + ':ultimaCopia', String(Date.now()));
  aviso('Copia descargada');
}

function importar(archivo) {
  const lector = new FileReader();
  lector.onload = () => {
    try {
      const datos = JSON.parse(lector.result);
      if (!Array.isArray(datos.clientes) || !Array.isArray(datos.sesiones)) throw new Error('formato');
      if (!confirm('Esto reemplazará los datos actuales por los de la copia. ¿Continuar?')) return;
      db = Object.assign(estadoInicial(), datos);
      guardar(); cerrarModal(); ir({ tab: 'hoy' });
      aviso('Copia restaurada ✓');
    } catch (e) { aviso('Archivo no válido'); }
  };
  lector.readAsText(archivo);
}

/* ================= Eventos ================= */
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (b) ir({ tab: b.dataset.tab });
});

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  const acciones = {
    cerrar: cerrarModal,
    ajustes: vAjustes,
    exportar,
    reiniciar() {
      if (confirm('¿Seguro? Se borrará TODO (clientes, sesiones, entrenos y pagos).') && confirm('Última confirmación: esto no se puede deshacer.')) {
        db = estadoInicial(); guardar(); cerrarModal(); ir({ tab: 'hoy' });
      }
    },
    tab() { el.dataset.cliente ? ir({ tab: 'clientes', vista: 'cliente', id: el.dataset.cliente }) : ir({ tab: el.dataset.tab }); },

    'form-cliente': () => formCliente(),
    'editar-cliente': () => formCliente(porId('clientes', id)),
    'ver-cliente': () => ir({ tab: 'clientes', vista: 'cliente', id }),
    'borrar-cliente'() {
      if (!confirm('¿Borrar este cliente y su historial?')) return;
      db.clientes = db.clientes.filter(c => c.id !== id);
      db.registros = db.registros.filter(r => r.clienteId !== id);
      db.pagos = db.pagos.filter(p => p.clienteId !== id);
      guardar(); cerrarModal(); ir({ tab: 'clientes' });
    },
    'form-medida': () => formMedida(id),
    'borrar-medida'() {
      const c = porId('clientes', id);
      c.medidas = c.medidas.filter(m => m.id !== el.dataset.medida);
      guardar(); render();
    },

    'form-sesion': () => formSesion(),
    'editar-sesion': () => formSesion(porId('sesiones', id)),
    'ver-sesion': () => ir({ tab: 'sesiones', vista: 'sesion', id }),
    'duplicar-sesion'() {
      const s = porId('sesiones', id);
      const copia = { ...structuredClone(s), id: uid(), nombre: s.nombre + ' (copia)' };
      db.sesiones.push(copia); guardar();
      aviso('Sesión duplicada');
      ir({ tab: 'sesiones', vista: 'sesion', id: copia.id });
    },
    'borrar-sesion'() {
      if (!confirm('¿Borrar esta sesión? Los entrenos ya registrados se conservan.')) return;
      db.sesiones = db.sesiones.filter(s => s.id !== id);
      guardar(); ir({ tab: 'sesiones' });
    },
    'compartir-sesion'() {
      const texto = textoSesion(porId('sesiones', id));
      const conTel = db.clientes.filter(c => c.telefono);
      abrirModal(`
        <h2>Enviar sesión</h2>
        <p class="sub">Tu cliente la recibe por WhatsApp, sin instalar nada.</p>
        <label>Para</label>
        <select id="dest"><option value="">Elegir contacto en WhatsApp…</option>
          ${conTel.map(c => `<option value="${esc(c.telefono)}">${esc(c.nombre)}</option>`).join('')}</select>
        <label>Mensaje</label><textarea id="msg" style="min-height:180px">${esc(texto)}</textarea>
        <div class="botones">
          <button class="boton" data-action="enviar-whats">Abrir WhatsApp</button>
          <button class="boton sec" data-action="copiar-msg">Copiar</button>
          <button class="boton sec" data-action="cerrar">Cerrar</button>
        </div>`);
    },
    'enviar-whats'() {
      const tel = $('#dest').value, msg = $('#msg').value;
      window.open(tel ? linkWhats(tel, msg) : `https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    },
    'copiar-msg'() {
      navigator.clipboard?.writeText($('#msg').value).then(() => aviso('Copiado ✓'), () => aviso('No se pudo copiar'));
    },
    'form-item': () => formItem(id, el.dataset.i !== undefined ? Number(el.dataset.i) : undefined),
    'borrar-item'() {
      const s = porId('sesiones', id);
      s.items.splice(Number(el.dataset.i), 1);
      guardar(); cerrarModal(); render();
    },
    'mover-item'() {
      const s = porId('sesiones', id);
      const i = Number(el.dataset.i), j = i + Number(el.dataset.dir);
      if (j < 0 || j >= s.items.length) return;
      [s.items[i], s.items[j]] = [s.items[j], s.items[i]];
      guardar(); render();
    },

    'form-ejercicio': () => formEjercicio(id),
    'ir-ejercicios': () => ir({ tab: 'sesiones', vista: 'ejercicios' }),
    'ver-ejercicio': () => verEjercicio(id),
    'filtro-tag'() { filtroTag = el.dataset.tag; render(); },
    'borrar-ejercicio'() {
      const usado = db.sesiones.some(s => s.items.some(i => i.ejercicioId === id));
      if (usado) { aviso('Está en alguna sesión: quítalo de ahí primero'); return; }
      if (!confirm('¿Borrar este ejercicio?')) return;
      db.ejercicios = db.ejercicios.filter(x => x.id !== id);
      guardar(); cerrarModal(); render();
    },

    mes() {
      const [y, m] = mesPagos.split('-').map(Number);
      mesPagos = mesISO(new Date(Date.UTC(y, m - 1 + Number(el.dataset.dir), 15)));
      render();
    },
    'marcar-pago'() {
      const c = porId('clientes', id);
      const mes = el.dataset.mes;
      const p = pagoDe(id, mes);
      if (p) Object.assign(p, { pagado: true, monto: Number(c.cuota), fecha: hoyISO() });
      else db.pagos.push({ id: uid(), clienteId: id, mes, monto: Number(c.cuota), pagado: true, fecha: hoyISO() });
      guardar(); render(); aviso(`${c.nombre.split(' ')[0]}: pago registrado ✓`);
    },
    'desmarcar-pago'() {
      db.pagos = db.pagos.filter(p => !(p.clienteId === id && p.mes === el.dataset.mes));
      guardar(); render();
    },

    'nuevo-entreno': () => formNuevoEntreno(el.dataset.cliente, el.dataset.sesion),
    'ver-entreno': () => ir({ tab: 'hoy', vista: 'entreno' }),
    check() {
      const e = db.activo.ejercicios[Number(el.dataset.e)];
      const s = e.series[Number(el.dataset.s)];
      s.hecha = !s.hecha;
      if (s.hecha) {
        if (!s.reps) s.reps = String(e.objetivo).split(/[-–]/).pop().replace(/\D/g, '') || '';
        if (!s.carga && s.previa) s.carga = s.previa.split('×')[0];
      }
      guardar();
      el.classList.toggle('hecho', s.hecha);
      const fila = el.closest('.serie');
      fila.querySelector('[data-serie="reps"]').value = s.reps;
      fila.querySelector('[data-serie="carga"]').value = s.carga;
      if (s.hecha) {
        // Copia el peso a la siguiente serie vacía para no reescribirlo
        const si = Number(el.dataset.s), sig = e.series[si + 1];
        if (sig && !sig.carga && s.carga) {
          sig.carga = s.carga;
          const inp = document.querySelector(`[data-serie="carga"][data-e="${el.dataset.e}"][data-s="${si + 1}"]`);
          if (inp) inp.value = s.carga;
        }
        guardar();
        if (navigator.vibrate) navigator.vibrate(30);
        iniciarDescanso(e.descanso);
      }
    },
    'add-serie'() {
      const e = db.activo.ejercicios[Number(el.dataset.e)];
      const ult = e.series[e.series.length - 1];
      e.series.push({ reps: '', carga: ult?.carga || '', hecha: false, previa: '' });
      guardar(); render();
    },
    'quitar-serie'() {
      db.activo.ejercicios[Number(el.dataset.e)].series.pop();
      guardar(); render();
    },
    'saltar-descanso'() { descanso.fin = 0; $('#descanso')?.remove(); },
    'terminar-entreno': terminarEntreno,
    'descartar-entreno'() {
      if (!confirm('¿Descartar este entreno? Se perderán las series marcadas.')) return;
      db.activo = null; descanso.fin = 0; guardar(); ir({ tab: 'hoy' });
    },
    'ver-registro': () => ir({ tab: ruta.tab, vista: 'registro', id }),
    'borrar-registro'() {
      if (!confirm('¿Borrar este registro de entreno?')) return;
      db.registros = db.registros.filter(r => r.id !== id);
      guardar(); ir({ tab: 'hoy' });
    },
  };
  const fn = acciones[action] || EXTRA.acciones[action];
  if (fn) { e.preventDefault(); fn(el); }
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.input === 'filtro-clientes') { filtroClientes = el.value; refrescarConFoco(el); }
  else if (el.dataset.input === 'filtro-ej') { filtroEj = el.value; refrescarConFoco(el); }
  else if (EXTRA.inputs[el.dataset.input]) EXTRA.inputs[el.dataset.input](el);
  else if (el.dataset.serie && db.activo) {
    db.activo.ejercicios[Number(el.dataset.e)].series[Number(el.dataset.s)][el.dataset.serie] = el.value;
    guardar(); // se guarda en cada tecla: nunca se pierde una serie
  } else if (el.dataset.entreno && db.activo) {
    db.activo[el.dataset.entreno] = el.value;
    guardar();
  }
});

document.addEventListener('change', e => {
  if (e.target.dataset.input === 'importar' && e.target.files[0]) importar(e.target.files[0]);
});

function refrescarConFoco(el) {
  const sel = `[data-input="${el.dataset.input}"]`;
  const pos = el.selectionStart;
  render();
  const nuevo = $(sel);
  nuevo.focus();
  nuevo.setSelectionRange(pos, pos);
}

document.addEventListener('submit', e => {
  const form = e.target;
  const tipo = form.dataset.form;
  if (!tipo) return;
  e.preventDefault();
  const d = datosForm(form);
  const id = form.dataset.id;

  if (EXTRA.forms[tipo]) { EXTRA.forms[tipo](d, form); return; }
  if (tipo === 'cliente') {
    d.nombre = d.nombre.trim();
    if (id) Object.assign(porId('clientes', id), d);
    else db.clientes.push({ id: uid(), creado: hoyISO(), medidas: [], ...d });
    guardar(); cerrarModal();
    id ? render() : ir({ tab: 'clientes' });
    aviso('Cliente guardado ✓');
  } else if (tipo === 'medida') {
    const c = porId('clientes', id);
    c.medidas = c.medidas || [];
    c.medidas.push({ id: uid(), ...d });
    guardar(); cerrarModal(); render(); aviso('Medidas guardadas ✓');
  } else if (tipo === 'sesion') {
    if (id) { Object.assign(porId('sesiones', id), d); guardar(); cerrarModal(); render(); }
    else {
      const s = { id: uid(), items: [], ...d };
      db.sesiones.push(s); guardar(); cerrarModal();
      ir({ tab: 'sesiones', vista: 'sesion', id: s.id });
    }
  } else if (tipo === 'item') {
    const s = porId('sesiones', id);
    const item = { ejercicioId: d.ejercicioId, series: Number(d.series), reps: d.reps, carga: d.carga, descanso: Number(d.descanso) || 0, notas: d.notas };
    if (form.dataset.i !== '') s.items[Number(form.dataset.i)] = item; else s.items.push(item);
    guardar(); cerrarModal(); render();
  } else if (tipo === 'ejercicio') {
    const nombre = d.nombre.trim();
    // Evita duplicados (una queja habitual de Stenfit)
    const dup = db.ejercicios.find(x => x.id !== id && normalizarNombre(x.nombre) === normalizarNombre(nombre));
    if (dup) { aviso('Ya existe un ejercicio con ese nombre'); return; }
    const tags = Object.keys(ETIQUETAS).filter(k => d['tag-' + k]);
    Object.keys(d).filter(k => k.startsWith('tag-')).forEach(k => delete d[k]);
    if (id) Object.assign(porId('ejercicios', id), d, { nombre, tags });
    else db.ejercicios.push({ id: uid(), ...d, nombre, tags });
    guardar(); cerrarModal(); render(); aviso('Ejercicio guardado ✓');
  } else if (tipo === 'nuevo-entreno') {
    cerrarModal();
    empezarEntreno(d.clienteId, d.sesionId);
  }
});

// Recordatorio suave de copia de seguridad cada 7 días si hay datos
(function recordarCopia() {
  const ultima = Number(localStorage.getItem(CLAVE + ':ultimaCopia') || 0);
  if (db.registros.length && Date.now() - ultima > 7 * 864e5) {
    setTimeout(() => aviso('💾 Recuerda descargar tu copia en ⚙︎'), 1500);
  }
})();

/* ================= Arranque ================= */
// Arranca cuando todos los módulos ya se registraron
document.addEventListener('DOMContentLoaded', () => {
  if (db.activo) ruta = { tab: 'hoy', vista: 'entreno' };
  render();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
