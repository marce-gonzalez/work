#include <EEPROM.h>
#include <SoftwareSerial.h>

// Arduino UNO R3. Protocolo de lectura compatible MH-Z19: verificar en MH-Z1911A.
SoftwareSerial sensor(10, 11); // RX Arduino <- TX sensor; TX Arduino -> RX sensor
const byte PUMP_PIN = 5;
const bool ENABLE_PUMP_CONTROL = true;
const unsigned long WARMUP_MS = 60000, PERIOD_MS = 2000, DWELL_MS = 30000;
const int ON_PPM = 700, OFF_PPM = 650;
const int MIN_PPM = 400, MAX_PPM = 5000, MIN_GAP_PPM = 20;

const uint16_t EEPROM_MAGIC = 0xC027;
const byte EEPROM_VERSION = 1;
struct __attribute__((packed)) StoredThresholds {
  uint16_t magic;
  byte version;
  uint16_t onPpm;
  uint16_t offPpm;
  byte checksum;
};

const byte COMMAND_BUFFER_SIZE = 112;
char commandBuffer[COMMAND_BUFFER_SIZE];
byte commandLength = 0;
bool commandOverflow = false;
int thresholdOnPpm = ON_PPM, thresholdOffPpm = OFF_PPM;
bool pump = false;
unsigned long lastRead = 0, lastChange = 0, sequence = 0;

bool thresholdsValid(int onPpm, int offPpm) {
  return onPpm >= MIN_PPM && onPpm <= MAX_PPM &&
         offPpm >= MIN_PPM && offPpm <= MAX_PPM &&
         offPpm < onPpm && onPpm - offPpm >= MIN_GAP_PPM;
}

byte settingsChecksum(const StoredThresholds &value) {
  return (byte)(value.magic ^ (value.magic >> 8) ^ value.version ^
                value.onPpm ^ (value.onPpm >> 8) ^ value.offPpm ^ (value.offPpm >> 8) ^ 0xA5);
}

void loadThresholds() {
  StoredThresholds stored;
  EEPROM.get(0, stored);
  if (stored.magic == EEPROM_MAGIC && stored.version == EEPROM_VERSION &&
      stored.checksum == settingsChecksum(stored) && thresholdsValid(stored.onPpm, stored.offPpm)) {
    thresholdOnPpm = stored.onPpm;
    thresholdOffPpm = stored.offPpm;
  }
}

void saveThresholdsIfChanged() {
  StoredThresholds next = {EEPROM_MAGIC, EEPROM_VERSION, (uint16_t)thresholdOnPpm, (uint16_t)thresholdOffPpm, 0};
  next.checksum = settingsChecksum(next);
  StoredThresholds current;
  EEPROM.get(0, current);
  if (memcmp(&current, &next, sizeof(next)) != 0) {
    EEPROM.put(0, next); // put usa update internamente: no reescribe bytes iguales.
  }
}

void setPump(bool value) {
  if (pump != value) {
    pump = value;
    lastChange = millis();
  }
  digitalWrite(PUMP_PIN, pump ? HIGH : LOW); // ON/OFF; no PWM.
}

void readCommands();

int readCO2() {
  const byte request[9] = {0xFF, 0x01, 0x86, 0, 0, 0, 0, 0, 0x79};
  while (sensor.available()) sensor.read();
  sensor.write(request, 9);
  byte response[9], count = 0;
  unsigned long start = millis();
  while (millis() - start < 300) {
    readCommands(); // Evita desbordar el pequeño búfer USB del UNO durante la espera del sensor.
    if (!sensor.available()) continue;
    byte b = sensor.read();
    if (count == 0 && b != 0xFF) continue;
    if (count == 1 && b != 0x86) {
      count = (b == 0xFF) ? 1 : 0;
      continue;
    }
    response[count++] = b;
    if (count == 9) {
      byte sum = 0;
      for (byte i = 1; i < 9; i++) sum += response[i];
      if (sum != 0) return -1;
      int ppm = ((unsigned int)response[2] << 8) | response[3];
      return (ppm >= MIN_PPM && ppm <= MAX_PPM) ? ppm : -1;
    }
  }
  return -1;
}

const char *skipSpaces(const char *p) {
  while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') ++p;
  return p;
}

bool consumeChar(const char *&p, char expected) {
  p = skipSpaces(p);
  if (*p != expected) return false;
  ++p;
  return true;
}

bool readJsonString(const char *&p, char *output, byte capacity) {
  p = skipSpaces(p);
  if (*p++ != '"') return false;
  byte length = 0;
  while (*p && *p != '"') {
    // Este protocolo no necesita escapes ni caracteres de control.
    if (*p == '\\' || (byte)*p < 0x20 || length >= capacity - 1) return false;
    output[length++] = *p++;
  }
  if (*p != '"') return false;
  ++p;
  output[length] = '\0';
  return true;
}

bool readJsonInt(const char *&p, int &value) {
  p = skipSpaces(p);
  if (*p < '0' || *p > '9') return false;
  long result = 0;
  while (*p >= '0' && *p <= '9') {
    result = result * 10 + (*p - '0');
    if (result > 32767) return false;
    ++p;
  }
  value = (int)result;
  return true;
}

bool readJsonBool(const char *&p, bool &value) {
  p = skipSpaces(p);
  if (strncmp(p, "true", 4) == 0) {
    p += 4;
    value = true;
    return true;
  }
  if (strncmp(p, "false", 5) == 0) {
    p += 5;
    value = false;
    return true;
  }
  return false;
}

