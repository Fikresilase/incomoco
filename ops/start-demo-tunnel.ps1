# Publishes the app (proxy on 127.0.0.1:8090, same as :3000) through localhost.run. Run only when that provider
# is approved for the demo. No SSH keys or authentication agent are used.
$ErrorActionPreference = 'Stop'
$demoTunnelDir = Join-Path $env:TEMP 'incomoco-public-tunnel'
New-Item -ItemType Directory -Path $demoTunnelDir -Force | Out-Null
# Prefer Windows' built-in OpenSSH: other ssh builds on PATH (e.g. Git's) don't accept `-F NUL`.
$windowsSsh = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
$demoSsh = if (Test-Path $windowsSsh) { $windowsSsh } else { (Get-Command ssh.exe).Source }
$demoArgs = @(
    '-F', 'NUL', '-T',
    '-o', 'BatchMode=yes',
    '-o', 'IdentityAgent=none',
    '-o', 'IdentityFile=none',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', ('UserKnownHostsFile="' + (Join-Path $demoTunnelDir 'known_hosts') + '"'),
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'ExitOnForwardFailure=yes',
    '-R', '80:127.0.0.1:8090', 'nokey@localhost.run'
)
$demoProcess = Start-Process -FilePath $demoSsh -ArgumentList $demoArgs -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $demoTunnelDir 'stdout.log') `
    -RedirectStandardError (Join-Path $demoTunnelDir 'stderr.log') -PassThru
$demoProcess.Id | Set-Content (Join-Path $demoTunnelDir 'pid.txt')
Write-Output "Tunnel process: $($demoProcess.Id)"
Write-Output "The HTTPS demo URL will appear in $demoTunnelDir\stdout.log."
Write-Output "If it fails, inspect $demoTunnelDir\stderr.log."
Write-Output "Stop this share with: Stop-Process -Id $($demoProcess.Id)"
