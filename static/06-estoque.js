// ================================================================================
// 06 ESTOQUE
// ================================================================================
// --- 07-função-de-exclusão-total-de-dados-zona-de-perigo.js ---
// =================================================================================
// FUNÇÃO DE EXCLUSÃO TOTAL DE DADOS (ZONA DE PERIGO)
// =================================================================================
/**
 * Inicia o processo de exclusão de TODOS os dados do sistema.
 * Requer múltiplas confirmações para segurança.
 */
async function deleteAllSystemData() {
    // 1. Primeira camada de segurança: Permissão de Admin Master
    if (currentUser.role !== 'admin-master') {
        showToast('Apenas o administrador mestre pode executar esta ação.', 'error');
        return;
    }
    // 2. Segunda camada de segurança: Confirmação inicial
    if (!confirm("ATENÇÃO: VOCÊ ESTÁ PRESTES A DELETAR TODOS OS DADOS DO SISTEMA. Esta ação não pode ser desfeita. Deseja continuar?")) {
        showToast('Operação cancelada.', 'info');
        return;
    }
    // 3. Terceira camada de segurança: Confirmação por digitação
    const confirmationText = "EXCLUIR TUDO AGORA";
    const userInput = prompt(`Esta é sua última chance. Para confirmar a exclusão permanente de todos os dados, digite a frase exatamente como abaixo:\n\n${confirmationText}`);
    if (userInput !== confirmationText) {
        showToast('A frase de confirmação não corresponde. Operação cancelada.', 'error');
        return;
    }
    // 4. Execução da Exclusão
    try {
        // Limpa todos os arrays de dados em memória
        users = [];
        itensEstoque = [];
        pedidos = [];
        images = [];
        producao = [];
        costura = [];
        expedicao = [];
        logs = [];
        historicoArtes = [];
        transacoesEstoque = [];
        relatoriosArquivados = [];
        pedidosComErro = [];
        // Limpa completamente o localStorage
        await saveData();
        // Feedback final e logout forçado
        alert('Todos os dados do sistema foram excluídos com sucesso. O sistema será reiniciado.');
       
        // Força o logout e o recarregamento da página para um estado limpo
        currentUser = null;
        window.location.reload();
    } catch (error) {
        console.error("Erro ao tentar excluir todos os dados:", error);
        showToast('Ocorreu um erro inesperado durante a exclusão.', 'error');
    }
}
/**
 * Exclui todos os dados relacionados ao módulo de Pedidos (PF),
 * incluindo pedidos pendentes, processados e com erro.
 * Esta função requer confirmação do usuário antes de prosseguir.
 */
async function excluirDadosModuloPF() {
    // 1. Verifica se o usuário tem a permissão necessária (admin-master).
    // Apenas administradores mestres devem poder executar uma ação tão destrutiva.
    if (currentUser.role !== 'admin-master') {
        showToast('Apenas administradores mestres podem executar esta ação.', 'error');
        return;
    }
    // 2. Pede uma confirmação explícita ao usuário.
    // Isso previne a exclusão acidental de todos os dados de pedidos.
    const confirmacao = prompt("ATENÇÃO: Esta ação excluirá TODOS os pedidos (pendentes, processados, com erro) e não pode ser desfeita. Digite 'EXCLUIR TUDO' para confirmar.");
    // 3. Verifica se a confirmação foi digitada corretamente.
    if (confirmacao === 'EXCLUIR TUDO') {
        // 4. Limpa as variáveis de dados do módulo de pedidos.
        pedidos = [];
        pedidosComErro = [];
        // 5. Salva o estado vazio no localStorage para persistir a exclusão.
        await saveData();
        // 6. Recarrega a visualização do módulo de pedidos para refletir a limpeza.
        // A tela ficará vazia.
        loadPedidos();
        // 7. Registra a ação no log do sistema para auditoria.
        const logMessage = 'Todos os dados do módulo de Pedidos foram excluídos.';
        await logAction(logMessage);
        // 8. Exibe uma notificação de sucesso para o usuário.
        showToast(logMessage, 'success');
    } else {
        // 9. Se a confirmação falhar, informa o usuário que a operação foi cancelada.
        showToast('Operação cancelada. A confirmação não foi digitada corretamente.', 'info');
    }
}
// --- 10-função-central-de-registro-de-transações-de-estoque.js ---
// =================================================================================
// FUNÇÃO CENTRAL DE REGISTRO DE TRANSAÇÕES DE ESTOQUE
// =================================================================================
/**
 * Registra uma transação de estoque.
 * @param {string} sku - O SKU do item.
 * @param {number} quantidade - A quantidade movimentada (positiva para entrada, negativa para saída).
 * @param {string} tipo - O tipo de transação (ex: 'ENTRADA', 'SAÍDA', 'AJUSTE', 'VENDA').
 * @param {string} prateleira - A prateleira afetada.
 * @param {string} [motivo=''] - Um motivo ou observação para a transação.
 */
// 06-estoque.js -> DENTRO DA FUNÇÃO registrarTransacao

/**
 * Registra uma transação de estoque.
 */
function registrarTransacao(sku, quantidade, tipo, prateleira, motivo = '') {
    const usuario = currentUser ? currentUser.username : 'Sistema';

    // ANTES (COM PROBLEMA DE ORDEM DUPLICADA):
    // transacoesEstoque.unshift({ ... });

    // DEPOIS (CORRIGIDO):
    // Usamos .push() para adicionar ao final. A ordenação virá do backend.
    transacoesEstoque.push({
        id: `TRANS-${Date.now()}`,
        timestamp: new Date().toISOString(),
        usuario: usuario,
        sku: sku.toUpperCase(),
        quantidade: quantidade,
        tipo: tipo.toUpperCase(),
        prateleira: prateleira ? prateleira.toUpperCase() : 'N/A',
        motivo: motivo
    });

    // Limita o log para não crescer indefinidamente
    if (transacoesEstoque.length > 20000) {
        // Se usamos push, temos que remover o primeiro (mais antigo) com .shift()
        transacoesEstoque.shift();
    }
}

// --- 18-módulo-de-estoque.js ---
// =================================================================================
// MÓDULO DE ESTOQUE
// =================================================================================
// --- 19-funções-para-importação-de-estoque-ajustado-para-aceitar-texto-ou-arquivo.js ---
// =================================================================================
// FUNÇÕES PARA IMPORTAÇÃO DE ESTOQUE - AJUSTADO PARA ACEITAR TEXTO OU ARQUIVO
// =================================================================================
// 1. Função que aciona a seleção do arquivo .xlsx (sem alterações)
function triggerXlsxImport() {
    // VERIFICAÇÃO DE PERMISSÃO 'importar'
    if (!hasPermission('estoque', 'importar')) {
        showToast('Permissão negada para importar planilhas.', 'error');
        return;
    }
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls';
    fileInput.onchange = (event) => {
        const file = event.target.files[0];
        if (file) {
            handleXlsxFile(file);
        }
    };
    fileInput.click();
}
// 2. Função que lê o arquivo Excel usando a biblioteca SheetJS (sem alterações)
function handleXlsxFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            // Chama a função de processamento com os dados do Excel
            processData(jsonData);
        } catch (error) {
            console.error("Erro ao processar arquivo Excel:", error);
            showToast('Falha ao ler o arquivo Excel. Verifique se o formato está correto.', 'error');
        }
    };
    reader.onerror = () => {
        showToast('Erro ao ler o arquivo.', 'error');
    };
    reader.readAsArrayBuffer(file);
}
// 3. Função que processa os dados (AJUSTADA COM PROTEÇÃO CONTRA ERROS)
// Arquivo: script.js
// script.js
/**
 * Processa os dados de uma planilha (ou texto) para adicionar ou atualizar itens no estoque,
 * registrando a transação como 'CADASTRO' para itens novos e 'ENTRADA' para atualizações.
 * @param {Array<Array<string>>} data - Os dados da planilha, onde a primeira linha é o cabeçalho.
 */
async function processData(data) {
    let dataRows;
    const headers = data[0].map(h => h.toString().toLowerCase().trim()); // Pega os cabeçalhos
    // Encontra o índice das colunas essenciais e das opcionais
    const skuIndex = headers.indexOf('sku');
    const qtdIndex = headers.indexOf('qtd');
    const prateleiraIndex = headers.indexOf('prateleira');
    const capacidadeIndex = headers.indexOf('capacidade');
    const minStockIndex = headers.indexOf('estoque min.') || headers.indexOf('estoque minimo');
    // Validação de cabeçalhos essenciais
   if (data[0] && isNaN(parseInt(data[0][1]))) { // Se o segundo item da primeira linha não for um número, assume-se que é um cabeçalho.
        dataRows = data.slice(1);
    } else {
        dataRows = data;
    }
    if (dataRows.length === 0) {
        showToast('Nenhum dado para processar na planilha.', 'info');
        return;
    }
    let totalQtdAdded = 0;
    let totalQtdUpdated = 0;
    let errorLines = [];
    dataRows.forEach((row, index) => {
        // Ignora linhas completamente vazias ou que não sejam um array
        if (!Array.isArray(row) || row.every(cell => cell === null || cell === '')) {
            return;
        }
        // Lê os dados com base na POSIÇÃO da coluna
        const sku = row[0] ? String(row[0]).trim() : null;
        const qtd = parseInt(row[1]);
        const prateleira = row[2] ? String(row[2]).trim() : null;
       
        // Colunas opcionais (se existirem, serão lidas; senão, ignoradas)
        const capacidade = !isNaN(parseInt(row[3])) ? parseInt(row[3]) : 25; // Padrão 25
        const minStock = !isNaN(parseInt(row[4])) ? parseInt(row[4]) : ESTOQUE_BAIXO_THRESHOLD; // Padrão do sistema
        // Validação dos dados essenciais da linha
        if (!sku || isNaN(qtd) || !prateleira) {
            errorLines.push({ line: index + 2, reason: `Dados inválidos ou colunas faltando na linha.` });
            return;
        }
        // Procura pelo item existente
        const existingItem = itensEstoque.find(item =>
            item.sku.toUpperCase() === sku.toUpperCase() &&
            item.prateleira.toUpperCase() === prateleira.toUpperCase()
        );
        if (existingItem) {
            // --- LÓGICA PARA ITEM EXISTENTE ---
            existingItem.qtd += qtd;
            totalQtdUpdated += qtd;
            registrarTransacao(sku, qtd, 'ENTRADA', prateleira, 'Entrada via Importação de Planilha');
        } else {
            // --- LÓGICA PARA ITEM NOVO (CADASTRO) ---
            itensEstoque.push({
                id: Date.now() + Math.random(),
                sku: sku.toUpperCase(),
                prateleira: prateleira.toUpperCase(),
                qtd: qtd,
                capacidade: capacidade,
                minStock: minStock,
                status: 'Disponível',
                reservadoPor: null
            });
            totalQtdAdded += qtd;
            registrarTransacao(sku, qtd, 'CADASTRO', prateleira, 'Cadastro via Importação de Planilha');
        }
    });
    // Feedback final para o usuário
    if (totalQtdAdded > 0 || totalQtdUpdated > 0) {
        await saveData();
        applyFilters();
        const message = `${totalQtdAdded} unidade(s) nova(s) cadastrada(s) e ${totalQtdUpdated} unidade(s) adicionada(s) ao estoque.`;
        await logAction(message);
        showToast(message, 'success');
    } else if (errorLines.length === 0) {
        showToast('Nenhum item novo foi adicionado. Verifique os dados da planilha.', 'info');
    }
    if (errorLines.length > 0) {
        const errorDetails = errorLines.map(e => `Linha ${e.line}: ${e.reason}`).join('\n');
        setTimeout(() => alert(`Atenção: ${errorLines.length} linha(s) da planilha não puderam ser importadas.\n\n${errorDetails}`), 500);
    }
}
// Modifique a função loadEstoque para renderizar as solicitações
function loadEstoque() {
    if (!hasPermission('estoque', 'visualizar')) return;
   
    // ... seus event listeners existentes ...
    document.getElementById('filter-sku').addEventListener('input', applyFilters);
    document.getElementById('filter-status').addEventListener('change', applyFilters);
    document.getElementById('mov-sku-terminal').addEventListener('input', updateAvailableShelves);
    applyFilters();
    // renderStockClearRequests(); // Removido para simplificar a exclusão de estoque
    applyPermissionsToUI();
}
/**
 * FUNÇÃO SIMPLIFICADA DE EXCLUSÃO DE ESTOQUE COM SENHA
 * @param {'TOTAL' | 'PREFIXO'} type - O tipo de limpeza solicitada.
 */
