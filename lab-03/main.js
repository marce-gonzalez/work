import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ======================================================
// 01 — CONFIGURACIÓN
// ======================================================
// Usamos un feed GBFS público de Citi Bike (Nueva York).
// station_information describe dónde están las estaciones y su capacidad.
// station_status describe su estado actual: bicicletas y anclajes disponibles.

const URL_INFO =
  "https://gbfs.lyft.com/gbfs/2.3/bkn/es/station_information.json";

const URL_ESTADO =
  "https://gbfs.lyft.com/gbfs/2.3/bkn/es/station_status.json";

const INTERVALO_ACTUALIZACION = 15; // segundos.

const parametros = {
  modo: "geografico",
  escalaAltura: 0.15,
  escalaAncho: 0.5,
  cantidad: 80,
};

let actualizacionAutomatica = true;
let segundosRestantes = INTERVALO_ACTUALIZACION;
let estaciones = [];
let objetosEstacion = [];

// ======================================================
// 02 — ESCENA
// ======================================================

const viewport = document.querySelector("#viewport");
const escena = new THREE.Scene();
escena.background = new THREE.Color(0x0b0b0c);

const camara = new THREE.PerspectiveCamera(
  42,
  viewport.clientWidth / viewport.clientHeight,
  0.1,
  300
);
camara.position.set(18, 46, 24);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const controlesOrbita = new OrbitControls(camara, renderer.domElement);
controlesOrbita.enableDamping = true;
controlesOrbita.target.set(0, 2, 0);

escena.add(new THREE.HemisphereLight(0xf2eee4, 0x1f2228, 1.8));

const luzPrincipal = new THREE.DirectionalLight(0xffffff, 2.7);
luzPrincipal.position.set(18, 28, 14);
luzPrincipal.castShadow = true;
escena.add(luzPrincipal);

const suelo = new THREE.Mesh(
  new THREE.PlaneGeometry(90, 90),
  new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 1 })
);
suelo.rotation.x = -Math.PI / 2;
suelo.position.y = -0.02;
suelo.receiveShadow = true;
escena.add(suelo);

const grilla = new THREE.GridHelper(70, 70, 0x34383d, 0x1e2024);
grilla.position.y = 0.001;
escena.add(grilla);

const grupoEstaciones = new THREE.Group();
escena.add(grupoEstaciones);

const grupoBaseGeografica = new THREE.Group();
escena.add(grupoBaseGeografica);

// ======================================================
// 03 — DATOS: FETCH + FALLBACK
// ======================================================

async function cargarDatosVivos() {
  actualizarEstadoConexion("conectando");

  try {
    // Dos fuentes del mismo sistema:
    // 1) información espacial y capacidad
    // 2) estado operativo actual
    const [respuestaInfo, respuestaEstado] = await Promise.all([
      fetch(URL_INFO, { cache: "no-store" }),
      fetch(URL_ESTADO, { cache: "no-store" }),
    ]);

    if (!respuestaInfo.ok || !respuestaEstado.ok) {
      throw new Error("La API respondió con un estado no válido.");
    }

    const info = await respuestaInfo.json();
    const estado = await respuestaEstado.json();

    estaciones = combinarFeedsGBFS(info, estado);
    actualizarEstadoConexion("vivo");
    document.querySelector("#fuente-label").textContent = "Citi Bike · GBFS";
    document.querySelector("#actualizacion-label").textContent =
      formatearHora(estado.last_updated);

    generarRepresentacion();
  } catch (error) {
    console.warn("No fue posible usar el feed vivo. Se utilizará el dataset local.", error);
    await cargarRespaldoLocal();
  }
}

async function cargarRespaldoLocal() {
  const respuesta = await fetch("./assets/data/movilidad-respaldo.json");
  const datos = await respuesta.json();

  estaciones = datos.estaciones;
  actualizarEstadoConexion("respaldo");
  document.querySelector("#fuente-label").textContent = "Dataset local · respaldo";
  document.querySelector("#actualizacion-label").textContent = "archivo local";

  generarRepresentacion();
}

