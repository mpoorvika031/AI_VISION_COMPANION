// Voice-command listener built on the Web Speech API (SpeechRecognition).
// Support: Chrome and Edge (desktop and Android). Not available in Firefox.
// PRIVACY: in Chrome the audio is sent to the browser vendor's speech service.
// The app therefore keeps voice commands OFF until the user turns them on.

import { parseCommand } from './commands.js';

const Recognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

export const voiceCommandsSupported = Boolean(Recognition);

export class VoiceListener {
  // handlers: { onCommand(name, transcript), onHeard(transcript), onError(message), onState(listening) }
  constructor(handlers) {
    this.handlers = handlers;
    this.recognition = null;
    this.wanted = false;
    this.muted = false; // true while the app itself is speaking (avoid hearing our own voice)
    this.restartTimer = null;
  }

  start() {
    if (!voiceCommandsSupported || this.wanted) return;
    this.wanted = true;
    this._create();
  }

  stop() {
    this.wanted = false;
    clearTimeout(this.restartTimer);
    if (this.recognition) {
      this.recognition.onend = null;
      try {
        this.recognition.abort();
      } catch {
        /* ignore */
      }
      this.recognition = null;
    }
    this.handlers.onState?.(false);
  }

  setMuted(value) {
    this.muted = value;
  }

  _create() {
    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 3;

    rec.onstart = () => this.handlers.onState?.(true);

    rec.onresult = (event) => {
      if (this.muted) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        // Try every alternative until one is a known command.
        for (let a = 0; a < result.length; a++) {
          const transcript = result[a].transcript;
          const command = parseCommand(transcript);
          if (command) {
            this.handlers.onCommand?.(command, transcript.trim());
            return;
          }
        }
        this.handlers.onHeard?.(result[0].transcript.trim());
      }
    };

    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // normal
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.wanted = false;
        this.handlers.onError?.(
          'Microphone permission was denied, so voice commands are off. Allow the microphone in the browser address bar, then turn voice commands on again. The buttons work without it.'
        );
      } else if (e.error === 'network') {
        this.wanted = false;
        this.handlers.onError?.(
          'Voice commands need an internet connection in this browser. They are off now. The buttons still work.'
        );
      } else if (e.error === 'audio-capture') {
        this.wanted = false;
        this.handlers.onError?.('No microphone was found, so voice commands are off. The buttons still work.');
      } else {
        this.handlers.onError?.('Voice commands problem: ' + e.error);
      }
    };

    // Browsers end continuous recognition after a while, so restart while wanted.
    rec.onend = () => {
      this.handlers.onState?.(false);
      if (this.wanted) {
        this.restartTimer = setTimeout(() => {
          if (this.wanted) this._create();
        }, 400);
      }
    };

    this.recognition = rec;
    try {
      rec.start();
    } catch (err) {
      this.handlers.onError?.('Could not start voice commands: ' + err.message);
    }
  }
}
