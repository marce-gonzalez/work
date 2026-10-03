const NUMBER_FIELDS = ['temperature_air_c','humidity_rh','illuminance_lux','temperature_culture_c','ph_voltage_v','ph'];

export function parseMessage(line) {
  const d = JSON.parse(line);
  const validOptional = NUMBER_FIELDS.every((key) => d?.[key] === null || Number.isFinite(d?.[key]));
  if (!d || d.schema_version !== 3 || d.type !== 'telemetry' || !Number.isInteger(d.seq) || d.seq < 0 ||
      !Number.isInteger(d.uptime_ms) || d.uptime_ms < 0 || !validOptional ||
      !['ok','warming_up','sensor_error'].includes(d.co2_status) ||
      !['on','off'].includes(d.pump_command) || d.control_mode !== 'automatic' || d.control_enabled !== true ||
      d.threshold_ppm !== 1000 ||
      (d.co2_status === 'ok' ? !(Number.isInteger(d.co2_ppm) && d.co2_ppm >= 0 && d.co2_ppm <= 5000) : d.co2_ppm !== null)) {
    throw new Error('Telemetría inválida');
  }
  return d;
}

export const parseReading = parseMessage;

export class CO2Serial extends EventTarget {
  port = null;
  reader = null;
  task = null;
  latest = null;
  lastAt = 0;
  timer = null;
  disconnecting = false;

  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, {detail})); }

  async connect() {
    if (this.port || this.task) throw new Error('Ya existe una conexión');
    if (!navigator.serial) throw new Error('Usa Chrome o Edge de escritorio con HTTPS o localhost');
    const port = await navigator.serial.requestPort();
    await port.open({baudRate:115200});
    this.disconnecting = false; this.port = port; this.latest = null; this.lastAt = Date.now();
    this.emit('status', 'connected');
    this.timer = setInterval(() => {
      if (this.lastAt && Date.now()-this.lastAt > 10000 && this.latest !== null) {
        this.latest = null; this.emit('status', 'stale');
      }
    }, 1000);
    this.task = this.readLoop(port);
  }

  async readLoop(port) {
    let buffer = ''; const decoder = new TextDecoder();
    try {
      this.reader = port.readable.getReader();
      while (true) {
        const {value, done} = await this.reader.read(); if (done) break;
        buffer += decoder.decode(value, {stream:true}); let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0,end).trim(); buffer = buffer.slice(end+1); if (!line) continue;
          try {
            const message = parseMessage(line); this.lastAt = Date.now();
            this.latest = {...message, received_at:new Date().toISOString(), connection:'connected'};
            this.emit('data', this.latest);
          } catch (error) { this.emit('warning', `Línea descartada: ${error.message}`); }
        }
        if (buffer.length > 4096) { buffer=''; this.emit('warning','Trama demasiado larga'); }
      }
    } catch (error) {
      if (error?.name !== 'NetworkError' && error?.name !== 'AbortError') this.emit('warning', error.message);
    } finally {
      this.reader?.releaseLock(); this.reader=null; clearInterval(this.timer); this.timer=null;
      try { await port.close(); } catch { /* Puerto retirado. */ }
      this.port=null; this.latest=null; this.task=null; this.emit('status','disconnected');
    }
  }

  async disconnect() {
    if (!this.port && !this.task) return;
    this.disconnecting = true;
    if (this.reader) try { await this.reader.cancel(); } catch { /* Puerto ya cerrado. */ }
    if (this.task) await this.task;
  }
}
