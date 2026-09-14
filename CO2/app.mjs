import { CO2Serial } from './web/co2.mjs';

const TEN_MINUTES = 10 * 60 * 1000;
const STALE_AFTER = 10_000;
const device = new CO2Serial();
const $ = (selector) => document.querySelector(selector);
const els = {
  state: $('#estado'), dot: $('#status-dot'), feedback: $('#feedback'), connect: $('#conectar'),
  disconnect: $('#desconectar'), export: $('#exportar'), help: $('#mode-help'), badge: $('#simulated-badge'),
  value: $('#co2-value'), dataState: $('#data-state'), received: $('#received-time'), sensor: $('#sensor-status'),
  pump: $('#pump-command'), control: $('#control-status'), count: $('#history-count'), empty: $('#chart-empty'),
  chart: $('#chart'), organism: $('#organism'), photoCoefficient: $('#photo-coefficient'),
  thresholdForm: $('#threshold-form'), thresholdOn: $('#threshold-on'), thresholdOff: $('#threshold-off'),
  saveThresholds: $('#save-thresholds'), configFeedback: $('#config-feedback')
};

let mode = 'serial';
let active = false;
let fileTimer = null;
let demoTimer = null;
let lastReceived = 0;
let segment = 0;
let history = [];
let latestValid = null;
let gapPending = false;
let thresholdsDirty = false;
let savingThresholds = false;
let demoPump = false;
let serialFresh = false;

const modeText = {
  serial: 'Conecta el Arduino UNO a este equipo. Chrome o Edge solicitarán permiso para usar el puerto.',
  file: 'Solo en localhost: consulta ./data/latest.json generado por bridge.py. No abras a la vez el puerto por USB directo.',
  demo: 'Genera una serie ficticia aislada para recorrer la interfaz sin hardware. Nunca se activa por un fallo real.'
};

function setFeedback(message, error = false) {
  els.feedback.textContent = message;
  els.feedback.classList.toggle('error', error);
}

function setConnection(label, kind = '') {
  els.state.textContent = label;
  els.dot.className = `status-dot ${kind}`.trim();
}

function clearLive(reason, sensorLabel = 'Sin datos') {
  latestValid = null;
  els.value.textContent = '—';
  els.dataState.textContent = 'SIN DATOS';
  els.dataState.classList.remove('valid');
  els.received.textContent = reason;
  els.sensor.textContent = sensorLabel;
  els.pump.textContent = 'Sin datos';
  els.control.textContent = 'Sin datos';
}

function setConfigFeedback(message, kind = '') {
  els.configFeedback.textContent = message;
  els.configFeedback.className = `config-feedback ${kind}`.trim();
}

function updateThresholdButton() {
  els.saveThresholds.disabled = savingThresholds || mode !== 'serial' || !active || !device.port || !serialFresh;
}

function statusLabel(status) {
  return {ok:'Operativo', warming_up:'Sensor calentando', sensor_error:'Error del sensor'}[status] || 'Sin datos';
}

function pumpLabel(command) {
  return command === 'on' ? 'Encendida (orden)' : command === 'off' ? 'Apagada (orden)' : 'Sin datos';
}

function validateReading(d, requireEnvelope = false) {
  if (!d || d.schema_version !== 2 || d.type !== 'telemetry' || !Number.isInteger(d.seq) || d.seq < 0 ||
      !Number.isInteger(d.uptime_ms) || d.uptime_ms < 0 ||
      !['ok','warming_up','sensor_error'].includes(d.sensor_status) ||
      !['on','off'].includes(d.pump_command) || d.control_mode !== 'automatic' || d.control_enabled !== true ||
      !Number.isInteger(d.threshold_on_ppm) || !Number.isInteger(d.threshold_off_ppm) ||
      d.threshold_on_ppm < 400 || d.threshold_on_ppm > 5000 || d.threshold_off_ppm < 400 ||
      d.threshold_off_ppm >= d.threshold_on_ppm || d.threshold_on_ppm-d.threshold_off_ppm < 20 ||
      (d.sensor_status === 'ok' ? !(Number.isInteger(d.co2_ppm) && d.co2_ppm >= 400 && d.co2_ppm <= 5000) : d.co2_ppm !== null)) return false;
  if (requireEnvelope && (d.connection !== 'connected' || !Number.isFinite(Date.parse(d.received_at)))) return false;
  return true;
}

