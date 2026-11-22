import { useEffect, useState } from 'react'
import type { TeamAdviceInput } from './match'
import { beginnerSuggestion, quickTeamSuggestion } from './team-coach'

type TeamAdvice = ReturnType<typeof quickTeamSuggestion>
type Analysis = {input: TeamAdviceInput, advice: TeamAdvice, fallback: boolean}

export function useTeamAdvice(input: TeamAdviceInput | null) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)

  useEffect(() => {
    if (!input) return
    let active = true
    let settled = false
    let worker: Worker | undefined
    let timeout: number | undefined

    function finish(advice: TeamAdvice, fallback: boolean) {
      if (!active || settled) return
      settled = true
      window.clearTimeout(timeout)
      worker?.terminate()
      setAnalysis({input: input!, advice, fallback})
    }
    function fallback() {
      if (!active || settled) return
      worker?.terminate()
      const {hand, level, target, table, strength, style} = input!
      const suggest=strength==='beginner' ? beginnerSuggestion : quickTeamSuggestion
      finish(suggest(hand, level, target, table, style), true)
    }

    try {
      worker = new Worker(new URL('./team-advice-worker.ts', import.meta.url), {type: 'module'})
      worker.onmessage = (event: MessageEvent<TeamAdvice>) => finish(event.data, false)
      worker.onerror = event => {event.preventDefault(); fallback()}
      worker.onmessageerror = fallback
      // A failed or suspended worker must not leave an NPC turn waiting forever.
      timeout = window.setTimeout(fallback, 15000)
      worker.postMessage(input)
    } catch {
      fallback()
    }
    return () => {
      active = false
      window.clearTimeout(timeout)
      worker?.terminate()
    }
  }, [input])

  const current = input && analysis?.input === input ? analysis : null
  return {advice: current?.advice ?? null, fallback: current?.fallback ?? false}
}
