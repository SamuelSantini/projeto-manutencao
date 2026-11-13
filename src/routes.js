import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pool from './database.js'
import autenticar from './auth.js'

const router = express.Router()

router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body

        const resultado = await pool.query(
            'SELECT * FROM usuarios WHERE email = $1 AND ativo = TRUE',
            [email]
        )

        if (resultado.rows.length === 0) {
            return res.status(401).json({
                mensagem: 'Usuário ou senha inválidos'
            })
        }

        const usuario = resultado.rows[0]

        const senhaCorreta = await bcrypt.compare(
            senha,
            usuario.senha_hash
        )

        if (!senhaCorreta) {
            return res.status(401).json({
                mensagem: 'Usuário ou senha inválidos'
            })
        }

        const token = jwt.sign(
            {
                id_usuario: usuario.id_usuario,
                nome: usuario.nome,
                perfil: usuario.perfil
            },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        )

        res.json({
            mensagem: 'Login realizado',
            token,
            usuario: {
                id_usuario: usuario.id_usuario,
                nome: usuario.nome,
                email: usuario.email,
                perfil: usuario.perfil
            }
        })

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao realizar login'
        })
    }
})

router.get('/clientes', autenticar, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM clientes ORDER BY id_cliente'
        )

        res.json(resultado.rows)

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao consultar clientes'
        })
    }
})

router.post('/clientes', autenticar, async (req, res) => {
    try {
        const { nome, email, telefone, cpf_cnpj } = req.body

        const resultado = await pool.query(
            `INSERT INTO clientes (nome, email, telefone, cpf_cnpj)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [nome, email, telefone, cpf_cnpj]
        )

        res.status(201).json(resultado.rows[0])

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao cadastrar cliente'
        })
    }
})

router.put('/clientes/:id', autenticar, async (req, res) => {
    try {
        const { nome, email, telefone, cpf_cnpj } = req.body

        const resultado = await pool.query(
            `UPDATE clientes
             SET nome = $1, email = $2, telefone = $3, cpf_cnpj = $4
             WHERE id_cliente = $5
             RETURNING *`,
            [nome, email, telefone, cpf_cnpj, req.params.id]
        )

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Cliente não encontrado'
            })
        }

        res.json(resultado.rows[0])

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao atualizar cliente'
        })
    }
})

router.delete('/clientes/:id', autenticar, async (req, res) => {
    try {
        const resultado = await pool.query(
            'DELETE FROM clientes WHERE id_cliente = $1 RETURNING *',
            [req.params.id]
        )

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Cliente não encontrado'
            })
        }

        res.json({
            mensagem: 'Cliente excluído'
        })

    } catch (erro) {
        if (erro.code === '23503') {
            return res.status(409).json({
                mensagem: 'Não é possível excluir um cliente que possui pedidos'
            })
        }

        res.status(500).json({
            mensagem: 'Erro ao excluir cliente'
        })
    }
})

router.get('/produtos', autenticar, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM produtos WHERE ativo = TRUE ORDER BY id_produto'
        )

        res.json(resultado.rows)

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao consultar produtos'
        })
    }
})

router.post('/produtos', autenticar, async (req, res) => {
    try {
        const { nome, descricao, preco, estoque } = req.body

        const resultado = await pool.query(
            `INSERT INTO produtos (nome, descricao, preco, estoque)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [nome, descricao, preco, estoque]
        )

        res.status(201).json(resultado.rows[0])

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao cadastrar produto'
        })
    }
})

router.put('/produtos/:id', autenticar, async (req, res) => {
    try {
        const { nome, descricao, preco, estoque } = req.body

        const resultado = await pool.query(
            `UPDATE produtos
             SET nome = $1, descricao = $2, preco = $3, estoque = $4
             WHERE id_produto = $5 AND ativo = TRUE
             RETURNING *`,
            [nome, descricao, preco, estoque, req.params.id]
        )

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Produto não encontrado'
            })
        }

        res.json(resultado.rows[0])

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao atualizar produto'
        })
    }
})

router.delete('/produtos/:id', autenticar, async (req, res) => {
    try {
        const resultado = await pool.query(
            `UPDATE produtos
             SET ativo = FALSE
             WHERE id_produto = $1 AND ativo = TRUE
             RETURNING *`,
            [req.params.id]
        )

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Produto não encontrado'
            })
        }

        res.json({
            mensagem: 'Produto desativado'
        })

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao desativar produto'
        })
    }
})

