// Turns browser errors into short messages that also say how to recover.

export function cameraErrorMessage(err) {
  const name = err && err.name;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera permission was denied. Click the camera or lock icon in the address bar, set Camera to Allow, then press Start Detection again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera was found. Connect a camera, or open the app on a device that has one, then try again.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'The camera could not be started. Another app or browser tab may be using it. Close that app or tab, then try again.';
  }
  if (name === 'SecurityError') {
    return 'The browser blocked the camera because this page is not secure. Open the app at localhost or through an https address.';
  }
  return 'The camera could not be started' + (err && err.message ? ': ' + err.message : '.');
}

export function insecureContextMessage() {
  return 'The camera only works on a secure page. Open the app at localhost on this computer, or through an https address on a phone.';
}

export function unsupportedCameraMessage() {
  return 'This browser cannot use the camera. Please use a recent version of Chrome, Edge, Firefox or Safari.';
}

export function modelErrorMessage() {
  return 'The object detection model could not be loaded. Check your internet connection and press Try Again. To work offline, run the download-model command described in the README.';
}

export function ocrErrorMessage() {
  return 'Text reading failed. The first use needs an internet connection to download the text reader. Check your connection and try again, or try a clearer, brighter photo.';
}
