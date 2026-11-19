const criarWorker = require('./criarWorker');
const supabase = require('../config/supabase');

criarWorker('fila.vitrine', async (evento) => {
    let disponivel = null;

    if (evento.saldoAtual === 0) {
        disponivel = false;
    } else if (evento.tipo === 'ENTRADA' && evento.saldoAtual > 0) {
        disponivel = true;
    }

    if (disponivel === null) {
        console.log(`    Vitrine: "${evento.nomeProduto}" segue disponível (saldo ${evento.saldoAtual}). Nada a fazer.`);
        return;
    }

    const { error } = await supabase
        .from('produtos')
        .update({ disponivel })
        .eq('id', evento.produtoId);

    if (error) throw new Error(error.message);

    console.log(`    Vitrine: "${evento.nomeProduto}" marcado como ${disponivel ? 'DISPONÍVEL' : 'ESGOTADO'}`);
});