const criarWorker = require('./criarWorker');
const supabase = require('../config/supabase');

criarWorker('fila.auditoria', async (evento) => {
    const { error } = await supabase
        .from('movimentacoes_estoque')
        .upsert({
            evento_id: evento.eventoId,
            produto_id: evento.produtoId,
            tipo: evento.tipo,
            quantidade: evento.quantidadeMovimentada,
            saldo_anterior: evento.saldoAnterior,
            saldo_atual: evento.saldoAtual,
            criado_em: evento.timestamp
        }, { onConflict: 'evento_id', ignoreDuplicates: true });

    if (error) throw new Error(error.message);

    console.log(`    Auditoria: ${evento.tipo} de ${evento.quantidadeMovimentada}x "${evento.nomeProduto}" (${evento.saldoAnterior} -> ${evento.saldoAtual})`);
});