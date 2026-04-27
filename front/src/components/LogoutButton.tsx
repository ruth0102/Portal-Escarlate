"use client";

import { signOut } from "next-auth/react";

interface LogoutButtonProps {
  className?: string;
  children?: React.ReactNode;
  variant?: "link" | "button";
}

export function LogoutButton({ className, children, variant = "button" }: LogoutButtonProps) {
  const handleLogout = () => {
    // O callbackUrl garante que, após limpar tudo, ele te joga de volta pro login
    signOut({ callbackUrl: "/login" });
  };

  if (variant === "link") {
    return (
      <span 
        onClick={handleLogout} 
        className={className} 
        style={{ cursor: 'pointer' }}
      >
        {children || "Sair"}
      </span>
    );
  }

  return (
    <button onClick={handleLogout} className={className}>
      {children || "Sair"}
    </button>
  );
}