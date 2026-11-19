require('dotenv').config();
const { conectarRabbit } = require('../config/rabbit');

async function criarWorker(nomeFila, processar) {
    try {
        const { channel } = await conectarRabbit();

        channel.prefetch(1);

        console.log(`[*] Worker escutando a fila "${nomeFila}". Pressione CTRL+C para sair.`);

        channel.consume(nomeFila, async (msg) => {
            if (msg === null) return;

            let evento;
            try {
                evento = JSON.parse(msg.content.toString());
            } catch {
                console.error('[!] Mensagem inválida descartada:', msg.content.toString());
                return channel.nack(msg, false, false);
            }

            console.log(`[x] Recebido evento ${evento.eventoId} (${evento.tipo} - ${evento.nomeProduto})`);

            try {
                await processar(evento);
                channel.ack(msg);
                console.log(`[v] Evento ${evento.eventoId} processado`);
            } catch (err) {
                console.error(`[!] Erro ao processar ${evento.eventoId}: ${err.message}. Nova tentativa em 5s.`);
                setTimeout(() => channel.nack(msg, false, true), 5000);
            }
        }, {
            noAck: false 
        });

    } catch (error) {
        console.error(`Erro ao iniciar o worker da fila "${nomeFila}":`, error);
        process.exit(1);
    }
}

module.exports = criarWorker;