function acceptReading(d, source) {
  const receivedAt = Date.parse(d.received_at) || Date.now();
  lastReceived = receivedAt;
  gapPending = false;
  els.sensor.textContent = statusLabel(d.sensor_status);
  els.pump.textContent = pumpLabel(d.pump_command);
  els.control.textContent = 'Automático';
  if (!thresholdsDirty && !savingThresholds) {
    els.thresholdOn.value = d.threshold_on_ppm;
    els.thresholdOff.value = d.threshold_off_ppm;
  }
  if (d.sensor_status !== 'ok' || d.co2_ppm === null) {
    clearLive(d.sensor_status === 'warming_up' ? 'El sensor está en calentamiento' : 'La lectura del sensor no es válida', statusLabel(d.sensor_status));
    els.pump.textContent = pumpLabel(d.pump_command);
    els.control.textContent = 'Automático';
    return;
  }
  latestValid = d.co2_ppm;
  els.value.textContent = String(d.co2_ppm);
  els.dataState.textContent = source === 'demo' ? 'SIMULADO · ACTIVO' : 'LECTURA VÁLIDA';
  els.dataState.classList.add('valid');
  els.received.textContent = `Recibido ${new Date(receivedAt).toLocaleTimeString('es-CL')}`;
  history.push({received_at:new Date(receivedAt).toISOString(), co2_ppm:d.co2_ppm, source, segment});
  trimHistory();
  drawChart();
}

function trimHistory() {
  const cutoff = Date.now() - TEN_MINUTES;
  history = history.filter((p) => Date.parse(p.received_at) >= cutoff);
  els.count.textContent = `${history.length} ${history.length === 1 ? 'medición' : 'mediciones'}`;
}

function markGap() {
  if (gapPending) return;
  gapPending = true;
  segment += 1;
  drawChart();
}

async function stopCurrent() {
  clearInterval(demoTimer); demoTimer = null;
  clearTimeout(fileTimer); fileTimer = null;
  if (device.port || device.task) {
    try { await device.disconnect(); } catch (error) { setFeedback(`No se pudo cerrar el puerto: ${error.message}`, true); }
  }
  if (active) markGap();
  active = false;
  serialFresh = false;
  els.connect.disabled = false;
  els.disconnect.disabled = true;
  updateThresholdButton();
}

async function selectMode(nextMode) {
  if (nextMode === mode) return;
  await stopCurrent();
  mode = nextMode;
  document.querySelectorAll('.source-button').forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  els.help.textContent = modeText[mode];
  els.badge.hidden = mode !== 'demo';
  els.connect.querySelector('span').textContent = mode === 'serial' ? 'Conectar Arduino' : mode === 'file' ? 'Leer archivo local' : 'Iniciar demostración';
  setConnection('Sin conectar');
  clearLive('Aún no se reciben mediciones');
  setConfigFeedback(mode === 'serial' ? 'Conecta el Arduino por USB directo para modificar sus umbrales.' : 'Los umbrales solo se modifican mediante USB directo.');
  setFeedback(mode === 'demo' ? 'Demostración desactivada. Los datos reales permanecen separados.' : 'Ninguna fuente está leyendo datos.');
}

function friendlySerialError(error) {
  if (error?.name === 'NotFoundError') return 'Selección cancelada: no se conectó ningún puerto.';
  if (error?.name === 'InvalidStateError' || error?.name === 'NetworkError') return 'El puerto está ocupado o no disponible. Cierra el Monitor serie y bridge.py, y vuelve a intentar.';
  if (error?.name === 'SecurityError') return 'El navegador bloqueó el puerto. Usa HTTPS o localhost e inicia desde este botón.';
  return `No fue posible conectar: ${error?.message || 'error desconocido'}`;
}

async function startSerial() {
  if (!('serial' in navigator)) {
    setConnection('No compatible', 'warning');
    setFeedback('Web Serial no está disponible. Usa Chrome o Edge de escritorio mediante HTTPS o localhost.', true);
    clearLive('Navegador incompatible');
    return;
  }
  try {
    els.connect.disabled = true;
    setFeedback('Selecciona el puerto del Arduino en el diálogo del navegador…');
    await device.connect();
    active = true;
    serialFresh = false;
    els.disconnect.disabled = false;
    updateThresholdButton();
  } catch (error) {
    els.connect.disabled = false;
    updateThresholdButton();
    setConnection('Sin conectar', 'warning');
    setFeedback(friendlySerialError(error), error?.name !== 'NotFoundError');
  }
}

