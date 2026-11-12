"use client";

import { useState, useTransition } from "react";
import { CloudDownload, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { adicionarFeriado, excluirFeriado, importarNacionais, type EstadoFeriado } from "@/lib/feriados-actions";

type Abrangencia = "nacional" | "estadual" | "municipal";
type Feriado = { data: string; descricao: string; uf: string | null; municipio: string | null };

const abrangenciaDe = (f: Feriado): Abrangencia => (f.municipio ? "municipal" : f.uf ? "estadual" : "nacional");

const ESTILO: Record<Abrangencia, { rotulo: string; chip: string }> = {
  nacional: { rotulo: "Nacional", chip: "bg-suave text-destaque" },
  estadual: { rotulo: "Estadual", chip: "bg-alerta-suave text-alerta" },
  municipal: { rotulo: "Municipal", chip: "bg-sucesso-suave text-sucesso" },
};

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const campo =
  "h-10 w-full rounded-bloco border border-borda bg-superficie px-3 text-sm text-texto outline-none transition placeholder:text-texto-suave/70 focus:border-primaria focus:ring-4 focus:ring-primaria/15";

export function GestaoFeriados({ feriados, ano, admin, hoje }: { feriados: Feriado[]; ano: number; admin: boolean; hoje: string }) {
  const [filtro, setFiltro] = useState<Abrangencia | "todos">("todos");
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState<EstadoFeriado | null>(null);
  const [importando, iniciarImportacao] = useTransition();

  const visiveis = filtro === "todos" ? feriados : feriados.filter((f) => abrangenciaDe(f) === filtro);
  const porMes = new Map<number, Feriado[]>();
  for (const f of visiveis) {
    const m = Number(f.data.slice(5, 7)) - 1;
    porMes.set(m, [...(porMes.get(m) ?? []), f]);
  }
  const contagem = (a: Abrangencia) => feriados.filter((f) => abrangenciaDe(f) === a).length;
  const uteis = feriados.filter((f) => abrangenciaDe(f) === "nacional" && ![0, 6].includes(new Date(`${f.data}T12:00:00Z`).getUTCDay())).length;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filtrar por abrangência" className="flex flex-wrap gap-2">
          {(["todos", "nacional", "estadual", "municipal"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setFiltro(a)}
              aria-pressed={filtro === a}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                filtro === a ? "bg-primaria text-sobre-primaria" : "bg-superficie text-texto hover:bg-suave"
              }`}
            >
              {a === "todos" ? `Todos (${feriados.length})` : `${ESTILO[a].rotulo}s (${contagem(a)})`}
            </button>
          ))}
        </nav>
        {admin && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={importando}
              onClick={() => iniciarImportacao(async () => setAviso(await importarNacionais(ano)))}
              className="flex h-10 items-center gap-2 rounded-full border border-borda bg-superficie px-4 text-sm font-semibold text-texto hover:bg-suave disabled:opacity-60"
            >
              {importando ? <LoaderCircle className="size-4 animate-spin" /> : <CloudDownload className="size-4" />}
              Importar nacionais de {ano}
            </button>
            {!novo && (
              <button
                type="button"
                onClick={() => {
                  setAviso(null);
                  setNovo(true);
                }}
                className="flex h-10 items-center gap-2 rounded-full bg-primaria px-4 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover"
              >
                <Plus className="size-4" strokeWidth={2.4} /> Novo feriado
              </button>
            )}
          </div>
        )}
      </div>

      {aviso && (
        <p role="status" className={`mt-3 text-sm font-semibold ${aviso.erro ? "text-perigo" : "text-sucesso"}`}>
          {aviso.erro ?? aviso.ok}
        </p>
      )}

      {novo && (
        <Formulario
          ano={ano}
          aoFechar={() => setNovo(false)}
          aoSalvar={(r) => {
            setAviso(r);
            if (r.ok) setNovo(false);
          }}
        />
      )}

      <p className="mt-4 text-xs text-texto-suave">
        {uteis} {uteis === 1 ? "feriado nacional cai" : "feriados nacionais caem"} em dia útil em {ano}. Só os nacionais
        entram no cálculo dos prazos; estaduais e municipais ficam registrados para consulta.
      </p>

      {visiveis.length === 0 ? (
        <div className="mt-4 rounded-card bg-superficie ring-1 ring-borda px-6 py-12 text-center text-sm text-texto-suave">
          {feriados.length === 0
            ? `Nenhum feriado cadastrado em ${ano}.${admin ? " Use “Importar nacionais” para trazer os feriados nacionais do ano." : ""}`
            : "Nenhum feriado com essa abrangência."}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...porMes].map(([m, lista]) => (
            <section key={m} className="rounded-card bg-superficie ring-1 ring-borda px-5 py-4">
              <h2 className="text-xs font-semibold tracking-[0.15em] text-texto-suave uppercase">{MESES[m]}</h2>
              <ul className="mt-2 divide-y divide-borda">
                {lista.map((f) => (
                  <Linha key={`${f.data}|${f.uf}|${f.municipio}`} feriado={f} admin={admin} hoje={hoje} aoAvisar={setAviso} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function Linha({
  feriado: f,
  admin,
  hoje,
  aoAvisar,
}: {
  feriado: Feriado;
  admin: boolean;
  hoje: string;
  aoAvisar: (e: EstadoFeriado) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const a = abrangenciaDe(f);
  const dia = new Date(`${f.data}T12:00:00Z`).getUTCDay();
  const passado = f.data < hoje;

  return (
    <li className={`flex items-center gap-3 py-2.5 ${passado ? "opacity-60" : ""}`}>
      <span className="w-11 shrink-0 text-center">
        <span className="block text-lg leading-none font-bold text-texto tabular-nums">{f.data.slice(8, 10)}</span>
        <span className={`text-[11px] ${dia === 0 || dia === 6 ? "text-texto-suave/60" : "text-texto-suave"}`}>{SEMANA[dia]}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-texto" title={f.descricao}>
          {f.descricao}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-texto-suave">
          <span className={`rounded-full px-2 py-px text-[11px] font-semibold ${ESTILO[a].chip}`}>{ESTILO[a].rotulo}</span>
          {a === "estadual" && f.uf}
          {a === "municipal" && `${f.municipio}/${f.uf}`}
        </span>
      </span>
      {admin &&
        (confirmando ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await excluirFeriado({ data: f.data, uf: f.uf, municipio: f.municipio });
                  aoAvisar(r);
                  setConfirmando(false);
                })
              }
              className="flex h-8 items-center gap-1 rounded-full bg-perigo-forte px-3 text-xs font-bold text-white hover:bg-perigo-forte disabled:opacity-60"
            >
              {pendente && <LoaderCircle className="size-3 animate-spin" />} Excluir
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="grid size-8 place-items-center rounded-full text-texto-suave hover:bg-suave"
              aria-label="Cancelar"
            >
              <X className="size-4" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="grid size-8 shrink-0 place-items-center rounded-full text-texto-suave hover:bg-suave hover:text-perigo"
            aria-label={`Excluir ${f.descricao}`}
          >
            <Trash2 className="size-4" />
          </button>
        ))}
    </li>
  );
}

function Formulario({
  ano,
  aoFechar,
  aoSalvar,
}: {
  ano: number;
  aoFechar: () => void;
  aoSalvar: (r: EstadoFeriado) => void;
}) {
  const [tipo, setTipo] = useState<Abrangencia>("nacional");
  const [pendente, iniciar] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        iniciar(async () => aoSalvar(await adicionarFeriado(dados)));
      }}
      className="mt-4 grid gap-3 rounded-card bg-superficie ring-1 ring-borda p-4 sm:grid-cols-[150px_1fr_150px] sm:p-5 lg:grid-cols-[150px_1fr_140px_90px_1fr_auto]"
    >
      <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave">
        Data
        <input type="date" name="data" required defaultValue={`${ano}-01-01`} className={campo} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave">
        Nome
        <input name="descricao" required maxLength={120} placeholder="Ex.: Aniversário da cidade" className={campo} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave">
        Abrangência
        <select name="abrangencia" value={tipo} onChange={(e) => setTipo(e.target.value as Abrangencia)} className={campo}>
          <option value="nacional">Nacional</option>
          <option value="estadual">Estadual</option>
          <option value="municipal">Municipal</option>
        </select>
      </label>
      {tipo !== "nacional" && (
        <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave">
          UF
          <select name="uf" required defaultValue="SP" className={campo}>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      )}
      {tipo === "municipal" && (
        <label className="flex flex-col gap-1 text-xs font-semibold text-texto-suave">
          Município
          <input name="municipio" required maxLength={80} placeholder="Ex.: São José do Rio Preto" className={campo} />
        </label>
      )}
      <div className="flex items-end gap-2 sm:col-span-full lg:col-span-1 lg:col-start-[-2]">
        <button
          type="submit"
          disabled={pendente}
          className="flex h-10 items-center gap-2 rounded-full bg-primaria px-5 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover disabled:opacity-60"
        >
          {pendente && <LoaderCircle className="size-4 animate-spin" />} Salvar
        </button>
        <button
          type="button"
          onClick={aoFechar}
          className="flex h-10 items-center rounded-full px-4 text-sm font-semibold text-texto-suave hover:bg-suave hover:text-texto"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
