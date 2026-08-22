import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const URL_DMC = "https://climatologia.meteochile.gob.cl/application/servicios/getDatosRecientesRedEma";
const INTERVALO = 300;
const parametros = { modo: "geografico", escalaAltura: 0.16, escalaAncho: 0.65, cantidad: 30 };
let estaciones = [], objetos = [], segundos = INTERVALO, automatico = true;

const $ = (selector) => document.querySelector(selector);
const viewport = $("#viewport");
const escena = new THREE.Scene();
escena.background = new THREE.Color(0x081014);
const camara = new THREE.PerspectiveCamera(42, viewport.clientWidth / viewport.clientHeight, 0.1, 500);
camara.position.set(25, 50, 35);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);
const controles = new OrbitControls(camara, renderer.domElement);
controles.enableDamping = true;
controles.target.set(0, 3, 0);
escena.add(new THREE.HemisphereLight(0xeaf7ff, 0x132027, 2.2));
const luz = new THREE.DirectionalLight(0xffffff, 2.4);
luz.position.set(20, 35, 15);
escena.add(luz);
const suelo = new THREE.Mesh(new THREE.PlaneGeometry(85, 85), new THREE.MeshStandardMaterial({ color: 0x0b171c, roughness: 1 }));
suelo.rotation.x = -Math.PI / 2;
escena.add(suelo, new THREE.GridHelper(70, 35, 0x31505a, 0x172c33));
const grupo = new THREE.Group();
escena.add(grupo);

const usuarioInput = $("#dmc-usuario"), tokenInput = $("#dmc-token");
usuarioInput.value = localStorage.getItem("dmc_usuario") || "";
tokenInput.value = localStorage.getItem("dmc_token") || "";

