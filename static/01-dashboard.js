/**
 * 01-dashboard.js
 * Versão completa e corrigida do Dashboard de Operações
 * - Cálculo do estoque com tratamento robusto de valores
 * - Proteções contra variáveis indefinidas
 * - Funções para renderizar métricas, gráficos e logs
 *
 * Observação: este arquivo assume que algumas variáveis/arrays
 * (pedidos, producao, costura, expedicao, itensEstoque, logs, historicoArtes, charts)
 * são definidas em outros módulos do seu sistema. As funções aqui
 * fazem 'defensive checks' para evitar erros caso ainda não estejam carregadas.
 */

/* -------------------- Helpers -------------------- */

/**
 * Garante que a entrada é um array (retorna array vazio caso contrário).
 * @param {*} maybeArray
 * @returns {Array}
 */
function safeArray(maybeArray) {
    return Array.isArray(maybeArray) ? maybeArray : [];
}

/**
 * Normaliza um valor que representa quantidade para Number.
 * Aceita números, strings com vírgula/ponto, textos com sufixos, pontos de milhar etc.
 * Retorna 0 para entradas inválidas.
 * @param {number|string|null|undefined} valor
 * @returns {number}
 */
function parseQuantidade(valor) {
    if (valor === null || valor === undefined) return 0;
    if (typeof valor === 'number') {
        return isNaN(valor) ? 0 : valor;
    }
    // Se for string, limpar e converter:
    let s = String(valor).trim();
    if (s === '') return 0;

    // Remover texto não numérico exceto sinais numéricos, ponto e vírgula
    // Primeiro, remover palavras como 'un', 'unid', 'pcs', 'kg', etc.
    s = s.replace(/[a-zA-ZÀ-ÿ\/\s]+/g, '');

    // Se houver mais de uma vírgula/ponto, tratar pontos como separador de milhar
    // Estratégia: remover pontos (milhar), substituir vírgula por ponto (decimais)
    // Ex.: "1.234,56" -> "1234.56"
    // Também suporta "1,234.56" -> "1234.56" (caso usuário use formato anglófono)
    const countComma = (s.match(/,/g) || []).length;
    const countDot = (s.match(/\./g) || []).length;

    if (countComma > 0 && countDot > 0) {
        // existe vírgula e ponto -> decidir com base na posição do último separador
        const lastComma = s.lastIndexOf(',');
        const lastDot = s.lastIndexOf('.');
        if (lastComma > lastDot) {
            // formato BR típico: pontos -> milhares, vírgula -> decimal
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            // formato EN típico: vírgulas -> milhares, ponto -> decimal
            s = s.replace(/,/g, '');
        }
    } else if (countDot > 1 && countComma === 0) {
        // vários pontos -> presumir pontos como milhares
        s = s.replace(/\./g, '');
    } else if (countComma > 1 && countDot === 0) {
        // várias vírgulas -> remover vírgulas extras, considerar última como decimal
        // substitui todas as vírgulas por nada exceto a última
        const parts = s.split(',');
        const last = parts.pop();
        s = parts.join('') + '.' + last;
    } else {
        // caso simples: substituir vírgula única por ponto
        s = s.replace(',', '.');
    }

    // Remover qualquer caractere que não seja dígito, sinal, ou ponto
    s = s.replace(/[^0-9\.\-]/g, '');

    // Se string vazia após limpeza, retorna 0
    if (s === '' || s === '.' || s === '-' || s === '-.' ) return 0;

    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

/* -------------------- Dashboard principal -------------------- */

/**
 * Carrega e renderiza todos os componentes do Dashboard.
 * Use await loadAdminDashboard() se estiver chamando após carregamento assíncrono de dados.
 */
async function loadAdminDashboard() {
    try {
        if (typeof hasPermission === 'function' && !hasPermission('dashboard', 'visualizar')) {
            const el = document.getElementById('admin-dashboard');
            if (el) el.innerHTML = '<p class="text-center text-red-500">Você não tem permissão para acessar este módulo.</p>';
            return;
        }

        // Atualiza a data/hora da última atualização
        const dataContainer = document.getElementById('dashboard-data-atualizacao');
        if (dataContainer) {
            dataContainer.innerHTML = `Última atualização: <strong>${new Date().toLocaleString('pt-BR')}</strong>`;
        }

        // Renderiza em paralelo componentes do dashboard
        await Promise.allSettled([
            renderDashboardMetrics(),
            renderFunilPedidosChart(),
            renderMarketplaceChart(),
            renderRecentActivityLogs(),
            renderArtHistory()
        ]);
    } catch (err) {
        console.error('[loadAdminDashboard] Erro ao carregar o dashboard:', err);
    }
}

/* -------------------- Métricas e Cards -------------------- */

async function renderDashboardMetrics() {
    try {
        const metricsContainer = document.getElementById('metrics');
        if (!metricsContainer) return;

        // Defensive retrieval de arrays/variáveis globais
        const pedidosArr = safeArray(typeof pedidos !== 'undefined' ? pedidos : []);
        const producaoArr = safeArray(typeof producao !== 'undefined' ? producao : []);
        const costuraArr = safeArray(typeof costura !== 'undefined' ? costura : []);
        const expedicaoArr = safeArray(typeof expedicao !== 'undefined' ? expedicao : []);
        const itensEstoqueArr = safeArray(typeof itensEstoque !== 'undefined' ? itensEstoque : []);

        // Pedidos pendentes (contagem de pedidos únicos em status 'Pendente')
        const totalPedidosPendentes = new Set(pedidosArr.filter(p => p.status === 'Pendente').map(p => p.id)).size;

        const totalItensProducao = producaoArr.length;
        const totalItensCostura = costuraArr.length;

        // Usamos a função getStatusTodosPacotes para separar pacotes completos/incompletos
        const pacotesInfo = (typeof getStatusTodosPacotes === 'function') ? getStatusTodosPacotes() : { pacotesCompletos: [], pacotesIncompletos: [] };
        const totalPacotesExpedicao = (pacotesInfo.pacotesCompletos || []).length;

        // ======================= CÁLCULO DO ESTOQUE REAL (TOTAL DE UNIDADES) =======================
        const totalUnidadesEstoque = itensEstoqueArr.reduce((ac, item, idx) => {
            // tratamento defensivo do campo quantidade
            const valorRaw = item?.quantidade ?? item?.qtd ?? item?.quantidade_atual ?? 0;
            const q = parseQuantidade(valorRaw);
            if (q === 0 && (valorRaw !== 0 && valorRaw !== '0' && valorRaw !== '0.0')) {
                // Log opcional para depuração de itens com quantidades inválidas — comentar se poluir console
                // console.warn(`[parseQuantidade] item[${idx}].quantidade inválida -> "${valorRaw}" -> tratado como 0`, item);
            }
            return ac + q;
        }, 0);

        // Número de SKUs únicos
        const totalSkusUnicos = new Set(itensEstoqueArr.map(item => item?.sku ?? item?.codigo ?? '').filter(Boolean)).size;
        // ======================== FIM DO CÁLCULO DO ESTOQUE REAL =========================

        const metrics = [
            { label: 'Pedidos Pendentes', value: totalPedidosPendentes, icon: 'fa-receipt', color: 'from-yellow-400 to-amber-500' },
            { 
                label: 'Itens em Estoque', 
                value: totalUnidadesEstoque, 
                subValue: `${totalSkusUnicos.toLocaleString('pt-BR')} SKUs`, 
                icon: 'fa-boxes-stacked', 
                color: 'from-green-500 to-lime-500' 
            },
            { label: 'Fila de Produção', value: totalItensProducao, icon: 'fa-cogs', color: 'from-purple-500 to-indigo-500' },
            { label: 'Fila de Costura', value: totalItensCostura, icon: 'fa-cut', color: 'from-teal-500 to-emerald-500' },
            { label: 'Prontos para Envio', value: totalPacotesExpedicao, icon: 'fa-box-check', color: 'from-blue-500 to-cyan-500' }
        ];

        metricsContainer.innerHTML = metrics.map(metric => `
            <div class="bg-white/80 p-5 rounded-2xl shadow-lg border border-gray-200/50 transition-transform transform hover:-translate-y-1">
                <div class="flex items-start justify-between">
                    <div class="flex flex-col">
                        <p class="text-sm font-medium text-gray-500">${metric.label}</p>
                        <p class="text-4xl font-bold text-gray-800 mt-1">${Number(metric.value).toLocaleString('pt-BR')}</p>
                        ${metric.subValue ? `<p class="text-xs font-semibold text-green-700 mt-1">${metric.subValue}</p>` : ''}
                    </div>
                    <div class="w-12 h-12 bg-gradient-to-br ${metric.color} rounded-xl flex items-center justify-center shadow-md">
                        <i class="fas ${metric.icon} text-white text-xl"></i>
                    </div>
                </div>
            </div>
        `).join('');

        // Log resumo (útil para debug)
        console.debug('[renderDashboardMetrics] resumo:', {
            totalUnidadesEstoque, totalSkusUnicos, totalPedidosPendentes,
            totalItensProducao, totalItensCostura, totalPacotesExpedicao
        });
    } catch (err) {
        console.error('[renderDashboardMetrics] Erro:', err);
    }
}

/* -------------------- Gráficos -------------------- */

/**
 * Renderiza o gráfico de Funil de Pedidos (bar horizontal).
 */
async function renderFunilPedidosChart() {
    try {
        const chartId = 'funil-pedidos-chart';
        if (charts && charts[chartId]) {
            try { charts[chartId].destroy(); } catch (e) { /* ignore */ }
        }
        const ctx = document.getElementById(chartId)?.getContext('2d');
        if (!ctx) return;

        const pedidosArr = safeArray(typeof pedidos !== 'undefined' ? pedidos : []);
        const producaoArr = safeArray(typeof producao !== 'undefined' ? producao : []);
        const costuraArr = safeArray(typeof costura !== 'undefined' ? costura : []);
        const pacotesInfo = (typeof getStatusTodosPacotes === 'function') ? getStatusTodosPacotes() : { pacotesCompletos: [], pacotesIncompletos: [] };

        const data = {
            'Pendentes': new Set(pedidosArr.filter(p => p.status === 'Pendente').map(p => p.id)).size,
            'Produção': producaoArr.length,
            'Costura': costuraArr.length,
            'Expedição': (pacotesInfo.pacotesCompletos || []).length
        };

        charts[chartId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(data),
                datasets: [{
                    label: 'Quantidade de Itens/Pacotes',
                    data: Object.values(data),
                    backgroundColor: [
                        'rgba(251, 191, 36, 0.7)',
                        'rgba(139, 92, 246, 0.7)',
                        'rgba(20, 184, 166, 0.7)',
                        'rgba(59, 130, 246, 0.7)'
                    ],
                    borderColor: [
                        '#FBBF24',
                        '#8B5CF6',
                        '#14B8A6',
                        '#3B82F6'
                    ],
                    borderWidth: 2,
                    borderRadius: 5,
                    borderSkipped: false,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { beginAtZero: true, grid: { display: false } },
                    y: { grid: { display: false } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.raw.toLocaleString('pt-BR')} itens/pacotes`;
                            }
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.error('[renderFunilPedidosChart] Erro:', err);
    }
}

/**
 * Renderiza o gráfico de distribuição por Marketplace (doughnut).
 */
async function renderMarketplaceChart() {
    try {
        const chartId = 'marketplace-chart';
        if (charts && charts[chartId]) {
            try { charts[chartId].destroy(); } catch (e) { /* ignore */ }
        }
        const ctx = document.getElementById(chartId)?.getContext('2d');
        if (!ctx) return;

        const pedidosArr = safeArray(typeof pedidos !== 'undefined' ? pedidos : []);
        const pedidosPendentes = pedidosArr.filter(p => p.status === 'Pendente');

        const contagemMarketplace = pedidosPendentes.reduce((acc, pedido) => {
            const marketplace = pedido.marketplace || 'Outros';
            acc[marketplace] = (acc[marketplace] || 0) + 1;
            return acc;
        }, {});

        charts[chartId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(contagemMarketplace),
                datasets: [{
                    data: Object.values(contagemMarketplace),
                    backgroundColor: [
                        '#FBBF24',
                        '#F97316',
                        '#06B6D4',
                        '#84CC16',
                        '#EC4899'
                    ],
                    borderColor: '#FFFFFF',
                    borderWidth: 4,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        display: true,
                        position: 'right',
                        labels: { boxWidth: 12, font: { size: 12 } }
                    }
                }
            }
        });
    } catch (err) {
        console.error('[renderMarketplaceChart] Erro:', err);
    }
}

/* -------------------- Logs e Histórico de Artes -------------------- */

async function renderRecentActivityLogs() {
    try {
        const container = document.getElementById('logs');
        if (!container) return;

        const logsArr = safeArray(typeof logs !== 'undefined' ? logs : []);
        const logsDePedidos = logsArr.filter(log => 
            String(log.acao || '').toLowerCase().includes('pedido') ||
            String(log.acao || '').toLowerCase().includes('produção') ||
            String(log.acao || '').toLowerCase().includes('costura') ||
            String(log.acao || '').toLowerCase().includes('expedição')
        ).slice(-10).reverse();

        if (logsDePedidos.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center p-4">Nenhuma atividade de pedidos registrada ainda.</p>';
            return;
        }

        container.innerHTML = logsDePedidos.map(log => {
            // Tentativa segura de formatação de data/hora (padrão "DD/MM/YYYY HH:MM:SS" ou similar)
            let dataFormatada = '';
            try {
                if (log.data) {
                    // se for no formato "DD/MM/YYYY HH:MM:SS"
                    const parts = String(log.data).split(' ');
                    if (parts.length >= 2) {
                        const dateParts = parts[0].split('/');
                        if (dateParts.length === 3) {
                            const iso = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T${parts[1] || '00:00:00'}`;
                            dataFormatada = new Date(iso).toLocaleString('pt-BR');
                        } else {
                            dataFormatada = new Date(log.data).toLocaleString('pt-BR');
                        }
                    } else {
                        dataFormatada = new Date(log.data).toLocaleString('pt-BR');
                    }
                }
            } catch (e) {
                dataFormatada = '';
            }

            return `
                <div class="flex items-start space-x-4 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                    <div class="flex-shrink-0 bg-gray-100 text-gray-500 rounded-full h-9 w-9 flex items-center justify-center mt-1">
                        <i class="fas fa-info-circle"></i>
                    </div>
                    <div class="flex-1">
                        <p class="text-sm text-gray-800">
                            <strong class="font-semibold">${log.usuario || 'Sistema'}</strong>: ${log.acao || ''}
                        </p>
                        <p class="text-xs text-gray-400 mt-1">${dataFormatada}</p>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('[renderRecentActivityLogs] Erro:', err);
    }
}

/**
 * Renderiza o histórico de artes (exibe as últimas 5).
 */
function renderArtHistory() {
    try {
        const container = document.getElementById('art-history-logs');
        if (!container) return;
        const historicoArr = safeArray(typeof historicoArtes !== 'undefined' ? historicoArtes : []);
        const historicoRecente = historicoArr.slice(-5).reverse();

        if (historicoRecente.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center p-4">Nenhuma arte enviada.</p>';
            return;
        }

        container.innerHTML = historicoRecente.map(item => `
            <div class="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100">
                <div class="flex-shrink-0 bg-indigo-100 text-indigo-600 rounded-full h-8 w-8 flex items-center justify-center">
                    <i class="fas fa-print"></i>
                </div>
                <div>
                    <p class="text-sm font-semibold text-gray-800">${item.sku || '—'} &rarr; Imp. ${item.impressora || '—'}</p>
                    <p class="text-xs text-gray-500">Por ${item.usuario || '—'}</p>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('[renderArtHistory] Erro:', err);
    }
}

