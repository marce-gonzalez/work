import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKETCH = (ROOT / 'arduino/co2_control/co2_control.ino').read_text(encoding='utf-8')


def pump_for(ppm):
    return ppm is not None and ppm >= 1000


def valid_telemetry(value):
    measurements = ('temperature_air_c', 'humidity_rh', 'illuminance_lux',
                    'temperature_culture_c', 'ph_voltage_v', 'ph')
    return (value.get('schema_version') == 3 and value.get('type') == 'telemetry' and
            value.get('threshold_ppm') == 1000 and
            all(key in value and (value[key] is None or isinstance(value[key], (int, float)))
                for key in measurements) and
            value.get('pump_command') in ('on', 'off'))


class ControlTests(unittest.TestCase):
    def test_pump_boundary_and_failure(self):
        self.assertFalse(pump_for(None))
        self.assertFalse(pump_for(999))
        self.assertTrue(pump_for(1000))
        self.assertTrue(pump_for(1001))

    def test_complete_sensor_contract(self):
        sample = json.loads((ROOT / 'data/example.json').read_text(encoding='utf-8'))
        self.assertTrue(valid_telemetry(sample))

    def test_firmware_contract_is_present(self):
        for fragment in ('Adafruit_SHT31', 'BH1750', 'DallasTemperature', 'PIN_PH',
                         'UMBRAL_CO2_PPM = 1000', 'co2 >= UMBRAL_CO2_PPM',
                         '\\"temperature_air_c\\"', '\\"humidity_rh\\"', '\\"illuminance_lux\\"',
                         '\\"temperature_culture_c\\"', '\\"ph_voltage_v\\"', '\\"ph\\"',
                         'Serial.begin(115200)'):
            self.assertIn(fragment, SKETCH)


if __name__ == '__main__':
    unittest.main()
