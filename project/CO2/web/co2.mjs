// Adaptador independiente del diseño de la interfaz. Chrome/Edge de escritorio.
const ACK_TIMEOUT_MS = 5000;

export function parseMessage(line) {
  const d = JSON.parse(line);
  if (!d || d.schema_version !== 2) throw new Error('Versión de mensaje incompatible');
  if (d.type === 'telemetry') {
    if (!Number.isInteger(d.seq) || d.seq < 0 ||
        !Number.isInteger(d.uptime_ms) || d.uptime_ms < 0 ||
        !['ok', 'warming_up', 'sensor_error'].includes(d.sensor_status) ||
        !['on', 'off'].includes(d.pump_command) ||
        d.control_mode !== 'automatic' || d.control_enabled !== true ||
        !validThresholds(d.threshold_on_ppm, d.threshold_off_ppm) ||
        (d.sensor_status === 'ok'
          ? (!Number.isInteger(d.co2_ppm) || d.co2_ppm < 400 || d.co2_ppm > 5000)
          : d.co2_ppm !== null)) {
      throw new Error('Telemetría inválida');
    }
    return d;
  }
  if (d.type === 'ack') {
    if (d.command !== 'set_thresholds' || typeof d.accepted !== 'boolean') {
      throw new Error('Confirmación inválida');
    }
    if (d.accepted) {
      if (!validThresholds(d.threshold_on_ppm, d.threshold_off_ppm) || typeof d.saved !== 'boolean') {
        throw new Error('Confirmación aceptada inválida');
      }
    } else if (typeof d.error !== 'string' || !d.error) {
      throw new Error('Confirmación rechazada inválida');
    }
    return d;
  }
  throw new Error('Tipo de mensaje desconocido');
}

// Se conserva el nombre para consumidores anteriores; ahora solo acepta telemetría v2.
export function parseReading(line) {
  const message = parseMessage(line);
  if (message.type !== 'telemetry') throw new Error('El mensaje no es telemetría');
  return message;
}

export function validThresholds(onPpm, offPpm) {
  return Number.isInteger(onPpm) && Number.isInteger(offPpm) &&
    onPpm >= 400 && onPpm <= 5000 && offPpm >= 400 && offPpm <= 5000 &&
    offPpm < onPpm && onPpm - offPpm >= 20;
}

export class CO2Serial extends EventTarget {
  port = null;
  reader = null;
  writer = null;
  task = null;
  latest = null;
  lastAt = 0;
  timer = null;
  pendingAck = null;
  writeQueue = Promise.resolve();
  disconnecting = false;

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, {detail}));
  }

  async connect() {
    if (this.port || this.task) throw new Error('Ya existe una conexión');
    if (!navigator.serial) throw new Error('Usa Chrome o Edge de escritorio con HTTPS o localhost');
    const port = await navigator.serial.requestPort(); // Debe proceder de un clic.
    await port.open({baudRate: 115200});
    this.disconnecting = false;
    this.port = port;
    this.latest = null;
    this.lastAt = Date.now();
    this.emit('status', 'connected');
    this.timer = setInterval(() => {
      if (this.lastAt && Date.now() - this.lastAt > 10000 && this.latest !== null) {
        this.latest = null;
        this.emit('status', 'stale');
      }
    }, 1000);
    this.task = this.readLoop(port);
  }

  async readLoop(port) {
    let buffer = '';
    const decoder = new TextDecoder();
    try {
      this.reader = port.readable.getReader();
      while (true) {
        const {value, done} = await this.reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream:true});
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end).trim();
          buffer = buffer.slice(end + 1);
          if (!line) continue;
          try {
            const message = parseMessage(line);
            if (message.type === 'telemetry') {
              this.lastAt = Date.now();
              this.latest = {...message, received_at:new Date().toISOString(), connection:'connected'};
              this.emit('data', this.latest);
            } else {
              this.emit('ack', message);
              this.resolveAck(message);
            }
          } catch (error) {
            this.emit('warning', `Línea descartada: ${error.message}`);
          }
        }
        if (buffer.length > 4096) {
          buffer = '';
          this.emit('warning', 'Trama demasiado larga');
        }
      }
    } catch (error) {
      if (error?.name !== 'NetworkError' && error?.name !== 'AbortError') this.emit('warning', error.message);
    } finally {
      this.reader?.releaseLock();
      this.reader = null;
      clearInterval(this.timer);
      this.timer = null;
      this.rejectAck(new Error('Arduino desconectado antes de confirmar la configuración'));
      try { await port.close(); } catch { /* Dispositivo retirado o ya cerrado. */ }
      this.port = null;
      this.latest = null;
      this.task = null;
      this.emit('status', 'disconnected');
    }
  }

  resolveAck(message) {
    if (!this.pendingAck) return;
    const {resolve, reject, timer} = this.pendingAck;
    clearTimeout(timer);
    this.pendingAck = null;
    if (message.accepted) resolve(message);
    else {
      const error = new Error(message.error);
      error.code = message.error;
      error.ack = message;
      reject(error);
    }
  }

  rejectAck(error) {
    if (!this.pendingAck) return;
    clearTimeout(this.pendingAck.timer);
    this.pendingAck.reject(error);
    this.pendingAck = null;
  }

  async writeCommand(command) {
    if (!this.port?.writable) throw new Error('Arduino no conectado');
    const bytes = new TextEncoder().encode(`${JSON.stringify(command)}\n`);
    this.writer = this.port.writable.getWriter();
    try {
      await this.writer.write(bytes);
    } finally {
      this.writer.releaseLock();
      this.writer = null;
    }
  }

  setThresholds(onPpm, offPpm, save = true) {
    if (!validThresholds(onPpm, offPpm)) {
      return Promise.reject(new Error('Umbrales inválidos'));
    }
    const operation = async () => {
      if (!this.port || !this.task || this.disconnecting) throw new Error('Arduino no conectado');
      const ackPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.pendingAck?.timer === timer) this.pendingAck = null;
          reject(new Error('Tiempo de espera agotado sin confirmación del Arduino'));
        }, ACK_TIMEOUT_MS);
        this.pendingAck = {resolve, reject, timer};
      });
      try {
        await this.writeCommand({command:'set_thresholds', on_ppm:onPpm, off_ppm:offPpm, save:Boolean(save)});
      } catch (error) {
        this.rejectAck(error);
        return ackPromise;
      }
      return ackPromise;
    };
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.catch(() => {});
    return result;
  }

  async disconnect() {
    if (!this.port && !this.task) return;
    this.disconnecting = true;
    this.rejectAck(new Error('Conexión cerrada antes de recibir confirmación'));
    if (this.writer) {
      try { await this.writer.abort(); } catch { /* La escritura ya terminó. */ }
    }
    if (this.reader) {
      try { await this.reader.cancel(); } catch { /* El puerto ya se perdió. */ }
    }
    if (this.task) await this.task;
  }
}
