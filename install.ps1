<#
.SYNOPSIS
    Applies (or removes) the Cursor UI customization.

.DESCRIPTION
    Finds the Cursor installation and runs scripts/cursor-custom.js with Cursor's
    bundled Node runtime. Close Cursor before running this script.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install.ps1
    powershell -ExecutionPolicy Bypass -File install.ps1 -Uninstall
    powershell -ExecutionPolicy Bypass -File install.ps1 -CursorPath "D:\Program Files\cursor"
#>
param(
    [switch]$Uninstall,
    # Cursor installation folder (the one containing Cursor.exe). Detected automatically when omitted.
    [string]$CursorPath,
    # Cursor user data folder. Defaults to %APPDATA%\Cursor.
    [string]$UserDataDir,
    # Cursor extensions folder. Defaults to %USERPROFILE%\.cursor\extensions.
    [string]$ExtensionsDir
)

$ErrorActionPreference = 'Stop'

function Find-CursorPath {
    $keys = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    $entry = Get-ItemProperty $keys -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like 'Cursor*' -and $_.InstallLocation } |
        Where-Object { Test-Path (Join-Path $_.InstallLocation 'Cursor.exe') } |
        Select-Object -First 1
    if ($entry) { return $entry.InstallLocation.TrimEnd('\') }

    $default = Join-Path $env:LOCALAPPDATA 'Programs\cursor'
    if (Test-Path (Join-Path $default 'Cursor.exe')) { return $default }
    return $null
}

if (-not $CursorPath) { $CursorPath = Find-CursorPath }
if (-not $CursorPath -or -not (Test-Path (Join-Path $CursorPath 'Cursor.exe'))) {
    Write-Error 'Cursor installation not found. Pass -CursorPath "<folder containing Cursor.exe>".'
}

$exe = Join-Path $CursorPath 'Cursor.exe'
$running = Get-Process -Name 'Cursor' -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and ([IO.Path]::GetFullPath($_.Path) -eq [IO.Path]::GetFullPath($exe)) }
if ($running) {
    Write-Error 'Cursor is running. Close all Cursor windows and run this script from a terminal outside Cursor.'
}

$script = Join-Path $PSScriptRoot 'scripts\cursor-custom.js'
$command = if ($Uninstall) { 'uninstall' } else { 'install' }
$arguments = @($script, $command, '--app', (Join-Path $CursorPath 'resources\app'))
if ($UserDataDir) { $arguments += @('--user-data', $UserDataDir) }
if ($ExtensionsDir) { $arguments += @('--extensions', $ExtensionsDir) }

$previous = $env:ELECTRON_RUN_AS_NODE
$env:ELECTRON_RUN_AS_NODE = '1'
try {
    & $exe @arguments
    $code = $LASTEXITCODE
} finally {
    $env:ELECTRON_RUN_AS_NODE = $previous
}
exit $code
