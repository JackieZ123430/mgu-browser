param([ValidateSet('Start','Stop','Status')][string]$Action='Start',[switch]$NoBrowser)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$distro=if($env:MGU_WSL_DISTRO){$env:MGU_WSL_DISTRO}else{'Debian'}
$localDir=Join-Path $projectRoot '.local\emulator'
New-Item -ItemType Directory -Path $localDir -Force | Out-Null
function LinuxPath([string]$value) { (& wsl.exe -d $distro --exec /usr/bin/wslpath -a -u $value.Replace('\','/')).Trim() }
$linuxProject=LinuxPath $projectRoot
$runner="$linuxProject/dev/run.js"
if($Action -eq 'Stop'){
    & wsl.exe -d $distro -u mgu-dev --exec /usr/bin/node $runner --stop
    exit $LASTEXITCODE
}
if($Action -eq 'Status'){
    try { $response=Invoke-WebRequest 'http://127.0.0.1:8077/' -UseBasicParsing -TimeoutSec 3;if(-not $response.Content.Contains('<title>MGU Emulator</title>')){throw 'Other service'};Write-Output ('Emulator HTTP: '+$response.StatusCode) }
    catch { Write-Output 'Emulator ist nicht erreichbar.';exit 1 }
    exit 0
}
$response=$null
try { $response=Invoke-WebRequest 'http://127.0.0.1:8077/' -UseBasicParsing -TimeoutSec 1 }catch{}
if($response){
    if(-not $response.Content.Contains('<title>MGU Emulator</title>')){throw 'Port 8077 belongs to a different service'}
    Write-Output 'Emulator laeuft bereits: http://localhost:8077/?panel=bottom'
    if(-not $NoBrowser){Start-Process 'http://localhost:8077/?panel=bottom'}
    exit 0
}
$upstream=if($env:MGU_SDK_PATH){$env:MGU_SDK_PATH}else{Join-Path $env:USERPROFILE 'Desktop\idrive7-apps'}
$linuxUpstream=LinuxPath $upstream
& wsl.exe -d $distro -u root --exec /usr/bin/python3 "$linuxProject/dev/prepare.py" $linuxProject $linuxUpstream
if($LASTEXITCODE -ne 0){throw 'Emulator-Vorbereitung fehlgeschlagen'}
$systemLocale=[System.Globalization.CultureInfo]::CurrentUICulture.Name
$argumentList=@('-d',$distro,'-u','mgu-dev','--exec','/usr/bin/env',"MGU_EMULATOR_LOCALE=$systemLocale",'/usr/bin/node',$runner)
$quotedArguments=($argumentList | ForEach-Object { if($_ -match '\s'){ '"'+$_+'"' }else{ $_ } }) -join ' '
$process=Start-Process -FilePath 'wsl.exe' -ArgumentList $quotedArguments -WindowStyle Hidden -RedirectStandardOutput (Join-Path $localDir 'stdout.log') -RedirectStandardError (Join-Path $localDir 'stderr.log') -PassThru
$ready=$false
for($i=0;$i -lt 40;$i++){
    if($process.HasExited){throw ('Emulator-Prozess beendet. Siehe '+(Join-Path $localDir 'stderr.log'))}
    try { $response=Invoke-WebRequest 'http://127.0.0.1:8077/' -UseBasicParsing -TimeoutSec 1;if($response.Content.Contains('<title>MGU Emulator</title>')){$ready=$true;break} }catch{}
    Start-Sleep -Milliseconds 500
}
if(-not $ready){throw ('Emulator startet nicht. Siehe '+$localDir)}
Write-Output 'BMW Browser Emulator: http://localhost:8077/?panel=bottom'
if(-not $NoBrowser){Start-Process 'http://localhost:8077/?panel=bottom'}
