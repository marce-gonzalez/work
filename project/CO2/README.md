# CO₂ → Arduino → bomba → interfaz

Base preparada para Arduino UNO R3, sensor MH-Z1911A, módulo XY-MOS y bomba USB de 5 V / 1 A. Si elegiste finalmente CCS811 o MQ135, este firmware no corresponde: esos sensores no entregan una medida directa equivalente de CO₂ y requieren otro controlador.

## 1. Qué hace el sistema

Arduino lee el sensor y publica una línea JSON por USB cada aproximadamente 2 segundos. Controla la bomba localmente y acepta umbrales enviados por la web; el control físico no depende de que la página permanezca abierta. Hay dos caminos alternativos:

- **Interfaz local o GitHub Pages:** Arduino ↔ USB ↔ navegador con Web Serial → interfaz. Permite leer telemetría y guardar umbrales en EEPROM. No requiere Python ni escribir un archivo físico.
- **Archivo JSON físico local:** Arduino → USB → bridge.py → data/latest.json → interfaz local mediante fetch. El archivo se reemplaza con cada lectura, no acumula historial.

GitHub Pages aloja archivos estáticos. No ejecuta Python y no modifica el JSON del repositorio. La página publicada puede leer por USB el Arduino conectado al equipo de quien la abre. Otras personas no verán tu Arduino a distancia: para eso habría que agregar un servidor/API o servicio en tiempo real. No uses commits cada dos segundos.

## 2. Antes de energizar

La etiqueta fotografiada de la bomba dice 5 V DC / 1 A. La caja de pilas indica 3/4,5 V; no se ha confirmado que entregue 2 A. Para este montaje se usa una fuente regulada externa de 5 V con capacidad de 2 A, y se desconecta la caja de pilas.

| Origen | Destino | Observación |
|---|---|---|
| Fuente externa +5 V | XY-MOS VIN+ | Circuito de potencia |
| Fuente externa negativo | XY-MOS VIN− | Masa de potencia |
| XY-MOS OUT+ | VBUS positivo del adaptador USB hembra de la bomba | Verificar polaridad con multímetro |
| XY-MOS OUT− | GND del adaptador USB hembra de la bomba | Retorno conmutado: NO unirlo directamente a GND común |
| Arduino D5 | XY-MOS TRIG/PWM | Se usará encendido/apagado, no PWM |
| Arduino GND | XY-MOS GND y negativo de fuente | Referencia común |
| Arduino 5 V | MH-Z1911A Vin | Confirmar pinout exacto con manual del vendedor |
| Arduino GND | MH-Z1911A GND | Puede distribuirse en protoboard |
| TX del sensor | Arduino D10 | Recepción SoftwareSerial |
| RX del sensor | Arduino D11 | Transmisión SoftwareSerial; verificar niveles del modelo |
| USB Arduino | Computador | Alimentación Arduino y datos |

No unir el +5 V externo al pin 5 V del Arduino mientras recibe alimentación por USB. No alimentar la bomba desde Arduino ni pasar su corriente por los rieles de protoboard. Utilizar bornes y cable adecuados en la potencia. Los pads de control del módulo necesitan conexiones soldadas fiables; un cable suelto dentro de un agujero no es suficiente.

El diodo 1N4007, para esta prueba de conmutación lenta, se conecta en paralelo con la carga: **banda/cátodo a OUT+ y extremo sin banda/ánodo a OUT−**. No va en serie. El marcado incompleto «001» no permite identificar el otro diodo. Un 1N4007 no establece por sí solo que la bomba ni la protección sean adecuadas para PWM; su corriente nominal es 1 A y falta conocer el arranque de la bomba. El condensador cerámico 104 equivale a 100 nF y puede ir entre alimentación y GND del sensor; no sustituye al diodo.

## 3. Confirmar el sensor y cargar Arduino

**Limitación técnica pendiente:** el manual MH-Z1911A consultado describe UART, pero no basta para confirmar sus comandos. El sketch usa el comando de lectura 0x86 de la familia MH-Z19, a 9600 baudios, de forma provisional. No envía calibración ni comandos de configuración. Pide al vendedor el protocolo del MH-Z1911A y comprueba compatibilidad; si difiere, se debe modificar `readCO2()`. Un checksum correcto comprueba integridad de una trama, no exactitud de calibración.

