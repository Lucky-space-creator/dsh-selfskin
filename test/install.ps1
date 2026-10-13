# dsh-selfskin - local installer.
#
# Everything here is ASCII on purpose: Windows PowerShell 5.1 misreads BOM-less
# UTF-8, and a mis-decoded quotation mark in a script that shells out to pnpm is
# a bad trade for localized console text. The Chinese guidance lives in README.md.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File test\install.ps1
#   powershell -ExecutionPolicy Bypass -File test\install.ps1 -Profile desktop
#   powershell -ExecutionPolicy Bypass -File test\install.ps1 -Refresh
#   powershell -ExecutionPolicy Bypass -File test\install.ps1 -DshPath "E:\AI\dsh\resources\runtime\cli\bin\dsh.cmd"
#
# -Refresh removes the installed copy before adding it back. A plain re-add does
# nothing: the specifier in package.json has not changed, so pnpm reports
# "Already up to date" and leaves the previous copy of the files in place.
#
# It does one thing: find the dsh CLI and ask it to install this package into the
# named profile. `dsh plugin add` performs package-manager work AND bundle
# selection (it appends the package to the profile's dsh.profile.bundles), which
# is why this script never edits profile files by hand.
#
# Two facts about the local install are load-bearing, and both were established by
# running the real install, not by reading the docs:
#
#   1. The specifier is `file:`, never a bare path. pnpm resolves a bare
#      local directory to the `link:` protocol, which creates a directory
#      symlink. Creating one across volumes needs privileges Windows does not
#      grant by default, and pnpm does not surface the failure: it prints
#      `+ dsh-selfskin link:...`, writes the dependency into package.json and
#      pnpm-lock.yaml, and leaves node_modules empty. The installer then dies
#      with "cannot resolve profile bundle". `file:` instead hardlinks the
#      package into node_modules, which needs no privileges.
#
#   2. The desktop build ships its CLI inside the application
#      (<install>\resources\runtime\cli\bin\dsh.cmd) and only puts it on PATH if
#      the user asks it to, so `Get-Command dsh` usually fails. This script
#      resolves the Start Menu / Desktop shortcut and derives the CLI from the
#      application it points at.

#Requires -Version 5.1
[CmdletBinding()]
param(
    [string] $Profile = 'desktop',
    [string] $PackagePath,
    [string] $DshPath,
    [switch] $Refresh
)

$ErrorActionPreference = 'Stop'

# $PackagePath defaults to this package's root, but it is resolved here rather
# than in the param block: on Windows PowerShell 5.1 $PSScriptRoot is still empty
# while a param() default is being evaluated, so `Split-Path -Parent $PSScriptRoot`
# throws "cannot bind argument to parameter 'Path' because it is an empty string"
# before the script does anything at all.
if ([string]::IsNullOrWhiteSpace($PackagePath)) {
    $scriptPath = $PSCommandPath
    if ([string]::IsNullOrWhiteSpace($scriptPath)) { $scriptPath = $MyInvocation.MyCommand.Path }
    if ([string]::IsNullOrWhiteSpace($scriptPath)) {
        throw 'cannot determine the script path; pass -PackagePath explicitly'
    }
    # <package>\test\install.ps1 -> <package>\test -> <package>
    $PackagePath = Split-Path -Parent (Split-Path -Parent $scriptPath)
}

# The CLI shim lives at a fixed offset inside the application directory.
$DshShimRelative = 'resources\runtime\cli\bin\dsh.cmd'

