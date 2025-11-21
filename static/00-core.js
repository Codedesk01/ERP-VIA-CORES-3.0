// ================================================================================
// 00 CORE
// ================================================================================




// ============================================================================
// SOCKET.IO - ATUALIZAÇÃO EM TEMPO REAL
// ============================================================================

const socket = io();

// Arquivo: 00-core.js
// SUBSTITUA TODA A FUNÇÃO socket.on('dados_atualizados', ...) POR ESTA:

// Arquivo: 00-core.js

// SUBSTITUA O SEU LISTENER 'socket.on('dados_atualizados', ...)' POR ESTE BLOCO COMPLETO

// Arquivo: 00-core.js

// SUBSTITUA O SEU LISTENER 'socket.on('dados_atualizados', ...)' POR ESTE BLOCO COMPLETO

socket.on('dados_atualizados', async (data) => {
    // Ignora sinais originados pelo próprio cliente para evitar loops
    if (data.origem_sid && data.origem_sid === socket.id) {
        console.log(`✔️ Sinal do módulo '${data.modulo}' ignorado (originado por este cliente).`);
        return;
    }

    if (!data || !data.modulo) {
        console.warn('Recebido evento de atualização sem um módulo específico.');
        return;
    }

    // ======================= INÍCIO DA CORREÇÃO =======================
    // **PONTO-CHAVE**: Se a atualização for do módulo EAN, nós a ignoramos aqui.
    // A função 'marcarMarketplace' já faz tudo o que é necessário (salvar no servidor).
    // Não precisamos recarregar nenhum dado, pois isso fecharia a lista de busca.
    if (data.modulo === 'processadorEANs' || data.modulo === 'ean') {
        console.log(`✔️ Sinal do módulo EAN ('${data.modulo}') recebido e intencionalmente ignorado para manter a lista de busca aberta.`);
        // Apenas atualiza o dado na variável local 'listaEANs' se o item for enviado no payload
        if (data.item) {
             const index = listaEANs.findIndex(i => i.id === data.item.id);
             if (index !== -1) {
                 listaEANs[index] = data.item;
                 console.log(`🤫 Item EAN ID ${data.item.id} atualizado silenciosamente na memória.`);
             }
        }
        return; // Impede que o resto da função execute e recarregue a página.
    }
    // ======================== FIM DA CORREÇÃO =========================

    if (data.modulo === 'save_all') {
        console.log("✔️ Sinal 'save_all' recebido e ignorado, como esperado.");
        return;
    }

    console.log(`⚡️ Sinal recebido para o módulo: ${data.modulo}.`);

    // Lógica de atualização inteligente para os OUTROS módulos (Chat, Pedidos, etc.)
    try {
        // Tratamento especial e prioritário para o CHAT
        if (data.modulo === 'chat') {
            console.log("🔄 Atualização específica para o Chat em andamento...");
            const res = await fetch('/api/data?modulos=conversas');
            const chatData = await res.json();
            if (chatData.conversas) {
                conversas = chatData.conversas;
            }
            updateNotificationCounter();
            if (document.getElementById('chat') && !document.getElementById('chat').classList.contains('hidden')) {
                const oldConversaAtivaId = conversaAtivaId;
                renderListaConversas();
                if (oldConversaAtivaId) {
                    abrirConversa(oldConversaAtivaId);
                }
                console.log("🎨 UI do Chat redesenhada em tempo real.");
            } else {
                console.log("🤫 Chat atualizado em segundo plano.");
            }
            return;
        }

        // Lógica genérica para os outros módulos
        console.log(`Iniciando atualização granular para o módulo: ${data.modulo}`);
        const moduleLoadFunctions = {
            'dashboard': loadAdminDashboard,
            'userManagement': loadUserManagement,
            'logs': updateLogs,
            'estoque': loadEstoque,
            'pedidos': loadPedidos,
            'producao': loadProducao,
            'costura': loadCostura,
            'expedicao': loadExpedicao
        };

        const loadFunction = moduleLoadFunctions[data.modulo];

        if (typeof loadFunction === 'function') {
            await loadFromServer();
            const visibleSection = document.querySelector('.content-section:not(.hidden)');
            if (visibleSection && visibleSection.id.startsWith(data.modulo.split(/(?=[A-Z])/)[0].toLowerCase())) {
                 loadFunction();
                 console.log(`🎨 Módulo '${data.modulo}' (visível) atualizado e redesenhado.`);
            } else {
                 console.log(`🤫 Módulo '${data.modulo}' atualizado em segundo plano.`);
            }
        } else {
            console.warn(`Função de carregamento para '${data.modulo}' não encontrada. Recarregando tudo como fallback.`);
            await loadFromServer();
            loadAndRenderApp();
        }

    } catch (error) {
        console.error("Erro durante a atualização de dados via socket:", error);
    } finally {
        console.log("Recarga via socket concluída.");
    }
});





