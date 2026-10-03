#include <Wire.h>
#include <Adafruit_SHT31.h>
#include <BH1750.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <SoftwareSerial.h>

// BIOCAP: telemetria NDJSON para la plataforma web.
const byte PIN_DS18B20 = 2, PIN_BOMBA = 5, PIN_CO2_RX = 10, PIN_CO2_TX = 11, PIN_PH = A0;
const unsigned long PERIODO_MS = 2000, CALENTAMIENTO_CO2_MS = 60000;
const int UMBRAL_CO2_PPM = 1000;
const float VOLTAJE_ADC = 5.0, CUENTAS_ADC = 1023.0;
float VOLTAJE_PH7 = 2.50, VOLTAJE_PH4 = 3.04;

Adafruit_SHT31 sht31 = Adafruit_SHT31();
BH1750 sensorLuz;
OneWire busOneWire(PIN_DS18B20);
DallasTemperature sensorCultivo(&busOneWire);
SoftwareSerial puertoCO2(PIN_CO2_RX, PIN_CO2_TX);
bool sht31Disponible = false, bh1750Disponible = false, bombaEncendida = false;
unsigned long ultimaLectura = 0, secuencia = 0;

void imprimirFloatJson(float valor, byte decimales) {
  if (isnan(valor) || isinf(valor)) Serial.print(F("null")); else Serial.print(valor, decimales);
}
void controlarBomba(bool encender) {
  bombaEncendida = encender;
  digitalWrite(PIN_BOMBA, encender ? HIGH : LOW);
}
float leerVoltajePH() {
  const byte MUESTRAS = 20; unsigned long suma = 0;
  for (byte i = 0; i < MUESTRAS; i++) { suma += analogRead(PIN_PH); delay(10); }
  return (suma / float(MUESTRAS)) * VOLTAJE_ADC / CUENTAS_ADC;
}
float convertirVoltajeAPh(float voltaje) {
  float diferencia = VOLTAJE_PH4 - VOLTAJE_PH7;
  if (abs(diferencia) < 0.01) return NAN;
  return 7.0 + (voltaje - VOLTAJE_PH7) * (4.0 - 7.0) / diferencia;
}
byte checksumMHZ19(const byte paquete[9]) {
  byte suma = 0; for (byte i = 1; i < 8; i++) suma += paquete[i]; return 0xFF - suma + 1;
}
int leerMHZ19() {
  const byte comando[9] = {0xFF, 0x01, 0x86, 0, 0, 0, 0, 0, 0x79}; byte respuesta[9];
  while (puertoCO2.available()) puertoCO2.read();
  puertoCO2.listen(); puertoCO2.write(comando, 9); puertoCO2.flush();
  unsigned long inicio = millis(); byte recibidos = 0;
  while (recibidos < 9 && millis() - inicio < 1000) if (puertoCO2.available()) respuesta[recibidos++] = puertoCO2.read();
  if (recibidos != 9 || respuesta[0] != 0xFF || respuesta[1] != 0x86 || respuesta[8] != checksumMHZ19(respuesta)) return -1;
  int ppm = int(respuesta[2]) * 256 + respuesta[3]; return (ppm >= 0 && ppm <= 5000) ? ppm : -1;
}
void enviarTelemetria(float tempAmbiente, float humedad, float lux, float tempCultivo, float voltajePH, float ph, int co2, const __FlashStringHelper *estadoCO2) {
  Serial.print(F("{\"schema_version\":3,\"type\":\"telemetry\",\"seq\":")); Serial.print(secuencia++);
  Serial.print(F(",\"uptime_ms\":")); Serial.print(millis());
  Serial.print(F(",\"temperature_air_c\":")); imprimirFloatJson(tempAmbiente, 2);
  Serial.print(F(",\"humidity_rh\":")); imprimirFloatJson(humedad, 2);
  Serial.print(F(",\"illuminance_lux\":")); imprimirFloatJson(lux, 1);
  Serial.print(F(",\"temperature_culture_c\":")); imprimirFloatJson(tempCultivo, 2);
  Serial.print(F(",\"ph_voltage_v\":")); imprimirFloatJson(voltajePH, 3);
  Serial.print(F(",\"ph\":")); imprimirFloatJson(ph, 2);
  Serial.print(F(",\"co2_ppm\":")); if (co2 < 0) Serial.print(F("null")); else Serial.print(co2);
  Serial.print(F(",\"co2_status\":\"")); Serial.print(estadoCO2);
  Serial.print(F("\",\"pump_command\":\"")); Serial.print(bombaEncendida ? F("on") : F("off"));
  Serial.print(F("\",\"control_mode\":\"automatic\",\"control_enabled\":true,\"threshold_ppm\":")); Serial.print(UMBRAL_CO2_PPM);
  Serial.println('}');
}
void leerSensores() {
  float tempAmbiente = NAN, humedad = NAN, lux = NAN, tempCultivo = NAN;
  if (sht31Disponible) { tempAmbiente = sht31.readTemperature(); humedad = sht31.readHumidity(); }
  if (bh1750Disponible) lux = sensorLuz.readLightLevel();
  sensorCultivo.requestTemperatures(); tempCultivo = sensorCultivo.getTempCByIndex(0);
  if (tempCultivo == DEVICE_DISCONNECTED_C) tempCultivo = NAN;
  float voltajePH = leerVoltajePH(), ph = convertirVoltajeAPh(voltajePH);
  int co2 = -1; const __FlashStringHelper *estadoCO2 = F("warming_up");
  if (millis() >= CALENTAMIENTO_CO2_MS) { co2 = leerMHZ19(); estadoCO2 = co2 < 0 ? F("sensor_error") : F("ok"); }
  controlarBomba(co2 >= UMBRAL_CO2_PPM); // Error o calentamiento: bomba apagada.
  enviarTelemetria(tempAmbiente, humedad, lux, tempCultivo, voltajePH, ph, co2, estadoCO2);
}
void setup() {
  digitalWrite(PIN_BOMBA, LOW); pinMode(PIN_BOMBA, OUTPUT);
  Serial.begin(115200); puertoCO2.begin(9600); Wire.begin(); sensorCultivo.begin();
  sht31Disponible = sht31.begin(0x44);
  bh1750Disponible = sensorLuz.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23);
}
void loop() {
  unsigned long ahora = millis(); if (ahora - ultimaLectura < PERIODO_MS) return;
  ultimaLectura = ahora; leerSensores();
}
