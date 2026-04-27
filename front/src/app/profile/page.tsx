'use client';

import React from 'react';
import Link from 'next/link';
import { useSession } from "next-auth/react";

export default function ProfilePage() {
  // O useSession verifica automaticamente o Cookie do NextAuth
  const { data: session, status } = useSession();

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
    </div>
  );
}