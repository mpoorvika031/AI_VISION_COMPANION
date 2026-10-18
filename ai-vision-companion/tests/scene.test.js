import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  groupPhrase, pluralName, joinList, positionOf, groupDetections, buildSentence, buildWarning,
  SceneTracker, Announcer,
} from '../src/lib/scene.js'
import { parseCommand } from '../src/lib/commands.js'
import { splitIntoChunks } from '../src/lib/speech.js'

const W = 640
const H = 480
const det = (cls, x = 280, y = 200, w = 80, h = 80, score = 0.9) => ({ class: cls, score, bbox: [x, y, w, h] })

test('phrases and plurals', () => {
  assert.equal(groupPhrase('chair', 1), 'a chair')
  assert.equal(groupPhrase('chair', 2), 'two chairs')
  assert.equal(groupPhrase('person', 3), 'three people')
  assert.equal(groupPhrase('umbrella', 1), 'an umbrella')
  assert.equal(groupPhrase('dining table', 1), 'a table')
  assert.equal(groupPhrase('cell phone', 2), 'two mobile phones')
  assert.equal(groupPhrase('bus', 2), 'two buses')
  assert.equal(groupPhrase('bench', 2), 'two benches')
  assert.equal(groupPhrase('knife', 2), 'two knives')
  assert.equal(groupPhrase('bottle', 12), '12 bottles')
  assert.equal(pluralName('teddy bear'), 'teddy bears')
  assert.equal(joinList(['a', 'b', 'c']), 'a, b, and c')
})

test('position is based on image thirds', () => {
  assert.equal(positionOf([0, 0, 100, 50], W), 'left')
  assert.equal(positionOf([270, 0, 100, 50], W), 'center')
  assert.equal(positionOf([500, 0, 100, 50], W), 'right')
})

test('single object sentence with and without position', () => {
  const g = groupDetections([det('chair', 10)], W, H)
  assert.equal(buildSentence(g, { positions: true }), 'A chair is on the left of the camera view.')
  assert.equal(buildSentence(g, { positions: false }), 'A chair is detected.')
})

test('multiple objects are summarised, most important first', () => {
  const g = groupDetections([det('chair', 10), det('chair', 500), det('person', 280)], W, H)
  assert.equal(buildSentence(g, { positions: false }), 'A person and two chairs are detected.')
  assert.equal(buildSentence(g, { positions: false, mode: 'describe' }), 'I can see a person and two chairs.')
})

test('more than three kinds are shortened', () => {
  const g = groupDetections(['person', 'car', 'chair', 'bottle', 'laptop'].map((c) => det(c)), W, H)
  const s = buildSentence(g, { positions: false })
  assert.match(s, /other objects/)
  assert.match(s, /^A person, a car, a chair/)
})

test('no objects sentence', () => {
  assert.equal(buildSentence([], {}), 'No objects detected.')
})

test('tracker ignores one-frame flicker', () => {
  const t = new SceneTracker(3)
  assert.equal(t.push([], W, H), null)
  assert.equal(t.push([det('person')], W, H), null)
  const r = t.push([], W, H) // person only in 1 of 3 frames
  assert.deepEqual(r.counts, {})
})

test('tracker confirms an object seen in 2 of 3 frames', () => {
  const t = new SceneTracker(3)
  t.push([det('person')], W, H)
  t.push([det('person')], W, H)
  const r = t.push([], W, H)
  assert.deepEqual(r.counts, { person: 1 })
})

function stableOf(...dets) {
  const t = new SceneTracker(1)
  return t.push(dets, W, H)
}

test('announcer speaks a new object once, then stays quiet', () => {
  const a = new Announcer()
  const scene = stableOf(det('chair'))
  const first = a.decide(scene, 0, {})
  assert.equal(first.text, 'A chair is in the center of the camera view.')
  for (let t = 1000; t < 60000; t += 1000) assert.equal(a.decide(scene, t, {}), null)
})

