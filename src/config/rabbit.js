const amqp = require('amqplib');

const EXCHANGE = 'estoque.eventos';

const FILAS = ['fila.auditoria', 'fila.compras', 'fila.vitrine'];

async function conectarRabbit() {
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE, 'fanout', { durable: true });

    for (const fila of FILAS) {
        await channel.assertQueue(fila, { durable: true });
        await channel.bindQueue(fila, EXCHANGE, '');
    }

    return { connection, channel };
}

module.exports = { conectarRabbit, EXCHANGE, FILAS };