import Router from '@koa/router'
import * as components from './components/index.js'
import { ReactRenderer } from './services/react-renderer.js'
import { BrowserPool } from './services/browser-pool.js'
import type * as React from 'react'

export const router = new Router()
const reactRenderer = new ReactRenderer()

router.post('/create', async (ctx) => {
  const { component: compName, props = {} } = ctx.request.body

  if (!compName) {
    ctx.status = 401
    ctx.body = '`component` is required'
    return
  }

  const Component = components[compName as never] as React.FunctionComponent | undefined

  if (!Component) {
    ctx.status = 404
    ctx.body = `Component <${compName} /> is not found`
    return
  }

  const imageBuffer = await reactRenderer.render(Component, props)

  ctx.type = 'image/png'
  ctx.body = imageBuffer.buffer
})

router.get('/status', async (ctx) => {
  ctx.type = 'application/json'
  ctx.body = await BrowserPool.getInstance().getStatus()
})
