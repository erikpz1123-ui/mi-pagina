/* Epzshock — Asistente EPZ: genera rutinas completas y prepara prompts para Claude. */
'use strict';

// Patrones de movimiento → opciones de ejercicio [nombre, grupo] para gimnasio y casa
const PATRONES = {
  rodilla:    { gym: [['Sentadilla trasera', 'Pierna'], ['Prensa de pierna', 'Pierna'], ['Sentadilla goblet', 'Pierna']],
                casa: [['Sentadilla goblet', 'Pierna'], ['Sentadilla búlgara', 'Pierna']] },
  cadera:     { gym: [['Peso muerto rumano', 'Glúteo'], ['Hip thrust', 'Glúteo'], ['Peso muerto convencional', 'Espalda']],
                casa: [['Peso muerto rumano', 'Glúteo'], ['Puente de glúteo', 'Glúteo']] },
  unilateral: { gym: [['Zancadas', 'Pierna'], ['Sentadilla búlgara', 'Pierna']],
                casa: [['Zancadas', 'Pierna'], ['Sentadilla búlgara', 'Pierna']] },
  empujeH:    { gym: [['Press banca', 'Pecho'], ['Press inclinado mancuernas', 'Pecho']],
                casa: [['Flexiones', 'Pecho'], ['Press inclinado mancuernas', 'Pecho']] },
  empujeV:    { gym: [['Press militar', 'Hombro']], casa: [['Press militar', 'Hombro']] },
  tironV:     { gym: [['Jalón al pecho', 'Espalda'], ['Dominadas', 'Espalda']],
                casa: [['Dominadas', 'Espalda'], ['Remo con mancuerna', 'Espalda']] },
  tironH:     { gym: [['Remo con barra', 'Espalda'], ['Remo con mancuerna', 'Espalda']],
                casa: [['Remo con mancuerna', 'Espalda']] },
  hombro:     { gym: [['Elevaciones laterales', 'Hombro'], ['Face pull', 'Hombro']], casa: [['Elevaciones laterales', 'Hombro']] },
  biceps:     { gym: [['Curl de bíceps', 'Brazo']], casa: [['Curl de bíceps', 'Brazo']] },
  triceps:    { gym: [['Extensión de tríceps en polea', 'Brazo'], ['Fondos', 'Brazo']], casa: [['Fondos en silla', 'Brazo'], ['Flexiones diamante', 'Brazo']] },
  core:       { gym: [['Plancha', 'Core'], ['Rueda abdominal', 'Core'], ['Pallof press', 'Core']],
                casa: [['Plancha', 'Core'], ['Dead bug', 'Core']] },
  plio:       { gym: [['Salto al cajón', 'Pierna'], ['Salto de longitud a pies juntos', 'Pierna'], ['Saltos laterales', 'Pierna'], ['Lanzamiento de balón medicinal al suelo', 'Cuerpo completo']],
                casa: [['Sentadilla con salto', 'Pierna'], ['Salto de longitud a pies juntos', 'Pierna'], ['Saltos de patinador', 'Pierna'], ['Saltos de tobillo (pogos)', 'Pierna']] },
  cardio:     { gym: [['Bicicleta estática', 'Cardio'], ['Burpees', 'Cardio']], casa: [['Burpees', 'Cardio']] },
};

const DIAS_TIPO = {
  'Full body A': ['rodilla', 'empujeH', 'tironH', 'cadera', 'core'],
  'Full body B': ['cadera', 'empujeV', 'tironV', 'unilateral', 'core'],
  'Full body C': ['rodilla', 'empujeH', 'tironV', 'hombro', 'core'],
  'Torso':       ['empujeH', 'tironH', 'empujeV', 'tironV', 'biceps', 'triceps'],
  'Pierna':      ['rodilla', 'cadera', 'unilateral', 'core'],
  'Empuje':      ['empujeH', 'empujeV', 'hombro', 'triceps'],
  'Tirón':       ['tironV', 'tironH', 'biceps', 'core'],
};

const SPLITS = {
  2: ['Full body A', 'Full body B'],
  3: ['Full body A', 'Full body B', 'Full body C'],
  4: ['Torso', 'Pierna', 'Torso', 'Pierna'],
  5: ['Empuje', 'Tirón', 'Pierna', 'Torso', 'Pierna'],
  6: ['Empuje', 'Tirón', 'Pierna', 'Empuje', 'Tirón', 'Pierna'],
};

const OBJETIVOS = {
  hipertrofia: { nombre: 'Ganar músculo', principal: [4, '8-10', 120], accesorio: [3, '10-12', 75] },
  fuerza:      { nombre: 'Ganar fuerza', principal: [5, '4-6', 180], accesorio: [3, '8-10', 90] },
  grasa:       { nombre: 'Perder grasa', principal: [3, '10-12', 60], accesorio: [3, '12-15', 45], cardio: true },
  salud:       { nombre: 'Principiante / salud', principal: [3, '10-12', 75], accesorio: [2, '12-15', 60] },
  potencia:    { nombre: 'Explosividad / deporte', principal: [4, '3-5 explosivas', 150], accesorio: [3, '6-8', 90], plio: true },
};

