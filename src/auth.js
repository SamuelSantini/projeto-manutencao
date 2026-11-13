
import jwt from 'jsonwebtoken'
import pool from './database.js'

async function autenticar(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1]

    if (!token) {
        return res.status(401).json({
            mensagem: 'Token não informado'
        })
    }

    let payload
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
        if (!Number.isSafeInteger(payload.id_usuario) || payload.id_usuario <= 0) throw new Error('Token inválido')
    } catch {
        return res.status(401).json({ mensagem: 'Token inválido ou expirado' })
    }
    try {
        const resultado = await pool.query(
            'SELECT id_usuario, nome, perfil FROM usuarios WHERE id_usuario = $1 AND ativo = TRUE',
            [payload.id_usuario]
        )
        if (!resultado.rows.length) return res.status(401).json({ mensagem: 'Acesso revogado' })
        req.usuario = resultado.rows[0]
        next()
    } catch {
        return res.status(503).json({ mensagem: 'Não foi possível verificar o acesso. Tente novamente.' })
    }
}

export function somenteAdmin(req, res, next) {
    if (req.usuario.perfil !== 'admin') {
        return res.status(403).json({ mensagem: 'Operação permitida somente ao administrador' })
    }
    next()
}

export default autenticar