function combinarFeedsGBFS(info, estado) {
  // station_id es la llave que permite unir ambos feeds.
  const estadosPorId = new Map(
    estado.data.stations.map((estacion) => [estacion.station_id, estacion])
  );

  return info.data.stations
    .map((estacionInfo) => {
      const estacionEstado = estadosPorId.get(estacionInfo.station_id);
      if (!estacionEstado) return null;

      const capacidad = estacionInfo.capacity ?? 0;
      const bicicletas = estacionEstado.num_bikes_available ?? 0;
      const anclajesLibres = estacionEstado.num_docks_available ?? 0;

      return {
        id: estacionInfo.station_id,
        nombre: estacionInfo.name,
        lat: estacionInfo.lat,
        lon: estacionInfo.lon,
        capacidad,
        bicicletas,
        anclajes_libres: anclajesLibres,
      };
    })
    .filter(Boolean)
    .filter((estacion) => estacion.capacidad > 0);
}

// ======================================================
// 04 — REGLAS: INPUT → RELACIÓN → OUTPUT
// ======================================================

function calcularOcupacion(estacion) {
  return estacion.capacidad > 0
    ? estacion.bicicletas / estacion.capacidad
    : 0;
}

function proyectarGeograficamente(estacionesSeleccionadas) {
  // No construimos un mapa cartográfico exacto.
  // Para este LAB hacemos una proyección local simple:
  // longitud → X, latitud → Z.
  const latitudes = estacionesSeleccionadas.map((e) => e.lat);
  const longitudes = estacionesSeleccionadas.map((e) => e.lon);

  const latCentro = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const lonCentro = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;

  return estacionesSeleccionadas.map((estacion) => ({
    ...estacion,
    x: (estacion.lon - lonCentro) * 150,
    z: -(estacion.lat - latCentro) * 150,
  }));
}

function ordenarPorOcupacion(estacionesSeleccionadas) {
  const ordenadas = [...estacionesSeleccionadas].sort(
    (a, b) => calcularOcupacion(b) - calcularOcupacion(a)
  );

  const columnas = Math.ceil(Math.sqrt(ordenadas.length));
  const separacion = 2.0;

  return ordenadas.map((estacion, indice) => {
    const columna = indice % columnas;
    const fila = Math.floor(indice / columnas);

    return {
      ...estacion,
      x: (columna - columnas / 2) * separacion,
      z: (fila - columnas / 2) * separacion,
    };
  });
}

function generarRepresentacion() {
  limpiarRepresentacion();

  const seleccion = seleccionarEstaciones(estaciones, parametros.cantidad);

  const distribuidas =
    parametros.modo === "geografico"
      ? proyectarGeograficamente(seleccion)
      : ordenarPorOcupacion(seleccion);

  actualizarBaseGeografica(distribuidas);
  distribuidas.forEach(crearModuloEstacion);
}

function seleccionarEstaciones(lista, cantidad) {
  // Elegimos un conjunto estable y suficientemente representativo.
  // Ordenar por capacidad evita que el subconjunto dependa del orden arbitrario del feed.
  return [...lista]
    .sort((a, b) => b.capacidad - a.capacidad)
    .slice(0, cantidad);
}

function crearModuloEstacion(estacion) {
  const ocupacion = calcularOcupacion(estacion);

  // REGLA 1:
  // capacidad total → altura total del contenedor.
  const alturaTotal =
    Math.max(1.4, estacion.capacidad * parametros.escalaAltura);

  // REGLA 2:
  // bicicletas disponibles → fracción llena.
  const alturaBicicletas = Math.max(0.08, alturaTotal * ocupacion);

  // REGLA 3:
  // porcentaje de ocupación → ancho del módulo.
  const ancho =
    (0.55 + ocupacion * 0.75) *
    parametros.escalaAncho;

  const grupo = new THREE.Group();
  grupo.position.set(estacion.x, 0, estacion.z);
  grupo.userData.estacion = estacion;

  // Contenedor: representa la capacidad total.
  const geometriaCapacidad = new THREE.BoxGeometry(ancho, alturaTotal, ancho);
  const materialCapacidad = new THREE.MeshStandardMaterial({
    color: 0x34383e,
    roughness: 0.9,
    transparent: true,
    opacity: 0.55,
  });

  const capacidad = new THREE.Mesh(geometriaCapacidad, materialCapacidad);
  capacidad.position.y = alturaTotal / 2;
  capacidad.userData.estacion = estacion;
  grupo.add(capacidad);

  // Volumen claro: representa las bicicletas actualmente disponibles.
  const geometriaBicicletas = new THREE.BoxGeometry(
    ancho * 0.72,
    alturaBicicletas,
    ancho * 0.72
  );
  const materialBicicletas = new THREE.MeshStandardMaterial({
    color: 0xddd7ca,
    roughness: 0.5,
  });

  const bicicletas = new THREE.Mesh(geometriaBicicletas, materialBicicletas);
  bicicletas.position.y = alturaBicicletas / 2;
  bicicletas.castShadow = true;
  bicicletas.userData.estacion = estacion;
  grupo.add(bicicletas);

  grupoEstaciones.add(grupo);
  objetosEstacion.push(capacidad, bicicletas);
}

