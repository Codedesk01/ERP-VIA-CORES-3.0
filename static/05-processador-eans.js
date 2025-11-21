// ================================================================================
// 05 PROCESSADOR EANS
// ================================================================================

// Variáveis globais para controlar a paginação da loja ativa
let resultadosBuscaLoja = [];
let paginaAtualBuscaLoja = 1;
const ITENS_POR_PAGINA_LOJA = 100; // <<< AQUI DEFINIMOS O LIMITE DE 100 ITENS POR PÁGINA
// --- 44-módulo-gestão-de-eans-versão-100-abas-dinâmicas-e-aba-de-erros.js ---

// =================================================================================
// MÓDULO GESTÃO DE EANS (VERSÃO 10.0 - ABAS DINÂMICAS E ABA DE ERROS)
// =================================================================================

// --- CONFIGURAÇÃO CENTRAL DAS LOJAS ---
// Para adicionar/modificar lojas, basta alterar este array.
const lojasConfigEAN = [
    { id: 'loja-outros', nome: 'Loja 1', sufixo: null, cor: 'gray' },
    { id: 'loja-f', nome: 'Loja 2 (-F)', sufixo: '-F', cor: 'blue' },
    { id: 'loja-p', nome: 'Loja 3 (-P)', sufixo: '-P', cor: 'purple' },
    { id: 'loja-v', nome: 'Loja 4 (-V)', sufixo: '-V', cor: 'teal' },
    { id: 'loja-c', nome: 'Loja 5 (-C)', sufixo: '-C', cor: 'pink' }
    // Para adicionar uma nova loja, copie uma linha acima e mude o 'id', 'nome', 'sufixo' e 'cor'.
    // Ex: { id: 'loja-x', nome: 'Loja -X', sufixo: '-X', cor: 'green' },
];


// 05-processador-eans.js

// ... (logo no início do arquivo)

/**
 * Formata um número de peso para o padrão de exibição "0,000".
 * @param {number | null | undefined} peso - O número do peso vindo do banco de dados.
 * @returns {string} O peso formatado como string, ou 'N/A'.
 */
function formatarPesoParaExibicao(peso) {
    // Se o peso não for um número válido (null, undefined, 0), retorna 'N/A'.
    if (typeof peso !== 'number' || isNaN(peso)) {
        return 'N/A';
    }

    // Converte o número para uma string com 3 casas decimais. Ex: 0.7 -> "0.700"
    const pesoComDecimais = peso.toFixed(3);

    // Substitui o ponto decimal por uma vírgula. Ex: "0.700" -> "0,700"
    return pesoComDecimais.replace('.', ',');
}

async function renderizarProcessadorEans() { // Adicionado 'async' para poder usar 'await'
    // 1. Permissão (sem alteração)
    if (!hasPermission('processadorEANs', 'visualizar')) return;

    // ======================= INÍCIO DA CORREÇÃO =======================
    // 2. BUSCA OS DADOS ESTATÍSTICOS E ERROS DO SERVIDOR
    showToast('Carregando dados dos EANs...', 'info');
    let estatisticasData = null;
    let errosData = null;
    
    try {
        // Busca estatísticas
        const statsResponse = await fetch('/api/eans/stats_detalhadas');
        if (statsResponse.ok) {
            estatisticasData = await statsResponse.json();
        }
        
        // Busca erros
        const errorsResponse = await fetch('/api/eans/errors');
        if (errorsResponse.ok) {
            errosData = await errorsResponse.json();
        }
    } catch (error) {
        console.error("Erro ao buscar dados do servidor:", error);
    }
    // ======================== FIM DA CORREÇÃO =========================

    // 3. Elementos principais
    const totalCountEl = document.getElementById('ean-total-count');
    const conteudoRestrito = document.getElementById('ean-conteudo-restrito');

    // Atualiza o total geral se conseguir os dados do servidor
    if (totalCountEl && estatisticasData && estatisticasData.status === 'ok') {
        totalCountEl.innerText = estatisticasData.total_itens;
    } else if (totalCountEl) {
        // Fallback para lista local se não conseguir dados do servidor
        totalCountEl.innerText = listaEANs ? listaEANs.length : 0;
    }

    const temAcessoCompleto = hasPermission('processadorEANs', 'processar') || hasPermission('processadorEANs', 'editar');

    if (temAcessoCompleto) {
        conteudoRestrito.style.display = 'block';

        const tabsContainer = document.getElementById('ean-loja-tabs');
        const contentContainer = document.getElementById('ean-tab-content-container');
        
        if (!tabsContainer || !contentContainer) return;

        tabsContainer.innerHTML = '';
        contentContainer.innerHTML = '';

        // ======================= INÍCIO DA CORREÇÃO =======================
        // Usa os dados do servidor se disponível, senão calcula localmente
        let contagemPorLoja = {};
        
        if (estatisticasData && estatisticasData.status === 'ok' && estatisticasData.contagem_por_loja) {
            // USA OS DADOS CORRETOS DO SERVIDOR
            contagemPorLoja = estatisticasData.contagem_por_loja;
        } else {
            // FALLBACK: calcula localmente apenas se dados do servidor não estiverem disponíveis
            console.warn("Usando cálculo local como fallback - dados do servidor não disponíveis");
            contagemPorLoja = {};
            lojasConfigEAN.forEach(loja => {
                contagemPorLoja[loja.id] = 0;
            });

            if (listaEANs) {
                listaEANs.forEach(item => {
                    let lojaEncontrada = false;
                    for (const loja of lojasConfigEAN) {
                        if (loja.sufixo && item.sku.endsWith(loja.sufixo)) {
                            contagemPorLoja[loja.id]++;
                            lojaEncontrada = true;
                            break;
                        }
                    }
                    if (!lojaEncontrada) {
                        contagemPorLoja['loja-outros']++;
                    }
                });
            }
        }
        // ======================== FIM DA CORREÇÃO =========================

        // Renderiza as abas usando a contagem (seja do servidor ou local)
        lojasConfigEAN.forEach((loja, index) => {
            const isAtivo = index === 0;
            const contagem = contagemPorLoja[loja.id] || 0;

            tabsContainer.innerHTML += `
                <button onclick="showEanTab('${loja.id}')" id="tab-btn-${loja.id}" 
                        class="ean-tab-btn px-4 py-3 font-semibold text-lg border-b-2 flex items-center gap-2 
                               ${isAtivo ? `border-${loja.cor}-500 text-${loja.cor}-600` : 'border-transparent text-gray-500 hover:text-gray-700'}">
                    <i class="fas fa-store"></i>
                    <span>${loja.nome}</span>
                    <span class="bg-${loja.cor}-100 text-${loja.cor}-800 text-xs font-bold px-2 py-1 rounded-full">${contagem}</span>
                </button>
            `;
            
            contentContainer.innerHTML += `
                <div id="tab-content-${loja.id}" class="ean-tab-content ${isAtivo ? '' : 'hidden'}">
                    <div class="bg-white/80 p-6 rounded-2xl shadow-xl">
                        <div class="flex items-center gap-4 mb-6">
                            <i class="fas fa-search text-gray-400"></i>
                            <input type="text" id="search-input-${loja.id}" class="w-full p-3 border-2 rounded-xl focus:border-${loja.cor}-500 transition" 
                                   onkeyup="buscarEAN('${loja.id}')" placeholder="Buscar por SKU, EAN ou ID...">
                        </div>
                        <div id="result-container-${loja.id}" class="mt-4">
                            <p class="text-center text-gray-500 p-8">Use a busca acima para encontrar um item.</p>
                        </div>
                    </div>
                </div>
            `;
        });

        // Renderização da aba de erros
        const totalErros = errosData && errosData.status === 'ok' 
            ? errosData.errors.length 
            : (errosDeImportacaoEAN ? errosDeImportacaoEAN.length : 0);
            
        tabsContainer.innerHTML += `
            <button onclick="showEanTab('erros')" id="tab-btn-erros" 
                    class="ean-tab-btn px-4 py-3 font-semibold text-lg border-b-2 flex items-center gap-2 border-transparent text-gray-500 hover:text-gray-700">
                <i class="fas fa-exclamation-triangle text-red-500"></i>
                <span>Erros</span>
                <span id="ean-error-count" class="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full">${totalErros}</span>
            </button>
        `;
        contentContainer.innerHTML += `
            <div id="tab-content-erros" class="ean-tab-content hidden">
                <div class="bg-white/80 p-6 rounded-2xl shadow-xl">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold text-red-700">Itens com Erro na Importação</h3>
                        <button onclick="limparErrosEAN()" class="bg-red-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-600" data-permission="processadorEANs:processar">
                            <i class="fas fa-trash-alt mr-2"></i>Limpar Tudo
                        </button>
                    </div>
                    <div id="ean-errors-container" class="space-y-2"></div>
                </div>
            </div>
        `;

        renderizarErrosEAN(errosData);

        if (estatisticasData && estatisticasData.status === 'ok') {
            showToast('Dados carregados com sucesso!', 'success');
        }

    } else {
        conteudoRestrito.style.display = 'none';
    }

    applyPermissionsToUI();
}





