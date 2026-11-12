-- Ficha ponto: o cliente passa a ser de cada ficha. Fichas de empresas
-- diferentes enviadas juntas ficam na mesma leitura, cada uma com a sua
-- empresa; trocar o cliente de uma ficha não mexe nas outras.
-- Ficha sem cliente_id usa o cliente da leitura (leituras antigas).

alter table public.ponto_fichas
  add column cliente_id uuid references public.clientes (id) on delete set null;
create index on public.ponto_fichas (cliente_id);
