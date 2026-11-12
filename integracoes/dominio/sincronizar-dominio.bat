@echo off
rem Sincroniza as empresas ativas do Dominio com a Plataforma MCONT.
rem Usa o PowerShell 32 bits porque a conexao ODBC "Contabil" e de 32 bits.
rem Parametro opcional: -SomenteConsulta (testa a consulta sem enviar).
"%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0sincronizar-dominio.ps1" %*
exit /b %ERRORLEVEL%