function limpiarRepresentacion() {
  objetosEstacion = [];

  while (grupoEstaciones.children.length > 0) {
    const grupo = grupoEstaciones.children[0];

    grupo.traverse((objeto) => {
      if (objeto.geometry) objeto.geometry.dispose();
      if (objeto.material) objeto.material.dispose();
    });

    grupoEstaciones.remove(grupo);
  }
}

function actualizarBaseGeografica(estacionesDistribuidas) {
  limpiarBaseGeografica();
  grupoBaseGeografica.visible = parametros.modo === "geografico";

  if (!grupoBaseGeografica.visible || estacionesDistribuidas.length === 0) return;

  const xs = estacionesDistribuidas.map((estacion) => estacion.x);
  const zs = estacionesDistribuidas.map((estacion) => estacion.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const ancho = maxX - minX;
  const profundidad = maxZ - minZ;
  const largoFlecha = Math.max(4, Math.min(ancho, profundidad) * 0.28);
  const xGuia = minX - 3.2;
  const zInicio = maxZ;
  const zFinal = zInicio - largoFlecha;

  const materialGuia = new THREE.LineBasicMaterial({
    color: 0xd9d2c3,
    transparent: true,
    opacity: 0.5,
  });

  const flecha = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(xGuia, 0.04, zInicio),
      new THREE.Vector3(xGuia, 0.04, zFinal),
    ]),
    materialGuia
  );

  const cabeza = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 1.1, 3),
    new THREE.MeshBasicMaterial({
      color: 0xd9d2c3,
      transparent: true,
      opacity: 0.55,
    })
  );
  cabeza.rotation.x = Math.PI / 2;
  cabeza.rotation.z = Math.PI;
  cabeza.position.set(xGuia, 0.06, zFinal - 0.46);

  grupoBaseGeografica.add(flecha, cabeza);
  grupoBaseGeografica.add(crearEtiquetaSuelo("N", xGuia, zFinal - 1.45, 42));
  grupoBaseGeografica.add(
    crearEtiquetaSuelo("lon → / lat ↑", minX, maxZ + 1.9, 34)
  );
}

function limpiarBaseGeografica() {
  limpiarGrupo(grupoBaseGeografica);
}

function limpiarGrupo(grupo) {
  while (grupo.children.length > 0) {
    const objeto = grupo.children[0];

    if (objeto.geometry) objeto.geometry.dispose();
    if (objeto.material) {
      if (objeto.material.map) objeto.material.map.dispose();
      objeto.material.dispose();
    }

    grupo.remove(objeto);
  }
}

function crearEtiquetaSuelo(texto, x, z, tamanoFuente) {
  const canvas = document.createElement("canvas");
  const contexto = canvas.getContext("2d");
  canvas.width = 256;
  canvas.height = 96;

  contexto.fillStyle = "rgba(217, 210, 195, 0.72)";
  contexto.font = `${tamanoFuente}px Roboto, Arial, sans-serif`;
  contexto.textAlign = "center";
  contexto.textBaseline = "middle";
  contexto.fillText(texto, canvas.width / 2, canvas.height / 2);

  const textura = new THREE.CanvasTexture(canvas);
  const etiqueta = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textura,
      transparent: true,
      depthWrite: false,
    })
  );
  etiqueta.position.set(x, 0.18, z);
  etiqueta.scale.set(5.4, 2.0, 1);

  return etiqueta;
}

