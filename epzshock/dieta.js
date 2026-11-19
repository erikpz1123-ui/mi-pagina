/* Epzshock — Dietas: calcula calorías y macros, genera menús y lista de la compra. */
'use strict';

// Valores por 100 g: [kcal, proteína, carbohidratos, grasa, unidad casera opcional [nombre, gramos]]
const ALIMENTOS = {
  'Pechuga de pollo': [165, 31, 0, 3.6],
  'Huevo entero': [143, 12.6, 0.7, 9.5, ['pieza', 50]],
  'Claras de huevo': [52, 11, 0.7, 0.2, ['clara', 33]],
  'Atún en agua': [116, 26, 0, 1, ['lata', 120]],
  'Res magra': [176, 20, 0, 10],
  'Salmón': [208, 20, 0, 13],
  'Pescado blanco': [96, 20, 0, 1.7],
  'Yogur griego natural': [59, 10, 3.6, 0.4, ['taza', 200]],
  'Queso panela': [230, 18, 3, 16],
  'Proteína whey': [380, 78, 8, 5, ['scoop', 30]],
  'Avena': [389, 16.9, 66, 6.9, ['taza', 80]],
  'Pan integral': [247, 13, 41, 3.4, ['rebanada', 30]],
  'Tortilla de maíz': [218, 5.7, 44.6, 2.9, ['pieza', 30]],
  'Arroz cocido': [130, 2.7, 28, 0.3, ['taza', 160]],
  'Papa cocida': [87, 1.9, 20, 0.1],
  'Camote cocido': [90, 2, 20.7, 0.2],
  'Pasta cocida': [158, 5.8, 31, 0.9, ['taza', 140]],
  'Frijoles cocidos': [127, 8.7, 22.8, 0.5, ['taza', 170]],
  'Plátano': [89, 1.1, 22.8, 0.3, ['pieza', 120]],
  'Manzana': [52, 0.3, 13.8, 0.2, ['pieza', 180]],
  'Frutos rojos': [50, 0.7, 12, 0.3, ['taza', 150]],
  'Papaya': [43, 0.5, 11, 0.3, ['taza', 145]],
  'Aguacate': [160, 2, 8.5, 14.7],
  'Aceite de oliva': [884, 0, 0, 100, ['cdita', 5]],
  'Almendras': [579, 21, 22, 50],
  'Crema de cacahuate': [588, 25, 20, 50, ['cda', 16]],
  'Brócoli': [34, 2.8, 6.6, 0.4],
  'Ensalada verde': [17, 1.2, 3.3, 0.2],
  'Nopales': [16, 1.3, 3.3, 0.1],
  'Espinaca': [23, 2.9, 3.6, 0.4],
};

// Plantillas de comida: [proteínas, carbohidratos, fruta/verdura fija (g), grasas]
const PLANTILLAS = {
  Desayuno: [['Huevo entero', 'Claras de huevo', 'Yogur griego natural', 'Proteína whey'], ['Avena', 'Pan integral', 'Tortilla de maíz'], [['Plátano', 'Frutos rojos', 'Papaya', 'Manzana'], 120], ['Aguacate', 'Almendras', 'Crema de cacahuate']],
  Comida: [['Pechuga de pollo', 'Res magra', 'Salmón', 'Pescado blanco', 'Atún en agua'], ['Arroz cocido', 'Papa cocida', 'Camote cocido', 'Pasta cocida', 'Frijoles cocidos'], [['Brócoli', 'Ensalada verde', 'Nopales', 'Espinaca'], 150], ['Aceite de oliva', 'Aguacate']],
  Cena: [['Pechuga de pollo', 'Pescado blanco', 'Atún en agua', 'Huevo entero', 'Queso panela'], ['Tortilla de maíz', 'Camote cocido', 'Arroz cocido', 'Pan integral'], [['Ensalada verde', 'Nopales', 'Brócoli', 'Espinaca'], 150], ['Aguacate', 'Aceite de oliva']],
  'Colación': [['Yogur griego natural', 'Proteína whey', 'Queso panela'], ['Manzana', 'Plátano', 'Frutos rojos'], null, ['Almendras', 'Crema de cacahuate']],
};

