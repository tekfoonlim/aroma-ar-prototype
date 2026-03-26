import * as THREE from 'https://esm.sh/three@0.160.0';
import { ARButton } from 'https://esm.sh/three@0.160.0/examples/jsm/webxr/ARButton.js';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

let camera, scene, renderer;
let controller;
let reticle;
let model;

init();
animate();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;

  // ✅ IMPORTANT FIX
  renderer.xr.setReferenceSpaceType('local');

  document.body.appendChild(renderer.domElement);

  // AR Button
  document.body.appendChild(ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test']
  }));

  // Light
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  // Reticle
  const geometry = new THREE.RingGeometry(0.1, 0.15, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false; // ✅ IMPORTANT
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
  // loader.load(
  //   'model.glb',
  //   (gltf) => {
  //     console.log("Model loaded ✅");
  //     model = gltf.scene;
  //   },
  //   undefined,
  //   (error) => {
  //     console.error("Model load error ❌", error);
  //   }
  // );

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);
}

function onSelect() {
  if (reticle.visible && model) {
    const clone = model.clone();
    clone.position.setFromMatrixPosition(reticle.matrix);

    // Default scale
    clone.scale.set(0.5, 0.5, 0.5);

    scene.add(clone);

    // Rotate slowly
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
      } else {
        reticle.visible = false;
      }
    }
  }

  renderer.render(scene, camera);
}