import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// 01 — Todos los parámetros editables están reunidos aquí.
const parametros = {
  crecimiento: 0.45,
  variacion: 0.35,
  cantidadOrganismos: 5,
  semilla: 42,
  radioNube: 5.5,
  longitudBase: 0.72,
  probabilidadRamificacion: 0.24,
  distanciaMinima: 0.52,
  radioDensidad: 1.35,
  limiteDensidad: 6,
  maximoNodos: 2400,
  intervaloCrecimiento: 120,
};

// 02 — Escena Three.js reutilizada del ejercicio original.
const viewport = document.querySelector("#viewport");
const escena = new THREE.Scene();
escena.background = new THREE.Color(0x0b0b0c);
escena.fog = new THREE.FogExp2(0x0b0b0c, 0.018);

const camara = new THREE.PerspectiveCamera(42, viewport.clientWidth / viewport.clientHeight, 0.1, 200);
camara.position.set(15, 11, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const controlesOrbita = new OrbitControls(camara, renderer.domElement);
controlesOrbita.enableDamping = true;
controlesOrbita.target.set(0, 4, 0);

const suelo = new THREE.GridHelper(40, 40, 0x30343a, 0x1d2024);
suelo.position.y = -0.02;
escena.add(suelo);

// 03 — Sistema de crecimiento orgánico.
class Organism {
  constructor(scene) {
    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.94 });
    this.lines = new THREE.LineSegments(this.geometry, this.material);
    scene.add(this.lines);

    this.rootGeometry = new THREE.BufferGeometry();
    this.rootPoints = new THREE.Points(
      this.rootGeometry,
      new THREE.PointsMaterial({ color: 0x049dbf, size: 0.16, sizeAttenuation: true })
    );
    scene.add(this.rootPoints);
    this.reset();
  }

  reset() {
    this.nodes = [];
    this.branches = [];
    this.activeBranches = [];
    this.spatialGrid = new Map();
    this.generation = 0;
    this.running = false;
    this.lastGrowthTime = 0;

    const rootPositions = this.createSeedCloud();
    rootPositions.forEach((position, index) => {
      const root = this.createNode(position, 0);
      this.activeBranches.push({
        node: root,
        direction: new THREE.Vector3(0, 1, 0),
        rootPosition: position.clone(),
        branchLevel: 0,
        id: index + 1,
      });
    });
    this.updateRootPoints(rootPositions);
    this.updateGeometry();
    updateStats();
  }

  grow() {
    if (this.activeBranches.length === 0 || this.nodes.length >= parametros.maximoNodos) {
      this.running = false;
      updateStats();
      return;
    }

    const nextBranches = [];
    const currentBranches = [...this.activeBranches];
    this.generation += 1;

    currentBranches.forEach((tip, index) => {
      const main = this.tryGrowth(tip, false, index);
      if (main) nextBranches.push(main);

      const chance = parametros.probabilidadRamificacion * (0.65 + parametros.variacion * 0.7);
      if (main && this.random(tip.id, this.generation, 20) < chance && this.nodes.length < parametros.maximoNodos) {
        const side = this.tryGrowth(tip, true, index);
        if (side) nextBranches.push(side);
      }
    });

    this.activeBranches = nextBranches;
    this.updateGeometry();
    updateStats();
  }

  tryGrowth(tip, isBranch, index) {
    const direction = this.calculateDirection(tip, isBranch, index);
    const noise = this.random(tip.id, this.generation, isBranch ? 31 : 30);
    const length = parametros.longitudBase * (0.88 + noise * parametros.variacion * 0.42);
    const position = tip.node.position.clone().addScaledVector(direction, length);
    if (this.checkCollision(position, tip.node)) return null;

    const node = this.createNode(position, this.generation);
    const branchLevel = tip.branchLevel + (isBranch ? 1 : 0);
    this.createBranch(tip.node, node, branchLevel);
    return {
      node,
      direction,
      rootPosition: tip.rootPosition,
      branchLevel,
      id: node.id * 2 + (isBranch ? 1 : 0),
    };
  }

  createNode(position, generation) {
    const node = { id: this.nodes.length, position, generation };
    this.nodes.push(node);
    const key = this.gridKey(position);
    if (!this.spatialGrid.has(key)) this.spatialGrid.set(key, []);
    this.spatialGrid.get(key).push(node);
    return node;
  }

  createBranch(start, end, branchLevel) {
    this.branches.push({ start, end, color: this.colorForBranchLevel(branchLevel) });
  }

  calculateDirection(tip, isBranch, index) {
    const radial = tip.node.position.clone().sub(tip.rootPosition);
    radial.y *= 0.35;
    if (radial.lengthSq() < 0.01) {
      const angle = this.random(tip.id, this.generation, index + 2) * Math.PI * 2;
      radial.set(Math.cos(angle), 0.55, Math.sin(angle));
    }
    radial.normalize();

    const direction = radial.lerp(new THREE.Vector3(0, 1, 0), parametros.crecimiento).normalize();
    direction.lerp(tip.direction, 0.32).normalize();
    const randomDirection = new THREE.Vector3(
      this.randomSigned(tip.id, this.generation, 10 + index),
      this.randomSigned(tip.id, this.generation, 11 + index) * 0.65,
      this.randomSigned(tip.id, this.generation, 12 + index)
    ).normalize();
    direction.lerp(randomDirection, 0.08 + parametros.variacion * 0.42).normalize();

    if (isBranch) {
      const axis = new THREE.Vector3(
        this.randomSigned(tip.id, this.generation, 40),
        0.4,
        this.randomSigned(tip.id, this.generation, 41)
      ).normalize();
      // Una separación amplia evita que la rama lateral choque de inmediato
      // con la punta principal nacida en la misma generación.
      direction.applyAxisAngle(axis, 0.9 + parametros.variacion * 0.5).normalize();
    }
    direction.y = Math.max(direction.y, -0.18);
    return direction.normalize();
  }

  checkCollision(position, parent) {
    let nearby = 0;
    const cell = this.cellCoordinates(position);
    for (let x = cell.x - 1; x <= cell.x + 1; x++) {
      for (let y = cell.y - 1; y <= cell.y + 1; y++) {
        for (let z = cell.z - 1; z <= cell.z + 1; z++) {
          const nodes = this.spatialGrid.get(`${x},${y},${z}`) || [];
          for (const node of nodes) {
            if (node === parent) continue;
            const distance = position.distanceTo(node.position);
            if (distance < parametros.distanciaMinima) return true;
            if (distance < parametros.radioDensidad) nearby += 1;
          }
        }
      }
    }
    return nearby >= parametros.limiteDensidad;
  }

  updateGeometry() {
    const positions = new Float32Array(this.branches.length * 6);
    const colors = new Float32Array(this.branches.length * 6);
    this.branches.forEach((branch, index) => {
      const offset = index * 6;
      branch.start.position.toArray(positions, offset);
      branch.end.position.toArray(positions, offset + 3);
      branch.color.toArray(colors, offset);
      branch.color.toArray(colors, offset + 3);
    });
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.geometry.computeBoundingSphere();
  }

  colorForBranchLevel(branchLevel) {
    const palette = [0x260101, 0x590202, 0xd91a1a, 0xf26a1b, 0x049dbf];
    return new THREE.Color(palette[Math.min(branchLevel, palette.length - 1)]);
  }

  createSeedCloud() {
    const positions = [];
    const minimumDistance = 1.8;

    for (let index = 0; index < parametros.cantidadOrganismos; index++) {
      let candidate = new THREE.Vector3();
      for (let attempt = 0; attempt < 30; attempt++) {
        const radius = Math.cbrt(this.random(index + 1, attempt, 70)) * parametros.radioNube;
        const angle = this.random(index + 1, attempt, 71) * Math.PI * 2;
        candidate.set(
          Math.cos(angle) * radius,
          this.random(index + 1, attempt, 72) * parametros.radioNube * 0.65,
          Math.sin(angle) * radius
        );
        if (positions.every((position) => position.distanceTo(candidate) >= minimumDistance)) break;
      }
      positions.push(candidate.clone());
    }
    return positions;
  }

  updateRootPoints(positions) {
    const coordinates = new Float32Array(positions.length * 3);
    positions.forEach((position, index) => position.toArray(coordinates, index * 3));
    this.rootGeometry.setAttribute("position", new THREE.BufferAttribute(coordinates, 3));
    this.rootGeometry.computeBoundingSphere();
  }

  cellCoordinates(position) {
    const size = parametros.radioDensidad;
    return {
      x: Math.floor(position.x / size),
      y: Math.floor(position.y / size),
      z: Math.floor(position.z / size),
    };
  }

  gridKey(position) {
    const cell = this.cellCoordinates(position);
    return `${cell.x},${cell.y},${cell.z}`;
  }

  random(a, b, c) {
    const value = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + parametros.semilla * 19.19) * 43758.5453;
    return value - Math.floor(value);
  }

  randomSigned(a, b, c) {
    return this.random(a, b, c) * 2 - 1;
  }
}

