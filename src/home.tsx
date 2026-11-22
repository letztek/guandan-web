import type { CSSProperties } from 'react'
import { assetPath } from './assets'
import type { LocalGame } from './local-game'
import { partners } from './partner-roster'
import { Icon, Modal, PlayingCard } from './ui'
import { difficultyNames, type Difficulty, type BotSide, type BotStrengths } from './difficulty'
import './home.css'

const sevens = ['C', 'H', 'S'].map(suit => ({id: suit+'7-cover', suit, rank:'7'}))

function saveSummary(save: LocalGame) {
  const {game} = save
  const stage = game.phase === 'result' ? '本副結算' : game.phase === 'donate' ? '進貢' :
    game.phase === 'return' ? '還貢' : '第 '+game.trick+' 圈'
  const partner = partners.find(person => person.id === save.partnerId)!
  return '第 '+game.handNo+' 副 · '+stage+' · '+partner.name
}

type HomeProps = {
  save: LocalGame | null
  onStart: () => void
  onResume: () => void
  onTutorial: () => void
  onSettings: () => void
}

export function Home({save,onStart,onResume,onTutorial,onSettings}: HomeProps) {
  return <div className="room-home" style={{'--home-inn':'url("'+assetPath('art/tavern.jpg')+'")'} as CSSProperties}>
    <div className="room-home-inner">
      <header className="home-mast">
        <span className="home-brand"><Icon name="cards" size={24}/> 主選單</span>
        <button className="home-settings" onClick={onSettings}><Icon name="tune" size={17}/> 設定</button>
      </header>
      <main className="home-main">
        <div className="home-intro">
          <h1>水晶亭的休戰日</h1>
          <p className="home-subtitle">二對二摜蛋</p>
          <p>與對家的隊友一起升到 A。己方主打 A 時，一人拿頭游、另一人拿二游或三游，就贏得整場。</p>
        </div>
        <div className="home-art" aria-hidden="true">
          <div className="home-fan">{sevens.map(card=><div key={card.id} className="home-fan-card"><PlayingCard card={card}/></div>)}</div>
        </div>
        <nav className="home-actions" aria-label="主選單">
          {save && <button className="home-action primary" onClick={onResume}>
            <Icon name="history" size={23}/><span><strong>{save.game.won?'查看戰果':'繼續對局'}</strong><small>{saveSummary(save)}</small></span>
          </button>}
          <button className={'home-action'+(save?'':' primary')} onClick={onStart}>
            <Icon name="cards" size={24}/><span><strong>開始遊戲</strong><small>選擇隊友，開一場新局</small></span>
          </button>
          <button className="home-action" onClick={onTutorial}>
            <Icon name="book" size={22}/><span><strong>規則教學</strong><small>跟著牌例，親手出牌</small></span>
          </button>
        </nav>
      </main>
      <footer className="home-foot"><Icon name="pin" size={15}/>
        {save?.storage==='memory'?'此瀏覽器無法儲存，離開後進度會遺失。':
          save?.storage==='tab'?'目前只能保留在此分頁，關閉後進度會遺失。':'對局進度會自動保存在此裝置的瀏覽器。'}
      </footer>
    </div>
  </div>
}

function Setting({label,description,enabled,onToggle}: {label:string;description:string;enabled:boolean;onToggle:()=>void}) {
  return <button type="button" role="switch" aria-label={label} aria-checked={enabled} className="room-setting" onClick={onToggle}>
    <span><strong>{label}</strong><small>{description}</small></span><i aria-hidden="true"/>
  </button>
}

const descriptions:Record<Difficulty,string> = {
  beginner:'優先處理當手牌型，隊友最大時通常讓牌。',
  standard:'會看各席餘張，規劃後幾輪怎麼幫隊友走完。',
  advanced:'也會提早推演對手收尾，比較放行與攔截的結果。',
}
export function Settings({music,volume,autoPass,strengths,onStrength,onMusic,onVolume,onAutoPass,onClose}: {
  music:boolean;autoPass:boolean;strengths:BotStrengths;onStrength:(side:BotSide,value:Difficulty)=>void
  volume:number;onVolume:(value:number)=>void
  onMusic:()=>void;onAutoPass:()=>void;onClose:()=>void
}) {
  return <Modal title="設定" onClose={onClose} className="settings-dialog">
    <div className="room-settings">
      {(['ally','opponents'] as const).map(side=>{
        const label=side==='ally'?'隊友強度':'對手強度'
        const description=side==='ally' && strengths[side]==='advanced'
          ? '對手剩十張以內時，會推演攔牌或讓你先走的結果。'
          : descriptions[strengths[side]]
        return <label key={side} className="room-setting strength-setting">
          <span><strong>{label}</strong><small>{description}</small></span>
          <select aria-label={label} value={strengths[side]} onChange={event=>onStrength(side,event.target.value as Difficulty)}>
            {Object.entries(difficultyNames).map(([value,name])=><option key={value} value={value}>{name}</option>)}
          </select>
        </label>
      })}
      <div className="room-setting music-setting">
        <button type="button" role="switch" aria-checked={music} className="music-switch" onClick={onMusic}>
          <strong>背景音樂</strong><i aria-hidden="true"/>
        </button>
        <label className="room-volume">
          <span>音量</span>
          <input type="range" aria-label="背景音樂音量" aria-valuetext={volume+'%'} min="0" max="100" step="1" value={volume}
            onChange={event=>onVolume(event.currentTarget.valueAsNumber)}/>
          <output aria-hidden="true">{volume}%</output>
        </label>
      </div>
      <Setting label="無法跟牌時自動過牌" description="手上沒有能壓過桌面的牌時，自動跳過這一輪。" enabled={autoPass} onToggle={onAutoPass}/>
    </div>
    <footer><button className="btn gold" onClick={onClose}>完成</button></footer>
  </Modal>
}
