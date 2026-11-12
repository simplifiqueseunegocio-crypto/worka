<#
  Sincroniza as empresas ativas do ERP Domínio com a Plataforma MCONT.

  1. Roda a consulta empresas-ativas.sql no banco do Domínio (ODBC).
  2. Envia o resultado para POST {API_URL}/api/integracoes/dominio/clientes.
  3. Registra o resultado em logs\sincronizar-AAAA-MM-DD.log (guarda 30 dias).

  Configuração: sincronizar.config, na mesma pasta (modelo em sincronizar.config.example).

  Uso:
    sincronizar-dominio.bat                    executa a sincronização
    sincronizar-dominio.bat -SomenteConsulta   só testa a consulta, sem enviar nada

  Código de saída: 0 = sucesso, 1 = erro (detalhes no log).
#>
param([switch]$SomenteConsulta)

$ErrorActionPreference = 'Stop'
$pasta = $PSScriptRoot
$pastaLogs = Join-Path $pasta 'logs'
New-Item -ItemType Directory -Force $pastaLogs | Out-Null
$arquivoLog = Join-Path $pastaLogs ('sincronizar-{0:yyyy-MM-dd}.log' -f (Get-Date))

function Log([string]$mensagem) {
  $linha = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $mensagem
  Add-Content -Path $arquivoLog -Value $linha -Encoding UTF8
  Write-Host $linha
}

function Ler-Configuracao {
  $caminho = Join-Path $pasta 'sincronizar.config'
  if (-not (Test-Path $caminho)) {
    throw "Arquivo de configuração não encontrado: $caminho (copie de sincronizar.config.example)."
  }
  $cfg = @{}
  foreach ($linha in Get-Content $caminho -Encoding UTF8) {
    if ($linha -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') { $cfg[$Matches[1]] = $Matches[2] }
  }
  # Guardada antes da validação: se faltar algum campo, ainda dá para
  # reportar a falha à plataforma (basta API_URL e token preenchidos).
  $script:cfg = $cfg
  $obrigatorias = @('ODBC_DSN', 'DOMINIO_USUARIO', 'DOMINIO_SENHA')
  if (-not $SomenteConsulta) { $obrigatorias += @('API_URL', 'DOMINIO_API_TOKEN') }
  foreach ($chave in $obrigatorias) {
    if (-not $cfg[$chave]) { throw "Configuração '$chave' está vazia em sincronizar.config." }
  }
  return $cfg
}

function Consultar-Dominio($cfg) {
  $sql = (Get-Content (Join-Path $pasta 'empresas-ativas.sql') -Raw -Encoding UTF8).Trim().TrimEnd(';')

  # O builder escapa senhas com ; ou = corretamente.
  $conexao = New-Object System.Data.Odbc.OdbcConnectionStringBuilder
  $conexao.Dsn = $cfg.ODBC_DSN
  $conexao['UID'] = $cfg.DOMINIO_USUARIO
  $conexao['PWD'] = $cfg.DOMINIO_SENHA

  $con = New-Object System.Data.Odbc.OdbcConnection($conexao.ConnectionString)
  $empresas = New-Object System.Collections.Generic.List[object]
  try {
    $con.Open()
    $cmd = $con.CreateCommand()
    $cmd.CommandText = $sql
    $cmd.CommandTimeout = 300
    $leitor = $cmd.ExecuteReader()
    while ($leitor.Read()) {
      $empresa = [ordered]@{}
      for ($i = 0; $i -lt $leitor.FieldCount; $i++) {
        $valor = $leitor.GetValue($i)
        if ($valor -is [DBNull]) { $valor = $null }
        elseif ($valor -is [DateTime]) { $valor = $valor.ToString('yyyy-MM-dd') }
        elseif ($valor -is [string]) { $valor = $valor.Trim() }
        $empresa[$leitor.GetName($i).ToLower()] = $valor
      }
      $empresas.Add([pscustomobject]$empresa)
    }
    $leitor.Close()
  }
  finally {
    $con.Close()
  }
  return , $empresas.ToArray()
}

function Enviar-Plataforma($cfg, $empresas) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $url = $cfg.API_URL.TrimEnd('/') + '/api/integracoes/dominio/clientes'
  $json = @{ empresas = $empresas } | ConvertTo-Json -Depth 4 -Compress
  $corpo = [Text.Encoding]::UTF8.GetBytes($json)

  try {
    return Invoke-RestMethod -Method Post -Uri $url -TimeoutSec 180 `
      -Headers @{ Authorization = "Bearer $($cfg.DOMINIO_API_TOKEN)"; 'X-Origem' = $origem } `
      -ContentType 'application/json; charset=utf-8' -Body $corpo
  }
  catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    $detalhe = $_.ErrorDetails.Message
    if (-not $detalhe -and $_.Exception.Response) {
      # No PowerShell 5.1 o corpo do erro nem sempre vem em ErrorDetails.
      $leitor = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream(), [Text.Encoding]::UTF8)
      $detalhe = $leitor.ReadToEnd()
    }
    if (-not $detalhe) { $detalhe = $_.Exception.Message }
    throw "A API respondeu com erro$(if ($status) { " HTTP $status" }): $detalhe"
  }
}

