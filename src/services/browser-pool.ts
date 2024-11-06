import * as puppeteer from 'puppeteer'

interface BrowserPoolOptions {
  maxWsEndpoints?: number
  maxPageOpenTimes?: number
  launchOptions?: puppeteer.PuppeteerLaunchOptions
  immediateLaunch?: boolean
  onReady?: (bp: BrowserPool) => void
}

export class BrowserPool {
  static _instance: BrowserPool | null = null

  #maxWsEndpoints = 10
  #maxPageOpenTimes = 1_000
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

  // browser id -> ws endpoint / page open times / update timer
  #wsEndpointMap = new Map<
    string,
    {
      id: string
      isBusy: boolean
      wsEndpoint: string
      pageOpenTimes: number
      updateTimer: NodeJS.Timeout | null
    }
  >()

  constructor(options?: BrowserPoolOptions) {
    this.#maxWsEndpoints = options?.maxWsEndpoints ?? this.#maxWsEndpoints
    this.#maxPageOpenTimes = options?.maxPageOpenTimes ?? this.#maxPageOpenTimes
    this.#launchOptions = options?.launchOptions ?? this.#launchOptions
    this.#onReady = options?.onReady ?? this.#onReady
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
    const browser = await puppeteer.launch(this.#launchOptions)
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
    for (let i = 0; i < this.#maxWsEndpoints; i++) {
      await this.#createBrowser()
    }
    this.#onReady(this)
  }

  getAvailableBrowser() {
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

  async getBrowser(target = this.getAvailableBrowser()) {
    if (!target) {
      return new Promise<puppeteer.Browser>((resolve) => {
        const timer = setInterval(() => {
          const target = this.getAvailableBrowser()
          if (target) {
            clearInterval(timer)
            resolve(this.getBrowser(target))
          }
        }, 300)
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
    const browser = await this.getBrowser()

    return {
      config: {
        maxWsEndpoints: this.#maxWsEndpoints,
        maxPageOpenTimes: this.#maxPageOpenTimes,
        launchOptions: this.#launchOptions,
      },
      wsEndpoints: Array.from(this.#wsEndpointMap.values()),
      uptime: process.uptime(),
      timestamp: Date.now(),
      versions: {
        node: process.version,
        v8: process.versions.v8,
        browser: await browser.version(),
      },
    }
  }
}

function uuid(length = 8) {
  return Math.random().toString(16).toUpperCase().substring(2, length)
}

function randItem<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)]
}