// Em 00-core.js, adicione este novo listener de socket

// Listener para o resultado da coleta de imagens
socket.on('image_collection_complete', (data) => {
    console.log("✅ Imagens prontas!", data);

    // Esconde o overlay de loading
    hideLoading();

    if (data.status === 'ok') {
        showToast('Busca de imagens concluída com sucesso!', 'success');
        
        // AQUI, você coloca a lógica que antes acontecia depois do fetch:
        // Por exemplo, abrir a pasta de resultados, mostrar os links, etc.
        // Exemplo:
        // window.open(`file:///${data.session_folder_full_path}`); // Se for o caso
        // renderizarResultadosDaBusca(data.found, data.not_found); // Se você tiver uma função para isso
        
        alert(`Busca concluída!\n\nEncontrados: ${data.found.length} arquivos.\nNão encontrados: ${data.not_found.length} SKUs.\n\nOs arquivos estão na pasta de sessão: ${data.session_folder}`);

    } else {
        showToast('Ocorreu um erro durante a coleta de imagens.', 'error');
    }
});




function capitalizeFirstLetter(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
}

socket.on('connect', () => {
    console.log('✅ Conectado ao servidor em tempo real!');
});


// =================================================================================
// DADOS E ESTADO INICIAL
// =================================================================================
let users = [], currentUser = null, itensEstoque = [], stockClearRequests = [], pedidos = [], images = [], producao = [], costura = [], expedicao = [], historicoExpedicao = [], logs = [], charts = {}, transacoesFiltradasGlobal = [], transacoesPaginaAtual = 1, relatoriosArquivados = [], pedidosComErro = [], impressoraSelecionada = null, historicoPaginaAtual = 1, itensParaProducaoGlobal = [], historicoArtes = [], tarefaCosturaAtiva = null, cronometroCosturaInterval = null, tempoPausadoAcumulado = 0, conversas = [], listaEANs = [], lojaSelecionada = null, itemParaEditarId = null, errosDeImportacaoEAN = [], resultadosBuscaGeral = [], paginaAtualBuscaGeral = 1, transacoesEstoque = [];
const HISTORICO_ITENS_POR_PAGINA = 200;
const ITENS_POR_PAGINA_BUSCA_GERAL = 100;


// --- 02-funções-de-comunicação-com-backend-flask.js ---

// ============================================================================
// FUNÇÕES DE COMUNICAÇÃO COM BACKEND FLASK
// ============================================================================

async function loadFromServer() {
    const res = await fetch('/api/data');
    const data = await res.json();
    users = data.users || [];
    itensEstoque = data.itensEstoque || [];
    logs = data.logs || [];
    pedidos = data.pedidos || [];
    costura = data.costura || [];
    producao = data.producao || [];
    expedicao = data.expedicao || [];
    historicoExpedicao = data.historicoExpedicao || []; // <<< ADICIONE ESTA LINHA
    listaEANs = data.listaEANs || [];
    relatoriosArquivados = data.relatoriosArquivados || [];
    transacoesEstoque = data.transacoesEstoque || [];
    conversas = data.conversas || [];
    historicoArtes = data.historicoArtes || [];
    pedidosComErro = data.pedidosComErro || [];
    errosDeImportacaoEAN = data.errosDeImportacaoEAN || [];
    stockClearRequests = data.stockClearRequests || [];
}