/* -------------------- Função auxiliar para pacotes de expedição -------------------- */

/**
 * Gera informações sobre pacotes na expedição (completos x incompletos)
 * Implementação defensiva: usa arrays globais se existirem, caso contrário retorna vazio.
 */
function getStatusTodosPacotes() {
    try {
        const expedicaoArr = safeArray(typeof expedicao !== 'undefined' ? expedicao : []);
        const pedidosArr = safeArray(typeof pedidos !== 'undefined' ? pedidos : []);
        const producaoArr = safeArray(typeof producao !== 'undefined' ? producao : []);
        const costuraArr = safeArray(typeof costura !== 'undefined' ? costura : []);

        const itensNaExpedicao = expedicaoArr.filter(item => item.status !== 'Enviado');
        const itensPresentesPorPedido = itensNaExpedicao.reduce((acc, item) => {
            const pedidoId = item.pedidoId ?? item.pedidoIdOriginal ?? item.pedido;
            if (!pedidoId) return acc;
            if (!acc[pedidoId]) acc[pedidoId] = [];
            acc[pedidoId].push(item);
            return acc;
        }, {});

        const pacotesCompletos = [];
        const pacotesIncompletos = [];

        for (const pedidoId in itensPresentesPorPedido) {
            const itensPresentes = itensPresentesPorPedido[pedidoId];
            // tenta calcular a quantidade total do pedido original
            const qtdEmPedidos = pedidosArr.filter(p => p.id === pedidoId).reduce((sum, p) => sum + (parseQuantidade(p.quantidade) || 0), 0);
            const qtdEmProducao = producaoArr.filter(p => p.pedidoId === pedidoId).reduce((sum, p) => sum + (parseQuantidade(p.quantidade) || 0), 0);
            const qtdEmCostura = costuraArr.filter(c => c.pedidoId === pedidoId).reduce((sum, p) => sum + (parseQuantidade(p.quantidade) || 0), 0);
            const qtdNaExpedicao = itensPresentes.reduce((sum, e) => sum + (parseQuantidade(e.quantidade) || 0), 0);

            const totalItensDoPedidoOriginal = qtdEmPedidos + qtdEmProducao + qtdEmCostura + qtdNaExpedicao;
            const isCompleto = (qtdNaExpedicao === totalItensDoPedidoOriginal);

            const infoPrimeiroItem = itensPresentes[0] || {};
            const pacote = { id: pedidoId, marketplace: infoPrimeiroItem.marketplace, itensPresentes };

            if (isCompleto) pacotesCompletos.push(pacote);
            else pacotesIncompletos.push(pacote);
        }

        return { pacotesCompletos, pacotesIncompletos };
    } catch (err) {
        console.error('[getStatusTodosPacotes] Erro:', err);
        return { pacotesCompletos: [], pacotesIncompletos: [] };
    }
}

/* -------------------- Export / Inicialização automática -------------------- */

// Se você quiser inicializar automaticamente quando o script for carregado,
// descomente a linha abaixo. Caso prefira controlar a inicialização externamente,
// chame `loadAdminDashboard()` depois de carregar os dados necessários.
//
// window.addEventListener('DOMContentLoaded', () => {
//     // Se seus dados são carregados assincronamente, chame loadAdminDashboard() após carregar.
//     loadAdminDashboard();
// });

/* Expor função global para permitir que outros módulos chamem */
window.loadAdminDashboard = loadAdminDashboard;
window.parseQuantidade = parseQuantidade;
