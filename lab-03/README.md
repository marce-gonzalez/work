# LAB 03 — Focos activos NASA FIRMS

Mapa interactivo que consulta directamente la API oficial de [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/) para el área visible.

## Configuración

1. Solicita una [MAP_KEY gratuita](https://firms.modaps.eosdis.nasa.gov/api/map_key/).
2. Sirve `lab-03` con Live Server u otro servidor HTTP.
3. Ingresa la clave en el panel y presiona **Consultar FIRMS**.

La clave se guarda sólo en `localStorage`; no se escribe en el repositorio. La consulta se actualiza cada 15 minutos y al cambiar el área, producto o rango. La Area API permite entre 1 y 5 días por petición.

## CORS y proxy

La Area API no incluye actualmente permisos CORS para páginas alojadas en otros dominios. `firms-proxy-worker.js` contiene un proxy para Cloudflare Workers que sólo acepta los cuatro productos configurados, áreas geográficas válidas y rangos de 1–5 días.

1. Despliega `firms-proxy-worker.js` como Worker.
2. Configura la variable `ALLOWED_ORIGIN` con el origen del sitio, por ejemplo `https://usuario.github.io`.
3. Copia la URL del Worker en `FIRMS_PROXY`, al principio de `main.js`, sin barra final.

La `MAP_KEY` viajará a NASA a través de ese Worker. Para un proyecto público de producción es preferible guardar la clave como secreto del servidor y no solicitarla en la interfaz.

## Datos y representación

- `latitude`, `longitude` → posición;
- `confidence` → densidad y saturación del humo;
- `frp` → tamaño y expansión de la nube;
- `daynight` → halo violeta;
- `acq_date`, `acq_time` → momento de adquisición UTC.

El mapa base se representa como cartografía lineal blanca sobre negro. Los focos usan la textura original `assets/images/smoke-oil.png`, generada a partir de las referencias visuales del ejercicio. Para mantener una animación fluida se dibujan las 650 detecciones filtradas con mayor FRP; las métricas conservan el total completo.

Productos incluidos: VIIRS NOAA-21 NRT, VIIRS NOAA-20 NRT, VIIRS Suomi-NPP NRT y MODIS NRT. NRT significa *Near Real-Time*. Una detección es una anomalía térmica y no confirma por sí sola un incendio en terreno.

Al iniciar, la aplicación elimina las claves y capturas locales pertenecientes a las versiones anteriores basadas en Patagonia Fires y la DMC.
