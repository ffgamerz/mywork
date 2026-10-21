// Local Pages-function adapter. Uses only the server-side .dev.vars file.
// Never load server secrets into Vite or import this into the frontend.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { onRequest } from '../functions/api/v1/[[path]].js'

let file = ''
try { file = readFileSync('.dev.vars', 'utf8') } catch { /* unauthenticated tests work without secrets */ }
const env = Object.fromEntries(file.split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => {
  const index = line.indexOf('=')
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')]
}))
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:8788')
    if (!/^\/api\/v1(?:\/|$)/.test(url.pathname)) { res.writeHead(404).end(); return }
    const request = new Request(url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) })
    const response = await onRequest({ request, env })
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch { res.writeHead(500, { 'Content-Type': 'application/json' }).end('{"error":"Local server error"}') }
}).listen(8788, '127.0.0.1', () => console.log('Mywork API: http://127.0.0.1:8788/api/v1'))