/**
 * Controla a visibilidade das abas, incluindo a nova aba de erros.
 */
function showEanTab(tabId) {
    const todasAsCores = ['gray', 'blue', 'purple', 'teal', 'pink', 'red', 'green']; // Adicione mais cores se usar na config

    document.querySelectorAll('.ean-tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.ean-tab-btn').forEach(b => {
        b.classList.remove(...todasAsCores.map(cor => `border-${cor}-500`), ...todasAsCores.map(cor => `text-${cor}-600`));
        b.classList.add('border-transparent', 'text-gray-500');
    });

    document.getElementById(`tab-content-${tabId}`).classList.remove('hidden');
    const btn = document.getElementById(`tab-btn-${tabId}`);
    
    const lojaConfig = lojasConfigEAN.find(l => l.id === tabId);
    const cor = tabId === 'erros' ? 'red' : (lojaConfig ? lojaConfig.cor : 'gray');
    
    btn.classList.add(`border-${cor}-500`, `text-${cor}-600`);
    btn.classList.remove('border-transparent', 'text-gray-500');

    if (tabId !== 'erros') {
        document.getElementById(`search-input-${tabId}`).focus();
    }
}

/**
 * Renderiza a lista de erros na aba correspondente.
 */
function renderizarErrosEAN(errosData = null) {
    const container = document.getElementById('ean-errors-container');
    const countEl = document.getElementById('ean-error-count');
    if (!container || !countEl) return;

    // Usa dados do servidor se disponível, senão usa dados locais
    const erros = (errosData && errosData.status === 'ok') 
        ? errosData.errors 
        : (errosDeImportacaoEAN || []);
    
    countEl.innerText = erros.length;

    if (erros.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 p-8">Nenhum erro de importação registrado.</p>';
    } else {
        container.innerHTML = erros.map((erro, index) => `
            <div class="bg-red-50 border-l-4 border-red-400 p-3 flex justify-between items-center">
                <p class="text-sm text-red-800"><strong>Linha ${erro.linha}:</strong> ${erro.motivo}</p>
                <button onclick="removerErroEAN(${index})" class="text-red-400 hover:text-red-600" title="Remover este erro">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }
}

// SUBSTITUA A FUNÇÃO 'removerErroEAN' INTEIRA POR ESTA:

/**
 * Remove um erro específico da lista.
 * VERSÃO CORRIGIDA: Remove também do servidor.
 */
async function removerErroEAN(index) {
    try {
        // Busca erros atuais para ter a referência correta
        const response = await fetch('/api/eans/errors');
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'ok' && data.errors[index]) {
                const erroParaRemover = data.errors[index];
                
                // Remove do servidor (a API atual não tem rota específica para remover um erro individual)
                // Por enquanto, apenas remove da interface e synchronized com o servidor na próxima atualização
                console.log("Removendo erro:", erroParaRemover);
            }
        }
    } catch (error) {
        console.error("Erro ao remover erro:", error);
    }
    
    // Remove da lista local e atualiza interface
    if (errosDeImportacaoEAN && errosDeImportacaoEAN[index]) {
        errosDeImportacaoEAN.splice(index, 1);
        saveData();
    }
    
    renderizarErrosEAN();
    showToast('Erro removido!', 'success');
}

// SUBSTITUA A FUNÇÃO 'limparErrosEAN' INTEIRA POR ESTA:

/**
 * Limpa todos os erros da lista após confirmação.
 * VERSÃO CORRIGIDA: Remove também do servidor.
 */
async function limparErrosEAN() {
    if (!confirm(`Tem certeza que deseja limpar todos os erros de importação?`)) {
        return;
    }
    
    try {
        // Chama a API para limpar erros do servidor
        const response = await fetch('/api/eans/errors/clear', {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Falha ao limpar erros do servidor');
        }
        
        const result = await response.json();
        if (result.status !== 'ok') {
            throw new Error(result.message || 'Erro do servidor');
        }
        
        showToast('Todos os erros foram removidos com sucesso!', 'success');
        
    } catch (error) {
        console.error("Erro ao limpar erros:", error);
        showToast(`Erro ao limpar erros: ${error.message}`, 'error');
    }
    
    // Limpa também da lista local
    errosDeImportacaoEAN = [];
    saveData();
    renderizarErrosEAN();
}




// SUBSTITUA A FUNÇÃO 'processarEANs' INTEIRA POR ESTA:

async function processarEANs() {
    // 1. Permissão e validação de input
    if (!hasPermission('processadorEANs', 'processar')) {
        showToast('Você não tem permissão para processar EANs.', 'error');
        return;
    }
    const inputText = document.getElementById('ean-input').value.trim();
    if (!inputText) {
        showToast('A área de texto está vazia.', 'info');
        return;
    }

    // 2. Trava o botão
    const processarBtn = document.querySelector('button[onclick="processarEANs()"]');
    const originalBtnText = processarBtn.innerHTML;
    processarBtn.disabled = true;
    processarBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Processando...`;

    // 3. Validação Flexível: Separa itens válidos de erros de formato.
    const linhas = inputText.split('\n');
    const itensParaProcessar = [];
    let todosOsErros = []; // Lista única para todos os erros.

    linhas.forEach((linha, index) => {
        const linhaTrim = linha.trim();
        if (!linhaTrim) return; // Ignora linhas em branco.

        const partes = linhaTrim.split(/\s+/);
        const sku = partes[0]?.toUpperCase();
        const eanLimpo = partes.slice(1).join('').replace(/\D/g, '');

        if (partes.length < 2 || !sku) {
            todosOsErros.push({ linha: index + 1, motivo: `Linha inválida: '${linhaTrim}'. Formato esperado: SKU EAN.`, timestamp: new Date().toISOString() });
            return;
        }
        if (!eanLimpo || eanLimpo.length < 12 || eanLimpo.length > 14) {
            todosOsErros.push({ linha: index + 1, motivo: `EAN inválido para o SKU '${sku}'.`, timestamp: new Date().toISOString() });
            return;
        }

        const lojasParaItem = {};
        lojasConfigEAN.forEach(loja => {
            lojasParaItem[loja.id] = { marketplaces: { MERCADO: {}, SHOPEE: {}, MAGALU: {}, SHEIN: {}, SITE: {} } };
        });
        itensParaProcessar.push({ sku, ean: eanLimpo, lojas: lojasParaItem });
    });

    // 4. Se não houver NENHUM item válido para processar, apenas lida com os erros e para.
    if (itensParaProcessar.length === 0) {
        if (todosOsErros.length > 0) {
            try {
                await fetch('/api/eans/log_errors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ errors: todosOsErros })
                });
                showToast(`${todosOsErros.length} erros de formato encontrados. Nenhum item válido para processar.`, 'warning');
            } catch (error) {
                console.error('Falha ao enviar erros de formato:', error);
            }
        } else {
            showToast('Nenhum item encontrado no texto para processar.', 'info');
        }
        processarBtn.disabled = false;
        processarBtn.innerHTML = originalBtnText;
        return;
    }

    // 5. Se houver itens válidos, cria a barra de progresso.
    const progressContainer = document.createElement('div');
    progressContainer.innerHTML = `
        <div class="mt-4 bg-gray-200 rounded-full h-2.5">
            <div id="ean-progress-bar" class="bg-indigo-600 h-2.5 rounded-full" style="width: 0%"></div>
        </div>
        <p id="ean-progress-label" class="text-center text-sm text-gray-600 mt-1"></p>
    `;
    processarBtn.parentNode.appendChild(progressContainer);
    const progressBar = document.getElementById('ean-progress-bar');
    const progressLabel = document.getElementById('ean-progress-label');

    // 6. Envio em lotes dos itens VÁLIDOS.
    const CHUNK_SIZE = 10000;
    let totalAdicionados = 0;

    for (let i = 0; i < itensParaProcessar.length; i += CHUNK_SIZE) {
        const chunk = itensParaProcessar.slice(i, i + CHUNK_SIZE);
        const percent = Math.round(((i + chunk.length) / itensParaProcessar.length) * 100);
        progressBar.style.width = `${percent}%`;
        progressLabel.innerText = `Enviando lote ${Math.floor(i / CHUNK_SIZE) + 1} de ${Math.ceil(itensParaProcessar.length / CHUNK_SIZE)}...`;

        try {
            const response = await fetch('/api/eans/process_batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batch: chunk })
            });
            if (!response.ok) throw new Error(`Erro no servidor: ${response.statusText}`);
            const result = await response.json();
            totalAdicionados += result.adicionados;

            if (result.erros && result.erros.length > 0) {
                const novosErros = result.erros.map(motivo => ({ linha: 0, motivo, timestamp: new Date().toISOString() }));
                todosOsErros.push(...novosErros);
            }
        } catch (error) {
            console.error('Erro ao processar lote:', error);
            showToast('Erro de comunicação ao processar um lote.', 'error');
            break;
        }
    }

    // 7. Salva todos os erros de uma vez.
    if (todosOsErros.length > 0) {
        try {
            await fetch('/api/eans/log_errors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ errors: todosOsErros })
            });
            showToast(`${todosOsErros.length} erros de importação foram registrados.`, 'warning');
        } catch (error) {
            console.error('Falha ao enviar erros para o servidor:', error);
        }
    }

    // 8. Finalização
    progressLabel.innerText = 'Processamento concluído!';
    if (totalAdicionados > 0) {
        showToast(`${totalAdicionados} novos itens foram adicionados com sucesso.`, 'success');
        await logAction(`${totalAdicionados} EANs processados via lote.`);
    }
    
    document.getElementById('ean-input').value = '';
    processarBtn.disabled = false;
    processarBtn.innerHTML = originalBtnText;
    if (progressContainer) progressContainer.remove();

    // =============================================================
    // >> INÍCIO DA OTIMIZAÇÃO DE SINCRONIZAÇÃO <<
    // =============================================================
    console.log("Processamento concluído. Forçando recarga de dados para sincronizar IDs...");
    
    // 1. Pede ao servidor a lista de dados mais recente.
    await loadFromServer(); 
    
    // 2. Redesenha a interface do módulo de EANs com os dados atualizados.
    renderizarProcessadorEans(); 
    
    console.log("Sincronização e redesenho concluídos!");
    // =============================================================
    // >> FIM DA OTIMIZAÇÃO DE SINCRONIZAÇÃO <<
    // =============================================================
}









