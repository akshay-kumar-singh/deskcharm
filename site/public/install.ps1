# Installs DeskCharm from PowerShell:
#
#   irm https://<site>/install.ps1 | iex
#
# Downloaded by PowerShell rather than a browser, the installer isn't marked
# as coming from the internet, so SmartScreen doesn't stop it. It comes from
# the latest GitHub release; $env:DESKCHARM_SETUP overrides it. Run in a block
# of its own, so nothing it sets is left behind in your PowerShell.
& {
  if ($env:OS -ne 'Windows_NT') { Write-Host 'This installs DeskCharm on Windows. For a Mac, use install.sh from the same site.'; return }

  $url = if ($env:DESKCHARM_SETUP) { $env:DESKCHARM_SETUP } else { 'https://github.com/akshay-kumar-singh/deskcharm/releases/latest/download/DeskCharm-Setup.exe' }
  $setup = Join-Path ([IO.Path]::GetTempPath()) 'DeskCharm-Setup.exe'
  # Where the installer puts it: for this user only, so it needs no admin rights.
  $app = Join-Path $env:LOCALAPPDATA 'Programs\deskcharm\DeskCharm.exe'

  Write-Host '==> Downloading DeskCharm'
  if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    curl.exe -fL --progress-bar -o $setup $url
    if ($LASTEXITCODE -ne 0) { throw "Couldn't download $url" }
  } else {
    # Windows PowerShell's own download, without its progress bar, which slows it to a crawl.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $setup -UseBasicParsing -ErrorAction Stop
  }

  Write-Host '==> Installing'
  $running = Get-Process DeskCharm -ErrorAction SilentlyContinue
  if ($running) { $running | Stop-Process -Force; $running | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue }
  $installer = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru -ErrorAction Stop
  Remove-Item $setup -Force -ErrorAction SilentlyContinue
  if ($installer.ExitCode -ne 0 -or -not (Test-Path $app)) { throw "DeskCharm didn't install (the installer exited with $($installer.ExitCode))." }

  Start-Process -FilePath $app
  Write-Host '==> Done. Your charm hangs from the top of the screen, and its menu is in the system tray.'
}
