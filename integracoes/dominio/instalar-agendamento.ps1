<#
  Agenda a sincronização Domínio -> Plataforma MCONT todos os dias às 23:00
  (horário do Windows, que neste servidor é o de Brasília).

  Executar como administrador (via instalar-agendamento.bat).
  A tarefa roda como SYSTEM: funciona mesmo sem ninguém logado no servidor.
#>
$ErrorActionPreference = 'Stop'
$pasta = $PSScriptRoot
$bat = Join-Path $pasta 'sincronizar-dominio.bat'
$config = Join-Path $pasta 'sincronizar.config'

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Execute como administrador (botão direito > Executar como administrador).' }
if (-not (Test-Path $config)) { throw "Crie e preencha $config antes de agendar (modelo: sincronizar.config.example)." }

$acao = New-ScheduledTaskAction -Execute $bat -WorkingDirectory $pasta
$gatilho = New-ScheduledTaskTrigger -Daily -At '23:00'
$opcoes = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$conta = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskPath '\MCONT\' -TaskName 'Sincronizar Dominio' -Force `
  -Description 'Envia as empresas ativas do Domínio para a Plataforma MCONT (logs em integracoes\dominio\logs).' `
  -Action $acao -Trigger $gatilho -Settings $opcoes -Principal $conta | Out-Null

# A configuração tem senha e token: só administradores e o SYSTEM podem ler.
icacls $config /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null

$tarefa = Get-ScheduledTask -TaskPath '\MCONT\' -TaskName 'Sincronizar Dominio'
$info = $tarefa | Get-ScheduledTaskInfo
Write-Host ''
Write-Host "Tarefa agendada: \MCONT\Sincronizar Dominio"
Write-Host "Próxima execução: $($info.NextRunTime)"
Write-Host "Para testar agora: Start-ScheduledTask -TaskPath '\MCONT\' -TaskName 'Sincronizar Dominio'"