1. Instala Arduino IDE y el soporte Arduino AVR Boards si no está disponible. La interfaz se desarrollará después en Visual Studio Code.
2. Abre `arduino/co2_control/co2_control.ino`. Selecciona Arduino UNO y su puerto en Herramientas. SoftwareSerial viene con el soporte AVR; no necesitas ArduinoJson.
3. El firmware tiene `ENABLE_PUMP_CONTROL = true`. Para la primera comprobación conecta Arduino y sensor dejando físicamente desconectada la potencia de la bomba.
4. Carga el sketch. Abre Monitor serie a **115200** baudios. Espera al menos 60 segundos; durante ese tiempo aparecerá `warming_up` y CO₂ `null`.
5. Deben aparecer registros `ok` con valores plausibles y cambiantes. Si solo hay `sensor_error`, verifica alimentación, TX/RX, masa, pinout y protocolo. No lo conviertas en valores inventados ni habilites la bomba para ocultar el error.
6. Tras confirmar el protocolo y las lecturas, prueba el montaje de potencia supervisado.

Control inicial: enciende a **700 ppm o más**, apaga a **650 ppm o menos** y conserva el estado entre ambos umbrales. Respeta al menos 30 segundos entre cambios normales. Durante calentamiento o ante una lectura inválida apaga inmediatamente. Los umbrales válidos guardados desde la interfaz sobreviven al reinicio gracias a EEPROM; si no existe una configuración válida se usan 700/650 ppm. Estos valores son parámetros de control, no límites de seguridad ni una recomendación biológica. La bomba sigue controlada por Arduino al cerrar la web si Arduino conserva alimentación. Desconectar la web no es un botón de parada.

No se ha comprobado que la electrónica interna de la bomba tolere regulación PWM. Este paquete no regula velocidad; un siguiente paso podría estudiar ciclos de aireación más largos, previa prueba. Aumentar aireación tampoco equivale a medir absorción de CO₂ o crecimiento de microalgas.

## 4. Camino recomendado: Web Serial para la interfaz publicada

1. La interfaz incluida importa `web/co2.mjs` mediante una ruta relativa. Conserva la extensión `.mjs` y esa estructura al publicar.
2. Usa Chrome o Edge de escritorio. Sirve el proyecto con localhost durante el desarrollo; en GitHub Pages funcionará con HTTPS.
3. Cierra Monitor serie y detén `bridge.py`: solo una aplicación debe abrir el puerto.
4. Integra estos manejadores en un archivo de JavaScript cargado mediante `<script type="module">`. La interfaz debe tener botones con los IDs indicados y un elemento `estado`.

```js
import { CO2Serial } from './web/co2.mjs';
const dispositivo = new CO2Serial();
const estado = document.querySelector('#estado');
document.querySelector('#conectar').onclick = async () => {
  try { await dispositivo.connect(); }
  catch (error) { estado.textContent = error.message; }
};
document.querySelector('#desconectar').onclick = async () => {
  try { await dispositivo.disconnect(); }
  catch (error) { estado.textContent = error.message; }
};
dispositivo.addEventListener('data', ({detail: dato}) => {
  estado.textContent = dato.sensor_status;
  // Sustituir por la función real del proyecto:
  // actualizarInterfaz(dato);
  console.log(dato.co2_ppm, dato.pump_command);
});
dispositivo.addEventListener('status', ({detail}) => {
  estado.textContent = detail;
  // Si stale o disconnected: borrar valor en vivo y detener animación basada en datos.
});
dispositivo.addEventListener('warning', ({detail}) => console.warn(detail));

// El adaptador serializa la escritura y resuelve solo al recibir un ack aceptado:
await dispositivo.setThresholds(700, 650, true);
```

5. Pulsa Conectar Arduino y selecciona su puerto. Abrir el puerto puede reiniciar UNO: espera nuevamente el calentamiento.
6. `data` entrega la última telemetría interpretada. `ack` entrega confirmaciones de configuración. `dispositivo.latest` contiene la última telemetría o null si no está disponible. No hay escritura automática de un archivo en este modo.
7. La interfaz recibe muestras cada 2 segundos; puede animarse a 60 fps interpolando visualmente entre lecturas. Esa interpolación no crea nuevas mediciones. El sensor tiene su propio tiempo de respuesta, más lento que la transmisión USB.

