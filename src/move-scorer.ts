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

  // out[k] = W x[k] (+ b) for K inputs stored back to back. Each weight row is
  // read once for four inputs at a time, which is what bounds the speed; every
  // dot product keeps the same order of additions, so results match affine().
  private affineBatch(name: string, x: Float32Array, count: number, cols: number, bias?: string) {
    const w = this.tensors[name], rows = w.length / cols
    const out = new Float32Array(count * rows)
    const b = bias ? this.tensors[bias] : undefined
    for (let r = 0; r < rows; r++) {
      const base = r * cols, start = b ? b[r] : 0
      let k = 0
      for (; k + 4 <= count; k += 4) {
        let s0 = start, s1 = start, s2 = start, s3 = start
        const x0 = k * cols, x1 = x0 + cols, x2 = x1 + cols, x3 = x2 + cols
        for (let c = 0; c < cols; c++) {
          const wc = w[base + c]
          s0 += wc * x[x0 + c]
          s1 += wc * x[x1 + c]
          s2 += wc * x[x2 + c]
          s3 += wc * x[x3 + c]
        }
        out[k * rows + r] = s0
        out[(k + 1) * rows + r] = s1
        out[(k + 2) * rows + r] = s2
        out[(k + 3) * rows + r] = s3
      }
      for (; k < count; k++) {
        let s0 = start
        const x0 = k * cols
        for (let c = 0; c < cols; c++) s0 += w[base + c] * x[x0 + c]
        out[k * rows + r] = s0
      }
    }
    return out
  }

  // Q for each candidate action in one position.
  score(state: Uint8Array, actions: Uint8Array[]): Float32Array {
    const s = Float32Array.from(state, (v, i) => v * this.json.stateScale[i])
    const fromState = this.affine('state_in.weight', s, 'state_in.bias')
    const count = actions.length, actionDim = this.json.actionDim, scale = this.json.actionScale
    const a = new Float32Array(count * actionDim)
    actions.forEach((action, k) => { for (let i = 0; i < actionDim; i++) a[k * actionDim + i] = action[i] * scale[i] })
    const width = fromState.length
    let h = this.affineBatch('action_in.weight', a, count, actionDim)
    for (let k = 0; k < count; k++) for (let i = 0; i < width; i++) h[k * width + i] = Math.max(0, h[k * width + i] + fromState[i])
    let cols = width
    const layers = this.json.hidden.length
    for (let layer = 0; layer < layers; layer++) {
      h = this.affineBatch(`body.${layer}.weight`, h, count, cols, `body.${layer}.bias`)
      cols = h.length / count
      if (layer < layers - 1) for (let i = 0; i < h.length; i++) h[i] = Math.max(0, h[i])
    }
    return h
  }

  // The best-scored legal play for the seat to move, with every candidate's value.
  choose(s: Match): {move: Move | null, values: {move: Move | null, q: number}[]} {
    const options = candidates(s)
    const q = this.score(stateFeatures(s), options.map(m => actionFeatures(s, m)))
    const values = options.map((move, i) => ({move, q: q[i]})).sort((a, b) => b.q - a.q)
    return {move: values[0].move, values}
  }
}
