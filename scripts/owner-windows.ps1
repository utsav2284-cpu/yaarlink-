# requires -Version 7.2
# YaarLink owner setup — Windows PowerShell 7 helper.
#
# Run this from the repository root (the folder that contains package.json).
# It never prints the private key and never sends anything over the network.
#
#   pwsh ./scripts/owner-windows.ps1 Keygen
#   pwsh ./scripts/owner-windows.ps1 Check
#   pwsh ./scripts/owner-windows.ps1 Decrypt -Ciphertext C:\path\to\invitation.enc
#
# All heavy lifting is done by the repo's own Node scripts, so this wrapper only
# removes the Windows-specific friction (no `export`, no `\` line continuation,
# no `openssl dgst -hex`, no `$PWD/.local` path mangling).
param(
    [Parameter(Position = 0)]
    [ValidateSet('Keygen', 'Check', 'Decrypt', 'Fingerprint')]
    [string]$Command = 'Check',

    [string]$Ciphertext,
    [int]$Bits = 3072,
    [switch]$WriteTokenToFile
)

$ErrorActionPreference = 'Stop'

function Assert-RepoRoot {
    $root = (Get-Location).Path
    if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) {
        throw "Not in the repository root. Run 'cd' into the folder that contains package.json first (currently: $root)."
    }
    return $root
}

function Assert-Node {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw "Node.js was not found on PATH. Install Node 22 or newer from https://nodejs.org" }
    $major = [int]( (& node --version) -replace '^v(\d+)\..*$', '$1' )
    if ($major -lt 22) { throw "Node 22 or newer is required (found $(node --version)). The repo's .nvmrc pins 22.22.3." }
    return $major
}

function Assert-DotLocal {
    $dotLocal = Join-Path (Get-Location).Path '.local'
    if (-not (Test-Path -LiteralPath $dotLocal)) {
        New-Item -ItemType Directory -Path $dotLocal | Out-Null
    }
    # Keep key material out of cloud-synced folders and off other users' sight.
    Write-Host "Key directory: $(Join-Path $dotLocal 'keys')" -ForegroundColor DarkGray
}

try {
    $root = Assert-RepoRoot
    $null = Assert-Node
    Write-Host "Repository: $root" -ForegroundColor DarkGray
    Write-Host "PowerShell: $($PSVersionTable.PSVersion)  OS: $([Environment]::OSVersion.VersionString)" -ForegroundColor DarkGray
    Write-Host ''

    switch ($Command) {
        'Keygen' {
            Assert-DotLocal
            if ($Bits -lt 2048) { throw 'Bits must be at least 2048.' }
            $keyScript = Join-Path $root 'scripts/owner-key.mjs'
            & node $keyScript generate --bits $Bits
            if ($LASTEXITCODE -ne 0) { throw "Key generation failed (exit $LASTEXITCODE)." }
            Write-Host ''
            Write-Host 'Next: copy the fingerprint above into --recipient-key-sha256.' -ForegroundColor Cyan
            Write-Host 'Keep owner-private.pem on THIS machine only. Never email it, upload it, or commit it.' -ForegroundColor Yellow
        }

        'Fingerprint' {
            $keyScript = Join-Path $root 'scripts/owner-key.mjs'
            & node -e "import('./scripts/lib/owner-keypair.mjs').then(m=>console.log(m.fingerprintFromFile('.local/keys/owner-public.pem')))"
            if ($LASTEXITCODE -ne 0) { throw 'Could not read the public key. Run Keygen first.' }
        }

        'Check' {
            $preflight = Join-Path $root 'scripts/owner-preflight.mjs'
            & node $preflight
            if ($LASTEXITCODE -ne 0) {
                Write-Host ''
                Write-Host 'Blocking problems above must be fixed before Step 3.' -ForegroundColor Yellow
                exit 1
            }
        }

        'Decrypt' {
            if (-not $Ciphertext) { throw 'Pass -Ciphertext C:\absolute\path\to\invitation.enc' }
            if (-not [IO.Path]::IsPathRooted($Ciphertext)) { throw 'Ciphertext must be an absolute path.' }
            $keyScript = Join-Path $root 'scripts/owner-key.mjs'
            $extra = @()
            if ($WriteTokenToFile) { $extra += '--write' }
            & node $keyScript decrypt --ciphertext $Ciphertext @extra
            if ($LASTEXITCODE -ne 0) { throw "Decryption failed (exit $LASTEXITCODE)." }
            if (-not $WriteTokenToFile) {
                Write-Host ''
                Write-Host 'Paste that 64-character token into https://www.theyaar.com/admin/setup' -ForegroundColor Cyan
            }
        }
    }
}
catch {
    Write-Host ''
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Nothing was created or changed by this failure.' -ForegroundColor DarkGray
    exit 1
}