# Falhas antes do envio (configuração, Domínio fora do ar, senha errada) não
# chegam à API sozinhas: reporta para aparecerem no log de Configurações.
function Reportar-Falha($cfg, [string]$etapa, [string]$mensagem) {
  if (-not $cfg -or -not $cfg.API_URL -or -not $cfg.DOMINIO_API_TOKEN) { return }
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $corpo = [Text.Encoding]::UTF8.GetBytes((@{ etapa = $etapa; mensagem = $mensagem } | ConvertTo-Json -Compress))
    Invoke-RestMethod -Method Post -Uri ($cfg.API_URL.TrimEnd('/') + '/api/integracoes/dominio/execucoes') -TimeoutSec 30 `
      -Headers @{ Authorization = "Bearer $($cfg.DOMINIO_API_TOKEN)"; 'X-Origem' = $origem } `
      -ContentType 'application/json; charset=utf-8' -Body $corpo | Out-Null
    Log 'Falha reportada à plataforma.'
  }
  catch {
    Log "Não foi possível reportar a falha à plataforma: $($_.Exception.Message)"
  }
}

$identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
$origem = if ($identidade.IsSystem) { "agendada@$env:COMPUTERNAME" } else { "manual: $($identidade.Name)" }

$saida = 0
$etapa = 'configuracao'
$cfg = $null
try {
  Log ('Início' + $(if ($SomenteConsulta) { ' (somente consulta)' } else { '' }) + " - origem: $origem")
  $cfg = Ler-Configuracao

  $etapa = 'consulta'
  $empresas = Consultar-Dominio $cfg
  $porRegime = $empresas | Group-Object regime_federal | Sort-Object Count -Descending |
    ForEach-Object { '{0}={1}' -f $(if ($_.Name) { $_.Name } else { 'vazio' }), $_.Count }
  Log ("Consulta no Domínio: {0} empresas ativas (regime_federal: {1})" -f $empresas.Count, ($porRegime -join ', '))

  if ($empresas.Count -eq 0) { throw 'A consulta não retornou empresas; nada foi enviado.' }

  if (-not $SomenteConsulta) {
    $etapa = 'envio'
    $r = Enviar-Plataforma $cfg $empresas
    Log ("Plataforma: recebidas={0} inseridas={1} atualizadas={2} reativadas={3} suspensas={4} regimes alterados={5}" -f `
      $r.recebidas, $r.inseridas, $r.atualizadas, $r.reativadas, $r.suspensas, $r.regimes_alterados)
  }
  Log 'Concluído com sucesso.'
}
catch {
  Log "ERRO na etapa '$etapa': $($_.Exception.Message)"
  $saida = 1
  # No envio a própria API já registra o erro (ou está inacessível).
  if (-not $SomenteConsulta -and $etapa -ne 'envio') { Reportar-Falha $cfg $etapa $_.Exception.Message }
}
finally {
  Get-ChildItem $pastaLogs -Filter 'sincronizar-*.log' |
    Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) | Remove-Item -Force
}
exit $saida
