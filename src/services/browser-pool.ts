import fs from 'node:fs'
import url from 'node:url'
import path from 'node:path'
import * as puppeteer from 'puppeteer'
import exitHook from 'exit-hook'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

interface BrowserPoolOptions {
  maxWsEndpoints?: number
  maxPageOpenTimes?: number
  launchOptions?: puppeteer.PuppeteerLaunchOptions
  immediateLaunch?: boolean
  enableCache?: boolean
  onReady?: (bp: BrowserPool) => void
}

interface BrowserWsEndpointItem {
  id: string
  isBusy: boolean
  wsEndpoint: string
  pageOpenTimes: number
  updateTimer: NodeJS.Timeout | null
}

export class BrowserPool {
  static _instance: BrowserPool | null = null

  #cacheDir = path.join(__dirname, '.browser-data')
  #maxWsEndpoints = 6
  #maxPageOpenTimes = 1_000
  #enableCache = true

  #launchReady = false
  #waitingQueue: string[] = []
  #wsEndpointMap = new Map<string, BrowserWsEndpointItem>()

  #onReady: (bp: BrowserPool) => void = () => {}

  #launchOptions: puppeteer.PuppeteerLaunchOptions = {
    headless: true,
    args: [
      '--single-process',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--disable-background-timer-throttling',
    ],
  }

  constructor(options?: BrowserPoolOptions) {
    this.#maxWsEndpoints = options?.maxWsEndpoints ?? this.#maxWsEndpoints
    this.#maxPageOpenTimes = options?.maxPageOpenTimes ?? this.#maxPageOpenTimes
    this.#launchOptions = options?.launchOptions ?? this.#launchOptions
    this.#enableCache = options?.enableCache ?? this.#enableCache
    this.#onReady = options?.onReady ?? this.#onReady

    exitHook(async () => {
      for (const target of this.#wsEndpointMap.values()) {
        target.updateTimer && clearTimeout(target.updateTimer)
        if (target.wsEndpoint) {
          const browser = await puppeteer.connect({ browserWSEndpoint: target.wsEndpoint })
          await browser.close()
        }
      }
    })

    const immediateLaunch = options?.immediateLaunch ?? true
    immediateLaunch && this.initBrowser()
  }

  static getInstance(options?: BrowserPoolOptions) {
    if (!BrowserPool._instance) BrowserPool._instance = new BrowserPool(options)
    return BrowserPool._instance
  }

  async isBrowserBusy(id: string) {
    const target = this.#wsEndpointMap.get(id)
    return target ? target.isBusy : false
  }

  async #createBrowser(id = uuid()) {
    const browser = await puppeteer.launch({
      ...this.#launchOptions,
      userDataDir: this.#enableCache ? path.join(this.#cacheDir, id) : undefined,
    })
    const endpoint = browser.wsEndpoint()
    const target = this.#wsEndpointMap.get(id)

    if (target) {
      target.isBusy = false
      target.wsEndpoint = endpoint
      target.pageOpenTimes = 1 // first blank page
    } else {
      this.#wsEndpointMap.set(id, {
        id,
        isBusy: false,
        wsEndpoint: endpoint,
        pageOpenTimes: 1, // first blank page
        updateTimer: null,
      })
    }

    return browser
  }

  async #updateBrowser(browser: puppeteer.Browser, id: string, retries = 0): Promise<puppeteer.Browser> {
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    const target = this.#wsEndpointMap.get(id)!
    target.updateTimer && clearTimeout(target.updateTimer)

    const openPages = await browser.pages()
    const oneMinute = 60 * 1000

    if (openPages.length > 1 && retries > 0) {
      const nextRetries = retries - 1

      target.updateTimer = setTimeout(() => {
        this.#updateBrowser(browser, id, nextRetries)
      }, oneMinute)

      return browser
    }

    browser.close()

    return await this.#createBrowser(id)
  }

  async initBrowser() {
    const ids: string[] = []

    if (this.#enableCache && fs.existsSync(this.#cacheDir)) {
      const folderIds = fs.readdirSync(this.#cacheDir).slice(0, this.#maxWsEndpoints)
      for (const id of folderIds) {
        const lockFile = path.join(this.#cacheDir, id, 'SingletonLock')
        if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile)
        ids.push(id)
      }
    } else {
      ids.push(...Array.from({ length: this.#maxWsEndpoints }, () => uuid()))
    }

    for (const id of ids) {
      await this.#createBrowser(id)
    }

    this.#launchReady = true
    this.#onReady(this)
  }

  getAvailableTarget() {
    return randItem([...this.#wsEndpointMap.values()].filter((t) => !t.isBusy))
  }

  getTargetByBrowser(browser: puppeteer.Browser) {
    return [...this.#wsEndpointMap.values()].find((t) => t.wsEndpoint === browser.wsEndpoint())
  }

  async releaseBrowser(browser: puppeteer.Browser) {
    await browser.disconnect()
    const target = this.getTargetByBrowser(browser)
    if (target) target.isBusy = false
  }

  async getBrowser(target = this.getAvailableTarget()) {
    if (!target) {
      const queueId = uuid()
      this.#waitingQueue.push(queueId)
      return new Promise<puppeteer.Browser>((resolve) => {
        const timer = setInterval(() => {
          const target = this.getAvailableTarget()
          const isMyTurn = this.#waitingQueue.at(0) === queueId
          if (target && isMyTurn) {
            clearInterval(timer)
            this.#waitingQueue.shift()
            resolve(this.getBrowser(target))
          }
        }, 100)
      })
    }

    let browser: puppeteer.Browser

    try {
      target.isBusy = true

      browser = await puppeteer.connect({
        browserWSEndpoint: target.wsEndpoint,
      })

      if (target.pageOpenTimes > this.#maxPageOpenTimes) {
        browser = await this.#updateBrowser(browser, target.id)
      }
    } catch (err) {
      browser = await this.#createBrowser(target.id)
    }

    target.pageOpenTimes++

    return browser
  }

  async useBrowser(callback: (browser: puppeteer.Browser) => Promise<void>) {
    const browser = await this.getBrowser()
    await callback(browser)
    this.releaseBrowser(browser)
  }

  async waitRender(page: puppeteer.Page, timeout = 30_000) {
    const renderDoneHandle = await page.waitForFunction('window._renderDone', {
      polling: 120,
      timeout: timeout,
    })

    const renderDone = await renderDoneHandle.jsonValue()
    const hasMsg = renderDone && typeof renderDone === 'object' && 'msg' in renderDone

    if (hasMsg) {
      await page.close()
      throw new Error(String(renderDone.msg) || '')
    }
  }

  async getPage() {
    const browser = await this.getBrowser()
    const page = await browser.newPage()
    return page
  }

  async usePage(callback: (page: puppeteer.Page) => Promise<void>) {
    this.useBrowser(async (browser) => {
      const page = await browser.newPage()
      await callback(page)
      await page.close()
    })
  }

  async getStatus() {
    const wsEndpoints = Array.from(this.#wsEndpointMap.values())
    const availableWsEndpoints = wsEndpoints.filter((t) => !t.isBusy).length

    return {
      status: {
        launchReady: this.#launchReady,
        isBusy: this.#waitingQueue.length > 0,
        availableWsEndpoints: availableWsEndpoints,
        queueCount: this.#waitingQueue.length,
        queue: this.#waitingQueue,
      },
      config: {
        maxWsEndpoints: this.#maxWsEndpoints,
        maxPageOpenTimes: this.#maxPageOpenTimes,
        launchOptions: this.#launchOptions,
      },
      version: {
        node: process.version,
        v8: process.versions.v8,
      },
      time: {
        uptime: process.uptime(),
        timestamp: Date.now(),
      },
      wsEndpoints: wsEndpoints,
    }
  }
}

function uuid(length = 8) {
  return Math.random().toString(16).toUpperCase().substring(2, length)
}

function randItem<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)]
}
