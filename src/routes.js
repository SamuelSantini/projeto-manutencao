import express from 'express'
import bcrypt from 'bcryptjs'
import { CUSTO_BCRYPT, HASH_FICTICIO, senhaAceitaNoLogin, verificarSenha } from './senhas.js'
import { criarLimiteLogin } from './limite-login.js'
import jwt from 'jsonwebtoken'
import pool from './database.js'
import autenticar, { somenteAdmin } from './auth.js'
import { validarCliente, validarProduto } from './validacao.js'

import { transacao, falhar, paginacao } from './operacoes.js'
const router = express.Router()

router.use((req, res, next) => {
    req.body ??= {}
    next()
})

router.param('id', (req, res, next, id) => {
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1 || Number(id) > 2147483647) {
        return res.status(400).json({ mensagem: 'Identificador inválido' })
    }
    next()
})

router.post('/login', criarLimiteLogin(), async (req, res) => {
    try {
        const { email, senha } = req.body
        if (typeof email !== 'string' || !senhaAceitaNoLogin(senha) || !email.trim() || email.length > 150) {
            return res.status(400).json({ mensagem: 'Informe e-mail e senha' })
        }

        const resultado = await pool.query(
            'SELECT * FROM usuarios WHERE lower(email) = lower($1) AND ativo = TRUE',
            [email.trim()]
        )

        const usuario = resultado.rows[0]
        const senhaCorreta = await verificarSenha(senha, usuario?.senha_hash || HASH_FICTICIO)
        if (!usuario || !senhaCorreta) {
            return res.status(401).json({ mensagem: 'Usuário ou senha inválidos' })
        }

        if (bcrypt.getRounds(usuario.senha_hash) < CUSTO_BCRYPT) {
            const novoHash = await bcrypt.hash(senha, CUSTO_BCRYPT)
            await transacao(usuario.id_usuario,c=>c.query('UPDATE usuarios SET senha_hash = $1 WHERE id_usuario = $2 AND senha_hash = $3',[novoHash,usuario.id_usuario,usuario.senha_hash]))
        }
        res.set('Cache-Control', 'no-store')

        const token = jwt.sign(
            {
                id_usuario: usuario.id_usuario,
                nome: usuario.nome,
                perfil: usuario.perfil
            },
            process.env.JWT_SECRET,
            { expiresIn: '2h', algorithm: 'HS256' }
        )

        res.json({
            mensagem: 'Login realizado',
            token,
            usuario: {
                id_usuario: usuario.id_usuario,
                nome: usuario.nome,
                email: usuario.email,
                perfil: usuario.perfil
            }
        })

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao realizar login'
        })
    }
})

router.get('/status',(req,res)=>res.json({mensagem:'Sistema Comercial funcionando'}))