async function pollFile() {
  if (!active || mode !== 'file') return;
  try {
    const response = await fetch('./data/latest.json', {cache:'no-store'});
    if (!response.ok) throw new Error(`archivo no disponible (${response.status})`);
    const d = await response.json();
    if (!validateReading(d, true)) throw new Error('estructura o conexión inválida');
    const age = Date.now() - Date.parse(d.received_at);
    if (!Number.isFinite(age) || age < -5000 || age > STALE_AFTER) throw new Error('lectura desconectada o antigua');
    setConnection('Archivo conectado', 'connected');
    setFeedback('Leyendo el archivo local actualizado por bridge.py.');
    if (Date.parse(d.received_at) !== lastReceived) acceptReading(d, 'file');
  } catch (error) {
    setConnection('Sin datos', 'warning');
    clearLive(`Archivo local: ${error.message}`);
    setFeedback('No hay datos locales vigentes. Inicia bridge.py y el servidor local; esto no activa la demostración.', true);
    if (lastReceived) markGap();
  } finally { if (active && mode === 'file') fileTimer = setTimeout(pollFile, 2000); }
}

function startFile() {
  const local = ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  if (!local) {
    setConnection('Solo localhost', 'warning');
    setFeedback('Archivo local solo funciona en localhost con bridge.py. En GitHub Pages usa USB directo.', true);
    return;
  }
  active = true; els.connect.disabled = true; els.disconnect.disabled = false;
  setConnection('Buscando archivo'); setFeedback('Consultando ./data/latest.json…'); pollFile();
}

function makeDemoReading() {
  const elapsed = Date.now() / 1000;
  const ppm = Math.round(870 + Math.sin(elapsed / 18) * 105 + Math.sin(elapsed / 5.7) * 24);
  if (ppm >= 700) demoPump = true;
  else if (ppm <= 650) demoPump = false;
  return {schema_version:2, type:'telemetry', seq:history.length, uptime_ms:Math.round(performance.now()), co2_ppm:ppm,
    sensor_status:'ok', pump_command:demoPump ? 'on' : 'off', control_mode:'automatic', control_enabled:true,
    threshold_on_ppm:700, threshold_off_ppm:650,
    received_at:new Date().toISOString(), connection:'connected'};
}

function startDemo() {
  demoPump = false;
  active = true; els.connect.disabled = true; els.disconnect.disabled = false;
  updateThresholdButton();
  setConnection('Simulación activa', 'connected');
  setFeedback('DATOS SIMULADOS: serie ficticia separada de las lecturas reales.');
  acceptReading(makeDemoReading(), 'demo');
  demoTimer = setInterval(() => acceptReading(makeDemoReading(), 'demo'), 2000);
}

async function connect() {
  if (mode === 'serial') await startSerial();
  else if (mode === 'file') startFile();
  else startDemo();
}

async function disconnect() {
  await stopCurrent();
  setConnection('Desconectado');
  clearLive('Fuente desconectada');
  setFeedback('La página dejó de recibir datos. Esto no detiene el control local del Arduino.');
}

device.addEventListener('data', ({detail}) => {
  if (mode !== 'serial') return;
  const firstTelemetry = !serialFresh;
  serialFresh = true;
  acceptReading(detail, 'serial');
  updateThresholdButton();
  setConnection('Arduino conectado', 'connected');
  setFeedback(detail.sensor_status === 'ok' ? 'Recibiendo datos por USB directo.' : `Arduino conectado: ${statusLabel(detail.sensor_status).toLowerCase()}.`);
  if (firstTelemetry) setConfigFeedback(`Umbrales informados por Arduino: ${detail.threshold_on_ppm}/${detail.threshold_off_ppm} ppm.`);
});
device.addEventListener('status', ({detail}) => {
  if (mode !== 'serial') return;
  if (detail === 'connected') {
    setConnection('Arduino conectado', 'connected');
    setFeedback('Puerto abierto; esperando datos del Arduino…');
    updateThresholdButton();
  } else if (detail === 'stale') {
    serialFresh = false; updateThresholdButton();
    setConnection('Sin datos', 'warning'); clearLive('Más de 10 segundos sin datos'); setFeedback('El puerto sigue abierto, pero la lectura está desactualizada.', true); markGap();
  } else if (detail === 'disconnected') {
    const wasActive = active; active = false; serialFresh = false; els.connect.disabled = false; els.disconnect.disabled = true;
    updateThresholdButton();
    setConnection('Desconectado'); clearLive('Puerto USB desconectado');
    if (wasActive) { setFeedback('Se perdió o cerró el puerto. El control del Arduino continúa localmente si conserva alimentación.', true); markGap(); }
  }
});
device.addEventListener('warning', ({detail}) => setFeedback(`Advertencia USB: ${detail}`, true));

