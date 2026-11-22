import { useSyncExternalStore } from 'react'
import { translateReason } from './reason-l10n'

export const languages = ['zh-Hant', 'en', 'ja'] as const
export type Language = typeof languages[number]
const languageKey = 'guandan.language.v1'
const listeners = new Set<() => void>()

function isLanguage(value: string | null): value is Language {
  return languages.some(language => language === value)
}

function initialLanguage(): Language {
  if (typeof window === 'undefined') return 'zh-Hant'
  const requested = new URL(window.location.href).searchParams.get('lang')
  if (isLanguage(requested)) return requested
  try {
    const saved = window.localStorage.getItem(languageKey)
    if (isLanguage(saved)) return saved
  } catch { /* The selector still works in this tab. */ }
  const browser = window.navigator.language.split('-')[0]
  return browser === 'ja' ? 'ja' : browser === 'en' ? 'en' : 'zh-Hant'
}

let activeLanguage = initialLanguage()

export function getLanguage() {
  return activeLanguage
}

export function setLanguage(language: Language) {
  if (language === activeLanguage) return
  activeLanguage = language
  const url = new URL(window.location.href)
  url.searchParams.set('lang', language)
  window.history.replaceState(window.history.state, '', url)
  try { window.localStorage.setItem(languageKey, language) } catch { /* Keep the in-memory preference. */ }
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage)
}

export function translate(zh: string, en: string, ja: string, language = getLanguage()): string {
  return language === 'en' ? en : language === 'ja' ? ja : zh
}

export function localizedName(name: string, language = getLanguage()) {
  switch (name) {
    case '鈴音': return translate(name, 'Suzune', '鈴音', language)
    case '珊迪': return translate(name, 'Sandy', 'サンディ', language)
    case '天宮': return translate(name, 'Amamiya', '天宮', language)
    default: return name
  }
}

export function localize(text: string): string {
  return activeLanguage === 'zh-Hant' ? text : translateReason(text, activeLanguage)
}

export function localizeArrival(screen: ParentNode) {
  const title = screen.querySelector('.arrival-title')
  const subtitle = screen.querySelector('.arrival-subtitle')
  const status = screen.querySelector('.arrival-status')
  if (title) title.textContent = translate('水晶亭的休戰日', 'Truce Day at the Crystal Pavilion', '水晶亭の休戦日')
  if (subtitle) subtitle.textContent = translate('二對二摜蛋', '2v2 Guandan', '2対2の摜蛋（グアンダン）')
  if (status) status.textContent = translate('牌桌準備中…', 'Setting the table…', '卓を準備しています…')
}
