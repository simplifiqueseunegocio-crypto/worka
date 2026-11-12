"use client";

import { useState, useTransition } from "react";
import { Building2, LoaderCircle, Search, X } from "lucide-react";
import { buscarClientesDocumento } from "@/lib/documentos/actions";

export type ClienteEscolhido = { id: string; razao_social: string; codigo_dominio: number | null };

type Opcao = ClienteEscolhido & { documento: string };

// Busca de cliente por nome, CNPJ ou código do Domínio. "buscar" troca a busca
// padrão (a do leitor de documentos do "tipo") por outra ação do servidor.
export function SeletorCliente({
  tipo = "",
  buscar: buscarNoServidor,
  valor,
  onEscolher,
  bloqueado,
  aviso,
}: {
  tipo?: string;
  buscar?: (q: string) => Promise<Opcao[]>;
  valor: ClienteEscolhido | null;
  onEscolher: (c: ClienteEscolhido | null) => void;
  bloqueado?: boolean;
  aviso?: string;
}) {
  const [editando, setEditando] = useState(!valor);
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [buscando, buscar] = useTransition();

  if (valor && !editando) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Building2 className="size-4 shrink-0 text-destaque" />
        <span className="truncate font-semibold text-texto">
          {valor.codigo_dominio ? `${valor.codigo_dominio} · ` : ""}
          {valor.razao_social}
        </span>
        {!bloqueado && (
          <button type="button" onClick={() => setEditando(true)} className="text-xs font-semibold text-destaque hover:underline">
            trocar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-md">
      {aviso && <p className="mb-1 text-xs font-semibold text-alerta">{aviso}</p>}
      <div className="flex items-center gap-2">
        <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-borda bg-superficie px-3 focus-within:border-primaria">
          <Search className="size-4 text-texto-suave" />
          <input
            value={busca}
            disabled={bloqueado}
            onChange={(e) => {
              const q = e.target.value;
              setBusca(q);
              buscar(async () => setOpcoes(q.trim().length >= 2 ? await (buscarNoServidor ? buscarNoServidor(q) : buscarClientesDocumento(tipo, q)) : []));
            }}
            placeholder="Cliente: nome, CNPJ ou código"
            className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none"
          />
          {buscando && <LoaderCircle className="size-4 animate-spin text-texto-suave" />}
        </div>
        {valor && (
          <button type="button" onClick={() => setEditando(false)} className="rounded-full p-2 text-texto-suave hover:bg-suave" aria-label="Cancelar">
            <X className="size-4" />
          </button>
        )}
      </div>
      {opcoes.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-bloco border border-borda bg-superficie shadow-lg">
          {opcoes.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onEscolher({ id: c.id, razao_social: c.razao_social, codigo_dominio: c.codigo_dominio });
                  setEditando(false);
                  setOpcoes([]);
                  setBusca("");
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-suave"
              >
                <span className="font-semibold text-texto">
                  {c.codigo_dominio ? `${c.codigo_dominio} · ` : ""}
                  {c.razao_social}
                </span>
                <span className="block text-xs text-texto-suave">{c.documento}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