// Variável global para armazenar o tipo de exclusão (TOTAL ou PREFIXO)
let currentClearType = null;
let currentClearPrefix = null;

/**
 * Abre o modal de confirmação de exclusão de estoque.
 * @param {'TOTAL' | 'PREFIXO'} type - O tipo de limpeza solicitada.
 */
async function clearStockWithPassword(type) {
    // 1. Verificação de Permissão
    if (!hasPermission('estoque', 'excluir')) {
        showToast('Permissão negada para excluir estoque.', 'error');
        return;
    }

    currentClearType = type;
    currentClearPrefix = null;
    const modal = document.getElementById('clear-stock-modal');
    const detailsDiv = document.getElementById('clear-stock-details');
    const passwordInput = document.getElementById('clear-stock-password');
    const confirmationInput = document.getElementById('clear-stock-confirmation');
    const keywordSpan = document.getElementById('clear-stock-keyword');
    const confirmBtn = document.getElementById('confirm-clear-stock-btn');

    // Limpa campos anteriores
    passwordInput.value = '';
    confirmationInput.value = '';
    confirmBtn.disabled = true;

    let detailsMessage = '';

    if (type === 'PREFIXO') {
        const prefix = prompt("Digite o prefixo dos SKUs para excluir (ex: PC, PR):");
        if (!prefix) {
            showToast('Operação cancelada.', 'info');
            return;
        }
        currentClearPrefix = prefix.toUpperCase();
        detailsMessage = `Você está prestes a DELETAR TODOS os itens com prefixo **"${currentClearPrefix}"**. Esta ação é IRREVERSÍVEL.`;
    } else {
        detailsMessage = 'Você está prestes a DELETAR <b>TODO O ESTOQUE</b>. Esta ação é IRREVERSÍVEL.';
    }

    detailsDiv.innerHTML = detailsMessage;
    keywordSpan.textContent = 'EXCLUIR'; // A palavra-chave de confirmação é fixa

    // Adiciona event listeners para habilitar o botão
    passwordInput.oninput = checkConfirmationFields;
    confirmationInput.oninput = checkConfirmationFields;

    // Exibe o modal
    modal.classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('clear-stock-modal-content').classList.remove('scale-95', 'opacity-0');
        passwordInput.focus();
    }, 10);
}

/**
 * Fecha o modal de exclusão de estoque.
 */
