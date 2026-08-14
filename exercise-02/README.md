# Campo Generativo 01

Guía para **Clase 02 — Computación Avanzada**  
Magíster en Ciencias del Diseño · Universidad Adolfo Ibáñez

## Objetivo

> **Diseñar un sistema no significa dibujar una única forma. Significa definir las reglas que producen un espacio de posibilidades.**

Este starter genera un campo tridimensional de módulos mediante reglas simples.

## Parámetros

### Sistema
- Columnas
- Filas
- Separación

### Comportamiento
- Amplitud
- Frecuencia
- Rotación

### Variación
- Aleatoriedad
- Semilla

## Estructura

```text
campo-generativo-guia/
├── README.md
├── index.html
├── style.css
├── main.js
└── assets/
    └── models/
```

## Cómo ejecutarlo

Este proyecto utiliza módulos JavaScript, por lo que debe abrirse mediante un servidor local.

### Opción recomendada — VS Code + Live Server

1. Abre esta carpeta en VS Code.
2. Instala la extensión **Live Server**.
3. Haz click derecho sobre `index.html`.
4. Selecciona **Open with Live Server**.

## Qué mirar en `main.js`

```text
01 — PARÁMETROS
02 — ESCENA
03 — OBJETO GENERATIVO
04 — REGLAS GENERATIVAS
05 — GENERAR CAMPO
06 — ALEATORIEDAD CONTROLADA
07 — INTERFAZ
08 — BUCLE DE ANIMACIÓN
```

Para LAB02 concéntrate inicialmente en:

```js
function calcularAlturaModulo(x, z)
```

y:

```js
function calcularRotacionModulo(x, z)
```

Estas dos funciones representan **decisiones de diseño**.

## Primeros experimentos

### 1 — Cambia la amplitud

```js
amplitud: 5.0
```

### 2 — Cambia la frecuencia

```js
frecuencia: 0.15
```

### 3 — Cambia la regla

Dentro de `calcularAlturaModulo()`, reemplaza:

```js
Math.sin(distancia * parametros.frecuencia)
```

por:

```js
Math.cos(distancia * parametros.frecuencia)
```

### 4 — Haz que la altura dependa de X

```js
const onda =
  Math.sin(x * parametros.frecuencia) *
  parametros.amplitud;
```

### 5 — Prueba aleatoriedad + semilla

La misma **semilla** produce siempre la misma variación.

## GitHub Pages

El proyecto usa rutas relativas y puede publicarse directamente en GitHub Pages.

## Extensión opcional — Rhino → GLB

La carpeta:

```text
assets/models/
```

queda preparada para una etapa posterior donde `BoxGeometry` podrá reemplazarse por una geometría propia exportada desde Rhino como `.glb`.

## Pregunta guía

> **¿Qué cambia cuando dejamos de diseñar una forma y comenzamos a diseñar las reglas que producen formas?**
