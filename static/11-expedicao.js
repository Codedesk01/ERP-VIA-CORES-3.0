// ================================================================================
// 11 EXPEDICAO
// ================================================================================


// --- 40-módulo-de-expedição-com-modal-de-impressão-e-baixa-automática.js ---
// >>> ADICIONE ISTO AO TOPO DO 11-expedicao.js (ou após inicializar `socket`)
if (typeof socket !== 'undefined') {
    socket.on('dados_atualizados', async (payload) => {
        try {
            // Se o backend emitiu sem payload, atualizamos só a expedição para garantir consistência
            const modulo = payload && payload.modulo ? payload.modulo : null;

            // Se for especificamente o módulo 'expedicao' OU se for 'producao' (pois produção -> expedição)
            // OU se payload for null (broadcast genérico), então buscamos a lista.
            if (!modulo || modulo === 'expedicao' || modulo === 'producao' || modulo === 'pedidos') {
                // Busca os pacotes atualizados do servidor
                const res = await fetch('/api/expedition/packages');
                if (!res.ok) {
                    console.warn('Falha ao buscar pacotes de expedição:', await res.text());
                    return;
                }
                const packages = await res.json();

                // Atualiza a variável global 'expedicao' usada por loadExpedicao()
                // (assumimos que 'expedicao' existe no escopo global do app)
                if (typeof expedicao !== 'undefined') {
                    // normaliza conforme estrutura esperada
                    expedicao = packages.map(p => {
                        // alguns objetos no servidor usam 'pacote_id' / 'itens' / 'status'
                        return {
                            pedidoId: p.pedido_id || p.pacote_id || p.id || null,
                            itens: p.itens || p.itens || [],
                            status: p.status || 'Pendente',
                            // mantém outras props caso existam
                            ...p
                        };
                    });
                } else {
                    // cria variável global se não existir
                    window.expedicao = packages;
                }

                // Re-renderiza UI de expedição
                if (typeof loadExpedicao === 'function') {
                    loadExpedicao();
                }
            }
        } catch (err) {
            console.error('Erro ao processar evento dados_atualizados (expedicao):', err);
        }
    });
} else {
    console.warn('Socket.IO não encontrado — verifique onde inicializa `socket`.');
}

// =================================================================================
// MÓDULO DE EXPEDIÇÃO (COM MODAL DE IMPRESSÃO E BAIXA AUTOMÁTICA)
// =================================================================================

/**
 * Função principal que carrega e renderiza a tela de Expedição.
 * Organiza os pacotes em abas por marketplace e em uma seção para itens incompletos.
 */
function loadExpedicao() {
    if (!hasPermission('expedicao', 'visualizar')) return;
        document.getElementById('expedicao-data-atualizacao').innerHTML = `Última atualização: <strong>${new Date().toLocaleString('pt-BR')}</strong>`;

    // Contêineres para as abas
    const mlContainer = document.getElementById('expedicao-ml-content');
    const shopeeContainer = document.getElementById('expedicao-shopee-content');
    const vcContainer = document.getElementById('expedicao-vc-content');
    const aguardandoContainer = document.getElementById('expedicao-incompletos-container');

    // Contadores das abas
    const contadorML = document.getElementById('contador-expedicao-ml');
    const contadorShopee = document.getElementById('contador-expedicao-shopee');
    const contadorVC = document.getElementById('contador-expedicao-vc');

    if (!mlContainer || !shopeeContainer || !vcContainer || !aguardandoContainer) return;

    // Limpa todos os contêineres
    mlContainer.innerHTML = '';
    shopeeContainer.innerHTML = '';
    vcContainer.innerHTML = '';
    aguardandoContainer.innerHTML = '';

    const { pacotesCompletos, pacotesIncompletos } = getStatusTodosPacotes();

    // Separa os pacotes completos por marketplace
    const pacotesML = pacotesCompletos.filter(p => p.marketplace === 'Mercado Livre');
    const pacotesShopee = pacotesCompletos.filter(p => p.marketplace === 'Shopee');
    const pacotesVC = pacotesCompletos.filter(p => p.marketplace !== 'Mercado Livre' && p.marketplace !== 'Shopee');

    // Atualiza os contadores
    contadorML.innerText = pacotesML.length;
    contadorShopee.innerText = pacotesShopee.length;
    contadorVC.innerText = pacotesVC.length;

    // Função auxiliar para renderizar os grupos de pacotes em cada aba
    const renderizarPacotesNaAba = (pacotes, container) => {
        if (pacotes.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 py-8">Nenhum pacote completo aguardando montagem aqui.</p>`;
            return;
        }
        const pacotesPorGrupo = agruparPacotesPorGrupo(pacotes);
        renderizarGruposDePacotes(pacotesPorGrupo, container, renderCardPacotePronto);
    };

    // Renderiza os pacotes em suas respectivas abas
    renderizarPacotesNaAba(pacotesML, mlContainer);
    renderizarPacotesNaAba(pacotesShopee, shopeeContainer);
    renderizarPacotesNaAba(pacotesVC, vcContainer);

    // Renderiza a seção de pacotes incompletos (lógica inalterada)
    if (pacotesIncompletos.length === 0) {
        aguardandoContainer.innerHTML = `<p class="text-center text-gray-500 py-8">Nenhum pacote aguardando itens.</p>`;
    } else {
        const incompletosPorGrupo = agruparPacotesPorGrupo(pacotesIncompletos);
        renderizarGruposDePacotes(incompletosPorGrupo, aguardandoContainer, renderCardPacoteIncompleto);
    }
    
    applyPermissionsToUI();
}
// =================================================================================
// ARQUIVO: 11-expedicao.js
// SUBSTITUA A FUNÇÃO getStatusTodosPacotes PELA VERSÃO ABAIXO
// =================================================================================

// =================================================================================
// ARQUIVO: 11-expedicao.js
// SUBSTITUA A FUNÇÃO getStatusTodosPacotes PELA VERSÃO ABAIXO
// =================================================================================

/**
 * Analisa e separa os pacotes da expedição em "completos" e "incompletos".
 * VERSÃO DEFINITIVA: Um pacote só é "completo" se TODOS os itens do pedido
 * original (independente de onde estejam no fluxo) estiverem fisicamente na expedição.
 *
 * @returns {object} Um objeto com as listas { pacotesCompletos, pacotesIncompletos }.
 */
