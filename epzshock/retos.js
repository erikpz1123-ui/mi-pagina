/* Epzshock — Retos en grupo: ranking, premio, muro de resultados e imágenes para redes. */
'use strict';

const TIPOS_RETO = {
  progreso: 'Progreso desde el inicio (ej. peso perdido)',
  acumulado: 'Suma de resultados (ej. días entrenados, km)',
  marca: 'Mejor marca (ej. flexiones máximas)',
};

const PLANTILLAS_RETO = [
  { icono: '🔥', nombre: 'Reto 30 días: % de peso perdido', tipo: 'progreso', sentido: 'bajar', porcentaje: 'on', unidad: 'kg', dias: 30, premio: '1 mes de entrenamiento gratis', reglas: 'Pesaje el día 1 y cada semana, en ayunas, con foto de la báscula.' },
  { icono: '📅', nombre: 'Reto constancia: días entrenados', tipo: 'acumulado', sentido: 'subir', unidad: 'días', meta: 20, dias: 30, premio: 'Playera de mi marca', reglas: 'Cada entreno cuenta 1. Manda foto o captura del entreno.' },
  { icono: '💪', nombre: 'Reto flexiones en 1 minuto', tipo: 'marca', sentido: 'subir', unidad: 'reps', dias: 14, premio: 'Sesión 1 a 1 gratis', reglas: 'Vídeo de 1 minuto, pecho al suelo en cada repetición.' },
  { icono: '⏱️', nombre: 'Reto plancha más larga', tipo: 'marca', sentido: 'subir', unidad: 's', dias: 14, premio: 'Kit de suplementos', reglas: 'Vídeo completo, cadera alineada.' },
  { icono: '🏃', nombre: 'Reto km del mes', tipo: 'acumulado', sentido: 'subir', unidad: 'km', meta: 50, dias: 30, premio: 'Tenis deportivos', reglas: 'Captura de la app de running o reloj.' },
  { icono: '✏️', nombre: '', tipo: 'acumulado', sentido: 'subir', unidad: '', dias: 30, premio: '', reglas: '', personalizado: true },
];

const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const diasRestantes = r => Math.ceil((new Date(r.fin + 'T23:59:59') - Date.now()) / 864e5);
const estadoReto = r => r.cerrado ? 'cerrado' : hoyISO() < r.inicio ? 'proximo' : diasRestantes(r) < 0 ? 'terminado' : 'activo';

function puntuacion(r, p) {
  const vals = (p.entradas || []).map(e => Number(e.valor)).filter(v => !isNaN(v));
  if (!vals.length) return null;
  if (r.tipo === 'acumulado') return vals.reduce((a, b) => a + b, 0);
  if (r.tipo === 'marca') return r.sentido === 'bajar' ? Math.min(...vals) : Math.max(...vals);
  // progreso: compara la última entrada con el valor inicial
  const ultima = [...p.entradas].sort((a, b) => (a.fecha + a.creado).localeCompare(b.fecha + b.creado)).pop();
  const ini = Number(p.inicial);
  if (p.inicial === '' || p.inicial == null || isNaN(ini)) return null;
  let cambio = r.sentido === 'bajar' ? ini - Number(ultima.valor) : Number(ultima.valor) - ini;
  if (r.porcentaje && ini) cambio = (cambio / ini) * 100;
  return Math.round(cambio * 100) / 100;
}

function formatoPuntos(r, v) {
  if (v === null) return '—';
  const n = Number(v).toLocaleString('es', { maximumFractionDigits: 2 });
  if (r.tipo === 'progreso') return r.porcentaje ? `${n} %` : `${n} ${r.unidad}`;
  return `${n} ${r.unidad}`;
}

function ranking(r) {
  const menorMejor = r.tipo === 'marca' && r.sentido === 'bajar';
  return r.participantes
    .map(p => ({ p, v: puntuacion(r, p) }))
    .sort((a, b) => (a.v === null) - (b.v === null) || (menorMejor ? a.v - b.v : b.v - a.v));
}
const MEDALLAS = ['🥇', '🥈', '🥉'];

