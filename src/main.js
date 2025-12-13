import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

// --- RUTAS DE RECURSOS (Strings simples para FileLoader) ---
const mapUrl = './Resources/mapa.png';
const dataUrl = './Resources/empresas-e-infraestructuras-relacionadas-con-el-transporte-en-tenerife.json';

// --- Variables Globales ---
let scene, camera, renderer, controls;
let loadingManager;
let canvasContainer, sidebarContent, legendContainer;
let clickablePointsGroup;
let raycaster, mouse;
let hoveredMarkerGroup = null;
let selectedMarkerGroup = null;
let activeLegendItem = null;
let resizerLeftElement, resizerRightElement;
let sidebarLeftElement, legendContainerElement;

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
  'aparcamiento publico': new THREE.MeshBasicMaterial({ color: 0x0099ff, toneMapped: false }),
  'transporte guagua': new THREE.MeshBasicMaterial({ color: 0xffcc00, toneMapped: false }),
  'transporte sociosanitario': new THREE.MeshBasicMaterial({ color: 0xff3300, toneMapped: false }),
  'transporte taxi': new THREE.MeshBasicMaterial({ color: 0x00cc33, toneMapped: false }),
  'otros': new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
};

// --- Geometrías Reutilizables ---
const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
const MARKER_RADIUS = 2;
const transportGeometry = new THREE.CircleGeometry(MARKER_RADIUS, 32);
const outlineGeometry = new THREE.CircleGeometry(MARKER_RADIUS * 1.2, 32);

function init() {
  // 1. Configuración de DOM
  canvasContainer = document.getElementById('canvas-container');
  sidebarContent = document.getElementById('sidebar-content'); 
  legendContainer = document.getElementById('legend-container'); 
  sidebarLeftElement = document.getElementById('sidebar-left');
  legendContainerElement = document.getElementById('legend-container');
  resizerLeftElement = document.getElementById('resizer-left');
  resizerRightElement = document.getElementById('resizer-right');

  // 2. Escena y Cámara
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

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

  // 3. Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  canvasContainer.appendChild(renderer.domElement); 

  // 4. Luces y Controles
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true; 
  controls.dampingFactor = 0.05;
  controls.enableRotate = false;
  controls.screenSpacePanning = true; 
  controls.minZoom = 0.5;
  controls.maxZoom = 5;

  // 5. Raycasting
  clickablePointsGroup = new THREE.Group();
  scene.add(clickablePointsGroup);
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  renderer.domElement.addEventListener('click', onPointClick);
  renderer.domElement.addEventListener('mousemove', onMouseMove);

  setupPanelControls();

  // 6. Loading Manager y Carga de Assets
  loadingManager = new THREE.LoadingManager();
  loadingManager.onLoad = () => {
    console.log("¡Todos los recursos cargados!");
    const loaderOverlay = document.getElementById('loader-overlay');
    if(loaderOverlay) loaderOverlay.style.display = 'none';
    onWindowResize();
  };

  const textureLoader = new THREE.TextureLoader(loadingManager);
  
  // Cargar Textura
  textureLoader.load(
    mapUrl, 
    (mapTexture) => {
      // --- A. Configurar Mapa ---
      const imageAspect = mapTexture.image.width / mapTexture.image.height;
      camera.userData.imageAspect = imageAspect;
      const planeHeight = MAP_PLANE_HEIGHT;
      const planeWidth = planeHeight * imageAspect; 
      camera.userData.planeHeight = planeHeight;
      camera.userData.planeWidth = planeWidth;
  
      const groundGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight); 
      // Usamos MeshBasicMaterial para que se vea siempre
      const groundMaterial = new THREE.MeshBasicMaterial({ 
          map: mapTexture, 
          side: THREE.DoubleSide 
      });
      const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.name = "mapGround"; 
      scene.add(groundMesh);

       // --- B. Lógica de Proyección ---
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

       // --- C. Cargar y Procesar JSON (Anidado para usar las proyecciones) ---
       console.log("Cargando JSON de datos...");
       const jsonLoader = new THREE.FileLoader(loadingManager);
       
       jsonLoader.load(dataUrl, (text) => {
           try {
               const transportData = JSON.parse(text);
               
               if (transportData && transportData.features) {
                  transportData.features.forEach(feature => {
                    if (feature.geometry && feature.geometry.type === 'Point' && feature.geometry.coordinates && feature.properties) {
                      const [lon, lat] = feature.geometry.coordinates;
                      
                      // Filtro de coordenadas dentro del mapa
                      if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
                        const pos = project(lon, lat); 
                        const rawType = feature.properties.actividad_tipo;
                        const tipoKey = rawType ? rawType.toLowerCase() : 'otros';
                        const tipo = transportMaterials[tipoKey] ? tipoKey : 'otros';
                        const markerMaterial = transportMaterials[tipo];
        
                        const markerGroup = new THREE.Group();
        
                        // Borde
                        const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
                        outline.rotation.x = -Math.PI / 2;
                        markerGroup.add(outline);
        
                        // Círculo
                        const marker = new THREE.Mesh(transportGeometry, markerMaterial);
                        marker.rotation.x = -Math.PI / 2;
                        marker.position.y = 0.1; 
                        markerGroup.add(marker);
        
                        markerGroup.position.set(pos.x, 0.5, pos.y); 
        
                        markerGroup.userData.type = tipo;
                        markerGroup.userData.properties = feature.properties;
        
                        clickablePointsGroup.add(markerGroup);
                      }
                    }
                  });
                  console.log(`Puntos añadidos: ${clickablePointsGroup.children.length}`);
               }
           } catch (e) {
               console.error("Error al parsear JSON:", e);
           }
       });
    },
    undefined,
    (err) => console.error('Error cargando textura:', err)
  );

  createLegend();
}