function getStatusTodosPacotes() {
    // 1. Pega todos os itens que já estão na expedição e ainda não foram enviados.
    const itensNaExpedicao = expedicao.filter(item => item.status !== 'Enviado');

    // 2. Agrupa esses itens por 'pedidoId' para facilitar a análise.
    const itensPresentesPorPedido = itensNaExpedicao.reduce((acc, item) => {
        const pedidoId = item.pedidoId;
        if (!acc[pedidoId]) {
            acc[pedidoId] = [];
        }
        acc[pedidoId].push(item);
        return acc;
    }, {});

    const pacotesCompletos = [];
    const pacotesIncompletos = [];

    // 3. Itera sobre cada pedido que já tem pelo menos um item na expedição.
    for (const pedidoId in itensPresentesPorPedido) {
        const itensPresentes = itensPresentesPorPedido[pedidoId];

        // --- LÓGICA CENTRAL CORRIGIDA ---

        // 4. CONTAGEM TOTAL DO PEDIDO ORIGINAL:
        // Vamos somar a quantidade de itens com este 'pedidoId' em TODAS as etapas do fluxo.

        const qtdEmPedidos = pedidos.filter(p => p.status !== 'Enviado' && p.status !== 'Baixado')
            .filter(p => p.id === pedidoId)
            .reduce((sum, p) => sum + (p.quantidade || 1), 0);

        const qtdEmProducao = producao
            .filter(p => p.pedidoId === pedidoId)
            .reduce((sum, p) => sum + (p.quantidade || 1), 0);

        const qtdEmCostura = costura
            .filter(c => c.pedidoId === pedidoId)
            .reduce((sum, c) => sum + (c.quantidade || 1), 0);
            
        const qtdNaExpedicao = itensPresentes
            .reduce((sum, e) => sum + (e.quantidade || 1), 0);

// O total de itens que o pedido tinha originalmente é a soma de todas as etapas.
	        const totalItensDoPedidoOriginal = qtdEmPedidos + qtdEmProducao + qtdEmCostura + qtdNaExpedicao;

        // 5. DECISÃO: O pacote está completo?
        // A resposta é SIM, se e somente se, a quantidade de itens na expedição
        // for igual à quantidade total que o pedido tinha originalmente.
        const isCompleto = (qtdNaExpedicao === totalItensDoPedidoOriginal);

        // --- FIM DA LÓGICA CENTRAL ---

        // 6. Monta o objeto 'pacote' com todas as informações necessárias.
        const infoPrimeiroItem = itensPresentes[0];
        const pacote = {
            id: pedidoId,
            marketplace: infoPrimeiroItem?.marketplace || 'N/A',
            cliente: infoPrimeiroItem?.cliente || 'N/A',
            tipoEntrega: infoPrimeiroItem?.tipoEntrega || 'N/A',
            itensPresentes: itensPresentes,
            isCompleto: isCompleto,
            skusFaltantes: [] // Será preenchido se o pacote for incompleto.
        };

        // 7. Separa o pacote na lista correta.
        if (isCompleto) {
            pacotesCompletos.push(pacote);
        } else {
            // Se estiver incompleto, identifica quais SKUs estão faltando para exibir na UI.
            // Itens faltantes são aqueles que estão nas listas 'pedidos', 'producao' ou 'costura'.
            pedidos.filter(p => p.id === pedidoId).forEach(item => {
                pacote.skusFaltantes.push({ sku: item.sku, falta: item.quantidade, local: 'Pedidos' });
            });
            producao.filter(p => p.pedidoId === pedidoId).forEach(item => {
                pacote.skusFaltantes.push({ sku: item.sku, falta: item.quantidade, local: 'Produção' });
            });
            costura.filter(c => c.pedidoId === pedidoId).forEach(item => {
                pacote.skusFaltantes.push({ sku: item.sku, falta: item.quantidade, local: 'Costura' });
            });
            
            pacotesIncompletos.push(pacote);
        }
    }

    return { pacotesCompletos, pacotesIncompletos };
}








/**
 * Agrupa uma lista de pacotes pelo grupo de SKU do primeiro item.
 */
function agruparPacotesPorGrupo(pacotes) {
    return pacotes.reduce((acc, pacote) => {
        const grupo = getGrupoSku(pacote.itensPresentes[0].sku);
        if (!acc[grupo]) acc[grupo] = [];
        acc[grupo].push(pacote);
        return acc;
    }, {});
}

/**
 * Renderiza os grupos de pacotes em um container HTML, garantindo a ordem e o layout.
 * @param {object} grupos - Objeto com pacotes agrupados por grupo de SKU.
 * @param {HTMLElement} container - O elemento HTML onde os grupos serão renderizados.
 * @param {function} cardRenderer - A função que renderiza o card de cada pacote.
 */
function renderizarGruposDePacotes(grupos, container, cardRenderer) {
    container.innerHTML = ''; // Limpa o container
    const ordemGrupos = ['CL', 'FF', 'KC', 'KD', 'PC', 'PH', 'PR', 'PV', 'PV-ESPECIAL', 'RV', 'TP', 'VC', 'PA', 'OUTROS'];
    
    ordemGrupos.forEach(grupo => {
        if (grupos[grupo]) {
            // **MELHORIA**: Ordena os pacotes alfabeticamente pelo ID do pedido dentro de cada grupo.
            grupos[grupo].sort((a, b) => a.id.localeCompare(b.id));

            const grupoHtml = `
                <div class="mb-10">
                    <h4 class="text-xl font-bold text-gray-700 mb-4 border-b pb-2">Grupo: ${grupo}</h4>
                    <!-- MELHORIA: Garante 4 colunas em telas grandes (xl) -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                        ${grupos[grupo].map(cardRenderer).join('')}
                    </div>
                </div>
            `;
            container.innerHTML += grupoHtml;
        }
    });
}



/**
 * Renderiza o card de um pacote pronto, com um botão para abrir o modal de conferência.
 * ATUALIZADO: Destaca o SKU principal e a quantidade total de itens.
 * @param {object} pacote - O objeto do pacote a ser renderizado.
 * @returns {string} O HTML do card.
 */
function renderCardPacotePronto(pacote) {
    const { id, itensPresentes, tipoEntrega, marketplace } = pacote;
    const skuPrincipal = itensPresentes[0]?.sku || 'N/A';
    const quantidadeTotalItens = itensPresentes.reduce((sum, item) => sum + (item.quantidade || 1), 0);
    const imageUrl = getCardImageUrl(skuPrincipal);

    const isMotoboy = tipoEntrega === 'Motoboy';
    const cardClasses = isMotoboy ? 'motoboy-card' : 'bg-white';
    const tipoEntregaIcon = isMotoboy ? 'fa-motorcycle text-purple-700' : 'fa-box-open text-gray-500';

    return `
        <div class="expedicao-card p-4 rounded-xl shadow-md border flex flex-col justify-between transition-all hover:shadow-lg hover:-translate-y-1 ${cardClasses}">
            <div>
                <img src="${imageUrl}" alt="Arte para ${skuPrincipal}" class="w-full h-40 object-cover rounded-lg mb-3 cursor-pointer" onclick="openImageZoomModal('${imageUrl}')">
                
                <!-- SKU PRINCIPAL EM DESTAQUE -->
                <p class="font-extrabold text-xl text-indigo-700 truncate" title="${skuPrincipal}">${skuPrincipal}</p>
                
                <!-- ID do Pedido -->
                <p class="text-sm text-gray-500 truncate" title="${id}">${id}</p>
                
                <div class="flex justify-between items-center mt-3">
                    <!-- UNIDADES EM DESTAQUE -->
                    <div class="text-left">
                        <p class="text-xs text-gray-500">Unidades</p>
                        <p class="font-extrabold text-3xl text-gray-800">${quantidadeTotalItens}</p>
                    </div>
                    
                    <!-- Informações de entrega e marketplace -->
                    <div class="text-right text-xs text-gray-500 flex flex-col items-end gap-1">
                        <span class="font-semibold flex items-center gap-2">
                            <i class="fas ${tipoEntregaIcon}"></i>${tipoEntrega || 'N/A'}
                        </span>
                        <span class="font-semibold">${marketplace || 'N/A'}</span>
                    </div>
                </div>
            </div>
            
            <!-- Botão que aciona o modal de conferência -->
            <button onclick="abrirModalConferencia('${id}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-4 text-md shadow-lg flex items-center justify-center gap-2">
                <i class="fas fa-box-check"></i> Conferir Pacote
            </button>
        </div>
    `;
}


/**
 * Atualiza a visibilidade e o contador do painel de ações em massa da expedição.
 */
function atualizarPainelAcoesExpedicao() {
    const painel = document.getElementById('expedicao-painel-acoes');
    const contador = document.getElementById('expedicao-contador-selecionados');
    if (!painel || !contador) return;

    const selecionados = document.querySelectorAll('.expedicao-checkbox:checked');

    if (selecionados.length > 0) {
        contador.innerText = selecionados.length;
        painel.classList.remove('hidden');
    } else {
        painel.classList.add('hidden');
    }
}

/**
 * Confirma e move todos os pacotes selecionados da expedição para o histórico.
 */
/**
 * Confirma e move todos os pacotes selecionados da expedição para o histórico.
 * VERSÃO ATUALIZADA: Salva o objeto completo do item para rastrear a origem.
 */
