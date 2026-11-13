// Limite por endereço IP. Não confiar em X-Forwarded-For sem proxy conhecido.
export function criarLimiteLogin({ maximo = 20, janelaMs = 15 * 60 * 1000, agora = Date.now } = {}) {
    const tentativas = new Map()
    return (req, res, next) => {
        const instante = agora()
        for (const [ip, registro] of tentativas) {
            if (registro.expira <= instante) tentativas.delete(ip)
        }
        const ip = req.ip || req.socket?.remoteAddress || 'desconhecido'
        let registro = tentativas.get(ip)
        if (!registro) {
            if (tentativas.size >= 10000) return res.status(429).json({ mensagem: 'Muitas tentativas. Tente novamente mais tarde.' })
            registro = { quantidade: 0, expira: instante + janelaMs }
            tentativas.set(ip, registro)
        }
        registro.quantidade++
        if (registro.quantidade > maximo) {
            res.set('Retry-After', String(Math.ceil((registro.expira - instante) / 1000)))
            return res.status(429).json({ mensagem: 'Muitas tentativas. Tente novamente mais tarde.' })
        }
        next()
    }
}