test('announcer respects the minimum gap, then speaks the waiting object', () => {
  const a = new Announcer()
  assert.ok(a.decide(stableOf(det('chair')), 0, {}))
  const both = stableOf(det('chair'), det('person'))
  assert.equal(a.decide(both, 1000, {}), null) // too soon
  const later = a.decide(both, 3000, {})
  assert.match(later.text, /person/)
  assert.doesNotMatch(later.text, /chair/) // chair was already announced
})

test('announcer speaks when the count of an object increases', () => {
  const a = new Announcer({ labelCooldownMs: 0 })
  a.decide(stableOf(det('chair')), 0, { positions: false })
  const r = a.decide(stableOf(det('chair'), det('chair', 10)), 5000, { positions: false })
  assert.equal(r.text, 'Two chairs are detected.')
})

test('"No objects detected" is said once, not repeatedly', () => {
  const a = new Announcer()
  a.decide(stableOf(det('chair')), 0, {})
  const empty = stableOf()
  const first = a.decide(empty, 4000, {})
  assert.equal(first.text, 'No objects detected.')
  for (let t = 5000; t < 40000; t += 1000) assert.equal(a.decide(empty, t, {}), null)
})

test('empty message is not lost when it is blocked by the minimum gap', () => {
  const a = new Announcer()
  a.decide(stableOf(det('chair')), 0, {})
  const empty = stableOf()
  assert.equal(a.decide(empty, 500, {}), null)
  assert.equal(a.decide(empty, 3000, {}).text, 'No objects detected.')
})

test('nothing is said at the very start when the scene is empty', () => {
  const a = new Announcer()
  assert.equal(a.decide(stableOf(), 0, {}), null)
  assert.equal(a.decide(stableOf(), 5000, {}), null)
})

test('an object that flickers away and back is not re-announced during its cooldown', () => {
  const a = new Announcer()
  const scene = stableOf(det('person'))
  assert.ok(a.decide(scene, 0, {}))
  a.decide(stableOf(), 3000, {}) // leaves (says "No objects detected.")
  assert.equal(a.decide(scene, 6000, {}), null) // back within 10 s
  assert.ok(a.decide(scene, 11000, {})) // after cooldown
})

test('large objects trigger a cautious, non-distance warning with cooldown', () => {
  const a = new Announcer()
  const big = stableOf(det('person', 100, 50, 450, 400))
  const r = a.decide(big, 0, { caution: true })
  assert.equal(r.priority, 'high')
  assert.equal(r.text, buildWarning('person'))
  assert.match(r.text, /may be close/)
  assert.doesNotMatch(r.text, /metre|meter|feet|cm/)
  assert.equal(a.decide(big, 4000, { caution: true }), null)
})

test('caution can be switched off', () => {
  const a = new Announcer()
  const big = stableOf(det('person', 100, 50, 450, 400))
  const r = a.decide(big, 0, { caution: false })
  assert.doesNotMatch(r.text, /may be close/)
})

test('voice commands are recognised', () => {
  assert.equal(parseCommand('Start detection'), 'start')
  assert.equal(parseCommand('start'), 'start')
  assert.equal(parseCommand('Stop detection.'), 'stop')
  assert.equal(parseCommand('pause'), 'pause')
  assert.equal(parseCommand('resume detection'), 'resume')
  assert.equal(parseCommand('describe surroundings'), 'describe')
  assert.equal(parseCommand('what is around me'), 'describe')
  assert.equal(parseCommand('repeat description'), 'repeat')
  assert.equal(parseCommand('say that again'), 'repeat')
  assert.equal(parseCommand('read text'), 'readText')
  assert.equal(parseCommand('help'), 'help')
  assert.equal(parseCommand('good morning everyone'), null)
  assert.equal(parseCommand(''), null)
})

test('long text is split into speakable chunks', () => {
  const text = 'This is sentence one. ' + 'word '.repeat(80) + '. Last sentence here.'
  const chunks = splitIntoChunks(text, 100)
  assert.ok(chunks.length > 2)
  assert.ok(chunks.every((c) => c.length <= 100))
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').replace(/ \./g, '.'), text.replace(/\s+/g, ' ').replace(/ \./g, '.'))
  assert.deepEqual(splitIntoChunks('   '), [])
})
