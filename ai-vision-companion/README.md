# AI Vision Companion

A web app that uses the camera to detect everyday objects and tells you what it sees out loud.
It runs in the browser: React + Vite, TensorFlow.js with the pretrained COCO-SSD model,
the browser speech engine, and Tesseract.js for reading printed text.

> **Safety:** this is an assistive prototype, not a certified mobility aid. It can miss or
> misidentify objects and cannot measure distance with one camera. Left/center/right means position
> in the camera image, not a real-world direction. It never says an area is safe. It does not replace
> a white cane or guide dog.

## 1. How it works (architecture)

```
Camera (getUserMedia) -> <video>
   every 0.3-1.2 s, one frame
-> COCO-SSD (TensorFlow.js, on your device)  -> [{class, score, box}]
-> SceneTracker  (smooths over 3 frames, ignores flicker)
-> Announcer     (what is NEW? cooldowns, one message at a time)
-> SpeechManager (SpeechSynthesis, never overlaps, newest message wins)
```

Files that matter:

| File | Purpose |
|---|---|
| `src/App.jsx` | Connects everything: camera, loop, buttons, voice, OCR |
| `src/lib/detector.js` | Loads the COCO-SSD model (local copy first, then online) |
| `src/lib/scene.js` | Sentences, grouping, smoothing, duplicate suppression, cautions |
| `src/lib/speech.js` | Text-to-speech without overlapping speech |
| `src/lib/voice.js`, `commands.js` | Voice commands (Chrome / Edge) |
| `src/lib/ocr.js` | Text reading (Tesseract.js, loaded only when used) |
| `src/components/*` | Camera overlay, settings, OCR panel, help |
| `tests/scene.test.js` | Unit tests (`npm test`) |
| `scripts/download-model.mjs` | Saves the model locally for offline use |

## 2. Setup on Windows (VS Code)

1. Install **Node.js LTS** (version 20.19 or newer, or 22.12+) from https://nodejs.org. Check in a terminal: `node -v`
2. Unzip this project, then in VS Code choose **File > Open Folder** and pick `ai-vision-companion`.
3. Open the terminal (**Terminal > New Terminal**) and run:

```powershell
npm install
npm test
npm run dev
```

4. Open **http://localhost:5173** in **Chrome or Edge** and allow the camera.

If PowerShell says scripts are disabled, use **Command Prompt** in the terminal dropdown, or run
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

## 3. The model and checking it works

On first load the app downloads the model weights (about 13 MB) from Google's public model storage.
Only the model is downloaded; camera images never leave your device. The line under the status shows
`Model: ready (webgl, online model storage)`.

**Offline option (recommended before a competition demo):**

```powershell
npm run download-model
```

This saves the model into `public/model`. Restart `npm run dev`; the page then says `local file`.

**Quick proof that detection is real:** start detection and point the camera at a bottle, a chair, a
phone or yourself. Boxes with names must appear on the live video and the app must say it aloud.
Nothing is ever shown unless the model found it.

## 4. Using the app

- **Start Detection** opens the camera. Pause keeps the camera on; Stop turns it off.
- **Describe Surroundings** says everything currently visible. **Repeat Last Description** repeats it.
- The app speaks only when something new appears, with cooldowns, and says "No objects detected" once.
- Shortcuts: `S` start/stop, `P` pause/resume, `D` describe, `R` repeat, `T` read text, `H` help.
- Voice commands (turn on in settings): "start detection", "stop detection", "pause", "resume",
  "describe surroundings", "repeat description", "read text", "help". In Chrome the microphone audio is
  sent to the browser maker's speech service, so it is off until you enable it.
- **Read text aloud:** capture from the camera or take/choose a photo. The first use downloads the OCR
  engine (about 10-15 MB) from a CDN; photos stay on the device.
- If you use TalkBack, VoiceOver or NVDA, set "Announcements are spoken by" to your screen reader to
  avoid two voices talking at once.

## 5. Testing on an Android phone

Camera access needs a secure page (https or localhost).

**Option A: USB (easiest)**
1. On the phone enable Developer options and USB debugging, connect by USB.
2. On the PC open Chrome at `chrome://inspect/#devices`, tick *Discover USB devices*, click *Port forwarding*, add `5173` -> `localhost:5173`.
3. On the phone open Chrome and go to `http://localhost:5173`.

**Option B: same Wi-Fi with https**
1. Run `npm run dev:https`. Note the `https://192.168.x.x:5173` address it prints.
2. Open it on the phone in Chrome, accept the certificate warning (self-signed), allow the camera.
3. If it cannot connect, allow Node.js through Windows Firewall for private networks.

**Option C: deploy** (for the final demo): `npm run build`, then upload the `dist` folder to Netlify,
Vercel or GitHub Pages. They serve https. Tap the first button once so Android allows speech.

Phone tips: use Chrome, keep the screen on (the app requests a wake lock), choose *Battery saver* speed
if the phone gets warm. For a store app later, wrap with Capacitor.

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| "Model could not be loaded" | Check internet, press Try Again, or run `npm run download-model` |
| Camera permission denied | Click the lock icon in the address bar, allow Camera, reload |
| "Camera only works on a secure page" | Use `localhost`, or https on a phone |
| Camera in use | Close other apps or tabs using the camera |
| No sound | Raise volume, press *Test voice*, check Windows has an installed voice |
| Slow detection | Choose *Battery saver*, close other tabs; WebGL must be available (shown next to Model) |
| `npm install` fails | Update Node.js to the LTS version |
| Voice commands do nothing | Needs Chrome/Edge, microphone permission and internet |

## 7. Final test checklist

- [ ] `npm test` passes (19 tests)
- [ ] Page loads; status says model ready
- [ ] Start Detection: camera preview shows, badge says CAMERA ON
- [ ] A real object (bottle, chair, phone, person) gets a box and label
- [ ] The app says e.g. "A chair is on the left of the camera view."
- [ ] The same object is not repeated every second
- [ ] A second object type gets its own announcement
- [ ] Describe Surroundings and Repeat Last Description work
- [ ] Pause / Resume / Stop work; Stop turns the camera light off
- [ ] Deny camera permission once: a clear error appears
- [ ] Read text from a printed page works and is read aloud
- [ ] Keyboard-only use works; screen reader mode works

## Known limits

COCO-SSD knows 80 classes. It has "dining table" (spoken as "table") but no doors or stairs; those need a
custom-trained model. Accuracy drops in dim light and with motion. Distance is not measured.
