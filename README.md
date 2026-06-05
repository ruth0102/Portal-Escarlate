# Portal Escarlate

Plataforma de notícias com inteligência artificial desenvolvida como Trabalho Semestral para as disciplinas de Linguagens de Programação 2 e Arquitetura de Sistemas Computacionais. O portal oferece curadoria e tecnologia em uma experiência digital moderna, buscando notícias reais e gerando resumos sintetizados através de IA.

## 👥 Integrantes da Equipe
* Luigi de Menezes Collesi (RA: 23.00625-0)
* Luigi de Lauand Botto (RA: 23.01066-5)
* Enzo Pistori Fontenele (RA: 23.00768-0)
* Ruth Ramos Romeu (RA: 22.01003-3)

---

## 🏛️ Arquitetura do Sistema

A plataforma foi desenhada utilizando uma arquitetura robusta de microsserviços. O sistema é dividido entre uma aplicação Front-end em React e um Back-end em Node.js que rodam em uma Máquina Virtual Linux.

O Back-end concentra todas as regras de negócio e integrações, possuindo um **Gateway HTTP** (na porta 3000) que recebe as requisições e as roteia internamente através de um barramento centralizado chamado **Event Service**. 

Para garantir a independência e segurança dos dados, não há relacionamento cruzado entre os bancos: cada microsserviço possui e gerencia seu próprio banco de dados PostgreSQL dedicado.

---

## ⚙️ Microsserviços

O back-end é composto por 9 serviços independentes:

* **Auth Service (Porta 3001):** Gerencia login, sessões, cookies (HttpOnly) e validação dos dados da conta.
* **News Service (Porta 3002):** Responsável por buscar notícias, realizar a paginação (20 por página), salvar histórico e gerar métricas.
* **Registration Service (Porta 3003):** Cuida do cadastro, tokens de verificação e confirmação de e-mail.
* **AI Service (Porta 3004):** Executa as requisições ao provedor de IA externo, com sistemas de fallback de chaves e modelos.
* **News Summary Service (Porta 3005):** Monta os prompts a partir da página de notícias e solicita resumos centrais ao AI Service.
* **Email Service (Porta 3006):** Gerencia a conexão OAuth com o Google, validando refresh tokens e enviando e-mails automáticos.
* **Event Service (Porta 3007):** Barramento interno que centraliza, registra e distribui eventos entre os microsserviços.
* **Article Summary Service (Porta 3008):** Resume artigos individuais por URL, gerenciando um cache persistente recuperável via UUID.
* **Password Recovery Service (Porta 3009):** Gerencia as solicitações de mudança de senha e tokens temporários.

---

## 🛠️ Tecnologias Utilizadas

### Front-end
* **React & Vite:** Para construção da interface de usuário e servidor de desenvolvimento/build rápido.
* **TypeScript:** Para tipagem estática e redução de erros em desenvolvimento.
* **React Router DOM:** Para navegação e gerenciamento das rotas das páginas.
* **Zod:** Para validação tipada de dados e formulários.

### Back-end
* **Node.js Nativo:** Utilização extensiva de módulos nativos (`node:http`, `node:crypto`, `node:fs`, `node:net`) visando performance e controle sem excesso de frameworks pesados.
* **Argon2:** Para geração e verificação de hashes criptográficos das senhas.
* **Zod:** Para validação de payloads e schemas no lado do servidor.
* **pg (node-postgres):** Para a comunicação direta com os bancos PostgreSQL.
* **Google APIs:** Para integração com OAuth 2.0 e disparo de e-mails pelo Gmail.

### Bancos de Dados
* **PostgreSQL:** Bancos isolados por domínio (ex: `auth_db`, `news_db`, `ai_db`, `email_db`, etc.).

---

## 🔗 Integrações Externas (APIs)

* **NewsAPI.org:** Utilizada pelo News Service para a busca estruturada de artigos e notícias.
* **OpenRouter:** Funciona como o Gateway de Inteligência Artificial para as requisições gerativas do AI Service.
* **Gmail API / Google OAuth:** Utilizada pelo Email Service para envio de links transacionais e gestão de permissões administrativas de disparo.