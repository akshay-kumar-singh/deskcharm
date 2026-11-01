; Added to the installer electron-builder makes (package.json, build.nsis.include).

; Uninstalling takes DeskCharm out of what starts with Windows, too. The menu's
; Start with Windows writes a Run value named as Electron names the app:
; "electron.app." and its product name. An update runs the old uninstaller as
; well, and that keeps it.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.DeskCharm"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "electron.app.DeskCharm"
  ${endIf}
!macroend
