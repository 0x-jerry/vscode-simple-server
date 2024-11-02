import { noop } from '@0x-jerry/utils'

export interface Logger {
  info(msg: string, ...items: unknown[]): void
}

export const emptyLogger: Logger = {
  info: noop,
}
