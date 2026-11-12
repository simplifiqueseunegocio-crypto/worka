-- Domínio (Thomson Reuters) → Plataforma MCONT
-- Empresas ATIVAS da tabela bethadba.geempre (SQL Anywhere), com o regime
-- federal da vigência atual em bethadba.efparametro_vigencia.
--
-- Filtros:
--   stat_emp = 'A'              → só ativas ('I' = inativa)
--   codi_emp fora de 9990–9999  → exclui as "empresas padrão" que vêm com o
--                                  Domínio (modelos de plano de contas, Simples,
--                                  Lucro Real etc.), que também ficam com 'A'
--   cgce_emp preenchido         → descarta cadastros sem CNPJ/CAEPF
--
-- Regime: rfed_par da vigência mais recente que já começou
-- (1 = Lucro Real, 2 = Simples Nacional, 5 = Lucro Presumido; a plataforma
-- traduz o código e ignora os que não conhece).
--
-- Município: nome em bethadba.gemunicipio (o código é o do Domínio, não o do
-- IBGE). Subconsulta, e não join, para um código repetido nunca duplicar a empresa.
--
-- Observação: o mesmo CNPJ pode aparecer em mais de um código de empresa.
-- A chave da integração deve ser codi_emp, e não o CNPJ.

SELECT
    e.codi_emp                              AS codigo_dominio,
    e.tins_emp                              AS tipo_inscricao,     -- 1 = CNPJ, 6 = CAEPF
    TRIM(e.cgce_emp)                        AS documento,
    TRIM(e.nome_emp)                        AS razao_social,
    NULLIF(TRIM(e.fantasia_emp), '')        AS nome_fantasia,
    NULLIF(TRIM(e.apel_emp), '')            AS apelido,
    NULLIF(TRIM(e.iest_emp), '')            AS inscricao_estadual,
    NULLIF(TRIM(e.imun_emp), '')            AS inscricao_municipal,
    NULLIF(TRIM(e.i_cnae20), '')            AS cnae,
    NULLIF(TRIM(e.ramo_emp), '')            AS ramo_atividade,
    e.dtinicio_emp                          AS data_inicio_atividade,
    e.dcad_emp                              AS data_cadastro,
    NULLIF(TRIM(e.ende_emp), '')            AS logradouro,
    NULLIF(TRIM(e.nume_emp), '')            AS numero,
    NULLIF(TRIM(e.comp_emp), '')            AS complemento,
    NULLIF(TRIM(e.bair_emp), '')            AS bairro,
    e.codigo_municipio                      AS codigo_municipio,
    (SELECT NULLIF(TRIM(MAX(m.nome_municipio)), '')
       FROM bethadba.gemunicipio m
      WHERE m.codigo_municipio = e.codigo_municipio)  AS municipio,
    NULLIF(TRIM(e.esta_emp), '')            AS uf,
    NULLIF(TRIM(e.cepe_emp), '')            AS cep,
    NULLIF(TRIM(e.dddf_emp), '')            AS ddd,
    NULLIF(TRIM(e.fone_emp), '')            AS telefone,
    NULLIF(TRIM(e.email_emp), '')           AS email,
    NULLIF(TRIM(e.rleg_emp), '')            AS responsavel_legal,
    p.rfed_par                              AS regime_federal,
    p.vigencia_par                          AS regime_vigencia,
    e.stat_emp                              AS situacao
FROM bethadba.geempre e
LEFT JOIN bethadba.efparametro_vigencia p
       ON p.codi_emp = e.codi_emp
      AND p.vigencia_par = (
            SELECT MAX(v.vigencia_par)
            FROM bethadba.efparametro_vigencia v
            WHERE v.codi_emp = e.codi_emp
              AND v.vigencia_par <= CURRENT TIMESTAMP
          )
WHERE e.stat_emp = 'A'
  AND e.codi_emp NOT BETWEEN 9990 AND 9999
  AND COALESCE(TRIM(e.cgce_emp), '') <> ''
ORDER BY e.codi_emp;
