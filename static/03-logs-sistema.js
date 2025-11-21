// ================================================================================
// 03 LOGS SISTEMA
// ================================================================================


// --- 30-logs-do-sistema.js ---

// =================================================================================
// LOGS DO SISTEMA
// =================================================================================
// CORREÇÃO: Adicionado o parâmetro (logs) para receber os dados.
function updateLogs(logs) {
    const logsDiv = document.getElementById('logs');
    const systemLogsDiv = document.getElementById('logs-system');
    
    // Pega os 10 logs mais recentes para o dashboard
    const logHtml = logs.slice(0, 10).map(log => `
        <div class="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
            <p class="text-sm text-gray-700 flex-1">${log.data} - ${log.usuario}: ${log.acao}</p>
        </div>
    `).join("");

    if (logsDiv) logsDiv.innerHTML = logHtml;
    
    // Renderiza todos os logs para a página de logs do sistema
    if (systemLogsDiv) {
        systemLogsDiv.innerHTML = logs.map((log, index) => `
            <div class="flex items-start space-x-2 mb-2">
                <span class="text-green-400 font-mono text-xs">[${String(index + 1).padStart(3, '0')}]</span>
                <span class="text-green-400 font-mono text-sm">${log.data} - ${log.usuario}: ${log.acao}</span>
            </div>
        `).join("");
        systemLogsDiv.scrollTop = 0; // Garante que o scroll comece do topo
    }
}


// Em 03-logs-sistema.js

// Adicione esta variável global no topo do arquivo para controlar a paginação
let currentLogPage = 1;

/**
 * Função principal para buscar e renderizar os logs do sistema com filtros e paginação.
 */
// ================================================================================
// 03 LOGS SISTEMA (VERSÃO CORRIGIDA E OTIMIZADA)
// ================================================================================

/**
 * Função principal para buscar e renderizar os logs do sistema.
 * Ela é chamada quando o usuário acessa a página ou clica em "Aplicar Filtros".
 * @param {number} page - O número da página a ser buscada. Padrão é 1.
 */
async function renderSystemLogs(page = 1) {
    const tbody = document.getElementById('system-logs-tbody');
    const paginationInfo = document.getElementById('log-pagination-info');
    const paginationControls = document.getElementById('log-pagination-controls');

    if (!tbody) return; // Se não estiver na página de logs, não faz nada.

    // Mostra um feedback de carregamento
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-8">Buscando registros...</td></tr>';

    // 1. Coleta os valores dos filtros da tela
    const usuario = document.getElementById('log-filter-usuario').value;
    const modulo = document.getElementById('log-filter-modulo').value;
    const dataInicio = document.getElementById('log-filter-data-inicio').value;
    const dataFim = document.getElementById('log-filter-data-fim').value;

    // 2. Constrói a URL da API com os parâmetros de filtro e paginação
    const params = new URLSearchParams({
        page: page,
        usuario: usuario,
        modulo: modulo,
        data_inicio: dataInicio ? new Date(dataInicio).toISOString().split('T')[0] : '', // Formato YYYY-MM-DD
        data_fim: dataFim ? new Date(dataFim).toISOString().split('T')[0] : '',
    });

    try {
        // 3. Chama a nova rota do backend
        const response = await fetch(`/api/logs/search?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`Erro na requisição: ${response.statusText}`);
        }
        const data = await response.json();

        // 4. Renderiza os resultados na tabela
        if (data.logs && data.logs.length > 0) {
            tbody.innerHTML = data.logs.map(log => `
                <tr class="border-b hover:bg-gray-50">
                    <td class="p-3 text-sm text-gray-700 font-mono">${new Date(log.data).toLocaleString('pt-BR')}</td>
                    <td class="p-3 text-sm text-gray-800 font-semibold">${log.usuario}</td>
                    <td class="p-3 text-sm text-gray-600">${log.modulo}</td>
                    <td class="p-3 text-sm text-gray-700 max-w-md truncate" title="${log.acao}">${log.acao}</td>
                    <td class="p-3 text-sm text-gray-500 font-mono max-w-sm truncate" title="${log.detalhes}">${log.detalhes || 'N/A'}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-gray-500">Nenhum registro encontrado para os filtros aplicados.</td></tr>';
        }

        // 5. Atualiza as informações de paginação
        const inicio = (data.page - 1) * data.per_page + 1;
        const fim = inicio + data.logs.length - 1;
        paginationInfo.textContent = data.total > 0 ? `Mostrando ${inicio}-${fim} de ${data.total} registros` : 'Nenhum registro';

        // 6. Renderiza os controles de paginação
        renderPaginationControls(paginationControls, data.page, data.pages, 'renderSystemLogs');

    } catch (error) {
        console.error("Falha ao buscar logs do sistema:", error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-red-500">Falha ao carregar os registros. Verifique o console para mais detalhes.</td></tr>';
    }
}

/**
 * Função auxiliar para renderizar os botões de paginação.
 * @param {HTMLElement} container - O elemento onde os botões serão inseridos.
 * @param {number} currentPage - A página atual.
 * @param {number} totalPages - O número total de páginas.
 * @param {string} clickHandlerFunction - O nome da função a ser chamada no onclick (ex: 'renderSystemLogs').
 */
function renderPaginationControls(container, currentPage, totalPages, clickHandlerFunction) {
    if (!container) return;
    
    let html = '';
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    // Botão 'Anterior'
    html += `<button onclick="${clickHandlerFunction}(${currentPage - 1})" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>`;

    // Lógica para exibir os números das páginas (ex: 1 ... 4 5 6 ... 10)
    // (Implementação simplificada para clareza)
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            html += `<span class="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-md">${i}</span>`;
        } else if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button onclick="${clickHandlerFunction}(${i})" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-md hover:bg-gray-100">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span class="px-4 py-2 text-sm">...</span>`;
        }
    }

    // Botão 'Próxima'
    html += `<button onclick="${clickHandlerFunction}(${currentPage + 1})" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === totalPages ? 'disabled' : ''}>Próxima</button>`;

    container.innerHTML = html;
}


