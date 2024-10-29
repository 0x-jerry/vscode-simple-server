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
  workspace,
  type ExtensionContext,
  Uri,
} from 'vscode'
import { StatusBar, type StatusBarConfig } from './StatusBar'
import { sleep } from '@0x-jerry/utils'

export interface SimpleServerOptions {
  taskName: string
  env: ExtensionContext
  autoStart?: boolean

  getStartCommand(): Thenable<string>

  /**
   * Return url by opened file uri, or return url root when uri is not available
   * @param uri
   */
  resolveUrl(uri?: Uri): Thenable<string>

  statusBar?: StatusBarConfig
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

    if (opt.statusBar) {
      this.statusBar = new StatusBar(opt.statusBar)
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

    const task = new Task(
      { type: 'SimpleServer' },
      TaskScope.Workspace,
      this.opt.taskName,
      'Provider by extension',
      new ShellExecution(await this.opt.getStartCommand())
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
    const workspaceFolder = workspace.getWorkspaceFolder(uri)

    if (!workspaceFolder) return

    const url = await this.opt.resolveUrl(uri)

    await this._openUrl(url)
  }

  async _detectServer(url: string) {
    let now = Date.now()

    const maxTime = now + 15 * 1000
    while (now < maxTime) {
      try {
        await fetch(url)

        // VitePress start success
        return true
      } catch (error) {
        // failed
        // ignore
      }

      await sleep(500)
      now = Date.now()
    }

    return false
  }

  async start() {
    if (this.isStarted) return

    this.serverStarted = false
    this.statusBar?.spinning()

    this.editorChangeListener = window.onDidChangeActiveTextEditor((e) => {
      this._navigateCurrentPage()
    })

    await this._startTask()

    const rootUrl = await this.opt.resolveUrl()
    this.serverStarted = await this._detectServer(rootUrl)

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
