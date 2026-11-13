const $=id=>document.getElementById(id)
const token=localStorage.getItem('token')
let usuario=null
try {usuario=JSON.parse(localStorage.getItem('usuario')||'null')} catch {}
function sair(){localStorage.removeItem('token');localStorage.removeItem('usuario');location.href='/login'}
if(!token||!usuario)sair()
const paginas={clientes:1,produtos:1,pedidos:1,auditoria:1}
const nomes={clientes:'Clientes',produtos:'Produtos',pedidos:'Pedidos',auditoria:'Auditoria'}
let produtosPedido=[],itens=[]
const moeda=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function mensagem(s){$('mensagem').textContent=s}
async function api(path,method='GET',body){
 let r;try {r=await fetch('/api'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})}catch{throw Error('Não foi possível conectar ao servidor')}
 const d=await r.json().catch(()=>null)
 if(r.status===401){sair();throw Error('Sessão expirada')}
 if(!r.ok||!d)throw Error(d?.mensagem||'Resposta inválida do servidor')
 return d
}
function executar(fn){return async e=>{try{await fn(e)}catch(erro){mensagem(erro.message)}}}
function admin(){return usuario?.perfil==='admin'}
async function painel(){const d=await api('/painel');$('totalClientes').textContent=d.clientes;$('totalProdutos').textContent=d.produtos;$('faturamento').textContent=moeda(d.faturamento)}
async function abrir(nome){
 document.querySelectorAll('.tela').forEach(t=>t.classList.toggle('escondido',t.id!==nome))
 document.querySelectorAll('[data-tela]').forEach(b=>b.classList.toggle('ativo',b.dataset.tela===nome))
 mensagem('');if(nome==='inicio')await painel();else{await carregar(nome);if(nome==='pedidos')await opcoesPedido()}
}
document.querySelectorAll('[data-tela]').forEach(b=>b.addEventListener('click',executar(()=>abrir(b.dataset.tela))))
$('btnSair').onclick=sair
function botao(acao,id,texto,classe=''){return `<button class="${classe}" data-acao="${acao}" data-id="${id}">${texto}</button>`}
async function carregar(tipo){
 let d=await api(`/${tipo}?page=${paginas[tipo]}`)
 if(!d.dados.length&&paginas[tipo]>1){paginas[tipo]=Math.max(1,d.paginas);d=await api(`/${tipo}?page=${paginas[tipo]}`)}
 $('lista'+nomes[tipo]).innerHTML=d.dados.map(r=>{
 if(tipo==='clientes')return `<tr><td>${esc(r.nome)}</td><td>${esc(r.email)}</td><td>${esc(r.telefone)}</td><td>${esc(r.cpf_cnpj)}</td><td>${botao('editarCliente',r.id_cliente,'Editar')}${admin()?botao('excluirCliente',r.id_cliente,'Excluir','btn-excluir'):''}</td></tr>`
 if(tipo==='produtos')return `<tr><td>${esc(r.nome)}</td><td>${moeda(r.preco)}</td><td>${r.estoque}</td><td>${botao('editarProduto',r.id_produto,'Editar')}${admin()?botao('desativarProduto',r.id_produto,'Desativar')+botao('excluirProduto',r.id_produto,'Excluir','btn-excluir'):''}</td></tr>`
 if(tipo==='pedidos'){
 const proximo={rascunho:['confirmado','Confirmar'],confirmado:['pago','Registrar pagamento'],pago:['entregue','Registrar entrega']}[r.status]
 return `<tr><td>${r.id_pedido}</td><td>${esc(r.cliente)}</td><td>${esc(r.usuario)}</td><td>${new Date(r.data_pedido).toLocaleDateString('pt-BR')}</td><td>${esc(r.status)}</td><td>${moeda(r.valor_total)}</td><td>${botao('detalhes',r.id_pedido,'Detalhes')}${proximo?botao('status:'+proximo[0],r.id_pedido,proximo[1]):''}${admin()&&['rascunho','confirmado'].includes(r.status)?botao('cancelar',r.id_pedido,'Cancelar','btn-excluir'):''}</td></tr>`
 }
 return `<tr><td>${new Date(r.data_hora).toLocaleString('pt-BR')}</td><td>${esc(r.usuario||'Carga inicial')}</td><td>${esc(r.acao)}</td><td><details><summary>Ver alteração</summary><pre>${esc(r.detalhe)}</pre></details></td></tr>`
 }).join('')
 const p=$('paginas'+nomes[tipo]);p.replaceChildren()
 for(const [label,delta,disabled] of [['Anterior',-1,d.page<=1],['Próxima',1,d.page>=d.paginas]]){
 const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.onclick=executar(async()=>{paginas[tipo]+=delta;await carregar(tipo)});p.append(b)
 }
 const s=document.createElement('span');s.textContent=`Página ${d.page} de ${Math.max(1,d.paginas)} — ${d.total} registros`;p.append(s)
}
function limpar(tipo){$('form'+tipo).reset();$('id'+tipo).value='';if(tipo==='Produto')$('versaoProduto').value=''}
for(const tipo of ['Cliente','Produto']){
 $('limpar'+tipo).onclick=()=>limpar(tipo)
 $('form'+tipo).addEventListener('submit',executar(async e=>{
 e.preventDefault();const id=$('id'+tipo).value
 const body=tipo==='Cliente'?{nome:$('clienteNome').value,email:$('clienteEmail').value,telefone:$('clienteTelefone').value,cpf_cnpj:$('clienteDocumento').value}:{nome:$('produtoNome').value,descricao:$('produtoDescricao').value,preco:Number($('produtoPreco').value),estoque:Number($('produtoEstoque').value),...(id?{versao:Number($('versaoProduto').value)}:{})}
 const recurso=tipo==='Cliente'?'clientes':'produtos';await api('/'+recurso+(id?'/'+id:''),id?'PUT':'POST',body);limpar(tipo);await carregar(recurso);mensagem('Cadastro salvo')
 }))
}
document.addEventListener('click',executar(async e=>{
 const b=e.target.closest('[data-acao]');if(!b)return
 const {acao,id}=b.dataset
 if(acao==='editarCliente'){
 const c=await api('/clientes/'+id);$('idCliente').value=id;for(const [campo,key]of [['Nome','nome'],['Email','email'],['Telefone','telefone'],['Documento','cpf_cnpj']])$('cliente'+campo).value=c[key]??''
 }else if(acao==='editarProduto'){
 const p=await api('/produtos/'+id);$('idProduto').value=id;$('versaoProduto').value=p.versao;for(const [campo,key]of [['Nome','nome'],['Descricao','descricao'],['Preco','preco'],['Estoque','estoque']])$('produto'+campo).value=p[key]??''
 }else if(acao==='excluirCliente'){
 if(!confirm('Excluir cliente e todos os pedidos e itens vinculados?'))return;await api('/clientes/'+id,'DELETE');await carregar('clientes');mensagem('Cliente e pedidos excluídos')
 }else if(acao==='excluirProduto'||acao==='desativarProduto'){
 if(!confirm(acao==='excluirProduto'?'Excluir definitivamente este produto?':'Desativar este produto?'))return
 await api('/produtos/'+id+(acao==='desativarProduto'?'/desativar':''),acao==='desativarProduto'?'PATCH':'DELETE');await carregar('produtos');mensagem('Operação concluída')
 }else if(acao==='detalhes'){
 const d=await api('/pedidos/'+id);$('detalhesPedido').innerHTML=`<h3>Pedido ${id} — ${esc(d.pedido.status)}</h3>`+d.itens.map(i=>`<p>${esc(i.produto)} — ${i.quantidade} × preço atual ${moeda(i.preco_unitario)} — subtotal ${moeda(i.subtotal)}</p>`).join('')+`<strong>Total: ${moeda(d.pedido.valor_total)}</strong>`
 }else if(acao==='cancelar'||acao.startsWith('status:')){
 if(!confirm(acao==='cancelar'?'Cancelar pedido e devolver estoque?':'Alterar status do pedido?'))return
 await api('/pedidos/'+id+(acao==='cancelar'?'':'/status'),acao==='cancelar'?'DELETE':'PUT',acao==='cancelar'?undefined:{status:acao.split(':')[1]});await carregar('pedidos');await opcoesPedido();$('detalhesPedido').replaceChildren();mensagem('Pedido atualizado')
 }else if(acao==='remover') {itens.splice(Number(id),1);renderItens()}
}))
async function todas(tipo){const dados=[];let page=1,d;do{d=await api(`/${tipo}?page=${page++}&limit=100`);dados.push(...d.dados)}while(page<=d.paginas);return dados}
async function opcoesPedido(){
 const [clientes,produtos]=await Promise.all([todas('clientes'),todas('produtos')]);produtosPedido=produtos
 for(const [campo,lista,key,label]of [['pedidoCliente',clientes,'id_cliente',c=>c.nome],['pedidoProduto',produtos,'id_produto',p=>`${p.nome} — ${moeda(p.preco)} — estoque ${p.estoque}`]]){
 const atual=$(campo).value;$(campo).innerHTML='<option value="">Selecione</option>'+lista.map(i=>`<option value="${i[key]}">${esc(label(i))}</option>`).join('');$(campo).value=atual
 }
}
function renderItens(){
 $('itensSelecionados').innerHTML=itens.map((i,k)=>`<li>${esc(i.nome)} — ${i.quantidade} ${botao('remover',k,'Remover')}</li>`).join('')
 $('totalPedido').textContent='Total estimado: '+moeda(itens.reduce((s,i)=>s+Math.round(Number(i.preco)*100)*i.quantidade,0)/100)+' (mínimo R$ 50,00)'
}
$('adicionarItem').onclick=executar(async()=>{
 const id=Number($('pedidoProduto').value),quantidade=Number($('pedidoQuantidade').value),p=produtosPedido.find(i=>i.id_produto===id)
 if(!p||!Number.isInteger(quantidade)||quantidade<1)throw Error('Selecione produto e quantidade inteira positiva')
 if(itens.some(i=>i.id_produto===id))throw Error('Produto já incluído. Remova o item para alterar a quantidade.')
 itens.push({...p,id_produto:id,quantidade});renderItens()
})
$('formPedido').addEventListener('submit',executar(async e=>{
 e.preventDefault();const r=await api('/pedidos','POST',{id_cliente:Number($('pedidoCliente').value),itens:itens.map(i=>({id_produto:i.id_produto,quantidade:i.quantidade}))})
 itens=[];renderItens();$('formPedido').reset();await carregar('pedidos');await opcoesPedido();mensagem('Pedido '+r.id_pedido+' registrado — '+moeda(r.valor_total))
}))
if(token&&usuario)executar(async()=>{usuario=await api('/me');$('nomeUsuario').textContent='Usuário: '+usuario.nome;await abrir('inicio')})()