/**
 * Atualiza os controles de paginação (botões "Anterior", "Próxima", etc.).
 */
function updateLogPagination(currentPage, totalPages, totalItems) {
    const paginationInfo = document.getElementById('log-pagination-info');
    const paginationControls = document.getElementById('log-pagination-controls');
    if (!paginationInfo || !paginationControls) return;

    paginationInfo.textContent = `Página ${currentPage} de ${totalPages} (${totalItems} registros)`;

    let controlsHtml = '';
    // Botão "Anterior"
    controlsHtml += `<button onclick="renderSystemLogs(${currentPage - 1})" 
                             class="px-4 py-2 bg-gray-200 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                             ${currentPage === 1 ? 'disabled' : ''}>
                         Anterior
                     </button>`;

    // Botão "Próxima"
    controlsHtml += `<button onclick="renderSystemLogs(${currentPage + 1})" 
                             class="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                             ${currentPage === totalPages ? 'disabled' : ''}>
                         Próxima
                     </button>`;

    paginationControls.innerHTML = controlsHtml;
}

// Adicione este listener para carregar os logs quando a seção for exibida
document.addEventListener('DOMContentLoaded', () => {
    // Se você usa uma função para mostrar/esconder seções, chame renderSystemLogs() dentro dela
    // Exemplo: na função showSection('system-logs'), adicione renderSystemLogs();
});


// Em 03-logs-sistema.js

// Variáveis globais para paginação de logs
let logsPaginaAtual = 1;
const LOGS_POR_PAGINA = 50;

/**
 * Função principal que busca os logs no servidor com base nos filtros e na página.
 */
async function buscarLogsNoServidor() {
    const usuarioFiltro = document.getElementById('log-filtro-usuario').value;
    const moduloFiltro = document.getElementById('log-filtro-modulo').value;
    const dataInicioFiltro = document.getElementById('log-filtro-data-inicio').value;
    const dataFimFiltro = document.getElementById('log-filtro-data-fim').value;

    const resultContainer = document.getElementById('logs-list');
    resultContainer.innerHTML = '<p class="text-center p-8 animate-pulse">Buscando logs no servidor...</p>';

    try {
        // Constrói a URL da API com os filtros
        const params = new URLSearchParams({
            page: logsPaginaAtual,
            per_page: LOGS_POR_PAGINA,
            usuario: usuarioFiltro,
            modulo: moduloFiltro,
            data_inicio: dataInicioFiltro,
            data_fim: dataFimFiltro
        });

        const response = await fetch(`/api/logs/search?${params.toString()}`);
        if (!response.ok) throw new Error('Falha ao buscar logs');
        
        const data = await response.json();
        
        // Chama a função para renderizar os dados recebidos
        renderizarTabelaDeLogs(data);

    } catch (error) {
        console.error('Erro ao buscar logs:', error);
        resultContainer.innerHTML = '<p class="text-center text-red-500 p-8">Erro ao carregar logs do servidor.</p>';
    }
}

/**
 * Renderiza a tabela de logs e a paginação com os dados vindos do servidor.
 * @param {object} data - O objeto de resposta da API { logs, total, page, pages }.
 */
function renderizarTabelaDeLogs(data) {
    const resultContainer = document.getElementById('logs-list');
    const paginacaoContainer = document.getElementById('logs-paginacao');

    if (!data.logs || data.logs.length === 0) {
        resultContainer.innerHTML = '<p class="text-center p-8">Nenhum log encontrado com os filtros aplicados.</p>';
        paginacaoContainer.innerHTML = '';
        return;
    }

    // Renderiza as linhas da tabela
    resultContainer.innerHTML = data.logs.map(log => `
        <tr class="border-b border-gray-200 hover:bg-gray-50">
            <td class="py-3 px-4 text-sm text-gray-600">${new Date(log.data).toLocaleString('pt-BR')}</td>
            <td class="py-3 px-4 font-medium">${log.usuario}</td>
            <td class="py-3 px-4 text-sm">${log.modulo}</td>
            <td class="py-3 px-4 text-xs text-gray-800">${log.acao}</td>
        </tr>
    `).join('');

    // Renderiza a paginação
    paginacaoContainer.innerHTML = `
        <span class="text-sm text-gray-700">
            Página <strong>${data.page}</strong> de <strong>${data.pages}</strong> (${data.total} registros)
        </span>
        <div class="flex items-center gap-2">
            <button onclick="mudarPaginaLogs(-1)" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50" ${data.page === 1 ? 'disabled' : ''}>Anterior</button>
            <button onclick="mudarPaginaLogs(1)" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50" ${data.page >= data.pages ? 'disabled' : ''}>Próxima</button>
        </div>
    `;
}

function mudarPaginaLogs(direcao) {
    logsPaginaAtual += direcao;
    buscarLogsNoServidor();
}

// Finalmente, você precisa garantir que a busca seja chamada quando os filtros mudam.
// Exemplo:
// document.getElementById('log-filtro-usuario').addEventListener('change', () => {
//     logsPaginaAtual = 1; // Reseta para a primeira página
//     buscarLogsNoServidor();
// });
// Faça isso para todos os seus filtros.
