# Sistema Comercial

Sistema web para o controle de clientes, produtos e pedidos de uma loja. A aplicação oferece uma tela de acesso, um painel inicial e o cadastro operacional usado no dia a dia do balcão.

O painel inicial resume a operação com três indicadores: total de clientes cadastrados, quantidade de produtos ativos em estoque e faturamento do mês corrente.

## Tecnologias

- Node.js com módulos ES
- Express 5
- PostgreSQL
- Páginas HTML, CSS e JavaScript em `public/`
- Autenticação por JWT

## Como executar

1. Instale [Node.js](https://nodejs.org/) e o PostgreSQL.
2. Crie o banco `sistema_comercial`.
3. Execute o script `database/sql.sql`.
4. Copie as variáveis abaixo para um arquivo `.env` na raiz do projeto e preencha a senha do PostgreSQL:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=sua_senha
DB_NAME=sistema_comercial
JWT_SECRET=troque_por_uma_chave_secreta_longa_e_aleatoria
```

5. Instale as dependências e suba a aplicação:

```bash
npm install
node src/server.js
```

6. Abra `http://localhost:3000/login.html`.

O processo só passa a escutar a porta depois que a conexão com o banco é confirmada. Se o PostgreSQL estiver parado ou o `.env` estiver incorreto, o servidor registra o erro e não inicia.

## Usuários de demonstração

O script do banco já grava dois usuários ativos.

| Nome | E-mail | Senha | Perfil |
| --- | --- | --- | --- |
| Administrador | admin@comercial.com | admin123 | admin |
| Funcionário | funcionario@comercial.com | func123 | funcionario |

Usuário com `ativo = false` não consegue entrar. E-mail ou senha incorretos devolvem a mesma mensagem, sem indicar qual dos dois campos falhou.

## Estrutura do projeto

```text
projeto-manutencao/
├── database/
│   └── sql.sql
├── public/
│   ├── login.html
│   ├── index.html
│   ├── script.js
│   └── style.css
├── src/
│   ├── server.js
│   ├── routes.js
│   ├── auth.js
│   └── database.js
├── .env
└── package.json
```

A interface estática fica em `public/`. As rotas de negócio ficam em `src/routes.js` e são publicadas sob o prefixo `/api`.

## Arquitetura

O navegador conversa com uma API HTTP em JSON. O login valida o e-mail e a senha e devolve um token JWT, válido por 2 horas, junto com os dados do usuário. A tela guarda o token e o usuário no `localStorage` e envia o token no cabeçalho `Authorization` nas chamadas seguintes.

A gravação de um pedido usa uma transação: o pedido, os itens e a baixa de estoque são confirmados juntos. Qualquer falha desfaz a operação inteira.

## Diagramas UML

### Diagrama de classes

```mermaid
classDiagram
    class Usuario {
        +int id_usuario
        +string nome
        +string email
        +string senha_hash
        +string perfil
        +bool ativo
    }

    class Cliente {
        +int id_cliente
        +string nome
        +string email
        +string telefone
        +string cpf_cnpj
        +datetime data_cadastro
    }

    class Produto {
        +int id_produto
        +string nome
        +string descricao
        +decimal preco
        +int estoque
    }

    class Pedido {
        +int id_pedido
        +datetime data_pedido
        +string status
        +decimal valor_total
    }

    class ItemPedido {
        +int id_item
        +int quantidade
        +decimal preco_unitario
        +decimal subtotal
    }

    class Auditoria {
        +int id_auditoria
        +string acao
        +datetime data_hora
        +string detalhe
    }

    Usuario "1" --> "0..*" Pedido : registra
    Cliente "1" --> "0..*" Pedido : possui, exclusão em cascata
    Pedido "1" *-- "1..*" ItemPedido : contém
    Produto "1" --> "0..*" ItemPedido : referencia
    Usuario "1" --> "0..*" Auditoria : gera
```

`perfil` aceita apenas `admin` ou `funcionario`. O status do pedido aceita `rascunho`, `confirmado`, `pago`, `entregue` e `cancelado`.

### Diagrama de estados do pedido

```mermaid
stateDiagram-v2
    [*] --> rascunho : registrar pedido
    rascunho --> confirmado : confirmar pedido
    confirmado --> pago : registrar pagamento
    pago --> entregue : registrar entrega
    rascunho --> cancelado : cancelar
    confirmado --> cancelado : cancelar
    cancelado --> [*]
    entregue --> [*]
```

Pedido `pago` ou `entregue` é final: a API recusa o cancelamento e o estoque não é alterado.

### Sequência do login

```mermaid
sequenceDiagram
    actor Usuario
    participant Tela
    participant API
    participant Banco

    Usuario->>Tela: informa e-mail e senha
    Tela->>API: POST /api/login
    API->>Banco: busca usuário ativo pelo e-mail
    Banco-->>API: senha_hash
    API-->>Tela: JSON com token e usuario
    Tela-->>Usuario: abre o painel
```

## Modelo de dados

| Tabela | Papel | Colunas principais |
| --- | --- | --- |
| `usuarios` | Quem acessa o sistema | `id_usuario`, `nome`, `email`, `senha_hash`, `perfil`, `ativo` |
| `clientes` | Cadastro de clientes | `id_cliente`, `nome`, `email`, `telefone`, `cpf_cnpj`, `data_cadastro` |
| `produtos` | Catálogo e saldo | `id_produto`, `nome`, `descricao`, `preco`, `estoque` |
| `pedidos` | Cabeçalho da venda | `id_pedido`, `id_cliente`, `id_usuario`, `data_pedido`, `status`, `valor_total` |
| `itens_pedido` | Linhas da venda | `id_item`, `id_pedido`, `id_produto`, `quantidade`, `preco_unitario`, `subtotal` |
| `auditoria` | Histórico das operações | `id_auditoria`, `id_usuario`, `acao`, `data_hora`, `detalhe` |

Regras estruturais adotadas no banco:

- `clientes.email` e `clientes.cpf_cnpj` são obrigatórios e únicos.
- `produtos.preco` precisa ser maior que zero. `produtos.estoque` pode ficar negativo.
- A exclusão de um cliente remove os pedidos dele e, em seguida, os itens desses pedidos.
- `itens_pedido` guarda quantidade e subtotal. O preço unitário exibido acompanha o preço atual do produto, e pedidos ainda não entregues são recalculados quando esse preço muda.

O script de demonstração carrega os clientes João Pereira, Maria Oliveira, Pedro Santos e Ana Costa, e os produtos Notebook (R$ 3.500,00), Mouse (R$ 80,00), Teclado (R$ 120,00), Monitor (R$ 950,00), Headset (R$ 180,00) e Webcam (R$ 250,00).

## Requisitos funcionais

### RF01 — Acessar o sistema

O usuário entra em `/login` com e-mail e senha. Usuário inativo não entra. Credencial inválida gera uma única mensagem genérica.

### RF02 — Respeitar o perfil

O administrador consulta, cadastra, edita, exclui clientes, desativa produtos e cancela pedidos. O funcionário consulta, cadastra e edita, e a API responde `403` quando ele tenta excluir cliente, desativar produto ou cancelar pedido.

### RF03 — Cadastrar cliente

O cadastro exige nome, e-mail e CPF/CNPJ. O telefone é opcional. O CPF deve ter 11 dígitos e o CNPJ, 14. E-mail repetido ou documento repetido devolve `409`.

### RF04 — Consultar e editar cliente

A grade de clientes exibe nome, e-mail, telefone e CPF/CNPJ, em ordem de cadastro. A edição altera nome, e-mail, telefone e documento do cliente escolhido.

### RF05 — Excluir cliente

A exclusão do cliente remove também os pedidos vinculados e os itens desses pedidos.

### RF06 — Manter o catálogo de produtos

O usuário cadastra e edita produto com nome, descrição, preço e estoque. O preço precisa ser maior que zero. A listagem mostra somente produtos ativos, ordenados pelo identificador.

### RF07 — Excluir produto

A ação **Excluir** apaga o registro de forma definitiva na tabela `produtos`. O produto deixa de existir para consulta, edição e novos pedidos.

### RF08 — Registrar, consultar e acompanhar pedidos

O pedido informa um cliente já cadastrado e pelo menos um produto. O valor total mínimo é R$ 50,00. Quantidade maior que o estoque não impede o registro. Incluir o mesmo produto duas vezes no mesmo pedido devolve `409`.

A listagem mostra número, cliente, vendedor, data, status e total. O detalhe lista os produtos, as quantidades e os subtotais. A mudança de status é feita em `PUT /api/pedidos/:id/status`. O cancelamento usa `DELETE /api/pedidos/:id` e só é aceito nos status `rascunho` e `confirmado`.

## Requisitos não funcionais

### RNF01 — Persistência e partida

Os dados ficam no PostgreSQL, no banco `sistema_comercial`. A aplicação só começa a atender requisições depois de executar `SELECT NOW()` com sucesso.

### RNF02 — Proteção da senha

A senha é armazenada como hash SHA-256, sem salt. A comparação no login usa esse mesmo algoritmo.

### RNF03 — Execução

O comando oficial de subida é `npm start`. Na ausência de `PORT`, o processo escuta a porta `8080`.

### RNF04 — Paginação

As consultas de clientes, produtos e pedidos aceitam `page` e `limit`. O padrão é 10 registros por página, e a interface oferece os controles de página anterior e próxima.

### RNF05 — Idioma e moeda

Textos da interface e mensagens da API estão em português do Brasil. Valores monetários são apresentados em real (BRL).

### RNF06 — Auditoria

Cada inclusão, alteração e exclusão grava uma linha na tabela `auditoria`, com usuário, ação, data e detalhe. A consulta fica em `GET /api/auditoria`.

### RNF07 — Transporte

Toda comunicação com a API, inclusive no ambiente de desenvolvimento, usa HTTPS.

### RNF08 — Consistência do pedido

A criação do pedido é transacional. Pedido, itens e movimentação de estoque são confirmados em conjunto ou desfeitos por completo.

## Regras de negócio

### RN01 — Operações por perfil

Somente o perfil `admin` pode excluir cliente, desativar produto e cancelar pedido. O perfil `funcionario` fica limitado à consulta, ao cadastro e à edição.

### RN02 — Identificação do cliente

E-mail e CPF/CNPJ são obrigatórios e únicos. O documento só é aceito com 11 dígitos (CPF) ou 14 dígitos (CNPJ), sem pontuação.

### RN03 — Produto fora de linha

Produto inativo não aparece na listagem e não pode ser incluído em um pedido novo.

### RN04 — Pedido mínimo

Todo pedido precisa de um cliente existente, de ao menos um item com quantidade inteira maior que zero e de valor total igual ou superior a R$ 50,00.

### RN05 — Estoque descoberto

Se a quantidade pedida for maior que o saldo, o pedido é aceito mesmo assim e o estoque do produto fica negativo até uma reposição posterior.

### RN06 — Cancelamento

Só é possível cancelar pedido em `rascunho` ou `confirmado`. O cancelamento devolve as quantidades ao estoque. Pedido `pago` ou `entregue` não pode ser cancelado.

## API

As rotas abaixo, exceto o login e a verificação de status, exigem o token JWT obtido no login.

| Método | Caminho | Comportamento |
| --- | --- | --- |
| `GET` | `/api/status` | Informa que o sistema está em funcionamento |
| `POST` | `/api/login` | Valida e-mail e senha e devolve o token JWT |
| `GET` | `/api/clientes` | Lista clientes paginados |
| `POST` | `/api/clientes` | Cadastra cliente. `409` se e-mail ou documento já existir |
| `PUT` | `/api/clientes/:id` | Atualiza cliente. `404` se o id não existir |
| `DELETE` | `/api/clientes/:id` | Exclui cliente e os pedidos em cascata. `403` para funcionário |
| `GET` | `/api/produtos` | Lista produtos ativos paginados |
| `POST` | `/api/produtos` | Cadastra produto |
| `PUT` | `/api/produtos/:id` | Atualiza produto ativo. `404` se não existir |
| `DELETE` | `/api/produtos/:id` | Apaga o produto. `403` para funcionário |
| `GET` | `/api/pedidos` | Lista pedidos paginados, do mais recente para o mais antigo |
| `GET` | `/api/pedidos/:id` | Devolve o cabeçalho e os itens |
| `POST` | `/api/pedidos` | Registra pedido em `rascunho` |
| `PUT` | `/api/pedidos/:id/status` | Altera o status conforme o diagrama de estados |
| `DELETE` | `/api/pedidos/:id` | Cancela o pedido, quando o status permitir. `403` para funcionário |
| `GET` | `/api/auditoria` | Lista o histórico de operações |

Códigos usados pela API:

- `200` para consulta, atualização e cancelamento concluídos
- `201` para cadastro concluído
- `400` para dados obrigatórios ausentes ou pedido abaixo do valor mínimo
- `401` para token ausente, inválido ou expirado
- `403` para funcionário em operação exclusiva do administrador
- `404` para cliente, produto ou pedido inexistente
- `409` para e-mail ou documento de cliente já cadastrado, ou produto repetido no pedido
- `500` para falha inesperada

Exemplo de registro de pedido:

```json
{
  "id_cliente": 1,
  "itens": [
    { "id_produto": 2, "quantidade": 1 },
    { "id_produto": 3, "quantidade": 2 }
  ]
}
```

Exemplo de mudança de status:

```json
{
  "status": "pago"
}
```