async function confirmarEnvioExpedicao() {
    if (!hasPermission('expedicao', 'darBaixa')) {
        showToast('Permissão negada para dar baixa em pacotes.', 'error');
        return;
    }

    const selecionadosCheckboxes = document.querySelectorAll('.expedicao-checkbox:checked');
    if (selecionadosCheckboxes.length === 0) {
        showToast('Nenhum pacote selecionado.', 'info');
        return;
    }

    if (confirm(`Tem certeza que deseja finalizar e enviar os ${selecionadosCheckboxes.length} pacotes selecionados?`)) {
        let pacotesMovidosContador = 0;
        const idsPedidosMovidos = [];

        const { pacotesCompletos } = getStatusTodosPacotes();

        selecionadosCheckboxes.forEach(checkbox => {
            const pedidoId = checkbox.dataset.pedidoId;
            const pacoteCompleto = pacotesCompletos.find(p => p.id === pedidoId);
            
            if (pacoteCompleto) {
                // ======================= INÍCIO DA ALTERAÇÃO =======================
                // A lógica para criar o objeto do histórico já está correta,
                // pois `pacoteCompleto.itensPresentes` contém os objetos completos
                // dos itens da expedição, incluindo a propriedade `lote`.
                // Apenas confirmando que está tudo certo.
                historicoExpedicao.push({
                    pedidoId: pedidoId,
                    itens: pacoteCompleto.itensPresentes, // Isso já contém o 'lote' de cada item
                    dataEnvio: new Date().toISOString(),
                    usuarioEnvio: currentUser.username,
                    marketplace: pacoteCompleto.marketplace,
                    tipoEntrega: pacoteCompleto.tipoEntrega,
                    cliente: pacoteCompleto.cliente,
                });
                // ======================== FIM DA ALTERAÇÃO =========================

                expedicao = expedicao.filter(item => item.pedidoId !== pedidoId);
                pacotesMovidosContador++;
                idsPedidosMovidos.push(pedidoId);
            }
        });

        if (pacotesMovidosContador > 0) {
            await saveData();
            loadExpedicao();

            await logAction({
                acao: `Pacotes enviados para o histórico`,
                modulo: 'Expedição',
                funcao: 'confirmarEnvioExpedicao',
                detalhes: { 
                    quantidade: pacotesMovidosContador, 
                    pedidos: idsPedidosMovidos.join(', ')
                }
            });

            showToast(`${pacotesMovidosContador} pacote(s) finalizado(s) e movido(s) para o histórico.`, 'success');
        }
    }
}


/**
 * NOVA FUNÇÃO: Controla a visibilidade das abas no módulo de Expedição.
 * @param {'ml' | 'shopee' | 'vc'} tabName - O nome da aba a ser exibida.
 */