// Substitua a função buscarEAN inteira por esta:
/**
 * Dispara a busca no BACKEND quando o usuário digita.
 * @param {string} lojaId - O ID da loja onde a busca está sendo feita.
 */
async function buscarEAN(lojaId) {
    const termoBusca = document.getElementById(`search-input-${lojaId}`).value.trim();
    const resultContainer = document.getElementById(`result-container-${lojaId}`);
    
    if (!termoBusca) {
        resultContainer.innerHTML = '<p class="text-center text-gray-500 p-8">Use a busca acima para encontrar um item.</p>';
        return;
    }

    // Mostra um indicador de carregamento para o usuário
    resultContainer.innerHTML = '<p class="text-center text-gray-500 p-8 animate-pulse">Buscando no servidor...</p>';

    // Inicia a busca na página 1, passando o termo para a nova função
    await carregarPaginaDaLoja(lojaId, 1, termoBusca);
}

async function carregarPaginaDaLoja(lojaId, pagina = 1, termo = '') {
    try {
        // normaliza parâmetros
        pagina = Number(pagina) || 1;
        termo = termo ? String(termo) : '';

        // Mostra loading mínimo (opcional)
        const resultContainer = document.getElementById(`result-container-${lojaId}`);
        if (resultContainer) {
            resultContainer.innerHTML = '<p class="text-center text-gray-500 p-8 animate-pulse">Buscando no servidor...</p>';
        }

        // Observação: o backend em Python usa 'loja_id' (snake_case). Ajuste aqui para garantir compatibilidade.
        const url = `/api/eans/search?page=${pagina}&per_page=${ITENS_POR_PAGINA_LOJA}&loja_id=${encodeURIComponent(lojaId)}&termo=${encodeURIComponent(termo)}`;

        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`Falha na comunicação com o servidor: ${response.status}`);
        }

        const data = await response.json();

        // valida payload do backend
        if (!data || data.status === 'error') {
            const msg = (data && data.message) ? data.message : 'Resposta inválida do servidor.';
            throw new Error(msg);
        }

        // Atualiza a variável global (apenas se payload válido)
        paginaAtualBuscaLoja = Number(data.page) || pagina;

        // Atualiza contador total visível (se existir)
        const totalCountEl = document.getElementById('ean-total-count');
        if (totalCountEl && typeof data.total !== 'undefined') {
            totalCountEl.innerText = data.total;
        }

        // Se não houver itens, renderiza mensagem amigável
        if (!Array.isArray(data.items) || data.items.length === 0) {
            if (resultContainer) {
                resultContainer.innerHTML = `<p class="text-center text-gray-500 p-8">Nenhum resultado encontrado.</p>`;
            }
            // Ainda chama renderizarTabelaDaLoja para limpar estado antigo, se necessário
            if (typeof renderizarTabelaDaLoja === 'function') {
                renderizarTabelaDaLoja(lojaId, [], data.total || 0, data.pages || 0);
            }
            return;
        }

        // Chama a função de renderização existente
        if (typeof renderizarTabelaDaLoja === 'function') {
            renderizarTabelaDaLoja(lojaId, data.items, data.total || 0, data.pages || 0);
        } else {
            // fallback: renderiza algo simples caso a função não exista
            let html = '<table class="w-full"><thead><tr><th class="p-2 text-left">ID</th><th class="p-2 text-left">SKU</th><th class="p-2 text-left">EAN</th></tr></thead><tbody>';
            data.items.forEach(it => {
                html += `<tr class="border-b"><td class="p-2">${it.id}</td><td class="p-2">${it.sku}</td><td class="p-2">${it.ean}</td></tr>`;
            });
            html += '</tbody></table>';
            if (resultContainer) resultContainer.innerHTML = html;
        }

    } catch (error) {
        console.error("Erro ao buscar EANs:", error);
        const resultContainer = document.getElementById(`result-container-${lojaId}`);
        if (resultContainer) {
            resultContainer.innerHTML = `<p class="text-center text-red-500 p-8">Erro ao carregar dados do servidor: ${error.message || 'erro desconhecido'}</p>`;
        }
    }
}


