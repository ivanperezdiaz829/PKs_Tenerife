import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

// --- Variables Globales ---
let scene, camera, renderer, controls;
let loadingManager;
let canvasContainer, sidebarContent, legendContainer;
let clickablePointsGroup;
let raycaster, mouse;
let hoveredMarkerGroup = null;
let selectedMarkerGroup = null;
let activeLegendItem = null;

// --- Variables para Redimensionar Paneles ---
let sidebarLeftElement; 
let legendContainerElement;

// --- Coordenadas Geográficas ---
const minLat = 28.44586;
const minLon = -16.29212;
const maxLat = 28.47906;
const maxLon = -16.23548;
const CENTER_LON = (minLon + maxLon) / 2; 
const CENTER_LAT = (minLat + maxLat) / 2;
const MAP_PLANE_HEIGHT = 500; 

// --- Paleta de colores ---
const transportMaterials = {
  'aparcamiento publico': new THREE.MeshBasicMaterial({ color: 0x0099ff, toneMapped: false, fog: false }),
  'transporte guagua': new THREE.MeshBasicMaterial({ color: 0xffcc00, toneMapped: false, fog: false }),
  'transporte sociosanitario': new THREE.MeshBasicMaterial({ color: 0xff3300, toneMapped: false, fog: false }),
  'transporte taxi': new THREE.MeshBasicMaterial({ color: 0x00cc33, toneMapped: false, fog: false }),
  'otros': new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false })
};

// --- Material para el Borde de los círculos ---
const outlineMaterial = new THREE.MeshBasicMaterial({ 
  color: 0x000000,  
});

// --- Geometrías ---
const MARKER_RADIUS = 2;
const transportGeometry = new THREE.CircleGeometry(MARKER_RADIUS, 32);
const outlineGeometry = new THREE.CircleGeometry(MARKER_RADIUS * 1.2, 32);

