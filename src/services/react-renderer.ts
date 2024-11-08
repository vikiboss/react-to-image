import * as React from 'react'
import { BrowserPool } from './browser-pool.js'
import { renderToString } from 'react-dom/server'

import type { ConsoleMessage } from 'puppeteer'

interface RenderOptions {
  width?: number
  height?: number
  selector?: string
  unocss?: object | boolean
  deviceScaleFactor?: number
}

export class ReactRenderer {
  #browserPool: BrowserPool = new BrowserPool({
    maxWsEndpoints: 1,
    onReady: (bp) => {
      console.log('BrowserPool is ready')
    },
  })

  async render(Component: React.FunctionComponent, props: object, options: RenderOptions = {}) {
    const node = React.createElement(Component, props)

    const { width, height = 800, selector = '#content', unocss = true, deviceScaleFactor } = options

    const start = performance.now()
    const reactStart = start
    const html = renderToString(node)
    const reactEnd = performance.now()
    const reactTime = round(reactEnd - reactStart)

    const wrapper = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
  ${
    unocss
      ? `
    <link async rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@unocss/reset@0.63.4/tailwind.min.css">
    <script async src="https://cdn.jsdelivr.net/npm/@unocss/runtime@0.63.4/uno.global.min.js"></script>
    `
      : ''
  }
  </head>
    <body style="height: 300px; height: 300px; overflow: hidden;">
      <div id="content" class="inline-flex">${html}</div>
    </body>
  </html>
    `

    const launchStart = reactEnd

    const browser = await this.#browserPool.getBrowser()
    const page = await browser.newPage()

    const listener = async (msg: ConsoleMessage) => {
      console.log('console from browser >>> ', msg.text())
    }

    page.on('console', listener)

    const launchEnd = performance.now()
    const launchTime = round(launchEnd - launchStart)

    const useAutoWidth = !width
    const useAutoHeight = !height
    const _height = height || 800
    const _width = width || Math.ceil(height / 0.618)
    const el = selector || '#content'

    await page.setViewport({
      width: useAutoWidth ? 12_000 : _height,
      height: useAutoHeight ? 12_000 : _width,
      deviceScaleFactor: deviceScaleFactor || 2,
    })

    const renderStart = launchEnd
    await page.setContent(wrapper, { timeout: 6_000 })
    const renderEnd = performance.now()
    const renderTime = round(renderEnd - renderStart)

    const waitStart = renderEnd
    await page.waitForSelector(el)
    const waitEnd = performance.now()
    const waitTime = round(waitEnd - waitStart)

    const screenshotStart = waitEnd
    const wrapperHandler = await page.$(el)

    const uint8Array = await (wrapperHandler || page).screenshot({
      type: 'png',
      encoding: 'binary',
    })

    await page.close()
    await this.#browserPool.releaseBrowser(browser)

    const screenshotEnd = performance.now()
    const screenshotTime = round(screenshotEnd - screenshotStart)
    const totalTime = round(screenshotEnd - start)

    return {
      buffer: Buffer.from(uint8Array),
      timings: {
        react: reactTime,
        launch: launchTime,
        render: renderTime,
        wait: waitTime,
        screenshot: screenshotTime,
        total: totalTime,
      },
    }
  }
}

function round(num: number) {
  return Math.round(num * 100) / 100
}
