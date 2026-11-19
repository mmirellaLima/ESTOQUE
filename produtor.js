require('dotenv').config();
const amqp = require('amqplib');
async function produce() {
    const queue = 'task_queue';
    const message = process.argv.slice(2).join(' ') || 'Mensagem padrão do produtor';
    try {
        //Conecta ao servidor do CloudAMQP
        const connection = await amqp.connect(process.env.CLOUDAMQP_URL);
        const channel = await connection.createChannel();

        //Garante que a fila exista. "durable: true" faz a fila sobreviver a reinicializações do RabbitMQ
        await channel.assertQueue(queue, { durable: true });

        //Envia a mensagem para a fila
        channel.sendToQueue(queue, Buffer.from(message), { persistent: true });
            persist: true //Garante que a mensagem seja persistida no disco, mesmo que o RabbitMQ reinicie
        console.log(`Mensagem enviada: ${message}`);

        //Fecha a conexão após o envio
        setTimeout(() => {
            connection.close();
            process.exit(0);
        }, 500);
    } catch (error) {
        console.error('Erro ao enviar a mensagem:', error);
    }
}
produce();