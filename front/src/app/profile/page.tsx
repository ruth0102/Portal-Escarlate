'use client';

import React from 'react';
import Link from 'next/link';
import { useSession, signOut } from "next-auth/react";
import axios from 'axios';

export default function ProfilePage() {
  // O useSession verifica automaticamente o Cookie do NextAuth
  const { data: session, status } = useSession();

  // Função para deletar a conta no Supabase e deslogar
  const handleExcluirConta = async () => {
    const confirmacao = window.confirm(
      "Tem certeza que deseja excluir sua conta? Esta ação é irreversível."
    );

    if (!confirmacao) return;

    try {
      // Pega o ID do usuário da sessão (adaptando para a tipagem do NextAuth)
      const userId = (session?.user as any)?.id;

      if (!userId) {
        alert("Erro: ID do usuário não encontrado na sessão.");
        return;
      }

      // Chama a rota de DELETE do nosso Microsserviço de Auth (na porta 4000)
      await axios.delete(`http://localhost:4000/usuarios/${userId}`);

      alert("Sua conta foi excluída com sucesso.");

      // Limpa o cookie de login e manda o usuário de volta para a tela de login
      await signOut({ callbackUrl: "/login" });

    } catch (error) {
      console.error("Erro ao excluir conta:", error);
      alert("Ocorreu um erro ao tentar excluir a conta. Tente novamente.");
    }
  };

  // 1. Enquanto ele verifica se existe sessão
  if (status === "loading") {
    return <div style={{ padding: '100px', textAlign: 'center', color: '#fff' }}>Carregando...</div>;
  }

  // 2. --- SE NÃO ESTIVER LOGADO (session será null) ---
  if (!session) {
    return (
      <div style={{ 
        padding: '100px 40px', 
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
        color: '#fff'
      }}>
        <h2 style={{ color: '#e63946' }}>Acesso Restrito</h2>
        <p>Por favor, <strong>faça login</strong> primeiro para visualizar seu perfil e gerenciar notificações.</p>
        <Link href="/login" style={{
          padding: '10px 25px',
          backgroundColor: '#333',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '5px',
          fontWeight: 'bold'
        }}>
          Ir para o Login
        </Link>
      </div>
    );
  }

  // 3. --- SE ESTIVER LOGADO ---
  return (
    <div style={{ padding: '60px 40px', maxWidth: '800px', margin: '0 auto', color: '#fff' }}>
      <h1 style={{ borderBottom: '2px solid #e63946', paddingBottom: '10px' }}>Seu Perfil</h1>
      
      <div style={{ marginTop: '30px', backgroundColor: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '10px' }}>
        <p><strong>E-mail:</strong> {session.user?.email}</p>
        <p><strong>Status da Conta:</strong> Ativa (via Microsserviço de Auth)</p>
      </div>

      <div style={{ marginTop: '40px' }}>
        <h3>Configurações de Notificações</h3>
        <p style={{ fontStyle: 'italic', opacity: 0.7 }}>
          Integração com o Microsserviço de Notificações em breve...
        </p>
      </div>

      {/* --- ZONA DE PERIGO: BOTÃO DE EXCLUSÃO --- */}
      <div style={{ marginTop: '60px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ color: '#e63946', marginBottom: '10px' }}>Zona de Perigo</h3>
        <p style={{ fontSize: '14px', marginBottom: '15px', opacity: 0.8 }}>
          Ao excluir sua conta, todos os seus dados serão apagados do sistema e esta ação não poderá ser desfeita.
        </p>
        <button 
          onClick={handleExcluirConta}
          style={{
            padding: '10px 20px',
            backgroundColor: 'transparent',
            color: '#e63946',
            border: '1px solid #e63946',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.3s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#e63946';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#e63946';
          }}
        >
          Excluir Minha Conta
        </button>
      </div>
    </div>
  );
}