import pool from './database.js'
export function falhar(status, mensagem) { throw Object.assign(new Error(mensagem), { status }) }
export async function transacao(usuario, executar) {
 const c = await pool.connect()
 try {
  await c.query('BEGIN')
  // Ordem única entre alterações comerciais evita ciclos de bloqueio entre preço, pedido e estoque.
  await c.query('SELECT pg_advisory_xact_lock(735120)')
  await c.query("SELECT set_config('app.usuario_id',$1,true)",[String(usuario)])
  const resultado = await executar(c)
  await c.query('COMMIT')
  return resultado
 } catch(e) { await c.query('ROLLBACK').catch(()=>{}); throw e } finally { c.release() }
}
export function paginacao(query) {
 const page=Number(query.page ?? 1), limit=Number(query.limit ?? 10)
 if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1||limit>100||page>1000000) falhar(400,'Página ou limite inválido (limite de 1 a 100)')
 return {page,limit,offset:(page-1)*limit}
}
export function tratarErro(erro,req,res,next) {
 if(res.headersSent) return next(erro)
 const status=erro.status || (erro.code==='23505'?409:['23514','23502','22P02','22003'].includes(erro.code)?400:erro.code?.startsWith('08')||['ECONNREFUSED','ETIMEDOUT','57P01'].includes(erro.code)?503:500)
 const mensagem=erro.status?erro.message:status===409?'E-mail ou CPF/CNPJ já cadastrado':status===400?'Dados inválidos ou pedido abaixo do mínimo de R$ 50,00':status===503?'Banco indisponível. Tente novamente.':'Não foi possível concluir a operação'
 res.status(status).json({mensagem})
}
