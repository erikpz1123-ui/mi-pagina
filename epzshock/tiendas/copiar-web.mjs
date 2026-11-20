// Copia la app web (carpeta epzshock/) a tiendas/www, que es lo que se empaqueta en la app nativa.
import { cpSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const origen = join(aqui, '..');
const destino = join(aqui, 'www');
const EXCLUIR = new Set(['tiendas', 'supabase', 'marca', 'node_modules', '.DS_Store']);

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino);
for (const nombre of readdirSync(origen)) {
  if (EXCLUIR.has(nombre) || nombre.endsWith('.md')) continue;
  cpSync(join(origen, nombre), join(destino, nombre), { recursive: true });
}
console.log('App web copiada a tiendas/www');