## 5. Camino alternativo: archivo latest.json que se actualiza

Instala Python 3.10 o posterior. En la terminal de VS Code, situada en esta carpeta:

```sh
python -m pip install -r requirements.txt
python -m serial.tools.list_ports
python bridge.py --port COM3
```

Cambia COM3 por tu puerto. En macOS/Linux puede ser `/dev/tty.usbmodem...` o `/dev/ttyACM0`; según la instalación se usa `python3` en lugar de `python`. Deja la terminal abierta. El programa reemplaza `data/latest.json` después de cada registro válido. Si se desconecta el cable, termina y marca la conexión desconectada; vuelve a ejecutarlo para reconectar.

En otra terminal, con la interfaz `index.html` en esta misma carpeta:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Abre `http://localhost:8000`. Dentro de tu interfaz local usa, por ejemplo:

```js
async function leerArchivo() {
  try {
    const r = await fetch('./data/latest.json', {cache: 'no-store'});
    if (!r.ok) throw new Error('JSON no disponible');
    const d = await r.json();
    const age = Date.now() - Date.parse(d.received_at);
    if (d.connection !== 'connected' || !Number.isFinite(age) || age < -5000 || age > 10000) {
      throw new Error('Lectura desconectada o antigua');
    }
    // actualizarInterfaz(d); // implementar en tu proyecto
  } catch (error) {
    // mostrarSinDatos(error.message); // borrar valor en vivo, conservar historial si existe
    console.warn(error.message);
  } finally { setTimeout(leerArchivo, 2000); }
}
leerArchivo();
```

La comprobación de fecha evita mostrar un archivo antiguo como si siguiera actualizándose cuando el programa se cierra inesperadamente. No uses este camino con una página remota que intente leer archivos de tu disco; para Pages utiliza Web Serial. No ejecutes ambos lectores USB simultáneamente.

## 6. Contrato de datos para Codex

`data/example.json` es solo un ejemplo ficticio de formato. No debe presentarse como medición real. El puerto transmite NDJSON: una línea JSON completa por lectura, no un único documento JSON acumulado.

| Campo | Significado |
|---|---|
| schema_version | Versión 2 del formato |
| type | telemetry para lecturas periódicas; ack para respuestas a comandos |
| seq | Secuencia de muestra; se reinicia al reiniciar Arduino |
| uptime_ms | Milisegundos desde encendido; no es fecha absoluta |
| co2_ppm | Entero de CO₂ o null si no hay lectura válida |
| sensor_status | ok, warming_up o sensor_error |
| pump_command | on/off: orden eléctrica; NO confirma movimiento ni caudal |
| control_mode | automatic: histéresis y temporización ejecutadas en Arduino |
| control_enabled | true: control autónomo habilitado en el firmware |
| threshold_on_ppm | Umbral vigente para ordenar encendido |
| threshold_off_ppm | Umbral vigente para ordenar apagado |
| received_at | Fecha UTC añadida por el computador al recibir |
| connection | connected, stale o disconnected; añadida por el puente local |

En Web Serial `stale` y `disconnected` se entregan por el evento `status`; `data` siempre corresponde a telemetría válida y `ack` a la respuesta del Arduino. En el archivo local una desconexión genera un registro reducido con CO₂ y orden de bomba null, porque su estado físico no puede comprobarse a distancia. No confundir `null` con 0 ppm.

La configuración se envía como una línea JSON completa, por ejemplo `{"command":"set_thresholds","on_ppm":700,"off_ppm":650,"save":true}`. Arduino admite únicamente enteros de 400 a 5000 ppm, exige apagado menor que encendido y una separación mínima de 20 ppm. Solo escribe EEPROM con `save:true` y evita reescribir una configuración idéntica.

## 7. Ejecutar la interfaz

