import type { CSSProperties } from 'react'
import { assetPath } from './assets'
import type { LocalGame } from './local-game'
import { partners } from './partner-roster'
import { Icon, Modal, PlayingCard } from './ui'
import { difficultyNames, type Difficulty, type BotSide, type BotStrengths } from './difficulty'
import { getLanguage, languages, localizedName, setLanguage, translate as t, type Language } from './i18n'
import './home.css'

const sevens = ['C', 'H', 'S'].map(suit => ({id: suit+'7-cover', suit, rank:'7'}))

function saveSummary(save: LocalGame) {
  const {game} = save
  const stage = game.phase === 'result' ? t('本副結算', 'Round results', 'ラウンド結果') :
    game.phase === 'donate' ? t('進貢', 'Tribute', '貢ぎ札') :
    game.phase === 'return' ? t('還貢', 'Return tribute', '返礼札') :
    t(`第 ${game.trick} 圈`, `Trick ${game.trick}`, `第 ${game.trick} トリック`)
  const partner = partners.find(person => person.id === save.partnerId)!
  return t(`第 ${game.handNo} 副`, `Round ${game.handNo}`, `第 ${game.handNo} ラウンド`)+' · '+stage+' · '+localizedName(partner.name)
}

const languageNames = { 'zh-Hant': '繁體中文', en: 'English', ja: '日本語' }

function LanguageSelect() {
  return <select aria-label={t('語言', 'Language', '言語')} className="room-language" value={getLanguage()}
    onChange={event=>setLanguage(event.currentTarget.value as Language)}>
    {languages.map(language=><option key={language} lang={language} value={language}>{languageNames[language]}</option>)}
  </select>
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
        <span className="home-brand"><Icon name="cards" size={24}/> {t('主選單','Main menu','メインメニュー')}</span>
        <div className="home-mast-controls">
          <LanguageSelect/>
          <button className="home-settings" onClick={onSettings}><Icon name="tune" size={17}/> {t('設定','Settings','設定')}</button>
        </div>
      </header>
      <main className="home-main">
        <div className="home-intro">
          <h1>{t('水晶亭的休戰日','Truce Day at the Crystal Pavilion','水晶亭の休戦日')}</h1>
          <p className="home-subtitle">{t('二對二摜蛋','2v2 Guandan','2対2の摜蛋（グアンダン）')}</p>
          <p>{t('與對家的隊友一起升到 A。己方主打 A 時，一人拿頭游、另一人拿二游或三游，就贏得整場。',
            'Climb to Ace with the teammate across from you. While your team is playing at Ace, finish first with your partner in second or third to win the match.',
            '向かいのペアと一緒にAを目指しましょう。自チームがAをプレイするラウンドで、一人が1位、もう一人が2位か3位なら勝利です。')}</p>
        </div>
        <div className="home-art" aria-hidden="true">
          <div className="home-fan">{sevens.map(card=><div key={card.id} className="home-fan-card"><PlayingCard card={card}/></div>)}</div>
        </div>
        <nav className="home-actions" aria-label={t('主選單','Main menu','メインメニュー')}>
          {save && <button className="home-action primary" onClick={onResume}>
            <Icon name="history" size={23}/><span><strong>{save.game.won?t('查看戰果','View results','結果を見る'):t('繼續對局','Resume game','続きから')}</strong><small>{saveSummary(save)}</small></span>
          </button>}
          <button className={'home-action'+(save?'':' primary')} onClick={onStart}>
            <Icon name="cards" size={24}/><span><strong>{t('開始遊戲','Start game','ゲーム開始')}</strong><small>{t('選擇隊友，開一場新局','Choose a partner and start a match','ペアを選んで対戦を始める')}</small></span>
          </button>
          <button className="home-action" onClick={onTutorial}>
            <Icon name="book" size={22}/><span><strong>{t('規則教學','Learn the rules','ルールを学ぶ')}</strong><small>{t('跟著牌例，親手出牌','Learn by playing sample hands','例題でカードを出してみる')}</small></span>
          </button>
        </nav>
      </main>
      <footer className="home-foot"><Icon name="pin" size={15}/>
        {save?.storage==='memory'?t('此瀏覽器無法儲存，離開後進度會遺失。','This browser cannot save your progress.','このブラウザーでは進行状況を保存できません。'):
          save?.storage==='tab'?t('目前只能保留在此分頁，關閉後進度會遺失。','Progress lasts until you close this tab.','進行状況はこのタブを閉じるまで保持されます。'):
          t('對局進度會自動保存在此裝置的瀏覽器。','Progress is saved automatically in this browser.','進行状況はこのブラウザーに自動保存されます。')}
      </footer>
    </div>
  </div>
}

