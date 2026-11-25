import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

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
// 大師 is offered only when its model ships with the build.
const masterModel = existsSync(new URL('./public/model/master.json', import.meta.url))
const page = name => new URL('./' + name, import.meta.url).pathname
export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_ASSET_REVISIONS': JSON.stringify(assetRevisions),
    'import.meta.env.VITE_MASTER_MODEL': JSON.stringify(masterModel),
  },
  build: {
    chunkSizeWarningLimit: 800,
    // bench.html measures the move model on a device; nothing in the game links to it.
    rollupOptions: { input: { main: page('index.html'), bench: page('bench.html') } },
  }
})