function closeClearStockModal() {
    const modal = document.getElementById('clear-stock-modal');
    document.getElementById('clear-stock-modal-content').classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

/**
 * Verifica se os campos de senha e confirmação estão preenchidos corretamente.
 */
function checkConfirmationFields() {
    const password = document.getElementById('clear-stock-password').value;
    const confirmation = document.getElementById('clear-stock-confirmation').value;
    const confirmBtn = document.getElementById('confirm-clear-stock-btn');
    const keyword = document.getElementById('clear-stock-keyword').textContent;

    // Habilita o botão apenas se a senha e a palavra-chave de confirmação corresponderem
    confirmBtn.disabled = !(password.length > 0 && confirmation.toUpperCase() === keyword);
}

/**
 * Executa a lógica de exclusão após a confirmação no modal.
 */
async function executeClearStock() {
    const password = document.getElementById('clear-stock-password').value;
    const confirmBtn = document.getElementById('confirm-clear-stock-btn');

    // Desabilita o botão para evitar cliques múltiplos
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processando...';

    // 1. Verificação de Senha (Simulação)
    const isPasswordValid = await checkAdminPassword(currentUser.username, password);
    
    if (!isPasswordValid) {
        showToast('Senha incorreta. Ação cancelada.', 'error');
        confirmBtn.innerHTML = '<i class="fas fa-trash-alt mr-2"></i>Confirmar Exclusão';
        confirmBtn.disabled = false; // Reabilita para nova tentativa
        return;
    }

    // 2. Execução da Limpeza
    let itemsRemovedCount = 0;
    const originalCount = itensEstoque.length;

    if (currentClearType === 'PREFIXO') {
        // Lógica de exclusão por prefixo
        itensEstoque = itensEstoque.filter(item => {
            const sku = item.sku.toUpperCase();
            // Mantém apenas os itens que NÃO começam com o prefixo
            return !sku.startsWith(currentClearPrefix);
        });
        itemsRemovedCount = originalCount - itensEstoque.length;
    } else { // Limpeza TOTAL
        itemsRemovedCount = itensEstoque.length;
        itensEstoque = [];
    }

    // 3. Finalização
    await saveData();
    applyFilters();
    if (document.getElementById('admin-dashboard')) loadAdminDashboard();

    const logDetails = {
        tipo: currentClearType,
        prefixo: currentClearPrefix || 'N/A',
        autorizador: currentUser.username,
        itens_removidos: itemsRemovedCount
    };
    logAction({
        acao: 'Limpeza de Estoque Executada com Senha',
        modulo: 'Estoque',
        funcao: 'executeClearStock',
        detalhes: logDetails
    });

    closeClearStockModal();
    showToast(`Limpeza executada! ${itemsRemovedCount} registro(s) de estoque foram removidos.`, 'success');
}

// Função auxiliar para simular a verificação de senha (DEVE SER IMPLEMENTADA NO BACKEND)
// Por enquanto, retorna true se a senha for '123456'
async function checkAdminPassword(username, password) {
    // **Atenção:** Esta é uma simulação insegura. A validação real deve ser feita no servidor.
    // No app.py, você deve criar uma rota para verificar a senha do usuário.
    // Exemplo de como seria a chamada real (a ser implementada):
    /*
    try {
        const response = await fetch('/api/check_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        return data.isValid;
    } catch (error) {
        console.error('Erro ao verificar senha no servidor:', error);
        return false;
    }
    */
    // Simulação:
    return password === '=ESTOQUECLEAR='; // Substitua '123456' pela senha de teste ou remova esta linha após implementar o backend.
}

// A função cancelStockClearRequest também foi removida.

function applyFilters() {
    const filterSku = document.getElementById('filter-sku').value;
    // A linha abaixo foi removida:
    // const filterPrateleira = document.getElementById('filter-prateleira').value;
    const filterStatus = document.getElementById('filter-status').value;
   
    // Passamos apenas os filtros existentes para a função loadItens
    loadItens({ sku: filterSku, status: filterStatus });
}
function handlePrecisionSearch() {
    const filterSkuValue = document.getElementById('filter-sku').value.toLowerCase();
    const filterPrateleira = document.getElementById('filter-prateleira').value.toLowerCase();
    const filterStatus = document.getElementById('filter-status').value;
    const table = document.getElementById('itens-table');
    if (!table) return;
    const canDelete = hasPermission('estoque', 'excluir');
    const canReserve = hasPermission('estoque', 'movimentar'); // Usamos a permissão de movimentar para reservar
    // 1. Agrupar dados por SKU para obter o total e verificar a necessidade do botão de reserva
    const skuData = itensEstoque.reduce((acc, item) => {
        const sku = item.sku.toLowerCase();
        if (!acc[sku]) {
            acc[sku] = { total: 0, locations: [], minStockValues: new Set() };
        }
        acc[sku].total += item.qtd;
        acc[sku].locations.push(item);
        acc[sku].minStockValues.add(item.minStock);
        return acc;
    }, {});
    // 2. Filtrar os itens com base em TODOS os filtros da tela
    const skusToSearch = filterSkuValue.split(/[,;\s]+/).filter(s => s.trim() !== '');
    let itensFiltrados = itensEstoque.filter(item => {
        const itemSkuLower = item.sku.toLowerCase();
       
        const skuMatch = skusToSearch.length === 0 ? true : skusToSearch.includes(itemSkuLower);
        const prateleiraMatch = item.prateleira.toLowerCase().includes(filterPrateleira);
       
        const data = skuData[itemSkuLower];
        const isLowStock = data.total <= item.minStock;
        const isOverCapacity = item.qtd > item.capacidade;
       
        let statusMatch = true;
        if (filterStatus === 'low') statusMatch = isLowStock;
        else if (filterStatus === 'over') statusMatch = isOverCapacity;
        else if (filterStatus === 'ok') statusMatch = !isLowStock && !isOverCapacity;
        return skuMatch && prateleiraMatch && statusMatch;
    });
    // 3. Montar a tabela com os resultados e o botão de reserva quando aplicável
    const tableHead = `
        <thead class="sticky top-0 bg-gray-100 z-10">
            <tr class="border-b">
                <th class="p-4 text-left w-16">Img</th>
                <th class="p-4 text-left">SKU</th>
                <th class="p-4 text-left">Prateleira</th>
                <th class="p-4 text-left">Qtd. na Prateleira</th>
                <th class="p-4 text-left">Estoque Total (SKU)</th>
                <th class="p-4 text-left">Status</th>
                <th class="p-4 text-left">Ações</th>
            </tr>
        </thead>`;
    let tableBody = '<tbody>';
    if (itensFiltrados.length === 0) {
        tableBody += `<tr><td colspan="7" class="text-center p-8 text-gray-500">Nenhum item encontrado com os filtros aplicados.</td></tr>`;
    } else {
        itensFiltrados.forEach(item => {
            const itemSkuLower = item.sku.toLowerCase();
            const data = skuData[itemSkuLower];
            const isLowStock = data.total <= item.minStock;
            const isOverCapacity = item.qtd > item.capacidade;
            const imageUrl = imageMap[itemSkuLower]; // Procura a URL da imagem no mapa
            let imageCellHtml = '';
            if (imageUrl) {
            // Se encontrou uma imagem, cria um botão que chama o modal
            imageCellHtml = `
                <td class="p-4 text-center">
                    <button onclick="openImageZoomModal('${imageUrl}')" class="text-indigo-500 hover:text-indigo-700 text-xl" title="Clique para ampliar a imagem">
                        <i class="fas fa-camera"></i>
                    </button>
                </td>`;
        } else {
            // Se não encontrou, mostra um ícone genérico
            imageCellHtml = `
                <td class="p-4 text-center">
                    <i class="fas fa-image text-gray-300 text-lg" title="Sem imagem disponível"></i>
                </td>`;
        }
        tableBody += `
            <tr data-id="${item.id}" class="border-b ...">
                ${imageCellHtml}
                <td class="p-4 font-semibold ...">${item.sku}</td>
                <!-- ... resto das colunas ... -->
            </tr>`;
            let statusClass = 'bg-green-100 text-green-800';
            let statusText = 'OK';
            if (isLowStock) { statusClass = 'bg-yellow-100 text-yellow-800 animate-pulse'; statusText = 'Estoque Baixo'; }
            if (isOverCapacity) { statusClass = 'bg-red-100 text-red-800 font-bold'; statusText = 'Excedido!'; }
            // Lógica do botão de reserva
            let actionButtons = '';
            if (canDelete) {
                actionButtons += `<button onclick="deleteItem('${item.id}')" class="text-gray-400 hover:text-red-600 mr-4" title="Excluir"><i class="fas fa-trash"></i></button>`;
            }
            if (canReserve && data.total === 1 && item.qtd === 1) {
                actionButtons += `<button onclick="reserveItem('${item.id}', '${item.sku}')" class="bg-indigo-500 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-indigo-600" title="Reservar item">Reservar</button>`;
            }
            tableBody += `
                <tr data-id="${item.id}" class="border-b border-gray-200 hover:bg-indigo-50 transition-colors duration-200">
                    <td class="p-4 text-center"><i class="fas fa-image text-gray-400 text-lg"></i></td>
                    <td class="p-4 font-semibold text-gray-800">${item.sku}</td>
                    <td class="p-4 text-gray-600 editable" ondblclick="editCell(this, '${item.id}', 'prateleira')">${item.prateleira}</td>
                    <td class="p-4 font-bold text-lg text-indigo-600 editable" ondblclick="editCell(this, '${item.id}', 'qtd')">${item.qtd}</td>
                    <td class="p-4 text-gray-600">${data.total}</td>
                    <td class="p-4"><span class="px-3 py-1 rounded-full text-xs font-semibold ${statusClass}">${statusText}</span></td>
                    <td class="p-4">${actionButtons || '<span class="text-xs text-gray-400">-</span>'}</td>
                </tr>`;
        });
    }
    tableBody += '</tbody>';
    table.innerHTML = tableHead + tableBody;
}
// script.js
async function reserveItem(itemId, sku) {
    if (!hasPermission('estoque', 'movimentar')) {
        showToast('Você não tem permissão para reservar itens.', 'error');
        return;
    }
    const itemIndex = itensEstoque.findIndex(i => i.id == itemId);
    if (itemIndex === -1) {
        showToast('Erro: Item não encontrado para reserva.', 'error');
        return;
    }
   
    const item = itensEstoque[itemIndex];
    if (confirm(`Tem certeza que deseja reservar e bloquear a última unidade do SKU ${sku.toUpperCase()}?`)) {
        // ======================= INÍCIO DA ALTERAÇÃO =======================
        // Registra a saída da unidade que está sendo reservada
        registrarTransacao(item.sku, -1, 'RESERVA', item.prateleira, `Bloqueado por ${currentUser.username}`);
        // ======================== FIM DA ALTERAÇÃO =========================
        item.status = 'Reservado';
        item.qtd = 0;
        item.reservadoPor = currentUser.username;
       
        await saveData();
        logAction(`Item reservado e bloqueado por ${currentUser.username}: SKU ${sku.toUpperCase()}.`);
        showToast(`SKU ${sku.toUpperCase()} reservado e bloqueado para você!`, 'success');
        applyFilters();
    }
}
// script.js
async function unlockItem(itemId, sku) {
    const itemIndex = itensEstoque.findIndex(i => i.id == itemId);
    if (itemIndex === -1) {
        showToast('Erro: Item não encontrado para desbloquear.', 'error');
        return;
    }
   
    const item = itensEstoque[itemIndex];
    if (currentUser.username !== item.reservadoPor && currentUser.role !== 'admin-master') {
        showToast(`Ação negada. Apenas o usuário '${item.reservadoPor}' ou um administrador pode desbloquear este item.`, 'error');
        return;
    }
    if (confirm(`Tem certeza que deseja desbloquear o SKU ${sku.toUpperCase()}? A unidade voltará ao estoque.`)) {
        // ======================= INÍCIO DA ALTERAÇÃO =======================
        // Registra a entrada da unidade que está sendo desbloqueada
        registrarTransacao(item.sku, 1, 'DESBLOQUEIO', item.prateleira, `Liberado por ${currentUser.username}`);
        // ======================== FIM DA ALTERAÇÃO =========================
        item.status = 'Disponível';
        item.qtd = 1;
        delete item.reservadoPor;
       
        await saveData();
        logAction(`Item desbloqueado por ${currentUser.username}: SKU ${sku.toUpperCase()}.`);
        showToast(`SKU ${sku.toUpperCase()} desbloqueado e disponível no estoque.`, 'success');
        applyFilters();
    }
}
function updateAvailableShelves() {
    const sku = document.getElementById('mov-sku-terminal').value.trim().toLowerCase();
    const container = document.getElementById('mov-prateleiras-disponiveis');
    const actionSection = document.getElementById('mov-action-section');
    actionSection.classList.add('hidden');
    document.getElementById('mov-prateleira-selecionada').value = '';
    if (!sku) {
        container.innerHTML = '<p class="text-gray-400 text-center p-2">Aguardando SKU...</p>';
        return;
    }
    const shelves = itensEstoque.filter(item => item.sku.toLowerCase() === sku);
    if (shelves.length === 0) {
        container.innerHTML = '<p class="text-red-500 text-center p-2">Nenhuma prateleira encontrada para este SKU.</p>';
    } else {
        container.innerHTML = shelves.map(item => `
            <button onclick="selectShelfForMovement('${item.prateleira}')" class="w-full text-left p-2 mb-1 rounded-md hover:bg-indigo-100 transition-colors flex justify-between items-center">
                <span>Prateleira: <span class="font-bold">${item.prateleira}</span></span>
                <span class="text-sm text-gray-600">Qtd: <span class="font-semibold">${item.qtd}</span></span>
            </button>
        `).join('');
    }
}
function selectShelfForMovement(prateleira) {
    document.getElementById('mov-prateleira-selecionada').value = prateleira;
    document.getElementById('mov-action-section').classList.remove('hidden');
    document.getElementById('mov-qtd-terminal').focus();
}
// script.js
// script.js
// script.js
/**
 * Executa uma movimentação de estoque (Entrada ou Saída) a partir do Terminal de Movimentação Rápida,
 * garantindo que cada ação seja registrada no relatório de transações.
 * @param {'Entrada' | 'Saída'} type - O tipo de movimento a ser executado.
 */
async function executeMovement(type) {
    if (!hasPermission('estoque', 'movimentar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
   
    const sku = document.getElementById('mov-sku-terminal').value.trim().toUpperCase();
    const prateleira = document.getElementById('mov-prateleira-selecionada').value.trim().toUpperCase();
    const qtd = parseInt(document.getElementById('mov-qtd-terminal').value);
   
    // Captura a classificação e o motivo
    let classificacao = document.getElementById('mov-classificacao-individual').value;
    let motivo = document.getElementById('mov-motivo-individual').value.trim();
    // --- Validações Iniciais ---
    if (!prateleira || isNaN(qtd) || qtd <= 0) {
        showToast('Selecione uma prateleira e insira uma quantidade válida.', 'error');
        return;
    }
    if (classificacao === 'OUTROS' && !motivo) {
        showToast('Para a classificação "Outros", o motivo é obrigatório.', 'error');
        return;
    }
    const itemIndex = itensEstoque.findIndex(i => i.sku.toUpperCase() === sku && i.prateleira.toUpperCase() === prateleira);
    if (itemIndex === -1 && type === 'Saída') {
        showToast('Ocorreu um erro. O item selecionado para saída não foi encontrado.', 'error');
        return;
    }
   
    // --- Lógica de Movimentação ---
    if (type === 'Entrada') {
        // Verifica a capacidade da prateleira antes de prosseguir
        const { ocupacao, capacidade } = getShelfOcupation(prateleira);
        const novaOcupacao = ocupacao + qtd;
        if (novaOcupacao > capacidade) {
            const confirmMessage = `Atenção: A prateleira ${prateleira} já contém ${ocupacao}/${capacidade} unidades. Adicionar ${qtd} unidade(s) excederá o limite. Deseja continuar mesmo assim?`;
            if (!confirm(confirmMessage)) {
                showToast('Operação cancelada pelo usuário.', 'info');
                return; // Cancela a operação
            }
        }
        if (itemIndex === -1) {
            // Se for entrada e o item não existe na prateleira, cria um novo
            const novoItem = {
                id: Date.now() + Math.random(),
                sku,
                prateleira,
                capacidade: 25, // Usa o padrão de 25 para novas prateleiras
                qtd: qtd,
                minStock: ESTOQUE_BAIXO_THRESHOLD,
                status: 'Disponível'
            };
            itensEstoque.push(novoItem);
            // Registra a transação como CADASTRO, pois é a primeira vez do item neste local
            registrarTransacao(sku, qtd, 'CADASTRO', prateleira, motivo || 'Cadastro via Terminal');
        } else {
            // Se o item já existe, apenas soma a quantidade
            const item = itensEstoque[itemIndex];
            item.qtd += qtd;
            // Registra a transação como ENTRADA
            registrarTransacao(item.sku, qtd, classificacao, item.prateleira, motivo);
        }
    } else if (type === 'Saída') {
        const item = itensEstoque[itemIndex];
        if (item.qtd < qtd) {
            showToast(`Estoque insuficiente para retirada. Disponível: ${item.qtd}`, 'error');
            return;
        }
        item.qtd -= qtd;
        // Registra a transação de SAÍDA
        registrarTransacao(item.sku, -qtd, classificacao, item.prateleira, motivo);
       
        if (item.qtd === 0) {
            itensEstoque.splice(itemIndex, 1);
            showToast(`Item ${sku} (Prateleira: ${prateleira}) foi removido por ter estoque zerado.`, 'info');
        }
    }
    // --- Finalização e Atualização da UI ---
    showToast(`Movimentação de ${qtd}x ${sku} registrada como ${classificacao}.`, 'success');
    await saveData(); // Salva o estado atualizado do estoque e das transações
    applyFilters(); // Atualiza a tabela principal para refletir a mudança
   
    // Limpa os campos do formulário para a próxima operação
    document.getElementById('mov-qtd-terminal').value = '';
    document.getElementById('mov-prateleira-selecionada').value = '';
    document.getElementById('mov-motivo-individual').value = '';
    document.getElementById('mov-action-section').classList.add('hidden');
    updateAvailableShelves(); // Atualiza a lista de prateleiras disponíveis para o SKU
}
function openAdvancedRegistrationModal() {
    // VERIFICAÇÃO DE PERMISSÃO 'cadastrar'
    if (!hasPermission('estoque', 'cadastrar')) {
        showToast('Permissão negada para cadastrar itens.', 'error');
        return;
    }
    const modal = document.getElementById('advanced-registration-modal');
    const modalContent = document.getElementById('modal-content');
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
    document.getElementById('advanced-form-container').innerHTML = '';
    addRegistrationRow();
}
function closeAdvancedRegistrationModal() {
    const modal = document.getElementById('advanced-registration-modal');
    const modalContent = document.getElementById('modal-content');
    modalContent.classList.add('scale-95', 'opacity-0');
    modalContent.classList.remove('scale-100', 'opacity-100');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }, 200);
}
function addRegistrationRow() {
    const container = document.getElementById('advanced-form-container');
    const rowId = `row-${Date.now()}`;
    const rowHtml = `
        <div class="grid grid-cols-1 md:grid-cols-6 gap-3 items-center p-2 rounded-lg bg-gray-50" id="${rowId}">
            <input type="text" data-field="sku" placeholder="SKU" class="p-2 border rounded-md">
            <input type="text" data-field="prateleira" placeholder="Prateleira" class="p-2 border rounded-md">
            <!-- *** VALOR PADRÃO ALTERADO AQUI *** -->
            <input type="number" data-field="capacidade" placeholder="Capacidade" class="p-2 border rounded-md" value="25">
            <input type="number" data-field="qtd" placeholder="Qtd. Inicial" class="p-2 border rounded-md">
            <input type="number" data-field="minStock" placeholder="Estoque Mín." class="p-2 border rounded-md" value="${ESTOQUE_BAIXO_THRESHOLD}">
            <button onclick="document.getElementById('${rowId}').remove()" class="text-red-500 hover:text-red-700 p-2 bg-red-100 rounded-md">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', rowHtml);
}
async function processAdvancedRegistration() {
    if (!hasPermission('estoque', 'cadastrar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const rows = document.querySelectorAll('#advanced-form-container > div');
    let itensAdicionados = 0;
    let erros = [];
    let alertasEstoqueBaixo = [];
    rows.forEach((row, index) => {
        const sku = row.querySelector('[data-field="sku"]').value.trim();
        const prateleira = row.querySelector('[data-field="prateleira"]').value.trim();
        const capacidade = parseInt(row.querySelector('[data-field="capacidade"]').value) || 25;
        const qtd = parseInt(row.querySelector('[data-field="qtd"]').value);
        const minStock = parseInt(row.querySelector('[data-field="minStock"]').value) || ESTOQUE_BAIXO_THRESHOLD;
        const { ocupacao, capacidade: capacidadePrateleira } = getShelfOcupation(prateleira);
       
       
       
    // Verifica se a capacidade definida na linha é consistente com a já existente na prateleira
    if (ocupacao > 0 && capacidade !== capacidadePrateleira) {
        erros.push(`Linha ${index + 1} (${sku}): A capacidade (${capacidade}) difere da capacidade já definida para a prateleira ${prateleira} (${capacidadePrateleira}).`);
        return;
    }
    if ((ocupacao + qtd) > capacidadePrateleira) {
        const confirmMessage = `Atenção (Linha ${index + 1}): Adicionar ${qtd}x ${sku} à prateleira ${prateleira} (${ocupacao}/${capacidadePrateleira}) excederá a capacidade. Continuar?`;
        if (!confirm(confirmMessage)) {
            erros.push(`Linha ${index + 1} (${sku}): Operação cancelada devido ao excesso de capacidade.`);
            return;
        }
    }
        if (!sku || !prateleira || isNaN(qtd)) {
            erros.push(`Linha ${index + 1}: SKU, Prateleira e Quantidade são obrigatórios.`);
            return;
        }
        if (qtd > capacidade) {
            erros.push(`Linha ${index + 1} (${sku}): A quantidade (${qtd}) não pode exceder a capacidade (${capacidade}).`);
            return;
        }
        if (qtd <= minStock) {
            alertasEstoqueBaixo.push(`SKU ${sku} na prateleira ${prateleira} foi cadastrado com estoque baixo (${qtd}/${minStock}).`);
        }
        const itemExistente = itensEstoque.find(i => i.sku === sku && i.prateleira === prateleira);
if (itemExistente) {
    // Se já existe, é um AJUSTE ou ENTRADA
    itemExistente.qtd += qtd;
    registrarTransacao(sku, qtd, 'AJUSTE', prateleira, 'Adição de quantidade via Cadastro Avançado');
} else {
    // Se é um item novo, o tipo é CADASTRO
    const id = Date.now() + Math.random();
    itensEstoque.push({ id, sku, prateleira, capacidade, qtd, minStock, status: 'Disponível' });
    // *** LÓGICA APLICADA AQUI ***
    registrarTransacao(sku, qtd, 'CADASTRO', prateleira, 'Cadastro via Formulário Avançado');
}
itensAdicionados++;
    });
    if (erros.length > 0) {
        showToast("Foram encontrados erros no formulário.", 'error');
        alert("Erros encontrados:\n\n" + erros.join("\n"));
    }
    if (alertasEstoqueBaixo.length > 0) {
        alert("Alertas de estoque baixo:\n\n" + alertasEstoqueBaixo.join("\n"));
    }
    if (itensAdicionados > 0) {
        await saveData();
        applyFilters();
        const logMessage = `${itensAdicionados} item(ns) foram cadastrados/atualizados no estoque.`;
        await logAction(logMessage);
        showToast(logMessage, 'success');
        closeAdvancedRegistrationModal();
    }
    const itemExistente = itensEstoque.find(i => i.sku === sku && i.prateleira === prateleira);
if (itemExistente) {
    // ... lógica existente
} else {
    const id = Date.now() + Math.random();
    // ADICIONE A LINHA DE STATUS AQUI
    itensEstoque.push({ id, sku, prateleira, capacidade, qtd, minStock, status: 'Disponível' });
}
}
// Arquivo: 06-estoque.js

// =================================================================================
// SUBSTITUA A FUNÇÃO 'loadItens' INTEIRA PELA VERSÃO CORRIGIDA ABAIXO
// =================================================================================

async function loadItens(filters = {}) {
    const table = document.getElementById('itens-table');
    const inventoryContainer = document.getElementById('inventory-container');
    if (!table || !inventoryContainer) return;

    const canDelete = hasPermission('estoque', 'excluir');
    const canReserve = hasPermission('estoque', 'movimentar');

    // ETAPA 1: BUSCAR O MAPA DE IMAGENS DO BACKEND
    let imageMap = {};
    try {
        const response = await fetch('/api/images/get_all_cached');
        if (response.ok) {
            const rawImageMap = await response.json();
            for (const skuKey in rawImageMap) {
                const encodedPath = encodeURIComponent(rawImageMap[skuKey].replace(/\\/g, '/'));
                // A chave já vem processada do backend, então usamos como está.
                imageMap[skuKey.toLowerCase()] = `/api/images/${encodedPath}`;
            }
        }
    } catch (error) {
        console.error("Falha ao carregar o mapa de imagens do estoque:", error);
    }

    // Lógica de agrupamento e filtragem (sem alterações)
    const skuData = itensEstoque.reduce((acc, item) => {
        const skuKey = item.sku.toLowerCase();
        if (!acc[skuKey]) {
            acc[skuKey] = { total: 0, minStockValues: new Set() };
        }
        acc[skuKey].total += item.qtd;
        acc[skuKey].minStockValues.add(item.minStock);
        return acc;
    }, {});

    const filterSkuInput = (filters.sku || '').toLowerCase().trim();
    const filterStatus = filters.status || '';

    if (!filterSkuInput && !filterStatus) {
        inventoryContainer.classList.add('hidden');
        table.innerHTML = '';
        return;
    } else {
        inventoryContainer.classList.remove('hidden');
    }

    const searchTerms = filterSkuInput.split(/[,;\s]+/).filter(s => s);

    let itensFiltrados = itensEstoque.filter(item => {
        if (item.qtd === 0 && item.status !== 'Reservado') return false;
        const itemSkuLower = item.sku.toLowerCase();
        let skuMatch = searchTerms.length > 0 ? searchTerms.some(term => itemSkuLower.includes(term)) : true;
        if (!skuMatch) return false;
        const data = skuData[itemSkuLower];
        if (!data) return false;
        const isLowStock = data.total <= item.minStock;
        const isOverCapacity = item.qtd > item.capacidade;
        let statusMatch = true;
        if (filterStatus === 'ok') statusMatch = !isLowStock && !isOverCapacity && item.status !== 'Reservado';
        if (filterStatus === 'low') statusMatch = isLowStock;
        if (filterStatus === 'over') statusMatch = isOverCapacity;
        if (filterStatus === 'reserved') statusMatch = item.status === 'Reservado';
        return statusMatch;
    });

    // Cabeçalho da tabela (sem alterações)
    const tableHead = `
        <thead class="sticky top-0 bg-gray-100 z-10">
            <tr class="border-b">
                <th class="p-4 text-left w-16">Img</th>
                <th class="p-4 text-left">SKU</th>
                <th class="p-4 text-left">Prateleira</th>
                <th class="p-4 text-left">Capacidade</th>
                <th class="p-4 text-left">Estoque Mín.</th>
                <th class="p-4 text-left">Quantidade</th>
                <th class="p-4 text-left">Status</th>
                <th class="p-4 text-left">Ações</th>
            </tr>
        </thead>`;

    // Corpo da tabela (com a correção na busca da imagem)
    let tableBody = '<tbody>';
    if (itensFiltrados.length === 0) {
        tableBody += `<tr><td colspan="8" class="text-center p-8 text-gray-500">Nenhum item encontrado.</td></tr>`;
    } else {
        itensFiltrados.forEach(item => {
            // ... (lógica de status, botões, etc., permanece a mesma) ...
            const data = skuData[item.sku.toLowerCase()];
            const hasInconsistentMinStock = data.minStockValues.size > 1;
            let statusClass = 'bg-green-100 text-green-800';
            let statusText = 'OK';
            let rowClass = 'hover:bg-indigo-50';
            if (item.status === 'Reservado') {
                statusClass = 'bg-purple-600 text-white font-bold';
                statusText = `BLOQUEADO (${item.reservadoPor})`;
                rowClass = 'bg-purple-100 font-semibold';
            } else if (data.total <= item.minStock) {
                statusClass = 'bg-yellow-100 text-yellow-800 animate-pulse';
                statusText = 'Estoque Baixo';
            } else if (item.qtd > item.capacidade) {
                statusClass = 'bg-red-100 text-red-800 font-bold';
                statusText = 'Excedido!';
                rowClass = 'bg-red-50';
            }
            const isLocked = item.status === 'Reservado';
            const canUnlock = isLocked && (currentUser.username === item.reservadoPor || currentUser.role === 'admin-master');
            let actionButtons = '';
            if (isLocked) {
                if (canUnlock) actionButtons = `<button onclick="unlockItem('${item.id}', '${item.sku}')" class="bg-green-500 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-green-600" title="Desbloquear item">Desbloquear</button>`;
            } else {
                if (canDelete) actionButtons += `<button onclick="deleteItem('${item.id}')" class="text-gray-400 hover:text-red-600 mr-4" title="Excluir"><i class="fas fa-trash"></i></button>`;
                if (canReserve && data.total === 1) actionButtons += `<button onclick="reserveItem('${item.id}', '${item.sku}')" class="bg-indigo-500 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-indigo-600" title="Reservar última unidade">Reservar</button>`;
            }
            const editableClass = !isLocked ? 'editable' : '';
            const ondblclick = !isLocked ? 'ondblclick' : '';

            // ======================= INÍCIO DA CORREÇÃO =======================
            // Usa a nova função getSkuBaseForCache para encontrar a imagem correta.
            const imageCacheKey = getSkuBaseForCache(item.sku);
            const imageUrl = imageMap[imageCacheKey];
            // ======================== FIM DA CORREÇÃO =========================
            
            let imageCellHtml = `<td class="p-2 text-center align-middle">`;
            if (imageUrl) {
                imageCellHtml += `
                    <button onclick="openImageZoomModal('${imageUrl}')" class="block w-14 h-14 mx-auto">
                        <img src="${imageUrl}" alt="${item.sku}" class="w-full h-full object-cover rounded-md shadow-sm border border-gray-200">
                    </button>
                `;
            } else {
                imageCellHtml += `<i class="fas fa-image text-gray-300 text-3xl" title="Sem imagem disponível"></i>`;
            }
            imageCellHtml += `</td>`;

            tableBody += `
                <tr data-id="${item.id}" class="border-b border-gray-200 transition-colors duration-200 ${rowClass}">
                    ${imageCellHtml}
                    <td class="p-4 font-semibold text-gray-800">${item.sku}</td>
                    <td class="p-4 text-gray-600 ${editableClass}" ${ondblclick}="editCell(this, '${item.id}', 'prateleira')">${item.prateleira}</td>
                    <td class="p-4 text-gray-600 ${editableClass}" ${ondblclick}="editCell(this, '${item.id}', 'capacidade')">${item.capacidade}</td>
                    <td class="p-4 text-gray-600 ${editableClass}" ${ondblclick}="editCell(this, '${item.id}', 'minStock')">
                        ${item.minStock}
                        ${hasInconsistentMinStock ? '<i class="fas fa-exclamation-triangle text-orange-500 ml-2" title="Alerta: Estoque Mín. inconsistente!"></i>' : ''}
                    </td>
                    <td class="p-4 font-bold text-lg ${isLocked ? 'text-purple-600' : 'text-indigo-600'} ${editableClass}" ${ondblclick}="editCell(this, '${item.id}', 'qtd')">${item.qtd}</td>
                    <td class="p-4"><span class="px-3 py-1 rounded-full text-xs font-semibold ${statusClass}">${statusText}</span></td>
                    <td class="p-4">${actionButtons || '<span class="text-xs text-gray-400">-</span>'}</td>
                </tr>`;
        });
    }
    tableBody += '</tbody>';
    table.innerHTML = tableHead + tableBody;
}


   
// script.js
// --- 20-funções-do-modal-de-zoom-de-imagem.js ---
// =================================================================================
// FUNÇÕES DO MODAL DE ZOOM DE IMAGEM
// =================================================================================
function openImageZoomModal(imageUrl) {
    const modal = document.getElementById('image-zoom-modal');
    const zoomedImage = document.getElementById('zoomed-image');
    if (!imageUrl) {
        // Se, por algum motivo, a URL for inválida, mostra uma imagem padrão.
        zoomedImage.src = 'https://via.placeholder.com/600x400.png?text=Imagem+Não+Disponível';
    } else {
        zoomedImage.src = imageUrl;
    }
   
    modal.classList.remove('hidden' );
    document.body.classList.add('overflow-hidden'); // Impede o scroll da página ao fundo
}
function closeImageZoomModal() {
    const modal = document.getElementById('image-zoom-modal');
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}
// script.js
async function editCell(cell, id, field) {
    if (!hasPermission('estoque', 'editar')) return;
    if (document.querySelector('.edit-input-wrapper')) {
        showToast("Termine a edição atual antes de iniciar outra.", 'info');
        return;
    }
    const originalValue = cell.innerText;
    const item = itensEstoque.find(i => i.id == id);
    if (!item) return; // Segurança: não faz nada se o item não for encontrado
    const inputType = (field !== 'prateleira') ? 'number' : 'text';
    cell.innerHTML = `
        <div class="edit-input-wrapper flex items-center gap-2 p-1 bg-yellow-100 rounded-md">
            <input type="${inputType}" value="${originalValue}" class="w-full p-1 border-2 border-indigo-400 rounded focus:outline-none">
            <button class="save-btn text-green-600 hover:text-green-800"><i class="fas fa-check"></i></button>
            <button class="cancel-btn text-red-600 hover:text-red-800"><i class="fas fa-times"></i></button>
        </div>
    `;
    const wrapper = cell.querySelector('.edit-input-wrapper');
    const input = wrapper.querySelector('input');
    input.focus();
    input.select();
    const cleanup = () => {
        applyFilters();
    };
    const saveChanges = async () => {
        const originalValue = cell.innerText;
        const input = wrapper.querySelector('input');
        const newValue = input.value.trim();
        let processedValue = (inputType === 'number') ? parseInt(newValue) : newValue;
        if (newValue === '' || (inputType === 'number' && isNaN(processedValue))) {
            showToast("Valor inválido.", 'error');
            return;
        }
        if (field === 'qtd' && processedValue > item.capacidade) {
            if (!confirm(`A quantidade (${processedValue}) excede a capacidade (${item.capacidade}). Continuar?`)) return;
        }
        if (field === 'capacidade' && processedValue < item.qtd) {
            showToast(`A capacidade (${processedValue}) não pode ser menor que a quantidade em estoque (${item.qtd}).`, 'error');
            return;
        }
        const valorAntigo = item[field];
        const diferenca = processedValue - parseInt(originalValue);
       if (processedValue != valorAntigo) {
   
    // Atualiza o dado mestre primeiro para garantir consistência
    item[field] = processedValue;
    if (field === 'qtd') {
        const diferenca = processedValue - parseInt(originalValue);
        registrarTransacao(item.sku, diferenca, 'AJUSTE', item.prateleira, `Edição manual de ${valorAntigo} para ${processedValue}`);
    } else {
        // *** A CORREÇÃO ESTÁ AQUI ***
        // Determina qual prateleira registrar na transação.
        // Se o campo editado foi 'prateleira', usamos o novo valor.
        // Se foi outro campo (como capacidade), usamos a prateleira existente do item.
        const prateleiraParaRegistro = (field === 'prateleira') ? processedValue : item.prateleira;
       
        const motivoEdicao = `${field.charAt(0).toUpperCase() + field.slice(1)} alterada de '${valorAntigo}' para '${processedValue}'`;
       
        // Registra a transação com a prateleira correta.
        registrarTransacao(item.sku, 0, 'EDIÇÃO', prateleiraParaRegistro, motivoEdicao);
    }
    // Salva os dados atualizados
    await saveData();
    logAction(`Item ${item.sku} editado: ${motivoEdicao}`);
    showToast('Item atualizado!', 'success');
}
       
        cleanup(); // Atualiza a visualização da tabela
    };
    const handleKeydown = (e) => {
        if (e.key === 'Enter') saveChanges();
        if (e.key === 'Escape') cancelChanges();
    };
    wrapper.querySelector('.save-btn').addEventListener('click', saveChanges);
    wrapper.querySelector('.cancel-btn').addEventListener('click', cancelChanges);
    wrapper.addEventListener('keydown', handleKeydown);
}
// script.js
async function deleteItem(id) {
    if (!hasPermission('estoque', 'excluir')) return;
    const itemIndex = itensEstoque.findIndex(i => i.id == id);
    if (itemIndex === -1) return;
   
    const item = itensEstoque[itemIndex];
   
    if (confirm(`Tem certeza que deseja excluir o item ${item.sku} da prateleira ${item.prateleira}?`)) {
        // ======================= INÍCIO DA ALTERAÇÃO =======================
        // Registra a saída de TODAS as unidades do item antes de excluí-lo
        if (item.qtd > 0) {
            registrarTransacao(item.sku, -item.qtd, 'EXCLUSÃO', item.prateleira, 'Item removido manualmente');
        }
        // ======================== FIM DA ALTERAÇÃO =========================
        itensEstoque.splice(itemIndex, 1);
        await saveData();
        applyFilters();
logAction({
    acao: 'Item de estoque excluído',
    modulo: 'Estoque',
    funcao: 'deleteItem',
    detalhes: { sku: item.sku, prateleira: item.prateleira, qtd_removida: item.qtd }
});
        showToast('Item excluído.', 'success');
    }
}
// --- 21-novas-funções-para-movimentação-em-massa.js ---
// =================================================================================
// NOVAS FUNÇÕES PARA MOVIMENTAÇÃO EM MASSA
// =================================================================================
function switchMovementMode(mode) {
    const terminalIndividual = document.getElementById('terminal-individual');
    const terminalMassa = document.getElementById('terminal-massa');
    const btnIndividual = document.getElementById('mode-individual');
    const btnMassa = document.getElementById('mode-massa');
    const description = document.getElementById('terminal-description');
    if (mode === 'individual') {
        terminalIndividual.classList.remove('hidden');
        terminalMassa.classList.add('hidden');
        btnIndividual.classList.add('bg-white', 'shadow', 'font-semibold');
        btnIndividual.classList.remove('text-gray-600');
        btnMassa.classList.remove('bg-white', 'shadow', 'font-semibold');
        btnMassa.classList.add('text-gray-600');
        description.innerText = "Digite o SKU para ver as prateleiras disponíveis e realizar a movimentação.";
    } else { // modo 'massa'
        terminalIndividual.classList.add('hidden');
        terminalMassa.classList.remove('hidden');
        btnMassa.classList.add('bg-white', 'shadow', 'font-semibold');
        btnMassa.classList.remove('text-gray-600');
        btnIndividual.classList.remove('bg-white', 'shadow', 'font-semibold');
        btnIndividual.classList.add('text-gray-600');
        description.innerText = "Cole uma lista de SKUs para dar baixa em lote de uma prateleira específica.";
    }
}
async function executeBulkMovement() {
    if (!hasPermission('estoque', 'movimentar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const skusText = document.getElementById('mov-skus-massa').value.trim();
    const prateleira = document.getElementById('mov-prateleira-massa').value.trim();
    if (!skusText || !prateleira) {
        showToast('Preencha a lista de SKUs e a prateleira de origem.', 'error');
        return;
    }
    // Converte o texto em uma lista de SKUs, removendo linhas vazias e espaços.
    const skusParaRetirar = skusText.split('\n').map(s => s.trim()).filter(s => s !== '');
   
    let sucessos = 0;
    let falhas = [];
    skusParaRetirar.forEach(sku => {
        // Para cada SKU, a quantidade a ser retirada é 1.
        const qtd = 1;
        const itemIndex = itensEstoque.findIndex(i => i.sku.toLowerCase() === sku.toLowerCase() && i.prateleira.toLowerCase() === prateleira.toLowerCase());
        if (itemIndex === -1) {
            falhas.push(`SKU ${sku} não encontrado na prateleira ${prateleira}.`);
        } else {
            const item = itensEstoque[itemIndex];
            if (item.qtd < qtd) {
                falhas.push(`Estoque insuficiente para SKU ${sku} na prateleira ${prateleira}.`);
            } else {
                item.qtd -= qtd;
                sucessos++;
                logAction(`Retirada em massa: 1 un. do SKU ${sku} da prateleira ${prateleira}.`);
               
                // Remove o item se o estoque zerar
                if (item.qtd === 0) {
                    itensEstoque.splice(itemIndex, 1);
                }
            }
        }
    });
    await saveData();
    applyFilters(); // Atualiza a tabela principal
    // Feedback para o usuário
    if (sucessos > 0) {
        showToast(`${sucessos} item(ns) retirado(s) com sucesso!`, 'success');
    }
    if (falhas.length > 0) {
        showToast(`${falhas.length} item(ns) não puderam ser retirados.`, 'error');
        // Exibe um alerta com os detalhes dos erros
        setTimeout(() => alert("Ocorreram os seguintes erros:\n\n- " + falhas.join("\n- ")), 100);
    }
    // Limpa os campos após a operação
    document.getElementById('mov-skus-massa').value = '';
    document.getElementById('mov-prateleira-massa').value = '';
}
// --- 22-nova-função-para-movimentação-em-massa-avançada.js ---
// =================================================================================
// NOVA FUNÇÃO PARA MOVIMENTAÇÃO EM MASSA AVANÇADA
// =================================================================================
// script.js
/**
 * Executa movimentações de ENTRADA ou SAÍDA em massa com base nos dados do terminal.
 */
async function executeBulkMovementAdvanced() {
    if (!hasPermission('estoque', 'movimentar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    // CAPTURA TODOS OS DADOS DO FORMULÁRIO
    const dadosEmMassa = document.getElementById('mov-dados-massa').value.trim();
    const tipoOperacao = document.getElementById('mov-tipo-operacao-massa').value; // 'ENTRADA' ou 'SAIDA'
    const classificacao = document.getElementById('mov-classificacao-massa').value;
    const motivo = document.getElementById('mov-motivo-massa').value.trim();
    // VALIDAÇÕES INICIAIS
    if (!dadosEmMassa) {
        showToast('A área de dados está vazia. Cole os itens para movimentar.', 'error');
        return;
    }
    if (classificacao === 'OUTROS' && !motivo) {
        showToast('Para a classificação "Outros", o motivo é obrigatório.', 'error');
        return;
    }
    const linhas = dadosEmMassa.split('\n').filter(linha => linha.trim() !== '');
    let falhas = [];
    let validacaoOk = true;
    // =======================================================================
    // PASSAGEM DE VALIDAÇÃO (AGORA CONSIDERA ENTRADA E SAÍDA)
    // =======================================================================
    for (const [index, linha] of linhas.entries()) {
        const partes = linha.split(',').map(p => p.trim());
        if (partes.length !== 3) {
            falhas.push(`Linha ${index + 1}: Formato inválido. Use SKU,PRATELEIRA,QUANTIDADE.`);
            validacaoOk = false;
            continue;
        }
        const [sku, prateleira, qtdStr] = partes;
        const qtd = parseInt(qtdStr);
        if (!sku || !prateleira || isNaN(qtd) || qtd <= 0) {
            falhas.push(`Linha ${index + 1} (${sku}): Dados inválidos ou quantidade zerada.`);
            validacaoOk = false;
            continue;
        }
        // Para SAÍDAS, o item DEVE existir e ter estoque suficiente.
        if (tipoOperacao === 'SAIDA') {
            const item = itensEstoque.find(i => i.sku.toLowerCase() === sku.toLowerCase() && i.prateleira.toLowerCase() === prateleira.toLowerCase());
            if (!item) {
                falhas.push(`Linha ${index + 1}: SKU ${sku} não encontrado na prateleira ${prateleira} para dar baixa.`);
                validacaoOk = false;
            } else if (item.qtd < qtd) {
                falhas.push(`Linha ${index + 1}: Estoque insuficiente para SKU ${sku} (Disponível: ${item.qtd}, Solicitado: ${qtd}).`);
                validacaoOk = false;
            }
        }
        // Para ENTRADAS, não há validação de estoque prévio necessária. O item pode ou não existir.
    }
    if (!validacaoOk) {
        showToast('Foram encontrados erros na sua lista. Nenhuma movimentação foi realizada.', 'error');
        alert("Corrija os seguintes erros antes de continuar:\n\n- " + falhas.join("\n- "));
        return;
    }
    // =======================================================================
    // PASSAGEM DE EXECUÇÃO (SE A VALIDAÇÃO PASSOU)
    // =======================================================================
    let sucessos = 0;
    linhas.forEach(linha => {
        const [sku, prateleira, qtdStr] = linha.split(',').map(p => p.trim());
        const qtd = parseInt(qtdStr);
        const itemIndex = itensEstoque.findIndex(i => i.sku.toLowerCase() === sku.toLowerCase() && i.prateleira.toLowerCase() === prateleira.toLowerCase());
        if (tipoOperacao === 'SAIDA') {
            if (itemIndex !== -1) {
                itensEstoque[itemIndex].qtd -= qtd;
                registrarTransacao(sku, -qtd, classificacao, prateleira, motivo);
                if (itensEstoque[itemIndex].qtd === 0) {
                    itensEstoque.splice(itemIndex, 1);
                }
                sucessos++;
            }
        } else { // tipoOperacao === 'ENTRADA'
    if (itemIndex !== -1) {
        // ... (soma a quantidade)
    } else {
        // Item não existe, cria um novo com o padrão de capacidade
        itensEstoque.push({
            id: Date.now() + Math.random(),
            sku: sku.toUpperCase(),
            prateleira: prateleira.toUpperCase(),
            // *** VALOR PADRÃO ALTERADO AQUI ***
            capacidade: 25,
            qtd: qtd,
            minStock: 10,
            status: 'Disponível'
        });
    }
            registrarTransacao(sku, qtd, classificacao, prateleira, motivo);
            sucessos++;
        }
    });
    localStorage.setItem('saas_transacoesEstoque', JSON.stringify(transacoesEstoque));
    await saveData();
    applyFilters();
    const operacaoTexto = tipoOperacao === 'ENTRADA' ? 'entradas' : 'baixas';
    showToast(`${sucessos} movimentações de ${operacaoTexto} (${classificacao}) realizadas com sucesso!`, 'success');
    document.getElementById('mov-dados-massa').value = '';
    document.getElementById('mov-motivo-massa').value = '';
}
async function generateStockReport() {
    // VERIFICAÇÃO DE PERMISSÃO 'gerarRelatorio'
    if (!hasPermission('estoque', 'gerarRelatorio')) {
        showToast('Permissão negada para gerar relatórios de estoque.', 'error');
        return;
    }
    if (itensEstoque.length === 0) {
        showToast("Não há itens para gerar um relatório.", 'info');
        return;
    }
    // ... (resto da função permanece igual)
    let csvContent = "data:text/csv;charset=utf-8,";
    const headers = ["SKU", "Prateleira", "Quantidade", "Capacidade", "Estoque Minimo", "Status"];
    csvContent += headers.join(",") + "\r\n";
    itensEstoque.forEach(item => {
        let status = "OK";
        if (item.qtd <= item.minStock) status = "Estoque Baixo";
        if (item.qtd > item.capacidade) status = "Capacidade Excedida";
        const row = [item.sku, item.prateleira, item.qtd, item.capacidade, item.minStock, status];
        csvContent += row.join(",") + "\r\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const timestamp = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `relatorio_estoque_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
   
    const logMessage = "Relatório de estoque gerado e baixado.";
    await logAction(logMessage);
    showToast(logMessage, 'success');
}
// script.js
/**
 * Calcula a ocupação atual e a capacidade de uma prateleira.
 * @param {string} prateleira - O nome da prateleira a ser verificada.
 * @returns {{ocupacao: number, capacidade: number}}
 */
function getShelfOcupation(prateleira) {
    const itensNaPrateleira = itensEstoque.filter(i => i.prateleira.toUpperCase() === prateleira.toUpperCase());
   
    if (itensNaPrateleira.length === 0) {
        return { ocupacao: 0, capacidade: Infinity }; // Prateleira vazia, capacidade "infinita" até ser definida
    }
    const ocupacao = itensNaPrateleira.reduce((total, item) => total + item.qtd, 0);
    // Assume que a capacidade é a mesma para todos os itens na mesma prateleira. Pega a do primeiro.
    const capacidade = itensNaPrateleira[0].capacidade;
    return { ocupacao, capacidade };
}
/**
 * Mostra a aba do marketplace selecionado e oculta as outras.
 * @param {'ml' | 'shopee'} marketplace - O identificador do marketplace a ser exibido.
 */
function showTab(marketplace) {
    // Oculta todos os conteúdos das abas
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    // Remove a classe de 'ativo' de todos os botões de aba
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('border-indigo-600', 'text-indigo-600');
        btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
    });
    // Mostra o conteúdo da aba selecionada
    const contentToShow = document.getElementById(`pedidos-${marketplace}-section`);
    if (contentToShow) {
        contentToShow.classList.remove('hidden');
    }
    // Adiciona a classe de 'ativo' ao botão da aba selecionada
    const btnToActivate = document.getElementById(`tab-${marketplace}`);
    if (btnToActivate) {
        btnToActivate.classList.add('border-indigo-600', 'text-indigo-600');
        btnToActivate.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
    }
}
//=================================================================================
// FUNÇÃO limparSku
//=================================================================================
/**
 * Limpa um SKU de acordo com regras específicas:
 * - Mantém sufixos especiais de produto (ex: -VF, -100, -999).
 * - Remove sufixos de variação de letra (ex: -C, -P, -F, -V).
 * - Remove sufixos numéricos não especiais (ex: -150, -200).
 * @param {string} skuOriginal - O SKU a ser limpo.
 * @returns {string} O SKU limpo.
 */