router.get('/pedidos', autenticar, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT
                p.id_pedido,
                p.data_pedido,
                p.status,
                p.valor_total,
                c.nome AS cliente,
                u.nome AS usuario
             FROM pedidos p
             INNER JOIN clientes c ON p.id_cliente = c.id_cliente
             INNER JOIN usuarios u ON p.id_usuario = u.id_usuario
             ORDER BY p.id_pedido DESC`
        )

        res.json(resultado.rows)

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao consultar pedidos'
        })
    }
})

router.get('/pedidos/:id', autenticar, async (req, res) => {
    try {
        const pedido = await pool.query(
            `SELECT
                p.*,
                c.nome AS cliente,
                u.nome AS usuario
             FROM pedidos p
             INNER JOIN clientes c ON p.id_cliente = c.id_cliente
             INNER JOIN usuarios u ON p.id_usuario = u.id_usuario
             WHERE p.id_pedido = $1`,
            [req.params.id]
        )

        if (pedido.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Pedido não encontrado'
            })
        }

        const itens = await pool.query(
            `SELECT
                i.id_item,
                i.id_produto,
                pr.nome AS produto,
                i.quantidade,
                i.preco_unitario,
                i.subtotal
             FROM itens_pedido i
             INNER JOIN produtos pr ON i.id_produto = pr.id_produto
             WHERE i.id_pedido = $1`,
            [req.params.id]
        )

        res.json({
            pedido: pedido.rows[0],
            itens: itens.rows
        })

    } catch (erro) {
        res.status(500).json({
            mensagem: 'Erro ao consultar pedido'
        })
    }
})

router.post('/pedidos', autenticar, async (req, res) => {
    const conexao = await pool.connect()

    try {
        const { id_cliente, itens } = req.body

        if (!id_cliente || !Array.isArray(itens) || itens.length === 0) {
            return res.status(400).json({
                mensagem: 'Informe o cliente e pelo menos um produto'
            })
        }

        const quantidades = new Map()

        for (const item of itens) {
            const idProduto = Number(item.id_produto)
            const quantidade = Number(item.quantidade)

            if (
                !Number.isInteger(idProduto) ||
                !Number.isInteger(quantidade) ||
                idProduto <= 0 ||
                quantidade <= 0
            ) {
                return res.status(400).json({
                    mensagem: 'Produto ou quantidade inválidos'
                })
            }

            quantidades.set(
                idProduto,
                (quantidades.get(idProduto) || 0) + quantidade
            )
        }

        await conexao.query('BEGIN')

        const cliente = await conexao.query(
            'SELECT id_cliente FROM clientes WHERE id_cliente = $1',
            [id_cliente]
        )

        if (cliente.rows.length === 0) {
            await conexao.query('ROLLBACK')

            return res.status(404).json({
                mensagem: 'Cliente não encontrado'
            })
        }

        const pedido = await conexao.query(
            `INSERT INTO pedidos (id_cliente, id_usuario, status, valor_total)
             VALUES ($1, $2, 'aberto', 0)
             RETURNING *`,
            [id_cliente, req.usuario.id_usuario]
        )

        const idPedido = pedido.rows[0].id_pedido
        let valorTotalCentavos = 0

        for (const [idProduto, quantidade] of [...quantidades.entries()].sort((a, b) => a[0] - b[0])) {
            const produto = await conexao.query(
                `SELECT id_produto, nome, preco, estoque
                 FROM produtos
                 WHERE id_produto = $1 AND ativo = TRUE
                 FOR UPDATE`,
                [idProduto]
            )

            if (produto.rows.length === 0) {
                throw new Error(`Produto ${idProduto} não encontrado ou inativo`)
            }

            const dadosProduto = produto.rows[0]

            if (dadosProduto.estoque < quantidade) {
                throw new Error(`Estoque insuficiente para ${dadosProduto.nome}`)
            }

            const precoCentavos = Math.round(Number(dadosProduto.preco) * 100)
            const subtotalCentavos = precoCentavos * quantidade

            valorTotalCentavos += subtotalCentavos

            await conexao.query(
                `INSERT INTO itens_pedido
                 (id_pedido, id_produto, quantidade, preco_unitario, subtotal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    idPedido,
                    idProduto,
                    quantidade,
                    (precoCentavos / 100).toFixed(2),
                    (subtotalCentavos / 100).toFixed(2)
                ]
            )

            await conexao.query(
                `UPDATE produtos
                 SET estoque = estoque - $1
                 WHERE id_produto = $2`,
                [quantidade, idProduto]
            )
        }

        await conexao.query(
            `UPDATE pedidos
             SET valor_total = $1
             WHERE id_pedido = $2`,
            [(valorTotalCentavos / 100).toFixed(2), idPedido]
        )

        await conexao.query('COMMIT')

        res.status(201).json({
            mensagem: 'Pedido cadastrado com sucesso',
            id_pedido: idPedido,
            valor_total: (valorTotalCentavos / 100).toFixed(2)
        })

    } catch (erro) {
        await conexao.query('ROLLBACK')

        res.status(400).json({
            mensagem: erro.message || 'Erro ao cadastrar pedido'
        })

    } finally {
        conexao.release()
    }
})

router.patch('/pedidos/:id/cancelar', autenticar, async (req, res) => {
    const conexao = await pool.connect()

    try {
        await conexao.query('BEGIN')

        const pedido = await conexao.query(
            `SELECT * FROM pedidos
             WHERE id_pedido = $1
             FOR UPDATE`,
            [req.params.id]
        )

        if (pedido.rows.length === 0) {
            await conexao.query('ROLLBACK')

            return res.status(404).json({
                mensagem: 'Pedido não encontrado'
            })
        }

        if (pedido.rows[0].status === 'cancelado') {
            await conexao.query('ROLLBACK')

            return res.status(400).json({
                mensagem: 'Este pedido já está cancelado'
            })
        }

        const itens = await conexao.query(
            `SELECT id_produto, quantidade
             FROM itens_pedido
             WHERE id_pedido = $1`,
            [req.params.id]
        )

        for (const item of itens.rows) {
            await conexao.query(
                `UPDATE produtos
                 SET estoque = estoque + $1
                 WHERE id_produto = $2`,
                [item.quantidade, item.id_produto]
            )
        }

        await conexao.query(
            `UPDATE pedidos
             SET status = 'cancelado'
             WHERE id_pedido = $1`,
            [req.params.id]
        )

        await conexao.query('COMMIT')

        res.json({
            mensagem: 'Pedido cancelado e estoque atualizado'
        })

    } catch (erro) {
        await conexao.query('ROLLBACK')

        res.status(500).json({
            mensagem: 'Erro ao cancelar pedido'
        })

    } finally {
        conexao.release()
    }
})

export default router