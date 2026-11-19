# Estoque Eventos

API de gerenciamento de estoque com arquitetura orientada a eventos (Pub/Sub).

**Stack:** Node.js, Express, Supabase (PostgreSQL) e RabbitMQ.

## O problema

A cada movimentação de estoque, o negócio precisa de três processos secundários:

- **Auditoria (Kardex):** histórico imutável de entradas e saídas.
- **Alerta de compras:** avisar quando o saldo fica igual ou abaixo do estoque mínimo.
- **Vitrine:** marcar o produto como esgotado quando o saldo zera.

A rota de venda não pode ficar mais lenta nem falhar se um desses processos der erro.
Por isso, a API apenas atualiza o saldo, publica um evento e responde na hora.
Cada processo secundário roda em um worker independente.

## Arquitetura

```
                                   ┌──> fila.auditoria ──> Worker Auditoria ──> movimentacoes_estoque
POST /produtos/:id/movimentar      │
        │                          │
   API Express ──> exchange ───────┼──> fila.compras ───> Worker Compras ───> alertas_reposicao
   (produtor)   estoque.eventos    │
        │         (fanout)         │
        ▼                          └──> fila.vitrine ───> Worker Vitrine ───> produtos.disponivel
   Supabase (produtos.saldo)
```

- A exchange `estoque.eventos` é do tipo **fanout**: cada evento é copiado para as 3 filas.
- Filas e mensagens são **duráveis/persistentes** (`durable: true`, `persistent: true`).
- Os workers usam **confirmação manual** (`noAck: false`) e só dão `ack` depois que a operação no Supabase termina com sucesso.
- A API declara as 3 filas e as liga à exchange ao iniciar. Assim, as mensagens ficam retidas mesmo que um worker esteja desligado.

## Estrutura do projeto

```
estoque-eventos/
├── src/
│   ├── api/
│   │   └── server.js          # API Express (CRUD + movimentação / produtor)
│   ├── config/
│   │   ├── rabbit.js          # Conexão, exchange e filas
│   │   └── supabase.js        # Cliente do Supabase
│   └── workers/
│       ├── criarWorker.js     # Base comum dos consumidores
│       ├── auditoria.js       # Worker 1
│       ├── compras.js         # Worker 2
│       └── vitrine.js         # Worker 3
├── sql/
│   └── ddl.sql                # CREATE/ALTER TABLE executados no Supabase
├── docker-compose.yml         # RabbitMQ local com painel na porta 15672
├── .env.example
└── package.json
```

## Como rodar

### 1. Banco de dados

No Supabase, abra o **SQL Editor** e execute o conteúdo de `sql/ddl.sql`.

### 2. RabbitMQ

Com o Docker Desktop aberto:

```bash
docker compose up -d
```

Painel de gerenciamento: http://localhost:15672 (usuário `admin`, senha `admin`).

### 3. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha `SUPABASE_URL` e `SUPABASE_KEY`.

### 4. Dependências

```bash
npm install
```

### 5. Iniciar (um terminal para cada)

```bash
npm start                  # API em http://localhost:3000
npm run worker:auditoria
npm run worker:compras
npm run worker:vitrine
```

## Endpoints

| Método | Rota                          | Descrição                         |
|--------|-------------------------------|-----------------------------------|
| GET    | `/produtos`                   | Lista os produtos                 |
| GET    | `/produtos/:id`               | Busca um produto                  |
| POST   | `/produtos`                   | Cria um produto                   |
| PUT    | `/produtos/:id`               | Atualiza nome, preço e mínimo     |
| DELETE | `/produtos/:id`               | Remove um produto                 |
| POST   | `/produtos/:id/movimentar`    | Registra ENTRADA ou SAIDA         |

Exemplo de movimentação:

```json
POST /produtos/1/movimentar
{ "tipo": "SAIDA", "quantidade": 2 }
```

Respostas da rota de movimentação:

- `200`: movimentação registrada e evento publicado
- `400`: tipo ou quantidade inválidos
- `404`: produto não encontrado
- `409`: o saldo foi alterado por outra operação ao mesmo tempo
- `422`: saldo insuficiente para a saída

### Contrato do evento publicado

```json
{
  "eventoId": "uuid-v4-gerado-na-api",
  "produtoId": 1,
  "nomeProduto": "Teclado Mecânico RGB",
  "tipo": "SAIDA",
  "quantidadeMovimentada": 2,
  "saldoAnterior": 6,
  "saldoAtual": 4,
  "estoqueMinimo": 5,
  "timestamp": "2026-11-16T22:00:00.000Z"
}
```

## Regras dos workers

| Worker    | Fila             | Regra |
|-----------|------------------|-------|
| Auditoria | `fila.auditoria` | Insere em `movimentacoes_estoque`. Idempotente: `evento_id` é `UNIQUE` e o insert ignora duplicados. |
| Compras   | `fila.compras`   | Se `saldoAtual <= estoqueMinimo`, insere em `alertas_reposicao` e exibe um log estruturado da notificação. |
| Vitrine   | `fila.vitrine`   | Se `saldoAtual === 0`, marca `disponivel = false`. Se for `ENTRADA` com saldo maior que zero, marca `disponivel = true`. |

Se a operação no Supabase falhar, o worker não dá `ack`: a mensagem volta para a fila e é reprocessada após 5 segundos.

## Teste de resiliência (demonstração)

Objetivo: mostrar que, com o Worker de Compras desligado, a API continua respondendo e os eventos não se perdem.

**Preparação:** deixe o Teclado (id 1) com saldo 6 e mínimo 5. No SQL Editor do Supabase:

```sql
UPDATE produtos SET saldo = 6, disponivel = true WHERE id = 1;
```

**Passo a passo:**

1. Suba a API e os 3 workers.
2. **Derrube o Worker de Compras** com `Ctrl+C` no terminal dele.
3. Faça 2 vendas, que levam o saldo de 6 para 5 e de 5 para 4:

   ```powershell
   Invoke-RestMethod -Method Post -Uri http://localhost:3000/produtos/1/movimentar -ContentType "application/json" -Body '{"tipo":"SAIDA","quantidade":1}'
   Invoke-RestMethod -Method Post -Uri http://localhost:3000/produtos/1/movimentar -ContentType "application/json" -Body '{"tipo":"SAIDA","quantidade":1}'
   ```

4. Mostre que a **API respondeu normalmente** (status 200) nas duas vendas.
5. No painel do RabbitMQ (http://localhost:15672 → aba **Queues and Streams**), mostre que a `fila.compras` está com **2 mensagens em Ready**, enquanto as outras filas estão zeradas.
6. **Religue o Worker de Compras:** `npm run worker:compras`. Ele processa as 2 mensagens retidas.
7. No Supabase, mostre os **2 novos registros em `alertas_reposicao`**. Nenhum dado foi perdido.