async function saveData() {
    try {
        const res = await fetch(window.location.origin.includes('http'  ) ? `${window.location.origin}/api/save` : 'http://127.0.0.1:5000/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // NA LINHA ABAIXO, ADICIONE 'historicoExpedicao'
            body: JSON.stringify({
                users, itensEstoque, pedidos, producao, costura, expedicao, historicoExpedicao, logs,
                transacoesEstoque, relatoriosArquivados, pedidosComErro, conversas,
                listaEANs, historicoArtes, errosDeImportacaoEAN, stockClearRequests
            }  )
        });
        const result = await res.json();
        console.log('✅ Dados sincronizados com o servidor:', result);
    } catch (err) {
        console.error('❌ Erro ao sincronizar com backend:', err);
    }
}


// --- 03-funções-de-login-logout.js ---

// ============================================================================
// FUNÇÕES DE LOGIN / LOGOUT
// ============================================================================
// --- FUNÇÕES DE LOGIN / LOGOUT COM PERSISTÊNCIA ---

async function login() {
    // Após o login, carregamos todos os dados uma vez para inicializar o estado.
    await loadFromServer();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    try {
        const response = await fetch('/api/users/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const result = await response.json();
        if (response.ok) {
            currentUser = result.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            document.getElementById('current-user').innerText = currentUser.username;
            await logAction(`Usuário ${currentUser.username} fez login`);
            // Após o login, carregamos todos os dados uma vez para inicializar o estado
    await loadFromServer();
            loadAndRenderApp();
            showToast('Login realizado com sucesso!');
        } else {
            showToast(result.message || 'Usuário ou senha inválidos.', 'error');
        }
    } catch (error) {
        console.error('Erro ao tentar fazer login:', error);
        showToast('Erro de comunicação com o servidor.', 'error');
    }
}

async function logout() {
    const username = currentUser?.username || 'desconhecido';
    await logAction(`Usuário ${username} saiu`);
    currentUser = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('activeSectionId');
    window.location.reload();
}


// --- 04-logs-e-toasts.js ---

// ============================================================================
// LOGS E TOASTS
// ============================================================================

/**
 * Envia uma ação para ser registrada no log do sistema.
 * VERSÃO CORRIGIDA: Garante que objetos de log sejam convertidos para string JSON
 * antes do envio, evitando o erro "can't adapt type 'dict'" no backend.
 * @param {string | object} msg - A mensagem de log ou um objeto estruturado.
 */
async function logAction(msg) {
    const acaoParaEnviar = typeof msg === 'object' && msg !== null ? JSON.stringify(msg, null, 2) : msg;
    const logEntry = {
        data: new Date().toLocaleString('pt-BR'),
        usuario: currentUser ? currentUser.username : 'Sistema',
        acao: acaoParaEnviar
    };
    try {
        await fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logEntry)
        });
    } catch (error) {
        console.error('Erro de rede ao tentar registrar o log:', error);
    }
}

