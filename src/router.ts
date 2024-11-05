import Router from '@koa/router'
import React from 'react'
import * as components from './components/index.js'
import { pagePool, renderReactComponentToImage } from './services/render-react.js'

export const router = new Router()

router.post('/create', async (ctx) => {
  const { component: compName, props = {} } = ctx.request.body

  if (!compName) {
    ctx.status = 401
    ctx.body = '`component` is required'
    return
  }

  const Component = components[compName as never] as React.ComponentType<any> | undefined

  if (!Component) {
    ctx.status = 404
    ctx.body = `Component <${compName} /> is not found`
    return
  }

  const node = React.createElement(Component, props)
  const imageBuffer = await renderReactComponentToImage(node)

  ctx.type = 'image/png'
  ctx.body = imageBuffer.buffer
})

router.get('/create', async (ctx) => {
  const { component: compName, props = '{}' } = ctx.request.query

  if (!compName) {
    ctx.status = 401
    ctx.body = '`component` is required'
    return
  }

  const Component = components[compName as never] as React.ComponentType<any> | undefined

  if (!Component) {
    ctx.status = 404
    ctx.body = `Component <${compName} /> is not found`
    return
  }

  const node = React.createElement(Component, JSON.parse(props as string))
  const imageBuffer = await renderReactComponentToImage(node)

  ctx.type = 'image/png'
  ctx.body = imageBuffer.buffer
})

router.get('/status', async (ctx) => {
  ctx.type = 'application/json'
  ctx.body = await pagePool.getStatus()
})
