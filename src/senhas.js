import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

export const CUSTO_BCRYPT = 12
// Mantém o trabalho de comparação também quando o usuário não existe.
export const HASH_FICTICIO = bcrypt.hashSync(randomBytes(32).toString('hex'), CUSTO_BCRYPT)

export function senhaAceitaNoLogin(senha) {
    return typeof senha === 'string' && senha.length > 0 && Buffer.byteLength(senha, 'utf8') <= 72
}

export async function criarHash(senha) {
    if (!senhaAceitaNoLogin(senha) || [...senha].length < 12) {
        throw new Error('A senha deve ter pelo menos 12 caracteres e no máximo 72 bytes UTF-8')
    }
    return bcrypt.hash(senha, CUSTO_BCRYPT)
}

export async function verificarSenha(senha, hash) {
    if (!senhaAceitaNoLogin(senha)) return false
    if (typeof hash !== 'string' || !/^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) {
        await bcrypt.compare(senha, HASH_FICTICIO)
        return false
    }
    return bcrypt.compare(senha, hash)
}
