import type { Papel } from "@/lib/auth";

export const rotulosPapel: Record<Papel, { rotulo: string; descricao: string }> = {
  admin: { rotulo: "Administrador", descricao: "Tudo, inclusive equipe e configurações" },
  gestor: { rotulo: "Gestor", descricao: "Gera e distribui as tarefas dos seus departamentos" },
  colaborador: { rotulo: "Colaborador", descricao: "Atualiza as tarefas sob sua responsabilidade" },
};