function numero(valor) {
  if (valor == null) return null;
  const match = String(valor).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function normalizarDMC(json) {
  return (json.datosEstaciones || []).map(({ estacion, datos = [] }) => {
    const actual = [...datos].reverse().find((d) => [d.temperatura, d.humedadRelativa, d.fuerzaDelViento].some((v) => numero(v) != null));
    if (!actual) return null;
    const vientoKt = numero(actual.fuerzaDelVientoPromedio10Minutos ?? actual.fuerzaDelViento);
    return {
      id: estacion.codigoNacional, nombre: estacion.nombreEstacion,
      lat: numero(estacion.latitud), lon: numero(estacion.longitud),
      temperatura: numero(actual.temperatura), humedad: numero(actual.humedadRelativa),
      viento: vientoKt == null ? null : vientoKt * 0.514444,
      direccion: numero(actual.direccionDelVientoPromedio10Minutos ?? actual.direccionDelViento),
      momento: actual.momento,
    };
  }).filter((e) => e && Number.isFinite(e.lat) && Number.isFinite(e.lon));
}

async function cargarDatosVivos() {
  estado("conectando");
  const usuario = usuarioInput.value.trim(), token = tokenInput.value.trim();
  if (!usuario || !token) return cargarRespaldo("Ingresa usuario y token DMC para activar datos vivos.");
  localStorage.setItem("dmc_usuario", usuario);
  localStorage.setItem("dmc_token", token);
  try {
    const url = new URL(URL_DMC);
    url.searchParams.set("usuario", usuario); url.searchParams.set("token", token);
    const respuesta = await fetch(url, { cache: "no-store" });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const json = await respuesta.json();
    estaciones = normalizarDMC(json);
    if (!estaciones.length) throw new Error(json.status || "respuesta sin estaciones");
    estado("vivo");
    $("#fuente-label").textContent = "DMC · Red EMA";
    $("#actualizacion-label").textContent = json.fechaCreacion || "recién consultado";
    $("#aviso-datos").textContent = "Observaciones meteorológicas reales. No son mediciones de MP2.5/MP10.";
    generar();
  } catch (error) {
    console.warn("Consulta DMC fallida", error);
    await cargarRespaldo(`DMC no disponible: ${error.message}`);
  }
}

async function cargarRespaldo(mensaje) {
  estaciones = (await (await fetch("./assets/data/ambiental-respaldo.json")).json()).estaciones;
  estado("respaldo");
  $("#fuente-label").textContent = "Dataset didáctico local";
  $("#actualizacion-label").textContent = "sin conexión viva";
  $("#aviso-datos").textContent = mensaje;
  generar();
}

// Proxy visual didáctico. No equivale a concentración ni a un índice sanitario.
function dispersion(e) {
  return THREE.MathUtils.clamp((e.viento ?? 0) / 8 * 0.75 + (100 - (e.humedad ?? 70)) / 100 * 0.25, 0, 1);
}
function distribuir(lista) {
  if (parametros.modo === "dispersion") {
    const columnas = Math.ceil(Math.sqrt(lista.length));
    return [...lista].sort((a, b) => dispersion(a) - dispersion(b)).map((e, i) => ({ ...e, x: (i % columnas - columnas / 2) * 2.3, z: (Math.floor(i / columnas) - columnas / 2) * 2.3 }));
  }
  const latC = (Math.min(...lista.map((e) => e.lat)) + Math.max(...lista.map((e) => e.lat))) / 2;
  const lonC = (Math.min(...lista.map((e) => e.lon)) + Math.max(...lista.map((e) => e.lon))) / 2;
  return lista.map((e) => ({ ...e, x: (e.lon - lonC) * 1.15, z: -(e.lat - latC) * 1.15 }));
}
function generar() {
  limpiar();
  distribuir(estaciones.slice(0, parametros.cantidad)).forEach((e) => {
    const indice = dispersion(e), altura = Math.max(0.5, (e.humedad ?? 50) * parametros.escalaAltura);
    const ancho = (0.65 + (e.viento ?? 0) * 0.09) * parametros.escalaAncho;
    const color = new THREE.Color().setHSL(0.02 + indice * 0.43, 0.72, 0.52);
    const malla = new THREE.Mesh(new THREE.CylinderGeometry(ancho * 0.72, ancho, altura, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    malla.position.set(e.x, altura / 2, e.z); malla.userData.estacion = e;
    grupo.add(malla); objetos.push(malla);
    if (e.direccion != null && e.viento) {
      const rad = THREE.MathUtils.degToRad(e.direccion);
      grupo.add(new THREE.ArrowHelper(new THREE.Vector3(Math.sin(rad), 0, Math.cos(rad)), new THREE.Vector3(e.x, altura + 0.15, e.z), Math.min(4, 0.5 + e.viento * 0.25), 0xd8eef5, 0.35, 0.18));
    }
  });
}
function limpiar() {
  objetos = [];
  while (grupo.children.length) {
    const objeto = grupo.children[0];
    objeto.traverse((h) => { h.geometry?.dispose(); Array.isArray(h.material) ? h.material.forEach((m) => m.dispose()) : h.material?.dispose(); });
    grupo.remove(objeto);
  }
}

const raycaster = new THREE.Raycaster(), puntero = new THREE.Vector2();
renderer.domElement.addEventListener("pointerdown", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  puntero.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(puntero, camara);
  const hit = raycaster.intersectObjects(objetos)[0];
  if (hit) mostrar(hit.object.userData.estacion);
});
const valor = (v, unidad) => v == null ? "—" : `${v.toFixed(1)} ${unidad}`;
function mostrar(e) {
  $("#estacion-nombre").textContent = e.nombre;
  $("#m-temperatura").textContent = valor(e.temperatura, "°C");
  $("#m-humedad").textContent = valor(e.humedad, "%");
  $("#m-viento").textContent = valor(e.viento, "m/s");
  $("#m-dispersion").textContent = `${Math.round(dispersion(e) * 100)} / 100`;
}
function slider(id, salida, clave, decimales) {
  $(`#${id}`).addEventListener("input", (event) => { parametros[clave] = Number(event.target.value); $(`#${salida}`).value = parametros[clave].toFixed(decimales); generar(); });
}
$("#modo-distribucion").addEventListener("change", (e) => { parametros.modo = e.target.value; generar(); });
slider("escala-altura", "escala-altura-valor", "escalaAltura", 2);
slider("escala-ancho", "escala-ancho-valor", "escalaAncho", 2);
slider("cantidad", "cantidad-valor", "cantidad", 0);
$("#actualizar").addEventListener("click", () => { segundos = INTERVALO; cargarDatosVivos(); });
$("#pausar").addEventListener("click", (event) => { automatico = !automatico; event.target.textContent = automatico ? "Pausar auto" : "Reanudar auto"; });
function estado(tipo) { $("#estado-label").innerHTML = tipo === "vivo" ? '<i class="status-dot"></i> conectado' : tipo === "respaldo" ? "respaldo local" : "conectando…"; }
setInterval(() => {
  if (!automatico) return $("#cuenta-regresiva").textContent = "pausada";
  segundos--;
  $("#cuenta-regresiva").textContent = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
  if (segundos <= 0) { segundos = INTERVALO; cargarDatosVivos(); }
}, 1000);
function animar() { requestAnimationFrame(animar); controles.update(); renderer.render(escena, camara); }
window.addEventListener("resize", () => { camara.aspect = viewport.clientWidth / viewport.clientHeight; camara.updateProjectionMatrix(); renderer.setSize(viewport.clientWidth, viewport.clientHeight); });
cargarDatosVivos(); animar();
