import path from 'node:path'
import url from 'node:url'

export const filename = (meta: ImportMeta) => url.fileURLToPath(meta.url)
export const dirname = (meta: ImportMeta) => path.dirname(filename(meta))

export const fromDirname = (meta: ImportMeta, ...paths: string[]) => {
  return path.resolve(dirname(meta), ...paths)
}
