// Downloads the COCO-SSD (lite_mobilenet_v2) model into public/model so the app
// can load it from your own machine instead of the internet.
//
// Usage:  npm run download-model
// Needs Node 18 or newer and an internet connection (run it once).

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/'
const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, '..', 'public', 'model')

async function get(name) {
  const res = await fetch(BASE + name)
  if (!res.ok) throw new Error(`Download failed for ${name}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

await mkdir(outDir, { recursive: true })
console.log('Downloading model.json ...')
const modelJsonBuf = await get('model.json')
const modelJson = JSON.parse(modelJsonBuf.toString('utf8'))
await writeFile(path.join(outDir, 'model.json'), modelJsonBuf)

const shards = (modelJson.weightsManifest || []).flatMap((group) => group.paths)
for (const shard of shards) {
  console.log(`Downloading ${shard} ...`)
  await writeFile(path.join(outDir, shard), await get(shard))
}
console.log(`Done. ${shards.length + 1} files saved to ${outDir}`)
console.log('Restart "npm run dev". The page will say "local file" next to the model name.')
