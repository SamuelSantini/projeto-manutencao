
import express from 'express'
import dotenv from 'dotenv'
import pool from './database.js'
import routes from './routes.js'

dotenv.config()

const app = express()

app.use(express.json())
app.use(express.static('public'))

app.use('/api', routes)

app.get('/api/status', (req, res) => {
    res.json({
        mensagem: 'Sistema Comercial funcionando'
    })
})

const PORT = process.env.PORT || 3000

pool.query('SELECT NOW()')
    .then(() => {
        console.log('Banco de dados conectado')

        app.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`)
        })
    })
    .catch((erro) => {
        console.error('Erro ao conectar ao banco:', erro.message)
    })
