import { useEffect, useRef, useState } from 'react'
import CameraView from './components/CameraView.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import OcrPanel from './components/OcrPanel.jsx'
import HelpPanel from './components/HelpPanel.jsx'
import { loadDetector, detectFrame, getModelInfo } from './lib/detector.js'
import {
  SceneTracker, Announcer, groupDetections, buildSentence, buildWarning, friendlyName, positionOf,
  DEFAULTS as SCENE_DEFAULTS,
} from './lib/scene.js'
import { SpeechManager, speechSupported } from './lib/speech.js'
import { VoiceListener, voiceCommandsSupported } from './lib/voice.js'
import { COMMAND_LABELS } from './lib/commands.js'
import {
  toCanvas, fileToCanvas, recognizeText, setOcrProgressHandler, disposeOcr,
} from './lib/ocr.js'
import {
  cameraErrorMessage, insecureContextMessage, unsupportedCameraMessage, modelErrorMessage, ocrErrorMessage,
} from './lib/errors.js'

const DEFAULT_SETTINGS = {
  output: 'voice', // 'voice' = app speaks, 'screenreader' = text goes to a live region
  rate: 1,
  volume: 1,
  voiceURI: '',
  positions: true,
  caution: true,
  showConfidence: true,
  sensitivity: 0.55,
  interval: 600,
  voiceCommands: false,
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('avc-settings') || '{}')
    return { ...DEFAULT_SETTINGS, ...saved, voiceCommands: false } // microphone always starts off
  } catch {
    return DEFAULT_SETTINGS
  }
}

const POS_TEXT = { left: 'on the left of the camera view', center: 'in the center of the camera view', right: 'on the right of the camera view' }

