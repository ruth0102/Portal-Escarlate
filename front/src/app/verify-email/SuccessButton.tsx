'use client';

import { signOut } from "next-auth/react";

export function SuccessButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })} // Limpa o cookie velho e manda pro login!
      style={{
        marginTop: '20px',
        padding: '12px 24px',
        backgroundColor: '#e63946',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '16px',
        transition: 'background-color 0.3s'
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#cc0000'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#e63946'}
    >
      Atualizar Acesso (Fazer Login)
    </button>
  );
}