function limparSku(skuOriginal) {
    if (!skuOriginal) {
        return "";
    }
    const sku = skuOriginal.trim().toUpperCase();
    // Lista de sufixos especiais que DEVEM ser mantidos.
    const sufixosEspeciais = ['-999', '-100', '-VF', '-130', '-350', '-175'];
    // 1. Verifica se o SKU termina com algum dos sufixos especiais.
    const temSufixoEspecial = sufixosEspeciais.some(sufixo => sku.endsWith(sufixo));
    if (temSufixoEspecial) {
        // Se for um SKU especial, retorna como está.
        // Ex: "PVGL001-VF" -> retorna "PVGL001-VF"
        return sku;
    }
    // 2. Se não for especial, remove os sufixos de variação de letra (-C, -P, -F, -V).
    let skuLimpo = sku.replace(/-(C|P|F|V)$/, '');
    // 3. *** NOVA REGRA ADICIONADA AQUI ***
    // Em seguida, remove qualquer outro sufixo numérico (como -150).
    // A regex /-\d+$/ procura por um hífen seguido de um ou mais números no final da string.
    skuLimpo = skuLimpo.replace(/-\d+$/, '');
    // Ex: "PCRV029-150" -> vira "PCRV029"
    // Ex: "PCRV029-F" -> vira "PCRV029"
    return skuLimpo;
}
//=================================================================================
// SUBSTITUA ESTA FUNÇÃO NO SEU SCRIPT.JS
//=================================================================================
function parseShopeeTexto(text) {
    const pedidosValidos = [];
    const pedidosCancelados = [];
    const erros = [];
    const blocos = text.split(/(?=^(BR\d{13}[A-Z]|[a-z0-9]{4,}))/m).filter(b => b.trim() && b.includes('ID do Pedido'));
    blocos.forEach((bloco, index) => {
        const idMatch = bloco.match(/ID do Pedido\s*([A-Z0-9]+)/);
        const idPedido = idMatch ? `#${idMatch[1]}` : `SHOPEE-ERR-${Date.now() + index}`;
        const isCanceled = bloco.toLowerCase().includes('pedido cancelado');
        let dataColeta = new Date().toLocaleDateString('pt-BR');
        const dataMatch = bloco.match(/Coleta do pacote a partir de (\d{2}\/\d{2}\/\d{4})/);
        if (dataMatch) {
            dataColeta = dataMatch[1];
        }
        const tipoEntrega = bloco.includes('Coleta do pacote a partir de') ? 'Coleta' : 'Postagem / Coleta';
        const regexItem = /^(.*?)\n(?:Variação:.*?\n)?.*?(\[.*?\])\n(x\d+)/gms;
        let match;
        const itensEncontrados = [];
        while ((match = regexItem.exec(bloco)) !== null) {
            const skuBruto = match[2];
            const quantidadeBruta = match[3];
            const partesSku = skuBruto.match(/\[(.*?)\]/)[1].trim().split(/\s+/).filter(s => s);
            const skuOriginal = partesSku.length > 1 ? partesSku[1] : partesSku[0];
           
            // *** LÓGICA CENTRALIZADA APLICADA AQUI ***
            const skuFinal = limparSku(skuOriginal);
            const quantidadeFinal = parseInt(quantidadeBruta.replace('x', ''), 10) || 1;
            if (skuFinal) {
                itensEncontrados.push({ sku: skuFinal, quantidade: quantidadeFinal });
            }
        }
       
        if (itensEncontrados.length === 0) {
            const skuMatch = bloco.match(/\[(.*?)\]/);
            const qtdMatch = bloco.match(/^(x\d+)/m);
            if (skuMatch) {
                const partesSku = skuMatch[1].trim().split(/\s+/).filter(s => s);
                const skuOriginal = partesSku.length > 1 ? partesSku[1] : partesSku[0];
               
                // *** LÓGICA CENTRALIZADA APLICADA AQUI ***
                const skuFinal = limparSku(skuOriginal);
                const quantidadeFinal = qtdMatch ? parseInt(qtdMatch[1].replace('x', ''), 10) : 1;
                if (skuFinal) {
                    itensEncontrados.push({ sku: skuFinal, quantidade: quantidadeFinal });
                }
            }
        }
        if (itensEncontrados.length === 0 && !isCanceled) {
            erros.push({ id: idPedido, motivo: 'Não foi possível extrair nenhum item com SKU deste bloco.' });
            return;
        }
        itensEncontrados.forEach(item => {
            const pedidoData = {
                id: idPedido,
                marketplace: 'Shopee',
                dataColeta,
                tipoEntrega,
                sku: item.sku,
                quantidade: item.quantidade,
                status: isCanceled ? 'Cancelado' : 'Pendente',
                dataImportacao: new Date().toISOString()
            };
            if (isCanceled) {
                pedidosCancelados.push(pedidoData);
            } else {
                pedidosValidos.push(pedidoData);
            }
        });
    });
    return { pedidosValidos, pedidosCancelados, pedidosComErro: erros };
}
// --- 32-funções-para-limpeza-de-estoque.js ---
// =================================================================================
// FUNÇÕES PARA LIMPEZA DE ESTOQUE
// =================================================================================
// Variável global para guardar o modo de limpeza
let clearStockMode = { type: 'total', prefix: '' };
/**
 * Abre o modal de confirmação para limpeza de estoque.
 * @param {'total' | 'prefixo'} type - O tipo de limpeza a ser realizada.
 */