function init() {
  // --- Referencias al DOM ---
  canvasContainer = document.getElementById('canvas-container');
  sidebarContent = document.getElementById('sidebar-content'); // El div *interno*
  legendContainer = document.getElementById('legend-container'); // El panel completo

  // Referencias a los paneles completos
  sidebarLeftElement = document.getElementById('sidebar-left');
  legendContainerElement = document.getElementById('legend-container'); 

  // Escena
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  // Cámara
  const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
  camera = new THREE.OrthographicCamera(
    MAP_PLANE_HEIGHT * aspect / -2, MAP_PLANE_HEIGHT * aspect / 2,
    MAP_PLANE_HEIGHT / 2, MAP_PLANE_HEIGHT / -2,
    1, 1000
  );
  camera.position.set(0, 100, 0); 
  camera.up.set(0, 0, -1); 
  camera.lookAt(0, 0, 0);
  scene.add(camera);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  canvasContainer.appendChild(renderer.domElement); 

  // Luces
  const ambientLight = new THREE.AmbientLight(0xaaaaaa, 1.0);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
  directionalLight.position.set(50, 100, 50);
  scene.add(directionalLight);

  // Controles
  controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true; 
  controls.dampingFactor = 0.05;
  controls.enableRotate = false;
  controls.screenSpacePanning = true; 

  // Raycasting
  clickablePointsGroup = new THREE.Group();
  scene.add(clickablePointsGroup);
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Event Listeners
  renderer.domElement.addEventListener('click', onPointClick);
  renderer.domElement.addEventListener('mousemove', onMouseMove);

  // LÓGICA PARA PANELES
  setupPanelControls();

  // Carga el LoadingManager
  loadingManager = new THREE.LoadingManager();
  loadingManager.onLoad = () => {
    console.log("¡Carga completa!");
    document.getElementById('loader-overlay').style.display = 'none';
    onWindowResize(); 
  };

  // Carga la Textura del Mapa
  const textureLoader = new THREE.TextureLoader(loadingManager);
  textureLoader.load(
    './Resources/mapa.png',
    (mapTexture) => {
      // Calcula dimensiones
      const imageAspect = mapTexture.image.width / mapTexture.image.height;
      camera.userData.imageAspect = imageAspect;
      const planeHeight = MAP_PLANE_HEIGHT;
      const planeWidth = planeHeight * imageAspect; 
      camera.userData.planeHeight = planeHeight;
      camera.userData.planeWidth = planeWidth;
  
      // Crea el plano del mapa
      const groundGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight); 
      const groundMaterial = new THREE.MeshLambertMaterial({ map: mapTexture, side: THREE.DoubleSide });
      const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.name = "mapGround"; 
      scene.add(groundMesh);

       // --- LÓGICA DE PROYECCIÓN MERCATOR ---
       function projectLatToY(lat) {
        const rad = lat * Math.PI / 180;
        return Math.log(Math.tan((Math.PI / 4) + (rad / 2)));
       }
       function projectLonToX(lon) { return lon; }
       const mercatorMinY = projectLatToY(minLat);
       const mercatorMaxY = projectLatToY(maxLat);
       const mercatorCenterY = projectLatToY(CENTER_LAT);
       const geographicMinX = projectLonToX(minLon);
       const geographicMaxX = projectLonToX(maxLon);
       const geographicCenterX = projectLonToX(CENTER_LON);
       const geographicWidth = geographicMaxX - geographicMinX;
       const mercatorHeight = mercatorMaxY - mercatorMinY;
       const scaleFactorX = planeWidth / geographicWidth;
       const scaleFactorZ = planeHeight / mercatorHeight;

       function project(lon, lat) {
        const x_geo = projectLonToX(lon);
        const x = (x_geo - geographicCenterX) * scaleFactorX;
        const z_mercator = projectLatToY(lat);
        const z = (z_mercator - mercatorCenterY) * scaleFactorZ;
        return new THREE.Vector2(x, -z);
       }

       // --- Cargar los Puntos JSON ---
       const loader = new THREE.FileLoader(loadingManager);
       loader.load(
        "./Resources/empresas-e-infraestructuras-relacionadas-con-el-transporte-en-tenerife.json",
        (dataTransport) => {
          console.log("Transporte cargado");
          const transport = JSON.parse(dataTransport);
      
          transport.features.forEach(feature => {
            if (feature.geometry && feature.geometry.type === 'Point' && feature.geometry.coordinates && feature.properties) {
              const [lon, lat] = feature.geometry.coordinates;
              if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
                const pos = project(lon, lat); 
                const rawType = feature.properties.actividad_tipo;
                const tipo = transportMaterials[rawType] ? rawType : 'otros';
                const markerMaterial = transportMaterials[tipo];

                const markerGroup = new THREE.Group();

                const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
                outline.rotation.x = -Math.PI / 2;
                markerGroup.add(outline);

                const marker = new THREE.Mesh(transportGeometry, markerMaterial);
                marker.rotation.x = -Math.PI / 2;
                marker.position.y = 0.1;
                markerGroup.add(marker);

                markerGroup.position.set(pos.x, 0.1, pos.y);

                markerGroup.userData.type = tipo;
                markerGroup.userData.properties = feature.properties;

                clickablePointsGroup.add(markerGroup);
              }
            }
          });
       },
       (xhr) => console.log(`Cargando datos...`),
       (err) => console.error('Error cargando transporte:', err)
       ); 
    },
    (err) => {
      console.error('Error al cargar la textura del suelo.', err);
      const grid = new THREE.GridHelper(500, 50, 0x555555, 0x333333);
      scene.add(grid);
      document.getElementById('loader-overlay').style.display = 'none';
    }
  );

  createLegend();
}

// --- Lógica para los paneles ---
function setupPanelControls() {
  const toggleLeft = document.getElementById('toggle-left');
  const toggleRight = document.getElementById('toggle-right');
  const resizerLeft = document.getElementById('resizer-left');
  const resizerRight = document.getElementById('resizer-right');

  // --- Lógica de Colapsar ---
  toggleLeft.addEventListener('click', () => {
    sidebarLeftElement.classList.toggle('collapsed');
    toggleLeft.innerHTML = sidebarLeftElement.classList.contains('collapsed') ? '»' : '«';
    onWindowResize(); // recalcular canvas
  });

  toggleRight.addEventListener('click', () => {
    legendContainerElement.classList.toggle('collapsed');
    toggleRight.innerHTML = legendContainerElement.classList.contains('collapsed') ? '«' : '»';
    onWindowResize(); // recalcular canvas
  });

  // --- Lógica de Redimensionar ---
  function initResizer(resizer, sidebar, direction) {
    let startX, startWidth;

    function doDrag(e) {
      e.preventDefault();
      let newWidth;
      if (direction === 'left') {
        newWidth = startWidth + (e.clientX - startX);
      } else { // right
        newWidth = startWidth - (e.clientX - startX);
      }

      if (newWidth > 150 && newWidth < 600) {
        sidebar.style.flexBasis = newWidth + 'px';
      }
    }

    function stopDrag() {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
      onWindowResize(); 
    }

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = parseInt(document.defaultView.getComputedStyle(sidebar).flexBasis, 10);
      document.addEventListener('mousemove', doDrag);
      document.addEventListener('mouseup', stopDrag);
    });
  }

  initResizer(resizerLeft, sidebarLeftElement, 'left');
  initResizer(resizerRight, legendContainerElement, 'right');
}

