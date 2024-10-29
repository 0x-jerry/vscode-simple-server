import { Disposable, StatusBarAlignment, window, type StatusBarItem } from 'vscode'

type StatusBarInfo = Partial<
  Pick<StatusBarItem, 'tooltip' | 'command' | 'color' | 'backgroundColor'>
> &
  Pick<StatusBarItem, 'text'>

export interface StatusBarConfig {
  priority?: number

  started: StatusBarInfo
  spinning: StatusBarInfo
  stopped: StatusBarInfo
}

enum StatusBarState {
  Started = 'started',
  Spinning = 'spinning',
  Stopped = 'stopped',
}

export class StatusBar implements Disposable {
  _statusBar: StatusBarItem

  state = StatusBarState.Stopped

  constructor(readonly opt: StatusBarConfig) {
    this._statusBar = window.createStatusBarItem(StatusBarAlignment.Right, opt.priority)
    this._updateInfo()
    this._statusBar.show()
  }

  started() {
    this.state = StatusBarState.Started
    this._updateInfo()
  }

  spinning() {
    this.state = StatusBarState.Spinning
    this._updateInfo()
  }

  stopped() {
    this.state = StatusBarState.Stopped
    this._updateInfo()
  }

  _updateInfo() {
    const config = this.opt[this.state]

    this._statusBar.text = config.text
    this._statusBar.tooltip = config.tooltip
    this._statusBar.command = config.command
    this._statusBar.color = config.color
    this._statusBar.backgroundColor = config.backgroundColor
  }

  dispose() {
    this._statusBar.dispose()
  }
}
