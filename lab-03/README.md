# LAB 03 — El camino de las cenizas

Mapa interactivo que cruza focos de la API oficial de [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/) con viento superficial NOAA GFS.

## Configuración

1. Solicita una [MAP_KEY gratuita](https://firms.modaps.eosdis.nasa.gov/api/map_key/).
2. Sirve `lab-03` con Live Server u otro servidor HTTP.
3. Ingresa la clave en el panel y presiona **Actualizar datos**.

La clave se guarda sólo en `localStorage`. FIRMS se actualiza cada 15 minutos y al cambiar el área, producto o rango.

## Datos y representación

- `latitude`, `longitude` → origen de las partículas;
- `confidence` → radio, densidad y color del foco fijo;
- `frp` → prioridad de emisión;
- viento GFS a 10 m → dirección y velocidad del recorrido;
- vida de partícula → desaparición gradual.

Un único Canvas dibuja hasta 180 focos como acumulaciones fijas y anima hasta 1.400 partículas arrastradas por el viento. Alta confianza utiliza 54 puntos en 22 px de radio; nominal, 34 puntos en 15 px; baja, 18 puntos en 9 px. La paleta se limita a rojos, naranjos y grises. Las partículas nacen cerca del centro, avanzan con el vector GFS y desaparecen gradualmente.

Earth Nullschool utiliza NOAA GFS como fuente meteorológica, pero su archivo EPAK actual no ofrece una API pública con CORS. El ejercicio obtiene las mismas variables GFS de viento a 10 m mediante la [GFS API de Open-Meteo](https://open-meteo.com/en/docs/gfs-api), en consultas agrupadas por coordenadas. Earth Nullschool se conserva como referencia conceptual de la visualización.

Productos FIRMS incluidos: VIIRS NOAA-21 NRT, VIIRS NOAA-20 NRT, VIIRS Suomi-NPP NRT y MODIS NRT. Una detección es una anomalía térmica y no confirma por sí sola un incendio en terreno.