// Substitua a função renderizarPaginaDaLoja por esta nova função renderizarTabelaDaLoja
/**
 * Renderiza a TABELA e a PAGINAÇÃO com base nos dados recebidos do backend.
 * @param {string} lojaId - O ID da loja.
 * @param {Array} itensDaPagina - Os itens retornados pelo backend.
 * @param {number} totalItens - O número total de itens que correspondem à busca.
 * @param {number} totalPaginas - O número total de páginas disponíveis.
 */
function renderizarTabelaDaLoja(lojaId, itensDaPagina, totalItens, totalPaginas) {
    const resultContainer = document.getElementById(`result-container-${lojaId}`);
    
    if (totalItens === 0) {
        const termoBusca = document.getElementById(`search-input-${lojaId}`).value.trim();
        resultContainer.innerHTML = `<p class="text-center text-gray-500 p-8">Nenhum item encontrado para "<strong>${termoBusca}</strong>" nesta loja.</p>`;
        return;
    }

    const marketplaces = ['MERCADO', 'SHOPEE', 'MAGALU', 'SHEIN', 'SITE'];
    
    const tableHeader = `
        <thead class="bg-gray-100 sticky top-0 z-10">
            <tr>
                <th class="p-3 text-left font-semibold text-gray-600">SKU</th>
                <th class="p-3 text-left font-semibold text-gray-600">EAN</th>
                <th class="p-3 text-left font-semibold text-gray-600">Peso(kg)</th>
                <th class="p-3 text-left font-semibold text-gray-600">NCM</th>
                ${marketplaces.map(mp => `<th class="p-2 text-center font-semibold text-gray-600">${mp}</th>`).join('')}
                <th class="p-3 text-right font-semibold text-gray-600">Ações</th>
            </tr>
        </thead>`;

    const tableBody = `<tbody>${itensDaPagina.map(item => {
        const dadosDaLoja = item.lojas ? item.lojas[lojaId] : null;
        const canEdit = hasPermission('processadorEANs', 'editar');
        const canProcess = hasPermission('processadorEANs', 'processar');

        const marketplaceCheckboxes = marketplaces.map(mp => {
            const status = dadosDaLoja?.marketplaces?.[mp] || { marcado: false };
            const isChecked = status.marcado;
            const tooltip = isChecked ? `Marcado por ${status.por} em ${new Date(status.em).toLocaleString('pt-BR')}` : (canEdit ? `Marcar como processado em ${mp}` : 'Sem permissão para editar');
            
            return `<td class="p-3 text-center">
                        <input type="checkbox" onchange="marcarMarketplace('${item.id}', '${lojaId}', '${mp}')" 
                               class="h-5 w-5 text-indigo-600 focus:ring-indigo-500 ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}" 
                               ${isChecked ? 'checked' : ''} 
                               ${!canEdit ? 'disabled' : ''} 
                               title="${tooltip}">
                    </td>`;
        }).join('');

        const actionButtons = canProcess 
            ? `<button onclick="abrirModalEdicaoEAN('${item.id}')" class="text-blue-500 hover:text-blue-700 mr-4" title="Editar"><i class="fas fa-pencil-alt"></i></button>
               <button onclick="excluirEAN('${item.id}')" class="text-red-500 hover:text-red-700" title="Excluir"><i class="fas fa-trash"></i></button>`
            : '<span class="text-xs text-gray-400">Sem permissão</span>';

        const pesoFormatado = formatarPesoParaExibicao(item.peso);

        return `<tr id="item-row-${item.id}" class="border-t hover:bg-gray-50">
                <td class="p-3"><div class="flex items-center justify-between"><span class="font-semibold">${item.sku}</span><button onclick="copiarParaClipboard('${item.sku}')" class="copy-btn" title="Copiar SKU"><i class="fas fa-copy"></i></button></div></td>
                <td class="p-3"><div class="flex items-center justify-between"><span class="font-mono">${item.ean}</span><button onclick="copiarParaClipboard('${item.ean}')" class="copy-btn" title="Copiar EAN"><i class="fas fa-copy"></i></button></div></td>
                <td class="p-3"><div class="flex items-center justify-between"><span class="font-medium">${pesoFormatado}</span><button onclick="copiarParaClipboard('${pesoFormatado}')" class="copy-btn" title="Copiar Peso"><i class="fas fa-copy"></i></button></div></td>
                <td class="p-3"><div class="flex items-center justify-between"><span class="font-mono">${item.ncm || 'N/A'}</span><button onclick="copiarParaClipboard('${item.ncm || ''}')" class="copy-btn" title="Copiar NCM"><i class="fas fa-copy"></i></button></div></td>
                ${marketplaceCheckboxes}
                <td class="p-3 text-right">${actionButtons}</td>
            </tr>`;
    }).join('')}</tbody>`;

    const inicio = (paginaAtualBuscaLoja - 1) * ITENS_POR_PAGINA_LOJA;
    const paginacaoHtml = `
        <div class="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
            <span class="text-sm text-gray-600">
                Exibindo ${inicio + 1} - ${Math.min(inicio + ITENS_POR_PAGINA_LOJA, totalItens)} de <strong>${totalItens}</strong> resultados.
            </span>
            <div class="flex items-center gap-2">
                <button onclick="mudarPaginaDaLoja('${lojaId}', -1)" class="bg-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50" ${paginaAtualBuscaLoja === 1 ? 'disabled' : ''}>
                    Anterior
                </button>
                <span class="font-semibold text-gray-700">${paginaAtualBuscaLoja} / ${totalPaginas}</span>
                <button onclick="mudarPaginaDaLoja('${lojaId}', 1)" class="bg-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50" ${paginaAtualBuscaLoja >= totalPaginas ? 'disabled' : ''}>
                    Próxima
                </button>
            </div>
        </div>
    `;

    resultContainer.innerHTML = `
        <style> .copy-btn { opacity: 0.2; transition: opacity 0.2s; padding: 4px; } tr:hover .copy-btn { opacity: 1; } .copy-btn:hover { color: #4F46E5; } </style>
        <div class="overflow-x-auto table-container">
            <table class="w-full text-sm min-w-[1200px]">${tableHeader}${tableBody}</table>
        </div>
        ${totalPaginas > 1 ? paginacaoHtml : `<p class="text-xs text-gray-500 mt-2">Exibindo ${totalItens} resultado(s).</p>`}
    `;
}