function thresholdInputError(onPpm, offPpm) {
  if (!Number.isInteger(onPpm) || !Number.isInteger(offPpm)) return 'Ambos umbrales deben ser números enteros.';
  if (onPpm < 400 || onPpm > 5000 || offPpm < 400 || offPpm > 5000) return 'Los umbrales deben estar entre 400 y 5000 ppm.';
  if (offPpm >= onPpm) return 'El umbral de apagado debe ser menor que el de encendido.';
  if (onPpm - offPpm < 20) return 'La separación entre umbrales debe ser de al menos 20 ppm.';
  return null;
}

async function saveThresholdConfiguration(event) {
  event.preventDefault();
  const onPpm = Number(els.thresholdOn.value);
  const offPpm = Number(els.thresholdOff.value);
  const validationError = thresholdInputError(onPpm, offPpm);
  if (validationError) {
    setConfigFeedback(validationError, 'error');
    return;
  }
  if (mode !== 'serial' || !active || !device.port) {
    setConfigFeedback('Conecta el Arduino mediante USB directo antes de enviar la configuración.', 'error');
    return;
  }
  savingThresholds = true;
  updateThresholdButton();
  setConfigFeedback('Configuración enviada; esperando confirmación del Arduino…');
  try {
    const ack = await device.setThresholds(onPpm, offPpm, true);
    els.thresholdOn.value = ack.threshold_on_ppm;
    els.thresholdOff.value = ack.threshold_off_ppm;
    thresholdsDirty = false;
    setConfigFeedback(`Umbrales confirmados y guardados en Arduino: ${ack.threshold_on_ppm}/${ack.threshold_off_ppm} ppm.`, 'success');
  } catch (error) {
    const errors = {
      threshold_out_of_range:'Arduino rechazó los valores: deben estar entre 400 y 5000 ppm.',
      threshold_off_must_be_lower:'Arduino rechazó los valores: apagado debe ser menor que encendido.',
      threshold_gap_too_small:'Arduino rechazó los valores: la separación mínima es 20 ppm.',
      invalid_json:'Arduino rechazó el formato del comando.'
    };
    setConfigFeedback(errors[error.code] || `Configuración no confirmada: ${error.message}`, 'error');
  } finally {
    savingThresholds = false;
    updateThresholdButton();
  }
}

