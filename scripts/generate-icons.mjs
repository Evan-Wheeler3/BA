// Renders public/favicon.svg into the PNG icons required for iOS and the web manifest.
// Uses the Playwright Chromium that is available in the dev environment.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const targets = [
  { file: 'icon-192.png', size: 192, pad: 0, radius: true },
  { file: 'icon-512.png', size: 512, pad: 0, radius: true },
  // iOS applies its own rounded mask: provide a full-bleed square.
  { file: 'apple-touch-icon.png', size: 180, pad: 0, radius: false },
  // Maskable icons need the artwork inside the central safe zone (~80%).
  { file: 'icon-maskable-512.png', size: 512, pad: 0.1, radius: false },
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const t of targets) {
  const inner = Math.round(t.size * (1 - 2 * t.pad))
  const body = t.radius ? svg : svg.replace('rx="112"', 'rx="0"')
  await page.setViewportSize({ width: t.size, height: t.size })
  await page.setContent(
    `<html><body style="margin:0;background:${t.radius ? "transparent" : "#3730a3"};display:flex;align-items:center;justify-content:center;width:${t.size}px;height:${t.size}px">
      <div style="width:${inner}px;height:${inner}px">${body.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  )
  await page.screenshot({ path: new URL(`../public/icons/${t.file}`, import.meta.url).pathname, omitBackground: t.radius })
  console.log('wrote', t.file)
}
await browser.close()
