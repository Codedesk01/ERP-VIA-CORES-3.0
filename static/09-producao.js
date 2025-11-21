// ================================================================================
// 09 PRODUCAO
// ================================================================================


// --- 28-módulo-de-produção-lógica-atualizada-para-abas.js ---

// =================================================================================
// MÓDULO DE PRODUÇÃO (LÓGICA ATUALIZADA PARA ABAS)
// =================================================================================

/**
 * Função principal que carrega e organiza a tela de Produção, separando os itens por abas.
 */
function loadProducao() {
    if (!hasPermission('producao', 'visualizar')) return;
    document.getElementById('producao-data-atualizacao').innerHTML = `Última atualização: <strong>${new Date().toLocaleString('pt-BR')}</strong>`;

    const contadorTotal = document.getElementById('contador-producao-total');
    const contadorML = document.getElementById('contador-producao-ml');
    const contadorShopee = document.getElementById('contador-producao-shopee');
    const contadorVC = document.getElementById('contador-producao-vc');

    const containerML = document.getElementById('producao-ml-content');
    const containerShopee = document.getElementById('producao-shopee-content');
    const containerVC = document.getElementById('producao-vc-content');

    if (!containerML || !containerShopee || !containerVC) return;

    containerML.innerHTML = '';
    containerShopee.innerHTML = '';
    containerVC.innerHTML = '';

    contadorTotal.innerText = producao.length;

    const producaoML = producao.filter(p => p.marketplace === 'Mercado Livre');
    const producaoShopee = producao.filter(p => p.marketplace === 'Shopee');
    const producaoVC = producao.filter(p => p.marketplace !== 'Mercado Livre' && p.marketplace !== 'Shopee');

    contadorML.innerText = producaoML.length;
    contadorShopee.innerText = producaoShopee.length;
    contadorVC.innerText = producaoVC.length;

    renderizarGruposPorAba(producaoML, containerML);
    renderizarGruposPorAba(producaoShopee, containerShopee);
    renderizarGruposPorAba(producaoVC, containerVC);
    
    atualizarPainelAcoesProducao();
    applyPermissionsToUI();
}

/**
 * Agrupa e renderiza os itens de uma lista dentro do container de uma aba específica.
 * @param {Array} listaItens - A lista de itens de produção para uma origem (ex: apenas ML).
 * @param {HTMLElement} containerAba - O elemento HTML da aba onde os grupos serão renderizados.
 */
function renderizarGruposPorAba(listaItens, containerAba) {
    if (listaItens.length === 0) {
        containerAba.innerHTML = '<p class="text-center text-gray-500 text-lg py-16">A fila de produção para esta origem está vazia.</p>';
        return;
    }

    const producaoAgrupada = listaItens.reduce((acc, item) => {
        const grupo = getGrupoSku(item.sku);
        if (!acc[grupo]) acc[grupo] = [];
        acc[grupo].push(item);
        return acc;
    }, {});

    const ordemGrupos = ['CL', 'FF', 'KC', 'KD', 'PC', 'PH', 'PR', 'PV', 'PV-ESPECIAL', 'RV', 'TP', 'VC', 'PA', 'OUTROS'];
    
    ordemGrupos.forEach(grupo => {
        if (producaoAgrupada[grupo]) {
            renderGrupoProducao(grupo, producaoAgrupada[grupo], containerAba);
        }
    });
}

/**
 * Renderiza uma seção completa para um grupo de SKU (ex: "Grupo PC") dentro de uma aba.
 * Esta função permanece quase a mesma, apenas renderiza em um container diferente.
 * @param {string} nomeGrupo - O nome do grupo (ex: "PC").
 * @param {Array} itensGrupo - A lista de itens de produção pertencentes a esse grupo.
 * @param {HTMLElement} containerPai - O elemento HTML da aba onde a seção do grupo será adicionada.
 */
