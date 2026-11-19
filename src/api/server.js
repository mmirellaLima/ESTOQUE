require('dotenv').config();
const express = require('express');
const { randomUUID } = require('crypto');
const supabase = require('../config/supabase');
const { conectarRabbit, EXCHANGE } = require('../config/rabbit');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
let channel;

// =====================================================
// CRUD de produtos
// =====================================================

app.get('/produtos', async (req, res) => {
    const { data, error } = await supabase.from('produtos').select('*').order('id');
    if (error) return res.status(500).json({ erro: error.message });
    res.json(data);
});

app.get('/produtos/:id', async (req, res) => {
    const { data, error } = await supabase
        .from('produtos').select('*').eq('id', req.params.id).maybeSingle();
    if (error) return res.status(500).json({ erro: error.message });
    if (!data) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json(data);
});

app.post('/produtos', async (req, res) => {
    const { nome, preco, saldo, estoque_minimo } = req.body;
    if (!nome) return res.status(400).json({ erro: 'O campo "nome" é obrigatório' });

    const { data, error } = await supabase
        .from('produtos')
        .insert({ nome, preco, saldo, estoque_minimo })
        .select().single();
    if (error) return res.status(500).json({ erro: error.message });
    res.status(201).json(data);
});

app.put('/produtos/:id', async (req, res) => {
    const { nome, preco, estoque_minimo } = req.body;
    const { data, error } = await supabase
        .from('produtos')
        .update({ nome, preco, estoque_minimo })
        .eq('id', req.params.id)
        .select().maybeSingle();
    if (error) return res.status(500).json({ erro: error.message });
    if (!data) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json(data);
});

app.delete('/produtos/:id', async (req, res) => {
    const { error } = await supabase.from('produtos').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ erro: error.message });
    res.status(204).send();
});

// =====================================================
// Movimentação de estoque (PRODUTOR do evento)
// Body: { "tipo": "ENTRADA" | "SAIDA", "quantidade": 2 }
// =====================================================
app.post('/produtos/:id/movimentar', async (req, res) => {
    const { tipo, quantidade } = req.body;

    if (!['ENTRADA', 'SAIDA'].includes(tipo)) {
        return res.status(400).json({ erro: 'tipo deve ser ENTRADA ou SAIDA' });
    }
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
        return res.status(400).json({ erro: 'quantidade deve ser um inteiro maior que zero' });
    }

    const { data: produto, error: erroBusca } = await supabase
        .from('produtos').select('*').eq('id', req.params.id).maybeSingle();
    if (erroBusca) return res.status(500).json({ erro: erroBusca.message });
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });

    const saldoAnterior = produto.saldo;
    const saldoAtual = tipo === 'ENTRADA'
        ? saldoAnterior + quantidade
        : saldoAnterior - quantidade;

    if (saldoAtual < 0) {
        return res.status(422).json({ erro: `Saldo insuficiente. Saldo atual: ${saldoAnterior}` });
    }

    const { data: atualizado, error: erroUpdate } = await supabase
        .from('produtos')
        .update({ saldo: saldoAtual })
        .eq('id', produto.id)
        .eq('saldo', saldoAnterior)
        .select().maybeSingle();
    if (erroUpdate) return res.status(500).json({ erro: erroUpdate.message });
    if (!atualizado) {
        return res.status(409).json({ erro: 'O saldo foi alterado por outra operação. Tente novamente.' });
    }

    const evento = {
        eventoId: randomUUID(),
        produtoId: produto.id,
        nomeProduto: produto.nome,
        tipo,
        quantidadeMovimentada: quantidade,
        saldoAnterior,
        saldoAtual,
        estoqueMinimo: produto.estoque_minimo,
        timestamp: new Date().toISOString()
    };

    try {
        channel.publish(EXCHANGE, '', Buffer.from(JSON.stringify(evento)), {
            persistent: true,
            contentType: 'application/json'
        });
        console.log(`[>] Evento publicado: ${tipo} de ${quantidade}x "${produto.nome}" (saldo ${saldoAnterior} -> ${saldoAtual})`);
    } catch (err) {
        console.error('[!] Falha ao publicar evento:', err.message);
    }

    res.status(200).json({ mensagem: 'Movimentação registrada', evento });
});

// =====================================================
// Inicialização: conecta no RabbitMQ antes de abrir a porta
// =====================================================
async function iniciar() {
    try {
        ({ channel } = await conectarRabbit());
        console.log(`[*] Conectado ao RabbitMQ. Exchange "${EXCHANGE}" pronta.`);

        app.listen(PORT, () => {
            console.log(`[*] API rodando em http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Erro ao iniciar a API:', err);
        process.exit(1);
    }
}

iniciar();