/**
 * Reads an HTTP response body without trusting Content-Length and without abandoning the
 * connection when a response is rejected.
 *
 * Both the summary fetch and the origin challenge use this. Keeping one implementation matters:
 * the size cap and body cancellation are socket-safety code, and fixing one copy while another
 * quietly drifts is how a long-running poller leaks memory or connections.
 */
export interface BoundedReadOptions {
  /** Word used at the start of error messages, e.g. "Response" or "challenge". */
  label: string
  error: (message: string) => Error
}

export const discardResponse = async (response: Response): Promise<void> => {
  await response.body?.cancel().catch(() => undefined)
}

export const readBoundedText = async (
  response: Response,
  maxBytes: number,
  { label, error }: BoundedReadOptions,
): Promise<string> => {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discardResponse(response)
    throw error(`${label} declares ${declared} bytes, over the ${maxBytes} cap`)
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      // Checked while reading, not after: a Content-Length can lie, or be absent entirely on a
      // chunked response, and the point of the cap is to stop reading rather than to complain
      // once the memory is already gone.
      if (total > maxBytes) throw error(`${label} exceeded the ${maxBytes} byte cap`)
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks).toString('utf8')
}
