import { useRef } from 'react'

export default function OcrPanel({
  cameraOn, busy, progress, text, readingAloud,
  onCaptureCamera, onFile, onRead, onStopReading,
}) {
  const fileRef = useRef(null)

  return (
    <section aria-labelledby="ocr-h" className="card">
      <h2 id="ocr-h">Read text aloud</h2>
      <p>
        Capture a page, sign or newspaper and hear it read out. Take a close, bright, steady photo
        for the best result. Object detection is paused while text is being read.
      </p>

      <div className="button-row">
        <button type="button" onClick={onCaptureCamera} disabled={busy || !cameraOn}>
          Read Text From Camera
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
          Take or Choose a Photo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onFile(file)
          }}
        />
      </div>
      {!cameraOn && (
        <p className="note">"Read Text From Camera" needs the camera on. Start detection first, or choose a photo.</p>
      )}

      <p className="progress" role="status" aria-live="polite">{progress}</p>

      <label htmlFor="ocr-text">Text found</label>
      <textarea id="ocr-text" readOnly rows={7} value={text} placeholder="Recognized text will appear here." />

      <div className="button-row">
        <button type="button" onClick={onRead} disabled={!text || readingAloud || busy} className="secondary">
          Read Aloud
        </button>
        <button type="button" onClick={onStopReading} disabled={!readingAloud} className="secondary">
          Stop Reading
        </button>
      </div>
      <p className="note">
        The first time, the text reader (about 10 to 15 MB) is downloaded from a public CDN, so an
        internet connection is needed. Your photo is processed on your device and is not uploaded.
        Text recognition can make mistakes, especially with handwriting or poor light.
      </p>
    </section>
  )
}
