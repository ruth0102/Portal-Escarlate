require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors()); // Libera o acesso para o Front-End
app.use(express.json()); // Permite ler o corpo das requisições em JSON

// Configuração da "Despensa" (Supabase)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// -----------------------------------------------------------------
// ROTAS DO MICROSSERVIÇO
// -----------------------------------------------------------------

// Rota 1: Buscar usuário para Login (O Front-End usa essa para validar a senha)
app.get('/usuarios/auth', async (req, res) => {
    const { email } = req.query;

    const { data: user, error } = await supabase
        .from('users') // Substitua 'users' pelo nome real da sua tabela, se for diferente
        .select('id, email, password, created_at')
        .eq('email', email)
        .single(); // Garante que pega só um

    if (error || !user) {
        return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    res.json(user);
});

// Rota 2: Buscar dados públicos do usuário (Sem expor a senha)
app.get('/usuarios/publico', async (req, res) => {
    const { email } = req.query;

    const { data: user, error } = await supabase
        .from('users')
        .select('id, email, created_at')
        .eq('email', email)
        .single();

    if (error || !user) {
        return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    res.json(user);
});

// Rota 3: Criar um novo usuário (Cadastro)
app.post('/usuarios', async (req, res) => {
    const { email, passwordHash } = req.body;

    const { data: newUser, error } = await supabase
        .from('users')
        .insert([{ email, password: passwordHash }])
        .select('id, email, created_at')
        .single();

    if (error) {
        // Código 23505 é o padrão de banco de dados para "Valor Duplicado"
        if (error.code === '23505') {
            return res.status(409).json({ erro: 'Já existe uma conta com esse e-mail.' });
        }
        return res.status(500).json({ erro: 'Erro interno ao criar usuário' });
    }

    res.status(201).json(newUser);
});

// -----------------------------------------------------------------
// LIGANDO O SERVIDOR
// -----------------------------------------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`🔐 Microsserviço de Auth rodando na porta ${PORT}`);
});