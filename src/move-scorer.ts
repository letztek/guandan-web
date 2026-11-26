// Inference for the learned move scorer (tools/train/train.py) in plain
// TypeScript, for the browser and Node. Weights are model.json + model.bin;
// the binary is float32, or float16 when model.json says "dtype": "float16".
import type { Match } from './match.ts'
import type { Move } from './rules.ts'
import { ACTION_DIM, FEATURE_VERSION, STATE_DIM, actionFeatures, candidates, stateFeatures } from './model-features.ts'

type TensorInfo = {name: string, shape: number[], offset: number}
export type ModelJson = {featureVersion: number, stateDim: number, actionDim: number,
  stateScale: number[], actionScale: number[], hidden: number[], tensors: TensorInfo[], dtype?: 'float32' | 'float16'}

// IEEE 754 half precision to single precision.
function halfToFloat(h: number) {
  const sign = h & 0x8000 ? -1 : 1, exponent = (h >> 10) & 0x1f, fraction = h & 0x3ff
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024)
  if (exponent === 31) return fraction ? NaN : sign * Infinity
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024)
}
// The weights as float32, whichever way model.bin stores them.
export function decodeWeights(json: ModelJson, buffer: ArrayBufferLike, byteOffset = 0, byteLength = buffer.byteLength) {
  const size = json.dtype === 'float16' ? 2 : 4
  // Typed arrays need an aligned start; a file read in Node may not give one.
  if (byteOffset % size) {
    buffer = new Uint8Array(buffer, byteOffset, byteLength).slice().buffer
    byteOffset = 0
  }
  if (size === 4) return new Float32Array(buffer, byteOffset, byteLength / 4)
  return Float32Array.from(new Uint16Array(buffer, byteOffset, byteLength / 2), halfToFloat)
}

export class MoveScorer {
  json: ModelJson
  tensors: Record<string, Float32Array>
  constructor(json: ModelJson, weights: Float32Array) {
    if (json.featureVersion !== FEATURE_VERSION || json.stateDim !== STATE_DIM || json.actionDim !== ACTION_DIM) {
      throw new Error(`model expects features v${json.featureVersion} (${json.stateDim}/${json.actionDim}),` +
        ` this build has v${FEATURE_VERSION} (${STATE_DIM}/${ACTION_DIM})`)
    }
    this.json = json
    this.tensors = Object.fromEntries(json.tensors.map(t =>
      [t.name, weights.subarray(t.offset, t.offset + t.shape.reduce((a, b) => a * b, 1))]))
  }

  // out = W x (+ b), W stored row-major [rows, cols].
  private affine(name: string, x: Float32Array, bias?: string) {
    const w = this.tensors[name], cols = x.length, rows = w.length / cols
    const out = new Float32Array(rows)
    const b = bias ? this.tensors[bias] : undefined
    for (let r = 0; r < rows; r++) {
      let sum = b ? b[r] : 0
      const base = r * cols
      for (let c = 0; c < cols; c++) sum += w[base + c] * x[c]
      out[r] = sum
    }
    return out
  }

  // Q for each candidate action in one position.
  score(state: Uint8Array, actions: Uint8Array[]): Float32Array {
    const s = Float32Array.from(state, (v, i) => v * this.json.stateScale[i])
    const fromState = this.affine('state_in.weight', s, 'state_in.bias')
    const layers = this.json.hidden.length
    return Float32Array.from(actions, action => {
      const a = Float32Array.from(action, (v, i) => v * this.json.actionScale[i])
      let h = this.affine('action_in.weight', a)
      for (let i = 0; i < h.length; i++) h[i] = Math.max(0, h[i] + fromState[i])
      for (let layer = 0; layer < layers; layer++) {
        h = this.affine(`body.${layer}.weight`, h, `body.${layer}.bias`)
        if (layer < layers - 1) for (let i = 0; i < h.length; i++) h[i] = Math.max(0, h[i])
      }
      return h[0]
    })
  }

  // The best-scored legal play for the seat to move, with every candidate's value.
  choose(s: Match): {move: Move | null, values: {move: Move | null, q: number}[]} {
    const options = candidates(s)
    const q = this.score(stateFeatures(s), options.map(m => actionFeatures(s, m)))
    const values = options.map((move, i) => ({move, q: q[i]})).sort((a, b) => b.q - a.q)
    return {move: values[0].move, values}
  }
}
