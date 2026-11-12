@echo off
rem Agenda a sincronizacao diaria (23:00) do Dominio com a Plataforma MCONT.
rem Execute com o botao direito > "Executar como administrador".
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-agendamento.ps1"
pause