function filterPoints(dataType, clickedElement) {
  if (activeLegendItem) {
    activeLegendItem.classList.remove('active');
  }
  clickedElement.classList.add('active');
  activeLegendItem = clickedElement;

  // Deselecciona el punto si se cambia el filtro
  if (selectedMarkerGroup) {
    selectedMarkerGroup.scale.set(1, 1, 1);
    selectedMarkerGroup = null;
  }
  updateSidebar(null); // Limpia el sidebar

  clickablePointsGroup.children.forEach(markerGroup => {
    if (dataType === 'all' || markerGroup.userData.type === dataType) {
      markerGroup.visible = true;
    } else {
      markerGroup.visible = false;
    }
  });
}

// --- Control con el ratón ---
function onMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const visibleChildren = clickablePointsGroup.children.filter(child => child.visible);
  const intersects = raycaster.intersectObjects(visibleChildren, true);

  if (intersects.length > 0) {
    let intersectedObject = intersects[0].object;
    while (intersectedObject.parent && !intersectedObject.userData.properties) {
      intersectedObject = intersectedObject.parent;
    }
    if (hoveredMarkerGroup !== intersectedObject) {
      // Restaura la escala del hover anterior (si no está seleccionado)
      if (hoveredMarkerGroup && hoveredMarkerGroup !== selectedMarkerGroup) {
        hoveredMarkerGroup.scale.set(1, 1, 1);
      }
      hoveredMarkerGroup = intersectedObject;
      // Escala de hover (más grande para diferenciar)
      hoveredMarkerGroup.scale.set(2.25, 2.25, 2.25); 
      document.body.style.cursor = 'pointer';
    }
  } else {
    // Si se quita el hover (y no está seleccionado)
    if (hoveredMarkerGroup && hoveredMarkerGroup !== selectedMarkerGroup) {
      hoveredMarkerGroup.scale.set(1, 1, 1);
    }
    hoveredMarkerGroup = null;
    document.body.style.cursor = 'default';
  }
}

// --- Controles al pulsar ---
function onPointClick(event) {
  raycaster.setFromCamera(mouse, camera);
  const visibleChildren = clickablePointsGroup.children.filter(child => child.visible);
  const intersects = raycaster.intersectObjects(visibleChildren, true);

  if (intersects.length > 0) {
    let intersectedObject = intersects[0].object;
    while (intersectedObject.parent && !intersectedObject.userData.properties) {
      intersectedObject = intersectedObject.parent;
    }

    if (intersectedObject.userData.properties) {
      // Deselecciona el anterior (si existe)
      if (selectedMarkerGroup) {
        selectedMarkerGroup.scale.set(1, 1, 1);
      }

      // Establece el nuevo seleccionado
      selectedMarkerGroup = intersectedObject;
      selectedMarkerGroup.scale.set(2.25, 2.25, 2.25); // Escala de selección
      
      updateSidebar(selectedMarkerGroup); // Pasa el objeto entero
    }
  } else {
    /* Si se hace clic fuera, deselecciona
    if (selectedMarkerGroup) {
      selectedMarkerGroup.scale.set(1, 1, 1);
      selectedMarkerGroup = null;
    }
    updateSidebar(null); // Pasa null para limpiar */
  }
}

