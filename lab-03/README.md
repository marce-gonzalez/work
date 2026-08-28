# LAB 03 — Focos de incendio

Mapa interactivo de detecciones satelitales para Argentina y Chile. Consume el mismo endpoint de focos que usa [Patagonia Fires](https://www.patagoniafires.org/) y representa datos derivados de NASA FIRMS.

## Mapeo visual

- latitud / longitud → posición en el mapa;
- `severity_score` → tamaño y color;
- FRP, en MW → potencia radiativa observada;
- fecha y hora UTC → recencia;
- `is_night` → filtro de detecciones nocturnas.

Una detección es una anomalía térmica observada por satélite, no la confirmación de un incendio en terreno.

## Uso

1. Sirve la carpeta con Live Server u otro servidor HTTP.
2. Elige el período y las severidades.
3. Mueve el mapa para consultar el área visible o presiona **Actualizar ahora**.

La aplicación intenta actualizar cada 30 minutos y guarda la última respuesta válida en `localStorage`.

## Restricción CORS

El endpoint `https://www.patagoniafires.org/api/fires` responde JSON públicamente, pero al 28 de agosto de 2026 no envía `Access-Control-Allow-Origin`. Por eso un sitio estático alojado en otro dominio no puede leerlo directamente desde el navegador.

Para activar el modo vivo, despliega un proxy propio que acepte una URL de `www.patagoniafires.org`, consulte desde el servidor y devuelva el JSON con CORS limitado al dominio del proyecto, caché y límite de solicitudes. Luego asigna su dirección a `API_PROXY` al inicio de `main.js`.

Contrato esperado:

```text
GET https://tu-proxy.example/?url=<URL codificada de Patagonia Fires>
```

No conviene usar proxies CORS públicos: pueden registrar, modificar o dejar de servir los datos sin aviso.
