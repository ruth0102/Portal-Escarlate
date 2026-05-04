const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());

// 1. Configuração do "Carteiro" (Nodemailer)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'portalescarlate7@gmail.com',
        pass: 'ieoj zlwm shhl bzvr' // Sua senha de app
    }
});

// 2. Rota que escuta o Barramento de Eventos
app.post('/eventos', async (req, res) => {
    const evento = req.body;
    
    console.log(`[Notificação] 📩 Evento recebido: ${evento.tipo}`);

    if (evento.tipo === 'UsuarioCriado') {
        const emailDestino = evento.dados.email;
        const token = evento.dados.token; // Captura o token vindo do Auth
        
        // Monta o link apontando para a tela do seu Front-End
        const linkConfirmacao = `http://localhost:3000/verify-email?code=${token}`;

        console.log(`[Notificação] Disparando e-mail de confirmação para: ${emailDestino}`);
        
        try {
            await transporter.sendMail({
                from: '"Portal Escarlate" <portalescarlate7@gmail.com>',
                to: emailDestino,
                subject: 'Confirme seu e-mail no Portal Escarlate',
                text: `Olá!\n\nSua conta no Portal Escarlate foi criada. Para confirmar seu e-mail e liberar seu acesso, acesse o link:\n${linkConfirmacao}\n\nEquipe Portal Escarlate`,
                html: `
                    <div style="font-family: Helvetica, Arial, sans-serif; color: #111; line-height: 1.6; max-width: 600px; padding: 20px 0;">
                        <p>Olá,</p>
                        <p>Sua conta no <strong>Portal Escarlate</strong> foi criada. Para confirmar seu endereço de e-mail e ativar seu acesso completo, clique no botão abaixo:</p>
                        
                        <div style="margin: 30px 0;">
                            <a href="${linkConfirmacao}" style="background-color: #222; color: #fff; padding: 10px 24px; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: bold;">
                                Verificar E-mail
                            </a>
                        </div>
                        
                        <p style="font-size: 12px; color: #666; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
                            Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                            <a href="${linkConfirmacao}" style="color: #666; word-break: break-all;">${linkConfirmacao}</a>
                        </p>
                        <p style="font-size: 12px; color: #999;">
                            Equipe Portal Escarlate
                        </p>
                    </div>
                `
            });
            console.log(`[Notificação] ✅ E-mail entregue com sucesso para ${emailDestino}`);
        } catch (erro) {
            console.error(`[Notificação] ❌ Erro ao enviar e-mail:`, erro);
        }
    }

    // O back-end sempre precisa responder ao barramento para não travar a fila
    res.status(200).send({ msg: 'Evento processado com sucesso' });
});

const PORTA = 8000;
app.listen(PORTA, () => {
    console.log(`Microsserviço de Notificação rodando na porta ${PORTA}`);
});