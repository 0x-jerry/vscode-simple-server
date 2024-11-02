import {
  type Disposable,
  ShellExecution,
  Task,
  TaskRevealKind,
  TaskScope,
  ViewColumn,
  commands,
  tasks,
  window,
  type ExtensionContext,
  Uri,
  type ShellExecutionOptions,
} from 'vscode'
import { StatusBar, type StatusBarConfig } from './StatusBar'
import { sleep, type Awaitable } from '@0x-jerry/utils'

interface ServerCommandOptions extends ShellExecutionOptions {
  commandLine: string
}

export interface SimpleServerOptions {
  taskName: string
  env: ExtensionContext
  autoStart?: boolean

  getStartServerCommand(): Awaitable<ServerCommandOptions>

  /**
   * Return url by {@link activeTextUri}, should return url root when {@link activeTextUri} is unavailable
   *
   * @param activeTextUri
   */
  resolveUrl(activeTextUri?: Uri): Awaitable<string | undefined>

  statusBar?: StatusBarConfig

  /**
   * Detect server start timeout
   *
   * @default 10_000 10s
   */
  checkTimeout?: number
}

export class SimpleServer implements Disposable {
  _disposables: Disposable[] = []

  editorChangeListener?: Disposable

  taskHandler?: Disposable

  currentUrl?: string

  serverStarted?: boolean

  statusBar?: StatusBar

  get isStarted() {
    return !!this.editorChangeListener
  }

  constructor(readonly opt: SimpleServerOptions) {
    if (opt.statusBar) {
      this.statusBar = new StatusBar(opt.statusBar)
    }

    this._addDisposable(
      tasks.onDidEndTask((e) => {
        if (e.execution.task.name === this.opt.taskName) {
          this.stop()
        }
      })
    )

    this._addDisposable(
      window.onDidCloseTerminal((e) => {
        if (e.name === this.opt.taskName) {
          this.stop()
        }
      })
    )

    if (opt.autoStart) {
      this.start()
    }
  }

  _addDisposable(t: Disposable) {
    this._disposables.push(t)
  }

  async _openUrl(url: string) {
    const hasSimpleBrowserOpened = !!window.tabGroups.all.find((group) => {
      return group.tabs.find((t) => t.label === 'Simple Browser')
    })

    if (this.currentUrl === url && hasSimpleBrowserOpened) return

    if (this.serverStarted) {
      this.currentUrl = url
    }

    // https://github.com/microsoft/vscode/blob/403294d92b4fbcdad61bb74635a8e5e145151aaa/extensions/simple-browser/src/extension.ts#L58
    await commands.executeCommand('simpleBrowser.api.open', url, {
      viewColumn: ViewColumn.Beside,
      preserveFocus: true,
    })
  }

  async _startTask() {
    const existsTask = window.terminals.find((t) => t.name === this.opt.taskName)

    if (existsTask && existsTask.exitStatus == null) {
      this.taskHandler = existsTask
      return
    }

    const { commandLine, ...shellOptions } = await this.opt.getStartServerCommand()

    const task = new Task(
      { type: 'SimpleServer' },
      TaskScope.Workspace,
      this.opt.taskName,
      'Provider by extension',
      new ShellExecution(commandLine, shellOptions)
    )

    task.isBackground = true
    task.presentationOptions.reveal = TaskRevealKind.Silent

    const execution = await tasks.executeTask(task)

    this.taskHandler = {
      dispose() {
        execution.terminate()
      },
    }
  }

  toggle() {
    if (this.isStarted) {
      this.stop()
    } else {
      this.start()
    }
  }

  async _navigateCurrentPage() {
    if (!window.activeTextEditor) return

    const uri = window.activeTextEditor.document.uri

    const url = await this.opt.resolveUrl(uri)

    if (url) {
      await this._openUrl(url)
    }
  }

  async _detectServer(url: string) {
    let now = Date.now()

    const maxTime = now + (this.opt.checkTimeout ?? 10_000)

    while (now < maxTime) {
      try {
        await fetch(url)

        // VitePress start success
        return true
      } catch (error) {
        console.warn('fetch url failed', error)
        // failed
        // ignore
      }

      await sleep(500)
      now = Date.now()
    }

    return true
  }

  async start() {
    if (this.isStarted) return

    this.serverStarted = false
    this.statusBar?.spinning()

    this.editorChangeListener = window.onDidChangeActiveTextEditor((e) => {
      this._navigateCurrentPage()
    })

    await this._startTask()
    this.serverStarted = true

    const rootUrl = await this.opt.resolveUrl()
    if (rootUrl) {
      await this._detectServer(rootUrl)
    }

    this._navigateCurrentPage()
    this.statusBar?.started()
  }

  stop() {
    this.editorChangeListener?.dispose()
    this.editorChangeListener = undefined

    this.taskHandler?.dispose()
    this.taskHandler = undefined

    this.currentUrl = undefined
    this.serverStarted = undefined
    this.statusBar?.stopped()
  }

  dispose() {
    this.stop()

    this.statusBar?.dispose()
    this._disposables.forEach((i) => i.dispose())
  }
}
