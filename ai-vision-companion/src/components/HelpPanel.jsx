export default function HelpPanel({ open, onToggle }) {
  return (
    <section aria-labelledby="help-h" className="card">
      <details open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
        <summary id="help-h">Help and instructions</summary>

        <h3>How to use</h3>
        <ol>
          <li>Press Start Detection and allow the camera when the browser asks.</li>
          <li>Hold the phone or camera steady, pointing ahead. The app speaks when something new appears.</li>
          <li>Press Describe Surroundings at any time to hear everything currently seen.</li>
          <li>Press Repeat Last Description to hear the last message again.</li>
          <li>Pause stops detection but keeps the camera on. Stop turns the camera off.</li>
        </ol>

        <h3>Keyboard shortcuts</h3>
        <p>Press the key when no settings field is selected. Screen readers in browse mode may use these keys themselves, so use the buttons if a key does nothing.</p>
        <ul>
          <li>S: start or stop detection</li>
          <li>P: pause or resume</li>
          <li>D: describe surroundings</li>
          <li>R: repeat last description</li>
          <li>T: read text from the camera</li>
          <li>H: open or close this help</li>
        </ul>

        <h3>Voice commands</h3>
        <p>Turn on Voice commands in the settings, then say: "start detection", "stop detection", "pause", "resume", "describe surroundings", "repeat description", "read text" or "help".</p>

        <h3>Important safety information</h3>
        <ul>
          <li>This is an assistive prototype. It is not a certified mobility aid.</li>
          <li>It can miss objects, and it can name objects wrongly, especially in dim light, motion or clutter.</li>
          <li>Left, center and right describe where something is in the camera image, not a measured real-world direction.</li>
          <li>The app cannot measure distance with one camera. "May be close" only means an object fills a large part of the image.</li>
          <li>It does not know about steps, drops, doors, glass or moving traffic unless they happen to be detected, and it never says an area is safe.</li>
          <li>Do not use it to decide when to cross a road. Keep using your white cane, guide dog or other mobility aid.</li>
        </ul>

        <h3>Privacy</h3>
        <ul>
          <li>Camera images are analysed on this device and are never uploaded.</li>
          <li>The detection model is downloaded once from public model storage, unless a local copy is installed.</li>
          <li>Voice commands send microphone audio to the browser maker's speech service when turned on.</li>
          <li>Text reading downloads its engine from a public CDN on first use. Photos stay on the device.</li>
        </ul>

        <h3>Problems</h3>
        <ul>
          <li>No speech: raise the device volume, press Test voice in the settings, and tap the page once.</li>
          <li>Camera blocked: click the lock or camera icon in the address bar and allow the camera.</li>
          <li>Slow or laggy: choose Battery saver, or close other tabs and apps.</li>
        </ul>
      </details>
    </section>
  )
}