function openClearStockModal(type = 'total') {
    if (!hasPermission('estoque', 'excluir')) {
        showToast('Permissão negada para limpar o estoque.', 'error');
        return;
    }
    const modal = document.getElementById('clear-stock-modal');
    const modalContent = document.getElementById('clear-stock-modal-content');
    const messageEl = document.getElementById('clear-stock-message');
    const keywordEl = document.getElementById('clear-stock-keyword');
    const confirmInput = document.getElementById('clear-stock-confirmation');
    const confirmBtn = document.getElementById('confirm-clear-stock-btn');
    confirmInput.value = ''; // Limpa o campo
    confirmBtn.disabled = true; // Desabilita o botão por padrão
    if (type === 'PREFIXO') {
        const prefix = prompt("Digite o prefixo dos SKUs que deseja limpar (ex: CL, FF, KC, KD, PC, PH, PH, PR, PV, RV, TP, VC):");
        if (!prefix) return; // Usuário cancelou
        clearStockMode = { type: 'prefixo', prefix: prefix.toUpperCase() };
        messageEl.innerHTML = `Você está prestes a <strong>excluir PERMANENTEMENTE</strong> todos os itens de estoque cujo SKU começa com <strong>"${clearStockMode.prefix}"</strong>. Esta ação não pode ser desfeita.`;
        keywordEl.innerText = clearStockMode.prefix;
    } else { // Limpeza total
        clearStockMode = { type: 'total', prefix: '' };
        messageEl.innerHTML = `Você está prestes a <strong>excluir PERMANENTEMENTE</strong> todo o seu estoque. Esta ação não pode ser desfeita.`;
        keywordEl.innerText = 'LIMPAR';
    }
    // Adiciona um "escutador" para habilitar o botão quando a palavra-chave correta for digitada
    confirmInput.oninput = () => {
        confirmBtn.disabled = confirmInput.value !== keywordEl.innerText;
    };
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
}
/**
 * Fecha o modal de limpeza de estoque.
 */