function showExpedicaoTab(tabName) {
    // Oculta o conteúdo de todas as abas de expedição
    document.querySelectorAll('.expedicao-tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Remove o estilo "ativo" de todos os botões de aba de expedição
    document.querySelectorAll('.expedicao-tab-btn').forEach(btn => {
        btn.classList.remove('border-blue-600', 'text-blue-600');
        btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700');
    });

    // Mostra o conteúdo da aba selecionada
    const contentToShow = document.getElementById(`expedicao-${tabName}-content`);
    if (contentToShow) {
        contentToShow.classList.remove('hidden');
    }

    // Aplica o estilo "ativo" ao botão da aba clicada
    const btnToActivate = document.getElementById(`tab-expedicao-${tabName}`);
    if (btnToActivate) {
        btnToActivate.classList.add('border-blue-600', 'text-blue-600');
        btnToActivate.classList.remove('border-transparent', 'text-gray-500');
    }
}

/**
 * Abre o modal de conferência com todas as informações do pacote e botões de ação.
 */
function abrirModalConferencia(pedidoId) {
    const modal = document.getElementById('conferencia-modal');
    const infoContainer = document.getElementById('conferencia-pedido-info');
    const listaItensContainer = document.getElementById('conferencia-lista-itens');
    const modalFooter = document.getElementById('conferencia-modal-footer');

    const { pacotesCompletos } = getStatusTodosPacotes();
    const pacote = pacotesCompletos.find(p => p.id === pedidoId);

    if (!pacote) {
        showToast(`Pacote ${pedidoId} não está completo ou não foi encontrado.`, 'error');
        return;
    }

    // Pega o primeiro item do pacote para obter dados da etiqueta (rastreio, nf)
    const primeiroItem = pacote.itensPresentes[0];
    const rastreio = primeiroItem.codigoRastreio || 'Não associado';
    const nf = primeiroItem.nfEtiqueta || 'Não associada';

    // Monta o HTML com todas as informações
    infoContainer.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div class="bg-white p-3 rounded-lg border"><strong>Pedido ID:</strong> ${pacote.id}</div>
            <div class="bg-white p-3 rounded-lg border"><strong>Marketplace:</strong> ${pacote.marketplace || 'N/A'}</div>
            <div class="bg-white p-3 rounded-lg border"><strong>Cliente:</strong> ${pacote.cliente || 'N/A'}</div>
            <div class="bg-white p-3 rounded-lg border"><strong>Tipo de Entrega:</strong> ${pacote.tipoEntrega || 'N/A'}</div>
            <div class="bg-white p-3 rounded-lg border col-span-1 md:col-span-2"><strong>Cód. Rastreio:</strong> <span class="font-mono font-bold text-blue-600">${rastreio}</span></div>
            <div class="bg-white p-3 rounded-lg border col-span-1 md:col-span-2"><strong>Nota Fiscal:</strong> <span class="font-mono font-bold text-purple-600">${nf}</span></div>
        </div>
    `;

    // Agrupa os SKUs para mostrar a contagem correta de cada um
    const skusContados = pacote.itensPresentes.reduce((acc, item) => ({ ...acc, [item.sku]: (acc[item.sku] || 0) + 1 }), {});
    listaItensContainer.innerHTML = Object.entries(skusContados).map(([sku, qtd]) => `
        <div class="flex items-center justify-between bg-white p-3 rounded-lg border">
            <span class="font-bold text-lg text-indigo-700">${sku}</span>
            <span class="text-2xl font-extrabold text-gray-800">${qtd}x</span>
        </div>`).join('');

    // Define os botões de ação no rodapé do modal
    modalFooter.innerHTML = `
        <button id="btn-imprimir-dar-baixa" onclick="imprimirEtiquetaEDarBaixa('${pacote.id}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-lg shadow-lg flex items-center justify-center gap-2">
            <i class="fas fa-print"></i> Imprimir Etiqueta e Dar Baixa
        </button>
        <button onclick="fecharModalConferencia()" class="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 rounded-xl text-lg shadow-lg">
            Fechar
        </button>
    `;

    modal.classList.remove('hidden');
    document.getElementById('conferencia-modal-content').classList.remove('scale-95', 'opacity-0');
}

/**
 * Fecha o modal de conferência.
 */
function fecharModalConferencia() {
    const modal = document.getElementById('conferencia-modal');
    modal.classList.add('hidden');
    document.getElementById('conferencia-modal-content').classList.add('scale-95', 'opacity-0');
}










// static/11-expedicao.js

// =================================================================================
// LÓGICA DO HISTÓRICO DE EXPEDIÇÃO (VERSÃO 2.0 - OTIMIZADA COM ABAS)
// =================================================================================

// Variável global para controlar a aba ativa no histórico
let abaAtivaHistorico = 'todos';

/**
 * Abre o modal do histórico de expedição, reseta os filtros e renderiza o conteúdo.
 */
function abrirModalHistoricoExpedicao() {
    const modal = document.getElementById('historico-expedicao-modal');
    if (modal) {
        // Reseta os filtros e a aba ativa
        document.getElementById('hist-exp-filter-id').value = '';
        document.getElementById('hist-exp-filter-user').value = '';
        document.getElementById('hist-exp-filter-data-inicio').value = '';
        abaAtivaHistorico = 'todos'; // Define 'Todos' como padrão ao abrir

        modal.classList.remove('hidden');
        renderizarHistoricoExpedicao(); // Renderiza o conteúdo inicial
    }
}

/**
 * Fecha o modal do histórico de expedição.
 */
function fecharModalHistoricoExpedicao() {
    const modal = document.getElementById('historico-expedicao-modal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Função principal que filtra os dados e renderiza o conteúdo do modal,
 * incluindo as abas e a tabela da aba ativa.
 */
function renderizarHistoricoExpedicao() {
    const tabContainer = document.getElementById('hist-exp-tabs');
    const contentContainer = document.getElementById('hist-exp-tab-content');
    if (!tabContainer || !contentContainer) return;

    // 1. Aplica os filtros gerais (texto e data)
    const filtroIdSku = document.getElementById('hist-exp-filter-id').value.trim().toLowerCase();
    const filtroUser = document.getElementById('hist-exp-filter-user').value.trim().toLowerCase();
    const filtroData = document.getElementById('hist-exp-filter-data-inicio').value;

    let historicoFiltrado = (historicoExpedicao || []).filter(pacote => {
        const idSkuMatch = !filtroIdSku || pacote.pedidoId.toLowerCase().includes(filtroIdSku) || (pacote.itens || []).some(item => item.sku.toLowerCase().includes(filtroIdSku));
        const userMatch = !filtroUser || (pacote.usuarioEnvio && pacote.usuarioEnvio.toLowerCase().includes(filtroUser));
        const dataMatch = !filtroData || new Date(pacote.dataEnvio).toLocaleDateString('en-CA') === filtroData;
        return idSkuMatch && userMatch && dataMatch;
    });

    // 2. Cria os contadores para as abas com base nos dados JÁ filtrados
    const contadores = {
        todos: historicoFiltrado.length,
        'Mercado Livre': historicoFiltrado.filter(p => p.marketplace === 'Mercado Livre').length,
        'Shopee': historicoFiltrado.filter(p => p.marketplace === 'Shopee').length,
        'Outros': historicoFiltrado.filter(p => p.marketplace !== 'Mercado Livre' && p.marketplace !== 'Shopee').length,
    };

    // 3. Renderiza as abas com os contadores
    const abas = ['todos', 'Mercado Livre', 'Shopee', 'Outros'];
    tabContainer.innerHTML = abas.map(nome => {
        const isAtiva = nome.toLowerCase() === abaAtivaHistorico.toLowerCase();
        const classes = isAtiva
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300';
        const nomeExibicao = nome === 'todos' ? 'Todos' : nome;

        return `
            <button onclick="mudarAbaHistorico('${nome}')" class="px-4 py-3 font-semibold text-lg border-b-2 flex items-center gap-2 ${classes}">
                <span>${nomeExibicao}</span>
                <span class="bg-gray-200 text-gray-700 text-xs font-bold px-2 py-1 rounded-full">${contadores[nome]}</span>
            </button>
        `;
    }).join('');

    // 4. Filtra os dados novamente para a aba ativa
    let dadosParaRenderizar = historicoFiltrado;
    if (abaAtivaHistorico !== 'todos') {
        if (abaAtivaHistorico === 'Outros') {
            dadosParaRenderizar = historicoFiltrado.filter(p => p.marketplace !== 'Mercado Livre' && p.marketplace !== 'Shopee');
        } else {
            dadosParaRenderizar = historicoFiltrado.filter(p => p.marketplace === abaAtivaHistorico);
        }
    }

    // Ordena por data mais recente
    dadosParaRenderizar.sort((a, b) => new Date(b.dataEnvio) - new Date(a.dataEnvio));

    // 5. Renderiza a tabela com os dados da aba ativa
    renderizarTabelaHistorico(dadosParaRenderizar, contentContainer);
}

// Em static/js/11-expedicao.js
// SUBSTITUA a função renderizarTabelaHistorico por esta versão completa

/**
 * Renderiza a tabela de histórico em um container específico.
 * VERSÃO ATUALIZADA: Agora entende e renderiza itens com status "Cancelado".
 * @param {Array} pacotes - A lista de pacotes a serem exibidos.
 * @param {HTMLElement} container - O elemento onde a tabela será inserida.
 */
function renderizarTabelaHistorico(pacotes, container) {
    if (!pacotes || pacotes.length === 0) {
        container.innerHTML = '<p class="text-center p-12 text-gray-500 font-semibold">Nenhum registro encontrado para esta seleção.</p>';
        return;
    }

    // Transforma a lista de pacotes em uma lista plana de itens para a tabela
    const listaPlana = [];
    pacotes.forEach(pacote => {
        // >>> INÍCIO DA LÓGICA CORRIGIDA <<<
        // Verifica se o pacote tem o status 'Cancelado'
        if (pacote.status === 'Cancelado') {
            // Para itens cancelados, criamos uma linha especial na tabela
            listaPlana.push({
                isCancelado: true, // Flag para a renderização
                dataEnvio: pacote.dataEnvio,
                pedidoId: pacote.pedidoId,
                usuarioEnvio: pacote.usuarioEnvio,
                motivo: pacote.motivo || `Cancelado por ${pacote.usuarioEnvio}`
            });
            return; // Pula para o próximo pacote
        }
        // >>> FIM DA LÓGICA CORRIGIDA <<<

        // Lógica original para pacotes enviados (mantida)
        const skusContados = (pacote.itens || []).reduce((acc, item) => {
            const origem = item.lote && item.lote.startsWith('LOTE-ESTOQUE') ? 'Estoque' : 'Produção';
            const chave = `${item.sku}|${origem}`;
            if (!acc[chave]) {
                acc[chave] = { sku: item.sku, qtd: 0, origem: origem };
            }
            acc[chave].qtd += (item.quantidade || 1);
            return acc;
        }, {});

        for (const chave in skusContados) {
            const itemAgrupado = skusContados[chave];
            listaPlana.push({
                isCancelado: false,
                dataEnvio: pacote.dataEnvio,
                pedidoId: pacote.pedidoId,
                usuarioEnvio: pacote.usuarioEnvio,
                sku: itemAgrupado.sku,
                quantidade: itemAgrupado.qtd,
                origem: itemAgrupado.origem
            });
        }
    });

    // Ordena por data mais recente
    listaPlana.sort((a, b) => new Date(b.dataEnvio) - new Date(a.dataEnvio));

    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full min-w-[900px] text-sm">
                <thead class="bg-gray-100 sticky top-0 z-10">
                    <tr>
                        <th class="p-3 text-left font-semibold text-gray-600">Data</th>
                        <th class="p-3 text-left font-semibold text-gray-600">Pedido ID</th>
                        <th class="p-3 text-left font-semibold text-gray-600">Detalhes</th>
                        <th class="p-3 text-center font-semibold text-gray-600">Qtd/Status</th>
                        <th class="p-3 text-center font-semibold text-gray-600">Origem/Motivo</th>
                        <th class="p-3 text-left font-semibold text-gray-600">Usuário</th>
                    </tr>
                </thead>
                <tbody>
                    ${listaPlana.map(item => {
                        const dataFormatada = new Date(item.dataEnvio).toLocaleString('pt-BR');
                        
                        // >>> LÓGICA DE RENDERIZAÇÃO CORRIGIDA <<<
                        if (item.isCancelado) {
                            // Renderiza a linha de um item cancelado
                            return `
                                <tr class="border-b bg-red-50 hover:bg-red-100">
                                    <td class="p-3 text-gray-700">${dataFormatada}</td>
                                    <td class="p-3 font-semibold text-red-800">${item.pedidoId}</td>
                                    <td class="p-3 font-bold text-red-700" colspan="1">PEDIDO CANCELADO</td>
                                    <td class="p-3 text-center">
                                        <span class="px-3 py-1 text-xs font-bold rounded-full bg-red-600 text-white">
                                            CANCELADO
                                        </span>
                                    </td>
                                    <td class="p-3 text-center text-red-700 text-xs">${item.motivo}</td>
                                    <td class="p-3 text-gray-600">${item.usuarioEnvio}</td>
                                </tr>
                            `;
                        } else {
                            // Renderiza a linha de um item enviado (lógica original)
                            const origemClass = item.origem === 'Estoque' 
                                ? 'bg-teal-100 text-teal-800' 
                                : 'bg-indigo-100 text-indigo-800';
                            return `
                                <tr class="border-b hover:bg-gray-50">
                                    <td class="p-3 text-gray-700">${dataFormatada}</td>
                                    <td class="p-3 font-semibold text-gray-800">${item.pedidoId}</td>
                                    <td class="p-3 font-bold text-indigo-700">${item.sku}</td>
                                    <td class="p-3 text-center font-bold text-lg">${item.quantidade}</td>
                                    <td class="p-3 text-center">
                                        <span class="px-2 py-1 text-xs font-semibold rounded-full ${origemClass}">
                                            ${item.origem}
                                        </span>
                                    </td>
                                    <td class="p-3 text-gray-600">${item.usuarioEnvio}</td>
                                </tr>
                            `;
                        }
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}


/**
 * Muda a aba ativa e re-renderiza o conteúdo do histórico.
 * @param {string} nomeAba - O nome da aba para ativar ('todos', 'Mercado Livre', etc.).
 */
function mudarAbaHistorico(nomeAba) {
    abaAtivaHistorico = nomeAba;
    renderizarHistoricoExpedicao();
}














/**
 * Função ÚNICA: Imprime a etiqueta (PDF ou ZPL) e, em seguida, dá baixa no pacote.
 */
async function imprimirEtiquetaEDarBaixa(pedidoId) {
    const itemExpedicao = expedicao.find(item => item.pedidoId === pedidoId);

    if (!itemExpedicao) {
        showToast('Erro: Pacote não encontrado na expedição.', 'error');
        return;
    }

    let etiquetaImpressa = false;
    if (itemExpedicao.pdfEtiqueta && itemExpedicao.numeroPaginaEtiqueta) {
        try {
            const { PDFDocument } = PDFLib;
            
            // Carrega o PDF original a partir do Base64 armazenado
            const pdfOriginalDoc = await PDFDocument.load(itemExpedicao.pdfEtiqueta);
            
            // Cria um novo documento PDF em branco
            const novoPdfDoc = await PDFDocument.create();

            // Copia a página específica do original para o novo documento
            const [paginaCopiada] = await novoPdfDoc.copyPages(pdfOriginalDoc, [itemExpedicao.numeroPaginaEtiqueta - 1]);
            novoPdfDoc.addPage(paginaCopiada);

            // Salva o novo documento PDF (com uma única página) e dispara o download/impressão
            const pdfBytes = await novoPdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `etiqueta_shopee_${pedidoId.replace('#', '')}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            showToast(`Etiqueta PDF para o pedido ${pedidoId} gerada.`, 'success');
            etiquetaImpressa = true;

        } catch (error) {
            console.error("Erro ao extrair página do PDF:", error);
            showToast("Erro ao gerar a etiqueta individual. Verifique o console.", "error");
            return;
        }
    } else if (itemExpedicao.zplContent) {
        // Lógica para ZPL (Mercado Livre) permanece a mesma
        // ... (código ZPL aqui) ...
        etiquetaImpressa = true;
    }

    if (!etiquetaImpressa) {
        showToast('Nenhuma etiqueta encontrada para este pedido.', 'error');
        return;
    }

    // Lógica de dar baixa (permanece a mesma)
    let itensEnviadosCount = 0;
    expedicao.forEach(item => {
        if (item.pedidoId === pedidoId && item.status !== 'Enviado') {
            item.status = 'Enviado';
            item.dataEnvio = new Date().toISOString();
            item.usuarioEnvio = currentUser.username;
            itensEnviadosCount++;
        }
    });

    if (itensEnviadosCount > 0) {
        await saveData();
        logAction({
            acao: 'Pacote enviado (baixa automática pós-impressão)',
            modulo: 'Expedição',
            funcao: 'imprimirEtiquetaEDarBaixa',
            detalhes: { pedidoId: pedidoId, quantidade_itens: itensEnviadosCount, rastreio: itemExpedicao.codigoRastreio }
        });
        showToast(`Baixa automática do pacote ${pedidoId} realizada!`, 'success');
        
        loadExpedicao();
        
        const btn = document.getElementById('btn-imprimir-dar-baixa');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-check-circle"></i> Baixa Realizada`;
            btn.classList.replace('bg-blue-600', 'bg-green-600');
        }
    }
}



