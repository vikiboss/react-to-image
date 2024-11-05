import puppeteer from 'puppeteer'
import { fromDirname } from '../utils/index.js'

export class PagePool {
  #minPages = 2
  #maxPages = 8
  #pages: { page: puppeteer.Page; isBusy: boolean }[] = []
  #launchOptions: puppeteer.PuppeteerLaunchOptions = {}
  #browser: puppeteer.Browser | null = null

  constructor(options?: { maxPages?: number; minPages?: number; launchOptions?: puppeteer.LaunchOptions }) {
    this.#minPages = options?.minPages ?? this.#minPages
    this.#maxPages = options?.maxPages ?? this.#maxPages
    this.#launchOptions = options?.launchOptions ?? {
      headless: true,
      userDataDir: fromDirname(import.meta, './.browser-cache'),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    }
  }

  async #removePage(page: puppeteer.Page) {
    const index = this.#pages.findIndex((p) => p.page === page)
    if (index !== -1) {
      await this.#pages[index].page.close()
      this.#pages.splice(index, 1)
    }
  }

  async #setFocusEmulationEnabled(page: puppeteer.Page) {
    const session = await page.createCDPSession()
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  }

  async initBrowser() {
    this.#browser = await puppeteer.launch(this.#launchOptions)
    const pages = await this.#browser.pages()

    for (const page of pages) {
      await this.#setFocusEmulationEnabled(page)
      this.#pages.push({ page, isBusy: false })
    }

    while (this.#pages.length < this.#minPages) {
      console.log('create new page')
      const newPage = await this.#browser.newPage()
      await this.#setFocusEmulationEnabled(newPage)
      this.#pages.push({ page: newPage, isBusy: false })
    }

    return this.#browser
  }

  async getStatus() {
    return {
      pages: this.#pages.length,
      busyPages: this.#pages.filter((p) => p.isBusy).length,
      config: {
        maxPages: this.#maxPages,
        minPages: this.#minPages,
        launchOptions: this.#launchOptions,
      },
    }
  }

  async getPage() {
    if (!this.#browser) this.#browser = await this.initBrowser()

    let availablePage = this.#pages.find((p) => !p.isBusy)

    if (!availablePage && this.#pages.length < this.#maxPages) {
      const newPage = await this.#browser.newPage()
      availablePage = { page: newPage, isBusy: true }
      this.#pages.push(availablePage)
    } else if (availablePage) {
      availablePage.isBusy = true
    }

    if (availablePage) return availablePage.page

    return new Promise<puppeteer.Page>((resolve) => {
      const interval = setInterval(() => {
        availablePage = this.#pages.find((p) => !p.isBusy)
        if (availablePage) {
          availablePage.isBusy = true
          clearInterval(interval)
          resolve(availablePage.page)
        }
      }, 100)
    })
  }

  async releasePage(page: puppeteer.Page) {
    const pageWrapper = this.#pages.find((p) => p.page === page)

    if (pageWrapper) {
      pageWrapper.isBusy = false

      const moreThanOne = this.#pages.filter((p) => !p.isBusy).length > 1

      if (moreThanOne && this.#pages.length > this.#minPages) {
        await this.#removePage(pageWrapper.page)
      }
    }
  }

  async closeBrowser() {
    for (const { page } of this.#pages) await page.close()
    this.#pages = []
    await this.#browser?.close()
  }
}
