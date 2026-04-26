'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function ProfilePage() {
  // Estado para simular se o usuário está logado
  // No futuro, isso virá do seu contexto de autenticação ou cookie
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simula uma verificação de sessão ao carregar a página
    const checkAuth = async () => {
      // Aqui você verificaria se existe um token ou usuário no localStorage/Cookie
      const user = localStorage.getItem('user'); // Exemplo simples
      if (user) setIsLoggedIn(true);
      setLoading(false);
    };

    checkAuth();
  }, []);

  if (loading) return <div style={{ padding: '40px' }}>Carregando...</div>;

  // --- SE NÃO ESTIVER LOGADO ---
  if (!isLoggedIn) {
    return (
      <div style={{ 
        padding: '100px 40px', 
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px'
      }}>
        <h2 style={{ color: '#e63946' }}>Acesso Restrito</h2>
        <p>Por favor, <strong>faça login</strong> primeiro para visualizar seu perfil e gerenciar notificações.</p>
        <Link href="/login" style={{
          padding: '10px 25px',
          backgroundColor: '#1a1a1a',
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

  // --- SE ESTIVER LOGADO ---
  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>O Seu Perfil</h1>
      {/* ... restante do código do perfil que criamos antes ... */}
    </div>
  );
}