// --- 41-funções-para-processamento-de-etiquetas-zpl-com-armazenamento-do-zpl.js ---

// =================================================================================
// FUNÇÕES PARA PROCESSAMENTO DE ETIQUETAS ZPL (COM ARMAZENAMENTO DO ZPL)
// =================================================================================

function triggerZplUpload() {
    if (!hasPermission('expedicao', 'editar')) {
        showToast('Permissão negada para associar etiquetas.', 'error');
        return;
    }
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.zpl, .txt';
    fileInput.multiple = true;
    fileInput.onchange = (event) => {
        const files = event.target.files;
        if (files.length > 0) processZplFiles(files);
    };
    fileInput.click();
}

async function processZplFiles(files) {
    showToast(`Lendo ${files.length} arquivo(s) de etiqueta...`, 'info');
    let totalEtiquetasAssociadas = 0;
    let erros = [];

    for (const file of files) {
        try {
            const zplContentCompleto = await file.text();
            const etiquetasIndividuais = zplContentCompleto.split('^XA');

            if (etiquetasIndividuais.length <= 1) {
                erros.push(`Nenhuma etiqueta ZPL válida encontrada no arquivo: ${file.name}`);
                continue;
            }

            etiquetasIndividuais.forEach(etiquetaZpl => {
                if (etiquetaZpl.trim() === '') return;

                const etiquetaCompleta = '^XA' + etiquetaZpl;
                const idVenda = parseZplForSaleId(etiquetaCompleta);
                const codigoRastreio = extrairCodigoRastreio(etiquetaCompleta);

                if (!idVenda || !codigoRastreio) {
                    console.warn(`ID ou Rastreio não extraído de uma etiqueta em ${file.name}`);
                    return;
                }

                let encontrouItem = false;
                expedicao.forEach(item => {
                    if (item.pedidoId && item.pedidoId.includes(idVenda) && item.status !== 'Enviado') {
                        item.codigoRastreio = codigoRastreio;
                        item.nfEtiqueta = extrairNfDaEtiqueta(etiquetaCompleta) || item.nfEtiqueta;
                        item.zplContent = etiquetaCompleta; // Armazena o ZPL
                        encontrouItem = true;
                    }
                });

                if (encontrouItem) {
                    totalEtiquetasAssociadas++;
                    logAction({
                        acao: 'Etiqueta ZPL (ML) associada',
                        modulo: 'Expedição',
                        funcao: 'processZplFiles',
                        detalhes: { vendaId: idVenda, rastreio: codigoRastreio, arquivo: file.name }
                    });
                } else {
                    erros.push(`Nenhum pedido na expedição para o ID ${idVenda} (arquivo ${file.name}).`);
                }
            });

        } catch (error) {
            erros.push(`Falha ao ler o arquivo: ${file.name}`);
        }
    }

    if (totalEtiquetasAssociadas > 0) {
        await saveData();
        loadExpedicao();
        showToast(`${totalEtiquetasAssociadas} etiqueta(s) associada(s) com sucesso!`, 'success');
    }

    if (erros.length > 0) {
        setTimeout(() => alert(`Ocorreram ${erros.length} erros/avisos:\n\n- ${erros.join('\n- ')}`), 500);
    }
}

function parseZplForSaleId(zplContent) {
    const regexVendaDividida = /\^FD(Venda:|Pack ID:)\s*(\d+)\^FS(?:.|\n)*?\^FO\d+,\d+\^A0N,\d+,\d+\^FD(\d{11,})\^FS/;
    const match = zplContent.match(regexVendaDividida);
    if (match && match[2] && match[3]) return match[2] + match[3];

    const regexIdUnico = /\^FO\d+,\d+\^A0N,\d+,\d+\^FD(\d{11,})\^FS/;
    const matchIdUnico = zplContent.match(regexIdUnico);
    if (matchIdUnico && matchIdUnico[1]) return matchIdUnico[1];
    
    return null;
}

