# LAB 03 — Atmósfera en datos

Visualización Three.js de observaciones recientes de la Red de Estaciones Meteorológicas Automáticas de la Dirección Meteorológica de Chile (DMC).

## Fuente y alcance

El servicio oficial `getDatosRecientesRedEma` entrega datos minutarios de las últimas 12 horas y requiere usuario y token personal de Servicios Climáticos DMC. La aplicación toma el último registro útil de cada estación y consulta cada cinco minutos.

La fuente DMC usada aquí incluye temperatura, humedad, viento, presión y precipitación, pero **no concentraciones de MP2.5 o MP10**. El color es un proxy didáctico de dispersión calculado con viento y humedad; no es un índice sanitario ni una medición de contaminación. Para material particulado real hay que integrar una fuente de calidad del aire, por ejemplo SINCA, como segunda capa.

## Mapeo visual

- latitud / longitud → posición X/Z;
- humedad relativa → altura;
- velocidad y dirección del viento → ancho y flecha;
- proxy de dispersión → color rojo–verde.

## Uso

1. Sirve esta carpeta con Live Server.
2. Ingresa el correo y token de la API DMC.
3. Presiona **Actualizar ahora**.

Las credenciales quedan en `localStorage` y no se escriben en el repositorio. Para publicar se recomienda un proxy de servidor que no exponga el token y resuelva posibles restricciones CORS. Sin credenciales o ante un error se carga `assets/data/ambiental-respaldo.json`, cuyos valores son ficticios.

Documentación oficial: https://climatologia.meteochile.gob.cl/application/documentacion/getDocumento/1
