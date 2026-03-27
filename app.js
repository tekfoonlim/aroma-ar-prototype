import * as THREE from 'https://esm.sh/three@0.160.0';
import { ARButton } from 'https://esm.sh/three@0.160.0/examples/jsm/webxr/ARButton.js';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

let camera, scene, renderer;
let controller;
let reticle;
let model;
let placedObject = null;
let hasPlaced = false; // ✅ prevent duplication

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
  });

  // Controller
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);
}

function onSelect() {
  // 🚫 already placed → do nothing
  if (hasPlaced) return;

  if (!model) return;

  const clone = model.clone();

  if (reticle.visible) {
    clone.position.setFromMatrixPosition(reticle.matrix);
  } else {
    clone.position.set(0, 0, -1);
  }

  clone.scale.set(0.15, 0.15, 0.15);

  scene.add(clone);
  placedObject = clone;

  // ✅ mark placed
  hasPlaced = true;
}

let hitTestSource = null;
let localSpace = null;

function animate() {
  renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
  if (frame) {
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

        document.getElementById("overlay").innerText = "Tap to place 🍔";
      } else {
        reticle.visible = false;
        document.getElementById("overlay").innerText = "Move phone to detect surface...";
      }
    } else {
      document.getElementById("overlay").innerText = "Starting AR...";
    }
  }

  // ✅ AUTO ROTATION (SAFE HERE)
  if (placedObject) {
    placedObject.rotation.y += 0.01;
  }

  renderer.render(scene, camera);
}