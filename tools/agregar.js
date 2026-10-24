#!/usr/bin/env node
// Agrega o actualiza un modpack, shader o texturepack en manifest.json (calcula SHA-256 y tamaño solo).
//   node tools/agregar.js <archivo> --tipo modpack|shader|textura --id <id> --nombre "<Nombre>" --release <tag> [opciones]
// Opciones: --version N  --mc 26.1.2  --loader fabric  --desc "..."  --autor "..."  --icono ruta  --preview ruta  --servidor
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..'), MAN = path.join(ROOT, 'manifest.json');
const REL = 'https://github.com/Norvyz/modpack-oficial/releases/download/';
const TIPOS = { modpack: 'modpacks', shader: 'shaders', textura: 'texturepacks' };
const die = m => { console.error('\n✖ ' + m); process.exit(1); };

const a = process.argv.slice(2), file = a[0] && !a[0].startsWith('--') ? a[0] : null, o = {};
for (let i = file ? 1 : 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }

if (!file || !o.tipo || !o.id || !o.nombre || !o.release) die('Uso: node tools/agregar.js <archivo> --tipo modpack|shader|textura --id <id> --nombre "<Nombre>" --release <tag>');
const kind = TIPOS[o.tipo]; if (!kind) die('--tipo debe ser modpack, shader o textura.');
if (!/^[\w-]{1,40}$/.test(o.id)) die('--id solo admite letras, números, "-" y "_" (máx. 40).');
if (!/^[\w.-]+$/.test(o.release)) die('--release (el tag de la Release) solo admite letras, números, ".", "-" y "_".');
if (!fs.existsSync(file)) die('No existe el archivo: ' + file);
const name = path.basename(file);
if (!/^[\w.()+-]+$/.test(name)) die(`El nombre "${name}" tiene espacios o símbolos raros. GitHub los cambia al subir el archivo y el enlace dejaría de funcionar.\n  Renómbralo (por ejemplo "${name.replace(/[^\w.()+-]+/g, '-')}") y vuelve a correr el comando.`);
if (kind === 'modpacks' && !/\.mrpack$/i.test(name)) die('El modpack debe ser un archivo .mrpack (usa tools/crear-mrpack.js).');
if (kind !== 'modpacks' && !/\.zip$/i.test(name)) die('Los shaders y las texturas deben ser un .zip (sin descomprimir).');
for (const k of ['icono', 'preview']) if (o[k] && !fs.existsSync(path.join(ROOT, o[k]))) console.warn(`⚠ ${o[k]} no existe todavía: acuérdate de subirlo al repo.`);

const buf = fs.readFileSync(file);
const man = JSON.parse(fs.readFileSync(MAN, 'utf8'));
man[kind] = man[kind] || [];
const old = man[kind].find(x => x.id === o.id);
const entry = {
  ...(old || {}),
  id: o.id, name: o.nombre,
  version: o.version != null ? (isNaN(+o.version) ? o.version : +o.version) : old ? (isNaN(+old.version) ? old.version : +old.version + 1) : 1,
  ...(o.mc ? { mc: o.mc } : {}), ...(o.loader ? { loader: o.loader } : {}), ...(o.desc ? { desc: o.desc } : {}), ...(o.autor ? { author: o.autor } : {}),
  ...(o.icono ? { icon: o.icono } : {}), ...(o.preview ? { preview: o.preview } : {}),
  ...(kind === 'modpacks' && o.servidor ? { server: true } : {}),
  file: REL + o.release + '/' + name, sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length
};
if (old) man[kind][man[kind].indexOf(old)] = entry; else man[kind].push(entry);
fs.writeFileSync(MAN, JSON.stringify(man, null, 2) + '\n');

console.log(`\n✔ ${old ? 'Actualizado' : 'Agregado'} en manifest.json: ${entry.name} (v${entry.version})`);
console.log(`  SHA-256: ${entry.sha256}\n  Tamaño:  ${(entry.size / 1048576).toFixed(2)} MB`);
console.log(`\nAhora, en GitHub:\n  1. Releases → Draft a new release → tag "${o.release}" ${old ? '(si ya existe: edítala y reemplaza el archivo)' : ''}\n  2. Sube "${name}" a esa release y publícala.\n  3. Sube manifest.json (y icons/ o previews/ si agregaste) con commit y push a main.\n  Por orden: primero la Release con el archivo, después el manifiesto, así nadie ve algo que todavía no se puede descargar.`);
