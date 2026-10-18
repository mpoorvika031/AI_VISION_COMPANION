// Text-to-speech manager built on the browser SpeechSynthesis API.
//
// Rules it enforces:
//  - Only one thing is spoken at a time (no overlapping speech).
//  - 'high' priority (user actions, cautions) interrupts whatever is playing.
//  - 'normal' priority (automatic announcements) never interrupts. While
//    something is playing, only the NEWEST normal message is kept waiting,
//    older ones are dropped because they are out of date.
//  - While a long text is being read (OCR), automatic announcements are dropped.

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

// Splits long text into chunks that are safe for the browser engines
// (Chrome can silently stop on very long utterances).
export function splitIntoChunks(text, maxLen = 180) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?;:]+[.!?;:]*\s*/g) || [clean];
  const chunks = [];
  let current = '';
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  for (const s of sentences) {
    if (s.length > maxLen) {
      push();
      const words = s.split(' ');
      for (const w of words) {
        if ((current + ' ' + w).length > maxLen) push();
        current += (current ? ' ' : '') + w;
      }
      push();
    } else if ((current + s).length > maxLen) {
      push();
      current = s;
    } else {
      current += s;
    }
  }
  push();
  return chunks;
}

export class SpeechManager {
  constructor() {
    this.rate = 1;
    this.volume = 1;
    this.voiceURI = '';
    this.lang = 'en-US';
    this.current = null; // keep a reference: Chrome may garbage-collect utterances and never fire onend
    this.pendingNormal = null;
    this.sequence = []; // remaining chunks of a long reading
    this.reading = false;
    this.speaking = false;
    this.lastText = '';
    this.onSpeakingChange = null; // (bool) => void
    this.onError = null; // (message) => void
    this.voices = [];
    this.onVoices = null;

    this._voicesListener = null;
  }

  // Call once when the app mounts (safe to call again after dispose).
  attach() {
    if (!speechSupported || this._voicesListener) return;
    const load = () => {
      this.voices = window.speechSynthesis.getVoices();
      if (this.onVoices) this.onVoices(this.voices);
    };
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    this._voicesListener = load;
  }

  get supported() {
    return speechSupported;
  }

  setOptions({ rate, volume, voiceURI }) {
    if (rate !== undefined) this.rate = rate;
    if (volume !== undefined) this.volume = volume;
    if (voiceURI !== undefined) this.voiceURI = voiceURI;
  }

  _setSpeaking(value) {
    if (this.speaking !== value) {
      this.speaking = value;
      this.onSpeakingChange?.(value);
    }
  }

  _utterance(text) {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = this.rate;
    u.volume = this.volume;
    const voice = this.voices.find((v) => v.voiceURI === this.voiceURI);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = this.lang;
    }
    return u;
  }

  _play(text) {
    if (!speechSupported) return;
    const u = this._utterance(text);
    this.current = u;
    u.onstart = () => this._setSpeaking(true);
    u.onend = () => {
      if (this.current !== u) return; // was cancelled and replaced
      this.current = null;
      this._next();
    };
    u.onerror = (e) => {
      if (this.current !== u) return;
      this.current = null;
      if (e.error && e.error !== 'interrupted' && e.error !== 'canceled') {
        this.onError?.(
          e.error === 'not-allowed'
            ? 'The browser blocked speech. Tap or click anywhere on the page, then try again.'
            : `Speech problem: ${e.error}. Check that your device volume is on and a voice is installed.`
        );
      }
      this._next();
    };
    try {
      window.speechSynthesis.speak(u);
    } catch (err) {
      this.current = null;
      this._setSpeaking(false);
      this.onError?.('Speech failed: ' + err.message);
    }
  }

  _next() {
    if (this.sequence.length > 0) {
      this._play(this.sequence.shift());
      return;
    }
    this.reading = false;
    if (this.pendingNormal) {
      const text = this.pendingNormal;
      this.pendingNormal = null;
      this._play(text);
      return;
    }
    this._setSpeaking(false);
  }

  // Speak one message.
  speak(text, { priority = 'normal', remember = true } = {}) {
    if (!speechSupported || !text) return;
    if (remember) this.lastText = text;

    if (priority === 'high') {
      this.cancel();
      this._play(text);
      return;
    }
    if (this.reading) return; // never interrupt a text being read aloud
    if (this.current || window.speechSynthesis.speaking) {
      this.pendingNormal = text; // replaces any older waiting message
      return;
    }
    this._play(text);
  }

  // Read a long text (OCR result) in chunks. Stop with cancel().
  readLong(text) {
    if (!speechSupported) return false;
    const chunks = splitIntoChunks(text);
    if (chunks.length === 0) return false;
    this.cancel();
    this.reading = true;
    this.sequence = chunks.slice(1);
    this._play(chunks[0]);
    return true;
  }

  // Stops everything immediately.
  cancel() {
    this.pendingNormal = null;
    this.sequence = [];
    this.reading = false;
    const old = this.current;
    this.current = null;
    if (old) {
      old.onend = null;
      old.onerror = null;
    }
    if (speechSupported) window.speechSynthesis.cancel();
    this._setSpeaking(false);
  }

  dispose() {
    this.cancel();
    if (speechSupported && this._voicesListener) {
      window.speechSynthesis.removeEventListener?.('voiceschanged', this._voicesListener);
      this._voicesListener = null;
    }
  }
}
