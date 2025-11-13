import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// === 1. CONFIGURACIÓN BÁSICA DE LA ESCENA ===

let scene, camera, renderer, controls;
let loadingManager;

// Materiales que usaremos
const buildingMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });

// Paleta de colores para los transportes
const transportMaterials = {
  'aparcamiento publico': new THREE.MeshBasicMaterial({ color: 0x0099ff, toneMapped: false }), // Azul brillante
  'transporte guagua': new THREE.MeshBasicMaterial({ color: 0xffcc00, toneMapped: false }), // Amarillo brillante
  'transporte sociosanitario': new THREE.MeshBasicMaterial({ color: 0xff3300, toneMapped: false }), // Rojo brillante
  'transporte taxi': new THREE.MeshBasicMaterial({ color: 0x00cc33, toneMapped: false }), // Verde brillante
  'default': new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }) // Blanco (para el resto)
};

// Geometría para los marcadores (pines)
const transportGeometry = new THREE.SphereGeometry(0.8, 16, 16); // Esferas pequeñas

// === 2. FUNCIONES PRINCIPALES ===

function init() {
  // Escena
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);
  scene.fog = new THREE.Fog(0x222222, 100, 400);

  // Cámara
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 100, 100);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Luces
  const ambientLight = new THREE.AmbientLight(0xaaaaaa, 1.0);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
  directionalLight.position.set(50, 100, 50);
  scene.add(directionalLight);
  
  // Controles (para el vídeo)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Suelo (Opcional, pero ayuda)
  const grid = new THREE.GridHelper(500, 50, 0x555555, 0x333333);
  scene.add(grid);
  
  // === 3. MANEJADOR DE CARGA ===
  // (Para ocultar el "Cargando..." cuando todo esté listo)
  loadingManager = new THREE.LoadingManager();
  loadingManager.onLoad = () => {
    console.log("¡Carga completa!");
    document.getElementById('loader-overlay').style.display = 'none';
  };

  // === 4. LÓGICA DE CARGA DE DATOS ===

  // ¡IMPORTANTE! Ajusta esto al centro del mapa que exportaste

    // ¡IMPORTANTE! Ajusta esto al centro del mapa que exportaste
  const CENTER_LON = -16.267447; // 👈 TU LONGITUD
  const CENTER_LAT = 28.463825; // 👈 TU LATITUD

  // Función de proyección (Mercator simple)
  function project(lon, lat) {
    const scale = 10000;
    const x = (lon - CENTER_LON) * scale;
    const z = (lat - CENTER_LAT) * scale;
    return new THREE.Vector2(x, -z); // Invertimos Z
  }

  // Cargador de archivos
  const loader = new THREE.FileLoader(loadingManager);

  // --- Cargar Edificios (Paso A) ---
  loader.load(
    "./Resources/export.geojson", // El archivo de edificios de Overpass
    (data) => {
      console.log("Edificios cargados");
      const buildings = JSON.parse(data);
      
      buildings.features.forEach(feature => {
        const geom = feature.geometry;
        if (geom.type === 'Polygon') {
          drawBuilding(geom.coordinates);
        } else if (geom.type === 'MultiPolygon') {
          geom.coordinates.forEach(polygonCoords => {
            drawBuilding(polygonCoords);
          });
        }
      });
    },
    (xhr) => console.log(`Cargando edificios: ${(xhr.loaded / xhr.total * 100)}%`),
    (err) => console.error('Error cargando edificios:', err)
  );

  // --- Cargar Puntos de Transporte (Paso B) ---
  // Cambia 'transporte_tenerife.geojson' por el nombre de tu archivo si es diferente
  loader.load(
    "./Resources/empresas-e-infraestructuras-relacionadas-con-el-transporte-en-tenerife.json", // ¡TU ARCHIVO DE TRANSPORTE!
    (data) => {
      console.log("Transporte cargado");
      const transport = JSON.parse(data);

      transport.features.forEach(feature => {
        // Solo procesamos puntos
        if (feature.geometry && feature.geometry.type === 'Point') {
          const [lon, lat] = feature.geometry.coordinates;
          
          // Proyectamos a (x, z)
          const pos = project(lon, lat);

          // Buscamos el material/color correcto
          const tipo = feature.properties.actividad_tipo;
          let material = transportMaterials[tipo] || transportMaterials['default'];
          
          // Creamos el marcador (pin)
          const marker = new THREE.Mesh(transportGeometry, material);
          
          // Posicionamos el pin
          // pos.x es el eje X, pos.y (del Vector2) es nuestro eje Z
          marker.position.set(pos.x, 20, pos.y); // Flotando a 20m de altura
          
          scene.add(marker);
        }
      });
    },
    (xhr) => console.log(`Cargando transporte: ${(xhr.loaded / xhr.total * 100)}%`),
    (err) => console.error('Error cargando transporte:', err)
  );
  
  // Función helper para dibujar un edificio
  function drawBuilding(coordsArray) {
    const points = [];
    const exterior = coordsArray[0]; // El contorno exterior
    
    for (let i = 0; i < exterior.length; i++) {
      const [lon, lat] = exterior[i];
      points.push(project(lon, lat));
    }

    const shape = new THREE.Shape(points);

    // Añadir "agujeros" (patios interiores), si los hay
    if (coordsArray.length > 1) {
      for (let j = 1; j < coordsArray.length; j++) {
        const holePoints = [];
        const interior = coordsArray[j];
        for (let k = 0; k < interior.length; k++) {
          const [lon, lat] = interior[k];
          holePoints.push(project(lon, lat));
        }
        const holeShape = new THREE.Shape(holePoints);
        shape.holes.push(holeShape);
      }
    }
    
    // Configuración de extrusión (altura)
    const extrudeSettings = {
      depth: Math.random() * 10 + 5, // Altura aleatoria entre 5 y 15m
      bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const mesh = new THREE.Mesh(geometry, buildingMaterial);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
  }

  // Manejador de redimensión de ventana
  window.addEventListener('resize', onWindowResize, false);
}

// Loop de animación
function animate() {
  requestAnimationFrame(animate);
  controls.update(); // Actualizar controles
  renderer.render(scene, camera);
}

// Función para ajustar la cámara al tamaño de la ventana
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// === 5. EJECUTAR EL CÓDIGO ===
init();
animate();