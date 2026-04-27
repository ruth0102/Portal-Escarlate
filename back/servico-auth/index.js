require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// Conexão com o seu Postgres Local
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const JWT_SECRET = process.env.JWT_SECRET || "sua_chave_secreta_aqui";

// ==========================================
// ROTAS DE AUTENTICAÇÃO E CADASTRO
// ==========================================

// 1. ROTA DE CADASTRO (Cria o usuário e avisa o barramento)
app.post('/usuarios', async (req, res) => {
    const { email, passwordHash: passwordRaw } = req.body;

    try {
        // Criptografia da senha
        const salt = await bcrypt.genSalt(10);
        const passwordHashed = await bcrypt.hash(passwordRaw, salt);

        // Salvar no Postgres Local
        const query = 'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email';
        const values = [email, passwordHashed];
        const result = await pool.query(query, values);
        
        const newUser = result.rows[0];

        // Disparar Evento para o Barramento (Porta 10000)
        try {
            await axios.post('http://localhost:10000/eventos', {
                tipo: 'USUARIO_CRIADO',
                dados: newUser
            });
        } catch (e) {
            console.log("Aviso: Barramento offline.");
        }

        res.status(201).json(newUser);
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ erro: 'E-mail já existe' });
        console.error(error);
        res.status(500).json({ erro: "Erro ao salvar no banco local." });
    }
});

// 2. ROTA DE LOGIN (Valida a senha e gera o Token)
app.post('/usuarios/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ erro: 'Credenciais inválidas' });
        }

        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        
        if (!passwordMatch) {
            return res.status(401).json({ erro: 'Credenciais inválidas' });
        }

        // Gera o "Passaporte" do usuário
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ user: { id: user.id, email: user.email }, token });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// 3. ROTA DE BUSCA COMPLETA (Usada pelo front no processo de Auth)
app.get('/usuarios/auth', async (req, res) => {
    const { email } = req.query;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Usuário não encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// 4. ROTA PÚBLICA (Retorna dados sem expor a senha criptografada)
app.get('/usuarios/publico', async (req, res) => {
    const { email } = req.query;
    try {
        const result = await pool.query('SELECT id, email, created_at FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Usuário não encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// ==========================================
// INICIALIZAÇÃO DO SERVIDOR
// ==========================================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Servico-Auth rodando na porta ${PORT}`));