// 04 — Interfaz.
const controles = {
  crecimiento: document.querySelector("#crecimiento"),
  variacion: document.querySelector("#variacion"),
  cantidadOrganismos: document.querySelector("#cantidadOrganismos"),
  semilla: document.querySelector("#semilla"),
};
const valoresVisibles = {
  crecimiento: document.querySelector("#crecimiento-valor"),
  variacion: document.querySelector("#variacion-valor"),
  cantidadOrganismos: document.querySelector("#cantidadOrganismos-valor"),
};

let organismo;

function updateStats() {
  if (!organismo) return;
  document.querySelector("#generacion-valor").textContent = organismo.generation;
  document.querySelector("#nodos-valor").textContent = organismo.nodes.length;
  document.querySelector("#ramas-valor").textContent = organismo.activeBranches.length;
}

organismo = new Organism(escena);
updateStats();

Object.entries(controles).forEach(([nombre, control]) => {
  control.addEventListener("input", (event) => {
    parametros[nombre] = nombre === "semilla" || nombre === "cantidadOrganismos"
      ? Math.max(1, Number.parseInt(event.target.value, 10) || 1)
      : Number.parseFloat(event.target.value);
    if (valoresVisibles[nombre]) {
      valoresVisibles[nombre].value = nombre === "cantidadOrganismos"
        ? parametros[nombre]
        : parametros[nombre].toFixed(2);
    }
    if (nombre === "cantidadOrganismos") organismo.reset();
  });
});

document.querySelector("#crecer").addEventListener("click", () => { organismo.running = true; });
document.querySelector("#pausa").addEventListener("click", () => { organismo.running = false; });
document.querySelector("#reiniciar").addEventListener("click", () => {
  controles.semilla.value = parametros.semilla;
  organismo.reset();
});

// 05 — Bucle de animación y crecimiento progresivo.
function animar(time) {
  requestAnimationFrame(animar);
  if (organismo.running && time - organismo.lastGrowthTime >= parametros.intervaloCrecimiento) {
    organismo.grow();
    organismo.lastGrowthTime = time;
  }
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
requestAnimationFrame(animar);
