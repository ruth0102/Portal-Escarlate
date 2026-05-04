const crypto = require('crypto');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const axios = require('axios'); // Para comunicação com o barramento de eventos
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(cors());

// Conectando o microsserviço ao Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

// ROTA 1: LOGIN
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Busca o usuário no Supabase
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Compara a senha digitada com o hash do banco
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // --- NOTIFICAÇÃO AO BARRAMENTO DE EVENTOS ---
    try {
      await axios.post('http://localhost:10000/eventos', {
        tipo: "UsuarioLogado",
        dados: {
          id: user.id,
          email: user.email,
          horario: new Date().toISOString()
        }
      });
      console.log("Evento 'UsuarioLogado' enviado ao barramento.");
    } catch (e) {
      console.error("Aviso: Barramento de eventos indisponível para login.");
    }

    // Retorna os dados para o Front-End (NextAuth) - Agora inclui o status de verificação!
    res.json({
      id: user.id,
      email: user.email,
      role: user.role || 'Usuário',
      is_verified: user.is_verified 
    });

  } catch (err) {
    res.status(500).json({ error: 'Erro interno no microsserviço' });
  }
});

// ROTA 2: CADASTRO (/usuarios)
app.post('/usuarios', async (req, res) => {
  const { email, passwordHash } = req.body; // Recebe passwordHash conforme configurado no front
  const token = crypto.randomBytes(32).toString('hex'); // Gera o código de verificação

  try {
    // Verifica se o usuário já existe
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'E-mail já cadastrado' });
    }

    // Criptografa a senha antes de salvar
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(passwordHash, salt);

    // Salva o novo usuário no Supabase JUNTO com o token
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([
        { 
          email: email, 
          password: hashedPassword,
          role: 'Usuário',
          verification_token: token 
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // --- NOTIFICAÇÃO AO BARRAMENTO DE EVENTOS ---
    try {
      await axios.post('http://localhost:10000/eventos', {
        tipo: "UsuarioCriado",
        dados: {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role,
          token: token // O TOKEN VAI PARA O BARRAMENTO AQUI!
        }
      });
      console.log("Evento 'UsuarioCriado' enviado ao barramento.");
    } catch (e) {
      console.error("Aviso: Barramento de eventos indisponível para cadastro.");
    }

    res.status(201).json({ 
      message: 'Usuário criado com sucesso', 
      user: { id: newUser.id, email: newUser.email } 
    });

  } catch (err) {
    console.error("Erro detalhado:", err);
    res.status(500).json({ error: 'Erro interno ao criar usuário' });
  }
});

// ROTA 3: EXCLUSÃO
app.delete('/usuarios/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // --- NOTIFICAÇÃO AO BARRAMENTO DE EVENTOS ---
    try {
      await axios.post('http://localhost:10000/eventos', {
        tipo: "UsuarioExcluido",
        dados: { id }
      });
      console.log("Evento 'UsuarioExcluido' enviado ao barramento.");
    } catch (e) {
      console.log("Aviso: Barramento offline.");
    }

    res.status(200).json({ message: 'Usuário removido com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar usuário' });
  }
});

// ROTA 4: VALIDAR CÓDIGO DE E-MAIL (Nova Rota para o Front-End usar)
app.post('/verificar-email', async (req, res) => {
  const { code } = req.body;

  try {
    // Procura no banco se existe algum usuário com esse token
    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('verification_token', code)
      .single();

    if (error || !user) {
      return res.status(400).json({ error: 'Código inválido ou já utilizado' });
    }

    // Se achou, atualiza o is_verified para true e limpa o token
    const { error: updateError } = await supabase
      .from('users')
      .update({ is_verified: true, verification_token: null })
      .eq('id', user.id);

    if (updateError) throw updateError;

    res.status(200).json({ message: 'E-mail verificado com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno ao verificar e-mail' });
  }
});

// ROTA 5: RECEBER EVENTOS DO BARRAMENTO
app.post('/eventos', (req, res) => {
  const evento = req.body;
  console.log(`[Auth] Evento recebido do barramento: ${evento.tipo}`);
  
  res.status(200).send({ msg: 'Evento recebido pelo Auth' });
});

// INICIALIZAÇÃO DO SERVIDOR
app.listen(4000, () => {
  console.log('Microsserviço de Auth rodando na porta 4000 (Conectado ao Supabase)');
});