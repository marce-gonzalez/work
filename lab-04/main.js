import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ============================================================
// SISTEMA COLECTIVO
// 1 = conectar / comunicar
// 2 = representar
// 3 = agregar variables
// 4 = colaborar
// ============================================================
const ETAPA = 4;

const BROKER = "wss://s0565630.ala.us-east-1.emqxsl.com:8084/mqtt";
const USUARIO = "mcd-prueba";
const TOPIC_BASE = "uai/mcd/2026/sistema-colectivo";
const TOPIC_SUSCRIPCION = `${TOPIC_BASE}/+/estado`;

document.querySelector("#etapa-actual").textContent = ETAPA;
document.querySelectorAll("[data-etapa]").forEach(s => s.hidden = Number(s.dataset.etapa) > ETAPA);

const nombreInput = document.querySelector("#nombre");
const contrasenaInput = document.querySelector("#contrasena");
const botonConectar = document.querySelector("#boton-conectar");
const estadoPunto = document.querySelector("#estado-punto");
const estadoTexto = document.querySelector("#estado-texto");
const clienteIdTexto = document.querySelector("#cliente-id");
document.querySelector("#topic-suscripcion").textContent = TOPIC_SUSCRIPCION;

const intensidad = document.querySelector("#intensidad");
const intensidadSalida = document.querySelector("#intensidad-salida");
const intensidad2 = document.querySelector("#intensidad-2");
const intensidadSalida2 = document.querySelector("#intensidad-salida-2");
const actividad = document.querySelector("#actividad");
const actividadSalida = document.querySelector("#actividad-salida");
const variacion = document.querySelector("#variacion");
const variacionSalida = document.querySelector("#variacion-salida");

let cliente, clientId, nombre, topicPublicacion;
const miEstado = { intensidad: 50, actividad: 50, variacion: 50 };
const nodos = new Map();

botonConectar.addEventListener("click", conectar);

function conectar() {
  nombre = nombreInput.value.trim();
  const contrasena = contrasenaInput.value;
  if (!nombre || !contrasena) return cambiarEstadoConexion("error", "Falta nombre o contraseña");

  const slug = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,24) || "usuario";
  const idCorto = Math.random().toString(16).slice(2,6).toUpperCase();
  clientId = `navegador-${slug}-${idCorto}`;
  topicPublicacion = `${TOPIC_BASE}/${clientId}/estado`;
  clienteIdTexto.textContent = clientId;

  nombreInput.disabled = contrasenaInput.disabled = botonConectar.disabled = true;
  cambiarEstadoConexion("conectando","Conectando…");

  cliente = window.mqtt.connect(BROKER,{clientId,username:USUARIO,password:contrasena,reconnectPeriod:2000,connectTimeout:10000,clean:true});

  cliente.on("connect",()=>{
    cambiarEstadoConexion("conectado","Conectado a EMQX");
    botonConectar.textContent = "Conectado ✓";
    botonConectar.classList.add("conectado");
    intensidad.disabled = false;
    if (ETAPA >= 3) intensidad2.disabled = actividad.disabled = variacion.disabled = false;
    cliente.subscribe(TOPIC_SUSCRIPCION, error => {
      if (error) return console.error("Error al suscribirse:", error);
      publicarEstado();
    });
  });

  cliente.on("message",(topic,payload)=>procesarMensaje(payload));
  cliente.on("reconnect",()=>cambiarEstadoConexion("conectando","Reconectando…"));
  cliente.on("offline",()=>cambiarEstadoConexion("error","Sin conexión"));
  cliente.on("error",error=>{console.error(error);cambiarEstadoConexion("error","Error de conexión");});
}

intensidad.addEventListener("input",()=>{
  miEstado.intensidad=Number(intensidad.value);
  intensidadSalida.value=miEstado.intensidad;
  intensidad2.value=miEstado.intensidad;
  intensidadSalida2.value=miEstado.intensidad;
  publicarEstado();
});
intensidad2.addEventListener("input",()=>{
  miEstado.intensidad=Number(intensidad2.value);
  intensidadSalida2.value=miEstado.intensidad;
  intensidad.value=miEstado.intensidad;
  intensidadSalida.value=miEstado.intensidad;
  publicarEstado();
});
actividad.addEventListener("input",()=>{miEstado.actividad=Number(actividad.value);actividadSalida.value=miEstado.actividad;publicarEstado();});
variacion.addEventListener("input",()=>{miEstado.variacion=Number(variacion.value);variacionSalida.value=miEstado.variacion;publicarEstado();});