/* ===== Bloque en "Hoy" ===== */
function bloqueRetosHoy() {
  const activos = db.retos.filter(r => estadoReto(r) === 'activo');
  if (!activos.length) return '';
  return `<h2>Retos activos 🔥</h2>` + activos.map(r => {
    const lider = ranking(r)[0];
    return `<div class="tarjeta click reto-cab" data-action="ver-reto" data-id="${r.id}">
      <div class="fila"><b class="trunc">${esc(r.nombre)}</b><span class="chip fuego">${diasRestantes(r)} días</span></div>
      <div class="sub">${lider?.v != null ? `Va ganando ${esc(lider.p.nombre)} · ${formatoPuntos(r, lider.v)}` : 'Aún sin resultados'} · 🏆 ${esc(r.premio || 'Sin premio')}</div>
    </div>`;
  }).join('');
}

/* ===== Lista de retos ===== */
function vRetos() {
  const orden = { activo: 0, proximo: 1, terminado: 2, cerrado: 3 };
  const lista = [...db.retos].sort((a, b) => orden[estadoReto(a)] - orden[estadoReto(b)] || b.inicio.localeCompare(a.inicio));
  const etiqueta = { activo: ['fuego', 'EN CURSO'], proximo: ['', 'PRÓXIMO'], terminado: ['no', 'POR CERRAR'], cerrado: ['ok', 'FINALIZADO'] };
  return `
    <div class="cabecera"><div><h1>Retos</h1><p class="sub">Compite, publica resultados y gana premios</p></div>
      <button class="boton" data-action="plantillas-reto">+ Nuevo</button></div>
    ${lista.length ? lista.map(r => {
      const [cls, txt] = etiqueta[estadoReto(r)];
      return `<div class="tarjeta click" data-action="ver-reto" data-id="${r.id}">
        <div class="fila"><b class="trunc">${esc(r.nombre)}</b><span class="chip ${cls}">${txt}</span></div>
        <div class="sub">${r.participantes.length} participantes · ${fechaBonita(r.inicio)} → ${fechaBonita(r.fin)}${r.ganador ? ` · 🏆 ${esc(r.ganador)}` : ''}</div>
      </div>`;
    }).join('') : '<div class="vacio">Lanza tu primer reto y compártelo en redes.</div>'}
    <details class="tarjeta" style="margin-top:14px">
      <summary><b>📈 Cómo hacer que un reto se vuelva viral</b></summary>
      <ol class="sub" style="padding-left:18px;margin-top:8px;display:grid;gap:6px">
        <li><b>Premio visible y concreto</b> (un mes gratis, playera de tu marca). Ponlo en la portada del reto.</li>
        <li><b>Inscripción con amigo:</b> quien invite a otro participante suma +1 punto o una entrada extra.</li>
        <li><b>Ranking semanal en historias:</b> usa «Compartir ranking», etiqueta a los participantes y pídeles que lo compartan.</li>
        <li><b>Hashtag propio</b> (#RetoEPZ) y antes/después del ganador en un reel con su permiso.</li>
        <li><b>Retos cortos</b> (14-30 días) y uno nuevo cada mes: la gente vuelve por la siguiente edición.</li>
      </ol>
    </details>
  `;
}

function vPlantillasReto() {
  abrirModal(`
    <h2>Elige un reto</h2>
    ${PLANTILLAS_RETO.map((p, i) => `
      <div class="tarjeta click" data-action="form-reto" data-plantilla="${i}">
        <b>${p.icono} ${esc(p.personalizado ? 'Reto personalizado' : p.nombre)}</b>
        <div class="sub">${p.personalizado ? 'Define tú la métrica y las reglas' : `${TIPOS_RETO[p.tipo]} · ${p.dias} días`}</div>
      </div>`).join('')}
    <div class="botones"><button class="boton sec" data-action="cerrar">Cancelar</button></div>`);
}