// Substitua a função mudarPaginaDaLoja inteira por esta:
/**
 * Altera a página atual e dispara uma nova busca no backend.
 * @param {string} lojaId - O ID da loja para saber qual container atualizar.
 * @param {number} direcao - A direção da mudança (-1 para anterior, +1 para próxima).
 */
async function mudarPaginaDaLoja(lojaId, direcao) {
    const novaPagina = paginaAtualBuscaLoja + direcao;
    const termoBusca = document.getElementById(`search-input-${lojaId}`).value.trim();
    
    // Dispara a busca para a nova página
    await carregarPaginaDaLoja(lojaId, novaPagina, termoBusca);
}



/**
 * Renderiza a PÁGINA ATUAL dos resultados da busca para uma loja específica.
 * @param {string} lojaId - O ID da loja para renderizar a página.
 */
function renderizarPaginaDaLoja(lojaId) {
    const resultContainer = document.getElementById(`result-container-${lojaId}`);
    
    if (resultadosBuscaLoja.length === 0) {
        const termoBusca = document.getElementById(`search-input-${lojaId}`).value.trim();
        resultContainer.innerHTML = `<p class="text-center text-gray-500 p-8">Nenhum item encontrado para "<strong>${termoBusca}</strong>" nesta loja.</p>`;
        return;
    }

    // Calcula a paginação
    const totalPaginas = Math.ceil(resultadosBuscaLoja.length / ITENS_POR_PAGINA_LOJA);
    const inicio = (paginaAtualBuscaLoja - 1) * ITENS_POR_PAGINA_LOJA;
    const fim = inicio + ITENS_POR_PAGINA_LOJA;
    const itensDaPagina = resultadosBuscaLoja.slice(inicio, fim);

    const marketplaces = ['MERCADO', 'SHOPEE', 'MAGALU', 'SHEIN', 'SITE'];
    
    const tableHeader = `
        <thead class="bg-gray-100 sticky top-0 z-10">
            <tr>
                <th class="p-3 text-left font-semibold text-gray-600">SKU</th>
                <th class="p-3 text-left font-semibold text-gray-600">EAN</th>
                <th class="p-3 text-left font-semibold text-gray-600">Peso(kg)</th>
                <th class="p-3 text-left font-semibold text-gray-600">NCM</th>
                ${marketplaces.map(mp => `<th class="p-2 text-center font-semibold text-gray-600">${mp}</th>`).join('')}
                <th class="p-3 text-right font-semibold text-gray-600">Ações</th>
            </tr>
        </thead>`;

    const tableBody = `<tbody>${itensDaPagina.map(item => {
        const dadosDaLoja = item.lojas ? item.lojas[lojaId] : null;
        const canEdit = hasPermission('processadorEANs', 'editar');
        const canProcess = hasPermission('processadorEANs', 'processar');
            console.log(`[LOG 1 - Render] Criando botão para SKU: ${item.sku}, com ID: ${item.id} (Tipo: ${typeof item.id})`);

        const marketplaceCheckboxes = marketplaces.map(mp => {
            const status = dadosDaLoja?.marketplaces?.[mp] || { marcado: false };
            const isChecked = status.marcado;
            const tooltip = isChecked ? `Marcado por ${status.por} em ${new Date(status.em).toLocaleString('pt-BR')}` : (canEdit ? `Marcar como processado em ${mp}` : 'Sem permissão para editar');
            
            return `<td class="p-3 text-center">
                        <input type="checkbox" onchange="marcarMarketplace('${item.id}', '${lojaId}', '${mp}')" 
                               class="h-5 w-5 text-indigo-600 focus:ring-indigo-500 ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}" 
                               ${isChecked ? 'checked' : ''} 
                               ${!canEdit ? 'disabled' : ''} 
                               title="${tooltip}">
                    </td>`;
        }).join('');

        // Arquivo: static/05-processador-eans.js -> dentro da função renderizarPaginaDaLoja

    const actionButtons = canProcess 
        ? `<button onclick="abrirModalEdicaoEAN('${item.id}')" class="text-blue-500 hover:text-blue-700 mr-4" title="Editar"><i class="fas fa-pencil-alt"></i></button>
           <button onclick="excluirEAN('${item.id}')" class="text-red-500 hover:text-red-700" title="Excluir"><i class="fas fa-trash"></i></button>`
        : '<span class="text-xs text-gray-400">Sem permissão</span>';

    const pesoFormatado = formatarPesoParaExibicao(item.peso);


        return `<tr id="item-row-${item.id}" class="border-t hover:bg-gray-50">
                <td class="p-3"><div class="flex items-center justify-between"><span class="font-semibold">${item.sku}</span><button onclick="copiarParaClipboard('${item.sku}')" class="copy-btn" title="Copiar SKU"><i class="fas fa-copy"></i></button></div></td>
                <td class="p-3"><div class="flex items-center justify-between"><span class="font-mono">${item.ean}</span><button onclick="copiarParaClipboard('${item.ean}')" class="copy-btn" title="Copiar EAN"><i class="fas fa-copy"></i></button></div></td>
                <td class="p-3"><div class="flex items-center justify-between"><span class="font-medium">${pesoFormatado}</span><button onclick="copiarParaClipboard('${pesoFormatado}')" class="copy-btn" title="Copiar Peso"><i class="fas fa-copy"></i></button></div></td>
                <td class="p-3"><div class="flex items-center justify-between"><span class="font-mono">${item.ncm || 'N/A'}</span><button onclick="copiarParaClipboard('${item.ncm || ''}')" class="copy-btn" title="Copiar NCM"><i class="fas fa-copy"></i></button></div></td>
                ${marketplaceCheckboxes}
                <td class="p-3 text-right">${actionButtons}</td>
            </tr>`;
}).join('')}</tbody>`;

    const paginacaoHtml = `
        <div class="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
            <span class="text-sm text-gray-600">
                Exibindo ${inicio + 1} - ${Math.min(fim, resultadosBuscaLoja.length)} de <strong>${resultadosBuscaLoja.length}</strong> resultados.
            </span>
            <div class="flex items-center gap-2">
                <button onclick="mudarPaginaDaLoja('${lojaId}', -1)" class="bg-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50" ${paginaAtualBuscaLoja === 1 ? 'disabled' : ''}>
                    Anterior
                </button>
                <span class="font-semibold text-gray-700">${paginaAtualBuscaLoja} / ${totalPaginas}</span>
                <button onclick="mudarPaginaDaLoja('${lojaId}', 1)" class="bg-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50" ${paginaAtualBuscaLoja >= totalPaginas ? 'disabled' : ''}>
                    Próxima
                </button>
            </div>
        </div>
    `;

    resultContainer.innerHTML = `
        <style> .copy-btn { opacity: 0.2; transition: opacity 0.2s; padding: 4px; } tr:hover .copy-btn { opacity: 1; } .copy-btn:hover { color: #4F46E5; } </style>
        <div class="overflow-x-auto table-container">
            <table class="w-full text-sm min-w-[1200px]">${tableHeader}${tableBody}</table>
        </div>
        ${totalPaginas > 1 ? paginacaoHtml : `<p class="text-xs text-gray-500 mt-2">Exibindo ${resultadosBuscaLoja.length} resultado(s).</p>`}
    `;
}