// --- Actualización de las barras laterales ---
function updateSidebar(markerObject) {
  // Si es null, limpia el sidebar y sale
  if (!markerObject) {
    sidebarContent.innerHTML = '<div id="sidebar-placeholder">Haz clic en un punto del mapa para ver su información.</div>';
    return;
  }

  const data = markerObject.userData;
  const position = markerObject.position; // Obtener la posición
  const props = data.properties;
  const type = data.type; 
  const name = props.nombre || props.actividad_tipo || "Elemento sin nombre";

  // Añade el botón de centrar
  let html = `<h3>${name}</h3>`;
  html += `<button id="center-on-point" class="sidebar-button">Centrar en el mapa</button>`;

  const typeLabel = (type === 'otros') ? 'Otros' : type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  html += `<div class="info-item"><strong>Tipo</strong> ${typeLabel}</div>`;

  let fullAddress = "";
  if (props.tipo_via_descripcion) fullAddress += props.tipo_via_descripcion + " ";
  if (props.direccion_nombre_via) fullAddress += props.direccion_nombre_via;
  if (props.direccion_numero && props.direccion_numero.toLowerCase() !== 'sn') {
    fullAddress += ", " + props.direccion_numero;
  }
  if (fullAddress) html += `<div class="info-item"><strong>Dirección</strong> ${fullAddress}</div>`;
  let location = "";
  if (props.municipio_nombre) location += props.municipio_nombre;
  if (props.direccion_codigo_postal) location += ` (${props.direccion_codigo_postal})`;
  if (location) html += `<div class="info-item"><strong>Ubicación</strong> ${location}</div>`;
  if (props.referencia) html += `<div class="info-item"><strong>Referencia</strong> ${props.referencia}</div>`;
  if (props.telefono) html += `<div class="info-item"><strong>Teléfono</strong> <a href="tel:${props.telefono}">${props.telefono}</a></div>`;
  if (props.email) html += `<div class="info-item"><strong>Email</strong> <a href="mailto:${props.email}">${props.email}</a></div>`;
  if (props.web) {
    const webLink = props.web.startsWith('http') ? props.web : `http://${props.web}`;
    html += `<div class="info-item"><strong>Web</strong> <a href="${webLink}" target="_blank" rel="noopener noreferrer">${props.web}</a></div>`;
  }
  if (props.fax) html += `<div class="info-item"><strong>Fax</strong> ${props.fax}</div>`;
  if (props.fecha_actualizacion) {
    const date = new Date(props.fecha_actualizacion);
    const formattedDate = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  html += `<div class="info-item" style="margin-top: 15px; border-top: 1px solid #333; padding-top: 8px; font-size: 0.8em; color: #777;">
            <strong>Última actualización</strong> ${formattedDate}
            </div>`;
  }

  sidebarContent.innerHTML = html;

  // Añade el listener al botón DESPUÉS de inyectar el HTML
  const centerButton = document.getElementById('center-on-point');
  if (centerButton) {
    centerButton.addEventListener('click', () => centerOnSelectedPoint(position));
    content 
  }
}

// --- Controles para el botón de centrado ---
function centerOnSelectedPoint(targetPosition) {
  controls.target.copy(targetPosition);

  // Mueve la cámara para que esté directamente encima del nuevo objetivo
  // Mantenemos la altura actual de la cámara (posición Y)
  camera.position.x = targetPosition.x;
  camera.position.z = targetPosition.z;

  controls.update();
}

function createLegend() {
  const legendContent = document.getElementById('legend-content');
  const allButton = document.createElement('div');
  allButton.className = 'legend-item all-button active'; 
  allButton.innerHTML = '<span>Mostrar Todos</span>';
  allButton.addEventListener('click', () => filterPoints('all', allButton));
  legendContent.appendChild(allButton);
  activeLegendItem = allButton; 
  for (const key in transportMaterials) {
    if (Object.prototype.hasOwnProperty.call(transportMaterials, key)) {
      const material = transportMaterials[key];
      const colorHex = '#' + material.color.getHexString();
      let label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.dataset.type = key; 
      item.innerHTML = `
        <span class="color-swatch" style="background-color: ${colorHex};"></span>
        <span>${label}</span>
      `;
      item.addEventListener('click', () => filterPoints(key, item));
      legendContent.appendChild(item);
    }
  }
}

function onWindowResize() {
  if (!canvasContainer || !renderer || !camera) return;

  const containerWidth = canvasContainer.clientWidth;
  const containerHeight = canvasContainer.clientHeight;
  const aspect = containerWidth / containerHeight;

  const frustumHeightToUse = camera.userData.planeHeight || 500; 

  camera.left = frustumHeightToUse * aspect / -2;
  camera.right = frustumHeightToUse * aspect / 2;
  camera.top = frustumHeightToUse / 2;
  camera.bottom = frustumHeightToUse / -2;

  camera.updateProjectionMatrix();
  renderer.setSize(containerWidth, containerHeight);
}

// --- Bucle de animación ---
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// --- Inicio ---
init();
animate();
window.addEventListener('resize', onWindowResize, false);