const REPARTO = {
  3: [['Desayuno', 0.3], ['Comida', 0.4], ['Cena', 0.3]],
  4: [['Desayuno', 0.25], ['Comida', 0.35], ['Colación', 0.15], ['Cena', 0.25]],
  5: [['Desayuno', 0.25], ['Colación', 0.1], ['Comida', 0.3], ['Colación', 0.1], ['Cena', 0.25]],
};

const OBJETIVOS_DIETA = {
  perder: { nombre: 'Perder grasa', factor: 0.8, prot: 2.2 },
  mantener: { nombre: 'Mantener / recomposición', factor: 1, prot: 2.0 },
  ganar: { nombre: 'Ganar músculo', factor: 1.1, prot: 1.8 },
};
const ACTIVIDAD = { '1.2': 'Sedentario', '1.375': 'Ligero (1-3 entrenos)', '1.55': 'Moderado (3-5 entrenos)', '1.725': 'Alto (6-7 entrenos)' };

function calcularMacros(d) {
  const peso = Number(d.peso) || 70, altura = Number(d.altura) || 170, edad = Number(d.edad) || 30;
  const tmb = 10 * peso + 6.25 * altura - 5 * edad + (d.sexo === 'mujer' ? -161 : 5); // Mifflin-St Jeor
  const obj = OBJETIVOS_DIETA[d.objetivo] || OBJETIVOS_DIETA.mantener;
  const kcal = Math.round((tmb * Number(d.actividad || 1.55) * obj.factor) / 10) * 10;
  const prot = Math.round(peso * obj.prot);
  const grasa = Math.round((kcal * 0.25) / 9);
  const carb = Math.max(0, Math.round((kcal - prot * 4 - grasa * 9) / 4));
  return { kcal, prot, carb, grasa, tmb: Math.round(tmb) };
}

const azar = lista => lista[Math.floor(Math.random() * lista.length)];
const redondear5 = g => Math.max(0, Math.round(g / 5) * 5);
const macrosDe = (nombre, g) => ALIMENTOS[nombre].slice(0, 4).map(v => (v * g) / 100);
const evitado = (nombre, evitar) => evitar.some(t => t && nombre.toLowerCase().includes(t));

function elegir(lista, evitar) {
  const ok = lista.filter(n => !evitado(n, evitar));
  return azar(ok.length ? ok : lista);
}

function generarComida(tipo, objetivo, evitar) {
  const [prots, carbs, verdura, grasas] = PLANTILLAS[tipo];
  const items = [];
  let [, p, c, g] = [0, 0, 0, 0];
  if (verdura) {
    const v = elegir(verdura[0], evitar);
    items.push({ alimento: v, gramos: verdura[1] });
    const m = macrosDe(v, verdura[1]); p += m[1]; c += m[2]; g += m[3];
  }
  const fCarb = elegir(carbs, evitar);
  const gCarb = redondear5(((objetivo.carb - c) * 100) / ALIMENTOS[fCarb][2]);
  let m = macrosDe(fCarb, gCarb); p += m[1]; c += m[2]; g += m[3];
  const fProt = elegir(prots, evitar);
  const gProt = redondear5(((objetivo.prot - p) * 100) / ALIMENTOS[fProt][1]);
  m = macrosDe(fProt, gProt); g += m[3];
  const fGrasa = elegir(grasas, evitar);
  const gGrasa = redondear5(((objetivo.grasa - g) * 100) / ALIMENTOS[fGrasa][3]);
  const cProt = { alimento: fProt, gramos: gProt }, cCarb = { alimento: fCarb, gramos: gCarb }, cGrasa = { alimento: fGrasa, gramos: gGrasa };
  items.unshift(cProt, cCarb);
  items.push(cGrasa);
  // Ajuste final: cuadra las calorías de la comida moviendo carbohidrato y luego grasa
  const kcalObjetivo = objetivo.prot * 4 + objetivo.carb * 4 + objetivo.grasa * 9;
  for (const it of [cCarb, cGrasa]) {
    const sobra = totales(items)[0] - kcalObjetivo;
    if (Math.abs(sobra) < 15) break;
    it.gramos = redondear5(it.gramos - (sobra * 100) / ALIMENTOS[it.alimento][0]);
  }
  return items.filter(i => i.gramos > 0);
}

