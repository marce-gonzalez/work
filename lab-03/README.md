# Campo de Datos 01 — v0.2

Starter para **Clase 03 — Computación Avanzada**  
Magíster en Ciencias del Diseño · Universidad Adolfo Ibáñez

## Idea central

> **Los datos no tienen una forma visual predeterminada. Diseñar una representación significa decidir qué información conservar, cómo relacionarla y cómo hacerla visible.**

Este starter representa el estado de un sistema real de bicicletas compartidas utilizando datos públicos en formato **GBFS**.

La aplicación intenta consultar el feed en tiempo real de **Citi Bike (Nueva York)** y utiliza un dataset local de respaldo si la fuente no está disponible.

## Fuente

Citi Bike publica datos públicos de estado del sistema mediante GBFS.

El starter utiliza:

```text
station_information
```

para:

- nombre de la estación;
- latitud;
- longitud;
- capacidad.

Y:

```text
station_status
```

para:

- bicicletas disponibles;
- anclajes disponibles;
- estado actual.

## Arquitectura conceptual

```text
FUENTE
GBFS

↓

FETCH

↓

JSON

↓

SELECCIONAR + COMBINAR

↓

REGLAS DE REPRESENTACIÓN

↓

GEOMETRÍA
```

## Reglas incluidas

### 1 — Posición

```text
latitud + longitud → posición X/Z
```

La distribución conserva aproximadamente la relación espacial entre estaciones.

### 2 — Altura total

```text
capacidad de la estación → altura total
```

El contenedor oscuro representa el tamaño del sistema disponible en esa estación.

### 3 — Volumen lleno

```text
bicicletas disponibles / capacidad → volumen ocupado
```

La geometría clara muestra cuánta capacidad está actualmente ocupada por bicicletas.

### 4 — Ancho

```text
porcentaje de ocupación → ancho
```

Una estación con mayor ocupación también aumenta ligeramente su presencia horizontal.

## Dataset local de respaldo

```text
assets/data/movilidad-respaldo.json
```

contiene datos sintéticos de estaciones.

Este archivo permite:

- completar LAB03 sin depender de internet;
- comprender primero la estructura de los datos;
- comparar una fuente estática con una fuente viva.

Los datos de respaldo **no representan estaciones reales**.

## Cómo ejecutarlo

Usa VS Code + Live Server.

1. Abre la carpeta.
2. Click derecho sobre `index.html`.
3. `Open with Live Server`.
4. Abre Developer Tools → Console si la escena no carga.

## Archivos

```text
campo-de-datos-01-v0.2/
├── index.html
├── styles.css
├── main.js
├── README.md
└── assets/
    └── data/
        └── movilidad-respaldo.json
```

## Qué mirar primero en `main.js`

```text
01 — CONFIGURACIÓN
02 — ESCENA
03 — DATOS: FETCH + FALLBACK
04 — REGLAS: INPUT → RELACIÓN → OUTPUT
05 — INTERFAZ + INSPECTOR
06 — POLLING RESPONSABLE
07 — ANIMACIÓN + RESPONSIVE
```

Para LAB03 el corazón conceptual está en:

```js
combinarFeedsGBFS()
```

y:

```js
crearModuloEstacion()
```

La primera convierte fuentes distintas en una estructura común.

La segunda traduce esa información en geometría.

## Experimento clave

Selecciona una estación en la escena y lee sus datos:

```text
bicicletas
anclajes libres
capacidad
ocupación
```

Luego identifica qué propiedad visual representa cada dato.
