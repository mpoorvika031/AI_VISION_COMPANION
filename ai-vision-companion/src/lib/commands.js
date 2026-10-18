// Maps what the user said to an app command. Pure function, easy to test.
// Returns one of: 'start' | 'stop' | 'pause' | 'resume' | 'describe' | 'repeat' | 'readText' | 'help' | null

const RULES = [
  ['repeat', /\b(repeat|say (that )?again|once more)\b/],
  ['describe', /\b(describe|what('?s| is| do you see)?\b.*\b(around|front|ahead|here)|surroundings)\b/],
  ['readText', /\b(read( the)? (text|this|document|page|sign)|read text|scan text|capture text)\b/],
  ['help', /\b(help|instructions|what can i say)\b/],
  ['resume', /\b(resume|continue|unpause)\b/],
  ['pause', /\bpause\b/],
  ['stop', /\b(stop|end|finish|quit|turn off)\b/],
  ['start', /\b(start|begin|launch|turn on)\b/],
];

export function parseCommand(transcript) {
  if (!transcript) return null;
  const text = String(transcript).toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  for (const [name, regex] of RULES) {
    if (regex.test(text)) return name;
  }
  return null;
}

export const COMMAND_LABELS = {
  start: 'Start detection',
  stop: 'Stop detection',
  pause: 'Pause detection',
  resume: 'Resume detection',
  describe: 'Describe surroundings',
  repeat: 'Repeat description',
  readText: 'Read text',
  help: 'Help',
};