router.use(autenticar)
router.get('/me',(req,res)=>res.json(req.usuario))
const pedidoSelect=`SELECT p.*,c.nome AS cliente,u.nome AS usuario FROM pedidos p JOIN clientes c USING(id_cliente) JOIN usuarios u USING(id_usuario)`
async function listar(req,res,sql,params=[]) {
 const {page,limit,offset}=paginacao(req.query)
 const n=params.length
 const dados=await pool.query(`${sql} LIMIT $${n+1} OFFSET $${n+2}`,[...params,limit,offset])
 const total=Number((await pool.query(`SELECT count(*) FROM (${sql}) registros`,params)).rows[0].count)
 res.json({dados:dados.rows,page,limit,total,paginas:Math.ceil(total/limit)})
}
const achar=async(c,sql,args)=>{const r=await c.query(sql,args);if(!r.rows.length)falhar(404,'Registro não encontrado');return r.rows[0]}
router.get('/painel',async(req,res)=>{
 const r=await pool.query(`SELECT (SELECT count(*)::int FROM clientes) AS clientes,
 (SELECT count(*)::int FROM produtos WHERE ativo AND estoque>0) AS produtos,
 (SELECT COALESCE(sum(valor_total),0) FROM pedidos WHERE status IN('pago','entregue') AND data_pedido>=date_trunc('month',CURRENT_TIMESTAMP) AND data_pedido<date_trunc('month',CURRENT_TIMESTAMP)+interval '1 month') AS faturamento`)
 res.json(r.rows[0])
})
router.get('/clientes',async(req,res)=>listar(req,res,'SELECT * FROM clientes ORDER BY data_cadastro,id_cliente'))
router.get('/clientes/:id',async(req,res)=>res.json(await achar(pool,'SELECT * FROM clientes WHERE id_cliente=$1',[req.params.id])))
for(const method of ['post','put'])router[method](method==='post'?'/clientes':'/clientes/:id',async(req,res)=>{
 const erro=validarCliente(req.body);if(erro)falhar(400,erro)
 const {nome,email,telefone,cpf_cnpj}=req.body
 const dados=await transacao(req.usuario.id_usuario,async c=>achar(c,method==='post'?
 'INSERT INTO clientes(nome,email,telefone,cpf_cnpj) VALUES($1,$2,$3,$4) RETURNING *':
 'UPDATE clientes SET nome=$1,email=$2,telefone=$3,cpf_cnpj=$4 WHERE id_cliente=$5 RETURNING *',
 method==='post'?[nome.trim(),email.trim().toLowerCase(),telefone||null,cpf_cnpj]:[nome.trim(),email.trim().toLowerCase(),telefone||null,cpf_cnpj,req.params.id]))
 res.status(method==='post'?201:200).json(dados)
})
router.delete('/clientes/:id',somenteAdmin,async(req,res)=>{
 await transacao(req.usuario.id_usuario,c=>achar(c,'DELETE FROM clientes WHERE id_cliente=$1 RETURNING *',[req.params.id]))
 res.json({mensagem:'Cliente, pedidos e itens excluídos'})
})
router.get('/produtos',async(req,res)=>listar(req,res,'SELECT * FROM produtos WHERE ativo ORDER BY id_produto'))
router.get('/produtos/:id',async(req,res)=>res.json(await achar(pool,'SELECT * FROM produtos WHERE ativo AND id_produto=$1',[req.params.id])))
router.post('/produtos',async(req,res)=>{
 const erro=validarProduto(req.body);if(erro)falhar(400,erro)
 const {nome,descricao,preco,estoque}=req.body
 const dados=await transacao(req.usuario.id_usuario,c=>achar(c,'INSERT INTO produtos(nome,descricao,preco,estoque) VALUES($1,$2,$3,$4) RETURNING *',[nome.trim(),descricao||null,preco,estoque]))
 res.status(201).json(dados)
})
router.put('/produtos/:id',async(req,res)=>{
 const erro=validarProduto(req.body);if(erro)falhar(400,erro)
 const {nome,descricao,preco,estoque,versao}=req.body
 if(!Number.isSafeInteger(versao)||versao<1)falhar(400,'Informe a versão do produto consultado')
 const dados=await transacao(req.usuario.id_usuario,async c=>{
 const atual=await achar(c,'SELECT * FROM produtos WHERE ativo AND id_produto=$1 FOR UPDATE',[req.params.id])
 if(atual.versao!==versao)falhar(409,'Produto alterado por outra operação. Recarregue antes de salvar.')
 return achar(c,'UPDATE produtos SET nome=$1,descricao=$2,preco=$3,estoque=$4 WHERE id_produto=$5 RETURNING *',[nome.trim(),descricao||null,preco,estoque,req.params.id])
 })
 res.json(dados)
})
router.delete('/produtos/:id',somenteAdmin,async(req,res)=>{
 await transacao(req.usuario.id_usuario,c=>achar(c,'DELETE FROM produtos WHERE id_produto=$1 RETURNING *',[req.params.id]))
 res.json({mensagem:'Produto excluído definitivamente'})
})
router.patch('/produtos/:id/desativar',somenteAdmin,async(req,res)=>{
 await transacao(req.usuario.id_usuario,c=>achar(c,'UPDATE produtos SET ativo=FALSE WHERE ativo AND id_produto=$1 RETURNING *',[req.params.id]))
 res.json({mensagem:'Produto desativado'})
})
router.get('/pedidos',async(req,res)=>listar(req,res,`${pedidoSelect} ORDER BY p.id_pedido DESC`))
router.get('/pedidos/:id',async(req,res)=>{
 // Uma consulta mantém cabeçalho e itens na mesma fotografia do banco.
 const r=await pool.query(`${pedidoSelect.replace('p.*,','p.*,detalhe.itens,')}, LATERAL (
 SELECT COALESCE(json_agg(json_build_object('id_produto',i.id_produto,'produto',COALESCE(pr.nome,i.produto_nome),
 'quantidade',i.quantidade,'preco_unitario',COALESCE(pr.preco,i.preco_unitario),'subtotal',i.subtotal) ORDER BY i.id_item),'[]') AS itens
 FROM itens_pedido i LEFT JOIN produtos pr USING(id_produto) WHERE i.id_pedido=p.id_pedido) detalhe WHERE p.id_pedido=$1`,[req.params.id])
 if(!r.rows.length)falhar(404,'Pedido não encontrado')
 const {itens,...pedido}=r.rows[0];res.json({pedido,itens})
})
router.post('/pedidos',async(req,res)=>{
 const {id_cliente,itens}=req.body
 if(!Number.isSafeInteger(id_cliente)||id_cliente<1||!Array.isArray(itens)||!itens.length||itens.length>1000)falhar(400,'Informe cliente e de 1 a 1000 itens')
 const vistos=new Set()
 for(const i of itens){
 if(!Number.isSafeInteger(i?.id_produto)||i.id_produto<1||i.id_produto>2147483647||!Number.isSafeInteger(i.quantidade)||i.quantidade<1||i.quantidade>2147483647)falhar(400,'Produto ou quantidade inválidos')
 if(vistos.has(i.id_produto))falhar(409,'Produto repetido no pedido');vistos.add(i.id_produto)
 }
 const pedido=await transacao(req.usuario.id_usuario,async c=>{
 await achar(c,'SELECT id_cliente FROM clientes WHERE id_cliente=$1',[id_cliente])
 const p=await achar(c,"INSERT INTO pedidos(id_cliente,id_usuario,status,valor_total) VALUES($1,$2,'rascunho',0) RETURNING *",[id_cliente,req.usuario.id_usuario])
 let total=0
 for(const i of [...itens].sort((a,b)=>a.id_produto-b.id_produto)){
 const pr=await achar(c,'SELECT * FROM produtos WHERE ativo AND id_produto=$1 FOR UPDATE',[i.id_produto])
 const subtotal=Math.round(Number(pr.preco)*100)*i.quantidade
 total+=subtotal
 if(!Number.isSafeInteger(total)||total>9999999999)falhar(400,'Pedido ultrapassa o limite monetário')
 await c.query('INSERT INTO itens_pedido(id_pedido,id_produto,produto_nome,quantidade,preco_unitario,subtotal) VALUES($1,$2,$3,$4,$5,$6)',[p.id_pedido,i.id_produto,pr.nome,i.quantidade,pr.preco,(subtotal/100).toFixed(2)])
 await c.query('UPDATE produtos SET estoque=estoque-$1 WHERE id_produto=$2',[i.quantidade,i.id_produto])
 }
 if(total<5000)falhar(400,'O valor mínimo do pedido é R$ 50,00')
 return achar(c,'UPDATE pedidos SET valor_total=$1 WHERE id_pedido=$2 RETURNING *',[(total/100).toFixed(2),p.id_pedido])
 })
 res.status(201).json({...pedido,mensagem:'Pedido registrado'})
})
async function cancelar(c,id){
 const p=await achar(c,'SELECT * FROM pedidos WHERE id_pedido=$1 FOR UPDATE',[id])
 if(!['rascunho','confirmado'].includes(p.status))falhar(400,'Somente rascunho ou confirmado podem ser cancelados')
 const itens=await c.query('SELECT id_produto,quantidade FROM itens_pedido WHERE id_pedido=$1 ORDER BY id_produto',[id])
 for(const i of itens.rows)if(i.id_produto)await c.query('UPDATE produtos SET estoque=estoque+$1 WHERE id_produto=$2',[i.quantidade,i.id_produto])
 return achar(c,"UPDATE pedidos SET status='cancelado' WHERE id_pedido=$1 RETURNING *",[id])
}
router.put('/pedidos/:id/status',async(req,res)=>{
 const {status}=req.body
 if(status==='cancelado'&&req.usuario.perfil!=='admin')falhar(403,'Cancelamento permitido somente ao administrador')
 const p=await transacao(req.usuario.id_usuario,async c=>{
 if(status==='cancelado')return cancelar(c,req.params.id)
 const atual=await achar(c,'SELECT * FROM pedidos WHERE id_pedido=$1 FOR UPDATE',[req.params.id])
 const proximo={rascunho:'confirmado',confirmado:'pago',pago:'entregue'}
 if(!proximo[atual.status]||proximo[atual.status]!==status)falhar(400,'Transição de status não permitida')
 return achar(c,'UPDATE pedidos SET status=$1 WHERE id_pedido=$2 RETURNING *',[status,req.params.id])
 });res.json(p)
})
const cancelarRota=async(req,res)=>res.json(await transacao(req.usuario.id_usuario,c=>cancelar(c,req.params.id)))
router.delete('/pedidos/:id',somenteAdmin,cancelarRota)
router.patch('/pedidos/:id/cancelar',somenteAdmin,cancelarRota)
router.get('/auditoria',async(req,res)=>listar(req,res,'SELECT a.*,u.nome AS usuario FROM auditoria a LEFT JOIN usuarios u USING(id_usuario) ORDER BY id_auditoria DESC'))
export default router
