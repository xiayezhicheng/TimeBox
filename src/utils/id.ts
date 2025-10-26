const HEX: string[] = Array.from({ length: 256 }, (_, index) =>
  (index + 0x100).toString(16).slice(1),
)

export function createId(): string {
  const root =
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof window !== 'undefined' && window) ||
    (typeof self !== 'undefined' && self) ||
    undefined

  const cryptoObj: Crypto | undefined =
    (root && (root.crypto || (root as unknown as { msCrypto?: Crypto }).msCrypto)) || undefined

  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID()
  }

  if (cryptoObj?.getRandomValues) {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(16))
    if (bytes.length !== 16) {
      return cryptoObj.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
    }

    const sixth = bytes[6] ?? 0
    const eighth = bytes[8] ?? 0
    bytes[6] = (sixth & 0x0f) | 0x40
    bytes[8] = (eighth & 0x3f) | 0x80
    const hexBytes = Array.from(bytes, (value) => HEX[value] ?? '00')
    const segment = (start: number, end: number) => hexBytes.slice(start, end).join('')
    return `${segment(0, 4)}-${segment(4, 6)}-${segment(6, 8)}-${segment(8, 10)}-${segment(10, 16)}`
  }

  let timestamp = Date.now()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (timestamp + Math.random() * 16) % 16 | 0
    timestamp = Math.floor(timestamp / 16)
    if (char === 'x') {
      return random.toString(16)
    }
    return ((random & 0x3) | 0x8).toString(16)
  })
}
