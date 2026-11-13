
import jwt from 'jsonwebtoken'

function autenticar(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1]

    if (!token) {
        return res.status(401).json({
            mensagem: 'Token não informado'
        })
    }

    try {
        const usuario = jwt.verify(token, process.env.JWT_SECRET)

        req.usuario = usuario

        next()
    } catch {
        return res.status(401).json({
            mensagem: 'Token inválido ou expirado'
        })
    }
}

export default autenticar
