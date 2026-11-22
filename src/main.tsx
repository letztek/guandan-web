import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Battle } from './battle'
import { useArrival } from './arrival'
import { defaultPartnerId, type PartnerId } from './partner-roster'
import { PartnerSelect } from './partner-select'
import { RoomMusicButton, useRoomMusic } from './room-music'
import { Home, Settings } from './home'
import { isStrengthKey, readStrengths, saveStrength, type BotSide, type Difficulty } from './difficulty'
import { Tutorial, styleLessonRoute } from './tutorial'
import { Modal } from './ui'
import { DeckProof } from './deck-proof'
import { FinalePreview } from './finale-preview'
import { localGameKey, readAutoPass, readLocalGame, saveAutoPass, startLocalGame, updateLocalGame, type LocalGame } from './local-game'
import './style.css'
import './battle.css'
import './battle-layout.css'

function Cardroom() {
  const [route,setRoute] = useState(location.hash)
  const [save,setSave] = useState(readLocalGame)
  const [settings,setSettings] = useState(false)
  const [autoPass,setAutoPass] = useState(readAutoPass)
  const [strengths,setStrengths] = useState(readStrengths)
  const [replacement,setReplacement] = useState<{partner:PartnerId;save:LocalGame}|null>(null)
  const changingPartner = route==='#lobby/partner' && save!==null
  const tutorial = route==='#tutorial' || route===styleLessonRoute || route==='#tutorial/table' || route==='#tutorial/pair-seven' || route==='#practice'
  const table = (route==='#battle' || route==='#cards') && save!==null
  const lobby = route==='#lobby' || route==='#lobby/partner' || (route==='#battle' && !save)
  const {arriving,sceneReady} = useArrival(table ? '#battle' : lobby ? '#lobby' : tutorial ? '#tutorial' : '#home')
  const preview = route==='#finale-preview'
  const music = useRoomMusic(!preview)
  useEffect(()=>{
    if (!table && !preview) music.setScene(tutorial?'practice':'lobby')
  },[table,tutorial,preview,music.setScene])
  useEffect(()=>{
    function syncRoute() {
      setSave(readLocalGame())
      setReplacement(null)
      setSettings(false)
      setRoute(location.hash)
      window.scrollTo(0,0)
    }
    function syncStorage(event:StorageEvent) {
      if (isStrengthKey(event.key)) setStrengths(readStrengths())
      if (event.key==='guandan.auto-pass-last.v1' || event.key===null) setAutoPass(readAutoPass())
      // The running table handles an updated checkpoint without replacing a move in progress.
      if ((event.key===localGameKey || event.key===null) && (location.hash==='' || location.hash==='#home')) setSave(readLocalGame())
    }
    window.addEventListener('hashchange',syncRoute)
    window.addEventListener('storage',syncStorage)
    return ()=>{
      window.removeEventListener('hashchange',syncRoute)
      window.removeEventListener('storage',syncStorage)
    }
  },[])

  function enterTable(record:LocalGame) {
    setSave(record)
    setReplacement(null)
    music.start()
    location.hash='battle'
  }
  function seatPartner(id:PartnerId) {
    const current=readLocalGame()
    if (changingPartner) {
      if (!current || current.id!==save?.id) {location.hash='home';return}
      const updated=updateLocalGame(current,current.game,id)
      if (updated) enterTable(updated)
      else location.hash='home'
    } else if (current) {
      setReplacement({partner:id,save:current})
    } else enterTable(startLocalGame(id))
  }
  function replaceGame() {
    if (!replacement) return
    const current=readLocalGame()
    if (current && current.id!==replacement.save.id) {
      setReplacement({...replacement,save:current})
      return
    }
    enterTable(startLocalGame(replacement.partner))
  }
  const home=()=>{location.hash='home'}
  const start=()=>{location.hash='lobby'}
  const resume=()=>{location.hash='battle'}
  const fromTable=route==='#tutorial/table' && save!==null
  function changeStrength(side:BotSide,value:Difficulty) {
    saveStrength(side,value)
    setStrengths(values=>({...values,[side]:value}))
  }

  return <>
    {table && save ? <Battle key={save.id} initialSave={save} autoPassEnabled={autoPass} strengths={strengths} paused={settings}
      onMusicScene={music.setScene} onChoosePartner={()=>{location.hash='lobby/partner'}} onHome={home}
      onTutorial={()=>{location.hash='tutorial/table'}} onSettings={()=>setSettings(true)} onSceneReady={sceneReady} arriving={arriving}/>
    : lobby ? <PartnerSelect initial={save?.partnerId??defaultPartnerId} onStart={seatPartner} onPreview={music.select}
      backLabel={changingPartner?'返回牌桌':'主選單'} onBack={changingPartner?resume:home} onSettings={()=>setSettings(true)}
      musicControl={<RoomMusicButton enabled={music.enabled} onToggle={music.toggle}/>}/>
    : preview ? <FinalePreview partnerId={save?.partnerId??defaultPartnerId}/>
    : tutorial ? <Tutorial key={route} onHome={fromTable?resume:home} backLabel={fromTable?'返回牌桌':'主選單'}
      startWithStyleLesson={route===styleLessonRoute} onStart={start}/>
    : <Home save={save} onStart={start} onResume={resume} onTutorial={()=>{location.hash='tutorial'}} onSettings={()=>setSettings(true)}/>}
    {settings && <Settings music={music.enabled} volume={music.volume} onVolume={music.changeVolume} autoPass={autoPass} strengths={strengths} onStrength={changeStrength} onMusic={music.toggle} onClose={()=>setSettings(false)}
      onAutoPass={()=>{saveAutoPass(!autoPass);setAutoPass(!autoPass)}}/>}
    {replacement && <Modal title="取代目前的對局？" className="replace-dialog" onClose={()=>setReplacement(null)}>
      <p className="home-confirm">目前存到第 {replacement.save.game.handNo} 副。我方 {replacement.save.game.scores[0]} 級，對方 {replacement.save.game.scores[1]} 級。開始新局會取代這份進度。</p>
      <footer><button className="btn border" onClick={()=>setReplacement(null)}>取消</button><button className="btn gold" onClick={replaceGame}>開始新局</button></footer>
    </Modal>}
    {route==='#cards' && !save && <Modal title="Q 版牌樣" wide onClose={home}><DeckProof/></Modal>}
  </>
}
createRoot(document.getElementById('root')!).render(<Cardroom/>)
