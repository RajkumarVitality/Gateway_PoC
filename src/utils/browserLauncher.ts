import { exec, execFile } from 'node:child_process';

/**
 * Opens the given URL in the host machine's default browser (macOS, Windows,
 * and Linux). This is a best-effort convenience action: any failure (e.g. no
 * GUI/display available, such as on a headless CI runner) is reported via
 * `onError` instead of throwing, so it never fails the test run.
 */
export function openInDefaultBrowser(url: string, onError: (message: string) => void = console.warn): void {
  const command = process.platform === 'darwin'
    ? `open "${url}"`
    : process.platform === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;

  exec(command, error => {
    if (error) {
      onError(`Unable to open browser for ${url}: ${error.message}`);
    }
  });
}

const CHROMIUM_STYLE_BROWSERS = ['Google Chrome', 'Microsoft Edge', 'Brave Browser'];

function macCloseScriptLines(url: string): string[] {
  const escapedUrl = url.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const lines: string[] = [];
  for (const app of [...CHROMIUM_STYLE_BROWSERS, 'Safari']) {
    lines.push(
      `if application "${app}" is running then`,
      `  tell application "${app}"`,
      '    repeat with w in windows',
      '      try',
      '        set tabList to tabs of w',
      '        repeat with i from (count of tabList) to 1 by -1',
      '          set t to item i of tabList',
      `          if (URL of t contains "${escapedUrl}") then`,
      '            close t',
      '          end if',
      '        end repeat',
      '      end try',
      '    end repeat',
      '  end tell',
      'end if'
    );
  }
  return lines;
}

/**
 * Best-effort attempt to close the browser tab/window that was opened for the
 * given URL (e.g. the LambdaTest live-session dashboard) once execution
 * completes. This is NOT guaranteed to be precise:
 *  - macOS: closes matching tabs by exact URL in Chrome, Edge, Brave, and
 *    Safari (only inspects browsers that are already running).
 *  - Windows/Linux: there is no reliable, dependency-free way to match a
 *    single tab by URL, so the whole browser window whose title contains
 *    "lambdatest" is closed instead. This can occasionally close an
 *    unrelated window/tab if more than one matches.
 * Any failure is reported via `onError` instead of throwing.
 */
export function closeLiveSessionTab(url: string, onError: (message: string) => void = console.warn): Promise<void> {
  return new Promise(resolve => {
    if (process.platform === 'darwin') {
      const args = macCloseScriptLines(url).flatMap(line => ['-e', line]);
      execFile('osascript', args, error => {
        if (error) {
          onError(`Unable to close live session browser tab: ${error.message}`);
        }
        resolve();
      });
      return;
    }

    if (process.platform === 'win32') {
      const psScript = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class LtWin32 {
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
'@
Get-Process | Where-Object { $_.MainWindowTitle -match 'lambdatest' } | ForEach-Object {
  [LtWin32]::PostMessage($_.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
}`;
      execFile('powershell', ['-NoProfile', '-Command', psScript], error => {
        if (error) {
          onError(`Unable to close live session browser window: ${error.message}`);
        }
        resolve();
      });
      return;
    }

    execFile(
      'bash',
      ['-c', "wmctrl -l | grep -i lambdatest | awk '{print $1}' | xargs -r -n1 wmctrl -ic"],
      error => {
        if (error) {
          onError(`Unable to close live session browser window (is wmctrl installed?): ${error.message}`);
        }
        resolve();
      }
    );
  });
}
