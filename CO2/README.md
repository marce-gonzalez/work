# BIOCAP — plataforma de medición multisensor

Interfaz local para Arduino UNO que registra en una misma sesión:

- temperatura y humedad ambiente (SHT31);
- iluminancia (BH1750);
- temperatura del cultivo (DS18B20);
- voltaje y pH estimado del módulo analógico;
- concentración de CO₂ (MH-Z19/MH-Z1911A);
- orden eléctrica de la bomba.

La bomba se controla en el Arduino, independientemente de la página: se enciende con una lectura válida de CO₂ igual o superior a **1000 ppm** y se apaga bajo el umbral, durante el calentamiento o si el sensor de CO₂ falla.

## Preparación del Arduino

Abre `arduino/co2_control/co2_control.ino` en Arduino IDE e instala estas bibliotecas:

- Adafruit SHT31 Library
- BH1750
- OneWire
- DallasTemperature

Selecciona Arduino UNO, carga el sketch y cierra el Monitor serie antes de conectar la plataforma. La comunicación USB usa **115200 baudios**; el MH-Z19 usa 9600 baudios por SoftwareSerial.

Pines: DS18B20 D2, bomba D5, MH-Z19 RX/TX D10/D11 y pH A0. SHT31 y BH1750 comparten I²C. Revisa alimentación, masas, polaridad y capacidad de la fuente antes de energizar la bomba.

Los valores `VOLTAJE_PH7` y `VOLTAJE_PH4` del sketch son provisionales: deben sustituirse por los valores obtenidos con soluciones de calibración.

## Ejecutar la plataforma

Desde esta carpeta:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Abre `http://127.0.0.1:8000` en Chrome o Edge de escritorio y elige una fuente:

- **USB directo:** Web Serial conecta el Arduino local.
- **Archivo local:** ejecuta `python bridge.py --port COM3` y cambia `COM3` por el puerto real.
- **Demostración:** genera datos simulados claramente rotulados; nunca se activa por un fallo real.

No uses USB directo, `bridge.py` y el Monitor serie simultáneamente: solo un proceso puede abrir el puerto.

## Registro y gráfico

Cada trama válida se guarda en el historial de la sesión. El gráfico único dibuja siete series independientes, cada una con su propia escala para que las distintas unidades sean visibles juntas. Los cortes de conexión no se unen. «Exportar historial JSON» descarga todas las muestras recibidas durante la sesión.

El protocolo es NDJSON con `schema_version: 3`. Los campos principales son `temperature_air_c`, `humidity_rh`, `illuminance_lux`, `temperature_culture_c`, `ph_voltage_v`, `ph`, `co2_ppm`, `co2_status`, `pump_command` y `threshold_ppm`.

## Validación

```sh
python -m unittest discover -s tests -p "test_*.py" -v
python -m py_compile bridge.py tests/test_control_contract.py
```

La comprobación de software no sustituye la prueba del protocolo exacto del sensor MH-Z1911A, la calibración del pH ni la validación eléctrica del montaje y de la bomba.