function generarDieta(d) {
  const t = calcularMacros(d);
  const evitar = String(d.evitar || '').toLowerCase().split(',').map(x => x.trim());
  const comidas = REPARTO[d.comidas].map(([tipo, parte]) => ({
    nombre: tipo, parte,
    items: generarComida(tipo, { prot: t.prot * parte, carb: t.carb * parte, grasa: t.grasa * parte }, evitar),
  }));
  return { ...t, comidas, evitar: d.evitar || '' };
}

function totales(items) {
  return items.reduce((a, i) => { const m = macrosDe(i.alimento, Number(i.gramos) || 0); return a.map((v, k) => v + m[k]); }, [0, 0, 0, 0]);
}
function casera(nombre, g) {
  const u = ALIMENTOS[nombre][4];
  if (!u || !g) return '';
  const n = Math.round((g / u[1]) * 2) / 2;
  return n ? `≈ ${n} ${u[0]}${n > 1 ? 's' : ''}` : '';
}

/* ===== Vistas ===== */
function vDieta() {
  const lista = [...db.dietas].sort((a, b) => b.creado.localeCompare(a.creado));
  return `
    <div class="cabecera"><div><h1>Dietas</h1><p class="sub">Planes de alimentación de tus clientes</p></div></div>
    <div class="tarjeta asistente">
      <div><b>⚡ Asistente EPZ</b><p class="sub">Calcula calorías y macros y arma el menú con alimentos de aquí.</p></div>
      <button class="boton" data-action="form-dieta">Crear dieta</button>
    </div>
    ${lista.length ? lista.map(dt => `
      <div class="tarjeta click" data-action="ver-dieta" data-id="${dt.id}">
        <div class="fila"><b class="trunc">${esc(dt.nombre)}</b><span class="chip acento">${dt.kcal} kcal</span></div>
        <div class="sub">${esc(porId('clientes', dt.clienteId)?.nombre ?? 'Plantilla general')} · P ${dt.prot} · C ${dt.carb} · G ${dt.grasa} · ${dt.comidas.length} comidas</div>
      </div>`).join('') : '<div class="vacio">Crea la primera dieta con el asistente.</div>'}
  `;
}

