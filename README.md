# 🔴 Portal Escarlate – Plataforma Inteligente de Análise de Notícias

## 👥 Integrantes
- Enzo Pistori Fontenele de Oliveira - 23.00768-0
- Luigi de Menezes Collesi - 23.00625-0
- Luigi de Lauand Botto - 23.01066-5
- Ruth Ramos Romeu - 22.01003-3

## 📌 Descrição do Projeto
O Portal Escarlate é uma plataforma web que tem como objetivo central oferecer uma forma mais inteligente, organizada e crítica de consumir notícias.
A aplicação permite que usuários acessem notícias relevantes a partir de links externos, com o diferencial de utilizar inteligência artificial para processamento de conteúdo, incluindo parafraseamento e resumo automático.
Além disso, o sistema integra dados públicos relacionados a agentes políticos, permitindo ao usuário cruzar informações e obter uma visão mais contextualizada dos acontecimentos.
O Portal Escarlate busca transformar o consumo de informação em uma experiência mais clara, eficiente e consciente.

## 🚀 Funcionalidades
- Cadastro e autenticação de usuários
- Cadastro e visualização de notícias via links
- Processamento automático de notícias com IA (resumo e parafraseamento)
- Consulta de dados públicos sobre políticos
- Sistema de filtragem por categorias e relevância
- Notificações baseadas em eventos do sistema

## 🛠️ Tecnologias e Arquitetura
O projeto foi desenvolvido utilizando o padrão de **Microsserviços**, garantindo que cada domínio da aplicação seja independente e escalável.
- **Front-End:** Next.js (App Router), NextAuth (Sessões JWT via Cookies) e Axios.
- **Back-End (Auth):** Node.js, Express, Bcrypt (Hash de senhas) e PostgreSQL local.
- **Comunicação:** Barramento de Eventos interno para comunicação assíncrona entre os microsserviços.

## ⚙️ Como executar o projeto localmente
**1. Configuração do Banco de Dados**
Certifique-se de ter o PostgreSQL instalado. Crie um banco chamado `portal_escarlate` e execute o script SQL para criar a tabela de usuários.

**2. Variáveis de Ambiente (.env)**
No diretório do microsserviço de autenticação, crie um arquivo `.env` com a seguinte estrutura:
`DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/portal_escarlate"`

**3. Inicialização dos Serviços**
Abra terminais distintos para cada serviço e execute:
- **Barramento:** `node index.js` (Porta 10000)
- **Serviço de Auth:** `node index.js` (Porta 4000)
- **Front-End:** `npm run dev` (Porta 3000)