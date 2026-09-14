# Texto para pegar en Codex dentro de Visual Studio Code

Construye mi interfaz interactiva para un cultivo de microalgas a partir de README.md y web/co2.mjs de este proyecto. Usa español. Antes de modificar, inspecciona el proyecto existente y conserva su framework. Si no existe, usa HTML, CSS y JavaScript con módulos, sin backend.

Quiero desplegarla en GitHub Pages y conectar localmente un Arduino UNO mediante Web Serial. Integra CO2Serial desde web/co2.mjs sin alterar la velocidad de 115200 baudios ni abrir otro lector USB. Crea botones Conectar Arduino y Desconectar, estado de conexión, CO₂ en ppm, estado del sensor y orden de bomba. La apertura del puerto debe partir del clic del usuario. Maneja cancelación, puerto ocupado y navegadores incompatibles.

Usa eventos data/status/warning. No conviertas null en cero. En calentamiento, error, desconexión o más de 10 segundos sin datos, oculta el número en vivo y marca claramente sin datos. No presentes pump_command como caudal medido. Desconectar la página no detiene el control local de Arduino.

Grafica los últimos 10 minutos con fecha de recepción. No unas segmentos a través de desconexiones. Crea una representación generativa cuya actividad visual dependa del CO₂ válido; explica que es una interpretación artística, no una simulación validada del crecimiento ni del carbono capturado. Puedes interpolar visualmente, pero no fabricar puntos de medición.

Incluye un modo demostración opcional y explícitamente rotulado DATOS SIMULADOS, desactivado inicialmente y separado de datos reales. Nunca lo actives automáticamente al fallar el sensor. Permite exportar el historial de la sesión como JSON por una acción explícita.

Agrega opcionalmente un modo Archivo local que consulte ./data/latest.json con cache no-store, validación de fecha y conexión según README. Este modo se usa en localhost con bridge.py; para GitHub Pages usa USB directo. Explica que visitantes remotos no reciben el Arduino de otra persona.

Usa rutas relativas compatibles con un repositorio de GitHub Pages, diseño adaptable, botones accesibles y feedback textual además del color. No incluyas tokens ni credenciales. Verifica los estados vacíos y errores. Documenta ejecución y publicación; no publiques sin que yo lo solicite.
