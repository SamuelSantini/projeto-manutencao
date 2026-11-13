BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE usuarios (
    id_usuario SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil VARCHAR(20) NOT NULL DEFAULT 'funcionario'
        CHECK (perfil IN ('admin', 'funcionario')),
    ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE clientes (
    id_cliente SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(150),
    telefone VARCHAR(20),
    cpf_cnpj VARCHAR(20) UNIQUE,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE produtos (
    id_produto SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    descricao TEXT,
    preco NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
    estoque INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0),
    ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE pedidos (
    id_pedido SERIAL PRIMARY KEY,
    id_cliente INTEGER NOT NULL,
    id_usuario INTEGER NOT NULL,
    data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'aberto'
        CHECK (status IN ('aberto', 'pago', 'cancelado')),
    valor_total NUMERIC(10,2) DEFAULT 0,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);

CREATE TABLE itens_pedido (
    id_item SERIAL PRIMARY KEY,
    id_pedido INTEGER NOT NULL,
    id_produto INTEGER NOT NULL,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
    FOREIGN KEY (id_produto) REFERENCES produtos(id_produto),
    UNIQUE (id_pedido, id_produto)
);


ALTER TABLE clientes ALTER COLUMN email SET NOT NULL;
ALTER TABLE clientes ALTER COLUMN cpf_cnpj SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clientes_email_normalizado ON clientes (lower(trim(email)));
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_documento_formato;
ALTER TABLE clientes ADD CONSTRAINT clientes_documento_formato CHECK (cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$');
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_email_formato;
ALTER TABLE clientes ADD CONSTRAINT clientes_email_formato CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
ALTER TABLE produtos DROP CONSTRAINT IF EXISTS produtos_preco_check;
ALTER TABLE produtos ADD CONSTRAINT produtos_preco_check CHECK (preco > 0);
ALTER TABLE produtos DROP CONSTRAINT IF EXISTS produtos_estoque_check;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
UPDATE pedidos SET status='rascunho' WHERE status='aberto';
ALTER TABLE pedidos ALTER COLUMN status SET DEFAULT 'rascunho';
ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check CHECK (status IN ('rascunho','confirmado','pago','entregue','cancelado'));
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_id_cliente_fkey;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_id_cliente_fkey FOREIGN KEY(id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS produto_nome VARCHAR(120);
UPDATE itens_pedido i SET produto_nome=p.nome FROM produtos p WHERE i.id_produto=p.id_produto AND i.produto_nome IS NULL;
ALTER TABLE itens_pedido ALTER COLUMN produto_nome SET NOT NULL;
ALTER TABLE itens_pedido ALTER COLUMN id_produto DROP NOT NULL;
ALTER TABLE itens_pedido DROP CONSTRAINT IF EXISTS itens_pedido_id_produto_fkey;
ALTER TABLE itens_pedido ADD CONSTRAINT itens_pedido_id_produto_fkey FOREIGN KEY(id_produto) REFERENCES produtos(id_produto) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS auditoria (
 id_auditoria BIGSERIAL PRIMARY KEY, id_usuario INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
 acao TEXT NOT NULL, data_hora TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, detalhe TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pedidos_data_idx ON pedidos(data_pedido);
CREATE INDEX IF NOT EXISTS itens_produto_idx ON itens_pedido(id_produto);
CREATE OR REPLACE FUNCTION registrar_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO auditoria(id_usuario,acao,detalhe) VALUES
 (NULLIF(current_setting('app.usuario_id',true),'')::integer,TG_TABLE_NAME || ':' || TG_OP,
 jsonb_build_object('antes',CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD)-'senha_hash' END,
 'depois',CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW)-'senha_hash' END)::text);
 RETURN NULL;
END $$;
DO $$ DECLARE tabela text; BEGIN
 FOREACH tabela IN ARRAY ARRAY['usuarios','clientes','produtos','pedidos','itens_pedido'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS auditar ON %I',tabela);
 EXECUTE format('CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION registrar_auditoria()',tabela);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION versionar_produto() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.versao=OLD.versao+1; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS versionar ON produtos;
CREATE TRIGGER versionar BEFORE UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION versionar_produto();
CREATE OR REPLACE FUNCTION atualizar_precos_pendentes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.preco IS DISTINCT FROM OLD.preco THEN
  UPDATE itens_pedido i SET preco_unitario=NEW.preco, subtotal=i.quantidade*NEW.preco
  FROM pedidos p WHERE i.id_pedido=p.id_pedido AND i.id_produto=NEW.id_produto AND p.status<>'entregue';
  UPDATE pedidos p SET valor_total=(SELECT sum(i.subtotal) FROM itens_pedido i WHERE i.id_pedido=p.id_pedido)
  WHERE p.status<>'entregue' AND EXISTS(SELECT 1 FROM itens_pedido i WHERE i.id_pedido=p.id_pedido AND i.id_produto=NEW.id_produto);
 END IF; RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS recalcular_precos ON produtos;
CREATE TRIGGER recalcular_precos AFTER UPDATE OF preco ON produtos FOR EACH ROW EXECUTE FUNCTION atualizar_precos_pendentes();
CREATE OR REPLACE FUNCTION validar_total_pedido() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE atual pedidos; soma numeric; BEGIN
 SELECT * INTO atual FROM pedidos WHERE id_pedido=CASE WHEN TG_OP='DELETE' THEN OLD.id_pedido ELSE NEW.id_pedido END;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT sum(subtotal) INTO soma FROM itens_pedido WHERE id_pedido=atual.id_pedido;
 IF soma IS NULL OR soma<50 OR soma<>atual.valor_total THEN
 RAISE EXCEPTION 'Pedido deve conter itens e total de pelo menos R$ 50,00' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS conferir_total ON pedidos;
CREATE CONSTRAINT TRIGGER conferir_total AFTER INSERT OR UPDATE ON pedidos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validar_total_pedido();
DROP TRIGGER IF EXISTS conferir_itens ON itens_pedido;
CREATE CONSTRAINT TRIGGER conferir_itens AFTER INSERT OR UPDATE OR DELETE ON itens_pedido DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validar_total_pedido();

INSERT INTO usuarios (nome, email, senha_hash, perfil)
VALUES
(
    'Administrador',
    'admin@comercial.com',
    crypt('admin123', gen_salt('bf', 12)),
    'admin'
),
(
    'Funcionário',
    'funcionario@comercial.com',
    crypt('func123', gen_salt('bf', 12)),
    'funcionario'
);

INSERT INTO clientes (nome, email, telefone, cpf_cnpj)
VALUES
('João Pereira', 'joao@email.com', '48999990001', '11111111111'),
('Maria Oliveira', 'maria@email.com', '48999990002', '22222222222'),
('Pedro Santos', 'pedro@email.com', '48999990003', '33333333333'),
('Ana Costa', 'ana@email.com', '48999990004', '44444444444');

INSERT INTO produtos (nome, descricao, preco, estoque)
VALUES
('Notebook', 'Notebook para uso profissional', 3500.00, 15),
('Mouse', 'Mouse USB', 80.00, 50),
('Teclado', 'Teclado USB', 120.00, 30),
('Monitor', 'Monitor 24 polegadas', 950.00, 12),
('Headset', 'Headset com microfone', 180.00, 25),
('Webcam', 'Webcam Full HD', 250.00, 18);

INSERT INTO pedidos (id_cliente, id_usuario, status, valor_total)
VALUES
(1, 1, 'pago', 3580.00),
(2, 2, 'rascunho', 300.00),
(3, 1, 'pago', 950.00);

INSERT INTO itens_pedido
(id_pedido, id_produto, quantidade, preco_unitario, subtotal, produto_nome)
VALUES
(1, 1, 1, 3500.00, 3500.00, 'Notebook'),
(1, 2, 1, 80.00, 80.00, 'Mouse'),
(2, 3, 1, 120.00, 120.00, 'Teclado'),
(2, 5, 1, 180.00, 180.00, 'Headset'),
(3, 4, 1, 950.00, 950.00, 'Monitor');


COMMIT;
