import Koa from 'koa'
import { router } from '../router.js'
import { bodyParser } from '@koa/bodyparser'

export const app = new Koa()

app.use(bodyParser())
app.use(router.routes()).use(router.allowedMethods())
