const criarWorker = require('./criarWorker');
const supabase = require('../config/supabase');

criarWorker('fila.compras', async (evento) => {
    if (evento.saldoAtual > evento.estoqueMinimo) {
        console.log(`    Compras: "${evento.nomeProduto}" com saldo ${evento.saldoAtual} (mínimo ${evento.estoqueMinimo}). Nenhum alerta.`);
        return;
    }

    const { error } = await supabase
        .from('alertas_reposicao')
        .insert({
            produto_id: evento.produtoId,
            saldo_atual: evento.saldoAtual,
            estoque_minimo: evento.estoqueMinimo,
            status: 'PENDENTE'
        });

    if (error) throw new Error(error.message);

    console.log(JSON.stringify({
        nivel: 'ALERTA',
        tipo: 'ESTOQUE_CRITICO',
        destino: 'setor-de-compras',
        eventoId: evento.eventoId,
        produtoId: evento.produtoId,
        produto: evento.nomeProduto,
        saldoAtual: evento.saldoAtual,
        estoqueMinimo: evento.estoqueMinimo,
        mensagem: `Repor "${evento.nomeProduto}": saldo ${evento.saldoAtual}, mínimo ${evento.estoqueMinimo}`,
        enviadoEm: new Date().toISOString()
    }, null, 2));
});