function publicarEstado(){
  if(!cliente?.connected)return;
  const mensaje={nombre,clientId,intensidad:miEstado.intensidad,actividad:ETAPA>=3?miEstado.actividad:50,variacion:ETAPA>=3?miEstado.variacion:50,timestamp:Date.now()};
  cliente.publish(topicPublicacion,JSON.stringify(mensaje),{qos:0,retain:false});
}

function procesarMensaje(payload){
  try{
    const m=JSON.parse(payload.toString());
    const hora=new Date(m.timestamp||Date.now()).toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    document.querySelector("#ultimo-intensidad").textContent=m.intensidad;
    document.querySelector("#ultimo-nombre").textContent=m.nombre||"Sin nombre";
    document.querySelector("#ultimo-hora").textContent=hora;
    document.querySelector("#ultimo-json").textContent=JSON.stringify(m,null,2);
    nodos.set(m.clientId,m);
    actualizarCubo(m);
    actualizarColectivo();
  }catch(e){console.error("Mensaje inválido:",e);}
}

let cubo, rendererSimple, escenaSimple, camaraSimple, controlesSimple;
if(ETAPA>=2) iniciarEscenaSimple();

function iniciarEscenaSimple(){
  const c=document.querySelector("#escena-simple");
  escenaSimple=new THREE.Scene(); escenaSimple.background=new THREE.Color(0x0b0b0c);
  camaraSimple=new THREE.PerspectiveCamera(42,c.clientWidth/c.clientHeight,.1,100); camaraSimple.position.set(5,4,6);
  rendererSimple=new THREE.WebGLRenderer({antialias:true}); rendererSimple.setPixelRatio(Math.min(devicePixelRatio,2)); rendererSimple.setSize(c.clientWidth,c.clientHeight); c.appendChild(rendererSimple.domElement);
  controlesSimple=new OrbitControls(camaraSimple,rendererSimple.domElement); controlesSimple.enableDamping=true;
  escenaSimple.add(new THREE.HemisphereLight(0xffffff,0x22252b,2));
  const luz=new THREE.DirectionalLight(0xffffff,2.5); luz.position.set(5,8,4); escenaSimple.add(luz);
  cubo=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial({color:0xd8d2c4,roughness:.55})); escenaSimple.add(cubo);
  animarSimple();
}

function actualizarCubo(m){
  if(!cubo)return;
  const i=THREE.MathUtils.clamp(m.intensidad/100,0,1), a=THREE.MathUtils.clamp((m.actividad??50)/100,0,1), v=THREE.MathUtils.clamp((m.variacion??50)/100,0,1);

  if(ETAPA===2){
    // REGLA 01: intensidad → escala
    cubo.scale.setScalar(THREE.MathUtils.lerp(.45,2.2,i));
    return;
  }

  // REGLAS DE REPRESENTACIÓN
  // intensidad → escala
  // actividad  → rotación
  // variación  → color
  const escala=THREE.MathUtils.lerp(.55,2,i);
  const rotacion=a*Math.PI*2;
  const tono=THREE.MathUtils.lerp(.08,.62,v);
  cubo.scale.setScalar(escala);
  cubo.rotation.y=rotacion;
  cubo.material.color.setHSL(tono,.45,.68);

  // EXPERIMENTO:
  // prueba intercambiar qué variable controla escala, rotación o color.
}

function animarSimple(){
  requestAnimationFrame(animarSimple);
  controlesSimple.update();
  if(cubo&&ETAPA>=3)cubo.rotation.x+=.002;
  rendererSimple.render(escenaSimple,camaraSimple);
}

let escenaColectiva, rendererColectivo, camaraColectiva, controlesColectivo, grupoNodos, esferaCentral;
if(ETAPA>=4) iniciarColectivo();