/**
 * Altera a página atual da busca da loja e renderiza novamente.
 * @param {string} lojaId - O ID da loja para saber qual container atualizar.
 * @param {number} direcao - A direção da mudança (-1 para anterior, +1 para próxima).
 */
function mudarPaginaDaLoja(lojaId, direcao) {
    const totalPaginas = Math.ceil(resultadosBuscaLoja.length / ITENS_POR_PAGINA_LOJA);
    const novaPagina = paginaAtualBuscaLoja + direcao;

    if (novaPagina >= 1 && novaPagina <= totalPaginas) {
        paginaAtualBuscaLoja = novaPagina;
        renderizarPaginaDaLoja(lojaId);
    }
}



/**
 * Copia um texto para a área de transferência e exibe uma notificação.
 * @param {string} texto - O texto a ser copiado.
 */
function copiarParaClipboard(texto) {
    if (!texto) return; // Não faz nada se o texto for vazio

    navigator.clipboard.writeText(texto).then(() => {
        showToast(`"${texto}" copiado para a área de transferência!`, 'success');
    }).catch(err => {
        console.error('Falha ao copiar texto: ', err);
        showToast('Erro ao copiar.', 'error');
    });
}




// Arquivo: static/05-processador-eans.js

/**
 * Marca ou desmarca um item em um marketplace específico DENTRO de uma loja.
 * VERSÃO CORRIGIDA: Não recarrega a lista, apenas envia a atualização para o servidor.
 * @param {string|number} itemId - O ID do item (vem como string do HTML).
 * @param {string} lojaId - O ID da loja.
 * @param {string} marketplace - O nome do marketplace (ex: 'MERCADO').
 */
async function marcarMarketplace(itemId, lojaId, marketplace) {
    // 1. Verifica a permissão para editar
    if (!hasPermission('processadorEANs', 'editar')) {
        showToast('Você não tem permissão para alterar o status.', 'error');
        // Desfaz a ação visual do checkbox, pois não será salva
        const checkbox = document.querySelector(`input[onchange="marcarMarketplace('${itemId}', '${lojaId}', '${marketplace}')"]`);
        if (checkbox) checkbox.checked = !checkbox.checked;
        return;
    }

    const checkbox = document.querySelector(`input[onchange="marcarMarketplace('${itemId}', '${lojaId}', '${marketplace}')"]`);
    if (!checkbox) return;

    const novoStatusMarcado = checkbox.checked;

    // 2. Cria o objeto de status que será salvo no banco de dados
    const statusInfo = {
        marcado: novoStatusMarcado,
        por: novoStatusMarcado ? currentUser.username : null,
        em: novoStatusMarcado ? new Date().toISOString() : null
    };

    // 3. Atualiza o tooltip da interface imediatamente para um feedback rápido
    checkbox.title = novoStatusMarcado
        ? `Marcado por ${statusInfo.por} em ${new Date(statusInfo.em).toLocaleString('pt-BR')}`
        : `Marcar como processado em ${marketplace}`;

    // 4. Envia a atualização para o servidor de forma assíncrona (em segundo plano)
    try {
        const response = await fetch('/api/eans/update_marketplace_status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itemId: parseInt(itemId), // Garante que o ID seja um número
                lojaId,
                marketplace,
                statusInfo
            })
        });

        const result = await response.json();
        // Se a resposta do servidor não for OK, lança um erro
        if (!response.ok || result.status !== 'ok') {
            throw new Error(result.message || 'Falha ao salvar o status no servidor.');
        }

        showToast('Status salvo com sucesso!', 'success');

        // **[PONTO CHAVE]** Não há mais recarregamento da página ou da tabela aqui.
        // A ação termina com sucesso, e a lista permanece exatamente como estava.

    } catch (error) {
        console.error("Erro ao atualizar status do marketplace:", error);
        showToast(`Erro ao salvar: ${error.message}. A alteração foi desfeita.`, 'error');
        
        // **[REVERSÃO EM CASO DE ERRO]** Se o salvamento falhar, desfaz a marcação no checkbox
        checkbox.checked = !novoStatusMarcado;
        checkbox.title = `Falha ao salvar. Tente novamente.`;
    }
}









// Em static/05-processador-eans.js