function showToast(msg, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    const toast = document.createElement('div');
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
    toast.className = `flex items-center gap-3 ${colors[type]} text-white py-3 px-5 rounded-xl shadow-lg transform transition-all duration-300 animate-fade-in-right`;
    toast.innerHTML = `<i class="fas ${icons[type]}"></i><span>${msg}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- 05-inicialização.js ---

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Carregamos todos os dados uma vez na inicialização para popular o estado inicial da aplicação.
    await loadFromServer();
    const savedUserJSON = localStorage.getItem('currentUser');
    if (savedUserJSON) {
        currentUser = JSON.parse(savedUserJSON);
    }
    try {
        await loadFromServer();
    } catch (e) {
        showToast('Erro de comunicação com o servidor. Faça login novamente.', 'error');
        logout();
        return;
    }
    if (currentUser) {
        const userIsValid = users.some(u => u.username === currentUser.username);
        if (userIsValid) {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            document.getElementById('current-user').innerText = currentUser.username;
            loadAndRenderApp();
        } else {
            logout();
        }
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
        document.getElementById('login-button').addEventListener('click', login);
    }
});



// ============================================================================
// FUNÇÕES DE NAVEGAÇÃO E RENDERIZAÇÃO
// ============================================================================

function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(section => section.classList.add('hidden'));
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
        activeSection.classList.remove('hidden');
        localStorage.setItem('activeSectionId', sectionId);
    }
}


function setupNavigation() {
    const menu = document.getElementById('nav-menu');
    menu.innerHTML = '';
    const navItems = [
        { id: 'admin-dashboard', label: 'Dashboard', icon: 'fa-tachometer-alt', permission: 'dashboard:visualizar' },
        { id: 'user-management', label: 'Gestão de Usuários', icon: 'fa-users-cog', permission: 'userManagement:visualizar' },
        { id: 'system-logs', label: 'Logs do Sistema', icon: 'fa-clipboard-list', permission: 'logs:visualizar' },
        { id: 'chat', label: 'Chat Interno (Contrução)', icon: 'fa-comments', permission: 'chat:visualizar' },
        { id: 'processador-eans', label: 'Processador de EANs (Contrução)', icon: 'fa-barcode', permission: 'processadorEANs:visualizar' },
        { id: 'estoque', label: 'Estoque', icon: 'fa-boxes', permission: 'estoque:visualizar' },
        { id: 'banco-imagens', label: 'Banco de Imagens', icon: 'fa-images', permission: 'bancoImagens:visualizar' },
        { id: 'pedidos', label: 'Pedidos', icon: 'fa-shopping-cart', permission: 'pedidos:visualizar' },
        { id: 'producao', label: 'Produção', icon: 'fa-cogs', permission: 'producao:visualizar' },
        { id: 'costura', label: 'Costura', icon: 'fa-cut', permission: 'costura:visualizar' },
        { id: 'expedicao', label: 'Expedição', icon: 'fa-shipping-fast', permission: 'expedicao:visualizar' }
    ];
    let hasVisibleItems = false;
    navItems.forEach(item => {
        if (hasPermission(item.permission.split(':')[0], item.permission.split(':')[1])) {
            hasVisibleItems = true;
            const li = document.createElement('li');
            li.innerHTML = `<a href="#" class="nav-item flex items-center p-3 rounded-lg hover:bg-gray-700 transition-colors" data-section="${item.id}"><i class="fas ${item.icon} w-6 text-center"></i><span class="ml-4">${item.label}</span></a>`;
            menu.appendChild(li);
        }
    });
    document.getElementById('no-permission').style.display = hasVisibleItems ? 'none' : 'block';
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = item.dataset.section;
            showSection(sectionId);
            loadDynamicData(sectionId);
        });
    });
}

function loadDynamicData(sectionId) {
    const loadFunctions = {
        'admin-dashboard': loadAdminDashboard,
        'user-management': loadUserManagement,
        'system-logs': () => renderSystemLogs(1),
        'chat': loadChat,
        'processador-eans': renderizarProcessadorEans,
        'estoque': loadEstoque,
        'banco-imagens': loadBancoImagens,
        'pedidos': loadPedidos,
        'producao': loadProducao,
        'costura': loadCostura,
        'expedicao': loadExpedicao
    };
    if (loadFunctions[sectionId]) {
        loadFunctions[sectionId]();
    }
}

function loadAndRenderApp() {
    if (!currentUser) return;
    setupNavigation();
    applyPermissionsToUI();
    const lastSectionId = localStorage.getItem('activeSectionId');
    let canViewLastSection = false;
    if (lastSectionId) {
        const lastSectionElement = document.getElementById(lastSectionId);
        if (lastSectionElement) {
            canViewLastSection = !lastSectionElement.querySelector('[data-permission]') || hasPermission(lastSectionId.split('-')[0], 'visualizar');
        }
    }
    if (lastSectionId && canViewLastSection) {
        showSection(lastSectionId);
        loadDynamicData(lastSectionId);
    } else {
        const firstVisibleSection = document.querySelector('#nav-menu .nav-item');
        if (firstVisibleSection) {
            const firstSectionId = firstVisibleSection.dataset.section;
            showSection(firstSectionId);
            loadDynamicData(firstSectionId);
        } else {
            showSection('no-permission');
        }
    }
}




// ============================================================================
// CONTROLE DE PERMISSÕES
// ============================================================================
function hasPermission(module, action) {
    if (!currentUser) return false;
    if (currentUser.role === 'admin-master') return true;
    const userPermissions = currentUser.permissions || {};
    return userPermissions[module] && userPermissions[module][action];
}

function applyPermissionsToUI() {
    document.querySelectorAll('[data-permission]').forEach(el => {
        const [module, action] = el.dataset.permission.split(':');
        if (!hasPermission(module, action)) {
            el.classList.add('hidden');
        } else {
            el.classList.remove('hidden');
        }
    });
}


const TRANSACOES_POR_PAGINA = 50;

const ESTOQUE_BAIXO_THRESHOLD = 10; // Alerta quando a quantidade for <= 10

// Estrutura de permissões padrão para novos usuários (VERSÃO GRANULAR)
const defaultPermissions = {
    // Módulo Estoque
    estoque: { 
        visualizar: false, 
        cadastrar: false, 
        editar: false, 
        excluir: false, 
        movimentar: false,
        importar: false, // Nova permissão para importar planilhas
        gerarRelatorio: false // Nova permissão para gerar relatórios
    },
    
    // Módulo Banco de Imagens
    bancoImagens: { 
        visualizar: false, 
        adicionar: false, 
        excluir: false,
        pesquisar: false // Nova permissão para a busca
    },
    // Módulo Pedidos
    pedidos: { 
        visualizar: false, 
        importar: false, 
        editar: false, 
        excluir: false, 
        cadastrar: false,
        processar: false, // Nova permissão para mover para produção/expedição
        gerarRelatorio: false // Nova permissão para lista de separação/histórico
    },
    // Módulo Produção
    producao: { 
        visualizar: false, 
        adicionar: false, 
        editar: false, 
        excluir: false,
        moverParaCostura: false // Nova permissão para concluir e mover
    },
    // Módulo Costura
    costura: { 
        visualizar: false, 
        adicionar: false, 
        editar: false, 
        excluir: false,
        iniciarTarefa: false, // Nova permissão para iniciar o trabalho no lote
        moverParaExpedicao: false, // Nova permissão para enviar à expedição
        atribuirGrupos: false // A permissão que você solicitou!
    },
    // Módulo Expedição
    expedicao: { 
        visualizar: false, 
        editar: false, // Para associar etiquetas
        darBaixa: false, // Para imprimir e dar baixa
        gerarRelatorio: false // Para o histórico de expedição
    },
    // Módulo Chat
    chat: { 
        visualizar: true, 
        enviar: false,
        criarGrupo: false // Nova permissão para criar grupos
    },
    // Módulo Processador de EANs
    processadorEANs: { 
        visualizar: false, 
        editar: false, 
        processar: false,
        gerarRelatorio: false // Nova permissão para gerar PDF
    }
};




// =================================================================================
// FUNÇÃO DE UTILIDADE GLOBAL: COPIAR PARA ÁREA DE TRANSFERÊNCIA
// =================================================================================
/**
 * Copia um texto para a área de transferência de forma segura e universal.
 * Tenta usar a API moderna (navigator.clipboard) e, se falhar (por exemplo,
 * em contextos não seguros como http:// ), usa um método legado.
 * @param {string} textToCopy - O texto a ser copiado.
 */
function copyToClipboard(textToCopy) {
    if (!textToCopy) return;

    // Verifica se a API moderna está disponível e se o contexto é seguro.
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                showToast('Copiado: ' + textToCopy, 'success');
            })
            .catch(err => {
                console.warn('Falha ao usar a API do Clipboard. Tentando método legado.', err);
                fallbackCopyToClipboard(textToCopy); // Tenta o método antigo se a API moderna falhar.
            });
    } else {
        // Se a API moderna não estiver disponível, vai direto para o método antigo.
        console.log("Contexto inseguro ou API indisponível. Usando fallback para copiar.");
        fallbackCopyToClipboard(textToCopy);
    }
}

/**
 * Método legado para copiar texto, compatível com contextos não seguros.
 * @param {string} text - O texto a ser copiado.
 */
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showToast('Copiado: ' + text, 'success');
        } else {
            showToast('Não foi possível copiar o texto.', 'error');
        }
    } catch (err) {
        console.error('Falha ao usar o método de cópia legado:', err);
        showToast('Erro ao copiar.', 'error');
    }

    document.body.removeChild(textArea);
}







// --- 06-estrutura-de-dados-para-regras-de-limpeza-por-prefixo.js ---

// =================================================================================
// ESTRUTURA DE DADOS PARA REGRAS DE LIMPEZA POR PREFIXO
// =================================================================================
const REGRAS_PREFIXO = {
    'PR': { base: 'PR', variacoes: ['-130'] },
    'PC': { base: 'PC', variacoes: ['-130'] },
    'VC': { base: 'VC', variacoes: ['-100', '-999', '-VF'] },
    'PV': { base: 'PV', variacoes: ['-VF', '-999', '-100'] },
    'FF': { base: 'FF', variacoes: ['-175'] },
    'PH': { base: 'PH', variacoes: [] }, // Apenas o prefixo base
    'KD': { base: 'KD', variacoes: ['-130', '-VF', '-999', '-100'] },
    'KC': { base: 'KC', variacoes: ['-130', '-999', '-VF', '-100'] },
    'RV': { base: 'RV', variacoes: ['-130', '-999', '-100', '-VF'] },
    'TP': { base: 'TP', variacoes: ['-350'] },
    'CL': { base: 'CL', variacoes: [] }  // Apenas o prefixo base
};




// ADICIONE ESTA FUNÇÃO AO SEU ARQUIVO 00-core.js

/**
 * Ativa o carregamento "preguiçoso" (lazy loading) para todas as imagens
 * com a classe 'lazy-image' dentro de um container específico.
 * @param {string} containerId - O ID do elemento que contém as imagens a serem observadas.
 */
function ativarLazyLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const lazyImages = container.querySelectorAll('.lazy-image');

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.getAttribute('data-src');

                    img.src = src; // Troca o placeholder pela imagem real
                    
                    img.classList.add('image-loaded'); // Efeito de fade-in (opcional)
                    img.classList.remove('lazy-image');

                    img.onerror = () => { // Fallback se a imagem real não carregar
                        img.src = '/static/images/sem-imagem.png';
                        img.onerror = null;
                    };

                    observer.unobserve(img); // Para de observar esta imagem
                }
            });
        }, { rootMargin: '200px' }); // Começa a carregar 200px antes de entrar na tela

        lazyImages.forEach(img => observer.observe(img));
    } else {
        // Fallback para navegadores antigos: carrega tudo de uma vez
        lazyImages.forEach(img => {
            img.src = img.getAttribute('data-src');
        });
    }
}



// ... (todo o código existente no 00-core.js) ...

// ============================================================================
// FUNÇÃO GLOBAL PARA OBTER URL DE IMAGEM DO CARD
// ============================================================================

/**
 * Retorna a URL completa para a imagem de um SKU, comunicando-se com o backend.
 * Esta função centraliza a lógica de busca de imagens para toda a aplicação.
 * @param {string} sku - O SKU do produto.
 * @returns {string} A URL da imagem ou de um placeholder padrão.
 */
function getCardImageUrl(sku) {
    // A URL base do seu servidor Flask.
    // O ideal é que isso seja uma constante global, mas para este exemplo, definiremos aqui.
    const API_BASE_URL = window.location.origin;

    if (!sku) {
        // Se o SKU for inválido ou nulo, retorna o caminho para a imagem padrão.
        return `${API_BASE_URL}/static/images/sem-imagem.png`;
    }

    // Constrói a URL que chama a rota /get_card_image/<sku> no backend.
    // `encodeURIComponent` garante que SKUs com caracteres especiais funcionem corretamente.
    return `${API_BASE_URL}/get_card_image/${encodeURIComponent(sku)}`;
}







// static/00-core.js

// =================================================================================
// LÓGICA COMPLETA E UNIFICADA DA SIDEBAR (MOBILE + DESKTOP)
// =================================================================================
// static/00-core.js

// =================================================================================
// LÓGICA COMPLETA E UNIFICADA DA SIDEBAR (MOBILE + DESKTOP)
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const overlay = document.getElementById('sidebar-overlay');
    const collapseIcon = document.getElementById('collapse-icon');
    const notificationPanel = document.getElementById('notification-panel');

    // Se algum elemento essencial não for encontrado, a função não é executada.
    if (!sidebar || !mainContent || !overlay || !collapseIcon || !notificationPanel) {
        console.error("Elementos da interface da sidebar não foram encontrados. A funcionalidade pode estar comprometida.");
        return;
    }

    /**
     * Abre ou fecha a sidebar em telas pequenas (mobile).
     */
    window.toggleSidebar = () => {
        sidebar.classList.toggle('-translate-x-full');
        overlay.classList.toggle('hidden');
    };

    /**
     * Recolhe ou expande a sidebar em telas grandes (desktop).
     */
    window.toggleSidebarCollapse = () => {
        const collapseText = collapseIcon.nextElementSibling;
        const allSidebarTexts = document.querySelectorAll('.sidebar-text');
        const isCurrentlyCollapsed = sidebar.classList.contains('w-24');

        // Alterna as classes de largura da sidebar
        sidebar.classList.toggle('w-72', isCurrentlyCollapsed); // Largura padrão
        sidebar.classList.toggle('w-24', !isCurrentlyCollapsed); // Largura recolhida

        // Alterna as classes de margem do conteúdo principal
        mainContent.classList.toggle('md:ml-72', isCurrentlyCollapsed); // Margem padrão
        mainContent.classList.toggle('md:ml-24', !isCurrentlyCollapsed); // Margem recolhida
        
        // Ajusta a posição do painel de notificação
        notificationPanel.classList.toggle('md:left-72', isCurrentlyCollapsed);
        notificationPanel.classList.toggle('md:left-24', !isCurrentlyCollapsed);

        // Esconde ou mostra os textos
        allSidebarTexts.forEach(text => {
            text.classList.toggle('hidden');
        });

        // Alterna o ícone
        collapseIcon.classList.toggle('fa-angle-double-left', isCurrentlyCollapsed);
        collapseIcon.classList.toggle('fa-angle-double-right', !isCurrentlyCollapsed);

        const isNowCollapsed = !isCurrentlyCollapsed;
        if (isNowCollapsed) {
            collapseText.textContent = 'Expandir';
            localStorage.setItem('sidebarCollapsed', 'true');
        } else {
            collapseText.textContent = 'Recolher Menu';
            localStorage.setItem('sidebarCollapsed', 'false');
        }
    };
    
    /**
     * Abre ou fecha o painel de notificações.
     */
    window.toggleNotificationPanel = () => {
        notificationPanel.classList.toggle('hidden');
        notificationPanel.classList.toggle('-translate-x-full');
        // Em telas mobile, o overlay também deve aparecer
        if (window.innerWidth < 768 && !notificationPanel.classList.contains('hidden')) {
            overlay.classList.remove('hidden');
        }
    };

    // Aplica o estado salvo (recolhido/expandido) ao carregar a página em desktop
    if (window.innerWidth >= 768 && localStorage.getItem('sidebarCollapsed') === 'true') {
        // Usamos um pequeno timeout para garantir que todos os elementos estejam prontos
        setTimeout(() => {
            if (window.toggleSidebarCollapse) {
                // Chama a função apenas se ela não for deixá-la no estado padrão
                if(sidebar.classList.contains('w-72')) {
                   toggleSidebarCollapse();
                }
            }
        }, 50);
    }
});





















// Arquivo: 00-core.js

// ... (mantenha o código existente) ...

/**
 * GERA UMA CHAVE DE CACHE PARA UM SKU, REPLICANDO A LÓGICA DO BACKEND.
 * Remove sufixos de variação para encontrar a imagem base.
 * Ex: "PRDA115-F" -> "prda115"
 * Ex: "PCRV029-130" -> "pcrv029"
 * @param {string} sku - O SKU original.
 * @returns {string} A chave do SKU em minúsculas para usar no cache.
 */
function getSkuBaseForCache(sku) {
    if (!sku) return '';
    
    let base = sku.split(' ')[0].split('.')[0];
    const suffixesToStrip = ['-999', '-VF', '-100', '-130', '-175', '-F', '-P', '-V', '-C'];
    
    for (const suffix of suffixesToStrip) {
        if (base.toUpperCase().endsWith(suffix)) {
            base = base.slice(0, -suffix.length);
            break; // Para de verificar assim que encontra um sufixo
        }
    }
    return base.toLowerCase();
}






// Em 00-core.js (adicione ao final do arquivo)

// =================================================================================
// OUVINTE CENTRAL DE ATUALIZAÇÕES VIA SOCKET.IO
// Este bloco é o coração da sincronização em tempo real.
// =================================================================================
if (window.socket) {
    
    /**
     * Escuta o evento 'dados_atualizados' enviado pelo servidor.
     * Este evento é um sinal genérico de que "algo mudou".
     * O payload contém o 'modulo' que foi afetado.
     */
    socket.on('dados_atualizados', async (data) => {
        console.log(`🔴 [Socket] Recebido sinal de atualização para o módulo: ${data.modulo}`);

        // Se a atualização veio de outro cliente, precisamos buscar os dados mais recentes.
        // Usamos a rota otimizada que busca apenas os dados do módulo específico.
        try {
            const response = await fetch(`/api/data?modulos=${data.modulo}`);
            if (!response.ok) {
                throw new Error(`Falha ao buscar dados atualizados para o módulo ${data.modulo}`);
            }
            const dadosAtualizados = await response.json();

            // Atualiza as variáveis globais com os novos dados
            // Ex: Se o módulo for 'conversas', a variável global 'conversas' será substituída.
            Object.keys(dadosAtualizados).forEach(key => {
                window[key] = dadosAtualizados[key];
            });

            console.log(`✅ [Socket] Dados do módulo '${data.modulo}' sincronizados.`);

            // Agora, chama a função de renderização específica para o módulo atualizado.
            // Isso garante que a UI reflita as novas informações.
            switch (data.modulo) {
                case 'conversas':
                case 'chat':
                    // Se a atualização for no chat, renderiza a lista e as mensagens (se uma conversa estiver aberta)
                    if (isSectionVisible('chat')) {
                        renderListaConversas();
                        renderMensagens();
                    }
                    updateNotificationCounter(); // Atualiza o contador de notificações sempre
                    break;
                // Adicione outros casos para outros módulos conforme necessário
                // case 'pedidos':
                //     if (isSectionVisible('pedidos')) renderPedidos();
                //     break;
            }

        } catch (error) {
            console.error('[Socket] Erro ao sincronizar dados:', error);
        }
    });

    /**
     * Escuta o evento específico 'nova_mensagem'.
     * Este evento carrega o payload completo da nova mensagem.
     */
    socket.on('nova_mensagem', (message) => {
        console.log('📩 [Socket] Nova mensagem recebida:', message);

        // Remove a mensagem temporária (se existir) e adiciona a mensagem real com o ID do banco
        const tempId = `temp-${message.timestamp}`; // Recria um ID temporário para comparação
        const index = conversas.findIndex(m => m.id.startsWith('temp-') && m.timestamp === message.timestamp);
        if (index !== -1) {
            conversas.splice(index, 1); // Remove a mensagem temporária
        }
        
        // Adiciona a nova mensagem (real) ao array global, se ela já não existir
        if (!conversas.some(m => m.id === message.id)) {
            conversas.push(message);
        }

        // Se a conversa da mensagem recebida for a que está aberta na tela...
        if (message.conversaId === conversaAtivaId && isSectionVisible('chat')) {
            // ...apenas re-renderiza as mensagens para exibir a nova.
            renderMensagens();
            // E marca como lida imediatamente
            marcarMensagensComoLidasNaConversaAtiva();
        } else {
            // Se for de outra conversa, apenas atualiza a lista para mostrar o indicador de "não lida"
            if (isSectionVisible('chat')) {
                renderListaConversas();
            }
        }
        
        // Atualiza o contador de notificações no ícone de sino
        updateNotificationCounter();
        showToast(`Nova mensagem de ${message.remetente}`, 'info');
    });
}

/**
 * Função auxiliar para verificar se uma seção está visível.
 * @param {string} sectionId - O ID da seção (ex: 'chat', 'pedidos').
 * @returns {boolean}
 */
function isSectionVisible(sectionId) {
    const sectionElement = document.getElementById(sectionId);
    return sectionElement && !sectionElement.classList.contains('hidden');
}






// --- 08-funções-de-utilidade-dados-e-logs.js ---

// =================================================================================
// FUNÇÕES DE UTILIDADE (DADOS E LOGS)
// =================================================================================

function loadData() {
    // Esta função não é mais necessária, pois os dados são carregados do servidor.
}

