const token = localStorage.getItem('token')
const usuario = JSON.parse(localStorage.getItem('usuario') || 'null')

if (!token || !usuario) {
    window.location.href = 'login.html'
}

const mensagem = document.getElementById('mensagem')
const itensPedido = []

document.getElementById('nomeUsuario').textContent =
    usuario ? `Usuário: ${usuario.nome}` : ''

function escapar(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, function (caractere) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[caractere]
    })
}

function mostrarMensagem(texto) {
    mensagem.textContent = texto
}

async function requisicao(url, metodo = 'GET', dados = null) {
    const opcoes = {
        method: metodo,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }

    if (dados !== null) {
        opcoes.headers['Content-Type'] = 'application/json'
        opcoes.body = JSON.stringify(dados)
    }

    const resposta = await fetch(url, opcoes)

    const resultado = await resposta.json()

    if (resposta.status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem('usuario')
        window.location.href = 'login.html'
        throw new Error('Sessão expirada')
    }

    if (!resposta.ok) {
        throw new Error(resultado.mensagem || 'Erro na requisição')
    }

    return resultado
}

function formatarMoeda(valor) {
    return Number(valor).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    })
}

function formatarData(data) {
    return new Date(data).toLocaleDateString('pt-BR')
}

function abrirTela(nome) {
    document.querySelectorAll('.tela').forEach(function (tela) {
        tela.classList.add('escondido')
    })

    document.getElementById(nome).classList.remove('escondido')

    document.querySelectorAll('.menu-btn').forEach(function (botao) {
        botao.classList.remove('ativo')
    })

    document.querySelector(`[data-tela="${nome}"]`).classList.add('ativo')

    mostrarMensagem('')

    if (nome === 'clientes') carregarClientes()
    if (nome === 'produtos') carregarProdutos()
    if (nome === 'pedidos') carregarPedidos()
}

document.querySelectorAll('.menu-btn').forEach(function (botao) {
    botao.addEventListener('click', function () {
        abrirTela(botao.dataset.tela)
    })
})

document.querySelectorAll('[data-ir]').forEach(function (botao) {
    botao.addEventListener('click', function () {
        abrirTela(botao.dataset.ir)
    })
})

document.getElementById('btnSair').addEventListener('click', function () {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    window.location.href = 'login.html'
})

async function carregarClientes() {
    try {
        const clientes = await requisicao('/api/clientes')
        const lista = document.getElementById('listaClientes')

        lista.innerHTML = ''

        clientes.forEach(function (cliente) {
            lista.innerHTML += `
                <tr>
                    <td>${escapar(cliente.nome)}</td>
                    <td>${escapar(cliente.email)}</td>
                    <td>${escapar(cliente.telefone)}</td>
                    <td>
                        <button class="btn-editar" data-editar-cliente="${cliente.id_cliente}">
                            Editar
                        </button>
                        <button class="btn-excluir" data-excluir-cliente="${cliente.id_cliente}">
                            Excluir
                        </button>
                    </td>
                </tr>
            `
        })

    } catch (erro) {
        mostrarMensagem(erro.message)
    }
}

document.getElementById('formCliente').addEventListener('submit', async function (event) {
    event.preventDefault()

    const id = document.getElementById('idCliente').value

    const dados = {
        nome: document.getElementById('clienteNome').value,
        email: document.getElementById('clienteEmail').value,
        telefone: document.getElementById('clienteTelefone').value,
        cpf_cnpj: document.getElementById('clienteDocumento').value
    }

    try {
        if (id) {
            await requisicao(`/api/clientes/${id}`, 'PUT', dados)
            mostrarMensagem('Cliente atualizado com sucesso')
        } else {
            await requisicao('/api/clientes', 'POST', dados)
            mostrarMensagem('Cliente cadastrado com sucesso')
        }

        this.reset()
        document.getElementById('idCliente').value = ''
        carregarClientes()

    } catch (erro) {
        mostrarMensagem(erro.message)
    }
})

document.getElementById('listaClientes').addEventListener('click', async function (event) {
    const idEditar = event.target.dataset.editarCliente
    const idExcluir = event.target.dataset.excluirCliente

    try {
        if (idEditar) {
            const clientes = await requisicao('/api/clientes')
            const cliente = clientes.find(function (item) {
                return item.id_cliente == idEditar
            })

            document.getElementById('idCliente').value = cliente.id_cliente
            document.getElementById('clienteNome').value = cliente.nome
            document.getElementById('clienteEmail').value = cliente.email || ''
            document.getElementById('clienteTelefone').value = cliente.telefone || ''
            document.getElementById('clienteDocumento').value = cliente.cpf_cnpj || ''

            mostrarMensagem('Editando cliente')

        }

        if (idExcluir) {
            if (!confirm('Deseja realmente excluir este cliente?')) return

            await requisicao(`/api/clientes/${idExcluir}`, 'DELETE')

            mostrarMensagem('Cliente excluído com sucesso')
            carregarClientes()
        }

    } catch (erro) {
        mostrarMensagem(erro.message)
    }
})