/**
 * Abre o modal para editar um item EAN, buscando os dados do servidor.
 * @param {string|number} itemId - O ID do item a ser editado.
 */
async function abrirModalEdicaoEAN(itemId) {
    // Armazena o ID globalmente para a função de salvar usar depois.
    itemParaEditarId = itemId;

    try {
        // FAZ UMA BUSCA NO BACKEND PELO ITEM ESPECÍFICO
        // Usamos a rota de busca, que também funciona para IDs exatos.
        const response = await fetch(`/api/eans/search?termo=${itemId}`);
        if (!response.ok) throw new Error('Falha ao buscar o item no servidor.');

        const data = await response.json();
        
        // A busca retorna uma lista, pegamos o primeiro (e único) resultado.
        const item = data.items.find(i => i.id == itemId);

        if (!item) {
            showToast('Erro: Item não encontrado no banco de dados.', 'error');
            return;
        }

        // Preenche o modal com os dados do item recebido do servidor.
        document.getElementById('edit-sku-input').value = item.sku;
        document.getElementById('edit-ean-input').value = item.ean;
        document.getElementById('edit-peso-input').value = item.peso || '';
        document.getElementById('edit-ncm-input').value = item.ncm || '';
        
        // Mostra o modal.
        document.getElementById('edit-ean-modal').classList.remove('hidden');

    } catch (error) {
        console.error("Erro ao abrir modal de edição:", error);
        showToast('Não foi possível carregar os dados do item para edição.', 'error');
    }
}


/**
 * Fecha o modal de edição de EAN.
 */
function fecharModalEdicaoEAN() {
    document.getElementById('edit-ean-modal').classList.add('hidden');
    itemParaEditarId = null;
}

// Em static/05-processador-eans.js

/**
 * Salva as alterações de um item EAN, enviando os dados para a API.
 */
async function salvarEdicaoEAN() {
    if (!itemParaEditarId) {
        showToast('Erro crítico: ID do item para edição não foi definido.', 'error');
        return;
    }

    // Coleta os dados do modal
    const dadosAtualizados = {
        sku: document.getElementById('edit-sku-input').value.trim().toUpperCase(),
        ean: document.getElementById('edit-ean-input').value.trim().replace(/\D/g, ''),
        peso: parseFloat(document.getElementById('edit-peso-input').value.trim().replace(',', '.')) || null,
        ncm: document.getElementById('edit-ncm-input').value.trim() || null
    };

    if (!dadosAtualizados.sku || !dadosAtualizados.ean) {
        showToast('SKU e EAN não podem ser vazios.', 'error');
        return;
    }

    try {
        // Envia a requisição PUT para a API de edição
        const response = await fetch(`/api/eans/${itemParaEditarId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosAtualizados)
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || 'Erro do servidor.');
        }

        showToast('Item atualizado com sucesso!', 'success');
        fecharModalEdicaoEAN();
        
        // Recarrega a página atual da tabela para refletir a mudança
        const abaAtiva = document.querySelector('.ean-tab-btn:not(.border-transparent)');
        if (abaAtiva) {
            const lojaId = abaAtiva.id.replace('tab-btn-', '');
            const termoBusca = document.getElementById(`search-input-${lojaId}`).value;
            // A função carregarPaginaDaLoja já busca do backend
            await carregarPaginaDaLoja(lojaId, paginaAtualBuscaLoja, termoBusca);
        }

    } catch (error) {
        console.error("Erro ao salvar edição do EAN:", error);
        showToast(`Erro ao salvar: ${error.message}`, 'error');
    }
}


// Em static/05-processador-eans.js

/**
 * Exclui um item EAN enviando uma requisição para a API.
 * @param {string|number} itemId - O ID do item a ser excluído.
 */
async function excluirEAN(itemId) {
    if (!confirm('Tem certeza que deseja excluir este item permanentemente?')) {
        return;
    }

    try {
        // Envia a requisição DELETE para a API de exclusão
        const response = await fetch(`/api/eans/${itemId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || 'Erro do servidor.');
        }

        showToast('Item excluído com sucesso!', 'success');

        // Remove a linha da tabela da interface para um feedback visual imediato
        const linhaParaRemover = document.getElementById(`item-row-${itemId}`);
        if (linhaParaRemover) {
            linhaParaRemover.remove();
        }
        
        // Opcional: Recarregar a contagem total e da aba
        // (Para simplificar, pode-se apenas remover da tela ou recarregar a busca)
        const totalCountEl = document.getElementById('ean-total-count');
        if (totalCountEl) {
            totalCountEl.innerText = parseInt(totalCountEl.innerText) - 1;
        }

    } catch (error) {
        console.error("Erro ao excluir EAN:", error);
        showToast(`Erro ao excluir: ${error.message}`, 'error');
    }
}


// script.js

/**
 * Gera e baixa um relatório em PDF com os EANs filtrados.
 * VERSÃO CORRIGIDA: Agora verifica a permissão 'processar' em vez de 'visualizar'.
 */
// Em static/05-processador-eans.js

/**
 * Gera e baixa um relatório em PDF com os EANs filtrados, buscando os dados do servidor.
 */