function extrairCodigoRastreio(zplContent) {
    const rastreioMatch = zplContent.match(/\^BCN.*?\^FD>:(.*?)\^FS/);
    if (rastreioMatch && rastreioMatch[1]) return rastreioMatch[1];
    
    const qrMatch = zplContent.match(/\^FDLA,{"id":"(.*?)"/);
    if (qrMatch && qrMatch[1]) return qrMatch[1];

    return null;
}

function extrairNfDaEtiqueta(zplContent) {
    const nfMatch = zplContent.match(/NF:\s*(\d+)/);
    return nfMatch ? nfMatch[1] : null;
}



// script.js

/**
 * Processa arquivos de etiqueta ZPL da Shopee, incluindo etiquetas comprimidas (Z64).
 * VERSÃO DEFINITIVA com extração via Regex para máxima precisão.
 * @param {FileList} files - A lista de arquivos ZPL/TXT selecionados pelo usuário.
 */
async function processarEtiquetasShopeeZPL(files) {
    if (!hasPermission('expedicao', 'editar')) {
        showToast('Permissão negada para associar etiquetas.', 'error');
        return;
    }

    showToast(`Iniciando associação de ${files.length} arquivo(s) de etiqueta da Shopee...`, 'info');

    let etiquetasAssociadas = 0;
    let errosEncontrados = [];

    for (const file of files) {
        try {
            const conteudoArquivo = await file.text();
            // A separação por ^XA continua sendo uma boa abordagem para múltiplas etiquetas.
            const etiquetasIndividuais = conteudoArquivo.split('^XA');

            for (let etiquetaZPL of etiquetasIndividuais) {
                if (etiquetaZPL.trim() === '') continue;

                let zplCompleto = '^XA' + etiquetaZPL;
                let zplLegivel = zplCompleto;

                if (zplCompleto.includes(':Z64:')) {
                    try {
                        // *** CORREÇÃO DEFINITIVA APLICADA AQUI ***
                        // 1. Usamos uma Regex para extrair APENAS o conteúdo Base64 entre :Z64: e ^FS.
                        const regex = /:Z64:([a-zA-Z0-9+/=\s\r\n]+)\^FS/;
                        const match = zplCompleto.match(regex);

                        // Se a regex não encontrar o padrão, pula para a próxima etiqueta.
                        if (!match || !match[1]) {
                            continue;
                        }

                        // 2. Pega o conteúdo capturado (match[1]) e remove quebras de linha e espaços.
                        const dadosComprimidosBase64Limpos = match[1].replace(/[\n\r\s]/g, '');

                        // 3. Decodifica e descomprime com segurança.
                        const dadosComprimidos = Uint8Array.from(atob(dadosComprimidosBase64Limpos), c => c.charCodeAt(0));
                        const dadosDescomprimidos = pako.inflate(dadosComprimidos, { to: 'string' });
                        zplLegivel = dadosDescomprimidos;

                    } catch (e) {
                        console.error("Falha ao descomprimir etiqueta ZPL:", e);
                        errosEncontrados.push(`Erro ao decodificar uma etiqueta comprimida no arquivo ${file.name}. Verifique o console.`);
                        continue;
                    }
                }

                // O restante do código permanece o mesmo...
                const idPedidoShopee = extrairIdPedidoShopee(zplLegivel);
                const codigoRastreio = extrairCodigoRastreioShopee(zplLegivel);

                if (!idPedidoShopee || !codigoRastreio) {
                    if (zplLegivel.length > 50) {
                       errosEncontrados.push(`Não foi possível extrair ID ou rastreio de uma etiqueta no arquivo ${file.name}.`);
                    }
                    continue;
                }

                const itemExpedicao = expedicao.find(item =>
                    item.pedidoId && item.pedidoId.includes(idPedidoShopee) && item.status !== 'Enviado'
                );

                if (itemExpedicao) {
                    itemExpedicao.codigoRastreio = codigoRastreio;
                    itemExpedicao.zplContent = zplCompleto;
                    etiquetasAssociadas++;
                    await logAction({
                        acao: 'Etiqueta ZPL (Shopee) associada',
                        modulo: 'Expedição',
                        funcao: 'processarEtiquetasShopeeZPL',
                        detalhes: { pedidoId: idPedidoShopee, rastreio: codigoRastreio, arquivo: file.name }
                    });
                } else {
                    errosEncontrados.push(`Nenhum pedido pendente na expedição encontrado para o ID Shopee: ${idPedidoShopee}.`);
                }
            }
        } catch (error) {
            errosEncontrados.push(`Falha ao ler o arquivo: ${file.name}.`);
            console.error("Erro ao processar arquivo ZPL da Shopee:", error);
        }
    }

    // Feedback final...
    if (etiquetasAssociadas > 0) {
        await saveData();
        loadExpedicao();
        showToast(`${etiquetasAssociadas} etiqueta(s) da Shopee foram associadas com sucesso!`, 'success');
    } else {
        showToast('Nenhuma nova etiqueta da Shopee foi associada.', 'info');
    }

    if (errosEncontrados.length > 0) {
        setTimeout(() => alert(`Ocorreram ${errosEncontrados.length} erros/avisos durante a associação:\n\n- ${errosEncontrados.join('\n- ')}`), 500);
    }
}


// As funções 'extrairIdPedidoShopee' e 'extrairCodigoRastreioShopee' permanecem as mesmas,
// pois elas agora operarão no ZPL já descomprimido.


/**
 * Extrai o ID do Pedido de um bloco de ZPL da Shopee.
 * Ex: 240916S35GBM9J
 * @param {string} zplContent - O conteúdo da etiqueta ZPL.
 * @returns {string|null} O ID do pedido ou null se não for encontrado.
 */
function extrairIdPedidoShopee(zplContent) {
    // Procura por um padrão de texto que geralmente precede o ID do pedido.
    // Este regex busca por uma sequência alfanumérica (letras e números) com 14 caracteres.
    const match = zplContent.match(/\^FD([A-Z0-9]{14})\^FS/);
    return match ? match[1] : null;
}

/**
 * Extrai o Código de Rastreio de um bloco de ZPL da Shopee.
 * Ex: BR248910081735S
 * @param {string} zplContent - O conteúdo da etiqueta ZPL.
 * @returns {string|null} O código de rastreio ou null se não for encontrado.
 */
function extrairCodigoRastreioShopee(zplContent) {
    // O código de rastreio geralmente está dentro do comando do código de barras (^BC) ou QR Code.
    // Este regex busca pelo padrão "BR" seguido de 14 caracteres (números e letras).
    const match = zplContent.match(/\^FD(BR[A-Z0-9]{14})\^FS/);
    if (match) return match[1];

    // Fallback: Tenta encontrar no conteúdo do código de barras diretamente.
    const barcodeMatch = zplContent.match(/\^BC[N,R,F,B,D].*?\^FD(BR[A-Z0-9]{14})\^FS/);
    return barcodeMatch ? barcodeMatch[1] : null;
}

function triggerShopeeZplUpload() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.zpl,.txt'; // Aceita arquivos .zpl e .txt
    fileInput.multiple = true; // Permite selecionar vários arquivos de uma vez
    fileInput.onchange = (event) => {
        if (event.target.files.length > 0) {
            processarEtiquetasShopeeZPL(event.target.files);
        }
    };
    fileInput.click();
}







// ... (código anterior do arquivo, como loadExpedicao, getStatusTodosPacotes, etc.)

// ======================= INÍCIO DA CORREÇÃO =======================
// >>> ADICIONE ESTA FUNÇÃO AO SEU ARQUIVO DE EXPEDIÇÃO <<<

/**
 * Renderiza o card de um pacote incompleto, mostrando exatamente o que falta.
 * @param {object} pacote - O objeto do pacote incompleto.
 * @returns {string} O HTML do card.
 */
function renderCardPacoteIncompleto(pacote) {
    const { id, cliente, skusFaltantes } = pacote;

    // Gera a lista de itens que ainda não chegaram na expedição.
    const listaFaltantesHtml = skusFaltantes.map(item =>
        `<li><span class="font-bold text-red-700">${item.falta}x</span> ${item.sku}</li>`
    ).join('');

    return `
        <div class="bg-white p-5 rounded-xl shadow-md border-l-4 border-yellow-400">
            <h4 class="font-bold text-lg text-yellow-800">${id}</h4>
            <p class="text-sm text-gray-600">${cliente || 'Cliente não informado'}</p>
            <div class="mt-3 pt-3 border-t">
                <p class="text-sm font-bold text-gray-700">Aguardando Itens:</p>
                <ul class="list-disc list-inside text-sm text-red-600">${listaFaltantesHtml}</ul>
            </div>
        </div>
    `;
}

