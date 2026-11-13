
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

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pedidos p LEFT JOIN itens_pedido i USING(id_pedido) GROUP BY p.id_pedido
 HAVING sum(i.subtotal) IS NULL OR sum(i.subtotal)<50 OR sum(i.subtotal)<>p.valor_total) THEN
 RAISE EXCEPTION 'Há pedidos antigos sem itens, abaixo de R$ 50 ou com total inconsistente. Corrija antes de migrar.';
 END IF;
END $$;
