import { useEffect, useRef } from 'react'

// Live camera preview with bounding boxes drawn on a canvas on top of it.
// Boxes only come from the detector. Nothing is drawn when the camera is off.
export default function CameraView({ videoRef, detections, showConfidence, cameraOn }) {
  const canvasRef = useRef(null)
  const dataRef = useRef({ detections, showConfidence })
  dataRef.current = { detections, showConfidence }

  useEffect(() => {
    function draw() {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (!canvas || !video) return
      const w = video.clientWidth
      const h = video.clientHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (!video.videoWidth) return
      const sx = w / video.videoWidth
      const sy = h / video.videoHeight
      ctx.lineWidth = 4
      ctx.font = 'bold 16px system-ui, Arial, sans-serif'
      ctx.textBaseline = 'top'
      for (const d of dataRef.current.detections) {
        const [x, y, bw, bh] = d.bbox
        const label = dataRef.current.showConfidence
          ? `${d.class} ${Math.round(d.score * 100)}%`
          : d.class
        ctx.strokeStyle = '#ffd400'
        ctx.strokeRect(x * sx, y * sy, bw * sx, bh * sy)
        const textWidth = ctx.measureText(label).width + 12
        const ly = Math.max(0, y * sy - 24)
        ctx.fillStyle = '#000'
        ctx.fillRect(x * sx, ly, textWidth, 24)
        ctx.fillStyle = '#ffd400'
        ctx.fillText(label, x * sx + 6, ly + 3)
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    if (videoRef.current) observer.observe(videoRef.current)
    return () => observer.disconnect()
  }, [videoRef, detections, showConfidence, cameraOn])

  return (
    <div className="camera">
      <video
        ref={videoRef}
        playsInline
        muted
        className={cameraOn ? 'on' : 'off'}
        aria-label="Live camera preview"
      />
      <canvas ref={canvasRef} className="overlay" aria-hidden="true" />
      {!cameraOn && <p className="camera-off">Camera is off</p>}
      <p className={'camera-badge ' + (cameraOn ? 'live' : '')} role="presentation">
        {cameraOn ? 'CAMERA ON' : 'CAMERA OFF'}
      </p>
    </div>
  )
}
