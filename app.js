import * as THREE from 'https://esm.sh/three@0.160.0';
import { ARButton } from 'https://esm.sh/three@0.160.0/examples/jsm/webxr/ARButton.js';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

let camera, scene, renderer;
let controller;
let reticle;
let model;
let placedObject = null;
let initialDistance = 0;
let initialScale = 1;
let isPinching = false;
let isInteracting = false;
let initialAngle = 0;
let initialRotation = 0;

init();
animate();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;

  renderer.xr.setReferenceSpaceType('local');

  document.body.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';

  // ADD TOUCH CONTROLS HERE
  renderer.domElement.addEventListener('touchstart', onTouchStart, false);
  renderer.domElement.addEventListener('touchmove', onTouchMove, false, { passive: false });
  renderer.domElement.addEventListener('touchend', () => {
    isPinching = false;
    isInteracting = false;
  });

  // AR Button
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test']
  });
  document.body.appendChild(arButton);

  // Light
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  // Reticle
  const geometry = new THREE.RingGeometry(0.1, 0.15, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Load model
  const loader = new GLTFLoader();
  loader.load('model.glb', (gltf) => {
    model = gltf.scene;

    console.log("MODEL STRUCTURE:", model);

    model.traverse((child) => {
      if (child.isMesh) {
        console.log("Mesh:", child.name);
      }
    });
  });

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);
}

function onSelect() {
  if (isInteracting) return;
  if (!model) return;

  // If reticle is visible → use it
  if (reticle.visible) {
    if (placedObject) {
      placedObject.position.setFromMatrixPosition(reticle.matrix);
      return;
    }

    const clone = model.clone();
    clone.position.setFromMatrixPosition(reticle.matrix);
    clone.scale.set(0.15, 0.15, 0.15);

    scene.add(clone);
    placedObject = clone;

    animateObject(clone);
  } 
  else {
    // 🔥 Fallback: place in front of camera
    const clone = model.clone();
    clone.position.set(0, 0, -1); // 1 meter in front
    clone.scale.set(0.15, 0.15, 0.15);

    scene.add(clone);
    placedObject = clone;

    animateObject(clone);
  }
}

// Simple rotation animation
function animateObject(obj) {
  function rotate() {
    obj.rotation.y += 0.01;
    requestAnimationFrame(rotate);
  }
  rotate();
}

let hitTestSource = null;
let localSpace = null;

function animate() {
  renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (!hitTestSource) {
      session.requestReferenceSpace('viewer').then((space) => {
        session.requestHitTestSource({ space: space }).then((source) => {
          hitTestSource = source;
        });
      });

      session.requestReferenceSpace('local').then((space) => {
        localSpace = space;
      });
    }

    if (hitTestSource && localSpace) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);

      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(localSpace);

        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);

        // ✅ SHOW READY MESSAGE
        document.getElementById("overlay").innerText = "Tap to place 🍔";
      } else {
        reticle.visible = false;

        // ✅ SHOW SCANNING MESSAGE
        document.getElementById("overlay").innerText = "Move phone to detect surface...";
      }
    } else {
      // ✅ INITIAL STATE
      document.getElementById("overlay").innerText = "Starting AR...";
    }
  }

  renderer.render(scene, camera);
}
// function getDistance(touch1, touch2) {
//   const dx = touch1.pageX - touch2.pageX;
//   const dy = touch1.pageY - touch2.pageY;
//   return Math.sqrt(dx * dx + dy * dy);
// }

// function onTouchStart(event) {
//   if (!placedObject) return;

//   isInteracting = true;

//   if (event.touches.length === 2) {
//     isPinching = true;
//     initialDistance = getDistance(event.touches[0], event.touches[1]);
//     initialScale = placedObject.scale.x;

//     // NEW: store rotation angle
//     initialAngle = getAngle(event.touches[0], event.touches[1]);
//     initialRotation = placedObject.rotation.y;
//   }

//   if (event.touches.length === 1) {
//     lastTouchX = event.touches[0].pageX;
//   }
// }

// function onTouchMove(event) {
//   event.preventDefault();
//   if (!placedObject) return;

//   event.preventDefault();

//   // 🔥 PINCH + ROTATE (2 fingers)
//   if (event.touches.length === 2 && isPinching) {
//     const t1 = event.touches[0];
//     const t2 = event.touches[1];

//     // SCALE
//     const newDistance = getDistance(t1, t2);
//     const scaleFactor = newDistance / initialDistance;

//     let newScale = initialScale * scaleFactor;
//     newScale = Math.max(0.05, Math.min(newScale, 1.5));

//     placedObject.scale.set(newScale, newScale, newScale);

//     // 🔥 ROTATE (twist)
//     const currentAngle = getAngle(t1, t2);
//     const angleDelta = currentAngle - initialAngle;

//     // ✅ amplify + accumulate instead of overwrite
//     placedObject.rotation.y += angleDelta * 1.5;

//     // update reference so it continues smoothly
//     initialAngle = currentAngle;
//   }

//   // 🔄 SINGLE FINGER ROTATE
//   if (event.touches.length === 1 && !isPinching) {
//     const touch = event.touches[0];
//     const deltaX = touch.pageX - lastTouchX;

//     placedObject.rotation.y += deltaX * 0.01;

//     lastTouchX = touch.pageX;
//   }
// }
// function getAngle(touch1, touch2) {
//   return Math.atan2(
//     touch2.pageY - touch1.pageY,
//     touch2.pageX - touch1.pageX
//   );
// }