// --- Funciones UI y Lógica ---

function setupPanelControls() {
  const toggleLeft = document.getElementById('toggle-left');
  const toggleRight = document.getElementById('toggle-right');
  
  if(toggleLeft) {
    toggleLeft.addEventListener('click', () => {
      sidebarLeftElement.classList.toggle('collapsed');
      resizerLeftElement.classList.toggle('collapsed');
      toggleLeft.innerHTML = sidebarLeftElement.classList.contains('collapsed') ? '»' : '«';
      setTimeout(onWindowResize, 310);
    });
  }

  if(toggleRight) {
    toggleRight.addEventListener('click', () => {
      legendContainerElement.classList.toggle('collapsed');
      resizerRightElement.classList.toggle('collapsed');
      toggleRight.innerHTML = legendContainerElement.classList.contains('collapsed') ? '«' : '»';
      setTimeout(onWindowResize, 310);
    });
  }
  
  initResizer(resizerLeftElement, sidebarLeftElement, 'left');
  initResizer(resizerRightElement, legendContainerElement, 'right');
}

function initResizer(resizer, sidebar, direction) {
    if(!resizer || !sidebar) return;
    let startX, startWidth;

    function doDrag(e) {
      let newWidth;
      if (direction === 'left') {
        newWidth = startWidth + (e.clientX - startX);
      } else { 
        newWidth = startWidth - (e.clientX - startX);
      }
      if (newWidth > 150 && newWidth < 600) {
        sidebar.style.flexBasis = newWidth + 'px';
      }
      onWindowResize();
    }

    function stopDrag() {
      document.documentElement.removeEventListener('mousemove', doDrag);
      document.documentElement.removeEventListener('mouseup', stopDrag);
    }

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = parseInt(document.defaultView.getComputedStyle(sidebar).flexBasis, 10);
      document.documentElement.addEventListener('mousemove', doDrag);
      document.documentElement.addEventListener('mouseup', stopDrag);
    });
}

function filterPoints(dataType, clickedElement) {
  if (activeLegendItem) activeLegendItem.classList.remove('active');
  clickedElement.classList.add('active');
  activeLegendItem = clickedElement;

  if (selectedMarkerGroup) {
    selectedMarkerGroup.scale.set(1, 1, 1);
    selectedMarkerGroup = null;
  }
  updateSidebar(null); 

  clickablePointsGroup.children.forEach(markerGroup => {
    if (dataType === 'all' || markerGroup.userData.type === dataType) {
      markerGroup.visible = true;
    } else {
      markerGroup.visible = false;
    }
  });
}

function onMouseMove(event) {
  event.preventDefault();
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const visibleChildren = clickablePointsGroup.children.filter(child => child.visible);
  const intersects = raycaster.intersectObjects(visibleChildren, true);

  if (intersects.length > 0) {
    let target = intersects[0].object;
    while(target.parent && target.parent !== clickablePointsGroup) {
        target = target.parent;
    }

    if (hoveredMarkerGroup !== target) {
      if (hoveredMarkerGroup && hoveredMarkerGroup !== selectedMarkerGroup) {
        hoveredMarkerGroup.scale.set(1, 1, 1);
      }
      hoveredMarkerGroup = target;
      hoveredMarkerGroup.scale.set(2.25, 2.25, 2.25); 
      document.body.style.cursor = 'pointer';
    }
  } else {
    if (hoveredMarkerGroup && hoveredMarkerGroup !== selectedMarkerGroup) {
      hoveredMarkerGroup.scale.set(1, 1, 1);
    }
    hoveredMarkerGroup = null;
    document.body.style.cursor = 'default';
  }
}

function onPointClick(event) {
  if(!hoveredMarkerGroup) return; 

  if (selectedMarkerGroup) {
    selectedMarkerGroup.scale.set(1, 1, 1);
  }
  
  selectedMarkerGroup = hoveredMarkerGroup;
  selectedMarkerGroup.scale.set(2.25, 2.25, 2.25);
  updateSidebar(selectedMarkerGroup);
}

function updateSidebar(markerObject) {
  if (!markerObject) {
    sidebarContent.innerHTML = '<div id="sidebar-placeholder">Haz clic en un punto del mapa para ver su información.</div>';
    return;
  }

  const data = markerObject.userData;
  const position = markerObject.position;
  const props = data.properties;
  const type = data.type; 
  const name = props.nombre || props.actividad_tipo || "Elemento sin nombre";

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
  
  if (props.web) {
    const webLink = props.web.startsWith('http') ? props.web : `http://${props.web}`;
    html += `<div class="info-item"><strong>Web</strong> <a href="${webLink}" target="_blank" rel="noopener noreferrer">${props.web}</a></div>`;
  }

  sidebarContent.innerHTML = html;

  const centerButton = document.getElementById('center-on-point');
  if (centerButton) {
    centerButton.addEventListener('click', () => centerOnSelectedPoint(position));
  }
}

function centerOnSelectedPoint(targetPosition) {
  controls.target.copy(targetPosition);
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

function onWindowResize() {
  if (!canvasContainer || !renderer || !camera) return;
  const containerWidth = canvasContainer.clientWidth;
  const containerHeight = canvasContainer.clientHeight;
  const aspect = containerWidth / containerHeight;
  const frustumHeightToUse = camera.userData.planeHeight || MAP_PLANE_HEIGHT; 
  camera.left = frustumHeightToUse * aspect / -2;
  camera.right = frustumHeightToUse * aspect / 2;
  camera.top = frustumHeightToUse / 2;
  camera.bottom = frustumHeightToUse / -2;
  camera.updateProjectionMatrix();
  renderer.setSize(containerWidth, containerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

init();
animate();
window.addEventListener('resize', onWindowResize, false);