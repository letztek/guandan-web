import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { assetPath } from './assets'
import { defaultPartnerId, partners, standingFrame, type PartnerId } from './partner-roster'
import { playStyleLabels } from './play-style'
import { localizedName, translate as t } from './i18n'
import { Icon } from './ui'
import type { PartnerPreview } from './partner-preview'
import './partner-select.css'

type Props = {
  initial?: PartnerId
  onStart: (partner: PartnerId) => void
  onPreview?: () => void
  onBack: () => void
  onSettings: () => void
  backLabel: string
  musicControl?: ReactNode
}

export function PartnerSelect({initial = defaultPartnerId, onStart, onPreview, musicControl,onBack,onSettings,backLabel}: Props) {
  const [picked, setPicked] = useState(initial)
  const [gesture, setGesture] = useState(0)
  const [ready, setReady] = useState(() => partners.map(() => false))
  const actor = partners.find(entry => entry.id === picked) ?? partners[0]
  const radios = useRef<(HTMLButtonElement|null)[]>([])
  const surfaces = useRef<(HTMLSpanElement|null)[]>([])
  const canvas = useRef<HTMLCanvasElement|null>(null)
  const preview = useRef<PartnerPreview|null>(null)
  const pendingSelection = useRef<number|null>(null)

  useEffect(() => {
    let active = true
    const canvasElement = canvas.current!
    void import('./partner-preview').then(({createPartnerPreview}) => {
      if (!active) return
      const slots = surfaces.current.filter((el): el is HTMLSpanElement => el !== null)
      if (slots.length !== partners.length) return
      const scene = createPartnerPreview(canvasElement, slots, (index,live) => {
        if (active) setReady(previous => previous.map((value, i) => i === index ? live : value))
      })
      preview.current = scene
      if (pendingSelection.current !== null) scene.select(pendingSelection.current)
    }).catch(() => { /* Full-length portraits are already shown when WebGL is unavailable. */ })
    return () => {
      active = false
      preview.current?.dispose()
      preview.current = null
    }
  }, [])

  function choose(next: number) {
    setPicked(partners[next].id)
    setGesture(previous => previous + 1)
    pendingSelection.current = next
    preview.current?.select(next)
    onPreview?.()
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    let next: number
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = partners.length - 1
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % partners.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current + partners.length - 1) % partners.length
    else return
    event.preventDefault()
    radios.current[next]?.focus()
    choose(next)
  }

  return <div className="partner-room" style={{
    '--inn-scene': 'url("'+assetPath('art/tavern.jpg')+'")',
    '--standing-floor': (1 - standingFrame.belowFloor / standingFrame.height) * 100 + '%',
  } as CSSProperties}>
    <div className="partner-shell">
      <header className="partner-mast">
        <button type="button" className="partner-back" onClick={onBack}><Icon name="undo" size={17}/>{backLabel}</button>
        <div className="partner-mast-tools"><button type="button" className="partner-back" onClick={onSettings}><Icon name="tune" size={17}/>{t('難度設定','Difficulty','難易度')}</button>{musicControl}</div>
      </header>
      <main className="partner-layout">
        <div className="partner-heading">
          <h1 id="partner-title">{t('選擇隊友','Choose a partner','ペアを選ぶ')}</h1>
          <p id="partner-help">{t('選一位坐在你的對面，一起爭頭游。','Choose who sits across from you and play for first place.','向かいに座るペアを選び、一緒に1位を目指しましょう。')}</p>
        </div>
        <div className="partner-choices" role="radiogroup" aria-labelledby="partner-title" aria-describedby="partner-help">
          {partners.map((person, i) => {
            const selected = actor.id === person.id
            const live = ready[i]
            const showPortraitGreeting = selected && !live && gesture > 0
            const style = person.playStyle
            return <button type="button" role="radio" aria-checked={selected} aria-label={localizedName(person.name)} aria-describedby={`style-${person.id}`}
              className="partner-choice" tabIndex={selected ? 0 : -1} key={person.id} data-partner={person.id}
              ref={el => {radios.current[i] = el}} onKeyDown={e => navigate(e, i)} onClick={() => choose(i)}>
              <span className="partner-backdrop" aria-hidden="true"/>
              <span className="partner-plinth" aria-hidden="true"/>
              <span className="partner-stage-surface" aria-hidden="true" data-renderer={live ? '3d' : 'portrait'}
                style={person.minimumFrameWidth ? {
                  '--standing-width': (100 * standingFrame.imageAspect * standingFrame.height / person.minimumFrameWidth) + '%',
                } as CSSProperties : undefined}
                ref={el => {surfaces.current[i] = el}}>
                <img className="partner-standing" key={showPortraitGreeting ? gesture : 0}
                  data-greeting={showPortraitGreeting || undefined} src={assetPath('character/'+person.rig+'-standing.webp')} alt=""/>
              </span>
              <span className="partner-caption"><span className="partner-caption-label">
                <span className="partner-choice-name">{localizedName(person.name)}</span>
                <span className="partner-choice-style" id={`style-${person.id}`}>{t(playStyleLabels[style],
                  {support:'Support',balanced:'Balanced',attack:'Aggressive'}[style],
                  {support:'サポート',balanced:'堅実',attack:'攻め'}[style])}</span>
              </span></span>
              <span className="partner-tick" aria-hidden="true">{selected && <Icon name="check" size={15}/>}</span>
            </button>
          })}
          <canvas ref={canvas} className="partner-cast" aria-hidden="true"/>
        </div>
        <button type="button" className="partner-confirm" onClick={() => onStart(actor.id)}>
          {t(`與 ${actor.name} 入座`, `Play with ${localizedName(actor.name,'en')}`, `${localizedName(actor.name,'ja')}と対戦へ`)}
          <Icon name="arrow" size={20}/></button>
      </main>
    </div>
  </div>
}
