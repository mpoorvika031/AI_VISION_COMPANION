// OCR (text reading) with Tesseract.js. Kept in a lazy-loaded module so it
// never slows down the real-time object detection screen.
//
// Tesseract runs in a Web Worker, so the page stays responsive. On first use
// it downloads the OCR engine and English language data from a public CDN
// (about 10-15 MB). Your photo itself is processed on your device.

let workerPromise = null;
let progressHandler = null;

export function setOcrProgressHandler(fn) {
  progressHandler = fn;
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker('eng', 1, {
        logger: (m) => progressHandler?.(m),
      });
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

// Copies a video frame or image into a canvas, limited to maxSide pixels,
// because very large phone photos make OCR slow.
export function toCanvas(source, maxSide = 1800) {
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function fileToCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return toCanvas(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function recognizeText(canvas) {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  return (data.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export async function disposeOcr() {
  if (!workerPromise) return;
  const p = workerPromise;
  workerPromise = null;
  try {
    const worker = await p;
    await worker.terminate();
  } catch {
    /* ignore */
  }
}
