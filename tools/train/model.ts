// Inference for train.py's move scorer in plain TypeScript (Node and browser).
// loadModel reads model.json + model.bin in Node; in the browser, fetch both
// files and pass them to new MoveScorer(json, new Float32Array(buffer)).
import type { Match } from '../../src/match.ts'
import type { Move } from '../../src/rules.ts'
import { ACTION_DIM, FEATURE_VERSION, STATE_DIM, actionFeatures, candidates, stateFeatures } from './features.ts'

type TensorInfo = {name: string, shape: number[], offset: number}
export type ModelJson = {featureVersion: number, stateDim: number, actionDim: number,
  stateScale: number[], actionScale: number[], hidden: number[], tensors: TensorInfo[]}

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

export async function loadModel(path: string) {
  const {readFileSync} = await import('node:fs')
  const base = path.replace(/\.(json|bin)$/, '')
  const json = JSON.parse(readFileSync(base + '.json', 'utf8')) as ModelJson
  const bin = readFileSync(base + '.bin')
  return new MoveScorer(json, new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4))
}