function closeClearStockModal() {
    const modal = document.getElementById('clear-stock-modal');
    const modalContent = document.getElementById('clear-stock-modal-content');
    modalContent.classList.add('scale-95', 'opacity-0');
    modalContent.classList.remove('scale-100', 'opacity-100');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }, 200);
}
/**
 * Executa a limpeza do estoque após a confirmação no modal.
 */
async function confirmClearStock() {
    let originalCount = itensEstoque.length;
    let itemsRemovedCount = 0;
    let logMessage = '';
    if (clearStockMode.type === 'prefixo') {
        // Filtra o estoque, mantendo apenas os itens que NÃO começam com o prefixo
        itensEstoque = itensEstoque.filter(item => !item.sku.toUpperCase().startsWith(clearStockMode.prefix));
        itemsRemovedCount = originalCount - itensEstoque.length;
        logMessage = `${itemsRemovedCount} item(ns) com prefixo "${clearStockMode.prefix}" foram removidos do estoque.`;
    } else { // Limpeza total
        itemsRemovedCount = itensEstoque.length;
        itensEstoque = []; // Esvazia o array
        logMessage = `Estoque total foi limpo. ${itemsRemovedCount} item(ns) removidos.`;
    }
    await saveData();
    applyFilters(); // Atualiza a visualização da tabela de estoque
    loadAdminDashboard(); // Atualiza as métricas do dashboard
    await logAction(logMessage);
    showToast(logMessage, 'success');
    closeClearStockModal();
}
// script.js
// --- 33-funções-do-submódulo-de-relatório-de-transações-modal.js ---
// =================================================================================
// FUNÇÕES DO SUBMÓDULO DE RELATÓRIO DE TRANSAÇÕES (MODAL)
// =================================================================================
/**
 * Abre o modal do relatório de transações.
 */
