require('dotenv').config();
const amqp = require('amqplib');

async function consume() {
    const queue = 'task_queue';

    try {
        // Conecta ao servidor do CloudAMQP
        const connection = await amqp.connect(process.env.CLOUDAMQP_URL);
        const channel = await connection.createChannel();

        // Garante que a fila existe (caso o consumidor inicie antes do produtor)
        await channel.assertQueue(queue, { durable: true });

        // Define que o consumidor só receberá 1 mensagem por vez (útil para tarefas pesadas)
        channel.prefetch(1);

        console.log(`[*] Aguardando mensagens na fila "${queue}". Pressione CTRL+C para sair.`);

        // Fica escutando a fila
        channel.consume(queue, (msg) => {
            if (msg !== null) {
                const content = msg.content.toString();
                console.log(`[x] Recebido: "${content}"`);

                // Simula um tempo de processamento
                setTimeout(() => {
                    console.log(`[v] Processamento concluído: "${content}"`);
                    // Confirma (ACK) que a mensagem foi processada para que o CloudAMQP a remova da fila
                    channel.ack(msg);
                }, 1500);
            }
        }, {
            noAck: false // Garante que o RabbitMQ espere a confirmação (ACK)
        });

    } catch (error) {
        console.error('Erro no consumidor:', error);
    }
}

consume();