// A long-lived worker for 大師: loads the move model once, then answers each
// position. If the model cannot load, it answers with the advanced player.
import { quickTeamSuggestion, teamSuggestion } from './team-coach'
import { MoveScorer, decodeWeights, type ModelJson } from './move-scorer'
import { masterAdvice } from './master'
import type { TeamAdviceInput } from './match'

export type MasterRequest = {id: number, input: TeamAdviceInput, model: {json: string, bin: string}}
export type MasterReply = {id: number, advice: ReturnType<typeof quickTeamSuggestion>, fallback: boolean,
  q?: number, loadMs?: number, inferMs: number, error?: string}

let scorer: Promise<{scorer: MoveScorer, loadMs: number}> | undefined
async function load(urls: MasterRequest['model']) {
  const started = performance.now()
  const [json, bin] = await Promise.all([
    fetch(urls.json).then(r => { if (!r.ok) throw new Error('model ' + r.status); return r.json() as Promise<ModelJson> }),
    fetch(urls.bin).then(r => { if (!r.ok) throw new Error('weights ' + r.status); return r.arrayBuffer() }),
  ])
  return {scorer: new MoveScorer(json, decodeWeights(json, bin)), loadMs: performance.now() - started}
}

self.onmessage = async ({data}: {data: MasterRequest}) => {
  const {id, input, model} = data
  const {hand, level, target, table, style, master} = input
  const started = performance.now()
  let reply: MasterReply
  try {
    if (!master) throw new Error('no public view')
    const first = !scorer
    scorer ??= load(model)
    const loaded = await scorer
    const loadMs = first ? loaded.loadMs : undefined
    const inferStart = performance.now()
    const rules = quickTeamSuggestion(hand, level, target, table, undefined, true)
    const {q, ...advice} = masterAdvice(master, loaded.scorer, rules)
    reply = {id, advice, fallback: false, q, loadMs, inferMs: performance.now() - inferStart}
  } catch (error) {
    scorer = undefined
    reply = {id, advice: teamSuggestion(hand, level, target, table, 'advanced', style), fallback: true,
      inferMs: performance.now() - started, error: (error as Error).message}
  }
  self.postMessage(reply)
}
