import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

function publicFiles(directory) {
  const entries = readdirSync(new URL('./public/' + directory + '/', import.meta.url), { withFileTypes: true })
  return entries.flatMap(entry => {
    const path = directory + '/' + entry.name
    if (entry.isDirectory()) return publicFiles(path)
    return entry.isFile() ? [path] : []
  })
}
const prints = ['fez-cards/deck.webp', ...publicFiles('character')]
const assetRevisions = Object.fromEntries(prints.map(file => {
  const bytes = readFileSync(new URL('./public/' + file, import.meta.url))
  return [file, createHash('sha256').update(bytes).digest('hex').slice(0, 12)]
}))
export default defineConfig({
  base: './',
  define: { 'import.meta.env.VITE_ASSET_REVISIONS': JSON.stringify(assetRevisions) },
  build: { chunkSizeWarningLimit: 800 }
})