function Setting({label,description,enabled,onToggle}: {label:string;description:string;enabled:boolean;onToggle:()=>void}) {
  return <button type="button" role="switch" aria-label={label} aria-checked={enabled} className="room-setting" onClick={onToggle}>
    <span><strong>{label}</strong><small>{description}</small></span><i aria-hidden="true"/>
  </button>
}

function strengthDescription(difficulty: Difficulty) {
  switch (difficulty) {
    case 'beginner': return t('以當前牌型和自己的手牌為主，隊友最大時通常讓牌。',
      'Focuses on the current play and its own hand. Usually passes when its partner is winning.',
      '今の役と自分の手札を中心に判断し、ペアが優勢なら基本的にパスします。')
    case 'standard': return t('看各席餘張與已出的牌，兼顧保留牌型和幫隊友先走。',
      'Tracks hand sizes and played cards, balances keeping combinations intact with helping its partner go out.',
      '残り枚数と出た札を見て、役を温存しながらペアの上がりを助けます。')
    case 'advanced': return t('對手剩十張以內就開始多想幾圈，會用已出的牌判斷哪些牌還能被壓，規劃收尾順序。',
      'Looks several tricks ahead when a rival has ten cards or fewer, and uses played cards to plan a safe finish.',
      '相手が残り10枚以下になると数トリック先を読み、公開された札から安全な上がり順を考えます。')
  }
}

function strengthName(difficulty: Difficulty) {
  switch (difficulty) {
    case 'beginner': return t(difficultyNames.beginner,'Beginner','初級')
    case 'standard': return t(difficultyNames.standard,'Standard','標準')
    case 'advanced': return t(difficultyNames.advanced,'Advanced','上級')
  }
}
export function Settings({music,volume,autoPass,strengths,onStrength,onMusic,onVolume,onAutoPass,onClose}: {
  music:boolean;autoPass:boolean;strengths:BotStrengths;onStrength:(side:BotSide,value:Difficulty)=>void
  volume:number;onVolume:(value:number)=>void
  onMusic:()=>void;onAutoPass:()=>void;onClose:()=>void
}) {
  return <Modal title={t('設定','Settings','設定')} onClose={onClose} className="settings-dialog">
    <div className="room-settings">
      <label className="room-setting strength-setting">
        <span><strong>{t('語言','Language','言語')}</strong></span><LanguageSelect/>
      </label>
      {(['ally','opponents'] as const).map(side=>{
        const label=side==='ally'?t('隊友強度','Partner difficulty','ペアの強さ'):t('對手強度','Opponent difficulty','相手の強さ')
        return <label key={side} className="room-setting strength-setting">
          <span><strong>{label}</strong><small>{strengthDescription(strengths[side])}</small></span>
          <select aria-label={label} value={strengths[side]} onChange={event=>onStrength(side,event.target.value as Difficulty)}>
            {(Object.keys(difficultyNames) as Difficulty[]).map(value=><option key={value} value={value}>{strengthName(value)}</option>)}
          </select>
        </label>
      })}
      <div className="room-setting music-setting">
        <button type="button" role="switch" aria-checked={music} className="music-switch" onClick={onMusic}>
          <strong>{t('背景音樂','Background music','BGM')}</strong><i aria-hidden="true"/>
        </button>
        <label className="room-volume">
          <span>{t('音量','Volume','音量')}</span>
          <input type="range" aria-label={t('背景音樂音量','Background music volume','BGMの音量')} aria-valuetext={volume+'%'} min="0" max="100" step="1" value={volume}
            onChange={event=>onVolume(event.currentTarget.valueAsNumber)}/>
          <output aria-hidden="true">{volume}%</output>
        </label>
      </div>
      <Setting label={t('無法跟牌時自動過牌','Auto-pass when unable to follow','出せないときは自動でパス')}
        description={t('手上沒有能壓過桌面的牌時，自動跳過這一輪。','Pass automatically if you have no play that can beat the table.','場の札に勝てる役がなければ、自動的にパスします。')}
        enabled={autoPass} onToggle={onAutoPass}/>
    </div>
    <footer><button className="btn gold" onClick={onClose}>{t('完成','Done','完了')}</button></footer>
  </Modal>
}
