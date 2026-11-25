// Main-thread side of master-worker.ts. One worker serves every 大師 decision,
// so the model downloads and decodes once per visit.
import { assetPath } from './assets'
import type { TeamAdviceInput } from './match'
import type { MasterReply } from './master-worker'

let worker: Worker | undefined
let nextId = 1
const waiting = new Map<number, (reply: MasterReply) => void>()

export function masterModelUrls(name = 'master') {
  return {json: assetPath('model/' + name + '.json'), bin: assetPath('model/' + name + '.bin')}
}

function start() {
  const created = new Worker(new URL('./master-worker.ts', import.meta.url), {type: 'module'})
  created.onmessage = (event: MessageEvent<MasterReply>) => {
    waiting.get(event.data.id)?.(event.data)
    waiting.delete(event.data.id)
  }
  created.onerror = event => {
    event.preventDefault()
    // A broken worker answers nothing; let the callers fall back and start fresh next time.
    for (const reject of rejecters.values()) reject(new Error('master worker failed'))
    rejecters.clear()
    waiting.clear()
    worker = undefined
  }
  return created
}
const rejecters = new Map<number, (error: Error) => void>()

export function askMaster(input: TeamAdviceInput, model = masterModelUrls()): Promise<MasterReply> {
  worker ??= start()
  const id = nextId++
  return new Promise((resolve, reject) => {
    waiting.set(id, reply => {rejecters.delete(id); resolve(reply)})
    rejecters.set(id, reject)
    worker!.postMessage({id, input, model})
  })
}