document.getElementById('limparCliente').addEventListener('click', function () {
    document.getElementById('formCliente').reset()
    document.getElementById('idCliente').value = ''
    mostrarMensagem('')
})

async function carregarProdutos() {
    try {
        const produtos = await requisicao('/api/produtos')
        const lista = document.getElementById('listaProdutos')

        lista.innerHTML = ''

        produtos.forEach(function (produto) {
            lista.innerHTML += `
                <tr>
                    <td>${escapar(produto.nome)}</td>
                    <td>${formatarMoeda(produto.preco)}</td>
                    <td>${escapar(produto.estoque)}</td>
                    <td>
                        <button class="btn-editar" data-editar-produto="${produto.id_produto}">
                            Editar
                        </button>
                        <button class="btn-excluir" data-excluir-produto="${produto.id_produto}">
                            Desativar
                        </button>
                    </td>
                </tr>
            `
        })

    } catch (erro) {
        mostrarMensagem(erro.message)
    }
}

document.getElementById('formProduto').addEventListener('submit', async function (event) {
    event.preventDefault()

    const id = document.getElementById('idProduto').value

    const dados = {
        nome: document.getElementById('produtoNome').value,
        descricao: document.getElementById('produtoDescricao').value,
        preco: Number(document.getElementById('produtoPreco').value),
        estoque: Number(document.getElementById('produtoEstoque').value)
    }

    try {
        if (id) {
            await requisicao(`/api/produtos/${id}`, 'PUT', dados)
            mostrarMensagem('Produto atualizado com sucesso')
        } else {
            await requisicao('/api/produtos', 'POST', dados)
            mostrarMensagem('Produto cadastrado com sucesso')
        }

        this.reset()
        document.getElementById('idProduto').value = ''
        carregarProdutos()

    } catch (erro) {
        mostrarMensagem(erro.message)
    }
})

document.getElementById('listaProdutos').addEventListener('click', async function (event) {
    const idEditar = event.target.dataset.editarProduto
    const idExcluir = event.target.dataset.excluirProduto

    try {
        if (idEditar) {
            const produtos = await requisicao('/api/produtos')
            const produto = produtos.find(function (item) {
                return item.id_produto == idEditar
            })

            document.getElementById('idProduto').value = produto.id_produto
            document.getElementById('produtoNome').value = produto.nome
            document.getElementById('produtoDescricao').value = produto.descricao || ''
            document.getElementById('produtoPreco').value = produto.preco
            document.getElementById('produtoEstoque').value = produto.estoque

            mostrarMensagem('Editando produto')
        }

        if (idExcluir) {
            if (!confirm('Deseja realmente desativar este produto?')) return

            await requisicao(`/api/produtos/${idExcluir}`, 'DELETE')

            mostrarMensagem('Produto desativado com sucesso')
            carregarProdutos()
        }

    } catch (erro) {
        mostrarMensagem(erro.message)
    }
})

document.getElementById('limparProduto').addEventListener('click', function () {
    document.getElementById('formProduto').reset()
    document.getElementById('idProduto').value = ''
    mostrarMensagem('')
})

async function carregarDadosPedido() {
    try {
        const clientes = await requisicao('/api/clientes')
        const produtos = await requisicao('/api/produtos')

        const campoCliente = document.getElementById('pedidoCliente')
        const campoProduto = document.getElementById('pedidoProduto')

        campoCliente.innerHTML = '<option value="">Selecione um cliente</option>'
        campoProduto.innerHTML = '<option value="">Selecione um produto</option>'

        clientes.forEach(function (cliente) {
            campoCliente.innerHTML += `
                <option value="${cliente.id_cliente}">
                    ${escapar(cliente.nome)}
                </option>
            `
        })

        produtos.forEach(function (produto) {
            campoProduto.innerHTML += `
                <option value="${produto.id_produto}">
                    ${escapar(produto.nome)} - Estoque: ${produto.estoque}
                </option>
            `
        })

    } catch (erro) {
        mostrarMensagem(erro.message)
    }
}

function atualizarItensPedido() {
    const lista = document.getElementById('itensSelecionados')

    lista.innerHTML = ''

    itensPedido.forEach(function (item, indice) {
        lista.innerHTML += `
            <li>
                ${escapar(item.nome)} - Quantidade: ${item.quantidade}
                <button type="button" data-remover-item="${indice}">Remover</button>
            </li>
        `
    })
}

