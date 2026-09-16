"""USB -> latest.json local. Ejecutar separado del navegador Web Serial."""
import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
import serial


def valid(d):
    if not isinstance(d, dict):
        return False
    status = d.get('sensor_status')
    ppm = d.get('co2_ppm')
    on_ppm = d.get('threshold_on_ppm')
    off_ppm = d.get('threshold_off_ppm')
    return (d.get('schema_version') == 2 and
            d.get('type') == 'telemetry' and
            type(d.get('seq')) is int and d['seq'] >= 0 and
            type(d.get('uptime_ms')) is int and d['uptime_ms'] >= 0 and
            status in ('ok', 'warming_up', 'sensor_error') and
            d.get('pump_command') in ('on', 'off') and
            d.get('control_mode') == 'automatic' and
            d.get('control_enabled') is True and
            type(on_ppm) is int and type(off_ppm) is int and
            400 <= off_ppm < on_ppm <= 5000 and on_ppm - off_ppm >= 20 and
            ((type(ppm) is int and 400 <= ppm <= 5000) if status == 'ok' else ppm is None))


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')
    os.replace(temp, path)  # El lector nunca ve un JSON escrito a medias


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', required=True, help='COM3, /dev/ttyACM0, etc.')
    parser.add_argument('--output', default='data/latest.json')
    args = parser.parse_args()
    path = Path(args.output)
    unavailable = {'schema_version': 2, 'type': 'telemetry', 'connection': 'disconnected',
                   'co2_ppm': None, 'pump_command': None, 'received_at': None}
    save(path, unavailable)
    try:
        with serial.Serial(args.port, 115200, timeout=1) as port:
            last = time.monotonic()
            buffer = b''
            while True:
                buffer += port.read(port.in_waiting or 1)
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    try:
                        d = json.loads(line)
                        if not valid(d):
                            continue
                    except (ValueError, UnicodeDecodeError):
                        continue
                    last = time.monotonic()
                    d.update(connection='connected', received_at=datetime.now(timezone.utc).isoformat())
                    save(path, d)
                    print(d['received_at'], d['sensor_status'], d['co2_ppm'], flush=True)
                if len(buffer) > 4096:
                    buffer = b''
                if time.monotonic() - last > 10:
                    save(path, {**unavailable, 'connection': 'stale'})
    except KeyboardInterrupt:
        pass
    except serial.SerialException as exc:
        print(f'Puerto desconectado o no disponible: {exc}')
    finally:
        save(path, unavailable)


if __name__ == '__main__':
    main()
