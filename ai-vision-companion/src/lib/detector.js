// Loads the pretrained COCO-SSD object detector (TensorFlow.js) once and shares it.
//
// Model source order:
//   1. /model/model.json  (a local copy in public/model, created by `npm run download-model`)
//   2. Google's public model storage (the default of the coco-ssd library)
//
// Only the model weights are downloaded. Camera images never leave the device.

import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

let loadPromise = null;
let info = { source: '', backend: '' };

async function localModelAvailable() {
  try {
    const res = await fetch('/model/model.json', { cache: 'no-cache' });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) return false; // dev servers answer unknown paths with index.html
    const json = await res.json();
    return Boolean(json && json.modelTopology);
  } catch {
    return false;
  }
}

export function getModelInfo() {
  return info;
}

// Returns a promise for the detector. Safe to call many times.
export function loadDetector() {
  if (!loadPromise) {
    loadPromise = (async () => {
      await tf.ready(); // picks WebGL (fast) or falls back to CPU (slow)
      const useLocal = await localModelAvailable();
      const model = await cocoSsd.load(
        useLocal ? { base: 'lite_mobilenet_v2', modelUrl: '/model/model.json' } : { base: 'lite_mobilenet_v2' }
      );
      info = { source: useLocal ? 'local file' : 'online model storage', backend: tf.getBackend() };
      return model;
    })().catch((err) => {
      loadPromise = null; // allow "Try again"
      throw err;
    });
  }
  return loadPromise;
}

// Runs one detection on a <video> frame.
export async function detectFrame(model, video, minScore) {
  return model.detect(video, 20, minScore);
}