function exportHistory() {
  const payload = {schema_version:2, exported_at:new Date().toISOString(), note:'Historial de recepción de esta sesión; pump_command no es caudal medido.', samples:history};
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `historial-co2-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  link.click(); URL.revokeObjectURL(link.href); setFeedback(`Historial exportado: ${history.length} mediciones.`);
}

document.querySelectorAll('.source-button').forEach((button) => button.addEventListener('click', () => selectMode(button.dataset.mode)));
els.connect.addEventListener('click', connect);
els.disconnect.addEventListener('click', disconnect);
els.export.addEventListener('click', exportHistory);
els.thresholdForm.addEventListener('submit', saveThresholdConfiguration);
[els.thresholdOn, els.thresholdOff].forEach((input) => input.addEventListener('input', () => {
  thresholdsDirty = true;
  const error = thresholdInputError(Number(els.thresholdOn.value), Number(els.thresholdOff.value));
  setConfigFeedback(error || 'Valores listos para enviar al Arduino.', error ? 'error' : '');
}));

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
  }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return {ctx,w:rect.width,h:rect.height};
}

function drawChart() {
  trimHistory(); const {ctx,w,h} = setupCanvas(els.chart); ctx.clearRect(0,0,w,h);
  els.empty.hidden = history.length > 0;
  const pad = {l:48,r:16,t:18,b:32}; const now = Date.now(), start = now - TEN_MINUTES;
  const points = history.filter((p) => Date.parse(p.received_at) >= start);
  if (!points.length) return;
  let min = Math.min(...points.map(p=>p.co2_ppm)), max = Math.max(...points.map(p=>p.co2_ppm));
  min = Math.floor((min - 80)/100)*100; max = Math.ceil((max + 80)/100)*100; if (max-min < 200) max=min+200;
  ctx.font='10px DM Mono'; ctx.fillStyle='#71877e'; ctx.strokeStyle='#203a32'; ctx.lineWidth=1;
  for (let i=0;i<4;i++) { const y=pad.t+(h-pad.t-pad.b)*i/3; ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke(); const label=Math.round(max-(max-min)*i/3);ctx.fillText(label,pad.l-38,y+3); }
  for (let i=0;i<=5;i++) { const x=pad.l+(w-pad.l-pad.r)*i/5; const mins=10-i*2; ctx.fillText(i===5?'ahora':`−${mins}m`,x-12,h-8); }
  const xFor=t=>pad.l+(t-start)/TEN_MINUTES*(w-pad.l-pad.r); const yFor=v=>pad.t+(max-v)/(max-min)*(h-pad.t-pad.b);
  ctx.strokeStyle='#c8ff4d';ctx.lineWidth=2;ctx.lineJoin='round';ctx.beginPath(); let previous=null;
  for (const point of points) { const x=xFor(Date.parse(point.received_at)),y=yFor(point.co2_ppm); if (!previous || previous.segment!==point.segment || previous.source!==point.source) ctx.moveTo(x,y); else ctx.lineTo(x,y); previous=point; }
  ctx.stroke();
  const segments=[...new Set(points.map(p=>p.segment))];
  for (const seg of segments.slice(1)) { const p=points.find(item=>item.segment===seg); if(!p)continue;const x=xFor(Date.parse(p.received_at));ctx.strokeStyle='#ff907d';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,h-pad.b);ctx.stroke();ctx.setLineDash([]); }
}

let visualPpm = 400;
const particles = Array.from({length:180}, (_,i) => ({
  angle: (i * 2.399963) % (Math.PI * 2),
  distance: 0.16 + ((i * 47) % 100) / 120,
  speed: .55 + ((i * 29) % 70) / 100,
  size: .7 + (i % 4) * .38
}));

function animateOrganism(time) {
  const {ctx,w,h}=setupCanvas(els.organism); ctx.clearRect(0,0,w,h);
  const activeVisual=latestValid !== null;
  const target=activeVisual ? latestValid : 400;
  visualPpm += (target-visualPpm)*.025;
  // Coeficiente gráfico lineal dentro del rango validado del sensor; no es un modelo biológico.
  const coefficient=activeVisual ? Math.min(1,Math.max(0,(visualPpm-400)/(5000-400))) : 0;
  const particleCount=activeVisual ? Math.round(24+coefficient*156) : 12;
  const velocity=activeVisual ? .00016+coefficient*.00082 : .000035;
  const cx=w/2,cy=h*.46,maxRadius=Math.min(w,h)*.4;

  els.photoCoefficient.textContent=activeVisual ? coefficient.toFixed(2) : '—';

  // Campo de partículas: solo posiciones animadas, sin crear mediciones intermedias.
  ctx.fillStyle=activeVisual ? 'rgba(184,193,190,.62)' : 'rgba(137,151,146,.22)';
  for(let i=0;i<particleCount;i++) {
    const p=particles[i];
    const angle=p.angle+time*velocity*p.speed;
    const drift=Math.sin(time*.00045+p.angle*7)*8;
    const radius=p.distance*maxRadius+drift;
    const x=cx+Math.cos(angle)*radius;
    const y=cy+Math.sin(angle)*radius*.78;
    ctx.beginPath();ctx.arc(x,y,p.size,0,Math.PI*2);ctx.fill();
  }

  // La distancia de la curva al centro expresa el coeficiente proporcional.
  const baseRadius=42+coefficient*maxRadius*.62;
  ctx.beginPath();
  const steps=120;
  for(let i=0;i<=steps;i++) {
    const angle=(i/steps)*Math.PI*2;
    const wave=Math.sin(angle*3+time*.0011)*9+Math.sin(angle*7-time*.0007)*4;
    const radius=baseRadius+wave*(.35+coefficient*.9);
    const x=cx+Math.cos(angle)*radius;
    const y=cy+Math.sin(angle)*radius*.78;
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.closePath();
  ctx.strokeStyle=activeVisual?'rgba(200,255,77,.92)':'rgba(126,151,137,.22)';
  ctx.lineWidth=activeVisual?2:1;ctx.shadowColor=activeVisual?'rgba(200,255,77,.45)':'transparent';ctx.shadowBlur=activeVisual?12:0;ctx.stroke();ctx.shadowBlur=0;
  requestAnimationFrame(animateOrganism);
}

setInterval(() => { trimHistory(); drawChart(); if (active && lastReceived && Date.now()-lastReceived>STALE_AFTER && mode!=='serial') { clearLive('Más de 10 segundos sin datos'); markGap(); } }, 5000);
window.addEventListener('resize', () => drawChart());
drawChart(); requestAnimationFrame(animateOrganism);