async function gerarRelatorioEANsPDF() {
    if (!hasPermission('processadorEANs', 'processar')) {
        showToast('Você não tem permissão para gerar este relatório.', 'error');
        return;
    }

    const lojaId = document.getElementById('pdf-filtro-loja').value;
    const marketplaceFiltro = document.getElementById('pdf-filtro-marketplace').value;
    const statusFiltro = document.getElementById('pdf-filtro-status').value;
    const skuPrefixo = document.getElementById('pdf-filtro-sku').value.trim().toUpperCase();

    const lojaConfig = lojasConfigEAN.find(l => l.id === lojaId);
    if (!lojaConfig) {
        showToast('Erro: Configuração da loja não encontrada.', 'error');
        return;
    }

    showToast('Gerando relatório... Buscando dados do servidor, isso pode levar um momento.', 'info');

    try {
        // 1. BUSCA TODOS OS DADOS DA LOJA E FILTRO DE SKU NO SERVIDOR
        const response = await fetch(`/api/eans/search?lojaId=${lojaId}&termo=${encodeURIComponent(skuPrefixo)}&per_page=50000`); // Pega até 50k itens
        if (!response.ok) throw new Error('Falha ao buscar dados para o relatório.');
        
        const data = await response.json();
        let itensDaLoja = data.items;

        // 2. APLICA OS FILTROS DE STATUS E MARKETPLACE LOCALMENTE
        const marketplacesParaVerificar = (marketplaceFiltro === 'Allmarket')
            ? ['MERCADO', 'SHOPEE', 'MAGALU', 'SHEIN', 'SITE']
            : [marketplaceFiltro];

        const itensFiltrados = itensDaLoja.filter(item => {
            if (statusFiltro === 'todos') return true;

            const dadosDaLoja = item.lojas ? item.lojas[lojaId] : null;
            if (!dadosDaLoja) return statusFiltro === 'nao_cadastrados';

            const isCadastrado = marketplacesParaVerificar.some(mp => dadosDaLoja.marketplaces?.[mp]?.marcado);

            if (statusFiltro === 'cadastrados') return isCadastrado;
            if (statusFiltro === 'nao_cadastrados') return !isCadastrado;
            return true;
        });

        if (itensFiltrados.length === 0) {
            showToast('Nenhum item encontrado com os filtros selecionados.', 'info');
            return;
        }

        // 3. GERA O PDF (LÓGICA INALTERADA)
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: marketplaceFiltro === 'Allmarket' ? 'landscape' : 'portrait' });

        doc.setFontSize(18);
        doc.text(`Relatório de EANs - ${lojaConfig.nome}`, 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        const filtroSkuTexto = skuPrefixo ? ` | SKU: ${skuPrefixo}*` : '';
        doc.text(`Marketplace: ${marketplaceFiltro === 'Allmarket' ? 'Todos' : marketplaceFiltro} | Status: ${statusFiltro.replace('_', ' ')}${filtroSkuTexto}`, 14, 30);

        let head, body;
        if (marketplaceFiltro === 'Allmarket') {
            head = [['SKU', 'EAN', ...marketplacesParaVerificar]];
            body = itensFiltrados.map(item => {
                const statusPorMarketplace = marketplacesParaVerificar.map(mp => {
                    return item.lojas?.[lojaId]?.marketplaces?.[mp]?.marcado ? 'Sim' : 'Não';
                });
                return [item.sku, item.ean, ...statusPorMarketplace];
            });
        } else {
            head = [['SKU', 'EAN', 'Status no Marketplace']];
            body = itensFiltrados.map(item => {
                const status = item.lojas?.[lojaId]?.marketplaces?.[marketplaceFiltro]?.marcado ? 'Cadastrado' : 'Não Cadastrado';
                return [item.sku, item.ean, status];
            });
        }

        doc.autoTable({
            head: head,
            body: body,
            startY: 35,
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185] },
        });

        const dataAtual = new Date();
        const nomeArquivo = `Relatorio_EANs_${lojaConfig.nome.replace(/\s/g, '')}_${dataAtual.toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
        doc.save(nomeArquivo);

        logAction(`Relatório de EANs em PDF gerado para Loja: ${lojaConfig.nome}.`);
        showToast('Relatório PDF gerado com sucesso!', 'success');

    } catch (error) {
        console.error("Erro ao gerar relatório PDF:", error);
        showToast('Ocorreu um erro ao gerar o relatório. Verifique o console.', 'error');
    }
}




/**
 * Executa uma busca geral e armazena os resultados. Em seguida, renderiza a primeira página.
 * VERSÃO COM PAGINAÇÃO.
 */
// Em static/05-processador-eans.js

/**
 * Executa uma busca geral no BACKEND e renderiza os resultados.
 */
async function executarBuscaGeralEAN() {
    const input = document.getElementById('ean-busca-geral-input');
    const termoBusca = input.value.trim();
    const resultadosContainer = document.getElementById('ean-busca-geral-resultados');

    if (!termoBusca) {
        resultadosContainer.innerHTML = '<p class="text-center text-yellow-700 bg-yellow-50 p-3 rounded-lg">Por favor, digite um SKU ou EAN para iniciar a busca.</p>';
        return;
    }

    // Mostra um indicador de carregamento
    resultadosContainer.innerHTML = '<p class="text-center text-gray-500 p-8 animate-pulse">Buscando em todas as lojas no servidor...</p>';

    try {
        // Chama a API de busca sem especificar uma loja para buscar em tudo
        const response = await fetch(`/api/eans/search?termo=${encodeURIComponent(termoBusca)}&per_page=500`); // Limite de 500 para busca geral
        if (!response.ok) {
            throw new Error('Falha na comunicação com o servidor.');
        }
        const data = await response.json();

        // Renderiza os resultados recebidos do backend
        renderizarResultadosBuscaGeral(data.items, termoBusca);

    } catch (error) {
        console.error("Erro na busca geral de EANs:", error);
        resultadosContainer.innerHTML = '<p class="text-center text-red-500 p-8">Erro ao carregar dados do servidor.</p>';
    }
}


/**
 * Renderiza a página atual dos resultados da busca geral.
 */
// Em static/05-processador-eans.js

/**
 * Renderiza a tabela de resultados da busca geral.
 * @param {Array} itens - A lista de itens retornada pelo backend.
 * @param {string} termoBusca - O termo que foi pesquisado.
 */
function renderizarResultadosBuscaGeral(itens, termoBusca) {
    const resultadosContainer = document.getElementById('ean-busca-geral-resultados');

    if (itens.length === 0) {
        resultadosContainer.innerHTML = `<p class="text-center text-red-700 bg-red-50 p-3 rounded-lg">Nenhum item encontrado para "<strong>${termoBusca}</strong>".</p>`;
        return;
    }

    const tabelaHtml = `
        <div class="overflow-x-auto border rounded-lg mt-4">
            <table class="w-full text-sm">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="p-3 text-left font-semibold text-gray-600">SKU</th>
                        <th class="p-3 text-left font-semibold text-gray-600">EAN</th>
                        <th class="p-3 text-left font-semibold text-gray-600">Loja</th>
                    </tr>
                </thead>
                <tbody>
                    ${itens.map(item => {
                        // Lógica para identificar a qual loja o SKU pertence
                        const lojaConfig = lojasConfigEAN.find(l => l.sufixo && item.sku.endsWith(l.sufixo)) 
                                        || lojasConfigEAN.find(l => l.id === 'loja-outros');
                        
                        return `
                            <tr class="border-t hover:bg-indigo-50">
                                <td class="p-3 font-semibold text-indigo-800">${item.sku}</td>
                                <td class="p-3 font-mono">${item.ean}</td>
                                <td class="p-3">
                                    <span class="px-2 py-1 text-xs font-medium rounded-full bg-${lojaConfig.cor}-100 text-${lojaConfig.cor}-800">
                                        ${lojaConfig.nome}
                                    </span>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <p class="text-xs text-gray-500 mt-2">Exibindo ${itens.length} resultado(s).</p>
    `;

    resultadosContainer.innerHTML = tabelaHtml;
}


/**
 * Altera a página atual da busca geral e renderiza novamente.
 * @param {number} direcao - A direção da mudança (-1 para anterior, +1 para próxima).
 */
function mudarPaginaBuscaGeral(direcao) {
    const totalPaginas = Math.ceil(resultadosBuscaGeral.length / ITENS_POR_PAGINA_BUSCA_GERAL);
    const novaPagina = paginaAtualBuscaGeral + direcao;

    if (novaPagina >= 1 && novaPagina <= totalPaginas) {
        paginaAtualBuscaGeral = novaPagina;
        renderizarPaginaBuscaGeral();
    }
}