function renderGrupoProducao(nomeGrupo, itensGrupo, containerPai) {
    const hojeString = new Date().toLocaleDateString('pt-BR');
    const itensParaHoje = itensGrupo.filter(item => item.dataColeta === hojeString);
    const itensProximosDias = itensGrupo.filter(item => item.dataColeta !== hojeString);

    itensProximosDias.sort((a, b) => new Date(a.dataColeta.split('/').reverse().join('-')) - new Date(b.dataColeta.split('/').reverse().join('-')));

    const grupoHtml = `
        <div class="bg-white/90 p-6 rounded-2xl shadow-xl">
            <h3 class="text-2xl font-bold text-gray-800 mb-6 border-b pb-4">Grupo: ${nomeGrupo}</h3>
            <div>
                <h4 class="text-lg font-semibold text-blue-600 mb-4">Para Entregar Hoje (${hojeString})</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">${renderCardsProducao(itensParaHoje)}</div>
            </div>
            <div class="mt-8 pt-6 border-t">
                <h4 class="text-lg font-semibold text-gray-700 mb-4">Próximos Dias</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">${renderCardsProducao(itensProximosDias)}</div>
            </div>
        </div>
    `;
    containerPai.innerHTML += grupoHtml;
}



/**
 * NOVA FUNÇÃO: Controla a visibilidade das abas no módulo de Produção.
 * @param {'ml' | 'shopee' | 'vc'} tabName - O nome da aba a ser exibida.
 */
function showProducaoTab(tabName) {
    document.querySelectorAll('.producao-tab-content').forEach(content => content.classList.add('hidden'));
    document.querySelectorAll('.producao-tab-btn').forEach(btn => {
        btn.classList.remove('border-indigo-600', 'text-indigo-600');
        btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
    });
    document.getElementById(`producao-${tabName}-content`)?.classList.remove('hidden');
    document.getElementById(`tab-producao-${tabName}`)?.classList.add('border-indigo-600', 'text-indigo-600');
    document.getElementById(`tab-producao-${tabName}`)?.classList.remove('border-transparent', 'text-gray-500');
}



// ... (código anterior do arquivo permanece o mesmo) ...

/**
 * Gera o HTML para uma lista de cards de produção, com destaque para Motoboy.
 * @param {Array} listaItens - A lista de itens para renderizar.
 * @returns {string} O HTML dos cards ou uma mensagem de "nenhum item".
 */
function renderCardsProducao(listaItens) {
    if (listaItens.length === 0) {
        return '<p class="col-span-full text-center text-gray-500 text-sm py-4">Nenhum item nesta seção.</p>';
    }
    return listaItens.map(item => {
        const imageUrl = getCardImageUrl(item.sku);
        const checkboxId = `prod-check-${item.op}`;
        const isMotoboy = item.tipoEntrega === 'Motoboy';
        const cardClasses = isMotoboy ? 'motoboy-card' : 'bg-white border-gray-200';
        const dataColetaClass = isMotoboy ? 'text-purple-700 font-bold animate-pulse' : 'text-gray-600';
        const tipoEntregaIcon = isMotoboy ? 'fa-motorcycle text-purple-700' : 'fa-box-open text-gray-500';

        return `
            <div class="producao-card p-4 rounded-xl shadow-md border flex flex-col justify-between transition-all hover:shadow-lg hover:scale-[1.02] ${cardClasses}">
                <div>
                    <img src="${imageUrl}" alt="Arte para ${item.sku}" class="w-full h-40 object-cover rounded-lg mb-3 cursor-pointer" onclick="openImageZoomModal('${imageUrl}')">
                    <p class="font-bold text-xl text-gray-800 truncate" title="${item.sku}">${item.sku}</p>
                    <div class="flex justify-between items-center text-sm mt-2">
                        <span class="font-semibold ${dataColetaClass}"><i class="fas fa-calendar-alt mr-2"></i>${item.dataColeta}</span>
                        <span class="font-semibold flex items-center gap-2"><i class="fas ${tipoEntregaIcon}"></i>${item.tipoEntrega}</span>
                    </div>
                </div>
                <div class="flex items-center justify-end bg-gray-50 p-2 rounded-lg mt-4">
                    <label for="${checkboxId}" class="flex items-center cursor-pointer text-sm font-semibold text-gray-700">
                        <input type="checkbox" id="${checkboxId}" data-op="${item.op}" onchange="atualizarPainelAcoesProducao()" class="producao-checkbox h-5 w-5 text-green-600 border-gray-300 rounded focus:ring-green-500 mr-2">
                        Marcar para Concluir
                    </label>
                </div>
            </div>
        `;
    }).join('');
}