function iniciarColectivo(){
  const c=document.querySelector("#escena-colectiva");
  escenaColectiva=new THREE.Scene(); escenaColectiva.background=new THREE.Color(0x0b0b0c);
  camaraColectiva=new THREE.PerspectiveCamera(42,c.clientWidth/c.clientHeight,.1,200); camaraColectiva.position.set(12,10,14);
  rendererColectivo=new THREE.WebGLRenderer({antialias:true}); rendererColectivo.setPixelRatio(Math.min(devicePixelRatio,2)); rendererColectivo.setSize(c.clientWidth,c.clientHeight); c.appendChild(rendererColectivo.domElement);
  controlesColectivo=new OrbitControls(camaraColectiva,rendererColectivo.domElement); controlesColectivo.enableDamping=true; controlesColectivo.target.set(0,2,0);
  escenaColectiva.add(new THREE.HemisphereLight(0xffffff,0x22252b,2));
  const luz=new THREE.DirectionalLight(0xffffff,2.5); luz.position.set(8,14,8); escenaColectiva.add(luz);
  grupoNodos=new THREE.Group(); escenaColectiva.add(grupoNodos);
  esferaCentral=new THREE.Mesh(new THREE.SphereGeometry(1.2,32,20),new THREE.MeshStandardMaterial({color:0xd8d2c4,roughness:.5})); esferaCentral.position.y=2; escenaColectiva.add(esferaCentral);
  animarColectivo();
}

function actualizarColectivo(){
  if(!grupoNodos)return;
  while(grupoNodos.children.length){const o=grupoNodos.children[0];o.geometry?.dispose();o.material?.dispose();grupoNodos.remove(o);}
  const lista=[...nodos.values()], total=lista.length;
  if(!total)return;
  const radio=Math.max(4.5,total*.42);

  lista.forEach((n,idx)=>{
    const angulo=(idx/total)*Math.PI*2, i=n.intensidad/100, a=(n.actividad??50)/100, v=(n.variacion??50)/100;
    const altura=THREE.MathUtils.lerp(.8,6.5,i);
    const modulo=new THREE.Mesh(
      new THREE.BoxGeometry(.65,altura,.65),
      new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(THREE.MathUtils.lerp(.08,.62,v),.45,.66),roughness:.55})
    );
    modulo.position.set(Math.cos(angulo)*radio,altura/2,Math.sin(angulo)*radio);
    modulo.rotation.y=a*Math.PI*2;
    grupoNodos.add(modulo);
  });

  const vals=lista.map(n=>n.intensidad), promedio=vals.reduce((a,b)=>a+b,0)/vals.length;
  document.querySelector("#m-nodos").textContent=lista.length;
  document.querySelector("#m-promedio").textContent=promedio.toFixed(1);
  document.querySelector("#m-minimo").textContent=Math.min(...vals);
  document.querySelector("#m-maximo").textContent=Math.max(...vals);
  esferaCentral.scale.setScalar(THREE.MathUtils.lerp(.7,2.2,promedio/100));

  const cont=document.querySelector("#nodos-lista"); cont.innerHTML="";
  lista.forEach(n=>{const fila=document.createElement("div");fila.className="nodo";fila.innerHTML=`<span>${n.nombre}</span><strong>${n.intensidad}</strong><strong>${n.actividad}</strong><strong>${n.variacion}</strong>`;cont.appendChild(fila);});
}

function animarColectivo(){
  requestAnimationFrame(animarColectivo);
  controlesColectivo.update();
  grupoNodos.rotation.y+=.0015;
  rendererColectivo.render(escenaColectiva,camaraColectiva);
}

window.addEventListener("resize",()=>{
  for(const [sel,cam,ren] of [["#escena-simple",camaraSimple,rendererSimple],["#escena-colectiva",camaraColectiva,rendererColectivo]]){
    const c=document.querySelector(sel); if(!c||!cam||!ren)continue;
    cam.aspect=c.clientWidth/c.clientHeight; cam.updateProjectionMatrix(); ren.setSize(c.clientWidth,c.clientHeight);
  }
});

function cambiarEstadoConexion(tipo,texto){
  estadoPunto.className="estado-punto";
  if(tipo)estadoPunto.classList.add(tipo);
  estadoTexto.textContent=texto;
}
