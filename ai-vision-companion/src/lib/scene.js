// Scene logic: turns raw detections into short spoken sentences and decides
// WHEN something is worth announcing. Pure functions and plain classes only
// (no browser APIs), so it can be unit-tested with `npm test`.

// COCO class names -> friendlier spoken names.
const FRIENDLY = {
  'dining table': 'table',
  'cell phone': 'mobile phone',
  tv: 'television',
  remote: 'remote control',
  'potted plant': 'potted plant',
  couch: 'sofa',
  'hair drier': 'hair dryer',
  laptop: 'laptop',
  backpack: 'backpack',
  handbag: 'bag',
  suitcase: 'suitcase',
};

const IRREGULAR_PLURALS = {
  person: 'people',
  knife: 'knives',
  mouse: 'mice',
  sheep: 'sheep',
  scissors: 'scissors',
  skis: 'skis',
  'traffic light': 'traffic lights',
  'fire hydrant': 'fire hydrants',
  'stop sign': 'stop signs',
};

// Higher number = more important to say first.
const PRIORITY = {
  person: 100,
  bicycle: 92,
  motorcycle: 92,
  car: 90,
  bus: 90,
  truck: 90,
  train: 90,
  'traffic light': 85,
  'stop sign': 85,
  'fire hydrant': 70,
  dog: 75,
  cat: 70,
  horse: 70,
  bench: 60,
  chair: 60,
  couch: 55,
  'dining table': 58,
  bed: 50,
  toilet: 50,
  suitcase: 45,
  backpack: 40,
  handbag: 40,
  umbrella: 40,
};

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export const DEFAULTS = {
  stabilityWindow: 3, // frames used to smooth out flicker
  minGapMs: 2500, // minimum time between two automatic announcements
  labelCooldownMs: 10000, // same object is not re-announced within this time
  warnCooldownMs: 8000, // "may be close" warning cooldown per object type
  emptyAnnounce: true, // say "No objects detected" once when a scene empties
  largeAreaFraction: 0.35, // box covering this much of the frame counts as "large in view"
  maxGroups: 3, // at most this many object kinds per sentence
};

export function friendlyName(label) {
  return FRIENDLY[label] || label;
}

export function pluralName(label) {
  const name = friendlyName(label);
  if (IRREGULAR_PLURALS[label]) return IRREGULAR_PLURALS[label];
  if (IRREGULAR_PLURALS[name]) return IRREGULAR_PLURALS[name];
  const words = name.split(' ');
  const last = words.pop();
  let plural;
  if (/(s|x|z|ch|sh)$/.test(last)) plural = last + 'es';
  else if (/[^aeiou]y$/.test(last)) plural = last.slice(0, -1) + 'ies';
  else plural = last + 's';
  return [...words, plural].join(' ');
}

export function article(name) {
  return /^[aeiou]/i.test(name) ? 'an' : 'a';
}

export function numberWord(n) {
  return n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
}

export function groupPhrase(label, count) {
  if (count === 1) {
    const name = friendlyName(label);
    return `${article(name)} ${name}`;
  }
  return `${numberWord(count)} ${pluralName(label)}`;
}