// ======================================================
// 05 — INTERFAZ + INSPECTOR
// ======================================================

const raycaster = new THREE.Raycaster();
const puntero = new THREE.Vector2();

renderer.domElement.addEventListener("pointerdown", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();

  puntero.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  puntero.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(puntero, camara);

  const intersecciones = raycaster.intersectObjects(objetosEstacion, false);

  if (intersecciones.length > 0) {
    mostrarEstacion(intersecciones[0].object.userData.estacion);
  }
});

function mostrarEstacion(estacion) {
  const ocupacion = calcularOcupacion(estacion);

  document.querySelector("#estacion-nombre").textContent = estacion.nombre;
  document.querySelector("#m-bicis").textContent = estacion.bicicletas;
  document.querySelector("#m-libres").textContent = estacion.anclajes_libres;
  document.querySelector("#m-capacidad").textContent = estacion.capacidad;
  document.querySelector("#m-ocupacion").textContent =
    `${Math.round(ocupacion * 100)}%`;
}

document.querySelector("#modo-distribucion").addEventListener("change", (event) => {
  parametros.modo = event.target.value;
  generarRepresentacion();
});

conectarSlider("escala-altura", "escala-altura-valor", "escalaAltura", 2);
conectarSlider("escala-ancho", "escala-ancho-valor", "escalaAncho", 2);
conectarSlider("cantidad", "cantidad-valor", "cantidad", 0);

function conectarSlider(idControl, idValor, parametro, decimales) {
  const control = document.querySelector(`#${idControl}`);
  const valor = document.querySelector(`#${idValor}`);

  control.addEventListener("input", (event) => {
    parametros[parametro] = Number(event.target.value);
    valor.value = parametros[parametro].toFixed(decimales);
    generarRepresentacion();
  });
}

document.querySelector("#actualizar").addEventListener("click", async () => {
  segundosRestantes = INTERVALO_ACTUALIZACION;
  await cargarDatosVivos();
});

document.querySelector("#pausar").addEventListener("click", (event) => {
  actualizacionAutomatica = !actualizacionAutomatica;
  event.target.textContent = actualizacionAutomatica
    ? "Pausar auto"
    : "Reanudar auto";

  document.querySelector("#cuenta-regresiva").textContent =
    actualizacionAutomatica ? `${segundosRestantes} s` : "pausada";
});

function actualizarEstadoConexion(tipo) {
  const estado = document.querySelector("#estado-label");

  if (tipo === "vivo") {
    estado.innerHTML = '<i class="status-dot"></i> conectado';
  } else if (tipo === "respaldo") {
    estado.textContent = "respaldo local";
  } else {
    estado.textContent = "conectando…";
  }
}

function formatearHora(timestamp) {
  if (!timestamp) return new Date().toLocaleTimeString("es-CL");

  // GBFS v2 usa epoch seconds.
  const fecha = new Date(timestamp * 1000);

  return fecha.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ======================================================
// 06 — POLLING RESPONSABLE
// ======================================================
// La app consulta periódicamente el feed para mantener visible la fuente viva.
// El feed puede declarar un TTL mayor, por lo que algunas respuestas pueden repetirse.
// El contador mantiene visible que el sistema está esperando la próxima actualización.

setInterval(async () => {
  if (!actualizacionAutomatica) return;

  segundosRestantes -= 1;
  document.querySelector("#cuenta-regresiva").textContent =
    `${segundosRestantes} s`;

  if (segundosRestantes <= 0) {
    segundosRestantes = INTERVALO_ACTUALIZACION;
    await cargarDatosVivos();
  }
}, 1000);

// ======================================================
// 07 — ANIMACIÓN + RESPONSIVE
// ======================================================

function animar() {
  requestAnimationFrame(animar);
  controlesOrbita.update();
  renderer.render(escena, camara);
}

function ajustarVentana() {
  const ancho = viewport.clientWidth;
  const altura = viewport.clientHeight;

  camara.aspect = ancho / altura;
  camara.updateProjectionMatrix();
  renderer.setSize(ancho, altura);
}

window.addEventListener("resize", ajustarVentana);

cargarDatosVivos();
animar();
