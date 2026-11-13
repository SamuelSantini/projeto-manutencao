import 'dotenv/config'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import net from 'node:net'
import https from 'node:https'
import bcrypt from 'bcryptjs'
import { chromium } from 'playwright'

const esquemaLegado = "\nCREATE EXTENSION IF NOT EXISTS pgcrypto;\n\nCREATE TABLE usuarios (\n    id_usuario SERIAL PRIMARY KEY,\n    nome VARCHAR(100) NOT NULL,\n    email VARCHAR(150) NOT NULL UNIQUE,\n    senha_hash TEXT NOT NULL,\n    perfil VARCHAR(20) NOT NULL DEFAULT 'funcionario'\n        CHECK (perfil IN ('admin', 'funcionario')),\n    ativo BOOLEAN DEFAULT TRUE\n);\n\nCREATE TABLE clientes (\n    id_cliente SERIAL PRIMARY KEY,\n    nome VARCHAR(120) NOT NULL,\n    email VARCHAR(150),\n    telefone VARCHAR(20),\n    cpf_cnpj VARCHAR(20) UNIQUE,\n    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE produtos (\n    id_produto SERIAL PRIMARY KEY,\n    nome VARCHAR(120) NOT NULL,\n    descricao TEXT,\n    preco NUMERIC(10,2) NOT NULL CHECK (preco >= 0),\n    estoque INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0),\n    ativo BOOLEAN DEFAULT TRUE\n);\n\nCREATE TABLE pedidos (\n    id_pedido SERIAL PRIMARY KEY,\n    id_cliente INTEGER NOT NULL,\n    id_usuario INTEGER NOT NULL,\n    data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    status VARCHAR(20) DEFAULT 'aberto'\n        CHECK (status IN ('aberto', 'pago', 'cancelado')),\n    valor_total NUMERIC(10,2) DEFAULT 0,\n    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),\n    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)\n);\n\nCREATE TABLE itens_pedido (\n    id_item SERIAL PRIMARY KEY,\n    id_pedido INTEGER NOT NULL,\n    id_produto INTEGER NOT NULL,\n    quantidade INTEGER NOT NULL CHECK (quantidade > 0),\n    preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),\n    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),\n    FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido) ON DELETE CASCADE,\n    FOREIGN KEY (id_produto) REFERENCES produtos(id_produto),\n    UNIQUE (id_pedido, id_produto)\n);\n\nINSERT INTO usuarios (nome, email, senha_hash, perfil)\nVALUES\n(\n    'Administrador',\n    'admin@comercial.com',\n    crypt('Admin123!', gen_salt('bf', 10)),\n    'admin'\n),\n(\n    'Carlos Silva',\n    'carlos@comercial.com',\n    crypt('123456', gen_salt('bf', 10)),\n    'funcionario'\n);\n\nINSERT INTO clientes (nome, email, telefone, cpf_cnpj)\nVALUES\n('Jo\u00e3o Pereira', 'joao@email.com', '48999990001', '11111111111'),\n('Maria Oliveira', 'maria@email.com', '48999990002', '22222222222'),\n('Pedro Santos', 'pedro@email.com', '48999990003', '33333333333'),\n('Ana Costa', 'ana@email.com', '48999990004', '44444444444');\n\nINSERT INTO produtos (nome, descricao, preco, estoque)\nVALUES\n('Notebook', 'Notebook para uso profissional', 3500.00, 15),\n('Mouse', 'Mouse USB', 80.00, 50),\n('Teclado', 'Teclado USB', 120.00, 30),\n('Monitor', 'Monitor 24 polegadas', 950.00, 12),\n('Headset', 'Headset com microfone', 180.00, 25),\n('Webcam', 'Webcam Full HD', 250.00, 18);\n\nINSERT INTO pedidos (id_cliente, id_usuario, status, valor_total)\nVALUES\n(1, 1, 'pago', 3580.00),\n(2, 2, 'aberto', 300.00),\n(3, 1, 'pago', 950.00);\n\nINSERT INTO itens_pedido\n(id_pedido, id_produto, quantidade, preco_unitario, subtotal)\nVALUES\n(1, 1, 1, 3500.00, 3500.00),\n(1, 2, 1, 80.00, 80.00),\n(2, 3, 1, 120.00, 120.00),\n(2, 5, 1, 180.00, 180.00),\n(3, 4, 1, 950.00, 950.00);\n\nSELECT * FROM usuarios;\nSELECT * FROM clientes;\nSELECT * FROM produtos;\nSELECT * FROM pedidos;\nSELECT * FROM itens_pedido;\n"

