// Pack a trained model for the game: float16 weights, half the download.
// A model trained on DanLM data ships with public/model/NOTICE.md and
// LICENSE-DanLM.txt, which are already in place.
//
// node --disable-warning=ExperimentalWarning --experimental-strip-types tools/train/pack.ts \
//   ~/danlm-model-v3b/model.json public/model/master
// writes public/model/master.json and public/model/master.bin
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { decodeWeights, type ModelJson } from '../../src/move-scorer.ts'

// Single to half precision, rounding to nearest even.
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer)
export function floatToHalf(value: number) {
  f32[0] = value
  const x = u32[0], sign = (x >>> 16) & 0x8000
  let exponent = ((x >>> 23) & 0xff) - 127 + 15, mantissa = x & 0x7fffff
  if (((x >>> 23) & 0xff) === 0xff) return sign | 0x7c00 | (mantissa ? 0x200 : 0)
  if (exponent >= 31) return sign | 0x7c00
  if (exponent <= 0) {
    if (exponent < -10) return sign
    mantissa |= 0x800000
    const shift = 14 - exponent
    let half = mantissa >> shift
    const rest = mantissa & ((1 << shift) - 1), midpoint = 1 << (shift - 1)
    if (rest > midpoint || (rest === midpoint && half & 1)) half++
    return sign | half
  }
  let half = (exponent << 10) | (mantissa >> 13)
  const rest = mantissa & 0x1fff
  if (rest > 0x1000 || (rest === 0x1000 && half & 1)) half++
  return sign | half
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) throw new Error('usage: pack.ts <model.json> <output path without extension>')
  const base = input.replace(/\.(json|bin)$/, '')
  const json = JSON.parse(readFileSync(base + '.json', 'utf8')) as ModelJson
  const bin = readFileSync(base + '.bin')
  const weights = decodeWeights(json, bin.buffer, bin.byteOffset, bin.byteLength)
  const half = Uint16Array.from(weights, floatToHalf)
  mkdirSync(dirname(output), {recursive: true})
  writeFileSync(output + '.bin', new Uint8Array(half.buffer))
  writeFileSync(output + '.json', JSON.stringify({...json, dtype: 'float16'}))
  console.log(`${weights.length} weights: ${bin.byteLength} → ${half.byteLength} bytes`)
}
