// Shared request-body parsing for the API router and resource modules.
export class InputError extends Error {}
export const fail = message => { throw new InputError(message) }
const MAX_BODY = 65536

export async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) fail('Content-Type must be application/json')
  const reader = request.body?.getReader()
  if (!reader) fail('JSON object body required')
  let size = 0
  const chunks = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY) { await reader.cancel(); fail('Body exceeds 64 KiB') }
    chunks.push(value)
  }
  const buffer = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength }
  let body
  try { body = JSON.parse(new TextDecoder().decode(buffer)) } catch { fail('Invalid JSON') }
  if (!body || Array.isArray(body) || typeof body !== 'object') fail('JSON object required')
  return body
}

// For methods where a body is optional (DELETE): no body or empty body means {}.
export async function readOptionalBody(request) {
  if (!request.body || request.headers.get('Content-Length') === '0') return {}
  return readBody(request)
}