void sendAck(bool accepted, const char *error, bool saved) {
  Serial.print(F("{\"schema_version\":2,\"type\":\"ack\",\"command\":\"set_thresholds\",\"accepted\":"));
  Serial.print(accepted ? F("true") : F("false"));
  if (accepted) {
    Serial.print(F(",\"threshold_on_ppm\":")); Serial.print(thresholdOnPpm);
    Serial.print(F(",\"threshold_off_ppm\":")); Serial.print(thresholdOffPpm);
    Serial.print(F(",\"saved\":")); Serial.print(saved ? F("true") : F("false"));
  } else {
    Serial.print(F(",\"error\":\"")); Serial.print(error); Serial.print('"');
  }
  Serial.println('}');
}

void processCommand(char *json) {
  const char *p = json;
  char key[18], command[20] = "";
  int onPpm = 0, offPpm = 0;
  bool save = false;
  byte fields = 0;
  if (!consumeChar(p, '{')) {
    sendAck(false, "invalid_json", false);
    return;
  }
  while (true) {
    p = skipSpaces(p);
    if (*p == '}') { ++p; break; }
    if (!readJsonString(p, key, sizeof(key)) || !consumeChar(p, ':')) {
      sendAck(false, "invalid_json", false); return;
    }
    if (strcmp(key, "command") == 0 && !(fields & 1)) {
      if (!readJsonString(p, command, sizeof(command))) { sendAck(false, "invalid_json", false); return; }
      fields |= 1;
    } else if (strcmp(key, "on_ppm") == 0 && !(fields & 2)) {
      if (!readJsonInt(p, onPpm)) { sendAck(false, "invalid_json", false); return; }
      fields |= 2;
    } else if (strcmp(key, "off_ppm") == 0 && !(fields & 4)) {
      if (!readJsonInt(p, offPpm)) { sendAck(false, "invalid_json", false); return; }
      fields |= 4;
    } else if (strcmp(key, "save") == 0 && !(fields & 8)) {
      if (!readJsonBool(p, save)) { sendAck(false, "invalid_json", false); return; }
      fields |= 8;
    } else {
      sendAck(false, "invalid_json", false); return;
    }
    p = skipSpaces(p);
    if (*p == ',') {
      ++p;
      if (*skipSpaces(p) == '}') { sendAck(false, "invalid_json", false); return; }
      continue;
    }
    if (*p == '}') { ++p; break; }
    sendAck(false, "invalid_json", false); return;
  }
  if (*skipSpaces(p) != '\0' || fields != 15) {
    sendAck(false, "invalid_json", false); return;
  }
  if (strcmp(command, "set_thresholds") != 0) {
    sendAck(false, "unsupported_command", false); return;
  }
  if (onPpm < MIN_PPM || onPpm > MAX_PPM || offPpm < MIN_PPM || offPpm > MAX_PPM) {
    sendAck(false, "threshold_out_of_range", false);
    return;
  }
  if (offPpm >= onPpm) {
    sendAck(false, "threshold_off_must_be_lower", false);
    return;
  }
  if (onPpm - offPpm < MIN_GAP_PPM) {
    sendAck(false, "threshold_gap_too_small", false);
    return;
  }
  thresholdOnPpm = onPpm;
  thresholdOffPpm = offPpm;
  if (save) saveThresholdsIfChanged();
  sendAck(true, NULL, save);
}

void readCommands() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      if (commandOverflow) sendAck(false, "command_too_long", false);
      else if (commandLength > 0) {
        commandBuffer[commandLength] = '\0';
        processCommand(commandBuffer);
      }
      commandLength = 0;
      commandOverflow = false;
    } else if (c != '\r' && !commandOverflow) {
      if (commandLength < COMMAND_BUFFER_SIZE - 1) commandBuffer[commandLength++] = c;
      else commandOverflow = true;
    }
  }
}

void sendTelemetry(int ppm, const char *status) {
  Serial.print(F("{\"schema_version\":2,\"type\":\"telemetry\",\"seq\":")); Serial.print(sequence++);
  Serial.print(F(",\"uptime_ms\":")); Serial.print(millis());
  Serial.print(F(",\"co2_ppm\":"));
  if (ppm < 0) Serial.print(F("null")); else Serial.print(ppm);
  Serial.print(F(",\"sensor_status\":\"")); Serial.print(status);
  Serial.print(F("\",\"pump_command\":\"")); Serial.print(pump ? F("on") : F("off"));
  Serial.print(F("\",\"control_mode\":\"automatic\",\"control_enabled\":"));
  Serial.print(ENABLE_PUMP_CONTROL ? F("true") : F("false"));
  Serial.print(F(",\"threshold_on_ppm\":")); Serial.print(thresholdOnPpm);
  Serial.print(F(",\"threshold_off_ppm\":")); Serial.print(thresholdOffPpm);
  Serial.println('}');
}

void setup() {
  digitalWrite(PUMP_PIN, LOW);
  pinMode(PUMP_PIN, OUTPUT);
  loadThresholds();
  Serial.begin(115200);
  sensor.begin(9600);
}

void loop() {
  readCommands();
  unsigned long now = millis();
  if (now - lastRead < PERIOD_MS) return;
  lastRead = now;
  int ppm = -1;
  const char *status = "warming_up";
  if (now >= WARMUP_MS) {
    ppm = readCO2();
    status = ppm < 0 ? "sensor_error" : "ok";
  }
  if (!ENABLE_PUMP_CONTROL || ppm < 0) {
    setPump(false); // Calentamiento y cualquier error apagan inmediatamente.
  } else if (millis() - lastChange >= DWELL_MS) {
    if (!pump && ppm >= thresholdOnPpm) setPump(true);
    else if (pump && ppm <= thresholdOffPpm) setPump(false);
  }
  sendTelemetry(ppm, status);
  readCommands();
}