function asegurarEjercicio(nombre, grupo) {
  let e = db.ejercicios.find(x => x.nombre.toLowerCase() === nombre.toLowerCase());
  if (!e) { e = { id: uid(), nombre, grupo, video: '', notas: '' }; db.ejercicios.push(e); }
  return e.id;
}

// Bloques de prevención que rotan entre sesiones (respaldo: FIFA 11+, curl nórdico, Copenhague)
const BLOQUES_PREVENCION = [
  [['Curl nórdico', 'Pierna', '3', '4-6', 'Excéntrico lento'], ['Plancha Copenhague', 'Core', '2', '20-30 s', 'Por lado']],
  [['Rotación externa de hombro con liga', 'Hombro', '2', '12-15', 'Codo pegado'], ['Equilibrio a una pierna', 'Pierna', '2', '30-45 s', 'Por pierna']],
  [['Monster walk con liga', 'Glúteo', '2', '10 pasos', 'Por lado'], ['Y-T-W', 'Hombro', '2', '8 de cada', 'Lento']],
];

function generarRutina({ objetivo, dias, lugar, prefijo, prevencion }) {
  const obj = OBJETIVOS[objetivo];
  const conteo = {}; // para variar ejercicios cuando un día se repite
  return SPLITS[dias].map(tipo => {
    const vez = conteo[tipo] = (conteo[tipo] ?? -1) + 1;
    const letra = SPLITS[dias].filter(t => t === tipo).length > 1 ? ' ' + 'AB'[vez] : '';
    const items = DIAS_TIPO[tipo].map((patron, i) => {
      const opciones = PATRONES[patron][lugar];
      const [nombre, grupo] = opciones[vez % opciones.length];
      const [series, reps, descanso] = i < 2 ? obj.principal : obj.accesorio;
      return {
        ejercicioId: asegurarEjercicio(nombre, grupo), series, descanso, carga: '',
        reps: patron === 'core' ? (nombre === 'Plancha' ? '30-45 s' : '10-12') : reps,
        notas: i < 2 ? 'Ejercicio principal · RIR 1-2' : 'RIR 1-2',
      };
    });
    if (obj.plio) {
      const [nombre, grupo] = PATRONES.plio[lugar][(vez + DIAS_TIPO[tipo].length) % PATRONES.plio[lugar].length];
      items.unshift({ ejercicioId: asegurarEjercicio(nombre, grupo), series: 4, reps: '3-5', descanso: 120, carga: '', notas: 'Al inicio, sin fatiga · máxima intención' });
    }
    if (prevencion) {
      const idx = SPLITS[dias].indexOf(tipo) + vez;
      BLOQUES_PREVENCION[idx % BLOQUES_PREVENCION.length].forEach(([nombre, grupo, series, reps, notas]) =>
        items.push({ ejercicioId: asegurarEjercicio(nombre, grupo), series: Number(series), reps, descanso: 45, carga: '', notas: `🛡️ Prevención · ${notas}` }));
    }
    if (obj.cardio) {
      const [nombre, grupo] = PATRONES.cardio[lugar][vez % PATRONES.cardio[lugar].length];
      items.push({ ejercicioId: asegurarEjercicio(nombre, grupo), series: 4, reps: '30 s fuerte / 30 s suave', descanso: 30, carga: '', notas: 'Finisher metabólico' });
    }
    const nombreSesion = tipo + letra;
    return {
      id: uid(), nombre: `${prefijo}${nombreSesion}`, items,
      notas: `${obj.nombre} · ${dias} días/semana · ${lugar === 'gym' ? 'Gimnasio' : 'Casa'}. Calentamiento: 5 min cardio suave + movilidad + 2 series de aproximación.`,
    };
  });
}

let rutinaPendiente = null;

