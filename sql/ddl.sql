CREATE TABLE IF NOT EXISTS produtos (
    id         SERIAL PRIMARY KEY,
    nome       TEXT NOT NULL,
    preco      NUMERIC(10,2) NOT NULL DEFAULT 0,
    saldo      INTEGER NOT NULL DEFAULT 0 CHECK (saldo >= 0),
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE produtos ADD COLUMN IF NOT EXISTS estoque_minimo INTEGER NOT NULL DEFAULT 5;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS disponivel     BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id              SERIAL PRIMARY KEY,
    evento_id       UUID NOT NULL UNIQUE,    
    produto_id      INTEGER NOT NULL REFERENCES produtos(id),
    tipo            TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
    quantidade      INTEGER NOT NULL CHECK (quantidade > 0),
    saldo_anterior  INTEGER NOT NULL,
    saldo_atual     INTEGER NOT NULL,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alertas_reposicao (
    id              SERIAL PRIMARY KEY,
    produto_id      INTEGER NOT NULL REFERENCES produtos(id),
    saldo_atual     INTEGER NOT NULL,
    estoque_minimo  INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'RESOLVIDO')),
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);


ALTER TABLE produtos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas_reposicao     ENABLE ROW LEVEL SECURITY;

INSERT INTO produtos (nome, preco, saldo, estoque_minimo) VALUES
    ('Teclado Mecânico RGB', 299.90, 6, 5),
    ('Mouse Gamer',          149.90, 20, 5),
    ('Headset USB',          199.90, 3, 5);