export function joinList(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Where is the box inside the camera image? This is a position in the IMAGE,
// not a measured real-world direction.
export function positionOf(bbox, frameWidth) {
  const [x, , w] = bbox;
  const cx = (x + w / 2) / frameWidth;
  if (cx < 1 / 3) return 'left';
  if (cx > 2 / 3) return 'right';
  return 'center';
}

const POS_SHORT = { left: 'on the left', center: 'in the center', right: 'on the right' };
const POS_LONG = {
  left: 'on the left of the camera view',
  center: 'in the center of the camera view',
  right: 'on the right of the camera view',
};

// Fraction of the frame covered by the box (0..1). A large box MAY mean the
// object is close, but it can also just be a big object far away.
export function areaFraction(bbox, frameWidth, frameHeight) {
  const [, , w, h] = bbox;
  return Math.max(0, Math.min(1, (w * h) / (frameWidth * frameHeight)));
}

// predictions: [{ class, score, bbox:[x,y,w,h] }]
// Returns groups sorted by importance: [{ label, count, pos, largest }]
export function groupDetections(predictions, frameWidth, frameHeight) {
  const map = new Map();
  for (const p of predictions) {
    if (!map.has(p.class)) map.set(p.class, { label: p.class, count: 0, positions: new Set(), largest: 0 });
    const g = map.get(p.class);
    g.count += 1;
    g.positions.add(positionOf(p.bbox, frameWidth));
    g.largest = Math.max(g.largest, areaFraction(p.bbox, frameWidth, frameHeight));
  }
  const groups = [...map.values()].map((g) => ({
    label: g.label,
    count: g.count,
    // A position is only given when every object of this kind is in the same part of the view.
    pos: g.positions.size === 1 ? [...g.positions][0] : null,
    largest: g.largest,
  }));
  groups.sort((a, b) => (PRIORITY[b.label] || 10) - (PRIORITY[a.label] || 10) || b.count - a.count);
  return groups;
}

// Builds one spoken sentence.
// opts.positions: mention left/center/right of the camera view
// opts.mode: 'announce' (automatic) or 'describe' (user asked)
export function buildSentence(groups, opts = {}) {
  const { positions = true, mode = 'announce', maxGroups = DEFAULTS.maxGroups } = opts;
  if (groups.length === 0) return 'No objects detected.';

  const shown = groups.slice(0, maxGroups);
  const more = groups.length > shown.length;

  if (mode === 'announce' && shown.length === 1 && shown[0].count === 1 && !more) {
    const g = shown[0];
    const phrase = capitalize(groupPhrase(g.label, 1));
    return positions && g.pos ? `${phrase} is ${POS_LONG[g.pos]}.` : `${phrase} is detected.`;
  }

  const phrases = shown.map((g) => {
    const base = groupPhrase(g.label, g.count);
    return positions && g.pos ? `${base} ${POS_SHORT[g.pos]}` : base;
  });
  if (more) phrases.push('other objects');
  const list = joinList(phrases);

  if (mode === 'describe') return `I can see ${list}.`;
  const plural = shown.length > 1 || shown[0].count > 1 || more;
  return `${capitalize(list)} ${plural ? 'are' : 'is'} detected.`;
}

// Caution sentence for objects that fill a large part of the view.
// This is a heuristic about image size, NOT a measured distance.
export function buildWarning(label) {
  const name = friendlyName(label);
  return `A ${name} fills much of the camera view and may be close. Please be cautious.`;
}

// Smooths detections over the last few frames so one noisy frame does not
// trigger speech. A count is "stable" if at least 2 of the last 3 frames had
// at least that many objects of the kind (the median of 3).
export class SceneTracker {
  constructor(windowSize = DEFAULTS.stabilityWindow) {
    this.windowSize = windowSize;
    this.history = [];
  }

  reset() {
    this.history = [];
  }

  // Returns null until enough frames are collected, then
  // { counts: {label: n}, groups: [...] } for the stable scene.
  push(predictions, frameWidth, frameHeight) {
    const groups = groupDetections(predictions, frameWidth, frameHeight);
    const frame = {};
    const info = {};
    for (const g of groups) {
      frame[g.label] = g.count;
      info[g.label] = g;
    }
    this.history.push({ frame, info });
    if (this.history.length > this.windowSize) this.history.shift();
    if (this.history.length < this.windowSize) return null;

    const labels = new Set();
    this.history.forEach((h) => Object.keys(h.frame).forEach((l) => labels.add(l)));

    const counts = {};
    const stableGroups = [];
    for (const label of labels) {
      const series = this.history.map((h) => h.frame[label] || 0).sort((a, b) => a - b);
      const median = series[Math.floor(series.length / 2)];
      if (median > 0) {
        counts[label] = median;
        // Use the most recent frame that contains this label for position / size.
        let latest = null;
        for (let i = this.history.length - 1; i >= 0; i--) {
          if (this.history[i].info[label]) {
            latest = this.history[i].info[label];
            break;
          }
        }
        stableGroups.push({ ...latest, count: median });
      }
    }
    stableGroups.sort((a, b) => (PRIORITY[b.label] || 10) - (PRIORITY[a.label] || 10) || b.count - a.count);
    return { counts, groups: stableGroups };
  }
}

// Decides what (if anything) to say automatically. Keeps its own memory of what
// was already announced, so the same scene is never repeated.
export class Announcer {
  constructor(options = {}) {
    this.cfg = { ...DEFAULTS, ...options };
    this.reset();
  }

  reset() {
    this.lastCounts = {};
    this.labelLastAt = {};
    this.warnLastAt = {};
    this.lastAnnounceAt = -Infinity;
    this.pendingEmpty = false; // true when the scene just emptied and "No objects" is still to be said
  }

  // stable: result of SceneTracker.push (or null)
  // settings: { positions: bool, caution: bool }
  // Returns { text, priority: 'normal'|'high' } or null
  decide(stable, now, settings = {}) {
    if (!stable) return null;
    const { positions = true, caution = true } = settings;
    const cfg = this.cfg;
    const labels = Object.keys(stable.counts);

    // Scene became empty: say so once (not repeatedly).
    if (labels.length === 0) {
      if (Object.keys(this.lastCounts).length > 0) {
        this.lastCounts = {};
        this.pendingEmpty = true;
      }
      if (this.pendingEmpty && cfg.emptyAnnounce && now - this.lastAnnounceAt >= cfg.minGapMs) {
        this.pendingEmpty = false;
        this.lastAnnounceAt = now;
        return { text: 'No objects detected.', priority: 'normal' };
      }
      return null;
    }
    this.pendingEmpty = false;

    // Objects that left or decreased: forget them quietly (no speech).
    for (const label of Object.keys(this.lastCounts)) {
      const now_ = stable.counts[label] || 0;
      if (now_ < this.lastCounts[label]) {
        if (now_ === 0) delete this.lastCounts[label];
        else this.lastCounts[label] = now_;
      }
    }

    if (now - this.lastAnnounceAt < cfg.minGapMs) return null;

    // 1) Caution for very large objects in view (highest priority).
    if (caution) {
      for (const g of stable.groups) {
        if (g.largest >= cfg.largeAreaFraction && now - (this.warnLastAt[g.label] ?? -Infinity) >= cfg.warnCooldownMs) {
          this.warnLastAt[g.label] = now;
          this.lastAnnounceAt = now;
          // Also mark as known so it is not announced again right afterwards.
          this.lastCounts[g.label] = Math.max(this.lastCounts[g.label] || 0, g.count);
          this.labelLastAt[g.label] = now;
          return { text: buildWarning(g.label), priority: 'high' };
        }
      }
    }

    // 2) New objects, or more objects of a kind than before.
    const added = stable.groups.filter((g) => {
      const known = this.lastCounts[g.label] || 0;
      if (g.count <= known) return false;
      return now - (this.labelLastAt[g.label] ?? -Infinity) >= cfg.labelCooldownMs;
    });
    if (added.length === 0) return null;

    for (const g of added) {
      this.lastCounts[g.label] = g.count;
      this.labelLastAt[g.label] = now;
    }
    this.lastAnnounceAt = now;
    return {
      text: buildSentence(added, { positions, mode: 'announce', maxGroups: cfg.maxGroups }),
      priority: 'normal',
    };
  }
}