function formRutina(clienteId = '') {
  abrirModal(`
    <h2>⚡ Asistente EPZ · Rutina</h2>
    <form data-form="rutina">
      <label>Para</label>
      <select name="clienteId"><option value="">Plantilla general</option>
        ${[...db.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(c => `<option value="${c.id}" ${c.id === clienteId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
      <label>Objetivo</label>
      <select name="objetivo">${Object.entries(OBJETIVOS).map(([k, o]) => `<option value="${k}">${o.nombre}</option>`).join('')}</select>
      <div class="rejilla-2">
        <div><label>Días por semana</label><select name="dias">${[2, 3, 4, 5, 6].map(n => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div><label>Lugar</label><select name="lugar"><option value="gym">Gimnasio</option><option value="casa">Casa (mancuernas)</option></select></div>
      </div>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="prevencion" checked style="width:auto;min-height:auto"> 🛡️ Añadir bloque de prevención de lesiones</label>
      <div class="botones">
        <button class="boton" type="submit">Generar</button>
        <button class="boton sec" type="button" data-action="prompt-rutina">Pedírsela a Claude</button>
        <button class="boton sec" type="button" data-action="cerrar">Cancelar</button>
      </div>
    </form>`);
}

EXTRA.forms.rutina = d => {
  const cli = porId('clientes', d.clienteId);
  rutinaPendiente = generarRutina({ ...d, dias: Number(d.dias), prefijo: cli ? cli.nombre.split(' ')[0] + ' · ' : '' });
  abrirModal(`
    <h2>Rutina generada</h2>
    <p class="sub">${esc(rutinaPendiente[0].notas)}</p>
    ${rutinaPendiente.map(s => `
      <div class="tarjeta"><b>${esc(s.nombre)}</b>
        <div class="sub">${s.items.map(it => `${esc(nombreEj(it.ejercicioId))} ${it.series}×${esc(it.reps)}`).join(' · ')}</div></div>`).join('')}
    <p class="aviso-nota">Podrás editar cada ejercicio, carga y descanso después de guardar.</p>
    <div class="botones">
      <button class="boton" data-action="guardar-rutina">Guardar ${rutinaPendiente.length} sesiones</button>
      <button class="boton sec" data-action="form-rutina" data-cliente="${esc(d.clienteId)}">Cambiar opciones</button>
    </div>`);
};

EXTRA.acciones['form-rutina'] = el => formRutina(el.dataset.cliente || '');
EXTRA.acciones['guardar-rutina'] = () => {
  if (!rutinaPendiente) return;
  db.sesiones.push(...rutinaPendiente);
  guardar();
  aviso(`${rutinaPendiente.length} sesiones creadas ✓`);
  rutinaPendiente = null;
  cerrarModal();
  ir({ tab: 'sesiones' });
};

/* ===== Prompts para Claude ===== */
function perfilCliente(c) {
  if (!c) return 'Cliente: plantilla general (sin datos personales).';
  const m = [...(c.medidas || [])].sort((a, b) => a.fecha.localeCompare(b.fecha)).pop();
  const prs = marcasPersonales(c.id).slice(0, 8).map(p => `${p.nombre} ${p.carga} kg × ${p.reps}`).join('; ');
  return [
    `Cliente: ${c.nombre.split(' ')[0]}`,
    `Objetivo: ${c.objetivo || 'no definido'}`,
    `Lesiones / notas: ${c.notas || 'ninguna'}`,
    m ? `Últimas medidas (${m.fecha}): peso ${m.peso || '?'} kg, grasa ${m.grasa || '?'} %, cintura ${m.cintura || '?'} cm` : 'Sin medidas registradas',
    prs ? `Marcas actuales: ${prs}` : '',
  ].filter(Boolean).join('\n');
}

function mostrarPrompt(titulo, texto) {
  abrirModal(`
    <h2>${titulo}</h2>
    <p class="sub">Copia este texto y pégalo en Claude (app o claude.ai). Luego pasa la respuesta a Epzshock.</p>
    <textarea id="prompt-claude" class="prompt-claude">${esc(texto)}</textarea>
    <div class="botones">
      <button class="boton" data-action="copiar-prompt">Copiar</button>
      <a class="boton sec" href="https://claude.ai/new" target="_blank" rel="noopener">Abrir Claude</a>
      <button class="boton sec" data-action="cerrar">Cerrar</button>
    </div>`);
}

EXTRA.acciones['copiar-prompt'] = () => {
  navigator.clipboard?.writeText($('#prompt-claude').value).then(() => aviso('Copiado ✓ Pégalo en Claude'), () => aviso('No se pudo copiar'));
};

EXTRA.acciones['prompt-rutina'] = () => {
  const f = $('form[data-form="rutina"]');
  const d = datosForm(f);
  const c = porId('clientes', d.clienteId);
  mostrarPrompt('Pedir rutina a Claude', `Eres mi asistente como entrenador personal (soy Erik Perez, licenciado en Entrenamiento Deportivo).
Diséñame una rutina de ${d.dias} días por semana para ${d.lugar === 'gym' ? 'gimnasio' : 'casa con mancuernas'}, objetivo: ${OBJETIVOS[d.objetivo].nombre}.

${perfilCliente(c)}

Formato: para cada día, nombre de la sesión y una lista de ejercicios con series × repeticiones, descanso en segundos e indicación técnica breve. Incluye calentamiento, progresión para 4 semanas y adaptaciones por las lesiones indicadas.`);
};

EXTRA.acciones['prompt-dieta'] = () => {
  const f = $('form[data-form="dieta"]');
  const d = datosForm(f);
  const c = porId('clientes', d.clienteId);
  const calc = calcularMacros(d);
  mostrarPrompt('Pedir dieta a Claude', `Eres mi asistente como entrenador personal (soy Erik Perez).
Diséñame un plan de alimentación de 7 días con ${d.comidas} comidas al día, objetivo: ${OBJETIVOS_DIETA[d.objetivo].nombre}.
Objetivo diario: ${calc.kcal} kcal · ${calc.prot} g proteína · ${calc.carb} g carbohidratos · ${calc.grasa} g grasa.
Alimentos fáciles de conseguir en México/Latinoamérica, con cantidades en gramos y medidas caseras.
${d.evitar ? `Evitar: ${d.evitar}.` : ''}

${perfilCliente(c)}

Incluye lista de la compra semanal y 3 opciones de colación. Si hay alguna condición médica, indica que se valide con un nutricionista.`);
};