function Test-DshShim {
    param([string] $Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    if (Test-Path -LiteralPath $Path -PathType Leaf) { return (Resolve-Path -LiteralPath $Path).Path }
    return $null
}

# Resolve the application directory from its Start Menu / Desktop shortcut, then
# derive the CLI. Shortcuts are the only install location record the app leaves
# behind, and they exist for both per-user and machine-wide installs.
function Find-DshShimFromShortcuts {
    $roots = @(
        (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
        (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'),
        [Environment]::GetFolderPath('Desktop'),
        [Environment]::GetFolderPath('CommonDesktopDirectory')
    )

    try { $shell = New-Object -ComObject WScript.Shell } catch { return $null }

    foreach ($root in $roots) {
        if ([string]::IsNullOrWhiteSpace($root) -or -not (Test-Path -LiteralPath $root)) { continue }
        $links = @(Get-ChildItem -LiteralPath $root -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.BaseName -like '*Harness*' })

        foreach ($link in $links) {
            try { $target = $shell.CreateShortcut($link.FullName).TargetPath } catch { continue }
            if ([string]::IsNullOrWhiteSpace($target)) { continue }
            $candidate = Join-Path (Split-Path -Parent $target) $DshShimRelative
            $found = Test-DshShim $candidate
            if ($found) { return $found }
        }
    }
    return $null
}

function Find-DshShim {
    param([string] $Explicit)

    $explicitShim = Test-DshShim $Explicit
    if ($explicitShim) { return $explicitShim }

    $onPath = Get-Command dsh -CommandType Application, ExternalScript -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }

    $fromShortcut = Find-DshShimFromShortcuts
    if ($fromShortcut) { return $fromShortcut }

    $knownRoots = @(
        (Join-Path $env:ProgramFiles 'DeepSeek Harness'),
        (Join-Path ${env:ProgramFiles(x86)} 'DeepSeek Harness'),
        (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'),
        (Join-Path $env:LOCALAPPDATA 'DeepSeek Harness')
    )
    foreach ($root in $knownRoots) {
        $found = Test-DshShim (Join-Path $root $DshShimRelative)
        if ($found) { return $found }
    }

    return $null
}

Write-Host '== dsh-selfskin installer ==' -ForegroundColor Cyan
Write-Host ("package : {0}" -f $PackagePath)
Write-Host ("profile : {0}" -f $Profile)
Write-Host ''

$manifest = Join-Path $PackagePath 'package.json'
$patch = Join-Path $PackagePath 'cordis.patch.yml'
$bundle = Join-Path $PackagePath 'lib\client.js'

foreach ($required in @($manifest, $patch, $bundle)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw ("missing {0} -- is {1} the package root?" -f $required, $PackagePath)
    }
}

# pnpm reads the specifier as a URL-ish string; forward slashes keep it portable
# and match what ends up in pnpm-lock.yaml.
$spec = 'file:' + ((Resolve-Path -LiteralPath $PackagePath).Path -replace '\\', '/')

$dsh = Find-DshShim $DshPath
if (-not $dsh) {
    Write-Host 'Could not locate the dsh CLI.' -ForegroundColor Yellow
    Write-Host ''
    Write-Host 'Pass it explicitly, e.g.:'
    Write-Host '  -DshPath "E:\AI\dsh\resources\runtime\cli\bin\dsh.cmd"' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Or install from inside the app (no terminal needed):'
    Write-Host '  Settings -> Plugins -> Install, then enter this specifier:'
    Write-Host ("     {0}" -f $spec) -ForegroundColor Green
    Write-Host ''
    Write-Host 'Keep the "file:" prefix. A bare "E:\..." path is treated as a symlink'
    Write-Host 'request and silently installs nothing on a default Windows setup.'
    exit 1
}

Write-Host ("found dsh : {0}" -f $dsh)
Write-Host ("specifier : {0}" -f $spec)
Write-Host ("running   : dsh plugin --profile {0} add -w {1}" -f $Profile, $spec)
Write-Host ''

# Refreshing means uninstalling first. `add` compares the specifier string, which
# is unchanged, so pnpm short-circuits with "Already up to date" and the profile
# keeps the previous copy of the bundle -- a new build in src/ would never reach
# it. `--force` does not change that; only remove-then-add does.
if ($Refresh) {
    Write-Host 'refresh: removing the installed copy first' -ForegroundColor Cyan
    & $dsh plugin --profile $Profile remove dsh-selfskin
    if ($LASTEXITCODE -ne 0) {
        # A missing dependency is not a reason to stop: the add below still lands.
        Write-Host ("remove reported exit code {0}; continuing with add." -f $LASTEXITCODE) -ForegroundColor Yellow
    }
    Write-Host ''
}

# -w is required: the profile directory carries a pnpm-workspace.yaml, so pnpm
# treats it as a workspace root and refuses a bare `add` with ERR_PNPM_ADDING_TO_ROOT.
# Quit the application first if it is running -- the profile manifest is locked
# during a boot, and package operations wait on that lock.
& $dsh plugin --profile $Profile add -w $spec
$code = $LASTEXITCODE

Write-Host ''
if ($code -eq 0) {
    Write-Host 'installed. Restart the application to load the bundle.' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Expected on next launch:'
    Write-Host '  Settings -> General -> three rows below Appearance'
    Write-Host '    Skin / Button effects / Ambience'
    Write-Host '  the sidebar Plugins page -> dsh-selfskin listed as a loaded bundle'
    Write-Host ''
    Write-Host 'The install is a hardlinked COPY, not a live link, so a build in src/'
    Write-Host 'reaches the profile only by reinstalling. Re-running this script is NOT'
    Write-Host 'enough: pnpm answers "Already up to date" and leaves the old copy in'
    Write-Host 'place (--force does not help either). Remove first, then add:'
    Write-Host ''
    Write-Host ("  & `"$dsh`" plugin --profile $Profile remove dsh-selfskin")
    Write-Host ("  & `"$dsh`" plugin --profile $Profile add -w $spec")
    Write-Host ''
    Write-Host 'Or pass -Refresh to this script, which does exactly that.'
} else {
    Write-Host ("dsh plugin add failed with exit code {0}." -f $code) -ForegroundColor Red
    Write-Host 'Check that the profile name is correct (the desktop build uses "desktop", not "web").'
}

exit $code
