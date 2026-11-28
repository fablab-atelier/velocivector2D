#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$InnoCompiler,
    [string]$CertificateThumbprint,
    [string]$SignTool,
    [string]$TimestampUrl,
    [string]$SigningLibrary,
    [string]$SigningMetadata
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$compiler = (Get-Item -LiteralPath $InnoCompiler).FullName
$stage = Join-Path $PSScriptRoot '.build'
if (Test-Path -LiteralPath $stage) {
    $entry = Get-Item -LiteralPath $stage -Force
    if ($entry.FullName -ne $stage -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Invalid staging directory.'
    }
    Remove-Item -LiteralPath $stage -Recurse -Force
}
$app = Join-Path $stage 'app'
$pluginDir = Join-Path $app 'plugins'
New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null
$stock = @('airfoils', 'drone', 'pulleys', 'transmissions', 'workshop-builder')
$assets = @('index.html', 'style.css', 'velocivector.ico', 'velocivector-logo.svg', 'LICENSE', 'locales')
$html = Get-Content -LiteralPath (Join-Path $root 'index.html') -Raw
$assets += [regex]::Matches($html, '<script src="([a-z0-9-]+\.js)"') |
    ForEach-Object { $_.Groups[1].Value }
foreach ($asset in $assets) {
    Copy-Item -LiteralPath (Join-Path $root $asset) -Destination $app -Recurse
}
foreach ($asset in @('host.js', 'transmission-core.js', 'README.md', 'API-AGENT.md') + $stock) {
    Copy-Item -LiteralPath (Join-Path (Join-Path $root 'plugins') $asset) -Destination $pluginDir -Recurse
}
[IO.File]::WriteAllLines((Join-Path $app 'stock-plugins.txt'), [string[]]$stock)

$launcher = Join-Path $stage 'Velocivector.exe'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
$cscOptions = @('/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/reference:System.Windows.Forms.dll',
    "/out:$launcher", "/win32icon:$(Join-Path $root 'velocivector.ico')", (Join-Path $PSScriptRoot 'Launcher.cs'))
& $csc @cscOptions
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }

$options = @()
$suffix = '-TEST-NON-SIGNE'
if ($CertificateThumbprint -and ($SigningLibrary -or $SigningMetadata)) {
    throw 'Choose either a Windows certificate or an Artifact Signing profile.'
}
if ($CertificateThumbprint -or $SigningLibrary -or $SigningMetadata) {
    $description = 'Velocivector 0.1.0 alpha'
    if (!$SignTool) { throw 'SignTool is required for a signed build.' }
    $signer = (Get-Item -LiteralPath $SignTool).FullName
    if ($CertificateThumbprint) {
        if ($CertificateThumbprint -notmatch '\A[0-9a-fA-F]{40}\z') { throw 'Invalid certificate thumbprint.' }
        $providerOptions = @('/sha1', $CertificateThumbprint)
        if (!$TimestampUrl) { $TimestampUrl = 'http://timestamp.digicert.com' }
    } else {
        if (!$SigningLibrary -or !$SigningMetadata) { throw 'Artifact Signing requires both the client library and metadata.' }
        $providerOptions = @('/dlib', (Get-Item -LiteralPath $SigningLibrary).FullName,
            '/dmdf', (Get-Item -LiteralPath $SigningMetadata).FullName)
        if (!$TimestampUrl) { $TimestampUrl = 'http://timestamp.acs.microsoft.com/' }
    }
    if ($TimestampUrl -notmatch '\Ahttps?://[a-zA-Z0-9./_-]+\z') { throw 'Invalid timestamp URL.' }
    $signOptions = @('sign', '/fd', 'SHA256', '/tr', $TimestampUrl, '/td', 'SHA256', '/d', $description) + $providerOptions
    & $signer @signOptions $launcher
    $signResult = $LASTEXITCODE
    $signature = Get-AuthenticodeSignature -LiteralPath $launcher
    if ($signResult -ne 0 -or $signature.Status -ne 'Valid' -or !$signature.TimeStamperCertificate) {
        throw 'The launcher requires a valid timestamped Authenticode signature.'
    }
    # Inno Setup substitutes $q with a quote and $f with the quoted output path.
    $tokens = @($signer) + $signOptions | ForEach-Object { '$q' + $_.Replace('$', '$$') + '$q' }
    $command = ($tokens -join ' ') + ' $f'
    $options = @('/DSignedBuild=1', "/SReleaseSign=$command")
    $suffix = ''
}
& $compiler @options (Join-Path $PSScriptRoot 'Velocivector.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
$output = Join-Path $root "releases\Velocivector-Alpha-0.1.0-Windows$suffix.exe"
if (!$suffix) {
    $signature = Get-AuthenticodeSignature -LiteralPath $output
    if ($signature.Status -ne 'Valid' -or !$signature.TimeStamperCertificate) {
        throw 'Installer signature or timestamp verification failed.'
    }
}
$hash = (Get-FileHash -LiteralPath $output).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$output.sha256", "$hash  $([IO.Path]::GetFileName($output))" + [Environment]::NewLine)
Get-Item -LiteralPath $output
