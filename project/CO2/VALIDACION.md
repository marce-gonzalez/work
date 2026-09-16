# Validación de software

## Ejecutado en este entorno

- `python -m unittest discover -s tests -p 'test_*.py' -v`: 4 pruebas correctas.
- Fronteras modeladas: 649, 650 y 699 ppm no encienden una bomba apagada; 700 y 701 ppm sí la encienden cuando se cumple el tiempo mínimo.
- Histéresis modelada: una bomba encendida permanece así entre 650 y 700 ppm y se apaga a 650 ppm o menos.
- Intervalo modelado: un cambio normal antes de 30 segundos se pospone; al cumplir 30 segundos se permite.
- Calentamiento, lectura `null` y error del sensor: la orden pasa inmediatamente a apagado.
- Comandos: se comprobaron uno válido, JSON incompleto, umbrales iguales, separación menor a 20 ppm y valor fuera de rango.
- `python -m py_compile bridge.py tests/test_control_contract.py`: correcto.
- Prueba real del módulo JavaScript en Chrome, usando puertos Web Streams simulados: 7 comprobaciones correctas. Incluye telemetría v2, validación, rechazo de v1, `ack` aceptado, `ack` rechazado, timeout y desconexión mientras se esperaba un `ack`.
- Carga del sitio y rutas relativas comprobadas en Chrome.
- `git diff --check`: correcto.

## No disponible o pendiente

- `arduino-cli` no está instalado en este entorno; el sketch no se compiló aquí para Arduino UNO.
- Node.js no está instalado; la sintaxis de módulos se comprobó cargándolos y ejecutando las pruebas en Chrome.
- No se conectó hardware. Falta compilar/cargar el sketch, confirmar el protocolo específico del MH-Z1911A y comprobar sensor, D5, MOSFET, fuente y bomba con el montaje real.
- La orden `pump_command` describe la salida eléctrica solicitada; no confirma giro ni caudal.

Antes de energizar la bomba, completar la prueba eléctrica supervisada indicada en README.
