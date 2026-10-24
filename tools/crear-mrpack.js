#!/usr/bin/env node
// Arma el modpack oficial como .mrpack (formato de Modrinth) para el launcher.
//   node tools/crear-mrpack.js
// Lee modpack/pack.json (nombre, versión, Minecraft, loader), modpack/mods.json (slugs de Modrinth) y
// copia modpack/overrides/ (config, options.txt, etc.). Resuelve solo las dependencias obligatorias.
// Resultado: dist/<Nombre>-<versión>.mrpack  (sin dependencias: solo Node 18+).
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');

const ROOT = path.join(__dirname, '..'), MOD = path.join(ROOT, 'modpack'), DIST = path.join(ROOT, 'dist');
const API = 'https://api.modrinth.com/v2', UA = { 'User-Agent': 'Norvyz/modpack-oficial (Base Launcher)' };
const FOLDER = { mod: 'mods', shader: 'shaderpacks', resourcepack: 'resourcepacks' };
const json = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const die = m => { console.error('\n✖ ' + m); process.exit(1); };

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA }); if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (e) { if (i === 2) die(`No se pudo consultar ${url}\n  ${e.message}`); await new Promise(r => setTimeout(r, 800)); }
  }
}

// ---- zip mínimo (deflate), sin dependencias ----
const T = new Uint32Array(256).map((_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = b => { let c = ~0; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
function zip(entries) {
  const out = [], cen = []; let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'), raw = e.data, def = zlib.deflateRawSync(raw), z = def.length < raw.length, data = z ? def : raw, crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(z ? 8 : 0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(33, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    out.push(lh, name, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(z ? 8 : 0, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(33, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    cen.push(ch, name); off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(cen), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...out, cd, end]);
}
const walk = (d, base = d) => !fs.existsSync(d) ? [] : fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p, base) : e.name === '.gitkeep' ? [] : [path.relative(base, p).split(path.sep).join('/')];
});

(async () => {
  const pack = json(path.join(MOD, 'pack.json')), list = json(path.join(MOD, 'mods.json'));
  const { mc, loader = 'fabric' } = pack;
  if (!pack.name || !mc) die('modpack/pack.json necesita "name" y "mc".');
  if (loader !== 'fabric') die('Por ahora este script solo arma modpacks de Fabric.');

  let lv = pack.loaderVersion;
  if (!lv) { const l = await get('https://meta.fabricmc.net/v2/versions/loader'); lv = (l || []).find(x => x.stable)?.version; }
  if (!lv) die('No pude averiguar la versión de Fabric Loader. Ponla en pack.json ("loaderVersion").');

  const chosen = new Map(), missing = [], queue = [];
  const want = (ref, kind, via) => queue.push({ ref, kind, via });
  for (const [k, kind] of [['mods', 'mod'], ['shaders', 'shader'], ['resourcepacks', 'resourcepack']]) for (const s of list[k] || []) want(s, kind, 'lista');

  while (queue.length) {
    const { ref, kind, via } = queue.shift();
    const p = await get(`${API}/project/${encodeURIComponent(ref)}`);
    if (!p) { missing.push(`${ref} (no existe en Modrinth)`); continue; }
    if (chosen.has(p.id)) continue;
    const q = `game_versions=${encodeURIComponent(JSON.stringify([mc]))}` + (p.project_type === 'mod' ? `&loaders=${encodeURIComponent(JSON.stringify([loader]))}` : '');
    const vs = (await get(`${API}/project/${p.id}/version?${q}`)) || [];
    const v = vs.find(x => x.version_type === 'release') || vs[0];
    if (!v) { missing.push(`${p.title} (${ref}): sin versión para Minecraft ${mc}${p.project_type === 'mod' ? ' + ' + loader : ''}`); continue; }
    const f = v.files.find(x => x.primary) || v.files[0];
    chosen.set(p.id, { p, v, f, via, kind: p.project_type });
    for (const d of v.dependencies || []) if (d.dependency_type === 'required' && d.project_id && !chosen.has(d.project_id)) want(d.project_id, 'mod', 'dependencia de ' + p.title);
  }

  if (missing.length) {
    console.error('\nNo se pudo resolver:'); missing.forEach(m => console.error('  · ' + m));
    die('Quita esos elementos de modpack/mods.json (o espera a que tengan versión para ' + mc + ') y vuelve a correr el script.');
  }

  const files = [...chosen.values()].map(({ p, v, f }) => {
    const cs = p.client_side === 'unknown' ? 'optional' : p.client_side, ss = p.server_side === 'unknown' ? 'optional' : p.server_side;
    return { path: `${FOLDER[p.project_type] || 'mods'}/${f.filename}`, hashes: { sha1: f.hashes.sha1, sha512: f.hashes.sha512 }, env: { client: cs, server: ss }, downloads: [f.url], fileSize: f.size };
  });
  const index = { formatVersion: 1, game: 'minecraft', versionId: String(pack.version || 1), name: pack.name, summary: pack.desc || '', files, dependencies: { minecraft: mc, 'fabric-loader': lv } };

  const entries = [{ name: 'modrinth.index.json', data: Buffer.from(JSON.stringify(index, null, 2)) }];
  for (const rel of walk(path.join(MOD, 'overrides'))) entries.push({ name: 'overrides/' + rel, data: fs.readFileSync(path.join(MOD, 'overrides', rel)) });

  fs.mkdirSync(DIST, { recursive: true });
  const out = path.join(DIST, `${pack.name.replace(/[^\w.-]+/g, '-')}-${pack.version || 1}.mrpack`);
  fs.writeFileSync(out, zip(entries));

  console.log(`\n✔ ${path.relative(ROOT, out)}  (${(fs.statSync(out).size / 1048576).toFixed(2)} MB)`);
  console.log(`  Minecraft ${mc} · Fabric Loader ${lv} · ${files.length} archivos`);
  for (const { p, v, via } of chosen.values()) console.log(`   ${via === 'lista' ? '•' : '↳'} ${p.title} ${v.version_number}${via === 'lista' ? '' : '   (' + via + ')'}`);
  console.log(`\nSiguiente paso:\n  node tools/agregar.js "${path.relative(ROOT, out)}" --tipo modpack --id sociolandia --nombre "${pack.name}" --release modpack-sociolandia --version ${pack.version || 1} --mc ${mc} --loader ${loader} --servidor --icono icons/sociolandia.png`);
})();
