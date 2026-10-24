# modpack-oficial

Contenido oficial de **Base Launcher**: el modpack del servidor, shaders y texturepacks.
El launcher lee `manifest.json` de este repo (rama `main`) y baja los archivos desde las **Releases**.
Para agregar o actualizar algo no hace falta tocar el launcher: subes el archivo, actualizas el manifiesto y listo.

```
manifest.json            lista que lee el launcher (la edita tools/agregar.js)
manifest.ejemplo.json    cómo se ve con contenido
icons/  previews/        imágenes de las tarjetas (iconos cuadrados, previews 16:9 en .jpg/.png)
modpack/                 fuente del modpack oficial
  pack.json              nombre, versión, Minecraft y loader
  mods.json              mods, shaders y texturas de Modrinth que lleva (por slug)
  overrides/             archivos propios: config/, options.txt, etc. (se copian tal cual)
tools/crear-mrpack.js    arma dist/<Nombre>-<versión>.mrpack
tools/agregar.js         calcula SHA-256 y agrega la entrada al manifiesto
```

Necesitas Node 18 o más y Git. No hay nada que instalar.

## Primera vez: subir el repo

```
git init -b main
git add .
git commit -m "Contenido oficial"
git remote add origin https://github.com/Norvyz/modpack-oficial.git
git push -u origin main
```

El repo tiene que ser **público**, si no el launcher no puede leerlo.

## Modpack oficial

1. Edita `modpack/mods.json` con los slugs de Modrinth (lo que aparece en la URL: `modrinth.com/mod/<slug>`). Las dependencias obligatorias se agregan solas. También admite `shaders` y `resourcepacks` de Modrinth si quieres que el pack ya los traiga.
2. Si quieres configuración propia (por ejemplo `config/iris.properties` con un shader activado, o un `options.txt`), ponla en `modpack/overrides/` respetando las carpetas.
3. Arma el archivo: `node tools/crear-mrpack.js`. Si algún mod no tiene versión para la versión de Minecraft, te dice cuál es y no genera nada a medias.
4. **Pruébalo antes de publicar**: en el launcher, Modpacks → Modrinth → "Instalar desde un archivo .mrpack…".
5. Crea una Release en GitHub con el tag `modpack-sociolandia` y sube el `.mrpack` de `dist/`.
6. Corre el comando que te imprimió el paso 3 (`node tools/agregar.js ... --servidor`). Eso actualiza `manifest.json`.
7. `git add manifest.json icons previews`, commit y `git push`.

`--servidor` hace que el launcher agregue **sociolandia.servidor.lol** a la lista de multijugador al instalar el modpack (arriba de la lista, sin borrar los servidores que ya tenga el jugador).

### Actualizar el modpack
Cambia `pack.json` → `version` (2, 3...), repite los pasos 3 a 7 con la misma release (reemplaza el archivo) o con una nueva. Al jugador le aparece "Actualizar". `agregar.js` sube el número solo si no pasas `--version`.

## Shaders y texturas

Súbelos como `.zip` **sin descomprimir**. Una Release por cosa:

```
node tools/agregar.js "Nombre-Shader.zip" --tipo shader --id nombre-shader --nombre "Nombre Shader" --release shader-nombre --mc 26.1.2 --desc "Una frase" --preview previews/nombre-shader.jpg
node tools/agregar.js "Nombre-Textura.zip" --tipo textura --id nombre-textura --nombre "Nombre Textura" --release textura-nombre --mc 26.1.2 --desc "Una frase" --preview previews/nombre-textura.jpg
```

Después igual: la Release con el archivo primero, luego `manifest.json` y las imágenes con commit y push.
Los shaders necesitan Iris y Sodium (el modpack oficial ya los trae). El launcher activa el shader solo al instalarlo; la textura también si la versión ya tiene un `options.txt`.

## Reglas para que no se rompa nada

- **Nombres de archivo sin espacios** (`Mi-Shader.zip`, no `Mi Shader.zip`): GitHub cambia los espacios al subirlos y el enlace dejaría de funcionar. `agregar.js` te avisa.
- **Orden**: primero la Release con el archivo, después el manifiesto. Así nadie ve algo que todavía no se puede bajar.
- **No cambies `name` en `pack.json`**: el launcher reconoce el modpack por ese nombre para actualizarlo en la misma carpeta, con sus mundos y su configuración.
- **No mezcles con las releases del launcher** (`base-launcher-releases`). Este repo es aparte a propósito, así el actualizador del launcher no confunde un modpack con una versión nueva.
- **Licencias**: sube solo lo que su autor permite redistribuir. Lo que está en Modrinth, mejor ponlo por slug en `mods.json` en vez de copiarlo a una Release.
- El launcher solo descarga desde las Releases de este repo y comprueba el SHA-256 de cada archivo; si no coincide, no instala nada.
