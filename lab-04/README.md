# Sistema Colectivo

Artefacto progresivo para Computación Avanzada · MCD UAI.

## Secuencia

1. Conectar / comunicar
2. Representar
3. Agregar variables
4. Colaborar

En `main.js`, cambia:

```js
const ETAPA = 1;
```

por `2`, `3` o `4`.

## Topics

Publicación individual:

```text
uai/mcd/2026/sistema-colectivo/{clientId}/estado
```

Suscripción colectiva:

```text
uai/mcd/2026/sistema-colectivo/+/estado
```

## Payload

```json
{
  "nombre": "Julián",
  "clientId": "navegador-julian-A82F",
  "intensidad": 72,
  "actividad": 35,
  "variacion": 81,
  "timestamp": 1787869200000
}
```

## Uso

Abre `index.html` con Live Server. La contraseña MQTT se ingresa en la interfaz y no está guardada en el código.

El proyecto es estático y puede publicarse directamente con GitHub Pages.
