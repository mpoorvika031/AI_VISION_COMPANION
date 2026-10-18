import { voiceCommandsSupported } from '../lib/voice.js'

export default function SettingsPanel({ settings, update, voices, speechSupported, onTestVoice }) {
  const englishFirst = [...voices].sort((a, b) => {
    const ae = a.lang.toLowerCase().startsWith('en') ? 0 : 1
    const be = b.lang.toLowerCase().startsWith('en') ? 0 : 1
    return ae - be || a.name.localeCompare(b.name)
  })

  return (
    <section aria-labelledby="settings-h" className="card">
      <h2 id="settings-h">Speech and detection settings</h2>

      {!speechSupported && (
        <p className="error-text" role="alert">
          Spoken output is not supported in this browser. Choose "Screen reader" below, or use Chrome or Edge.
        </p>
      )}

      <div className="field">
        <label htmlFor="output">Announcements are spoken by</label>
        <select id="output" value={settings.output} onChange={(e) => update({ output: e.target.value })}>
          <option value="voice">This app's voice</option>
          <option value="screenreader">My screen reader (TalkBack, VoiceOver, NVDA)</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="rate">Speech rate: {settings.rate.toFixed(1)}</label>
        <input id="rate" type="range" min="0.5" max="2" step="0.1" value={settings.rate}
          onChange={(e) => update({ rate: Number(e.target.value) })} />
      </div>

      <div className="field">
        <label htmlFor="volume">Volume: {Math.round(settings.volume * 100)} percent</label>
        <input id="volume" type="range" min="0" max="1" step="0.1" value={settings.volume}
          onChange={(e) => update({ volume: Number(e.target.value) })} />
      </div>

      {voices.length > 0 && (
        <div className="field">
          <label htmlFor="voice">Voice</label>
          <select id="voice" value={settings.voiceURI} onChange={(e) => update({ voiceURI: e.target.value })}>
            <option value="">Default voice</option>
            {englishFirst.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>
      )}

      <button type="button" onClick={onTestVoice} className="secondary">
        Test voice
      </button>

      <div className="field">
        <label htmlFor="sensitivity">Detection strictness</label>
        <select id="sensitivity" value={settings.sensitivity}
          onChange={(e) => update({ sensitivity: Number(e.target.value) })}>
          <option value="0.4">Sensitive: finds more, more mistakes</option>
          <option value="0.55">Balanced</option>
          <option value="0.7">Strict: fewer mistakes, misses more</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="interval">Detection speed</label>
        <select id="interval" value={settings.interval}
          onChange={(e) => update({ interval: Number(e.target.value) })}>
          <option value="300">Fast (uses more battery)</option>
          <option value="600">Balanced</option>
          <option value="1200">Battery saver</option>
        </select>
      </div>

      <div className="check">
        <input id="positions" type="checkbox" checked={settings.positions}
          onChange={(e) => update({ positions: e.target.checked })} />
        <label htmlFor="positions">Say where an object appears in the camera view (left, center, right)</label>
      </div>
      <div className="check">
        <input id="caution" type="checkbox" checked={settings.caution}
          onChange={(e) => update({ caution: e.target.checked })} />
        <label htmlFor="caution">Warn when an object fills much of the camera view (it may be close)</label>
      </div>
      <div className="check">
        <input id="confidence" type="checkbox" checked={settings.showConfidence}
          onChange={(e) => update({ showConfidence: e.target.checked })} />
        <label htmlFor="confidence">Show confidence percentages</label>
      </div>
      <div className="check">
        <input id="voicecmd" type="checkbox" checked={settings.voiceCommands}
          disabled={!voiceCommandsSupported}
          onChange={(e) => update({ voiceCommands: e.target.checked })} />
        <label htmlFor="voicecmd">
          Voice commands {voiceCommandsSupported ? '' : '(not supported in this browser, use the buttons)'}
        </label>
      </div>
      <p className="note">
        Voice commands use the microphone. In Chrome and Edge the microphone audio is sent to the
        browser maker's speech service to be understood. Camera images are never sent anywhere.
      </p>
    </section>
  )
}
