import 'dotenv/config'
import pool from '../src/database.js'
import {readFile} from 'node:fs/promises'
const c=await pool.connect()
try {
 const existe=(await c.query("SELECT to_regclass('public.usuarios') AS tabela")).rows[0].tabela
 if(!existe)await c.query(await readFile('database/sql.sql','utf8'))
 else {await c.query('BEGIN');await c.query(await readFile('database/migracao.sql','utf8'));await c.query('COMMIT')}
 console.log('Banco atualizado com sucesso')
} catch(e){await c.query('ROLLBACK');console.error('Migração cancelada; confira cadastros incompletos, e-mails repetidos e preços inválidos:',e.message);process.exitCode=1}
finally{c.release();await pool.end()}
