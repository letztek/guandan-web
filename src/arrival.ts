import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { assetPath } from './assets'

type Scene = 'battle'

export function useArrival(route: string) {
  const [arriving, setArriving] = useState(() => Boolean(document.getElementById('arrival-screen')))
  const [readyScene, sceneReady] = useState<Scene | null>(null)
  const [deckReady, setDeckReady] = useState(false)
  const [curtain] = useState(() => document.getElementById('arrival-screen')?.cloneNode(true))
  const previousRoute = useRef(route)

  // Reuse the three walkers while the selected partner and the other seats load.
  useLayoutEffect(() => {
    const enteringTable = previousRoute.current !== '#battle' && route === '#battle'
    previousRoute.current = route
    if (!enteringTable || !curtain) return
    const root = document.getElementById('root')
    if (!root) return
    const screen = document.getElementById('arrival-screen')
    if (screen) {
      screen.classList.remove('is-leaving')
      screen.removeAttribute('aria-hidden')
    } else {
      root.before(curtain.cloneNode(true))
    }
    root.setAttribute('inert', '')
    root.setAttribute('aria-busy', 'true')
    sceneReady(null)
    setArriving(true)
  }, [route, curtain])

  useEffect(() => {
    if (!arriving) return
    const deck = new Image()
    deck.onload = deck.onerror = () => setDeckReady(true)
    deck.src = assetPath('fez-cards/deck.webp')
    // A stalled asset can keep streaming in the background while the player uses the hand.
    const deadline = window.setTimeout(() => setArriving(false), 8000)
    return () => {
      window.clearTimeout(deadline)
      deck.onload = deck.onerror = null
    }
  }, [arriving])

  useEffect(() => {
    if (route !== '#battle') {
      sceneReady(null)
      setArriving(false)
    } else if (deckReady && readyScene === 'battle') {
      setArriving(false)
    }
  }, [route, deckReady, readyScene])

  useEffect(() => {
    if (arriving) return
    const screen = document.getElementById('arrival-screen')
    const root = document.getElementById('root')
    root?.removeAttribute('inert')
    root?.removeAttribute('aria-busy')
    if (!screen) return
    screen.setAttribute('aria-hidden', 'true')
    screen.classList.add('is-leaving')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      screen.remove()
      return
    }
    const fade = window.setTimeout(() => screen.remove(), 160)
    return () => window.clearTimeout(fade)
  }, [arriving])

  return { arriving, sceneReady }
}
