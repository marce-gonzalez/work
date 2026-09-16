import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKETCH = (ROOT / "arduino/co2_control/co2_control.ino").read_text(encoding="utf-8")


class ControllerModel:
    def __init__(self):
        self.pump = False
        self.last_change = 0

    def update(self, ppm, now_ms, sensor_ok=True, on_ppm=700, off_ppm=650):
        if not sensor_ok or ppm is None:
            if self.pump:
                self.last_change = now_ms
            self.pump = False
        elif now_ms - self.last_change >= 30_000:
            if not self.pump and ppm >= on_ppm:
                self.pump = True
                self.last_change = now_ms
            elif self.pump and ppm <= off_ppm:
                self.pump = False
                self.last_change = now_ms
        return self.pump


def validate_command(line):
    try:
        value = json.loads(line)
    except json.JSONDecodeError:
        return "invalid_json"
    if set(value) != {"command", "on_ppm", "off_ppm", "save"}:
        return "invalid_json"
    if value["command"] != "set_thresholds":
        return "unsupported_command"
    on_ppm, off_ppm = value["on_ppm"], value["off_ppm"]
    if type(on_ppm) is not int or type(off_ppm) is not int or type(value["save"]) is not bool:
        return "invalid_json"
    if not 400 <= on_ppm <= 5000 or not 400 <= off_ppm <= 5000:
        return "threshold_out_of_range"
    if off_ppm >= on_ppm:
        return "threshold_off_must_be_lower"
    if on_ppm - off_ppm < 20:
        return "threshold_gap_too_small"
    return "accepted"


class ControlTests(unittest.TestCase):
    def test_boundaries_and_hysteresis(self):
        for ppm in (649, 650, 699):
            self.assertFalse(ControllerModel().update(ppm, 60_000))
        for ppm in (700, 701):
            self.assertTrue(ControllerModel().update(ppm, 60_000))
        control = ControllerModel()
        self.assertTrue(control.update(700, 60_000))
        self.assertTrue(control.update(699, 91_000))
        self.assertTrue(control.update(651, 93_000))
        self.assertFalse(control.update(650, 95_000))

    def test_minimum_dwell_and_sensor_failure(self):
        control = ControllerModel()
        self.assertTrue(control.update(700, 60_000))
        self.assertTrue(control.update(650, 89_999))
        self.assertFalse(control.update(650, 90_000))
        control.update(700, 121_000)
        self.assertFalse(control.update(None, 121_001, sensor_ok=False))
        self.assertFalse(ControllerModel().update(None, 70_000, sensor_ok=False))

    def test_commands(self):
        self.assertEqual(validate_command('{"command":"set_thresholds","on_ppm":700,"off_ppm":650,"save":true}'), "accepted")
        self.assertEqual(validate_command('{"command":"set_thresholds"'), "invalid_json")
        self.assertEqual(validate_command('{"command":"set_thresholds","on_ppm":700,"off_ppm":700,"save":true}'), "threshold_off_must_be_lower")
        self.assertEqual(validate_command('{"command":"set_thresholds","on_ppm":700,"off_ppm":690,"save":true}'), "threshold_gap_too_small")
        self.assertEqual(validate_command('{"command":"set_thresholds","on_ppm":5001,"off_ppm":650,"save":true}'), "threshold_out_of_range")

    def test_firmware_contract_is_present(self):
        for fragment in (
            "ENABLE_PUMP_CONTROL = true", "ON_PPM = 700", "OFF_PPM = 650",
            "DWELL_MS = 30000", "EEPROM.put", "COMMAND_BUFFER_SIZE", '"sensor_error"',
            "ppm >= thresholdOnPpm", "ppm <= thresholdOffPpm", "Serial.begin(115200)"
        ):
            self.assertIn(fragment, SKETCH)


if __name__ == "__main__":
    unittest.main()
