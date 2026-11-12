<#
  Agenda o robô da CND municipal SIA (robo-sia.bat) a cada 30 minutos, das 07:00
  às 22:30 (horário do Windows, que neste servidor é o de Brasília). Com a fila
  vazia ele só pergunta à plataforma e sai. Pega a rodada do dia 23 e os pedidos
  feitos pela tela.

  Executar como administrador (via instalar-robo-sia.bat), depois de
  "npm install" e "npm run instalar-navegador" nesta pasta.
  A tarefa roda como SYSTEM: funciona mesmo sem ninguém logado no servidor.
#>
$ErrorActionPreference = 'Stop'
$pasta = $PSScriptRoot
$bat = Join-Path $pasta 'robo-sia.bat'
$config = Join-Path $pasta 'worker.config'

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Execute como administrador (botão direito > Executar como administrador).' }
if (-not (Test-Path $config)) { throw "Crie e preencha $config antes de agendar (modelo: worker.config.example)." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js não encontrado. Instale o Node.js 20.11 ou mais novo.' }
if (-not (Test-Path (Join-Path $pasta 'node_modules\playwright'))) { throw 'Rode "npm install" nesta pasta antes de agendar.' }
if (-not (Test-Path (Join-Path $pasta 'node_modules\playwright-core\.local-browsers'))) { throw 'Rode "npm run instalar-navegador" nesta pasta antes de agendar.' }

$acao = New-ScheduledTaskAction -Execute $bat -WorkingDirectory $pasta
$gatilho = New-ScheduledTaskTrigger -Daily -At '07:00'
$gatilho.Repetition = (New-ScheduledTaskTrigger -Once -At '07:00' `
  -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Hours 15 -Minutes 30)).Repetition
$opcoes = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$conta = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskPath '\MCONT\' -TaskName 'Robo CND SIA' -Force `
  -Description 'Consulta a CND municipal nas prefeituras com o SIA da Fiorilli e grava na Plataforma MCONT (logs em integracoes\cnd\logs\robo-sia).' `
  -Action $acao -Trigger $gatilho -Settings $opcoes -Principal $conta | Out-Null

$info = Get-ScheduledTask -TaskPath '\MCONT\' -TaskName 'Robo CND SIA' | Get-ScheduledTaskInfo
Write-Host ''
Write-Host "Tarefa agendada: \MCONT\Robo CND SIA (a cada 30 minutos, 07:00 às 22:30, como SYSTEM)"
Write-Host "Próxima execução: $($info.NextRunTime)"
Write-Host "Para testar agora: Start-ScheduledTask -TaskPath '\MCONT\' -TaskName 'Robo CND SIA'"
