export function validarCliente({ nome, email, telefone, cpf_cnpj }) {
    if (typeof nome !== 'string' || !nome.trim() || nome.length > 120) return 'Informe um nome de até 120 caracteres'
    if (typeof email !== 'string' || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Informe um e-mail válido'
    if (telefone != null && (typeof telefone !== 'string' || telefone.length > 20)) return 'Telefone deve ter até 20 caracteres'
    if (typeof cpf_cnpj !== 'string' || !/^(\d{11}|\d{14})$/.test(cpf_cnpj)) return 'CPF/CNPJ deve conter 11 ou 14 dígitos, sem pontuação'
    return null
}

export function validarProduto({ nome, descricao, preco, estoque }) {
    if (typeof nome !== 'string' || !nome.trim() || nome.length > 120) return 'Informe um nome de até 120 caracteres'
    if (descricao != null && typeof descricao !== 'string') return 'Descrição inválida'
    if (typeof preco !== 'number' || !Number.isFinite(preco) || preco <= 0 || preco > 99999999.99 || Math.abs(preco*100-Math.round(preco*100)) > 0.000001) return 'Preço deve ser maior que zero e até 99999999,99'
    if (!Number.isInteger(estoque) || estoque < -2147483648 || estoque > 2147483647) return 'Estoque deve ser um número inteiro de até 2147483647'
    return null
}
