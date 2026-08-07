---
name: course-site
description: Construye y actualiza el sitio estático de GitHub Pages del curso Computación Avanzada a partir del contenido de about/README.md y de los assets locales. Usar cuando el estudiante quiera publicar su About o agregar un modelo 3D orbitable durante LAB01.
argument-hint: "[publish-about | add-3d-model]"
disable-model-invocation: true
---

# Course Site

Esta skill mantiene un sitio estático simple, explicable y compatible con GitHub Pages.

## Antes de editar

1. Lee `about/README.md`.
2. Lee `.github/copilot-instructions.md`.
3. Revisa si existen `index.html`, `styles.css` y `AI_USAGE.md`.
4. No inventes información personal ni agregues contenido que no esté en el repositorio.

## Comando `publish-about`

Cuando el usuario invoque `/course-site publish-about`:

1. Convierte el contenido de `about/README.md` en una página pública.
2. Crea o actualiza `index.html` y `styles.css` en la raíz.
3. Usa HTML semántico y CSS simple, responsive y accesible.
4. Mantén una estética dark mode editorial: fondo casi negro, texto claro, grises neutros y un acento cálido discreto.
5. Si existe una imagen de perfil o proyecto en `assets/images/`, úsala con ruta relativa; si no existe, no inventes una.
6. Conserva links externos como links clickeables.
7. No uses frameworks ni build step.
8. Al terminar, explica qué archivos cambiaste y sugiere revisar el diff antes de hacer commit.

## Comando `add-3d-model`

Cuando el usuario invoque `/course-site add-3d-model`:

1. Busca un archivo `.glb` o `.gltf` dentro de `assets/models/`.
2. Si no existe, detente y explica dónde debe guardarse.
3. Agrega al sitio una sección "Modelo 3D" con un visor orbitable.
4. Para LAB01, privilegia `<model-viewer>` o una alternativa equivalente de baja complejidad y sin build step. Fija la versión de cualquier dependencia externa que utilices.
5. Configura cámara orbital, interacción por mouse/touch, fondo neutro y tamaño responsive.
6. Usa rutas relativas al modelo para que funcione en GitHub Pages.
7. Si el archivo es `.gltf` con recursos externos, verifica que `.bin` y texturas estén incluidos con las rutas correctas.
8. No cambies el contenido del About salvo lo necesario para integrar el visor.
9. Al terminar, explica qué archivos cambiaste y sugiere revisar el diff antes de hacer commit.

## Criterios de terminado

- `index.html` abre localmente sin errores estructurales.
- El sitio no contiene información inventada.
- Los links y rutas son relativas cuando corresponde.
- El layout funciona en desktop y móvil.
- El modelo 3D, si existe, se puede orbitar.
- Los cambios son suficientemente simples para que el estudiante pueda explicarlos.
