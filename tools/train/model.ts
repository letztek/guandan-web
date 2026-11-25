// Node loader for the move scorer; the scorer itself lives in src/move-scorer.ts.
import { MoveScorer, decodeWeights, type ModelJson } from '../../src/move-scorer.ts'
export { MoveScorer, decodeWeights, type ModelJson } from '../../src/move-scorer.ts'

export async function loadModel(path: string) {
  const {readFileSync} = await import('node:fs')
  const base = path.replace(/\.(json|bin)$/, '')
  const json = JSON.parse(readFileSync(base + '.json', 'utf8')) as ModelJson
  const bin = readFileSync(base + '.bin')
  return new MoveScorer(json, decodeWeights(json, bin.buffer, bin.byteOffset, bin.byteLength))
}
