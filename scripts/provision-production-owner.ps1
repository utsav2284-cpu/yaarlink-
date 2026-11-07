# requires -Version 7.2
# Create the Production owner bootstrap invitation (Windows PowerShell 7).
#
# Run from the repository root, after `owner-windows.ps1 Keygen` and
# `owner-windows.ps1 Check`.
#
#   $env:ADMIN_PRODUCTION_OPERATOR_DATABASE_URL = 'postgresql://postgres.<ref>:<pw>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres'
#   pwsh ./scripts/provision-production-owner.ps1 -DryRun
#   pwsh ./scripts/provision-production-owner.ps1 -Execute
#
# Use the SESSION POOLER. The direct host db.<ref>.supabase.co is IPv6-only and
# most home connections in India are IPv4-only.
param(
    [Parameter(Mandatory = $true)][ValidateSet('DryRun', 'Execute')][string]$Mode,
    [string]$AuthorizationRef = 'ISSUE-001',
    [string]$PublicKeyPath,
    [string]$Fingerprint,
    [string]$TokenFile,
    [switch]$RetireExpiredInvitation
)

$ErrorActionPreference = 'Stop'

try {
    $root = (Get-Location).Path
    if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) {
        throw "Not in the repository root. 'cd' into the folder that contains package.json first."
    }
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw 'Node.js was not found on PATH. Install Node 22 or newer.' }

    if (-not $env:ADMIN_PRODUCTION_OPERATOR_DATABASE_URL) {
        throw 'ADMIN_PRODUCTION_OPERATOR_DATABASE_URL is not set. Set it with $env:... = ''...'' (see the header of this file).'
    }
    if (-not $PublicKeyPath) { $PublicKeyPath = Join-Path $root '.local/keys/owner-public.pem' }
    if (-not (Test-Path -LiteralPath $PublicKeyPath)) {
        throw "Public key not found at $PublicKeyPath. Run: pwsh ./scripts/owner-windows.ps1 Keygen"
    }
    $PublicKeyPath = [IO.Path]::GetFullPath($PublicKeyPath)

    if (-not $Fingerprint) {
        $Fingerprint = (& node -e "import('./scripts/lib/owner-keypair.mjs').then(m=>console.log(m.fingerprintFromFile(process.argv[1])))" $PublicKeyPath).Trim()
    }
    if ($Fingerprint -notmatch '^[0-9a-fA-F]{64}$') { throw "Fingerprint is not 64 hex characters: '$Fingerprint'" }

    $modeFlag = if ($Mode -eq 'DryRun') { '--dry-run' } else { '--execute' }
    $args = @(
        (Join-Path $root 'scripts/provision-production-owner.mjs'),
        $modeFlag,
        '--authorization-ref', $AuthorizationRef,
        '--recipient-public-key', $PublicKeyPath,
        '--recipient-key-sha256', $Fingerprint.ToLower()
    )
    if ($Mode -eq 'Execute') {
        if (-not $TokenFile) { $TokenFile = Join-Path $root '.local/keys/invitation.enc' }
        $args += @('--token-file', [IO.Path]::GetFullPath($TokenFile))
        if ($RetireExpiredInvitation) { $args += '--retire-expired-invitation' }
    }

    Write-Host "Fingerprint: $($Fingerprint.ToLower())" -ForegroundColor DarkGray
    Write-Host "Public key : $PublicKeyPath" -ForegroundColor DarkGray
    Write-Host "Mode       : $Mode" -ForegroundColor DarkGray
    Write-Host ''

    & node @args
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        Write-Host ''
        Write-Host 'Provisioning failed or was denied. No secret values were displayed.' -ForegroundColor Red
        Write-Host 'If the commit status is uncertain, inspect bootstrap state before any retry.' -ForegroundColor Yellow
        exit $code
    }
    if ($Mode -eq 'Execute') {
        Write-Host ''
        Write-Host "Encrypted token written to: $TokenFile" -ForegroundColor Cyan
        Write-Host 'The invitation is valid for 24 hours. Claim it the same day.' -ForegroundColor Yellow
    }
}
catch {
    Write-Host ''
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Nothing was created.' -ForegroundColor DarkGray
    exit 1
}
