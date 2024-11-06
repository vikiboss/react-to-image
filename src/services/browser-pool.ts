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

  #maxWsEndpoints = 4
  #maxPageOpenTimes = 1000
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
      wsEndpoint: string
      pageOpenTimes: number
      updateTimer: NodeJS.Timeout | null
    }
  >()

  constructor(options?: BrowserPoolOptions) {
    this.#maxWsEndpoints = options?.maxWsEndpoints ?? 4
    this.#maxPageOpenTimes = options?.maxPageOpenTimes ?? 1000
    this.#launchOptions = options?.launchOptions ?? this.#launchOptions
    this.#onReady = options?.onReady ?? this.#onReady
    const immediateLaunch = options?.immediateLaunch ?? true
    immediateLaunch && this.initBrowser()
  }

  async #enableFocusEmulation(page: puppeteer.Page) {
    const session = await page.createCDPSession()
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  }

  static getInstance(options?: BrowserPoolOptions) {
    if (!BrowserPool._instance) BrowserPool._instance = new BrowserPool(options)
    return BrowserPool._instance
  }

  async #createBrowser(id = uuid()) {
    const browser = await puppeteer.launch(this.#launchOptions)
    const endpoint = browser.wsEndpoint()
    const target = this.#wsEndpointMap.get(id)

    if (target) {
      target.wsEndpoint = endpoint
      target.pageOpenTimes = 1 // first blank page
    } else {
      this.#wsEndpointMap.set(id, {
        id,
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

    const newBrowser = await this.#createBrowser(id)

    return newBrowser
  }

  async initBrowser() {
    for (let i = 0; i < this.#maxWsEndpoints; i++) {
      await this.#createBrowser()
    }
    this.#onReady(this)
  }

  async getBrowser() {
    const target = randItem([...this.#wsEndpointMap.values()])

    let browser: puppeteer.Browser

    try {
      browser = await puppeteer.connect({ browserWSEndpoint: target.wsEndpoint })

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
  }

  async #waitRender(page: puppeteer.Page, timeout = 30_000) {
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
    await this.#enableFocusEmulation(page)
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
        puppeteer: require('puppeteer/package.json').version,
      },
    }
  }

  async closeBrowser() {}
}

function uuid(length = 8) {
  return Math.random().toString(16).toUpperCase().substring(2, length)
}

function randItem<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)]
}
