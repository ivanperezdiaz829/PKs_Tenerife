<h1 style="text-weight: bold;">SOLAR SYSTEM</h1>

<img src="Images/general_system_image.png">

## Índice

- [Introducción](#introducción)
- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Dependencias](#dependencias)
- [Funcionamiento general](#funcionamiento-general)
- [Texturas](#texturas)
- [Vídeo de uso](#vídeo-de-uso)
- [Fuentes y documentación](#fuentes-y-documentación)

## Introducción

El proyecto consiste en la visualización de datos en un mapa, concretamente, consiste en la visualización de varias paradas de transportes en la ciudad de Santa Cruz de Tenerife.

Los tipos de paradas de transporte del que se componen los datos son los siguientes:

- **Aparcamiento Público.**
- **Transporte Guagua.**
- **Transporte Sociosanitario.**
- **Transporte Taxi.**
- **Otros:** Zonas de carga y descarga empresariales.

## Tecnologías Utilizadas

Para realizar el modelo se ha hecho uso de JavaScript utilizando la librería three.js. 

El proyecto se ha realizado en VSCode y se ha exportado posteriormente a CodeSandbox (para ejecutar el HTML en VSCode se ha hecho uso de la extensión *Live Server*).

## Dependencias

En cuanto al código, lo primero que se ha realizado son las importaciones necesarias para el proyecto, como se ha mencionado antes, se ha utilizado **three.js**. Comentar que todo el código tiene cada una de sus partes principales con un comentario que define la funcionalidad de dicha parte.

```js
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
```

## Funcionamiento general

El proyecto tiene controles sencillos siendo estos muy parecidos a una aplicación de estilo *"maps"* en donde clickando y arrastrando se puede desplazar por el territorio y con la rueda del ratón se acerca y aleja el punto de vista.

- **Barra izquierda:** En esta barra, nada mas iniciar la página, se encuentra un mensaje de control para saber que datos se van a visualizar en ella, adicionalmente, en la parte inferior, se ubica la autoría del proyecto. De manera adicional, se puede ampliar y reducir el tamaño de la barra arrastrando desde el borde, a su vez, se puede esconder completamente haciendo uso de la flecha visible en el centro del mismo borde.

- **Barra derecha:** En esta barra se muestra una leyenda con el significado de los círculos presentes en el mapa, además, son pulsables para usarlos como filtrado de los símbolos, de manera similar a la barra izquierda, se puede colapsar y ampliar y decrementar de tamaño.

- **Puntos en el mapa:** Definen una parada de un tipo específico dado por un esquema de color que se puede ver en la leyenda y da información de lo siguiente:
   - **Tipo**
   - **Dirección**
   - **Ubicación**
   - **Referencia**
   - **Teléfono**
   - **Email**
   - **Web**
   - **Fecha de última actualización**

## Texturas

Para el fondo se ha usando un .png obtenido recortando la pantalla en [OpenStreetMap](https://www.openstreetmap.org), yendo a las coordenadas de Santa Cruz de Tenerife.

## Vídeo de uso

Se procede a mostrar un vídeo con explicaciones del uso del modelo, controles y una vista general del proyecto en ejecución (Pulsar la imagen para acceder al video en **YouTube**).

<h4 style="text-weight: bold; text-decoration: underline">Enlace al video del uso:</h4>

[![Ver en YouTube](https://img.youtube.com/vi/yhspgMPTxZA/0.jpg)](https://www.youtube.com/watch?v=yhspgMPTxZA)

## Fuentes y Documentación

- **Internet:** Se ha utilizado internet para obtener el dataset de las paradas de transportes de Santa Cruz de Tenerife ([Link](https://datos.gob.es/es/catalogo/l01380380-aparcamientos1)), así como para buscar las coordenadas en el mapa usando [OpenStreetMap](https://www.openstreetmap.org).

- **Inteligencia Artificial Generativa (ChatGPT, Gemini):** Se ha utilizado la IA generativa para hacer la parte visual del proyecto, es decir, modificaciones dentro del .html y control visula en el main.js para un estilo agradable visualmente.

- **Enlaces:**
    - https://datos.gob.es/es/catalogo/l01380380-aparcamientos1
    - https://chatgpt.com/
    - https://youtube.com/
    - https://gemini.google.com
    - https://www.openstreetmap.org


<h4 style="text-weight: bold">--- Iván Pérez Díaz ---</h4>