document.getElementById('adicionarItem').addEventListener('click', async function () {
    const idProduto = document.getElementById('pedidoProduto').value
    const quantidade = Number(document.getElementById('pedidoQuantidade').value)

    if (!idProduto || !Number.isInteger(quantidade) || quantidade <= 0) {
        mostrarMensagem('Selecione um produto e informe uma quantidade válida')
        return
    }

    try {
        const produtos = await requisicao('/api/produtos')
        const produto = produtos.find(function (item) {
            return item.id_produto == idProduto
        })

        if (!produto) {
            mostrarMensagem('Produto não encontrado')
            return
        }

        const itemExistente = itensPedido.find(function (item) {
            return item.id_produto == idProduto
        })

        const quantidadeTotal = quantidade + (itemExistente ? itemExistente.quantidade : 0)

        if (quantidadeTotal > produto.estoque) {
            mostrarMensagem('Quantidade maior que o estoque disponível')
            return
        }

        if (itemExistente) {
            itemExistente.quantidade = quantidadeTotal
        } else {
            itensPedido.push({
                id_produto: produto.id_produto,
                nome: produto.nome,
                quantidade: quantidade
            })
        }

        atualizarItensPedido()
        mostrarMensagem('Produto adicionado ao pedido')

    } catch (erro) {
        mostrarMensagem(erro.message)
    }
})

document.getElementById('itensSelecionados').addEventListener('click', function (event) {
    const indice = event.target.dataset.removerItem

    if (indice === undefined) return

    itensPedido.splice(Number(indice), 1)
    atualizarItensPedido()
})

document.getElementById('formPedido').addEventListener('submit', async function (event) {
    event.preventDefault()

    const idCliente = document.getElementById('pedidoCliente').value

    if (!idCliente || itensPedido.length === 0) {
        mostrarMensagem('Selecione um cliente e adicione pelo menos um produto')
        return
    }

    const dados = {
        id_cliente: Number(idCliente),
        itens: itensPedido.map(function (item) {
            return {
                id_produto: item.id_produto,
                quantidade: item.quantidade
            }
        })
    }

    try {
        const resultado = await requisicao('/api/pedidos', 'POST', dados)

        mostrarMensagem(
            `Pedido ${resultado.id_pedido} registrado. Total: ${formatarMoeda(resultado.valor_total)}`
        )

        itensPedido.length = 0
        atualizarItensPedido()
        this.reset()

        await carregarPedidos()
        await carregarDadosPedido()

    } catch (erro) {
        mostrarMensagem(erro.message)
    }
})

async function carregarPedidos() {
    try {
        await carregarDadosPedido()

        const pedidos = await requisicao('/api/pedidos')
        const lista = document.getElementById('listaPedidos')

        lista.innerHTML = ''

        pedidos.forEach(function (pedido) {
            lista.innerHTML += `
                <tr>
                    <td>${pedido.id_pedido}</td>
                    <td>${escapar(pedido.cliente)}</td>
                    <td>${formatarData(pedido.data_pedido)}</td>
                    <td>${escapar(pedido.status)}</td>
                    <td>${formatarMoeda(pedido.valor_total)}</td>
                    <td>
                        <button data-ver-pedido="${pedido.id_pedido}">
                            Detalhes
                        </button>
                        ${pedido.status !== 'cancelado' ? `
                            <button class="btn-excluir" data-cancelar-pedido="${pedido.id_pedido}">
                                Cancelar
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `
        })

    } catch (erro) {
        mostrarMensagem(erro.message)
    }
}

document.getElementById('listaPedidos').addEventListener('click', async function (event) {
    const idVer = event.target.dataset.verPedido
    const idCancelar = event.target.dataset.cancelarPedido

    try {
        if (idVer) {
            const resultado = await requisicao(`/api/pedidos/${idVer}`)
            const pedido = resultado.pedido
            const detalhes = document.getElementById('detalhesPedido')

            let html = `
                <h3>Pedido ${pedido.id_pedido}</h3>
                <p>Cliente: ${escapar(pedido.cliente)}</p>
                <p>Status: ${escapar(pedido.status)}</p>
                <h4>Produtos</h4>
            `

            resultado.itens.forEach(function (item) {
                html += `
                    <p>
                        ${escapar(item.produto)} |
                        Quantidade: ${item.quantidade} |
                        Subtotal: ${formatarMoeda(item.subtotal)}
                    </p>
                `
            })

            html += `<h3>Total: ${formatarMoeda(pedido.valor_total)}</h3>`

            detalhes.innerHTML = html
        }

        if (idCancelar) {
            if (!confirm('Deseja cancelar este pedido?')) return

            await requisicao(`/api/pedidos/${idCancelar}/cancelar`, 'PATCH')

            mostrarMensagem('Pedido cancelado com sucesso')
            carregarPedidos()
        }

    } catch (erro) {
        mostrarMensagem(erro.message)
    }
})

async function iniciarSistema() {
    try {
        await carregarClientes()
        await carregarProdutos()
        await carregarPedidos()
    } catch (erro) {
        mostrarMensagem(erro.message)
    }
}

iniciarSistema()