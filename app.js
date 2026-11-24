const overlay = document.getElementById('overlay');
const overlayMessage = document.getElementById('overlay-message');
const fallback = document.getElementById('fallback');
const fallbackMessage = document.getElementById('fallback-message');
const fallbackModel = document.getElementById('fallback-model');
const fallbackError = document.getElementById('fallback-error');

let camera;
let scene;
let renderer;
let reticle;
let model;
let modelLoadFailed = false;
let placedObject = null;
let hitTestSource = null;
let localSpace = null;
let hitTestSession = null;
let previousFrameTime = null;
let THREE;
let ARButton;
let GLTFLoader;
let DRACOLoader;

init().catch((error) => {
  console.error('Unable to initialize the AR experience.', error);
  showFallback('AR could not be started in this browser. You can still preview the model below.');
});

async function init() {
  if (!window.isSecureContext) {
    await showFallback('AR requires a secure context, usually HTTPS. You can still preview the model below.');
    return;
  }

  if (!(await supportsWebXRHitTest())) {
    const message = isIOSDevice()
      ? 'This browser does not support WebXR AR. Use the button in the preview to open Apple AR Quick Look.'
      : 'WebXR AR is not available in this browser. You can still preview the model below.';
    await showFallback(message);
    return;
  }

  await loadWebXRModules();
  initializeWebXR();
  loadModel();
}

async function loadWebXRModules() {
  const [threeModule, arButtonModule, gltfLoaderModule, dracoLoaderModule] = await Promise.all([
    import('https://esm.sh/three@0.160.0'),
    import('https://esm.sh/three@0.160.0/examples/jsm/webxr/ARButton.js'),
    import('https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js'),
    import('https://esm.sh/three@0.160.0/examples/jsm/loaders/DRACOLoader.js')
  ]);

  THREE = threeModule;
  ARButton = arButtonModule.ARButton;
  GLTFLoader = gltfLoaderModule.GLTFLoader;
  DRACOLoader = dracoLoaderModule.DRACOLoader;
}

async function supportsWebXRHitTest() {
  if (!navigator.xr || typeof navigator.xr.isSessionSupported !== 'function') {
    return false;
  }

  if (
    typeof window.XRSession === 'undefined' ||
    typeof window.XRSession.prototype.requestHitTestSource !== 'function'
  ) {
    return false;
  }

  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch (error) {
    console.warn('Could not check WebXR AR support.', error);
    return false;
  }
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

async function showFallback(message) {
  overlay.hidden = true;
  fallback.hidden = false;
  fallbackMessage.textContent = message;

  fallbackModel.addEventListener('error', (event) => {
    console.error('The fallback 3D model failed to load.', event);
    fallbackError.hidden = false;
    fallbackError.textContent = 'The model preview failed to load. Check your connection and reload the page.';
  }, { once: true });

  try {
    await import('https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js');
    await customElements.whenDefined('model-viewer');
  } catch (error) {
    console.error('Could not load the 3D model preview.', error);
    fallbackError.hidden = false;
    fallbackError.textContent = 'The model preview could not be loaded. Check your connection and reload the page.';
  }
}

function initializeWebXR() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  document.body.appendChild(renderer.domElement);

  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test']
  });
  document.body.appendChild(arButton);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));

  const geometry = new THREE.RingGeometry(0.1, 0.15, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  renderer.xr.addEventListener('sessionstart', onSessionStart);
  renderer.xr.addEventListener('sessionend', onSessionEnd);
  window.addEventListener('resize', onWindowResize);

  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  renderer.setAnimationLoop(render);
}

function loadModel() {
  setOverlayMessage('Loading model...');

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  loader.load(
    'model.glb',
    (gltf) => {
      model = gltf.scene;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
          child.frustumCulled = true;
        }
      });

      setOverlayMessage(reticle.visible ? 'Tap to place the model.' : 'Scan a surface to place the model.');
    },
    undefined,
    (error) => {
      console.error('Failed to load model.glb.', error);
      modelLoadFailed = true;
      setOverlayMessage('Failed to load the model. Check your connection and reload the page.');
    }
  );
}

function onSessionStart() {
  const session = renderer.xr.getSession();
  if (!session || hitTestSession === session) {
    return;
  }

  hitTestSession = session;
  setOverlayMessage('Starting surface detection...');

  Promise.all([
    session.requestReferenceSpace('viewer'),
    session.requestReferenceSpace('local')
  ])
    .then(([viewerSpace, referenceSpace]) => {
      return session.requestHitTestSource({ space: viewerSpace }).then((source) => ({
        referenceSpace,
        source
      }));
    })
    .then(({ referenceSpace, source }) => {
      if (renderer.xr.getSession() !== session) {
        source.cancel();
        return;
      }

      localSpace = referenceSpace;
      hitTestSource = source;
    })
    .catch((error) => {
      if (renderer.xr.getSession() === session) {
        console.error('Failed to initialize surface detection.', error);
        setOverlayMessage('Surface detection could not start. Please exit AR and try again.');
      }
    });
}

function onSessionEnd() {
  if (hitTestSource) {
    hitTestSource.cancel();
  }

  hitTestSource = null;
  localSpace = null;
  hitTestSession = null;
  previousFrameTime = null;
  reticle.visible = false;
  setOverlayMessage('Tap the AR button to start.');

  if (placedObject) {
    scene.remove(placedObject);
    placedObject = null;
  }
}

function onSelect() {
  if (!model) {
    setOverlayMessage(modelLoadFailed
      ? 'The model failed to load. Please reload the page.'
      : 'The model is still loading.');
    return;
  }

  if (!reticle.visible) {
    setOverlayMessage('Move your phone until a surface is detected.');
    return;
  }

  if (placedObject) {
    placedObject.position.setFromMatrixPosition(reticle.matrix);
    return;
  }

  placedObject = model.clone(true);
  placedObject.position.setFromMatrixPosition(reticle.matrix);
  placedObject.scale.setScalar(0.15);
  scene.add(placedObject);
}

function render(timestamp, frame) {
  if (frame && hitTestSource && localSpace) {
    const hitTestResults = frame.getHitTestResults(hitTestSource);
    const pose = hitTestResults.length > 0 ? hitTestResults[0].getPose(localSpace) : null;

    if (pose) {
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
      if (model && !modelLoadFailed) {
        setOverlayMessage(placedObject ? 'Tap a surface to move the model.' : 'Tap to place the model.');
      }
    } else {
      reticle.visible = false;
      if (model && !modelLoadFailed) {
        setOverlayMessage('Move your phone to detect a surface.');
      }
    }
  }

  if (placedObject && previousFrameTime !== null) {
    const deltaSeconds = Math.min((timestamp - previousFrameTime) / 1000, 0.1);
    placedObject.rotation.y += 0.48 * deltaSeconds;
  }
  previousFrameTime = timestamp;

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function setOverlayMessage(message) {
  overlayMessage.textContent = message;
}