export default function App() {
  // ---------- visible state ----------
  const [settings, setSettings] = useState(loadSettings)
  const [phase, setPhase] = useState('idle') // idle | starting | running | paused
  const [modelState, setModelState] = useState('loading') // loading | ready | error
  const [status, setStatus] = useState({ text: 'Loading the detection model. Please wait.', kind: 'info' })
  const [detections, setDetections] = useState([])
  const [lastDescription, setLastDescription] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [voices, setVoices] = useState([])
  const [heard, setHeard] = useState('')
  const [listening, setListening] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrProgress, setOcrProgress] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [readingAloud, setReadingAloud] = useState(false)
  const [liveNormal, setLiveNormal] = useState('')
  const [liveUrgent, setLiveUrgent] = useState('')
  const [modelInfo, setModelInfo] = useState({ source: '', backend: '' })
  const [speechError, setSpeechError] = useState('')

  // ---------- refs (values the detection loop needs without re-rendering) ----------
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const modelRef = useRef(null)
  const timerRef = useRef(null)
  const phaseRef = useRef('idle')
  const tokenRef = useRef(0)
  const errorCountRef = useRef(0)
  const trackerRef = useRef(new SceneTracker())
  const announcerRef = useRef(new Announcer())
  const speechRef = useRef(null)
  if (!speechRef.current) speechRef.current = new SpeechManager()
  const voiceRef = useRef(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const lastSceneRef = useRef('')
  const ocrBusyRef = useRef(false)
  const wakeLockRef = useRef(null)
  const unmuteTimerRef = useRef(null)
  const actionsRef = useRef({})
  const helpOpenRef = useRef(false)

  function changePhase(next) {
    phaseRef.current = next
    setPhase(next)
  }

  function showStatus(text, kind = 'info') {
    setStatus({ text, kind })
  }

  // ---------- speaking ----------
  // Every spoken message goes through here. It either uses the app voice or
  // writes the text into a screen-reader live region (user choice).
  function say(text, { priority = 'normal', scene = false } = {}) {
    if (!text) return
    if (scene) {
      lastSceneRef.current = text
      setLastDescription(text)
    }
    if (settingsRef.current.output === 'screenreader') {
      const setter = priority === 'high' ? setLiveUrgent : setLiveNormal
      setter('')
      setTimeout(() => setter(text), 60)
      return
    }
    speechRef.current.speak(text, { priority, remember: false })
  }

  function updateSettings(patch) {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try {
        const { voiceCommands, ...persist } = next
        void voiceCommands
        localStorage.setItem('avc-settings', JSON.stringify(persist))
      } catch {
        /* storage may be unavailable */
      }
      return next
    })
  }

  // ---------- camera and wake lock ----------
  async function getCamera() {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
    } catch (err) {
      if (err && (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError')) {
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      }
      throw err
    }
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null
        })
      }
    } catch {
      /* not critical */
    }
  }

  function releaseWakeLock() {
    try {
      wakeLockRef.current?.release()
    } catch {
      /* ignore */
    }
    wakeLockRef.current = null
  }

  function releaseCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  function failStart(message) {
    releaseCamera()
    releaseWakeLock()
    changePhase('idle')
    setDetections([])
    showStatus(message, 'error')
    say(message, { priority: 'high' })
  }

  // ---------- detection loop ----------
  async function loop() {
    if (phaseRef.current !== 'running') return
    const video = videoRef.current
    const s = settingsRef.current
    if (!document.hidden && !ocrBusyRef.current && video && video.readyState >= 2 && modelRef.current) {
      try {
        const predictions = await detectFrame(modelRef.current, video, s.sensitivity)
        if (phaseRef.current !== 'running') return
        errorCountRef.current = 0
        setDetections(predictions)
        const stable = trackerRef.current.push(predictions, video.videoWidth, video.videoHeight)
        const decision = announcerRef.current.decide(stable, performance.now(), {
          positions: s.positions,
          caution: s.caution,
        })
        if (decision) say(decision.text, { priority: decision.priority, scene: true })
      } catch (err) {
        console.error(err)
        errorCountRef.current += 1
        if (errorCountRef.current >= 3) {
          stopEverything()
          const msg = 'Detection stopped because of repeated errors. Press Start Detection to try again, or reload the page.'
          showStatus(msg, 'error')
          say(msg, { priority: 'high' })
          return
        }
      }
    }
    timerRef.current = setTimeout(loop, settingsRef.current.interval)
  }

  function stopEverything() {
    tokenRef.current += 1
    clearTimeout(timerRef.current)
    releaseCamera()
    releaseWakeLock()
    changePhase('idle')
    setDetections([])
  }

  // ---------- main actions ----------
  async function start() {
    if (phaseRef.current === 'running' || phaseRef.current === 'starting') return
    if (phaseRef.current === 'paused') {
      resume()
      return
    }
    const token = ++tokenRef.current
    changePhase('starting')
    showStatus('Starting the camera. Please wait.', 'info')
    say('Starting the camera.', { priority: 'high' }) // also unlocks audio on phones

    if (!window.isSecureContext) return failStart(insecureContextMessage())
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return failStart(unsupportedCameraMessage())

    let stream
    try {
      stream = await getCamera()
    } catch (err) {
      console.error(err)
      if (token === tokenRef.current) failStart(cameraErrorMessage(err))
      return
    }
    if (token !== tokenRef.current) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    streamRef.current = stream
    stream.getVideoTracks().forEach((track) =>
      track.addEventListener('ended', () => {
        if (streamRef.current === stream && phaseRef.current !== 'idle') {
          stopEverything()
          const msg = 'The camera was turned off by the device. Press Start Detection to begin again.'
          showStatus(msg, 'error')
          say(msg, { priority: 'high' })
        }
      })
    )
    const video = videoRef.current
    video.srcObject = stream
    try {
      await video.play()
    } catch (err) {
      console.error(err)
      if (token === tokenRef.current) failStart('The camera preview could not start. Reload the page and try again.')
      return
    }

    if (modelRef.current == null) showStatus('Camera is on. Loading the detection model. Please wait.', 'info')
    try {
      modelRef.current = await loadDetector()
      setModelState('ready')
      setModelInfo(getModelInfo())
    } catch (err) {
      console.error(err)
      setModelState('error')
      if (token === tokenRef.current) failStart(modelErrorMessage())
      return
    }
    if (token !== tokenRef.current) return

    trackerRef.current.reset()
    announcerRef.current.reset()
    errorCountRef.current = 0
    changePhase('running')
    requestWakeLock()
    showStatus('Detecting objects. Camera is on.', 'ok')
    say('Detection started. This can miss objects, so do not rely on it for safety.', { priority: 'high' })
    loop()
  }

  function pause() {
    if (phaseRef.current !== 'running') return
    clearTimeout(timerRef.current)
    changePhase('paused')
    setDetections([])
    releaseWakeLock()
    speechRef.current.cancel()
    showStatus('Detection paused. The camera is still on.', 'info')
    say('Detection paused.', { priority: 'high' })
  }

  function resume() {
    if (phaseRef.current !== 'paused') return
    trackerRef.current.reset()
    announcerRef.current.reset()
    errorCountRef.current = 0
    changePhase('running')
    requestWakeLock()
    showStatus('Detecting objects. Camera is on.', 'ok')
    say('Detection resumed.', { priority: 'high' })
    loop()
  }

  function stop() {
    if (phaseRef.current === 'idle') {
      say('Detection is already stopped.', { priority: 'high' })
      return
    }
    stopEverything()
    speechRef.current.cancel()
    showStatus('Detection stopped. The camera is off.', 'info')
    say('Detection stopped. The camera is off.', { priority: 'high' })
  }

  async function describe() {
    const s = settingsRef.current
    const video = videoRef.current
    if (!streamRef.current || !modelRef.current || !video || video.readyState < 2 || phaseRef.current === 'idle') {
      const msg = 'The camera is off. Press Start Detection first.'
      showStatus(msg, 'info')
      say(msg, { priority: 'high' })
      return
    }
    try {
      const predictions = await detectFrame(modelRef.current, video, s.sensitivity)
      const groups = groupDetections(predictions, video.videoWidth, video.videoHeight)
      let text = buildSentence(groups, { positions: s.positions, mode: 'describe', maxGroups: 6 })
      const big = groups.find((g) => g.largest >= SCENE_DEFAULTS.largeAreaFraction)
      if (s.caution && big) text += ' ' + buildWarning(big.label)
      setDetections(predictions)
      say(text, { priority: 'high', scene: true })
    } catch (err) {
      console.error(err)
      const msg = 'Could not analyse the camera image. Please try again.'
      showStatus(msg, 'error')
      say(msg, { priority: 'high' })
    }
  }

  function repeat() {
    if (lastSceneRef.current) say(lastSceneRef.current, { priority: 'high' })
    else say('There is nothing to repeat yet.', { priority: 'high' })
  }

  function toggleHelp(open) {
    if (helpOpenRef.current === open) return // ignore the echo from the <details> element
    helpOpenRef.current = open
    setHelpOpen(open)
    if (open) {
      say(
        'Help. Say start detection, stop detection, pause, resume, describe surroundings, repeat description, or read text. ' +
          'Keyboard shortcuts are S, P, D, R, T and H. This app can miss objects and is not a mobility aid.',
        { priority: 'high' }
      )
    }
  }

  // ---------- OCR ----------
  async function runOcr(makeCanvas) {
    if (ocrBusyRef.current) return
    ocrBusyRef.current = true
    setOcrBusy(true)
    setOcrProgress('Preparing the text reader. The first time can take a while.')
    say('Reading text. Please wait.', { priority: 'high' })
    setOcrProgressHandler((m) => {
      if (m.status === 'recognizing text') setOcrProgress(`Reading text: ${Math.round(m.progress * 100)} percent`)
      else if (m.status) setOcrProgress(`Preparing the text reader: ${m.status}`)
    })
    try {
      const canvas = await makeCanvas()
      const text = await recognizeText(canvas)
      if (!text) {
        setOcrText('')
        setOcrProgress('No readable text was found.')
        say('No readable text was found. Hold the page steady in good light and try again.', { priority: 'high' })
      } else {
        setOcrText(text)
        setOcrProgress('Text found.')
        if (settingsRef.current.output === 'screenreader') {
          say('Text found. It is in the Text found box.', { priority: 'high' })
        } else {
          speechRef.current.readLong(text)
        }
      }
    } catch (err) {
      console.error(err)
      const msg = ocrErrorMessage()
      setOcrProgress(msg)
      say(msg, { priority: 'high' })
    } finally {
      ocrBusyRef.current = false
      setOcrBusy(false)
    }
  }

  function readTextFromCamera() {
    const video = videoRef.current
    if (!streamRef.current || !video || video.readyState < 2) {
      say('The camera is off. Start detection first, or choose a photo.', { priority: 'high' })
      return
    }
    runOcr(async () => toCanvas(video))
  }

  function readTextFromFile(file) {
    runOcr(() => fileToCanvas(file))
  }

  function readAgain() {
    if (ocrText) speechRef.current.readLong(ocrText)
  }

  function stopReading() {
    speechRef.current.cancel()
  }

  function testVoice() {
    say('This is the voice of A I Vision Companion.', { priority: 'high' })
  }

  // keep the latest versions of the actions available to long-lived handlers
  actionsRef.current = {
    start, stop, pause, resume, describe, repeat, readText: readTextFromCamera, help: () => toggleHelp(!helpOpenRef.current),
    toggleStart: () => (phaseRef.current === 'idle' ? start() : stop()),
    togglePause: () => (phaseRef.current === 'paused' ? resume() : pause()),
  }

  // ---------- effects ----------
  // Preload the model, set up speech, clean up everything on unmount.
  useEffect(() => {
    const speech = speechRef.current
    speech.attach()
    speech.onVoices = setVoices
    setVoices(speech.voices)
    speech.onSpeakingChange = (value) => {
      if (value) setSpeechError('')
      setSpeaking(value)
      setReadingAloud(value && speech.reading)
    }
    speech.onError = (message) => setSpeechError(message)

    let cancelled = false
    loadDetector()
      .then((model) => {
        if (cancelled) return
        modelRef.current = model
        setModelState('ready')
        setModelInfo(getModelInfo())
        if (phaseRef.current === 'idle') showStatus('Ready. Press Start Detection.', 'ok')
      })
      .catch((err) => {
        if (cancelled) return
        console.error(err)
        setModelState('error')
        showStatus(modelErrorMessage(), 'error')
      })

    return () => {
      cancelled = true
      tokenRef.current += 1
      clearTimeout(timerRef.current)
      clearTimeout(unmuteTimerRef.current)
      releaseCamera()
      releaseWakeLock()
      voiceRef.current?.stop()
      speech.dispose()
      disposeOcr()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply speech settings.
  useEffect(() => {
    speechRef.current.setOptions({ rate: settings.rate, volume: settings.volume, voiceURI: settings.voiceURI })
  }, [settings.rate, settings.volume, settings.voiceURI])

  // Voice commands on/off.
  useEffect(() => {
    if (!settings.voiceCommands) {
      voiceRef.current?.stop()
      voiceRef.current = null
      setListening(false)
      return undefined
    }
    const listener = new VoiceListener({
      onState: setListening,
      onHeard: (t) => setHeard(`Heard "${t}". That is not a command. Say "help" for the list.`),
      onCommand: (name, transcript) => {
        setHeard(`Heard "${transcript}". Command: ${COMMAND_LABELS[name]}.`)
        actionsRef.current[name]?.()
      },
      onError: (message) => {
        updateSettings({ voiceCommands: false })
        showStatus(message, 'error')
        say(message, { priority: 'high' })
      },
    })
    voiceRef.current = listener
    listener.start()
    say('Voice commands are on.', { priority: 'high' })
    return () => {
      listener.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.voiceCommands])

  // Do not let the microphone hear the app's own voice.
  useEffect(() => {
    clearTimeout(unmuteTimerRef.current)
    if (speaking) voiceRef.current?.setMuted(true)
    else unmuteTimerRef.current = setTimeout(() => voiceRef.current?.setMuted(false), 700)
  }, [speaking])

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (e.target && e.target.tagName) || ''
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const a = actionsRef.current
      switch (e.key.toLowerCase()) {
        case 's': a.toggleStart(); break
        case 'p': a.togglePause(); break
        case 'd': a.describe(); break
        case 'r': a.repeat(); break
        case 't': a.readText(); break
        case 'h': a.help(); break
        default: return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Re-acquire the screen wake lock when the tab becomes visible again.
  useEffect(() => {
    function onVisible() {
      if (!document.hidden && phaseRef.current === 'running') requestWakeLock()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- render ----------
  const cameraOn = phase === 'running' || phase === 'paused'
  const busyStarting = phase === 'starting'
  const frame = videoRef.current
  const frameWidth = (frame && frame.videoWidth) || 1

  return (
    <>
      <a className="skip" href="#controls">Skip to controls</a>
      <header>
        <h1>AI Vision Companion</h1>
        <p>
          Welcome. Point your phone or camera ahead and press Start Detection. The app will tell you
          what objects it sees, out loud.
        </p>
      </header>

      <main>
        <section className="safety" role="note" aria-label="Safety notice">
          <strong>Safety:</strong> This is an assistive prototype, not a mobility aid. It can miss or
          misidentify objects and cannot measure distance. Never use it to decide if it is safe to
          cross. Keep using your white cane, guide dog or other aids.
        </section>

        <div className={'status ' + status.kind} role="status" aria-live="polite" id="status">
          {status.text}
        </div>
        <p className="mini-status">
          Model: {modelState === 'ready' ? `ready (${modelInfo.backend}, ${modelInfo.source})` : modelState === 'loading' ? 'loading' : 'failed'}
          {' · '}
          Voice: {speaking ? 'speaking' : 'quiet'}
          {settings.voiceCommands ? ` · Listening: ${listening ? 'yes' : 'no'}` : ''}
        </p>
        {speechError && (
          <p className="error-text" role="alert">{speechError}</p>
        )}
        {modelState === 'error' && (
          <button type="button" className="secondary" onClick={() => {
            setModelState('loading')
            showStatus('Loading the detection model. Please wait.', 'info')
            loadDetector()
              .then((m) => { modelRef.current = m; setModelState('ready'); setModelInfo(getModelInfo()); showStatus('Ready. Press Start Detection.', 'ok') })
              .catch(() => { setModelState('error'); showStatus(modelErrorMessage(), 'error') })
          }}>
            Try Again
          </button>
        )}

        <section id="controls" aria-labelledby="controls-h" className="card">
          <h2 id="controls-h">Controls</h2>
          <div className="button-row">
            <button type="button" className="primary" onClick={start} disabled={phase !== 'idle'}>
              {busyStarting ? 'Starting…' : 'Start Detection'}
            </button>
          </div>
          <div className="button-grid">
            <button type="button" onClick={pause} disabled={phase !== 'running'}>Pause</button>
            <button type="button" onClick={resume} disabled={phase !== 'paused'}>Resume</button>
            <button type="button" onClick={stop} disabled={phase === 'idle'}>Stop</button>
            <button type="button" onClick={describe} disabled={!cameraOn}>Describe Surroundings</button>
            <button type="button" onClick={repeat} disabled={!lastDescription}>Repeat Last Description</button>
          </div>
          <p className="note">Shortcuts: S start or stop, P pause or resume, D describe, R repeat, T read text, H help.</p>
        </section>

        <section aria-labelledby="camera-h" className="card">
          <h2 id="camera-h">Camera</h2>
          <CameraView
            videoRef={videoRef}
            detections={detections}
            showConfidence={settings.showConfidence}
            cameraOn={cameraOn}
          />
        </section>

        <section aria-labelledby="objects-h" className="card">
          <h2 id="objects-h">Detected objects</h2>
          {!cameraOn ? (
            <p>The camera is off, so nothing is being detected.</p>
          ) : phase === 'paused' ? (
            <p>Detection is paused.</p>
          ) : detections.length === 0 ? (
            <p>No objects detected right now.</p>
          ) : (
            <ul className="objects">
              {detections.map((d, i) => (
                <li key={i}>
                  <strong>{friendlyName(d.class)}</strong>
                  {settings.showConfidence ? `, ${Math.round(d.score * 100)} percent confidence` : ''}
                  {', '}
                  {POS_TEXT[positionOf(d.bbox, frameWidth)]}
                </li>
              ))}
            </ul>
          )}
          <h3>Last description</h3>
          <p className="last">{lastDescription || 'Nothing has been described yet.'}</p>
        </section>

        <OcrPanel
          cameraOn={cameraOn}
          busy={ocrBusy}
          progress={ocrProgress}
          text={ocrText}
          readingAloud={readingAloud}
          onCaptureCamera={readTextFromCamera}
          onFile={readTextFromFile}
          onRead={readAgain}
          onStopReading={stopReading}
        />

        <SettingsPanel
          settings={settings}
          update={updateSettings}
          voices={voices}
          speechSupported={speechSupported}
          onTestVoice={testVoice}
        />

        {settings.voiceCommands && (
          <p className="note" role="status" aria-live="polite">
            {voiceCommandsSupported ? (listening ? 'Listening for commands. ' : 'Voice commands starting. ') : ''}
            {heard}
          </p>
        )}

        <HelpPanel open={helpOpen} onToggle={toggleHelp} />
      </main>

      <footer>
        <p>AI Vision Companion is a student prototype. Detection uses the COCO-SSD model with TensorFlow.js and runs on your device.</p>
      </footer>

      {/* Used when the person chooses "My screen reader" for announcements. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{liveNormal}</div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">{liveUrgent}</div>
    </>
  )
}
