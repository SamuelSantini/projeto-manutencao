import express from 'express'
import 'dotenv/config'
import https from 'node:https'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pool from './database.js'
import routes from './routes.js'
import { tratarErro } from './operacoes.js'

const raiz=fileURLToPath(new URL('../',import.meta.url))
const app=express()
app.disable('x-powered-by')
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','same-origin');res.set('X-Frame-Options','DENY');next()})
app.use(express.json({limit:'256kb'}))
app.get('/login',(req,res)=>res.sendFile(raiz+'public/login.html'))
app.use(express.static(raiz+'public'))
app.use('/api',routes)
app.use('/api',(req,res)=>res.status(404).json({mensagem:'Rota não encontrada'}))
app.use((erro,req,res,next)=>{
 if(erro.type==='entity.too.large')return res.status(413).json({mensagem:'Requisição muito grande'})
 if(erro.type==='entity.parse.failed')return res.status(400).json({mensagem:'JSON inválido'})
 tratarErro(erro,req,res,next)
})
try {
 if(!process.env.JWT_SECRET?.trim())throw new Error('Configure JWT_SECRET no .env')
 const key=readFileSync(process.env.TLS_KEY || raiz+'certs/localhost-key.pem')
 const cert=readFileSync(process.env.TLS_CERT || raiz+'certs/localhost.pem')
 await pool.query('SELECT NOW()')
 https.createServer({key,cert,minVersion:'TLSv1.2'},app).listen(process.env.PORT || 8080,()=>console.log('Servidor rodando com HTTPS na porta '+(process.env.PORT || 8080)))
 .on('error',async erro=>{console.error('Erro ao iniciar servidor:',erro.message);process.exitCode=1;await pool.end()})
} catch(erro){console.error('Falha na partida. Verifique DB_*, JWT_SECRET e certificados TLS:',erro.message);process.exitCode=1;await pool.end()}