// ======================== FIM DA CORREÇÃO =========================


// ... (resto do arquivo, como a lógica de upload de etiquetas, etc.)






// --- 43-funções-para-associação-visual-de-etiquetas-versão-final-corrigida-.js ---

// =================================================================================
// FUNÇÕES PARA ASSOCIAÇÃO VISUAL DE ETIQUETAS (VERSÃO FINAL CORRIGIDA )
// =================================================================================

// Variável global para guardar o estado do processo de associação
let associacaoPendente = {
    pdfDoc: null,       // O objeto PDF carregado pela pdf.js para visualização
    pdfBase64: null,    // O PDF em formato Base64 para ser salvo
    paginaAtual: 1,
    totalPaginas: 0
};

/**
 * Aciona o input para o usuário selecionar o arquivo PDF.
 */
async function triggerShopeePdfUpload() {
    if (!hasPermission('expedicao', 'editar')) {
        showToast('Permissão negada para associar etiquetas.', 'error');
        return;
    }
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf';
    fileInput.onchange = (event) => {
        const file = event.target.files[0];
        if (file) {
            iniciarAssociacaoVisual(file);
        }
    };
    fileInput.click();
}

/**
 * Inicia o processo de associação, carregando o PDF e abrindo o modal.
 */
async function iniciarAssociacaoVisual(file) {
    const modal = document.getElementById('associacao-visual-modal');
    const statusEl = document.getElementById('associacao-modal-status');

    modal.classList.remove('hidden');
    statusEl.innerText = 'Carregando arquivo PDF...';

    try {
        const pdfData = await file.arrayBuffer();
        
        // Converte para Base64 para ser salvo posteriormente
        const pdfBase64 = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });

        // Carrega o objeto PDF para visualização
        const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;

        associacaoPendente = {
            pdfDoc: pdfDoc,
            pdfBase64: pdfBase64, // Armazena o formato que pode ser salvo
            paginaAtual: 1,
            totalPaginas: pdfDoc.numPages
        };

        await renderizarConteudoModalAssociacao();

    } catch (error) {
        console.error("Erro ao iniciar associação visual:", error);
        showToast('Falha ao ler o arquivo PDF.', 'error');
        fecharModalAssociacaoVisual();
    }
}

/**
 * Função central que renderiza a página atual do PDF e a lista de pacotes.
 */
async function renderizarConteudoModalAssociacao() {
    const { pdfDoc, paginaAtual, totalPaginas } = associacaoPendente;

    const previewContainer = document.getElementById('associacao-etiqueta-preview');
    const listaPacotesContainer = document.getElementById('associacao-lista-pacotes');
    const statusEl = document.getElementById('associacao-modal-status');
    const contadorPaginasEl = document.getElementById('contador-paginas-etiqueta');
    const btnAnterior = document.getElementById('btn-etiqueta-anterior');
    const btnProxima = document.getElementById('btn-etiqueta-proxima');

    statusEl.innerText = `Navegue e selecione o pacote correspondente à etiqueta.`;
    contadorPaginasEl.innerText = `Página ${paginaAtual} de ${totalPaginas}`;
    previewContainer.innerHTML = '<p class="text-gray-500 animate-pulse">Renderizando etiqueta...</p>';

    btnAnterior.disabled = (paginaAtual <= 1);
    btnProxima.disabled = (paginaAtual >= totalPaginas);

    const page = await pdfDoc.getPage(paginaAtual);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    previewContainer.innerHTML = `<img src="${canvas.toDataURL()}" alt="Etiqueta ${paginaAtual}" class="max-w-full rounded-lg shadow-lg">`;

    const { pacotesCompletos } = getStatusTodosPacotes();
    const pacotesSemEtiqueta = pacotesCompletos.filter(p => {
        const item = expedicao.find(e => e.pedidoId === p.id);
        return item && !item.pdfEtiqueta && !item.zplContent;
    });

    if (pacotesSemEtiqueta.length === 0) {
        listaPacotesContainer.innerHTML = '<p class="text-center font-semibold text-green-600 p-4">Todos os pacotes prontos já possuem etiqueta!</p>';
    } else {
        listaPacotesContainer.innerHTML = pacotesSemEtiqueta.map(pacote => {
            const skuPrincipal = Object.keys(pacote.skus)[0] || 'N/A';
            return `
                <button onclick="confirmarAssociacaoVisual('${pacote.id}')" class="w-full text-left p-3 rounded-lg border hover:bg-indigo-100 hover:border-indigo-500 transition-all">
                    <p class="font-bold text-indigo-800">${pacote.id}</p>
                    <p class="text-sm text-gray-600">SKU principal: ${skuPrincipal} (${pacote.itensPresentes.length} itens)</p>
                </button>
            `;
        }).join('');
    }
}

/**
 * Permite navegar entre as páginas do PDF.
 */
async function navegarEtiqueta(direcao) {
    const novaPagina = associacaoPendente.paginaAtual + direcao;
    if (novaPagina > 0 && novaPagina <= associacaoPendente.totalPaginas) {
        associacaoPendente.paginaAtual = novaPagina;
        await renderizarConteudoModalAssociacao();
    }
}

/**
 * Executa a associação da página ATUAL da etiqueta ao ID do pacote clicado.
 * @param {string} pedidoId - O ID do pacote que o usuário selecionou.
 */
async function confirmarAssociacaoVisual(pedidoId) {
    if (!associacaoPendente.pdfBase64) {
        showToast('Erro: Nenhuma etiqueta pendente para associar.', 'error');
        return;
    }

    const itensDoPedido = expedicao.filter(item => item.pedidoId === pedidoId && item.status !== 'Enviado');

    if (itensDoPedido.length > 0) {
        // *** AQUI ESTÁ A CORREÇÃO PRINCIPAL ***
        // Salva o PDF em Base64 (que é uma string) e o número da página.
        // Isso é seguro para o JSON.stringify.
        itensDoPedido.forEach(item => {
            item.pdfEtiqueta = associacaoPendente.pdfBase64; 
            item.numeroPaginaEtiqueta = associacaoPendente.paginaAtual;
        });

        await saveData(); // Agora esta função não dará mais erro.
        loadExpedicao();
        showToast(`Etiqueta (Pág. ${associacaoPendente.paginaAtual}) associada ao pedido ${pedidoId}!`, 'success');
        await logAction({
            acao: 'Etiqueta PDF associada',
            modulo: 'Expedição',
            funcao: 'confirmarAssociacaoVisual',
            detalhes: { pedidoId: pedidoId, pagina: associacaoPendente.paginaAtual }
        });
        
        // Atualiza a lista de pacotes no modal para remover o que foi associado.
        await renderizarConteudoModalAssociacao();
    } else {
        showToast(`Nenhum item ativo encontrado na expedição para o pedido ${pedidoId}.`, 'error');
    }
}






/**
 * Fecha o modal de associação e reseta o estado.
 */
function fecharModalAssociacaoVisual() {
    const modal = document.getElementById('associacao-visual-modal');
    modal.classList.add('hidden');
    associacaoPendente = { pdfDoc: null, pdfBase64: null, paginaAtual: 1, totalPaginas: 0 };
}

/**
 * Imprime a etiqueta e dá baixa no pacote.
 * VERSÃO CORRIGIDA: Usa a biblioteca pdf-lib para extrair a página do Base64.
 */