const configuration = {
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, connectionTimeoutMillis: 5000
}
const name = `auditoria_teste_${randomUUID().replaceAll('-', '')}`
const secret = randomUUID()
const admin = new pg.Client(configuration)
let database, server, created = false, base, adminToken, employeeToken
const results = []
const evidence = {}
const report = { date: new Date().toISOString(), originalDatabase: configuration.database,
    testDatabase: name, results, evidence, cleanup: false }
const query = (text, values) => database.query(text, values)
async function check(name, fn) {
    try {
        const detail = await fn()
        results.push({ name, passed: true, kind: 'conformance', detail: detail ?? null })
        console.log(`PASS ${name}`)
    } catch (error) {
        results.push({ name, passed: false, detail: error.message })
        console.log(`FAIL ${name}: ${error.message}`)
    }
}
function http(path,{method='GET',body,token=adminToken,raw}={}){
 return new Promise((resolve,reject)=>{
 const payload=raw??(body===undefined?undefined:JSON.stringify(body))
 const req=https.request(base+path,{method,rejectUnauthorized:false,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(payload?{'Content-Type':'application/json'}:{})}},res=>{
 let text='';res.on('data',d=>text+=d);res.on('end',()=>{let data;try{data=JSON.parse(text)}catch{data=text}resolve({status:res.statusCode,data,headers:res.headers})})
 });req.setTimeout(8000,()=>req.destroy(new Error('Timeout')));req.on('error',reject);req.end(payload)
 })
}
async function request(path,options){return http('/api'+path,options)}
async function expect(path, options, status) {
    const result = await request(path, options)
    assert.equal(result.status, status, `${path}: ${JSON.stringify(result.data)}`)
    return result.data
}
async function freePort() {
    const socket = net.createServer()
    await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
    const port = socket.address().port
    await new Promise(resolve => socket.close(resolve))
    return port
}
async function startServer(overrides = {}) {
    const port = await freePort()
    const child = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), windowsHide: true,
        env: { ...process.env, DB_NAME: name, JWT_SECRET: secret, PORT: String(port), ...overrides },
        stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    const closed = new Promise(resolve => child.once('close', code => resolve({ code, output })))
    const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server startup timeout')), 12000)
        child.stdout.on('data', () => { if (output.includes('Servidor rodando')) { clearTimeout(timer); resolve() } })
        child.once('error', error => { clearTimeout(timer); reject(error) })
        child.once('close', () => { clearTimeout(timer); reject(new Error(`Server startup failed: ${output}`)) })
    })
    return { child, port, closed, ready, output: () => output }
}
async function snapshot() {
    return (await query(`SELECT
        (SELECT count(*)::int FROM pedidos) AS pedidos,
        (SELECT count(*)::int FROM itens_pedido) AS itens,
        (SELECT json_agg(json_build_array(id_produto, estoque) ORDER BY id_produto) FROM produtos) AS estoque`)).rows[0]
}
try {
 await admin.connect()
 report.postgres=(await admin.query('SELECT version() AS version')).rows[0].version
 assert.match(name,/^auditoria_teste_[a-f0-9]{32}$/)
 await admin.query(`CREATE DATABASE "${name}"`);created=true
 database=new pg.Client({...configuration,database:name});await database.connect()
 await query(await readFile('database/sql.sql','utf8'))
 server=await startServer();await server.ready;base=`https://127.0.0.1:${server.port}`
 const client={nome:'Cliente teste',email:'teste@example.com',cpf_cnpj:'12345678901',telefone:'11999999999'}
 const product={nome:'Produto teste',descricao:'Teste',preco:50,estoque:1}
 let cid,pid,oid
 const criarPedido=async(id=pid,quantidade=1)=>expect('/pedidos',{method:'POST',body:{id_cliente:cid,itens:[{id_produto:id,quantidade}]}},201)
 await check('RNF07: HTTPS, login público e status',async()=>{
 assert.equal((await http('/login',{token:null})).status,200);assert.equal((await http('/login.html',{token:null})).status,200);await expect('/status',{token:null},200)
 })
 await check('RF01: contas originais e JWT de duas horas',async()=>{
 const a=await expect('/login',{method:'POST',token:null,body:{email:'admin@comercial.com',senha:'admin123'}},200);adminToken=a.token
 const p=jwt.verify(a.token,secret);assert.equal(p.exp-p.iat,7200)
 employeeToken=(await expect('/login',{method:'POST',token:null,body:{email:'funcionario@comercial.com',senha:'func123'}},200)).token
 })
 await check('RF01: erro genérico e usuário inativo revogado',async()=>{
 const a=await expect('/login',{method:'POST',body:{email:'admin@comercial.com',senha:'errada'}},401)
 const b=await expect('/login',{method:'POST',body:{email:'naoexiste@example.com',senha:'errada'}},401);assert.equal(a.mensagem,b.mensagem)
 await query('UPDATE usuarios SET ativo=false WHERE id_usuario=2')
 try {await expect('/clientes',{token:employeeToken},401);await expect('/login',{method:'POST',body:{email:'funcionario@comercial.com',senha:'func123'}},401)}finally{await query('UPDATE usuarios SET ativo=true WHERE id_usuario=2')}
 })
 await check('JWT ausente, inválido e expirado',async()=>{for(const token of [null,'x',jwt.sign({id_usuario:1},secret,{expiresIn:-1})])await expect('/clientes',{token},401)})
 await check('Autenticação exigida em todos os recursos comerciais',async()=>{
 for(const [method,path]of [['GET','/painel'],['GET','/clientes'],['POST','/clientes'],['GET','/produtos'],['POST','/produtos'],['GET','/pedidos'],['POST','/pedidos'],['GET','/auditoria'],['PUT','/pedidos/1/status'],['PATCH','/produtos/1/desativar']])await expect(path,{method,token:null,...(['POST','PUT'].includes(method)?{body:{}}:{})},401)
 })
 await check('RF02/RN01: funcionário impedido de excluir/desativar/cancelar',async()=>{
 for(const [method,path]of [['DELETE','/clientes/1'],['DELETE','/produtos/1'],['PATCH','/produtos/1/desativar'],['DELETE','/pedidos/2'],['PUT','/pedidos/2/status']])await expect(path,{method,token:employeeToken,...(method==='PUT'?{body:{status:'cancelado'}}:{})},403)
 })
 await check('RF03/RN02: cadastro obrigatório e persistente',async()=>{
 for(const body of [{nome:'Ana'},{...client,email:''},{...client,cpf_cnpj:''},{...client,cpf_cnpj:'123'},{...client,email:'invalido'}])await expect('/clientes',{method:'POST',body},400)
 cid=(await expect('/clientes',{method:'POST',body:client,token:employeeToken},201)).id_cliente
 assert.equal((await query('SELECT email FROM clientes WHERE id_cliente=$1',[cid])).rows[0].email,client.email)
 })
 await check('RF03: e-mail normalizado e documento únicos retornam 409',async()=>{
 await expect('/clientes',{method:'POST',body:{...client,email:client.email.toUpperCase(),cpf_cnpj:'99999999999'}},409)
 await expect('/clientes',{method:'POST',body:{...client,email:'outro@example.com'}},409)
 })
 await check('RF04: consulta individual e edição dos quatro campos',async()=>{
 const d={...client,nome:'Editado',telefone:'1234'};await expect('/clientes/'+cid,{method:'PUT',body:d,token:employeeToken},200)
 const c=await expect('/clientes/'+cid,{},200);assert.equal(c.nome,d.nome);assert.equal(c.telefone,'1234');assert.equal(c.cpf_cnpj,client.cpf_cnpj)
 })
 await check('RF06: preço com centavos, produto ativo e versão',async()=>{
 for(const preco of [0,-1,0.001,1.001])await expect('/produtos',{method:'POST',body:{...product,preco}},400)
 const p=await expect('/produtos',{method:'POST',body:product,token:employeeToken},201);pid=p.id_produto;assert.equal(p.versao,1)
 })
 await check('RF08/RN04: mínimo R$ 50 e produto duplicado',async()=>{
 const p=await expect('/produtos',{method:'POST',body:{...product,preco:25}},201)
 const before=await snapshot()
 await expect('/pedidos',{method:'POST',body:{id_cliente:cid,itens:[{id_produto:p.id_produto,quantidade:1}]}},400)
 assert.deepEqual(await snapshot(),before)
 await expect('/pedidos',{method:'POST',body:{id_cliente:cid,itens:[{id_produto:pid,quantidade:1},{id_produto:pid,quantidade:1}]}},409)
 })
 await check('RN04: cliente inexistente e quantidades inválidas',async()=>{
 for(const itens of [[],[null],[{id_produto:pid,quantidade:0}],[{id_produto:pid,quantidade:1.5}]])await expect('/pedidos',{method:'POST',body:{id_cliente:cid,itens}},400)
 await expect('/pedidos',{method:'POST',body:{id_cliente:2147483647,itens:[{id_produto:pid,quantidade:1}]}},404)
 })
 await check('RN05/RNF08: venda descoberta transacional',async()=>{
 const p=await criarPedido(pid,3);oid=p.id_pedido;assert.equal(p.status,'rascunho');assert.equal(p.valor_total,'150.00')
 assert.equal((await query('SELECT estoque FROM produtos WHERE id_produto=$1',[pid])).rows[0].estoque,-2)
 const d=await expect('/pedidos/'+oid,{},200);assert.equal(d.itens.length,1);assert.equal(d.itens[0].quantidade,3)
 })
 await check('RNF08: falha após primeiro item desfaz pedido, itens, estoque e auditoria',async()=>{
 const before=await snapshot();const n=(await query('SELECT count(*) FROM auditoria')).rows[0].count
 await expect('/pedidos',{method:'POST',body:{id_cliente:cid,itens:[{id_produto:pid,quantidade:1},{id_produto:2147483647,quantidade:1}]}},404)
 assert.deepEqual(await snapshot(),before);assert.equal((await query('SELECT count(*) FROM auditoria')).rows[0].count,n)
 })
 await check('RF08: transições sequenciais e impedimento de saltos',async()=>{
 await expect('/pedidos/'+oid+'/status',{method:'PUT',body:{status:'pago'}},400)
 for(const status of ['confirmado','pago','entregue'])assert.equal((await expect('/pedidos/'+oid+'/status',{method:'PUT',token:employeeToken,body:{status}},200)).status,status)
 await expect('/pedidos/'+oid+'/status',{method:'PUT',body:{status:'rascunho'}},400)
 })
 await check('RN06: pago/entregue não cancelam nem alteram estoque',async()=>{
 const before=await snapshot();await expect('/pedidos/'+oid,{method:'DELETE'},400);await expect('/pedidos/1',{method:'DELETE'},400);assert.deepEqual(await snapshot(),before)
 })
 await check('RN06: rascunho e confirmado devolvem estoque uma vez',async()=>{
 for(const confirmar of [false,true]){
 const p=await criarPedido();if(confirmar)await expect('/pedidos/'+p.id_pedido+'/status',{method:'PUT',body:{status:'confirmado'}},200)
 const before=(await query('SELECT estoque FROM produtos WHERE id_produto=$1',[pid])).rows[0].estoque
 await expect('/pedidos/'+p.id_pedido,{method:'DELETE'},200);await expect('/pedidos/'+p.id_pedido,{method:'DELETE'},400)
 assert.equal((await query('SELECT estoque FROM produtos WHERE id_produto=$1',[pid])).rows[0].estoque,before+1)
 }
 })
 await check('Concorrência: duas vendas e cancelamentos sem perda ou dupla devolução',async()=>{
 const initial=(await query('SELECT estoque FROM produtos WHERE id_produto=$1',[pid])).rows[0].estoque
 const orders=await Promise.all([criarPedido(),criarPedido()])
 assert.equal((await query('SELECT estoque FROM produtos WHERE id_produto=$1',[pid])).rows[0].estoque,initial-2)
 const path='/pedidos/'+orders[0].id_pedido
 const r=await Promise.all([request(path,{method:'DELETE'}),request(path,{method:'DELETE'})]);assert.deepEqual(r.map(x=>x.status).sort(),[200,400])
 })
 await check('Preço: recalcular não entregues e preservar subtotal entregue',async()=>{
 const p=await criarPedido();const before=(await expect('/pedidos/'+oid,{},200)).pedido.valor_total
 const pr=await expect('/produtos/'+pid,{},200)
 await expect('/produtos/'+pid,{method:'PUT',body:{...pr,preco:60}},200)
 const pendente=await expect('/pedidos/'+p.id_pedido,{},200);assert.equal(Number(pendente.pedido.valor_total),60)
 const entregue=await expect('/pedidos/'+oid,{},200);assert.equal(entregue.pedido.valor_total,before);assert.equal(Number(entregue.itens[0].preco_unitario),60)
 })
 await check('Preço: redução que viola mínimo é revertida com auditoria',async()=>{
 const pr=await expect('/produtos/'+pid,{},200)
 await expect('/produtos/'+pid,{method:'PUT',body:{...pr,preco:1}},400)
 assert.equal((await expect('/produtos/'+pid,{},200)).preco,pr.preco)
 })
 await check('Estoque: formulário antigo retorna 409 e preserva baixa',async()=>{
 const pr=await expect('/produtos/'+pid,{},200);await criarPedido()
 await expect('/produtos/'+pid,{method:'PUT',body:{...pr,preco:Number(pr.preco)}},409)
 assert.equal((await expect('/produtos/'+pid,{},200)).estoque,pr.estoque-1)
 })
 await check('RN03: inativo não lista, não edita e não vende',async()=>{
 const p=await expect('/produtos',{method:'POST',body:product},201);await expect('/produtos/'+p.id_produto+'/desativar',{method:'PATCH'},200)
 assert.ok(!(await expect('/produtos?limit=100',{},200)).dados.some(x=>x.id_produto===p.id_produto))
 await expect('/produtos/'+p.id_produto,{},404);await expect('/produtos/'+p.id_produto,{method:'PUT',body:{...p,preco:50}},404)
 await expect('/pedidos',{method:'POST',body:{id_cliente:cid,itens:[{id_produto:p.id_produto,quantidade:1}]}},404)
 })
 await check('RF07: produto apagado definitivamente preserva detalhe da venda',async()=>{
 const p=await expect('/produtos',{method:'POST',body:product},201);const o=await criarPedido(p.id_produto)
 await expect('/produtos/'+p.id_produto,{method:'DELETE'},200)
 assert.equal((await query('SELECT 1 FROM produtos WHERE id_produto=$1',[p.id_produto])).rowCount,0)
 const d=await expect('/pedidos/'+o.id_pedido,{},200);assert.equal(d.itens.length,1);assert.equal(d.itens[0].produto,p.nome)
 await expect('/produtos/'+p.id_produto,{},404)
 })
 await check('RF05: exclusão de cliente remove pedidos e itens em cascata',async()=>{
 const c=await expect('/clientes',{method:'POST',body:{...client,email:'cascade@example.com',cpf_cnpj:'55555555555'}},201)
 const p=await expect('/pedidos',{method:'POST',body:{id_cliente:c.id_cliente,itens:[{id_produto:pid,quantidade:1}]}},201)
 await expect('/clientes/'+c.id_cliente,{method:'DELETE'},200)
 assert.equal((await query('SELECT 1 FROM pedidos WHERE id_pedido=$1',[p.id_pedido])).rowCount,0)
 assert.equal((await query('SELECT 1 FROM itens_pedido WHERE id_pedido=$1',[p.id_pedido])).rowCount,0)
 })
 await check('RNF04: paginação de clientes, produtos e pedidos com limites válidos',async()=>{
 for(let i=0;i<8;i++)await expect('/clientes',{method:'POST',body:{nome:'Página '+i,email:'pagina'+i+'@example.com',cpf_cnpj:String(80000000000+i)}},201)
 for(const recurso of ['clientes','produtos','pedidos','auditoria']){
 const d=await expect('/'+recurso+'?page=1&limit=1',{},200);assert.equal(d.dados.length,1);assert.equal(d.limit,1);assert.ok(d.total>1)
 const b=await expect('/'+recurso+'?page=2&limit=1',{},200);assert.notDeepEqual(d.dados,b.dados)
 await expect('/'+recurso+'?limit=0',{},400)
 }
 assert.equal((await expect('/clientes',{},200)).dados.length,10)
 })
 await check('RNF06: auditoria de inserção/alteração/exclusão com usuário e sem senha',async()=>{
 const rows=(await query('SELECT * FROM auditoria WHERE id_usuario IS NOT NULL')).rows
 for(const action of ['clientes:INSERT','clientes:UPDATE','clientes:DELETE','produtos:INSERT','produtos:UPDATE','produtos:DELETE','pedidos:INSERT','pedidos:UPDATE','pedidos:DELETE','itens_pedido:INSERT','itens_pedido:DELETE'])assert.ok(rows.some(r=>r.acao===action),action)
 assert.ok(rows.every(r=>r.data_hora&&!r.detalhe.includes('senha_hash')))
 assert.ok(rows.some(r=>r.acao==='clientes:UPDATE'&&r.id_usuario===2))
 assert.ok((await expect('/auditoria',{},200)).total>0)
 })
 await check('Painel: contagens e faturamento mensal conferidos no banco',async()=>{
 const d=await expect('/painel',{},200)
 assert.equal(d.clientes,Number((await query('SELECT count(*) FROM clientes')).rows[0].count))
 assert.equal(d.produtos,Number((await query('SELECT count(*) FROM produtos WHERE ativo AND estoque>0')).rows[0].count))
 const total=(await query("SELECT COALESCE(sum(valor_total),0) AS total FROM pedidos WHERE status IN('pago','entregue') AND data_pedido>=date_trunc('month',CURRENT_TIMESTAMP) AND data_pedido<date_trunc('month',CURRENT_TIMESTAMP)+interval '1 month'")).rows[0].total
 assert.equal(Number(d.faturamento),Number(total))
 })
 await check('Migração é reaplicável sem perda dos registros',async()=>{
 const before=await snapshot();await query('BEGIN');try{await query(await readFile('database/migracao.sql','utf8'));await query('COMMIT')}catch(e){await query('ROLLBACK');throw e};assert.deepEqual(await snapshot(),before)
 })
 await check('Migração de esquema legado preserva dados, credenciais e converte aberto',async()=>{
 await query('BEGIN')
 try {
 await query('CREATE SCHEMA legado_teste');await query('SET LOCAL search_path TO legado_teste,public')
 await query(esquemaLegado)
 const antes=(await query('SELECT senha_hash FROM usuarios ORDER BY id_usuario')).rows
 await query(await readFile('database/migracao.sql','utf8'))
 assert.equal((await query('SELECT count(*) FROM clientes')).rows[0].count,'4')
 assert.equal((await query('SELECT status FROM pedidos WHERE id_pedido=2')).rows[0].status,'rascunho')
 assert.deepEqual((await query('SELECT senha_hash FROM usuarios ORDER BY id_usuario')).rows,antes)
 assert.equal((await query('SELECT count(*) FROM itens_pedido WHERE produto_nome IS NOT NULL')).rows[0].count,'5')
 } finally {await query('ROLLBACK')}
 })
 await check('Migração de dados incompatíveis falha sem alterar banco',async()=>{
 await query('BEGIN')
 try {
 await query('CREATE SCHEMA legado_invalido');await query('SET LOCAL search_path TO legado_invalido,public')
 await query(esquemaLegado)
 await query("UPDATE clientes SET email=NULL WHERE id_cliente=1")
 await assert.rejects(query(await readFile('database/migracao.sql','utf8')))
 } finally {await query('ROLLBACK')}
 assert.equal((await query("SELECT count(*) FROM information_schema.schemata WHERE schema_name='legado_invalido'")).rows[0].count,'0')
 })
 await check('RNF02: bcrypt custo 12, upgrade legado e alteração de perfil',async()=>{
 assert.equal(bcrypt.getRounds((await query('SELECT senha_hash FROM usuarios WHERE id_usuario=1')).rows[0].senha_hash),12)
 const hash=await bcrypt.hash('Senha antiga 123!',10)
 const id=(await query("INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES('Legado','legado@example.com',$1,'funcionario') RETURNING id_usuario",[hash])).rows[0].id_usuario
 await expect('/login',{method:'POST',body:{email:'legado@example.com',senha:'errada'}},401);assert.equal((await query('SELECT senha_hash FROM usuarios WHERE id_usuario=$1',[id])).rows[0].senha_hash,hash)
 await expect('/login',{method:'POST',body:{email:'legado@example.com',senha:'Senha antiga 123!'}},200);assert.equal(bcrypt.getRounds((await query('SELECT senha_hash FROM usuarios WHERE id_usuario=$1',[id])).rows[0].senha_hash),12)
 await query("UPDATE usuarios SET perfil='funcionario' WHERE id_usuario=1");try{await expect('/produtos/1',{method:'DELETE'},403)}finally{await query("UPDATE usuarios SET perfil='admin' WHERE id_usuario=1")}
 })
 await check('Erros: JSON inválido, ID inválido e rota inexistente',async()=>{await expect('/clientes',{method:'POST',raw:'{bad'},400);await expect('/clientes/abc',{},400);await expect('/inexistente',{},404)})
 await check('Navegador: login, painel, cadastro, paginação, produto, pedido e auditoria',async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 try {
 const page=await browser.newPage({ignoreHTTPSErrors:true});const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/login');await page.locator('#email').fill('admin@comercial.com');await page.locator('#senha').fill('admin123');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/index.html')
 await page.waitForFunction(()=>document.getElementById('totalClientes').textContent!=='—')
 await page.getByRole('button',{name:'Clientes',exact:true}).click();await page.getByRole('button',{name:'Próxima',exact:true}).waitFor();await page.getByRole('button',{name:'Próxima',exact:true}).click();await page.waitForFunction(()=>document.getElementById('paginasClientes').textContent.includes('Página 2'))
 await page.locator('#clienteNome').fill('Navegador');await page.locator('#clienteEmail').fill('browser@example.com');await page.locator('#clienteDocumento').fill('77777777777');await page.getByRole('button',{name:'Salvar cliente',exact:true}).click();await page.waitForFunction(()=>document.getElementById('mensagem').textContent==='Cadastro salvo')
 await page.getByRole('button',{name:'Produtos',exact:true}).click();await page.locator('#produtoNome').fill('Produto navegador');await page.locator('#produtoPreco').fill('80');await page.locator('#produtoEstoque').fill('-1');await page.getByRole('button',{name:'Salvar produto',exact:true}).click();await page.waitForFunction(()=>document.getElementById('mensagem').textContent==='Cadastro salvo')
 await page.getByRole('button',{name:'Pedidos',exact:true}).click();await page.locator('#pedidoCliente option').filter({hasText:'Navegador'}).waitFor({state:'attached'})
 await page.locator('#pedidoCliente').selectOption({label:'Navegador'});const option=page.locator('#pedidoProduto option').filter({hasText:'Produto navegador'});const value=await option.getAttribute('value');await page.locator('#pedidoProduto').selectOption(value);await page.getByRole('button',{name:'Adicionar',exact:true}).click();await page.getByRole('button',{name:'Registrar pedido',exact:true}).click();await page.waitForFunction(()=>document.getElementById('mensagem').textContent.includes('registrado'))
 page.on('dialog',dialog=>dialog.accept());await page.locator('#listaPedidos tr').first().getByRole('button',{name:'Confirmar',exact:true}).click();await page.waitForFunction(()=>document.getElementById('mensagem').textContent==='Pedido atualizado')
 await page.getByRole('button',{name:'Auditoria',exact:true}).click();await page.locator('#listaAuditoria tr').first().waitFor();assert.deepEqual(errors,[])
 } finally {await browser.close()}
 })
 await check('Navegador: funcionário não vê excluir, desativar ou cancelar',async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 try {
 const page=await browser.newPage({ignoreHTTPSErrors:true})
 await page.goto(base+'/login');await page.locator('#email').fill('funcionario@comercial.com');await page.locator('#senha').fill('func123');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/index.html')
 for(const nome of ['Clientes','Produtos','Pedidos']){
 await page.getByRole('button',{name:nome,exact:true}).click();await page.locator('#lista'+nome+' tr').first().waitFor()
 assert.equal(await page.locator('#lista'+nome).getByRole('button',{name:/^(Excluir|Desativar|Cancelar)$/}).count(),0)
 }
 }finally{await browser.close()}
 })
 await check('RNF03: porta padrão 8080 e servidor recusa configuração inválida',async()=>{
 const padrao=await startServer({PORT:''})
 try {
 await padrao.ready
 const anterior=base
 try {base='https://127.0.0.1:8080';await expect('/status',{token:null},200)}finally{base=anterior}
 }finally{padrao.child.kill();await padrao.closed}
 for(const overrides of [{JWT_SECRET:''},{DB_PORT:String(await freePort())},{TLS_KEY:'certificado-inexistente.pem'}]){
 const child=await startServer(overrides);await assert.rejects(child.ready);assert.notEqual((await child.closed).code,0)
 }
 })
 await check('Invariantes finais: total mínimo, itens e autoria persistidos',async()=>{
 const invalidos=await query('SELECT p.id_pedido FROM pedidos p LEFT JOIN itens_pedido i USING(id_pedido) GROUP BY p.id_pedido HAVING sum(i.subtotal) IS NULL OR sum(i.subtotal)<50 OR sum(i.subtotal)<>p.valor_total')
 assert.equal(invalidos.rowCount,0)
 assert.equal((await query('SELECT 1 FROM produtos WHERE preco<=0')).rowCount,0)
 })
 await check('RNF01: dados persistem após reinício real da aplicação',async()=>{
 server.child.kill();await server.closed
 server=await startServer();await server.ready;base=`https://127.0.0.1:${server.port}`
 const c=await expect('/clientes/'+cid,{},200);assert.equal(c.email,client.email)
 const p=await expect('/pedidos/'+oid,{},200);assert.equal(p.pedido.status,'entregue')
 })
 await check('Proteção contra tentativas excessivas de login',async()=>{
 let limited=false;for(let i=0;i<21;i++){const r=await request('/login',{method:'POST',body:{}});if(r.status===429){assert.ok(Number(r.headers['retry-after'])>0);limited=true;break}assert.equal(r.status,400)}assert.equal(limited,true)
 })
} catch (error) {
    report.fatal = error.message
    console.error(error.message)
    process.exitCode = 1
} finally {
    try {
        if (server) {
            server.child.kill()
            await server.closed
        }
        if (database) await database.end()
        if (created) {
            assert.match(name,/^auditoria_teste_[a-f0-9]{32}$/)
            await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
            report.cleanup = true
        }
    } catch (error) { report.cleanupError = error.message; process.exitCode = 1 }
    await admin.end().catch(() => {})
    report.passed = results.filter(r=>r.passed).length
    report.failed = results.filter(r=>!r.passed).length
    report.finishedAt = new Date().toISOString()
    if (report.failed) process.exitCode = 1
    console.log(`Results: ${report.passed} passed, ${report.failed} failed; temporary database removed: ${report.cleanup}`)
}