function openTransactionsModal() {
    const modal = document.getElementById('transactions-modal');
    const modalContent = document.getElementById('transactions-modal-content');
   
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
   
    transacoesPaginaAtual = 1; // Sempre reseta para a página 1 ao abrir o modal
    loadTransactionsModal(); // Carrega os dados e renderiza a primeira página
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
}
/**
 * Fecha o modal do relatório de transações.
 */
function closeTransactionsModal() {
    const modal = document.getElementById('transactions-modal');
    const modalContent = document.getElementById('transactions-modal-content');
   
    modalContent.classList.add('scale-95', 'opacity-0');
    modalContent.classList.remove('scale-100', 'opacity-100');
   
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }, 200);
}
// script.js
/**
 * Carrega e filtra os dados dentro do modal de transações.
 * Esta função agora acessa a variável global 'transacoesEstoque' diretamente.
 */
// ======================= INÍCIO DA CORREÇÃO =======================
function loadTransactionsModal() {
    if (!hasPermission('estoque', 'visualizar')) return;
   
    const transacoes = transacoesEstoque;
    if (!Array.isArray(transacoes)) {
        console.error("Erro crítico: 'transacoesEstoque' não é um array ou não está definido.");
        const tableBody = document.getElementById('modal-transacoes-table')?.querySelector('tbody');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-red-500">Erro ao carregar os dados das transações.</td></tr>`;
        }
        return;
    }
    // Pega os valores dos filtros do modal
    const filterSku = document.getElementById('trans-modal-filter-sku').value.toLowerCase();
    const filterDataInicio = document.getElementById('trans-modal-filter-data-inicio').value;
    const filterDataFim = document.getElementById('trans-modal-filter-data-fim').value;
    const filterTipo = document.getElementById('trans-modal-filter-tipo').value;
    // Filtra o array completo e armazena em uma variável global
    transacoesFiltradasGlobal = transacoes.filter(t => {
        const dataTransacao = new Date(t.timestamp);
        const dataInicio = filterDataInicio ? new Date(filterDataInicio) : null;
        const dataFim = filterDataFim ? new Date(filterDataFim) : null;
        if (dataInicio) dataInicio.setHours(0, 0, 0, 0);
        if (dataFim) dataFim.setHours(23, 59, 59, 999);
        const skuMatch = !filterSku || t.sku.toLowerCase().includes(filterSku);
        const tipoMatch = !filterTipo || t.tipo === filterTipo;
        const dataMatch = (!dataInicio || dataTransacao >= dataInicio) && (!dataFim || dataTransacao <= dataFim);
        return skuMatch && tipoMatch && dataMatch;
    });
    // Reseta para a página 1 sempre que um novo filtro é aplicado
    transacoesPaginaAtual = 1;
    // Renderiza a primeira página dos resultados filtrados
    renderTransactionsPage();
   
    // Atualiza os cards de insights com base em TODOS os resultados filtrados
    updateTransactionInsightsModal(transacoesFiltradasGlobal);
}
// COLE ESTA FUNÇÃO CORRIGIDA NO LUGAR DA ANTIGA `updateTransactionInsightsModal`
/**
 * Atualiza os cards de insights (Top 5) dentro do modal, priorizando o NÚMERO DE TRANSAÇÕES.
 * @param {Array} transacoes - A lista de transações já filtrada.
 */
