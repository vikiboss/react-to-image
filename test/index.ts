import fs from 'node:fs/promises'

const request = (idx: number) =>
  fetch('http://localhost:8080/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      component: 'TestComponent',
      props: {
        name: `World ${idx}`,
        list: [idx.toString(), 'a', 'b', 'c'],
      },
    }),
  })
    .then((res) => res.arrayBuffer())
    .then(async (buffer) => {
      await fs.mkdir('./images', { recursive: true })
      await fs.writeFile(`./images/${idx}.png`, Buffer.from(buffer))
      console.log(`请求 ${idx} 执行完毕`)
    })

console.log('开始并发执行 100 次浏览器渲染请求并写入磁盘...')
const timeStart = performance.now()

await Promise.all(
  Array(100)
    .fill(0)
    .map((_, idx) => request(idx)),
)

console.log('所有请求执行完毕')
console.log('耗时:', (Math.round(((performance.now() - timeStart) / 1000) * 100) / 100).toLocaleString('zh-CN'), '秒')
