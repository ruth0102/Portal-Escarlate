import axios from 'axios';

// Instância para o Microsserviço de Autenticação (supondo que rodará na porta 4000)
export const apiAuth = axios.create({
    baseURL: 'http://localhost:4000' 
});

// Futuramente, adicionaremos os outros aqui: apiColeta, apiFeed, etc.