/**
 * Atualiza a visibilidade e o contador do painel de ações em massa da produção.
 * A função agora também renderiza os botões de ação com base nas permissões do usuário.
 */
function atualizarPainelAcoesProducao() {
    const painel = document.getElementById('producao-painel-acoes');
    const contador = document.getElementById('producao-contador-selecionados');
    const selecionados = document.querySelectorAll('.producao-checkbox:checked');

    if (selecionados.length > 0) {
        contador.innerText = selecionados.length;
        painel.classList.remove('hidden');
        
        const containerBotoes = document.getElementById('producao-container-botoes');
        if (containerBotoes) {
            let botoesHtml = '';
            
            if (hasPermission('producao', 'moverParaCostura')) {
                botoesHtml += `<button onclick="confirmarConclusaoProducao()" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-blue-700 transition-colors"><i class="fas fa-cut mr-2"></i> Mover para Costura</button>`;
            }
            if (hasPermission('producao', 'moverParaExpedicao')) {
                botoesHtml += `<button onclick="confirmarMoverParaExpedicao()" class="flex-1 bg-yellow-500 text-white px-4 py-2 rounded-xl font-semibold hover:bg-yellow-600 transition-colors"><i class="fas fa-truck-loading mr-2"></i> Mover para Expedição</button>`;
            }
            if (hasPermission('producao', 'finalizar')) {
                botoesHtml += `<button onclick="confirmarFinalizarProducao()" class="flex-1 bg-red-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-red-700 transition-colors"><i class="fas fa-check-circle mr-2"></i> Finalizar</button>`;
            }
            containerBotoes.innerHTML = botoesHtml;
        }
    } else {
        painel.classList.add('hidden');
    }
}



/**
 * Confirma e move todos os itens de produção selecionados diretamente para a Expedição.
 */
async function confirmarMoverParaExpedicao() {
    const selecionados = document.querySelectorAll('.producao-checkbox:checked');
    if (selecionados.length === 0) return showToast('Nenhum item selecionado.', 'info');
    if (!confirm(`Tem certeza que deseja mover os ${selecionados.length} itens DIRETAMENTE para a Expedição?`)) return;

    showToast(`Movendo ${selecionados.length} itens para Expedição...`, 'info');

    const promessas = Array.from(selecionados).map(checkbox => {
        const op = checkbox.dataset.op;
        return fetch(`/api/production/move-to-expedition/${op}`, { method: 'POST' });
    });

    try {
        const resultados = await Promise.all(promessas);
        const sucesso = resultados.filter(res => res.ok).length;
        const falhas = selecionados.length - sucesso;

        if (sucesso > 0) {
            const opsMovidas = Array.from(selecionados).map(c => c.dataset.op);
            await logAction({ acao: `Itens movidos da Produção para Expedição`, modulo: 'Produção', detalhes: { quantidade: sucesso, ops: opsMovidas.join(', ') } });
            showToast(`${sucesso} item(ns) enviados para a Expedição!`, 'success');
        }
        if (falhas > 0) showToast(`${falhas} item(ns) falharam ao serem movidos.`, 'error');
        
        atualizarPainelAcoesProducao();
    } catch (error) {
        console.error("Erro ao mover itens para Expedição:", error);
        showToast('Ocorreu um erro de comunicação.', 'error');
    }
}

/**
 * Confirma e finaliza todos os itens de produção selecionados, movendo-os para o Histórico.
 */