function formDieta(clienteId = '') {
  const c = porId('clientes', clienteId);
  const ultimoPeso = [...(c?.medidas || [])].sort((a, b) => a.fecha.localeCompare(b.fecha)).filter(m => m.peso).pop()?.peso || '';
  abrirModal(`
    <h2>⚡ Asistente EPZ · Dieta</h2>
    <form data-form="dieta">
      <label>Para</label>
      <select name="clienteId" data-input="dieta-cliente"><option value="">Plantilla general</option>
        ${[...db.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(x => `<option value="${x.id}" ${x.id === clienteId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>
      <div class="rejilla-2">
        <div><label>Sexo</label><select name="sexo"><option value="hombre">Hombre</option><option value="mujer" ${c?.sexo === 'mujer' ? 'selected' : ''}>Mujer</option></select></div>
        <div><label>Edad</label><input name="edad" type="number" min="14" max="90" value="${esc(c?.edad || 30)}" required></div>
        <div><label>Peso (kg)</label><input name="peso" type="number" step="0.1" value="${esc(ultimoPeso || 70)}" required></div>
        <div><label>Altura (cm)</label><input name="altura" type="number" value="${esc(c?.altura || 170)}" required></div>
      </div>
      <label>Actividad</label><select name="actividad">${Object.entries(ACTIVIDAD).map(([k, v]) => `<option value="${k}" ${k === '1.55' ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="rejilla-2">
        <div><label>Objetivo</label><select name="objetivo">${Object.entries(OBJETIVOS_DIETA).map(([k, o]) => `<option value="${k}">${o.nombre}</option>`).join('')}</select></div>
        <div><label>Comidas al día</label><select name="comidas"><option>3</option><option selected>4</option><option>5</option></select></div>
      </div>
      <label>Evitar (separado por comas)</label><input name="evitar" placeholder="Ej. salmón, cacahuate, lácteos">
      <div class="botones">
        <button class="boton" type="submit">Generar dieta</button>
        <button class="boton sec" type="button" data-action="prompt-dieta">Pedírsela a Claude</button>
        <button class="boton sec" type="button" data-action="cerrar">Cancelar</button>
      </div>
    </form>`);
}

EXTRA.forms.dieta = d => {
  const plan = generarDieta(d);
  const c = porId('clientes', d.clienteId);
  if (c) { Object.assign(c, { sexo: d.sexo, edad: d.edad, altura: d.altura }); }
  const dt = {
    id: uid(), clienteId: d.clienteId, creado: new Date().toISOString(),
    nombre: `${c ? c.nombre.split(' ')[0] + ' · ' : ''}${OBJETIVOS_DIETA[d.objetivo].nombre}`,
    datos: d, ...plan,
  };
  db.dietas.push(dt);
  guardar(); cerrarModal();
  aviso('Dieta creada ✓');
  ir({ tab: 'dieta', vista: 'dietaDetalle', id: dt.id });
};

function vDietaDetalle() {
  const dt = porId('dietas', ruta.id);
  if (!dt) return redirigir({ tab: 'dieta' });
  const real = dt.comidas.reduce((a, cm) => totales(cm.items).map((v, k) => a[k] + v), [0, 0, 0, 0]);
  return `
    <button class="enlace" data-action="tab" data-tab="dieta">← Dietas</button>
    <h1 style="margin-top:6px">${esc(dt.nombre)}</h1>
    <p class="sub">${esc(porId('clientes', dt.clienteId)?.nombre ?? 'Plantilla general')} · Objetivo ${dt.kcal} kcal (metabolismo basal ${dt.tmb})</p>
    <div class="macros">
      <div class="macro"><b>${Math.round(real[0])}</b><span>kcal</span></div>
      <div class="macro"><b>${Math.round(real[1])} g</b><span>Proteína</span></div>
      <div class="macro"><b>${Math.round(real[2])} g</b><span>Carbos</span></div>
      <div class="macro"><b>${Math.round(real[3])} g</b><span>Grasa</span></div>
    </div>
    <div class="botones">
      <button class="boton" data-action="compartir-dieta" data-id="${dt.id}">Enviar por WhatsApp</button>
      <button class="boton sec" data-action="lista-compra" data-id="${dt.id}">Lista de la compra</button>
    </div>
    ${dt.comidas.map((cm, ci) => {
      const t = totales(cm.items);
      return `
      <h2 class="fila">${esc(cm.nombre)} <span class="sub">${Math.round(t[0])} kcal · P ${Math.round(t[1])}</span></h2>
      <div class="tarjeta">
        ${cm.items.map((it, ii) => `
          <div class="alimento">
            <div>${esc(it.alimento)} <small>${casera(it.alimento, it.gramos)}</small></div>
            <input type="number" inputmode="numeric" step="5" min="0" value="${esc(it.gramos)}" data-input="gramos" data-c="${ci}" data-i="${ii}" aria-label="Gramos de ${esc(it.alimento)}">
          </div>`).join('')}
        <div class="botones"><button class="boton sec mini" data-action="otra-comida" data-id="${dt.id}" data-c="${ci}">↻ Otra opción</button></div>
      </div>`;
    }).join('')}
    <p class="aviso-nota">Cantidades en gramos (cocido salvo avena y frutos secos). Es una guía orientativa: ajústala según la respuesta del cliente; ante patologías, que la valide un nutricionista.</p>
    <div class="botones"><button class="boton peligro" data-action="borrar-dieta" data-id="${dt.id}">Borrar dieta</button></div>
  `;
}

EXTRA.vistas.dieta = vDieta;
EXTRA.vistas.dietaDetalle = vDietaDetalle;

EXTRA.inputs.gramos = el => {
  const dt = porId('dietas', ruta.id);
  dt.comidas[Number(el.dataset.c)].items[Number(el.dataset.i)].gramos = Number(el.value) || 0;
  guardar();
  clearTimeout(EXTRA._t);
  EXTRA._t = setTimeout(() => refrescarConFocoSel(`[data-input="gramos"][data-c="${el.dataset.c}"][data-i="${el.dataset.i}"]`), 600);
};
EXTRA.inputs['dieta-cliente'] = el => formDieta(el.value);

function refrescarConFocoSel(sel) {
  const activo = document.activeElement?.matches?.(sel);
  render();
  if (activo) { const n = $(sel); n?.focus(); }
}

EXTRA.acciones['form-dieta'] = el => formDieta(el.dataset.cliente || '');
EXTRA.acciones['ver-dieta'] = el => ir({ tab: 'dieta', vista: 'dietaDetalle', id: el.dataset.id });
EXTRA.acciones['otra-comida'] = el => {
  const dt = porId('dietas', el.dataset.id);
  const cm = dt.comidas[Number(el.dataset.c)];
  const evitar = String(dt.evitar || '').toLowerCase().split(',').map(x => x.trim());
  cm.items = generarComida(cm.nombre, { prot: dt.prot * cm.parte, carb: dt.carb * cm.parte, grasa: dt.grasa * cm.parte }, evitar);
  guardar(); render();
};
EXTRA.acciones['borrar-dieta'] = el => {
  if (!confirm('¿Borrar esta dieta?')) return;
  db.dietas = db.dietas.filter(x => x.id !== el.dataset.id);
  guardar(); ir({ tab: 'dieta' });
};

function textoDieta(dt) {
  const l = [`🥗 *Tu plan de alimentación* — Epzshock`, `${dt.kcal} kcal · P ${dt.prot} g · C ${dt.carb} g · G ${dt.grasa} g`, ''];
  dt.comidas.forEach(cm => {
    l.push(`*${cm.nombre}*`);
    cm.items.forEach(i => l.push(`• ${i.alimento}: ${i.gramos} g ${casera(i.alimento, i.gramos)}`.trim()));
    l.push('');
  });
  l.push('💧 2-3 L de agua al día. Cualquier duda, escríbeme. — Erik');
  return l.join('\n');
}

function listaCompra(dt) {
  const suma = {};
  dt.comidas.forEach(cm => cm.items.forEach(i => { suma[i.alimento] = (suma[i.alimento] || 0) + Number(i.gramos) * 7; }));
  return Object.entries(suma).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([n, g]) => `• ${n}: ${g >= 1000 ? (g / 1000).toFixed(1) + ' kg' : g + ' g'}`).join('\n');
}

function compartirTexto(titulo, texto, telefono) {
  abrirModal(`
    <h2>${titulo}</h2>
    <textarea id="msg" style="min-height:220px">${esc(texto)}</textarea>
    <div class="botones">
      <a class="boton" target="_blank" rel="noopener" href="${telefono ? linkWhats(telefono, texto) : `https://wa.me/?text=${encodeURIComponent(texto)}`}">Abrir WhatsApp</a>
      <button class="boton sec" data-action="copiar-msg">Copiar</button>
      <button class="boton sec" data-action="cerrar">Cerrar</button>
    </div>`);
}

EXTRA.acciones['compartir-dieta'] = el => {
  const dt = porId('dietas', el.dataset.id);
  compartirTexto('Enviar dieta', textoDieta(dt), porId('clientes', dt.clienteId)?.telefono);
};
EXTRA.acciones['lista-compra'] = el => {
  const dt = porId('dietas', el.dataset.id);
  compartirTexto('Lista de la compra (7 días)', `🛒 *Lista de la compra semanal* — Epzshock\n\n${listaCompra(dt)}`, porId('clientes', dt.clienteId)?.telefono);
};
