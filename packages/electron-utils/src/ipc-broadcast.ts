export interface RendererEventTarget {
  isDestroyed(): boolean
  send(channel: string, ...args: unknown[]): void
}

/** Best-effort fan-out for state that is shared by several WebContents views. */
export function broadcastRendererEvent(
  targets: Iterable<RendererEventTarget>,
  channel: string,
  ...args: unknown[]
): void {
  for (const target of targets) {
    try {
      if (!target.isDestroyed()) target.send(channel, ...args)
    } catch {
      // A view may be destroyed between the guard and send; keep notifying peers.
    }
  }
}
