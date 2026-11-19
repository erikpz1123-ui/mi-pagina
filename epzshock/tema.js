/* Epzshock — Temas: modo día/noche y color de acento (azul EPZ o uno distinto cada mes). */
'use strict';

const CLAVE_TEMA = 'epzshock:tema';

const COLORES_FIJOS = {
  azul: ['Azul EPZ', '#2f80ff'],
  lima: ['Lima eléctrica', '#d7ff3a'],
  fuego: ['Fuego', '#ff5a1f'],
};

// Un color por mes, con guiños a México
const COLORES_MES = [
  ['Enero · Hielo', '#4cc9f0', 'Propósitos de año nuevo'],
  ['Febrero · Pasión', '#ff4d6d', 'Entrena en pareja'],
  ['Marzo · Brote', '#5ad17a', 'Llega la primavera'],
  ['Abril · Primavera', '#2ec4a6', 'Operación verano'],
  ['Mayo · Jacaranda', '#9b6bff', 'Las jacarandas en flor'],
  ['Junio · Sol', '#ffc93c', 'Energía de verano'],
  ['Julio · Verano', '#ff8c42', 'Vacaciones activas'],
  ['Agosto · Mar', '#00b8c4', 'Mente fresca'],
  ['Septiembre · Patria', '#1fa463', 'Mes patrio'],
  ['Octubre · Cempasúchil', '#ff9f1c', 'Día de Muertos'],
  ['Noviembre · Otoño', '#e2725b', 'Constancia antes de diciembre'],
  ['Diciembre · Nochebuena', '#e63946', 'Cierra el año fuerte'],
];

function leerTema() {
  try { return Object.assign({ modo: 'auto', color: 'azul' }, JSON.parse(localStorage.getItem(CLAVE_TEMA) || '{}')); }
  catch (e) { return { modo: 'auto', color: 'azul' }; }
}
let temaPref = leerTema();

/* --- utilidades de color (contraste WCAG) --- */
const hexARgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbAHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
function luminancia(hex) {
  const [r, g, b] = hexARgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
function mezclar(hex, con, t) { const a = hexARgb(hex), b = hexARgb(con); return rgbAHex(a.map((v, i) => v + (b[i] - v) * t)); }
// Ajusta el acento hasta que sea legible como texto sobre el fondo
function legibleSobre(hex, fondo) {
  const destino = luminancia(fondo) > 0.5 ? '#000000' : '#ffffff';
  for (let t = 0; t <= 1; t += 0.05) { const c = mezclar(hex, destino, t); if (contraste(c, fondo) >= 4.5) return c; }
  return destino;
}

function colorActual() {
  if (temaPref.color === 'mes') { const [nombre, hex, lema] = COLORES_MES[new Date().getMonth()]; return { nombre, hex, lema }; }
  const [nombre, hex] = COLORES_FIJOS[temaPref.color] || COLORES_FIJOS.azul;
  return { nombre, hex };
}

const consultaOscuro = window.matchMedia('(prefers-color-scheme: dark)');
const modoResuelto = () => temaPref.modo === 'auto' ? (consultaOscuro.matches ? 'noche' : 'dia') : temaPref.modo;

function aplicarTema() {
  const raiz = document.documentElement;
  const modo = modoResuelto();
  const fondo = modo === 'dia' ? '#f4f6f9' : '#0e0f11';
  const { hex } = colorActual();
  raiz.dataset.modo = modo;
  raiz.style.setProperty('--acento', hex);
  raiz.style.setProperty('--acento-fuerte', legibleSobre(hex, fondo));
  raiz.style.setProperty('--acento-texto', contraste(hex, '#0e0f11') >= contraste(hex, '#ffffff') ? '#0e0f11' : '#ffffff');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', fondo);
}

// Colores para las imágenes de redes (siempre sobre fondo oscuro)
function coloresStory() {
  const { hex } = colorActual();
  return { acento: legibleSobre(hex, '#0e0f11'), acentoRelleno: hex, acentoTexto: contraste(hex, '#0e0f11') >= contraste(hex, '#ffffff') ? '#0e0f11' : '#ffffff' };
}

function guardarTema(cambios) {
  temaPref = Object.assign(temaPref, cambios);
  try { localStorage.setItem(CLAVE_TEMA, JSON.stringify(temaPref)); } catch (e) { /* sin almacenamiento */ }
  aplicarTema();
}

consultaOscuro.addEventListener?.('change', () => temaPref.modo === 'auto' && aplicarTema());
aplicarTema();

/* --- bloque para Ajustes (lo usa app.js) --- */
function bloqueTema() {
  const mes = COLORES_MES[new Date().getMonth()];
  const opcion = (grupo, valor, txt, actual) =>
    `<button class="filtro ${actual === valor ? 'activo' : ''}" data-action="tema" data-grupo="${grupo}" data-valor="${valor}">${txt}</button>`;
  return `
    <h2>Apariencia</h2>
    <label>Modo</label>
    <div class="filtros">
      ${opcion('modo', 'auto', '🌓 Automático', temaPref.modo)}${opcion('modo', 'dia', '☀️ Día', temaPref.modo)}${opcion('modo', 'noche', '🌙 Noche', temaPref.modo)}
    </div>
    <label>Color</label>
    <div class="filtros">
      ${Object.entries(COLORES_FIJOS).map(([k, [n, h]]) => opcion('color', k, `<i class="muestra" style="background:${h}"></i>${n}`, temaPref.color)).join('')}
      ${opcion('color', 'mes', `<i class="muestra" style="background:${mes[1]}"></i>Cambia cada mes`, temaPref.color)}
    </div>
    ${temaPref.color === 'mes' ? `
      <p class="sub" style="margin-top:8px">Este mes: <b>${mes[0]}</b> — ${mes[2]}</p>
      <div class="calendario-color">${COLORES_MES.map((m, i) => `<span title="${m[0]}" class="${i === new Date().getMonth() ? 'hoy' : ''}" style="background:${m[1]}">${m[0].slice(0, 3)}</span>`).join('')}</div>` : ''}
  `;
}

// EXTRA vive en app.js, que se carga después: registramos la acción al terminar de cargar
document.addEventListener('DOMContentLoaded', () => {
  EXTRA.acciones.tema = el => {
    guardarTema({ [el.dataset.grupo]: el.dataset.valor });
    vAjustes(); // repinta el modal de ajustes
    render();
  };
});