function formReto(r) {
  abrirModal(`
    <h2>${r.id ? 'Editar reto' : 'Nuevo reto'}</h2>
    <form data-form="reto" data-id="${r.id ?? ''}">
      <label>Nombre *</label><input name="nombre" required value="${esc(r.nombre)}">
      <label>Cómo se gana</label><select name="tipo">${Object.entries(TIPOS_RETO).map(([k, v]) => `<option value="${k}" ${k === r.tipo ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="rejilla-2">
        <div><label>Mejor si el valor…</label><select name="sentido"><option value="subir" ${r.sentido === 'subir' ? 'selected' : ''}>Sube</option><option value="bajar" ${r.sentido === 'bajar' ? 'selected' : ''}>Baja</option></select></div>
        <div><label>Unidad</label><input name="unidad" value="${esc(r.unidad)}" placeholder="kg, reps, días…"></div>
        <div><label>Inicio</label><input type="date" name="inicio" value="${esc(r.inicio)}" required></div>
        <div><label>Fin</label><input type="date" name="fin" value="${esc(r.fin)}" required></div>
        <div><label>Meta (opcional)</label><input type="number" step="any" name="meta" value="${esc(r.meta)}"></div>
        <div><label>Hashtag</label><input name="hashtag" value="${esc(r.hashtag || '#RetoEPZ')}"></div>
      </div>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="porcentaje" ${r.porcentaje ? 'checked' : ''} style="width:auto;min-height:auto"> Ranking en % (más justo en retos de peso)</label>
      <label>🏆 Premio</label><input name="premio" value="${esc(r.premio)}">
      <label>Reglas / prueba requerida</label><textarea name="reglas">${esc(r.reglas)}</textarea>
      <div class="botones"><button class="boton" type="submit">Guardar</button>
        <button class="boton sec" type="button" data-action="cerrar">Cancelar</button></div>
    </form>`);
}

EXTRA.forms.reto = (d, form) => {
  const id = form.dataset.id;
  d.porcentaje = d.porcentaje ? 'on' : '';
  if (d.fin < d.inicio) { aviso('La fecha de fin debe ser posterior al inicio'); return; }
  if (id) Object.assign(porId('retos', id), d);
  else {
    const r = { id: uid(), participantes: [], creado: new Date().toISOString(), ...d };
    db.retos.push(r);
    guardar(); cerrarModal();
    aviso('Reto creado 🔥 Ahora añade participantes');
    ir({ tab: 'retos', vista: 'reto', id: r.id });
    return;
  }
  guardar(); cerrarModal(); render();
};

/* ===== Detalle del reto ===== */
function vReto() {
  const r = porId('retos', ruta.id);
  if (!r) return redirigir({ tab: 'retos' });
  const est = estadoReto(r);
  const rk = ranking(r);
  const posts = r.participantes.flatMap(p => (p.entradas || []).map(e => ({ ...e, nombre: p.nombre, pid: p.id })))
    .sort((a, b) => (b.fecha + b.creado).localeCompare(a.fecha + a.creado));
  const dr = diasRestantes(r);
  return `
    <button class="enlace" data-action="tab" data-tab="retos">← Retos</button>
    <div class="tarjeta reto-cab" style="margin-top:6px">
      <span class="chip fuego">${est === 'activo' ? `QUEDAN ${dr} DÍAS` : est === 'proximo' ? `EMPIEZA ${fechaBonita(r.inicio).toUpperCase()}` : est === 'cerrado' ? 'FINALIZADO' : 'TERMINADO · POR CERRAR'}</span>
      <h1 style="margin-top:8px">${esc(r.nombre)}</h1>
      <p class="sub">${fechaBonita(r.inicio)} → ${fechaBonita(r.fin)} · ${esc(r.hashtag || '')}</p>
      ${r.premio ? `<div class="premio" style="margin-top:10px"><span>🏆</span><span>${esc(r.premio)}</span></div>` : ''}
      ${r.reglas ? `<p class="sub" style="margin-top:8px">📋 ${esc(r.reglas)}</p>` : ''}
      ${r.ganador ? `<p style="margin-top:8px;font-weight:800">Ganador: ${esc(r.ganador)} 🎉</p>` : ''}
    </div>
    <div class="botones">
      <button class="boton" data-action="form-resultado" data-id="${r.id}" ${r.participantes.length ? '' : 'disabled'}>+ Publicar resultado</button>
      <button class="boton sec" data-action="form-participante" data-id="${r.id}">+ Participante</button>
      <button class="boton sec" data-action="story-reto" data-id="${r.id}">📸 Compartir ranking</button>
      <button class="boton sec" data-action="invitar-reto" data-id="${r.id}">Invitar</button>
    </div>

    ${bloqueRetoApp(r)}
    <h2>Ranking</h2>
    ${rk.length ? rk.map(({ p, v }, i) => {
      const meta = Number(r.meta);
      const pct = meta && v !== null ? Math.max(0, Math.min(100, (v / meta) * 100)) : null;
      return `<div class="tarjeta">
        <div class="ranking-fila">
          <span class="puesto">${v !== null && i < 3 ? MEDALLAS[i] : i + 1}</span>
          <div class="trunc"><b>${esc(p.nombre)}</b>
            <div class="sub">${(p.entradas || []).length} publicaciones${r.tipo === 'progreso' ? ` · inicio ${esc(p.inicial)} ${esc(r.unidad)}` : ''}${pct === 100 ? ' · 🏅 Meta lograda' : ''}</div></div>
          <span class="puntos">${formatoPuntos(r, v)}</span>
        </div>
        ${pct !== null ? `<div class="barra-meta"><i style="width:${pct}%"></i></div>` : ''}
        <div class="botones" style="margin-top:8px">
          ${p.telefono ? `<a class="boton sec mini" target="_blank" rel="noopener" href="${linkWhats(p.telefono, `Hola ${p.nombre.split(' ')[0]} 🔥 ¿Cómo vas en el ${r.nombre}? Mándame tu resultado con foto/vídeo como prueba y te subo en el ranking 💪`)}">Pedir resultado</a>` : ''}
          ${botonPagado(r, p)}
          <button class="boton sec mini" data-action="quitar-participante" data-id="${r.id}" data-p="${p.id}">Quitar</button>
        </div>
      </div>`;
    }).join('') : '<div class="vacio">Añade a tus clientes o a cualquier persona que se apunte.</div>'}

    <h2>Muro de resultados</h2>
    ${posts.length ? posts.map(e => `
      <div class="tarjeta post">
        <div class="fila"><b>${esc(e.nombre)}</b><span class="sub">${fechaBonita(e.fecha)}</span></div>
        <div><span class="puntos" style="font-size:1rem">${esc(e.valor)} ${esc(r.unidad)}</span>${e.nota ? ` · <span class="sub">${esc(e.nota)}</span>` : ''}</div>
        <button class="enlace" style="font-size:.8rem" data-action="borrar-resultado" data-id="${r.id}" data-p="${e.pid}" data-e="${e.creado}">Borrar</button>
      </div>`).join('') : '<div class="vacio">Cuando publiques resultados aparecerán aquí.</div>'}

    <div class="botones">
      ${est !== 'cerrado' && rk[0]?.v != null ? `<button class="boton" data-action="cerrar-reto" data-id="${r.id}">🏆 Cerrar y anunciar ganador</button>` : ''}
      <button class="boton sec" data-action="editar-reto" data-id="${r.id}">Editar</button>
      <button class="boton peligro" data-action="borrar-reto" data-id="${r.id}">Borrar reto</button>
    </div>
    <p class="aviso-nota">Tus participantes te mandan su resultado por WhatsApp y tú lo publicas aquí; así el ranking queda verificado por ti.</p>
  `;
}

function formParticipante(reto) {
  const ya = new Set(reto.participantes.map(p => p.clienteId).filter(Boolean));
  const libres = db.clientes.filter(c => !ya.has(c.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  abrirModal(`
    <h2>Añadir participante</h2>
    <form data-form="participante" data-id="${reto.id}">
      <label>Cliente</label>
      <select name="clienteId"><option value="">— Persona nueva (escribe abajo) —</option>
        ${libres.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select>
      <div class="rejilla-2">
        <div><label>Nombre (si no es cliente)</label><input name="nombre"></div>
        <div><label>WhatsApp</label><input name="telefono" inputmode="tel"></div>
      </div>
      ${reto.tipo === 'progreso' ? `<label>Valor inicial (${esc(reto.unidad)}) *</label><input name="inicial" type="number" step="any" required>` : ''}
      <div class="botones"><button class="boton" type="submit">Añadir</button>
        <button class="boton sec" type="button" data-action="cerrar">Cancelar</button></div>
    </form>`);
}

EXTRA.forms.participante = (d, form) => {
  const r = porId('retos', form.dataset.id);
  const c = porId('clientes', d.clienteId);
  const nombre = (c?.nombre || d.nombre || '').trim();
  if (!nombre) { aviso('Elige un cliente o escribe un nombre'); return; }
  r.participantes.push({ id: uid(), clienteId: c?.id || '', nombre, telefono: d.telefono || c?.telefono || '', inicial: d.inicial ?? '', entradas: [] });
  guardar(); cerrarModal(); render(); aviso(`${nombre.split(' ')[0]} está dentro 🔥`);
};

function formResultado(r) {
  abrirModal(`
    <h2>Publicar resultado</h2>
    <form data-form="resultado" data-id="${r.id}">
      <label>Participante</label>
      <select name="pid">${r.participantes.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select>
      <div class="rejilla-2">
        <div><label>${r.tipo === 'progreso' ? 'Valor actual' : 'Resultado'} (${esc(r.unidad)}) *</label><input name="valor" type="number" step="any" required></div>
        <div><label>Fecha</label><input name="fecha" type="date" value="${hoyISO()}" required></div>
      </div>
      <label>Comentario / prueba</label><input name="nota" placeholder="Ej. vídeo recibido por WhatsApp ✅">
      <div class="botones"><button class="boton" type="submit">Publicar</button>
        <button class="boton sec" type="button" data-action="cerrar">Cancelar</button></div>
    </form>`);
}

EXTRA.forms.resultado = (d, form) => {
  const r = porId('retos', form.dataset.id);
  const p = r.participantes.find(x => x.id === d.pid);
  const antes = ranking(r).findIndex(x => x.p.id === p.id);
  p.entradas.push({ valor: d.valor, fecha: d.fecha, nota: d.nota, creado: new Date().toISOString() });
  guardar(); cerrarModal(); render();
  const ahora = ranking(r).findIndex(x => x.p.id === p.id);
  aviso(ahora < antes ? `🚀 ${p.nombre.split(' ')[0]} sube al puesto ${ahora + 1}` : 'Resultado publicado ✓');
};

/* ===== Imagen para historias (1080×1920) ===== */
function envolver(ctx, texto, x, y, ancho, alto) {
  const palabras = String(texto).split(' ');
  let linea = '', lineas = [];
  for (const p of palabras) {
    const prueba = linea ? linea + ' ' + p : p;
    if (ctx.measureText(prueba).width > ancho && linea) { lineas.push(linea); linea = p; } else linea = prueba;
  }
  lineas.push(linea);
  lineas.forEach((l, i) => ctx.fillText(l, x, y + i * alto));
  return y + lineas.length * alto;
}

function dibujarStory(r, modo) {
  const W = 1080, H = 1920;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const F = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const C = coloresStory();
  ctx.fillStyle = '#0e0f11'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(150, 150, 50, 150, 150, 1100);
  g.addColorStop(0, 'rgba(255,90,31,.55)'); g.addColorStop(1, 'rgba(255,90,31,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // marca
  ctx.fillStyle = C.acentoRelleno; ctx.beginPath(); ctx.roundRect(80, 90, 96, 96, 24); ctx.fill();
  ctx.fillStyle = C.acentoTexto; ctx.font = `900 64px ${F}`; ctx.textAlign = 'center'; ctx.fillText('⚡', 128, 162);
  ctx.textAlign = 'left'; ctx.font = `900 56px ${F}`;
  ctx.fillStyle = '#f2f3f0'; ctx.fillText('EPZ', 200, 158);
  ctx.fillStyle = C.acento; ctx.fillText('SHOCK', 200 + ctx.measureText('EPZ').width, 158);

  const rk = ranking(r).filter(x => x.v !== null);
  ctx.fillStyle = '#ff5a1f'; ctx.font = `800 44px ${F}`;
  ctx.fillText(modo === 'ganador' ? '¡TENEMOS GANADOR!' : estadoReto(r) === 'activo' ? `RANKING · QUEDAN ${diasRestantes(r)} DÍAS` : 'RANKING', 80, 330);
  ctx.fillStyle = '#f2f3f0'; ctx.font = `900 84px ${F}`;
  let y = envolver(ctx, r.nombre, 80, 430, W - 160, 96);

  if (modo === 'ganador' && rk[0]) {
    y += 140;
    ctx.font = `200px ${F}`; ctx.textAlign = 'center'; ctx.fillText('🏆', W / 2, y + 60);
    ctx.fillStyle = C.acento; ctx.font = `900 110px ${F}`;
    y = envolver(ctx, rk[0].p.nombre, W / 2, y + 240, W - 160, 120);
    ctx.fillStyle = '#f2f3f0'; ctx.font = `800 70px ${F}`; ctx.fillText(formatoPuntos(r, rk[0].v), W / 2, y + 40);
    if (r.premio) { ctx.fillStyle = '#9aa0a6'; ctx.font = `600 46px ${F}`; envolver(ctx, `Se lleva: ${r.premio}`, W / 2, y + 150, W - 200, 56); }
    ctx.textAlign = 'left';
  } else {
    y += 60;
    rk.slice(0, 6).forEach(({ p, v }, i) => {
      ctx.fillStyle = i === 0 ? C.acentoRelleno + '26' : 'rgba(255,255,255,.06)';
      ctx.beginPath(); ctx.roundRect(70, y, W - 140, 150, 32); ctx.fill();
      ctx.font = `800 68px ${F}`; ctx.fillStyle = '#f2f3f0'; ctx.textAlign = 'center';
      ctx.fillText(i < 3 ? MEDALLAS[i] : String(i + 1), 160, y + 100);
      ctx.textAlign = 'left'; ctx.font = `800 54px ${F}`;
      const nombre = p.nombre.length > 16 ? p.nombre.slice(0, 15) + '…' : p.nombre;
      ctx.fillText(nombre, 240, y + 95);
      ctx.textAlign = 'right'; ctx.fillStyle = C.acento; ctx.font = `900 56px ${F}`;
      ctx.fillText(formatoPuntos(r, v), W - 110, y + 95);
      ctx.textAlign = 'left';
      y += 175;
    });
    if (!rk.length) { ctx.fillStyle = '#9aa0a6'; ctx.font = `600 48px ${F}`; ctx.fillText('¡Aún estás a tiempo de apuntarte!', 80, y + 60); }
    if (r.premio) {
      y = Math.max(y + 40, 1480);
      ctx.fillStyle = '#ff5a1f'; ctx.beginPath(); ctx.roundRect(70, y, W - 140, 140, 32); ctx.fill();
      ctx.fillStyle = '#0e0f11'; ctx.font = `900 50px ${F}`;
      ctx.fillText(`🏆 ${r.premio.length > 30 ? r.premio.slice(0, 29) + '…' : r.premio}`, 110, y + 88);
    }
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = C.acento; ctx.font = `900 76px ${F}`; ctx.fillText(r.hashtag || '#RetoEPZ', W / 2, H - 190);
  ctx.fillStyle = '#9aa0a6'; ctx.font = `600 40px ${F}`; ctx.fillText('Entrena con Erik Perez · EPZSHOCK', W / 2, H - 110);
  return cv;
}

function compartirStory(r, modo) {
  const cv = dibujarStory(r, modo);
  const url = cv.toDataURL('image/png');
  abrirModal(`
    <h2>${modo === 'ganador' ? 'Anuncia al ganador' : 'Ranking para historias'}</h2>
    <img src="${url}" alt="Imagen del ranking" style="width:100%;border-radius:14px;border:1px solid var(--borde)">
    <div class="botones">
      <button class="boton" data-action="compartir-imagen">Compartir</button>
      <a class="boton sec" href="${url}" download="${esc((r.hashtag || 'reto').replace('#', ''))}-${modo}.png">Descargar</a>
      <button class="boton sec" data-action="cerrar">Cerrar</button>
    </div>
    <p class="aviso-nota">Súbela a tus historias de Instagram/TikTok, etiqueta a los participantes y usa ${esc(r.hashtag || '#RetoEPZ')}.</p>`);
  EXTRA._imagen = { cv, nombre: `${(r.hashtag || 'reto').replace('#', '')}-${modo}.png`, texto: `${r.nombre} ${r.hashtag || ''}` };
}

EXTRA.acciones['compartir-imagen'] = () => {
  const { cv, nombre, texto } = EXTRA._imagen || {};
  if (!cv) return;
  cv.toBlob(async blob => {
    const file = new File([blob], nombre, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], text: texto }); } catch (e) { /* cancelado */ }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
      aviso('Imagen descargada');
    }
  });
};

function textoInvitacion(r) {
  return [
    `🔥 *${r.nombre}* 🔥`,
    `📅 Del ${fechaBonita(r.inicio)} al ${fechaBonita(r.fin)}`,
    r.premio ? `🏆 Premio: *${r.premio}*` : '',
    r.reglas ? `📋 ${r.reglas}` : '',
    '',
    '¿Te apuntas? Responde *YO* y te meto en el ranking.',
    '👯 Trae a un amigo y los dos entran con ventaja.',
    `Comparte tu progreso con ${r.hashtag || '#RetoEPZ'} 💪`,
    '— Erik Perez · Epzshock',
  ].filter(x => x !== '').join('\n');
}

/* ===== Registro de vistas y acciones ===== */
EXTRA.vistas.retos = vRetos;
EXTRA.vistas.reto = vReto;

Object.assign(EXTRA.acciones, {
  'plantillas-reto': vPlantillasReto,
  'form-reto'(el) {
    const p = PLANTILLAS_RETO[Number(el.dataset.plantilla)];
    formReto({ ...p, inicio: hoyISO(), fin: sumarDias(hoyISO(), p.dias - 1) });
  },
  'editar-reto': el => formReto(porId('retos', el.dataset.id)),
  'ver-reto': el => ir({ tab: 'retos', vista: 'reto', id: el.dataset.id }),
  'form-participante': el => formParticipante(porId('retos', el.dataset.id)),
  'form-resultado': el => formResultado(porId('retos', el.dataset.id)),
  'quitar-participante'(el) {
    if (!confirm('¿Quitar a este participante y sus resultados?')) return;
    const r = porId('retos', el.dataset.id);
    r.participantes = r.participantes.filter(p => p.id !== el.dataset.p);
    guardar(); render();
  },
  'borrar-resultado'(el) {
    const r = porId('retos', el.dataset.id);
    const p = r.participantes.find(x => x.id === el.dataset.p);
    p.entradas = p.entradas.filter(e => e.creado !== el.dataset.e);
    guardar(); render();
  },
  'story-reto': el => compartirStory(porId('retos', el.dataset.id), 'ranking'),
  'invitar-reto': el => compartirTexto('Invitar al reto', textoInvitacion(porId('retos', el.dataset.id))),
  'cerrar-reto'(el) {
    const r = porId('retos', el.dataset.id);
    const top = ranking(r)[0];
    if (!confirm(`¿Cerrar el reto y declarar ganador a ${top.p.nombre}?`)) return;
    r.cerrado = true; r.ganador = top.p.nombre;
    guardar(); render();
    compartirStory(r, 'ganador');
  },
  'borrar-reto'(el) {
    if (!confirm('¿Borrar este reto con todos sus resultados?')) return;
    db.retos = db.retos.filter(r => r.id !== el.dataset.id);
    guardar(); ir({ tab: 'retos' });
  },
});