function updateTransactionInsightsModal(transacoes) {
    const topEntradasEl = document.getElementById('modal-top-entradas');
    const topSaidasEl = document.getElementById('modal-top-saidas');

    // Verificação de segurança para garantir que os elementos existem.
    if (!topEntradasEl || !topSaidasEl) {
        console.error("Elementos dos insights (modal-top-entradas ou modal-top-saidas) não encontrados no DOM.");
        return;
    }

    const entradas = {};
    const saidas = {};

    // Passo 1: Agrega os dados, contando unidades e número de transações para cada SKU.
    transacoes.forEach(t => {
        // Ignora transações de edição ou que não alteram a quantidade.
        if (t.quantidade === 0) return;

        if (t.quantidade > 0) { // Entradas
            if (!entradas[t.sku]) entradas[t.sku] = { qtd: 0, count: 0 };
            entradas[t.sku].qtd += t.quantidade;
            entradas[t.sku].count++;
        } else { // Saídas
            if (!saidas[t.sku]) saidas[t.sku] = { qtd: 0, count: 0 };
            saidas[t.sku].qtd += Math.abs(t.quantidade);
            saidas[t.sku].count++;
        }
    });

    // =================================================================
    // =========        A CORREÇÃO PRINCIPAL ESTÁ AQUI         =========
    // =================================================================
    // Passo 2: Ordena os dados pelo NÚMERO DE TRANSAÇÕES (count) e pega os Top 5.
    const sortedEntradas = Object.entries(entradas).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    const sortedSaidas = Object.entries(saidas).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    // =================================================================
    
    // Passo 3: Atualiza os títulos dos cards para refletir a nova lógica.
    topEntradasEl.previousElementSibling.textContent = 'Top 5 - Entradas (por Transações)';
    topSaidasEl.previousElementSibling.textContent = 'Top 5 - Saídas (por Transações)';

    // Passo 4: Atualiza as listas de texto, destacando o número de transações.
    topEntradasEl.innerHTML = sortedEntradas.map(([sku, data]) => `
        <li class="text-xs p-1 rounded-md hover:bg-green-50">
            <div class="flex justify-between font-semibold">
                <span class="text-green-800">${sku}</span>
                <span class="font-bold text-green-600">${data.count} transaç${data.count > 1 ? 'ões' : 'ão'}</span>
            </div>
            <div class="text-right text-gray-500">${data.qtd} un. total</div>
        </li>
    `).join('') || '<p class="text-sm text-gray-400">Nenhuma entrada no período.</p>';

    topSaidasEl.innerHTML = sortedSaidas.map(([sku, data]) => `
        <li class="text-xs p-1 rounded-md hover:bg-red-50">
            <div class="flex justify-between font-semibold">
                <span class="text-red-800">${sku}</span>
                <span class="font-bold text-red-600">${data.count} transaç${data.count > 1 ? 'ões' : 'ão'}</span>
            </div>
            <div class="text-right text-gray-500">${data.qtd} un. total</div>
        </li>
    `).join('') || '<p class="text-sm text-gray-400">Nenhuma saída no período.</p>';
}

// script.js
/**
 * Mostra ou esconde um campo de motivo com base na seleção.
 * @param {string} selectedValue - O valor do <select>.
 * @param {string} containerId - O ID do contêiner do campo de motivo.
 */
function toggleMotivoField(selectedValue, containerId) {
    const container = document.getElementById(containerId);
    if (selectedValue === 'OUTROS') {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
}
/**
 * Renderiza apenas a página atual das transações na tabela.
 */
function renderTransactionsPage() {
    const tableBody = document.getElementById('modal-transacoes-table')?.querySelector('tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    const totalTransacoes = transacoesFiltradasGlobal.length;
    const totalPaginas = Math.ceil(totalTransacoes / TRANSACOES_POR_PAGINA) || 1;
    // Garante que a página atual seja válida
    if (transacoesPaginaAtual > totalPaginas) transacoesPaginaAtual = totalPaginas;
    if (transacoesPaginaAtual < 1) transacoesPaginaAtual = 1;
    // Calcula o início e o fim da "fatia" de dados para a página atual
    const inicio = (transacoesPaginaAtual - 1) * TRANSACOES_POR_PAGINA;
    const fim = inicio + TRANSACOES_POR_PAGINA;
    const transacoesDaPagina = transacoesFiltradasGlobal.slice(inicio, fim);
    if (transacoesDaPagina.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-gray-500">Nenhuma transação encontrada.</td></tr>`;
    } else {
        let rowsHtml = '';
        transacoesDaPagina.forEach(t => {
            const isEntrada = t.quantidade > 0;
            const qtdClass = isEntrada ? 'text-green-600' : 'text-red-600';
            const qtdSign = isEntrada ? '+' : '';
            rowsHtml += `
                <tr class="border-b hover:bg-gray-100">
                    <td class="p-2 text-xs text-gray-600">${new Date(t.timestamp).toLocaleString('pt-BR')}</td>
                    <td class="p-2 text-xs font-medium text-gray-800">${t.usuario}</td>
                    <td class="p-2 text-xs font-semibold text-indigo-700">${t.sku}</td>
                    <td class="p-2 text-xs">${t.tipo}</td>
                    <td class="p-2 text-xs font-bold ${qtdClass}">${t.quantidade !== 0 ? qtdSign + t.quantidade : '-'}</td>
                    <td class="p-2 text-xs">${t.prateleira}</td>
                    <td class="p-2 text-xs text-gray-500" title="${t.motivo || ''}">${t.motivo ? (t.motivo.length > 50 ? t.motivo.substring(0, 50) + '...' : t.motivo) : '-'}</td>
                </tr>
            `;
        });
        tableBody.innerHTML = rowsHtml;
    }
    renderPaginationControls(totalPaginas, totalTransacoes);
}
/**
 * Desenha os botões "Anterior", "Próxima" e as informações de contagem de página.
 * @param {number} totalPaginas - O número total de páginas calculado.
 * @param {number} totalTransacoes - O número total de transações após a filtragem.
 */
function renderPaginationControls(totalPaginas, totalTransacoes) {
    const controlsContainer = document.getElementById('trans-pagination-controls');
    const infoContainer = document.getElementById('trans-pagination-info');
    if (!controlsContainer || !infoContainer) return;
    if (totalTransacoes > 0) {
        infoContainer.innerText = `Página ${transacoesPaginaAtual} de ${totalPaginas} (${totalTransacoes} transações)`;
        controlsContainer.innerHTML = `
            <button onclick="changeTransactionPage(-1)" class="bg-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed" ${transacoesPaginaAtual === 1 ? 'disabled' : ''}>
                <i class="fas fa-arrow-left mr-2"></i>Anterior
            </button>
            <span class="font-semibold text-gray-700">${transacoesPaginaAtual} / ${totalPaginas}</span>
            <button onclick="changeTransactionPage(1)" class="bg-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed" ${transacoesPaginaAtual >= totalPaginas ? 'disabled' : ''}>
                Próxima<i class="fas fa-arrow-right ml-2"></i>
            </button>
        `;
    } else {
        infoContainer.innerText = '';
        controlsContainer.innerHTML = '';
    }
}
function changeTransactionPage(change) {
    transacoesPaginaAtual += change;
    renderTransactionsPage();
}