async function confirmarFinalizarProducao() {
    const selecionados = document.querySelectorAll('.producao-checkbox:checked');
    if (selecionados.length === 0) return showToast('Nenhum item selecionado.', 'info');
    if (!confirm(`Tem certeza que deseja FINALIZAR os ${selecionados.length} itens e movê-los para o Histórico?`)) return;

    showToast(`Finalizando ${selecionados.length} itens...`, 'info');

    const promessas = Array.from(selecionados).map(checkbox => {
        const op = checkbox.dataset.op;
        return fetch(`/api/production/finalize/${op_id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: usuarioAtual }) // ← nome do usuário logado
});
    });

    try {
        const resultados = await Promise.all(promessas);
        const sucesso = resultados.filter(res => res.ok).length;
        const falhas = selecionados.length - sucesso;

        if (sucesso > 0) {
            const opsFinalizadas = Array.from(selecionados).map(c => c.dataset.op);
            await logAction({ acao: `Itens finalizados na Produção`, modulo: 'Produção', detalhes: { quantidade: sucesso, ops: opsFinalizadas.join(', ') } });
            showToast(`${sucesso} item(ns) finalizados e enviados para o Histórico!`, 'success');
        }
        if (falhas > 0) showToast(`${falhas} item(ns) falharam ao serem finalizados.`, 'error');

        atualizarPainelAcoesProducao();
    } catch (error) {
        console.error("Erro ao finalizar itens:", error);
        showToast('Ocorreu um erro de comunicação.', 'error');
    }
}
  //====================================
        // LÓGICA DE RENDERIZAÇÃO CONDICIONAL DOS BOTÕES
        // =================================================================
         // =================================================================
const containerBotoes = document.getElementById('producao-container-botoes');
if (containerBotoes) {
    let botoesHtml = '';
    
    // Botão 1: Mover para Costura (AZUL)
    if (hasPermission('producao', 'moverParaCostura')) {
        botoesHtml += `
            <button onclick="confirmarConclusaoProducao()" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-blue-700 transition-colors">
                <i class="fas fa-cut mr-2"></i> Mover para Costura
            </button>
        `;
    }
    
    // Botão 2: Mover para Expedição (AMARELO)
    if (hasPermission('producao', 'moverParaExpedicao')) {
        botoesHtml += `
            <button onclick="confirmarMoverParaExpedicao()" class="flex-1 bg-yellow-500 text-white px-4 py-2 rounded-xl font-semibold hover:bg-yellow-600 transition-colors">
                <i class="fas fa-truck-loading mr-2"></i> Mover para Expedição
            </button>
        `;
    }
    
    // Botão 3: Finalizar (VERMELHO)
    if (hasPermission('producao', 'finalizar')) {
        botoesHtml += `
            <button onclick="confirmarFinalizarProducao()" class="flex-1 bg-red-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-red-700 transition-colors">
                <i class="fas fa-check-circle mr-2"></i> Finalizar
            </button>
        `;
    }
    
    containerBotoes.innerHTML = botoesHtml;
}
// =================================================================



/**
 * Confirma e move todos os itens de produção selecionados diretamente para a Expedição.
 */
async function confirmarMoverParaExpedicao() {
    if (!hasPermission('producao', 'moverParaExpedicao')) {
        showToast('Permissão negada para mover itens para a Expedição.', 'error');
        return;
    }
    const selecionados = document.querySelectorAll('.producao-checkbox:checked');
    if (selecionados.length === 0) {
        showToast('Nenhum item selecionado.', 'info');
        return;
    }

    if (!confirm(`Tem certeza que deseja mover os ${selecionados.length} itens selecionados DIRETAMENTE para a Expedição?`)) {
        return;
    }

    showToast(`Movendo ${selecionados.length} itens para Expedição... Por favor, aguarde.`, 'info');

    const promessasDeMovimentacao = Array.from(selecionados).map(checkbox => {
        const op = checkbox.dataset.op;
        // Chama a nova rota de API
        return fetch(`/api/production/move-to-expedition/${op}`, {
            method: 'POST'
        });
    });

    try {
        const resultados = await Promise.all(promessasDeMovimentacao);
        const falhas = resultados.filter(res => !res.ok).length;
        const sucesso = selecionados.length - falhas;

        if (sucesso > 0) {
            const opsMovidas = Array.from(selecionados).map(c => c.dataset.op);
            await logAction({
                acao: `Itens movidos para a Expedição`,
                modulo: 'Produção',
                funcao: 'confirmarMoverParaExpedicao',
                detalhes: {
                    quantidade: sucesso,
                    ops: opsMovidas.join(', ')
                }
            });
            showToast(`${sucesso} item(ns) enviados para a Expedição com sucesso!`, 'success');
        }
        if (falhas > 0) {
            showToast(`${falhas} item(ns) falharam ao serem movidos para a Expedição.`, 'error');
        }
        
        // O socket já deve ter atualizado a tela, mas forçamos a atualização do painel de ações
        atualizarPainelAcoesProducao();

    } catch (error) {
        console.error("Erro ao mover itens em massa para Expedição:", error);
        showToast('Ocorreu um erro de comunicação. Alguns itens podem não ter sido movidos.', 'error');
    }
}

/**
 * Confirma e finaliza todos os itens de produção selecionados, movendo-os para o Histórico.
 */
async function confirmarFinalizarProducao() {
    if (!hasPermission('producao', 'finalizar')) {
        showToast('Permissão negada para finalizar itens de produção.', 'error');
        return;
    }
    const selecionados = document.querySelectorAll('.producao-checkbox:checked');
    if (selecionados.length === 0) {
        showToast('Nenhum item selecionado.', 'info');
        return;
    }

    if (!confirm(`Tem certeza que deseja FINALIZAR os ${selecionados.length} itens selecionados e movê-los para o Histórico de Expedição?`)) {
        return;
    }

    showToast(`Finalizando ${selecionados.length} itens... Por favor, aguarde.`, 'info');

    const promessasDeFinalizacao = Array.from(selecionados).map(checkbox => {
        const op = checkbox.dataset.op;
        // Chama a nova rota de API
        return fetch(`/api/production/finalize/${op}`, {
            method: 'POST'
        });
    });

    try {
        const resultados = await Promise.all(promessasDeFinalizacao);
        const falhas = resultados.filter(res => !res.ok).length;
        const sucesso = selecionados.length - falhas;

        if (sucesso > 0) {
            const opsFinalizadas = Array.from(selecionados).map(c => c.dataset.op);
            await logAction({
                acao: `Itens finalizados na Produção`,
                modulo: 'Produção',
                funcao: 'confirmarFinalizarProducao',
                detalhes: {
                    quantidade: sucesso,
                    ops: opsFinalizadas.join(', ')
                }
            });
            showToast(`${sucesso} item(ns) finalizados e enviados para o Histórico com sucesso!`, 'success');
        }
        if (falhas > 0) {
            showToast(`${falhas} item(ns) falharam ao serem finalizados.`, 'error');
        }
        
        // O socket já deve ter atualizado a tela, mas forçamos a atualização do painel de ações
        atualizarPainelAcoesProducao();

    } catch (error) {
        console.error("Erro ao finalizar itens em massa:", error);
        showToast('Ocorreu um erro de comunicação. Alguns itens podem não ter sido finalizados.', 'error');
    }
}

// ================================================================================
// 09 PRODUCAO
// ================================================================================


// --- 28-módulo-de-produção-lógica-atualizada-para-abas.js ---



/**
 * Confirma e move todos os itens de produção selecionados para a costura.
 * VERSÃO OTIMIZADA: Usa rotas de API individuais para cada item, garantindo
 * uma resposta instantânea da interface sem a necessidade de recarregar a página (F5).
 */
async function confirmarConclusaoProducao() {
    const selecionados = document.querySelectorAll('.producao-checkbox:checked');
    if (selecionados.length === 0) return showToast('Nenhum item selecionado.', 'info');
    if (!confirm(`Tem certeza que deseja mover os ${selecionados.length} itens selecionados para a Costura?`)) return;

    showToast(`Movendo ${selecionados.length} itens para Costura...`, 'info');

    const promessas = Array.from(selecionados).map(async checkbox => {
        const op = checkbox.dataset.op;
        const itemMovido = producao.find(item => item.op === op);
        if (!itemMovido) return;

        await fetch(`/api/production/items/${op}`, { method: 'DELETE' });
        await fetch('/api/sewing/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                item_id: `LOTE-${Date.now()}-${op}`,
                detalhes: { ...itemMovido, status: 'Aguardando Costura' }
            })
        });
    });

    try {
        await Promise.all(promessas);
        const opsMovidas = Array.from(selecionados).map(c => c.dataset.op);
        await logAction({ acao: `Itens movidos para a Costura`, modulo: 'Produção', detalhes: { quantidade: selecionados.length, ops: opsMovidas.join(', ') } });
        showToast(`${selecionados.length} item(ns) enviados para a Costura!`, 'success');
    } catch (error) {
        console.error("Erro ao mover itens para Costura:", error);
        showToast('Ocorreu um erro de comunicação.', 'error');
    }
}







function renderFilaProducao(itensFila, idImpressora) {
    const container = document.getElementById(`producao-fila-${idImpressora}`);
    if (!container) return;

    if (itensFila.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 text-sm pt-10">Fila vazia.</p>';
        return;
    }

    // Mapa de imagens para acesso rápido.
    const imageMap = images.reduce((acc, img) => {
        acc[img.nome.toUpperCase()] = img.url;
        return acc;
    }, {});
    
    // Mapa de estoque para acesso rápido.
    const estoqueMap = itensEstoque.reduce((acc, item) => {
        const sku = item.sku.toUpperCase();
        acc[sku] = (acc[sku] || 0) + item.qtd;
        return acc;
    }, {});

    container.innerHTML = itensFila.map(item => {
        const imageUrl = imageMap[item.sku.toUpperCase()] || 'https://via.placeholder.com/150?text=Sem+Img';
        const estoqueDisponivel = estoqueMap[item.sku.toUpperCase( )] || 0;
        
        // Encontra o pedido original para pegar a data de coleta.
        const pedidoOriginal = pedidos.find(p => p.id === item.pedidoId && p.sku === item.sku);
        const dataColeta = pedidoOriginal ? pedidoOriginal.dataColeta : 'N/A';
        
        const isMotoboy = item.tipoEntrega === 'Motoboy';
        const motoboyClass = isMotoboy ? 'bg-purple-100 border-purple-500' : 'bg-white border-gray-200';
        const dataColetaClass = isMotoboy ? 'text-purple-700 font-bold animate-pulse' : 'text-gray-600';

        return `
            <div class="producao-card p-4 rounded-xl shadow-md border flex flex-col justify-between transition-all hover:shadow-lg hover:scale-[1.02] ${motoboyClass}">
                <!-- Imagem -->
                <img src="${imageUrl}" alt="Arte para ${item.sku}" class="w-full h-32 object-cover rounded-lg mb-3 cursor-pointer" onclick="openImageZoomModal('${imageUrl}')">
                
                <!-- Informações do SKU -->
                <p class="font-bold text-lg text-gray-800">${item.sku}</p>
                <div class="flex justify-between items-center text-sm mt-2">
                    <span class="text-gray-500">Estoque: <strong class="text-blue-600">${estoqueDisponivel}</strong></span>
                    <span class="font-semibold ${dataColetaClass}">Envio: ${dataColeta}</span>
                </div>

                <!-- Ações -->
                <div class="grid grid-cols-2 gap-2 mt-4 text-xs">
                    <button onclick="moverProducaoParaCostura('${item.op}')" class="w-full bg-green-500 text-white p-2 rounded-lg font-semibold hover:bg-green-600" data-permission="producao:editar">
                        <i class="fas fa-check-circle mr-1"></i> Concluído
                    </button>
                    <button onclick="cancelarProducao('${item.op}')" class="w-full bg-red-500 text-white p-2 rounded-lg font-semibold hover:bg-red-600" data-permission="producao:excluir">
                        <i class="fas fa-times-circle mr-1"></i> Cancelar
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Move um item da produção para a costura.
 * @param {string} op - A Ordem de Produção do item.
 */
async function moverProducaoParaCostura(op) {
    if (!hasPermission('costura', 'adicionar')) {
        showToast('Permissão negada para enviar para a costura.', 'error');
        return;
    }

    const itemIndex = producao.findIndex(item => item.op === op);
    if (itemIndex === -1) {
        showToast('Item de produção não encontrado.', 'error');
        return;
    }

    const [itemMovido] = producao.splice(itemIndex, 1);
    
    // Adiciona o item à fila da costura
    costura.push({
        lote: `LOTE-${Date.now()}`,
        op: itemMovido.op,
        sku: itemMovido.sku,
        status: 'Aguardando Costura',
        pedidoId: itemMovido.pedidoId
    });

    await saveData();
    loadProducao(); // Recarrega a tela de produção para atualizar as filas
    await logAction(`Item ${itemMovido.sku} (OP: ${itemMovido.op}) movido para a Costura.`);
    showToast(`Item ${itemMovido.sku} enviado para a Costura.`, 'success');
}

/**
 * Cancela um item que está na fila de produção.
 * O item volta para a lista de pedidos pendentes.
 * @param {string} op - A Ordem de Produção do item.
 */
async function cancelarProducao(op) {
    if (!hasPermission('producao', 'excluir')) {
        showToast('Permissão negada para cancelar produção.', 'error');
        return;
    }

    const itemIndex = producao.findIndex(item => item.op === op);
    if (itemIndex === -1) {
        showToast('Item de produção não encontrado.', 'error');
        return;
    }

    if (confirm('Tem certeza que deseja cancelar a produção deste item? Ele voltará para a fila de pedidos pendentes.')) {
        const [itemCancelado] = producao.splice(itemIndex, 1);

        // Encontra o pedido original e o reverte para 'Pendente'
        const pedidoOriginalIndex = pedidos.findIndex(p => p.id === itemCancelado.pedidoId && p.sku === itemCancelado.sku);
        if (pedidoOriginalIndex !== -1) {
            pedidos[pedidoOriginalIndex].status = 'Pendente';
            delete pedidos[pedidoOriginalIndex].destino;
            delete pedidos[pedidoOriginalIndex].impressora;
            delete pedidos[pedidoOriginalIndex].dataProcessamento;
        }
        
        // Remove o registro do histórico de artes, pois a produção foi cancelada
        historicoArtes = historicoArtes.filter(h => !(h.sku === itemCancelado.sku && h.impressora === itemCancelado.impressora));

        await saveData();
        loadProducao(); // Recarrega a tela de produção
        await logAction(`Produção do item ${itemCancelado.sku} (OP: ${op}) cancelada.`);
        showToast(`Produção de ${itemCancelado.sku} cancelada.`, 'info');
    }
}

// SUBSTITUA A FUNÇÃO 'addProducao' PELA VERSÃO OTIMIZADA ABAIXO

async function addProducao() {
    if (!hasPermission('producao', 'adicionar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const produto = document.getElementById('producao-produto').value;
    const quantidade = document.getElementById('producao-qtd').value;
    if (!produto || !quantidade) {
        showToast('Preencha o produto e a quantidade.', 'error');
        return;
    }
    const novoItem = {
        op: `OP-${Date.now()}`,
        produto: produto,
        quantidade: parseInt(quantidade),
        status: 'Aguardando'
    };

    try {
        // Chama a rota leve para adicionar
        const response = await fetch('/api/production/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(novoItem)
        });

        if (!response.ok) {
            throw new Error('Falha ao criar ordem de produção no servidor.');
        }

        showToast('Ordem de produção criada!', 'success');
        document.getElementById('producao-produto').value = '';
        document.getElementById('producao-qtd').value = '';

    } catch (error) {
        console.error("Erro ao criar OP:", error);
        showToast('Erro de comunicação ao criar OP.', 'error');
    }
}

// SUBSTITUA A FUNÇÃO 'deleteProducao' PELA VERSÃO OTIMIZADA ABAIXO

async function deleteProducao(opId) { // A função agora recebe o ID da OP
    if (!hasPermission('producao', 'excluir')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    
    if (confirm(`Tem certeza que deseja excluir a ordem de produção ${opId}?`)) {
        try {
            // Chama a rota leve para deletar
            const response = await fetch(`/api/production/items/${opId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Falha ao excluir a OP no servidor.');
            }
            
            showToast('Ordem de produção excluída.', 'success');

        } catch (error) {
            console.error("Erro ao excluir OP:", error);
            showToast('Erro de comunicação ao excluir OP.', 'error');
        }
    }
}



// --- 36-funções-do-modal-de-histórico-de-artes.js ---

// =================================================================================
// FUNÇÕES DO MODAL DE HISTÓRICO DE ARTES
// =================================================================================

/**
 * Abre o modal do histórico completo de artes.
 */
function openArtHistoryModal() {
    const modal = document.getElementById('art-history-modal');
    const modalContent = document.getElementById('art-history-modal-content');
    
    // Limpa os filtros antes de abrir
    document.getElementById('art-history-filter-sku').value = '';
    document.getElementById('art-history-filter-impressora').value = '';
    document.getElementById('art-history-filter-data').value = '';

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    
    // Renderiza o conteúdo do modal com todos os dados (sem filtros)
    renderArtHistoryModal();

    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
}

/**
 * Fecha o modal do histórico completo de artes.
 */
function closeArtHistoryModal() {
    const modal = document.getElementById('art-history-modal');
    const modalContent = document.getElementById('art-history-modal-content');
    
    modalContent.classList.add('scale-95', 'opacity-0');
    modalContent.classList.remove('scale-100', 'opacity-100');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }, 200);
}

/**
 * Filtra e renderiza os dados na tabela do modal de histórico de artes.
 */
function renderArtHistoryModal() {
    const tableBody = document.getElementById('art-history-modal-table')?.querySelector('tbody');
    if (!tableBody) return;

    // Pega os valores dos filtros
    const filterSku = document.getElementById('art-history-filter-sku').value.trim().toLowerCase();
    const filterImpressora = document.getElementById('art-history-filter-impressora').value;
    const filterData = document.getElementById('art-history-filter-data').value;

    // Filtra o array completo 'historicoArtes'
    const historicoFiltrado = historicoArtes.filter(item => {
        const skuMatch = !filterSku || item.sku.toLowerCase().includes(filterSku);
        const impressoraMatch = !filterImpressora || item.impressora === filterImpressora;
        
        let dataMatch = true;
        if (filterData) {
            const itemDate = new Date(item.timestamp).toLocaleDateString('en-CA'); // Formato YYYY-MM-DD
            dataMatch = itemDate === filterData;
        }

        return skuMatch && impressoraMatch && dataMatch;
    });

    // Renderiza a tabela
    if (historicoFiltrado.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-8 text-gray-500">Nenhum registro encontrado com os filtros aplicados.</td></tr>`;
    } else {
        tableBody.innerHTML = historicoFiltrado.map(item => `
            <tr class="border-b hover:bg-gray-100">
                <td class="p-3 text-sm text-gray-600">${new Date(item.timestamp).toLocaleString('pt-BR')}</td>
                <td class="p-3 text-sm font-semibold text-indigo-700">${item.sku}</td>
                <td class="p-3 text-sm font-bold text-center">${item.quantidade}</td>
                <td class="p-3 text-sm text-center">Imp. ${item.impressora}</td>
                <td class="p-3 text-sm text-gray-700">${item.usuario}</td>
            </tr>
        `).join('');
    }
}