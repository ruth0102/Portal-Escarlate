const express = require('express');
const axios = require('axios');

const app = express();

// Permite que o Express entenda requisições no formato JSON
app.use(express.json());

// Lista das URLs dos futuros microsserviços.
const inscritos = [
    'http://localhost:4000/eventos', // Microsserviço de Autenticação
    //'http://localhost:5000/eventos', // Microsserviço de IA/Paráfrase
    //'http://localhost:6000/eventos', // Microsserviço de Coleta
    //'http://localhost:7000/eventos', // Microsserviço de Feed
    'http://localhost:8000/eventos', // Microsserviço de Notificação
];

// Rota principal que recebe os eventos
app.post('/eventos', (req, res) => {
    // O payload do evento (ex: Noticia_Capturada) vem no corpo da requisição
    const evento = req.body;
    
    console.log(`[Barramento] 📥 Novo evento recebido: ${evento.tipo}`);

    // O Barramento faz um loop e repassa o evento para todos os serviços inscritos
    inscritos.forEach(async (url) => {
        try {
            await axios.post(url, evento);
        } catch (erro) {
            // Esse try/catch é vital! Se um microsserviço estiver desligado, 
            // o barramento avisa no terminal, mas NÃO trava o sistema inteiro.
            console.log(`[Barramento] ⚠️  Aviso: O serviço ${url} parece estar offline no momento.`);
        }
    });

    // Responde para quem enviou o evento que tudo deu certo
    res.status(200).send({ msg: 'Evento distribuído com sucesso pelo barramento' });
});

// O Barramento vai rodar na porta 10000 para não conflitar com nada
app.listen(10000, () => {
    console.log('Barramento de Eventos rodando na porta 10000');
});