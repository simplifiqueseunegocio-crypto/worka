@echo off
rem Robo da CND municipal SIA (Fiorilli): consulta a fila das prefeituras de
rem sia-cidades.json e grava na Plataforma MCONT, sem o Claude.
rem Parametros opcionais: --cidade "SP/JACI"  ou  --simular "SP/JACI" CNPJ ...
cd /d "%~dp0"
node robo-sia.mjs %*
exit /b %ERRORLEVEL%
