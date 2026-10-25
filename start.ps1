param([switch]$Production)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$portable=Join-Path $PSScriptRoot '.tools'
if(Test-Path $portable){
 $nodeDir=Get-ChildItem -LiteralPath $portable -Directory | Where-Object {Test-Path (Join-Path $_.FullName 'node.exe')} | Select-Object -First 1
 if($nodeDir){$env:Path=$nodeDir.FullName+';'+$env:Path}
}
if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js 22.12+ is required. Install from https://nodejs.org/ and reopen PowerShell.'}
if(-not (Test-Path node_modules)){& npm.cmd install;if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}}
if($Production){
 & npm.cmd run build
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
 & npm.cmd start
}else{& npm.cmd run dev}
