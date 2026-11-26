// A move scorer with random weights, the same shape train.py produces. For
// tests and for measuring speed on a device (bench.html): speed depends only
// on the model's size, not on what it learned.
//
// node --disable-warning=ExperimentalWarning --experimental-strip-types tools/train/random-model.ts 512,512,256 public/model/bench
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { ACTION_DIM, ACTION_SCALE, FEATURE_VERSION, STATE_DIM, STATE_SCALE } from '../../src/model-features.ts'
import type { ModelJson } from '../../src/move-scorer.ts'

export function randomModel(hidden: number[], seed = 1): {json: ModelJson, weights: Float32Array} {
  let state = seed >>> 0
  const uniform = () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296) * 2 - 1
  const tensors: ModelJson['tensors'] = [], parts: Float32Array[] = []
  let offset = 0
  const add = (name: string, shape: number[], scale: number) => {
    const size = shape.reduce((a, b) => a * b, 1)
    parts.push(Float32Array.from({length: size}, () => uniform() * scale))
    tensors.push({name, shape, offset})
    offset += size
  }
  // Roughly He-scaled, so values stay in a sensible range through the layers.
  add('state_in.weight', [hidden[0], STATE_DIM], Math.sqrt(6 / STATE_DIM))
  add('state_in.bias', [hidden[0]], 0.1)
  add('action_in.weight', [hidden[0], ACTION_DIM], Math.sqrt(6 / ACTION_DIM))
  const sizes = [...hidden, 1]
  for (let i = 0; i < hidden.length; i++) {
    add(`body.${i}.weight`, [sizes[i + 1], sizes[i]], Math.sqrt(6 / sizes[i]))
    add(`body.${i}.bias`, [sizes[i + 1]], 0.1)
  }
  const weights = new Float32Array(offset)
  let at = 0
  for (const p of parts) {weights.set(p, at); at += p.length}
  return {json: {featureVersion: FEATURE_VERSION, stateDim: STATE_DIM, actionDim: ACTION_DIM,
    stateScale: STATE_SCALE, actionScale: ACTION_SCALE, hidden, tensors}, weights}
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [shape, output] = process.argv.slice(2)
  if (!shape || !output) throw new Error('usage: random-model.ts <hidden sizes, e.g. 512,512,256> <output path without extension>')
  const {json, weights} = randomModel(shape.split(',').map(Number))
  mkdirSync(dirname(output), {recursive: true})
  writeFileSync(output + '.bin', new Uint8Array(weights.buffer))
  writeFileSync(output + '.json', JSON.stringify(json))
  console.log(`${weights.length} weights → ${output}.json/.bin (float32; pack.ts makes float16)`)
}