La interfaz estática terminada se encuentra en `index.html`, `styles.css` y `app.mjs`. No requiere compilación ni backend. Desde esta carpeta inicia un servidor local:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Abre `http://localhost:8000`. El modo inicial es **USB directo** y no abre ningún puerto hasta pulsar «Conectar Arduino». Para usar **Archivo local**, ejecuta `bridge.py` en otra terminal y selecciona ese modo; no uses ambos lectores USB a la vez. **Demostración** permanece apagada hasta que la selecciones e inicies, y siempre se rotula como datos simulados.

El botón «Exportar historial JSON» descarga explícitamente las muestras válidas recibidas en esta sesión. Nada se envía a un servidor. El formulario de umbrales solo se habilita con USB directo y no muestra “guardado” hasta recibir un `ack` aceptado. Cerrar o desconectar la página no detiene el control que ejecuta Arduino.

La visualización incorpora un volumen ajustable entre 1 y 10 litros y un indicador de «Oxígeno producido» expresado en mL O₂ equivalentes por hora. Es un **proxy visual**, calculado como `volumen × coeficiente fotosintético × CO₂/1000 × 2`; no es una medición ni una estimación biológica validada. Una tasa real exigiría, como mínimo, calibrar biomasa, iluminación, temperatura, flujo de gas y absorción de CO₂. El slider solo modifica esta interpretación visual y no cambia el firmware ni el control de la bomba.

Dentro de la circunferencia generativa se dibuja una partícula morada por cada ppm de una lectura válida —por ejemplo, 810 partículas para 810 ppm— junto a células verdes y partículas blancas derivadas. Cada nueva secuencia reorganiza gradualmente el campo. Cuando el CO₂ alcanza el umbral de encendido informado por Arduino, aparecen pequeños puntos grises intermitentes repartidos dentro de la circunferencia y aumenta la actividad visual; esto representa la orden de aireación, no confirma caudal ni funcionamiento mecánico. La pestaña Demostración es la fuente seleccionada inicialmente, pero permanece detenida hasta que la persona pulsa «Iniciar demostración».

## 8. Publicar después en GitHub Pages

1. Construye tu interfaz con el texto de `PROMPT_CODEX.md` y el adaptador.
2. Verifica localmente conexión, calentamiento, error de sensor, botón desconectar y retirada del cable. El gráfico debe dejar de mostrar datos como actuales después de 10 segundos sin recibirlos.
3. Sube a un repositorio GitHub los archivos de la interfaz. No subas `.venv`, registros privados ni `latest.json`. El `.gitignore` incluido excluye el JSON dinámico.
4. Para HTML/JS estático, coloca `index.html` en la raíz; en Settings → Pages selecciona Deploy from a branch → main → / (root). Para un proyecto con compilación como Vite, usa el flujo de Actions y el `base` correspondiente al nombre del repositorio.
5. Abre la URL HTTPS publicada en Chrome o Edge de escritorio y conecta Arduino por USB al mismo computador.
6. Cierra el Monitor serie de Arduino IDE, `bridge.py` y cualquier programa que esté usando el puerto.
7. Pulsa «Conectar Arduino», selecciona y autoriza el puerto, y espera el calentamiento del MH-Z1911A.
8. La página no puede controlar a distancia un Arduino conectado a otro computador. La autorización USB es local a ese navegador/origen.
9. Si cierras la página, Arduino conserva el último umbral guardado en EEPROM y continúa el control automático mientras permanezca alimentado.

No publiques `data/latest.json`, credenciales ni registros privados. GitHub Pages aloja únicamente el sitio estático; no ejecuta el puente Python ni modifica el repositorio en tiempo real.

## Fuentes y validación

Las verificaciones reproducibles están en `tests/test_control_contract.py` y `tests/web-adapter.html`; el detalle y las limitaciones del entorno se registran en `VALIDACION.md`.

- Manual del sensor: https://www.winsen-sensor.com/d/files/manual/mh-z1911a.pdf
- Web Serial: https://developer.chrome.com/docs/capabilities/serial
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- pySerial: https://pyserial.readthedocs.io/en/latest/shortintro.html

El código se entrega como base de integración. La comprobación de software no sustituye la prueba con tu Arduino, la verificación del protocolo específico ni la prueba eléctrica. Consulta `VALIDACION.md` para los controles realizados.