async function imprimirEtiquetaEDarBaixa(pedidoId) {
    const itemExpedicao = expedicao.find(item => item.pedidoId === pedidoId);
    if (!itemExpedicao) {
        showToast('Erro: Pacote não encontrado na expedição.', 'error');
        return;
    }

    let etiquetaImpressa = false;
    if (itemExpedicao.pdfEtiqueta && itemExpedicao.numeroPaginaEtiqueta) {
        try {
            const { PDFDocument } = PDFLib;
            
            // Carrega o PDF original a partir do Base64 armazenado
            const pdfOriginalDoc = await PDFDocument.load(itemExpedicao.pdfEtiqueta);
            
            // Cria um novo documento documento PDF em branco
            const novoPdfDoc = await PDFDocument.create();

            // Copia a página específica do original para o novo documento
            const [paginaCopiada] = await novoPdfDoc.copyPages(pdfOriginalDoc, [itemExpedicao.numeroPaginaEtiqueta - 1]);
            novoPdfDoc.addPage(paginaCopiada);

            // Salva o novo documento (com uma única página) e dispara o download
            const pdfBytes = await novoPdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `etiqueta_shopee_${pedidoId.replace('#', '')}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            showToast(`Etiqueta individual para o pedido ${pedidoId} gerada.`, 'success');
            etiquetaImpressa = true;

        } catch (error) {
            console.error("Erro ao extrair página do PDF:", error);
            showToast("Erro ao gerar a etiqueta individual. Verifique o console.", "error");
            return;
        }
    } else if (itemExpedicao.zplContent) {
        // Lógica para ZPL (Mercado Livre) permanece a mesma
        // ... (código ZPL aqui) ...
        etiquetaImpressa = true;
    }

    if (!etiquetaImpressa) {
        showToast('Nenhuma etiqueta encontrada para este pedido.', 'error');
        return;
    }

    // Lógica de dar baixa (permanece a mesma)
    let itensEnviadosCount = 0;
    expedicao.forEach(item => {
        if (item.pedidoId === pedidoId && item.status !== 'Enviado') {
            item.status = 'Enviado';
            item.dataEnvio = new Date().toISOString();
            item.usuarioEnvio = currentUser.username;
            itensEnviadosCount++;
        }
    });

    if (itensEnviadosCount > 0) {
        await saveData();
        logAction({
            acao: 'Pacote enviado (baixa automática pós-impressão)',
            modulo: 'Expedição',
            funcao: 'imprimirEtiquetaEDarBaixa',
            detalhes: { pedidoId: pedidoId, itens: itensEnviadosCount, rastreio: itemExpedicao.codigoRastreio }
        });
        showToast(`Baixa automática do pacote ${pedidoId} realizada!`, 'success');
        
        loadExpedicao();
        
        const btn = document.getElementById('btn-imprimir-dar-baixa');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-check-circle"></i> Baixa Realizada`;
            btn.classList.replace('bg-blue-600', 'bg-green-600');
        }
    }
}



// Adicione este código ao seu arquivo 11-expedicao.js

/**
 * Abre o modal de conferência com todas as informações do pacote.
 * Esta função é o coração da nova funcionalidade.
 * @param {string} pedidoId - O ID do pacote a ser conferido.
 */
async function abrirModalConferencia(pedidoId) {
    // 1. Busca os elementos do modal no HTML
    const modal = document.getElementById('conferencia-modal');
    const infoContainer = document.getElementById('conferencia-pedido-info');
    const listaItensContainer = document.getElementById('conferencia-lista-itens');
    const modalFooter = document.getElementById('conferencia-modal-footer');

    // 2. Obtém os dados atualizados do pacote
    const { pacotesCompletos } = getStatusTodosPacotes();
    const pacote = pacotesCompletos.find(p => p.id === pedidoId);

    if (!pacote) {
        showToast(`Pacote ${pedidoId} não está mais completo ou não foi encontrado.`, 'error');
        return;
    }

    // 3. Monta o HTML com as informações gerais do pacote
    infoContainer.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div class="bg-white p-3 rounded-lg border"><strong>Pedido ID:</strong> <span class="font-bold text-gray-900">${pacote.id}</span></div>
            <div class="bg-white p-3 rounded-lg border"><strong>Marketplace:</strong> ${pacote.marketplace || 'N/A'}</div>
            <div class="bg-white p-3 rounded-lg border col-span-1 md:col-span-2"><strong>Tipo de Entrega:</strong> ${pacote.tipoEntrega || 'N/A'}</div>
        </div>
    `;

    // 4. Agrupa os SKUs para somar as quantidades de cada um
    const skusContados = pacote.itensPresentes.reduce((acc, item) => {
        acc[item.sku] = (acc[item.sku] || 0) + (item.quantidade || 1);
        return acc;
    }, {});

    // 5. Monta a lista de itens com FOTOS, SKUs e quantidades
    let itensHtml = '';
    for (const sku in skusContados) {
        const quantidade = skusContados[sku];
        // Utiliza a mesma função que busca imagens para os cards
        const imageUrl = getCardImageUrl(sku); 

        itensHtml += `
            <div class="flex items-center gap-4 bg-white p-3 rounded-lg border shadow-sm">
                <img src="${imageUrl}" alt="Foto do ${sku}" class="w-20 h-20 object-cover rounded-md border">
                <div class="flex-grow">
                    <p class="font-bold text-lg text-indigo-700">${sku}</p>
                </div>
                <div class="text-right">
                    <p class="text-sm text-gray-500">Quantidade</p>
                    <p class="text-3xl font-extrabold text-gray-800">${quantidade}</p>
                </div>
            </div>
        `;
    }
    listaItensContainer.innerHTML = itensHtml;


    // 6. Define o botão de ação final no rodapé do modal
    modalFooter.innerHTML = `
        <button onclick="confirmarItensEDarBaixa('${pacote.id}')" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl text-lg shadow-lg flex items-center justify-center gap-3 transition-transform transform hover:scale-105">
            <i class="fas fa-check-double"></i> Confirmar Itens e Liberar Baixa
        </button>
    `;

    // 7. Exibe o modal com uma animação
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden'); // Impede o scroll da página ao fundo
    setTimeout(() => {
        document.getElementById('conferencia-modal-content').classList.remove('scale-95', 'opacity-0');
        document.getElementById('conferencia-modal-content').classList.add('scale-100', 'opacity-100');
    }, 10);
}

/**
 * Fecha o modal de conferência.
 */
function fecharModalConferencia() {
    const modal = document.getElementById('conferencia-modal');
    const modalContent = document.getElementById('conferencia-modal-content');
    
    modalContent.classList.add('scale-95', 'opacity-0');
    modalContent.classList.remove('scale-100', 'opacity-100');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }, 200); // Tempo da animação
}

/**
 * Função chamada pelo botão "Confirmar". Ela efetivamente dá baixa no pacote e o move para o histórico.
 * @param {string} pedidoId - O ID do pacote a ser finalizado.
 */
async function confirmarItensEDarBaixa(pedidoId) {
    if (!hasPermission('expedicao', 'darBaixa')) {
        showToast('Permissão negada para dar baixa em pacotes.', 'error');
        return;
    }

    // Move todos os itens do pacote para o histórico
    const pacoteParaMover = expedicao.filter(item => item.pedidoId === pedidoId);
    if (pacoteParaMover.length > 0) {
        const infoPacote = getStatusTodosPacotes().pacotesCompletos.find(p => p.id === pedidoId);

        historicoExpedicao.push({
            pedidoId: pedidoId,
            itens: infoPacote.itensPresentes,
            dataEnvio: new Date().toISOString(),
            usuarioEnvio: currentUser.username,
            marketplace: infoPacote.marketplace,
            tipoEntrega: infoPacote.tipoEntrega,
        });

        // Remove os itens da expedição
        expedicao = expedicao.filter(item => item.pedidoId !== pedidoId);

        await saveData();
        await logAction({
            acao: `Pacote conferido e enviado`,
            modulo: 'Expedição',
            funcao: 'confirmarItensEDarBaixa',
            detalhes: { pedidoId: pedidoId, quantidade_itens: pacoteParaMover.length }
        });

        showToast(`Pacote ${pedidoId} conferido e enviado com sucesso!`, 'success');
        
        fecharModalConferencia();
        loadExpedicao(); // Recarrega a tela da expedição para remover o card
    } else {
        showToast('Erro: Pacote não encontrado para dar baixa.', 'error');
    }
}
