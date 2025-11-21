// ================================================================================
// 10 COSTURA
// ================================================================================


// --- 29-módulo-costura.js ---

// =================================================================================
// MÓDULO COSTURA
// =================================================================================


// SUBSTITUA A FUNÇÃO 'addCostura' PELA VERSÃO OTIMIZADA ABAIXO

async function addCostura() {
    if (!hasPermission('costura', 'adicionar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const peca = document.getElementById('costura-peca').value;
    const costureira = document.getElementById('costura-costureira').value;
    if (!peca || !costureira) {
        showToast('Preencha a peça e a costureira.', 'error');
        return;
    }
    
    const novoItem = {
        lote: `LOTE-${Date.now()}`,
        peca: peca,
        costureira: costureira,
        status: 'Em andamento'
    };

    try {
        // Chama a nova rota leve para adicionar o item
        const response = await fetch('/api/sewing/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(novoItem)
        });

        if (!response.ok) {
            throw new Error('Falha ao adicionar lote de costura no servidor.');
        }

        // O backend notificará todos os clientes, incluindo este.
        // A UI será atualizada pelo listener do socket.
        showToast('Lote de costura adicionado com sucesso!', 'success');
        document.getElementById('costura-peca').value = '';
        document.getElementById('costura-costureira').value = '';

    } catch (error) {
        console.error("Erro ao adicionar lote de costura:", error);
        showToast('Erro de comunicação ao adicionar lote.', 'error');
    }
}

// SUBSTITUA A FUNÇÃO 'deleteCostura' PELA VERSÃO OTIMIZADA ABAIXO

async function deleteCostura(loteId) { // A função agora recebe o ID do lote
    if (!hasPermission('costura', 'excluir')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    
    if (confirm(`Tem certeza que deseja excluir o lote de costura ${loteId}?`)) {
        try {
            // Chama a nova rota leve para deletar o item
            const response = await fetch(`/api/sewing/items/${loteId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Falha ao excluir o lote no servidor.');
            }
            
            // O backend notificará todos os clientes.
            showToast('Lote de costura excluído.', 'success');

        } catch (error) {
            console.error("Erro ao excluir lote de costura:", error);
            showToast('Erro de comunicação ao excluir lote.', 'error');
        }
    }
}





// --- 37-módulo-de-costura-lógica-completa-e-atualizada.js ---

// =================================================================================
// MÓDULO DE COSTURA (LÓGICA COMPLETA E ATUALIZADA)
// =================================================================================

function loadCostura() {
    if (!hasPermission('costura', 'visualizar')) return;
        document.getElementById('costura-data-atualizacao').innerHTML = `Última atualização: <strong>${new Date().toLocaleString('pt-BR')}</strong>`;

    const contadorTotal = document.getElementById('contador-costura-total');
    const contadorML = document.getElementById('contador-costura-ml');
    const contadorShopee = document.getElementById('contador-costura-shopee');
    const contadorVC = document.getElementById('contador-costura-vc');
    const containerML = document.getElementById('costura-ml-content');
    const containerShopee = document.getElementById('costura-shopee-content');
    const containerVC = document.getElementById('costura-vc-content');

    // --- LÓGICA DE VISIBILIDADE DO BOTÃO CORRIGIDA ---
    const btnAtribuirGrupos = document.getElementById('btn-atribuir-grupos-costura');
    if (btnAtribuirGrupos) {
        // O botão agora aparece se o usuário tiver a permissão 'atribuirGrupos'.
        // Isso funciona tanto para o admin-setor (se a permissão for dada)
        // quanto para o admin-master (que tem todas as permissões por padrão).
        if (hasPermission('costura', 'atribuirGrupos')) {
            btnAtribuirGrupos.classList.remove('hidden');
        } else {
            btnAtribuirGrupos.classList.add('hidden');
        }
    }
    // --- FIM DA CORREÇÃO ---

    if (!containerML || !containerShopee || !containerVC) return;
    containerML.innerHTML = '';
    containerShopee.innerHTML = '';
    containerVC.innerHTML = '';

    const gruposPermitidos = currentUser.gruposCostura || [];
    const isAdmin = currentUser.role === 'admin-master' || currentUser.role === 'admin-setor';
    
    const costuraVisivel = costura.filter(item => 
        isAdmin || gruposPermitidos.length === 0 || (gruposPermitidos.includes(getGrupoSku(item.sku)))
    );

    contadorTotal.innerText = costuraVisivel.length;

    const costuraML = costuraVisivel.filter(p => p.marketplace === 'Mercado Livre');
    const costuraShopee = costuraVisivel.filter(p => p.marketplace === 'Shopee');
    const costuraVC = costuraVisivel.filter(p => p.marketplace !== 'Mercado Livre' && p.marketplace !== 'Shopee');

    contadorML.innerText = costuraML.length;
    contadorShopee.innerText = costuraShopee.length;
    contadorVC.innerText = costuraVC.length;

    renderizarGruposCosturaPorAba(costuraML, containerML);
    renderizarGruposCosturaPorAba(costuraShopee, containerShopee);
    renderizarGruposCosturaPorAba(costuraVC, containerVC);
    
    applyPermissionsToUI();
}



function renderizarGruposCosturaPorAba(listaItens, containerAba) {
    if (listaItens.length === 0) {
        containerAba.innerHTML = '<p class="text-center text-gray-500 text-lg py-16">A fila de costura para esta origem está vazia.</p>';
        return;
    }

    const costuraAgrupada = listaItens.reduce((acc, item) => {
        const grupo = getGrupoSku(item.sku);
        if (!acc[grupo]) acc[grupo] = [];
        acc[grupo].push(item);
        return acc;
    }, {});

    const ordemGrupos = ['CL', 'FF', 'KC', 'KD', 'PC', 'PH', 'PR', 'PV', 'PV-ESPECIAL', 'RV', 'TP', 'VC', 'PA', 'OUTROS'];
    containerAba.innerHTML = '';
    ordemGrupos.forEach(grupo => {
        if (costuraAgrupada[grupo]) {
            renderGrupoCostura(grupo, costuraAgrupada[grupo], containerAba);
        }
    });
}

function renderGrupoCostura(nomeGrupo, itensGrupo, containerPai) {
    itensGrupo.sort((a, b) => a.sku.localeCompare(b.sku));
    const grupoHtml = `
        <div class="bg-white/90 p-6 rounded-2xl shadow-xl">
            <h3 class="text-2xl font-bold text-gray-800 mb-6 border-b pb-4">Grupo: ${nomeGrupo}</h3>
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                ${itensGrupo.map(renderCardsCostura).join('')}
            </div>
        </div>
    `;
    containerPai.innerHTML += grupoHtml;
}

function showCosturaTab(tabName) {
    document.querySelectorAll('.costura-tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    document.querySelectorAll('.costura-tab-btn').forEach(btn => {
        btn.classList.remove('border-purple-600', 'text-purple-600');
        btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
    });

    const contentToShow = document.getElementById(`costura-${tabName}-content`);
    if (contentToShow) {
        contentToShow.classList.remove('hidden');
    }

    const btnToActivate = document.getElementById(`tab-costura-${tabName}`);
    if (btnToActivate) {
        btnToActivate.classList.add('border-purple-600', 'text-purple-600');
        btnToActivate.classList.remove('border-transparent', 'text-gray-500');
    }
}

// ... (código anterior do arquivo) ...

//=================================================================================
// SUBSTITUA ESTA FUNÇÃO NO SEU SCRIPT.JS
//=================================================================================
function renderCardsCostura(item) {
    // ======================= INÍCIO DA ALTERAÇÃO =======================
    // REMOVEMOS a criação do 'imageMap' e a constante 'CAMINHO_IMAGEM_TESTE'.
    // USAMOS a função global getCardImageUrl para garantir consistência e corrigir o erro.
    const imageUrl = getCardImageUrl(item.sku);
    // ======================== FIM DA ALTERAÇÃO =========================

    const isMotoboy = item.tipoEntrega === 'Motoboy';
    const cardClasses = isMotoboy ? 'motoboy-card' : 'bg-white border-gray-200';
    const tipoEntregaIcon = isMotoboy ? 'fa-motorcycle text-purple-700' : 'fa-box-open text-gray-500';
    const dataColetaClass = isMotoboy ? 'text-purple-700 font-bold animate-pulse' : 'text-gray-600';

    const isEmAndamento = item.status === 'Em Andamento';
    const isFinalizado = item.status === 'Finalizado';
    const isDoUsuario = item.usuarioInicio === currentUser.username;
    const isAdmin = currentUser.role === 'admin-master' || currentUser.role === 'admin-setor';

    let buttonHtml = '';
    let statusText = '';

    // ... (o resto da função permanece exatamente o mesmo) ...
    // O código abaixo não precisa de alteração.

    if (isFinalizado) {
        statusText = `<span class="text-xs font-semibold text-green-700">Finalizado por: ${item.usuarioFim || 'N/A'}</span>`;
        if (isAdmin || item.usuarioFim === currentUser.username) {
            buttonHtml = `<button onclick="forcarEnvioParaExpedicao('${item.lote}')" class="w-full bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-purple-700 animate-pulse">
                            <i class="fas fa-shipping-fast mr-2"></i>Forçar Envio p/ Expedição
                          </button>`;
        } else {
            buttonHtml = `<button class="w-full bg-gray-400 text-white px-4 py-2 rounded-lg cursor-not-allowed" disabled>
                            <i class="fas fa-check-double mr-2"></i>Finalizado
                          </button>`;
        }
    } else if (isEmAndamento) {
        statusText = `<span class="text-xs font-semibold text-blue-700">Em uso por: ${item.usuarioInicio}</span>`;
        if (isDoUsuario || isAdmin) {
            buttonHtml = `<button onclick="iniciarTarefaCostura('${item.lote}')" class="w-full bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700"><i class="fas fa-play-circle mr-2"></i>Continuar Tarefa</button>`;
        } else {
            buttonHtml = `<button class="w-full bg-gray-400 text-white px-4 py-2 rounded-lg cursor-not-allowed" disabled><i class="fas fa-lock mr-2"></i>Em uso por ${item.usuarioInicio}</button>`;
        }
    } else { // Aguardando
        statusText = `<span class="text-xs font-semibold text-gray-500">Aguardando início</span>`;
        buttonHtml = `<button onclick="iniciarTarefaCostura('${item.lote}')" class="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"><i class="fas fa-play mr-2"></i>Iniciar Trabalho</button>`;
    }

    return `
        <div class="costura-card p-4 rounded-xl shadow-md border flex flex-col justify-between transition-all hover:shadow-lg hover:scale-[1.02] ${cardClasses}">
            <div>
                <img src="${imageUrl}" alt="Arte para ${item.sku}" class="w-full h-40 object-cover rounded-lg mb-3 cursor-pointer" onclick="openImageZoomModal('${imageUrl}')">
                <p class="font-bold text-xl text-gray-800 truncate" title="${item.sku}">${item.sku}</p>
                <div class="flex justify-between items-center text-sm mt-2">
                    <span class="font-semibold ${dataColetaClass}"><i class="fas fa-calendar-alt mr-2"></i>${item.dataColeta || 'Sem data'}</span>
                    <span class="font-semibold flex items-center gap-2"><i class="fas ${tipoEntregaIcon}"></i>${item.tipoEntrega || 'Padrão'}</span>
                </div>
                <div class="text-right mt-1">${statusText}</div>
            </div>
            <div class="mt-4">
                ${buttonHtml}
            </div>
        </div>
    `;
}



async function forcarEnvioParaExpedicao(loteId) {
    const itemIndex = costura.findIndex(c => c.lote === loteId);
    if (itemIndex === -1) {
        return showToast('Erro: Lote não encontrado para forçar o envio.', 'error');
    }

    const item = costura[itemIndex];
    const isDoUsuario = item.usuario === currentUser.username;
    const isAdmin = currentUser.role === 'admin-master' || currentUser.role === 'admin-setor';

    if (!isAdmin && !isDoUsuario) {
        return showToast('Apenas um administrador ou o usuário que finalizou a tarefa pode forçar o envio.', 'error');
    }

    if (confirm(`Tem certeza que deseja forçar o envio do lote ${loteId} para a expedição?`)) {
        const [itemMovido] = costura.splice(itemIndex, 1);
        
        expedicao.push({
            id: `EXP-${Date.now()}`,
            lote: itemMovido.lote,
            op: itemMovido.op,
            sku: itemMovido.sku,
            status: 'Pronto para Envio',
            pedidoId: itemMovido.pedidoId,
            marketplace: itemMovido.marketplace,
            tipoEntrega: itemMovido.tipoEntrega,
            dataExpedicao: new Date().toISOString(),
            tempoCostura: itemMovido.tempoCostura || 'N/A'
        });

        await saveData();
        loadCostura();
        
        if (tarefaCosturaAtiva && tarefaCosturaAtiva.lote === loteId) {
            tarefaCosturaAtiva = null;
        }

        showToast(`Lote ${loteId} enviado para a expedição com sucesso!`, 'success');
await logAction({
    acao: 'Envio para Expedição forçado (Admin)',
    modulo: 'Costura',
    funcao: 'forcarEnvioParaExpedicao',
    detalhes: { lote: item.lote, sku: item.sku, pedidoId: item.pedidoId }
});
    }
}

// ... (código anterior do arquivo) ...

//=================================================================================
// SUBSTITUA ESTE BLOCO INTEIRO DE FUNÇÕES NO SEU SCRIPT.JS
//=================================================================================

function iniciarTarefaCostura(loteId) {
     // VERIFICAÇÃO DE PERMISSÃO 'iniciarTarefa'
    if (!hasPermission('costura', 'iniciarTarefa')) {
        showToast('Permissão negada para iniciar tarefas de costura.', 'error');
        return;
    }
    if (tarefaCosturaAtiva && tarefaCosturaAtiva.lote !== loteId) {
        showToast(`Finalize a tarefa do lote ${tarefaCosturaAtiva.lote} antes de iniciar outra.`, 'error');
        return;
    }

    const item = costura.find(c => c.lote === loteId);
    if (!item) return showToast('Lote não encontrado.', 'error');

    if (item.usuarioInicio && item.usuarioInicio !== currentUser.username && item.status !== 'Finalizado') {
        return showToast(`Este lote já está sendo trabalhado por ${item.usuarioInicio}.`, 'error');
    }

    tarefaCosturaAtiva = {
        lote: loteId,
        sku: item.sku,
        marketplace: item.marketplace,
    };

    const infoContainer = document.getElementById('tarefa-info-container');
    const marketplaceCores = {
        'Mercado Livre': 'bg-yellow-400 text-yellow-900',
        'Shopee': 'bg-orange-500 text-white',
    };
    const corPadrao = 'bg-cyan-500 text-white';
    const corMarketplace = marketplaceCores[item.marketplace] || corPadrao;

    infoContainer.innerHTML = `
        <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full">SKU: <strong class="font-bold">${item.sku}</strong></span>
        <span class="px-3 py-1 rounded-full ${corMarketplace}">${item.marketplace}</span>
    `;

    // ======================= INÍCIO DA ALTERAÇÃO =======================
    // A mesma correção é aplicada aqui no modal de tarefa.
    document.getElementById('tarefa-imagem-sku').src = getCardImageUrl(item.sku);
    // ======================== FIM DA ALTERAÇÃO =========================
    
    const btnIniciar = document.getElementById('btn-iniciar-trabalho');
    const btnEnviar = document.getElementById('btn-enviar-expedicao');
    
    // O botão "Finalizar Lote" é sempre escondido.
    document.getElementById('btn-finalizar-costura').classList.add('hidden');

    if (item.status === 'Em Andamento') {
        btnIniciar.classList.add('hidden');
        btnEnviar.classList.remove('hidden');
    } else {
        btnIniciar.classList.remove('hidden');
        btnEnviar.classList.add('hidden');
    }

    const modal = document.getElementById('tarefa-costura-modal');
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('tarefa-costura-content').classList.remove('scale-95', 'opacity-0'), 10);
}



async function iniciarCronometroETrabalho() {
    if (!tarefaCosturaAtiva) return;

    const item = costura.find(c => c.lote === tarefaCosturaAtiva.lote);
    if (item) {
        // Apenas atualiza o status se ainda não estiver "Em Andamento"
        if (item.status !== 'Em Andamento') {
            item.status = 'Em Andamento';
            item.usuarioInicio = currentUser.username;
            item.inicioTimestamp = new Date().toISOString();
            
            // *** NOVO LOG DETALHADO ADICIONADO AQUI ***
            await logAction({
                acao: 'Início de tarefa de costura',
                modulo: 'Costura',
                funcao: 'iniciarCronometroETrabalho',
                detalhes: { 
                    lote: item.lote, 
                    sku: item.sku, 
                    pedidoId: item.pedidoId 
                }
            });

            await saveData();
        }
    }

    // Esconde o botão "Iniciar" e mostra o botão "Enviar para Expedição"
    document.getElementById('btn-iniciar-trabalho').classList.add('hidden');
    document.getElementById('btn-enviar-expedicao').classList.remove('hidden');

    // Atualiza a tela de costura para refletir o novo status do card
    loadCostura();
}


// A função finalizarTarefaCostura foi removida.

function pausarEFecharModalCostura() {
    if (tarefaCosturaAtiva) {
        tarefaCosturaAtiva = null; 
    }
    const modal = document.getElementById('tarefa-costura-modal');
    modal.classList.add('hidden');
    showToast('Modal de costura fechado.', 'info');
}


// =================================================================================
// SUBSTITUA APENAS ESTA FUNÇÃO PARA CORRIGIR A TRANSIÇÃO PARA A EXPEDIÇÃO
// =================================================================================

/**
 * AJUSTE FOCADO: Garante que os itens movidos da costura para a expedição
 * carreguem todos os dados necessários (especialmente 'pedidoId') para serem
 * exibidos corretamente no módulo de expedição.
 */
async function enviarParaExpedicao() {
    // Verificações iniciais (permissão e tarefa ativa)
    if (!hasPermission('costura', 'moverParaExpedicao')) {
        return showToast('Permissão negada para mover itens para a expedição.', 'error');
    }
    if (!tarefaCosturaAtiva) {
        return showToast('Nenhuma tarefa de costura ativa para finalizar.', 'warning');
    }

    const loteId = tarefaCosturaAtiva.lote;
    const itemIndex = costura.findIndex(c => c.lote === loteId);
    if (itemIndex === -1) {
        return showToast('Erro: Lote de costura não encontrado nos dados locais.', 'error');
    }

    // Remove o item do array 'costura'
    const [itemMovido] = costura.splice(itemIndex, 1);

    // ======================= INÍCIO DO AJUSTE =======================

    // 1. CRIAÇÃO CORRETA DO OBJETO DE EXPEDIÇÃO:
    //    Garante que TODAS as propriedades relevantes do 'itemMovido' sejam
    //    transferidas para o novo objeto que será adicionado ao array 'expedicao'.
    //    A propriedade 'pedidoId' é a mais crucial.
    const novoItemParaExpedicao = {
        // Propriedades que já existiam no item da costura
        lote: itemMovido.lote,
        op: itemMovido.op,
        sku: itemMovido.sku,
        pedidoId: itemMovido.pedidoId, // **A CHAVE DO PROBLEMA ESTÁ AQUI**
        marketplace: itemMovido.marketplace,
        tipoEntrega: itemMovido.tipoEntrega,
        dataColeta: itemMovido.dataColeta,
        
        // Novas propriedades específicas da expedição
        id: `EXP-${Date.now()}`, // ID único para o registro na expedição
        status: 'Pronto para Envio', // Status inicial na expedição
        dataExpedicao: new Date().toISOString(),
        usuarioInicioCostura: itemMovido.usuarioInicio,
        usuarioFimCostura: currentUser.username, // Registra quem finalizou
    };
    
    // 2. Adiciona o objeto CORRIGIDO ao array 'expedicao'
    expedicao.push(novoItemParaExpedicao);

    // ======================== FIM DO AJUSTE =========================

    // Limpa a tarefa ativa e fecha o modal
    const loteFinalizado = tarefaCosturaAtiva.lote;
    tarefaCosturaAtiva = null;
    
    // Salva o estado atual (com o item removido da costura e adicionado na expedição)
    await saveData(); // Esta chamada é essencial para persistir a mudança

    // Log da ação
    await logAction({
        acao: 'Item finalizado e enviado para Expedição',
        modulo: 'Costura',
        funcao: 'enviarParaExpedicao',
        detalhes: { 
            lote: itemMovido.lote, 
            sku: itemMovido.sku, 
            pedidoId: itemMovido.pedidoId,
            finalizado_por: currentUser.username
        }
    });

    // Fecha o modal e dá feedback
    document.getElementById('tarefa-costura-modal').classList.add('hidden');
    // As funções loadCostura() e loadExpedicao() são chamadas pelo listener do WebSocket após o saveData()
    showToast(`Lote ${loteFinalizado} enviado para a expedição!`, 'success');
}









async function confirmarConclusaoCostura() {
    // A permissão correta é 'moverParaExpedicao' do módulo 'costura'
    if (!hasPermission('costura', 'moverParaExpedicao')) {
        showToast('Permissão negada para enviar para a expedição.', 'error');
        return;
    }

    const selecionados = document.querySelectorAll('.costura-checkbox:checked');
    if (selecionados.length === 0) {
        showToast('Nenhum item selecionado.', 'info');
        return;
    }

    if (confirm(`Tem certeza que deseja mover os ${selecionados.length} itens selecionados para a Expedição?`)) {
        let itensMovidos = 0;
        selecionados.forEach(checkbox => {
            const lote = checkbox.dataset.lote;
            const itemIndex = costura.findIndex(item => item.lote === lote);

            if (itemIndex !== -1) {
                const [itemMovido] = costura.splice(itemIndex, 1);
                
                // --- ESTRUTURA DE DADOS CORRIGIDA ---
                // Criamos um objeto para a expedição apenas com os dados que realmente existem no 'itemMovido'.
                expedicao.push({
                    id: `EXP-${Date.now() + itensMovidos}`,
                    lote: itemMovido.lote,
                    op: itemMovido.op,
                    sku: itemMovido.sku,
                    status: 'Pronto para Envio',
                    pedidoId: itemMovido.pedidoId,
                    marketplace: itemMovido.marketplace,
                    tipoEntrega: itemMovido.tipoEntrega,
                    dataExpedicao: new Date().toISOString()
                });
                // --- FIM DA CORREÇÃO ---

                itensMovidos++;
            }
        });

        if (itensMovidos > 0) {
            await saveData();
            loadCostura(); // Atualiza a tela de costura
            loadExpedicao(); // Atualiza a tela de expedição
            logAction(`${itensMovidos} item(ns) movidos da Costura para a Expedição.`);
            showToast(`${itensMovidos} item(ns) enviados para a Expedição.`, 'success');
        }
    }
}





/**
 * Move um item da costura para a expedição.
 * @param {string} lote - O lote do item na costura.
 */
async function moverCosturaParaExpedicao(lote) {
    if (!hasPermission('expedicao', 'adicionar')) {
        showToast('Permissão negada para enviar para a expedição.', 'error');
        return;
    }

    const itemIndex = costura.findIndex(item => item.lote === lote);
    if (itemIndex === -1) {
        showToast('Item de costura não encontrado.', 'error');
        return;
    }

    const [itemMovido] = costura.splice(itemIndex, 1);
    
    // Adiciona o item à fila da expedição
            expedicao.push({
                id: `EXP-${Date.now()}`,
                lote: itemMovido.lote,
                op: itemMovido.op,
                sku: itemMovido.sku,
                status: 'Pronto para Envio',
                pedidoId: itemMovido.pedidoId,
                dataExpedicao: new Date().toISOString(),
                // Adicionar informações de SKU e NF para a etiqueta
                skuEtiqueta: itemMovido.sku, // SKU para a etiqueta
                nfEtiqueta: itemMovido.nf // NF para a etiqueta
            });

    await saveData();
    loadCostura(); // Recarrega a tela de costura
    logAction(`Item ${itemMovido.sku} (Lote: ${lote}) movido da Costura para a Expedição.`);
    showToast(`Item ${itemMovido.sku} enviado para a Expedição.`, 'success');
}

/**
 * Cancela um item que está na fila de costura.
 * O item volta para a fila de produção.
 * @param {string} lote - O lote do item na costura.
 */
async function cancelarCostura(lote) {
    if (!hasPermission('costura', 'excluir')) {
        showToast('Permissão negada para cancelar costura.', 'error');
        return;
    }

    const itemIndex = costura.findIndex(item => item.lote === lote);
    if (itemIndex === -1) {
        showToast('Item de costura não encontrado.', 'error');
        return;
    }

    if (confirm('Tem certeza que deseja cancelar a costura deste item? Ele voltará para a fila de produção.')) {
        const [itemCancelado] = costura.splice(itemIndex, 1);

        // Volta o item para a produção
        producao.push({
            op: itemCancelado.op,
            sku: itemCancelado.sku,
            status: 'Aguardando Produção',
            pedidoId: itemCancelado.pedidoId,
            dataColeta: new Date().toLocaleDateString('pt-BR'),
            tipoEntrega: 'Coleta'
        });

        await saveData();
        loadCostura(); // Recarrega a tela de costura
        logAction(`Costura do item ${itemCancelado.sku} (Lote: ${lote}) cancelada.`);
        showToast(`Costura de ${itemCancelado.sku} cancelada.`, 'info');
    }
}







// --- 39-lógica-do-modal-de-atribuição-de-grupos-para-admins.js ---

// =================================================================================
// LÓGICA DO MODAL DE ATRIBUIÇÃO DE GRUPOS (PARA ADMINS)
// =================================================================================

function abrirModalAtribuirGrupos() {
    const modal = document.getElementById('atribuir-grupos-modal');
    const modalContent = document.getElementById('atribuir-grupos-content');
    const userSelect = document.getElementById('atribuir-usuario-select');
    const checkboxesContainer = document.getElementById('grupos-costura-checkboxes');
    
    userSelect.innerHTML = '<option value="">Selecione um usuário...</option>';
    
    // Define quais usuários o admin logado pode gerenciar
    let usuariosGerenciaveis = [];
    if (currentUser.role === 'admin-master') {
        usuariosGerenciaveis = users.filter(u => u.role === 'user');
    } else if (currentUser.role === 'admin-setor') {
        usuariosGerenciaveis = users.filter(u => u.role === 'user' && (u.setor === currentUser.setor || !u.setor));
    }

    usuariosGerenciaveis.forEach(user => {
        userSelect.innerHTML += `<option value="${user.username}">${user.username}</option>`;
    });

    const ordemGrupos = ['CL', 'FF', 'KC', 'KD', 'PC', 'PH', 'PR', 'PV', 'PV-ESPECIAL', 'RV', 'TP', 'VC', 'PA', 'OUTROS'];
    checkboxesContainer.innerHTML = ordemGrupos.map(grupo => `
        <label class="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-gray-100">
            <input type="checkbox" value="${grupo}" class="h-5 w-5 rounded text-indigo-600 focus:ring-indigo-500">
            <span class="font-medium text-gray-700">${grupo}</span>
        </label>
    `).join('');

    userSelect.onchange = () => {
        const username = userSelect.value;
        const user = users.find(u => u.username === username);
        document.querySelectorAll('#grupos-costura-checkboxes input').forEach(chk => {
            chk.checked = user?.gruposCostura?.includes(chk.value) || false;
        });
    };
    userSelect.dispatchEvent(new Event('change'));

    modal.classList.remove('hidden');
    setTimeout(() => modalContent.classList.remove('scale-95', 'opacity-0'), 10);
}

function fecharModalAtribuirGrupos() {
    document.getElementById('atribuir-grupos-modal').classList.add('hidden');
}

async function salvarAtribuicaoGrupos() {
    const username = document.getElementById('atribuir-usuario-select').value;
    if (!username) {
        showToast('Por favor, selecione um usuário.', 'error');
        return;
    }

    const user = users.find(u => u.username === username);
    if (!user) {
        showToast('Usuário não encontrado.', 'error');
        return;
    }
    
    // Garante que a propriedade exista antes de atribuir
    if (!user.gruposCostura) {
        user.gruposCostura = [];
    }

    const gruposSelecionados = Array.from(document.querySelectorAll('#grupos-costura-checkboxes input:checked')).map(chk => chk.value);
    user.gruposCostura = gruposSelecionados;
    
    // Se o admin logado é um admin de setor, ele automaticamente atribui o usuário ao seu setor
    if (currentUser.role === 'admin-setor') {
        user.setor = currentUser.setor;
    }

    await saveData();
    showToast(`Grupos de costura para ${username} salvos com sucesso!`, 'success');
    await logAction(`Grupos de costura para ${username} atualizados: [${gruposSelecionados.join(", ")}]`);
    fecharModalAtribuirGrupos();
}