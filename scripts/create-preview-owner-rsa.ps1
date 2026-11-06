#requires -Version 7.2
# Windows PowerShell 7: creates a new private directory and an RSA-3072 keypair.
# Do not run in a repository, synced folder, or shared location.
param([string]$Directory = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'YaarLink-Preview-Owner-Key'))
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This helper requires Windows and PowerShell 7.2 or later.' }
if (Test-Path -LiteralPath $Directory) { throw 'The key directory already exists; refusing to overwrite it.' }
$fullPath = [IO.Path]::GetFullPath($Directory)
$created = New-Item -ItemType Directory -Path $fullPath
try {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($identity)
    $acl.SetAccessRuleProtection($true, $false)
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $fullPath -AclObject $acl
    $rsa = [System.Security.Cryptography.RSA]::Create(3072)
    try {
        $privateBytes = $rsa.ExportPkcs8PrivateKey()
        $publicBytes = $rsa.ExportSubjectPublicKeyInfo()
        function Convert-Pem([string]$Label, [byte[]]$Bytes) {
            $encoded = [Convert]::ToBase64String($Bytes, [Base64FormattingOptions]::InsertLineBreaks)
            return "-----BEGIN $Label-----`n$encoded`n-----END $Label-----`n"
        }
        [IO.File]::WriteAllText((Join-Path $fullPath 'owner-private.pem'), (Convert-Pem 'PRIVATE KEY' $privateBytes), [Text.Encoding]::ASCII)
        [IO.File]::WriteAllText((Join-Path $fullPath 'owner-public.pem'), (Convert-Pem 'PUBLIC KEY' $publicBytes), [Text.Encoding]::ASCII)
        $digest = [System.Security.Cryptography.SHA256]::HashData($publicBytes)
        Write-Host ('Public key SHA-256 fingerprint (SPKI DER): ' + [Convert]::ToHexString($digest).ToLowerInvariant())
        Write-Host ('Public key file: ' + (Join-Path $fullPath 'owner-public.pem'))
        Write-Host 'Private key remains in the restricted directory. Never upload or share it.'
    } finally {
        if ($privateBytes) { [Array]::Clear($privateBytes, 0, $privateBytes.Length) }
        $rsa.Dispose()
    }
} catch {
    Write-Error 'Key creation failed. Inspect the private directory locally; do not share its contents.'
    throw
}
