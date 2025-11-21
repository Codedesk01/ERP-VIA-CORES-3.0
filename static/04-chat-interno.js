// ================================================================================
// 04 CHAT INTERNO
// ================================================================================


// --- 09-módulo-de-notificações.js ---

// =================================================================================
// MÓDULO DE NOTIFICAÇÕES
// =================================================================================

let anexoNotificacao = null; // Guarda o anexo temporariamente

/**
 * Prepara o painel de envio de notificações no dashboard do admin.
 */
function setupNotificationSender() {
    // Verifica se o usuário tem permissão para enviar
    if (!hasPermission('notificacoes', 'enviar')) return;

    const destinatarioSelect = document.getElementById('notification-destinatario');
    if (!destinatarioSelect) return;

    destinatarioSelect.innerHTML = '<option value="todos">Todos os Usuários</option>';
    users.forEach(user => {
        // Não permite enviar para si mesmo
        if (user.username !== currentUser.username) {
            destinatarioSelect.innerHTML += `<option value="${user.username}">${user.username}</option>`;
        }
    });
}

// script.js

// script.js

/**
 * Lida com a seleção de um arquivo para anexo na notificação do DASHBOARD.
 * VERSÃO CORRIGIDA: Verifica se os elementos existem antes de usá-los.
 * @param {Event} event - O evento do input de arquivo.
 */
function handleDashboardAttachment(event) {
    const file = event.target.files[0];
    
    // Pega os elementos do painel de notificação do dashboard
    const labelEl = document.getElementById('notification-anexo-label');
    const previewContainer = document.getElementById('notification-anexo-preview');

    // *** CORREÇÃO PRINCIPAL APLICADA AQUI ***
    // Se os elementos não existem na tela atual, a função para silenciosamente.
    if (!labelEl || !previewContainer) {
        // Isso evita o erro quando a função é chamada em uma página que não seja o Dashboard.
        return; 
    }

    if (!file) {
        anexoNotificacao = null;
        labelEl.innerText = 'Nenhum arquivo selecionado.';
        previewContainer.innerHTML = '<p>Nenhum anexo.</p>';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        anexoNotificacao = {
            nome: file.name,
            tipo: file.type,
            conteudo: e.target.result // Conteúdo em Base64
        };
        labelEl.innerText = file.name;
        
        // Exibe a pré-visualização
        if (file.type.startsWith('image/')) {
            previewContainer.innerHTML = `<img src="${e.target.result}" alt="Preview" class="max-h-40 rounded-lg mx-auto">`;
        } else {
            previewContainer.innerHTML = `<div class="text-center p-4 bg-gray-100 rounded-lg"><i class="fas fa-file-alt text-4xl text-gray-400"></i><p class="mt-2 text-sm font-semibold">${file.name}</p></div>`;
        }
    };
    reader.readAsDataURL(file);
}


/**
 * Envia a notificação para o(s) destinatário(s) selecionado(s).
 */
function enviarNotificacao() {
    if (!hasPermission('notificacoes', 'enviar')) {
        showToast('Você não tem permissão para enviar notificações.', 'error');
        return;
    }

    const destinatario = document.getElementById('notification-destinatario').value;
    const mensagem = document.getElementById('notification-mensagem').value.trim();

    if (!mensagem && !anexoNotificacao) {
        showToast('A notificação precisa ter uma mensagem ou um anexo.', 'error');
        return;
    }

    const novaNotificacao = {
        id: `notif-${Date.now()}`,
        remetente: currentUser.username,
        destinatario: destinatario, // 'todos' ou um username específico
        mensagem: mensagem,
        anexo: anexoNotificacao,
        timestamp: new Date().toISOString(),
        lidaPor: [] // Array para rastrear quem leu
    };

    notificacoes.unshift(novaNotificacao);
    saveData();

    showToast('Notificação enviada com sucesso!', 'success');
    logAction(`Notificação enviada para: ${destinatario}`);

    // Limpa o formulário
    document.getElementById('notification-mensagem').value = '';
    document.getElementById('notification-anexo-label').innerText = 'Nenhum arquivo selecionado.';
    document.getElementById('notification-anexo-preview').innerHTML = '<p>Nenhum anexo.</p>';
    document.getElementById('notification-anexo-input').value = '';
    anexoNotificacao = null;
}


// SUBSTITUA a função toggleNotificationPanel() inteira por esta:
function toggleNotificationPanel() {
    // Agora, clicar no sino simplesmente leva para a seção de chat
    showSection('chat');
    loadDynamicData('chat');
}


/**
 * Renderiza o conteúdo do painel de notificações para o usuário logado.
 */
function renderNotificationPanel() {
    const listContainer = document.getElementById('notification-list');
    
    const minhasNotificacoes = notificacoes.filter(n => 
        n.destinatario === 'todos' || n.destinatario === currentUser.username
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Ordena da mais nova para a mais antiga

    if (minhasNotificacoes.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 p-8">Nenhuma notificação para você.</p>';
        return;
    }

    listContainer.innerHTML = minhasNotificacoes.map(n => {
        const isLida = n.lidaPor.includes(currentUser.username);
        const anexoHtml = n.anexo ? `
            <div class="mt-3 pt-3 border-t">
                <a href="${n.anexo.conteudo}" download="${n.anexo.nome}" class="text-indigo-600 hover:underline text-sm flex items-center gap-2">
                    <i class="fas fa-download"></i> Baixar anexo: ${n.anexo.nome}
                </a>
            </div>` : '';

        return `
            <div class="notification-item p-4 rounded-lg ${isLida ? 'bg-gray-100' : 'bg-blue-50 border-l-4 border-blue-500'}">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-sm font-bold text-gray-800">${n.remetente}</p>
                        <p class="text-xs text-gray-500">${new Date(n.timestamp).toLocaleString('pt-BR')}</p>
                    </div>
                    ${!isLida ? `<button onclick="marcarComoLida('${n.id}')" class="text-blue-500 hover:text-blue-700 text-xs font-semibold">Marcar como lida</button>` : ''}
                </div>
                <p class="text-sm text-gray-700 mt-2 whitespace-pre-wrap">${n.mensagem}</p>
                ${anexoHtml}
            </div>
        `;
    }).join('');
}

/**
 * Marca uma notificação específica como lida.
 * @param {string} notifId - O ID da notificação.
 */
function marcarComoLida(notifId) {
    const notificacao = notificacoes.find(n => n.id === notifId);
    if (notificacao && !notificacao.lidaPor.includes(currentUser.username)) {
        notificacao.lidaPor.push(currentUser.username);
        saveData();
        updateNotificationCounter();
        renderNotificationPanel(); // Re-renderiza para remover o botão "marcar como lida"
    }
}

/**
 * Marca todas as notificações visíveis como lidas.
 */
function marcarTodasComoLidas() {
    notificacoes.forEach(n => {
        if ((n.destinatario === 'todos' || n.destinatario === currentUser.username) && !n.lidaPor.includes(currentUser.username)) {
            n.lidaPor.push(currentUser.username);
        }
    });
    saveData();
    updateNotificationCounter();
    renderNotificationPanel();
    showToast('Todas as notificações foram marcadas como lidas.', 'info');
}

// ATUALIZE a função updateNotificationCounter() para usar a nova estrutura de 'conversas'
function updateNotificationCounter() {
    const counter = document.getElementById('notification-counter');
    if (!counter) return;

    // CORREÇÃO: A contagem deve considerar mensagens onde o destinatário é o usuário atual 
    // e que ainda não foram lidas por ele.
    const naoLidas = conversas.filter(c =>
        (c.destinatario === currentUser.username || c.conversaId.startsWith('grupo-')) &&
        !c.lidaPor.includes(currentUser.username)
    ).length;

    if (naoLidas > 0) {
        counter.innerText = naoLidas > 9 ? '9+' : naoLidas;
        counter.classList.remove('hidden');
    } else {
        counter.classList.add('hidden');
    }
}







// script.js


// --- 42-módulo-de-chat-interno-versão-30-com-gerenciamento-de-grupo-e-drag-and-drop.js ---

// =================================================================================
// MÓDULO DE CHAT INTERNO - VERSÃO 3.0 (COM GERENCIAMENTO DE GRUPO E DRAG-AND-DROP)
// =================================================================================

let conversaAtivaId = null;
let onlineUsers = {};
let grupoParaGerenciar = null;
let anexoParaEnviar = null;

// --- CONFIGURAÇÃO DO SOCKET.IO ---
// CORREÇÃO 1: Evita o erro "has already been declared" ao usar a atribuição direta
// assumindo que 'socket' é uma variável global declarada em outro lugar.
window.socket = io('http://localhost:5000');

socket.on('connect', () => {
    console.log('Conectado ao servidor Socket.IO');
    // Emite o evento 'join' para que o servidor saiba quem está online
    socket.emit('join', { username: currentUser.username });
});

socket.on('nova_mensagem', (message) => {
    console.log('📩 Nova mensagem recebida:', message);

    // ✅ Corrigido: só ignora se a mensagem veio do próprio usuário *e*
    // a conversa ativa é a mesma (evita esconder do destinatário)
    if (message.remetente === currentUser.username && message.conversaId === conversaAtivaId) return;

    // ✅ Garante que o anexo exista corretamente (objeto válido)
    if (message.anexo && typeof message.anexo === 'string') {
        try {
            message.anexo = JSON.parse(message.anexo);
        } catch (e) {
            console.warn('Anexo não é JSON válido:', e);
        }
    }

    // 🔄 Adiciona a mensagem apenas se ainda não existe
    if (!conversas.some(m => m.id === message.id)) {
        conversas.push(message);
    }

    // 💬 Atualiza o chat se estiver na conversa ativa
    if (message.conversaId === conversaAtivaId) {
        renderMensagens();

        const chatContainer = document.querySelector('#chat-corpo-mensagens');
        if (chatContainer) {
            setTimeout(() => {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }, 100);
        }
    } else {
        // Se for outra conversa, atualiza os contadores
        updateNotificationCounter();
        atualizarIndicadorConversa(message.conversaId);
    }
});







// ADICIONANDO FUNÇÃO loadChat FALTANTE
// CORREÇÃO 2: Garante que a função loadChat seja visível globalmente
// Em 04-chat-interno.js

async function loadChat() {
    if (!hasPermission('chat', 'visualizar')) return;

    // *** AQUI ESTÁ A SEGUNDA PARTE DA CORREÇÃO ***
    // Antes de qualquer outra coisa, tenta restaurar a conversa ativa do localStorage.
    const idSalvo = localStorage.getItem('conversaAtivaSalva');
    if (idSalvo) {
        conversaAtivaId = idSalvo;
        console.log(`Conversa ativa restaurada do localStorage: ${conversaAtivaId}`);
    }

    // Garante que os dados de conversas estejam carregados
    // (Esta parte pode ser otimizada se você já carrega no login)
    if (conversas.length === 0) {
        await loadFromServer('conversas'); // Busca apenas as conversas
    }
    
    checkOnlineStatus();
    renderListaConversas();
    
    // Agora, a verificação abaixo funcionará, pois `conversaAtivaId` foi restaurado.
    if (conversaAtivaId) {
        // Encontra o nome do outro usuário para passar para a função abrirConversa
        let nomeOutroUsuario = null;
        if (!conversaAtivaId.startsWith('grupo-')) {
            const parts = conversaAtivaId.split('-');
            nomeOutroUsuario = parts[0] === currentUser.username ? parts[1] : parts[0];
        }
        abrirConversa(conversaAtivaId, nomeOutroUsuario);
    } else {
        // Se nenhuma conversa estava salva, mostra a tela vazia.
        document.getElementById('janela-chat-vazia').style.display = 'flex';
        document.getElementById('janela-chat-ativa').style.display = 'none';
    }
    
    // Adiciona o listener de teclado
    const chatInput = document.getElementById('chat-input-mensagem');
    chatInput.removeEventListener('keydown', handleChatInputKey);
    chatInput.addEventListener('keydown', handleChatInputKey);

    applyPermissionsToUI();
}


// Simula a atividade do usuário para o status "online"
function updateUserActivity() {
    if (currentUser) {
        localStorage.setItem(`activity_${currentUser.username}`, new Date().toISOString());
    }
}

// Verifica a atividade de outros usuários
function checkOnlineStatus() {
    onlineUsers = {};
    users.forEach(user => {
        const lastActivity = localStorage.getItem(`activity_${user.username}`);
        if (lastActivity) {
            const diff = new Date() - new Date(lastActivity);
            if (diff < 30000) { // Online nos últimos 30 segundos
                onlineUsers[user.username] = 'online';
            }
        }
    });
    if (document.getElementById('chat') && !document.getElementById('chat').classList.contains('hidden')) {
        renderListaConversas();
        if (conversaAtivaId && !conversaAtivaId.startsWith('grupo-')) {
            const outroUsuario = conversaAtivaId.replace(currentUser.username, '').replace('-', '');
            const statusEl = document.getElementById('chat-header-status');
            statusEl.innerText = onlineUsers[outroUsuario] ? 'Online' : 'Offline';
            statusEl.className = `text-xs font-semibold ${onlineUsers[outroUsuario] ? 'text-green-600' : 'text-gray-500'}`;
        }
    }
}

setInterval(updateUserActivity, 10000);
setInterval(checkOnlineStatus, 5000);

// CORREÇÃO 2: Garante que a função loadChat seja visível globalmente
window.loadChat = async function () {
    if (!hasPermission('chat', 'visualizar')) return;
    
    // CORREÇÃO: Garante que os dados de conversas estejam carregados na inicialização
    if (conversas.length === 0) {
        await loadFromServer();
    }
    
    checkOnlineStatus();
    renderListaConversas();
    
    if (conversaAtivaId) {
        abrirConversa(conversaAtivaId);
    } else {
        document.getElementById('janela-chat-vazia').style.display = 'flex';
        document.getElementById('janela-chat-ativa').style.display = 'none';
    }
    
    const chatInput = document.getElementById('chat-input-mensagem');
    chatInput.removeEventListener('keydown', handleChatInputKey);
    chatInput.addEventListener('keydown', handleChatInputKey);

    applyPermissionsToUI();
}

function handleChatInputKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        enviarMensagemChat();
    }
}

function renderListaConversas() {
    const container = document.getElementById('lista-conversas');
    container.innerHTML = '';

    const grupos = users.filter(u => u.isGroup && u.members.includes(currentUser.username));
    grupos.forEach(grupo => {
        const ultimaMsg = conversas.filter(c => c.conversaId === grupo.username).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        const naoLidas = conversas.filter(c => c.conversaId === grupo.username && !c.lidaPor.includes(currentUser.username)).length;
        container.innerHTML += `
            <div onclick="abrirConversa('${grupo.username}')" class="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-100 ${conversaAtivaId === grupo.username ? 'bg-indigo-50' : ''}">
                <div class="w-12 h-12 bg-gray-500 text-white rounded-full flex items-center justify-center font-bold text-xl"><i class="fas fa-users"></i></div>
                <div class="flex-grow overflow-hidden">
                    <p class="font-bold text-gray-800">${grupo.groupName}</p>
                    <p class="text-xs text-gray-500 truncate">${ultimaMsg ? `${ultimaMsg.remetente}: ${ultimaMsg.texto || 'Mídia'}` : 'Nenhuma mensagem.'}</p>
                </div>
                ${naoLidas > 0 ? `<span class="bg-red-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">${naoLidas}</span>` : ''}
            </div>
        `;
    });

    users.forEach(user => {
        if (user.isGroup || user.username === currentUser.username) return;
        const conversaId = [currentUser.username, user.username].sort().join('-');
        const mensagensDaConversa = conversas.filter(c => c.conversaId === conversaId);
        const ultimaMsg = mensagensDaConversa.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        // CORREÇÃO: A contagem de não lidas deve considerar mensagens onde o destinatário é o usuário atual OU a conversa é um grupo.
        const naoLidas = mensagensDaConversa.filter(c => (c.destinatario === currentUser.username || c.conversaId.startsWith('grupo-')) && !c.lidaPor.includes(currentUser.username)).length;
        const isOnline = onlineUsers[user.username] === 'online';
        container.innerHTML += `
            <div onclick="abrirConversa('${conversaId}', '${user.username}')" class="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-100 ${conversaAtivaId === conversaId ? 'bg-indigo-50' : ''}">
                <div class="relative w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xl">
                    ${user.username.charAt(0).toUpperCase()}
                    ${isOnline ? '<span class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>' : ''}
                </div>
                <div class="flex-grow overflow-hidden">
                    <p class="font-bold text-gray-800">${user.username}</p>
                    <p class="text-xs text-gray-500 truncate">${ultimaMsg ? (ultimaMsg.remetente === currentUser.username ? 'Você: ' : '') + (ultimaMsg.texto || 'Mídia') : 'Nenhuma mensagem.'}</p>
                </div>
                ${naoLidas > 0 ? `<span class="bg-red-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">${naoLidas}</span>` : ''}
            </div>
        `;
    });
}

// Arquivo: 04-chat-interno.js
// SUBSTITUA a função abrirConversa inteira por esta:

async function marcarMensagensComoLidasNaConversaAtiva() {
    if (!conversaAtivaId) return;

    const mensagensDaConversa = conversas.filter(c => c.conversaId === conversaAtivaId);

    const idsMensagensNaoLidas = [];
    mensagensDaConversa.forEach(msg => {
        // Marca como lida se for para o usuário atual OU se for em um grupo
        if ((msg.destinatario === currentUser.username || msg.conversaId.startsWith('grupo-')) && !msg.lidaPor.includes(currentUser.username)) {
            idsMensagensNaoLidas.push(msg.id);
            // Atualiza o estado localmente para que a próxima renderização reflita a mudança
            msg.lidaPor.push(currentUser.username); 
        }
    });

    if (idsMensagensNaoLidas.length > 0) {
        try {
            await fetch('/api/chat/mark_as_read', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Socket-ID': socket.id // ADICIONA O ID DO SOCKET NO CABEÇALHO
                },
                body: JSON.stringify({ messageIds: idsMensagensNaoLidas, username: currentUser.username })
            });
        } catch (error) {
            console.error('Erro ao marcar mensagens como lidas:', error);
        }
    }
    
    updateNotificationCounter();
    renderListaConversas(); // Atualiza a lista para remover o contador de não lidas
}


// Em 04-chat-interno.js

// Em 04-chat-interno.js

async function abrirConversa(conversaId, outroUsuario) {
    conversaAtivaId = conversaId;
    localStorage.setItem('conversaAtivaSalva', conversaId);

    document.getElementById('janela-chat-vazia').style.display = 'none';
    document.getElementById('janela-chat-ativa').style.display = 'flex';

    const nomeEl = document.getElementById('chat-header-nome');
    const avatarEl = document.getElementById('chat-header-avatar');
    const statusEl = document.getElementById('chat-header-status');

    nomeEl.innerText = outroUsuario || conversaId;
    avatarEl.innerText = (outroUsuario ? outroUsuario[0] : conversaId[0]).toUpperCase();

    // Limpa o corpo do chat antes de renderizar
    const corpo = document.getElementById('chat-corpo-mensagens');
    corpo.innerHTML = '<p class="text-center text-gray-400 mt-6">Carregando mensagens...</p>';

    try {
        const response = await fetch(`/api/chat/mensagens/${conversaId}`);
        const mensagens = await response.json();

        if (Array.isArray(mensagens)) {
            // Atualiza o array global
            conversas = conversas.filter(c => c.conversaId !== conversaId).concat(mensagens);
            renderMensagens();
        } else {
            corpo.innerHTML = '<p class="text-center text-gray-400 mt-6">Nenhuma mensagem encontrada.</p>';
        }

        // Marca as mensagens como lidas localmente
        marcarMensagensComoLidas(conversaId);

    } catch (err) {
        console.error('Erro ao carregar mensagens:', err);
        corpo.innerHTML = '<p class="text-center text-red-500 mt-6">Erro ao carregar mensagens.</p>';
    }
}




// ---------------------------------------------
// Marca mensagens como lidas (cliente)
// ---------------------------------------------
async function marcarMensagensComoLidas(conversaId) {
    if (!conversaId || !currentUser || !currentUser.username) return;

    try {
        // Atualiza localmente primeiro (UX mais rápido)
        let atualizouLocal = false;
        conversas.forEach(msg => {
            if (msg.conversaId === conversaId) {
                if (!msg.lidaPor) msg.lidaPor = [];
                if (!msg.lidaPor.includes(currentUser.username)) {
                    msg.lidaPor.push(currentUser.username);
                    atualizouLocal = true;
                }
            }
        });
        if (atualizouLocal) {
            // Atualiza a UI de mensagens e contador
            renderMensagens();
            updateNotificationCounter();
        }

        // Envia requisição ao servidor para persistir a leitura
        await fetch('/api/chat/marcar_lidas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversaId: conversaId,
                username: currentUser.username
            })
        });
        // Não precisamos aguardar resposta para UX, mas erros serão logados no catch
    } catch (err) {
        console.error('Erro marcando mensagens como lidas:', err);
    }
}

// ---------------------------------------------
// Recebe notificação do servidor quando outro usuário marcou mensagens como lidas
// Atualiza o array 'conversas' para refletir isso.
// ---------------------------------------------
socket.on('mensagens_lidas', (payload) => {
    // payload: { conversaId, username }
    if (!payload || !payload.conversaId) return;
    const { conversaId, username } = payload;

    let mudou = false;
    conversas.forEach(msg => {
        if (msg.conversaId === conversaId) {
            if (!msg.lidaPor) msg.lidaPor = [];
            if (!msg.lidaPor.includes(username)) {
                msg.lidaPor.push(username);
                mudou = true;
            }
        }
    });

    if (mudou) {
        // Atualiza contador e se estiver na conversa aberta, re-renderiza
        updateNotificationCounter();
        if (conversaAtivaId === conversaId) renderMensagens();
    }
});







// Em 04-chat-interno.js

async function enviarMensagemChat() {
    const input = document.getElementById('chat-input-mensagem');
    const texto = input.value.trim();
    if (!texto && !anexoParaEnviar) return;

    if (!currentUser || !currentUser.username) {
        console.error('Usuário atual não definido!');
        return;
    }

    const payload = {
    conversaId: conversaAtivaId,
    remetente: currentUser.username,
    destinatario: getDestinatarioDaConversa(conversaAtivaId),
    mensagem: texto,
    anexo: anexoParaEnviar ? anexoParaEnviar : null
};


    try {
        const res = await fetch('/api/chat/enviar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (result.status === 'ok') {
            // Adiciona localmente
            conversas.push(result.mensagem);
            renderMensagens();
            input.value = '';
            anexoParaEnviar = null;

            const corpo = document.getElementById('chat-corpo-mensagens');
            corpo.scrollTop = corpo.scrollHeight;
        } else {
            showToast('Erro ao enviar mensagem.', 'error');
        }
    } catch (err) {
        console.error('Erro ao enviar mensagem:', err);
    }
}


// Função auxiliar para extrair o destinatário de uma conversa privada
function getDestinatarioDaConversa(conversaId) {
    if (!conversaId || conversaId.startsWith('grupo-')) return conversaId;
    const partes = conversaId.split('-');
    return partes[0] === currentUser.username ? partes[1] : partes[0];
}




function renderMensagens() {
    const corpo = document.getElementById('chat-corpo-mensagens');
    const mensagens = conversas
        .filter(m => m.conversaId === conversaAtivaId)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    corpo.innerHTML = mensagens.map(msg => {
        const isMine = msg.remetente === currentUser.username;
        let anexoHtml = '';

        if (msg.anexo && msg.anexo.conteudo) {
            const url = msg.anexo.conteudo;
            const nome = msg.anexo.nome || 'arquivo';
            const tipo = msg.anexo.tipo || '';

            if (tipo.startsWith('image/')) {
                anexoHtml = `<img src="${url}" class="max-w-xs rounded-lg mt-2 cursor-pointer" onclick="abrirImagem('${url}')">`;
            } else {
                anexoHtml = `<a href="${url}" target="_blank" class="flex items-center gap-2 mt-2 text-indigo-600 hover:underline">
                    <i class="fas fa-paperclip"></i> ${nome}
                </a>`;
            }
        }

        return `
            <div class="flex ${isMine ? 'justify-end' : 'justify-start'} mb-3">
                <div class="max-w-[70%] p-3 rounded-2xl shadow-sm ${isMine ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-800'}">
                    ${msg.mensagem ? `<p class="whitespace-pre-wrap">${msg.mensagem}</p>` : ''}
                    ${anexoHtml}
                    <p class="text-xs mt-1 opacity-70">${new Date(msg.timestamp).toLocaleTimeString('pt-BR')}</p>
                </div>
            </div>
        `;
    }).join('');

    scrollToBottom();
}

function abrirImagem(src) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50';
    modal.innerHTML = `<img src="${src}" class="max-w-full max-h-full">`;
    modal.onclick = () => modal.remove();
    document.body.appendChild(modal);
}

function scrollToBottom() {
    const corpo = document.getElementById('chat-corpo-mensagens');
    if (corpo) corpo.scrollTop = corpo.scrollHeight;
}











/**
 * Processa o arquivo, gera a pré-visualização e exibe o modal.
 * @param {File} file - O arquivo a ser processado.
 */
function processarArquivoParaAnexo(file) {
    if (!file || !conversaAtivaId) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        // Guarda os dados do arquivo em uma variável global temporária
        anexoParaEnviar = { 
            nome: file.name, 
            tipo: file.type, 
            conteudo: e.target.result 
        };

        const previewContainer = document.getElementById('anexo-preview-container');
        
        // Mostra a imagem, vídeo ou um ícone genérico
        if (file.type.startsWith('image/')) {
            previewContainer.innerHTML = `<img src="${e.target.result}" alt="Preview" class="max-h-full max-w-full object-contain rounded-lg">`;
        } else if (file.type.startsWith('video/')) {
            previewContainer.innerHTML = `<video src="${e.target.result}" controls class="max-h-full max-w-full rounded-lg"></video>`;
        } else {
            previewContainer.innerHTML = `
                <div class="text-center p-8 text-white">
                    <i class="fas fa-file-alt text-6xl text-gray-400"></i>
                    <p class="mt-4 text-lg font-semibold">${file.name}</p>
                </div>`;
        }

        // Abre o modal
        document.getElementById('anexo-preview-modal').classList.remove('hidden');
        document.getElementById('anexo-legenda-input').focus();
    };
    reader.readAsDataURL(file);
}


async function enviarAnexoChat(event) {
    if (!hasPermission('chat', 'enviar')) return;
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const anexo = {
            nome: file.name,
            tipo: file.type,
            conteudo: e.target.result  // base64 completo: 'data:image/...;base64,...'
        };

        const payload = {
            conversaId: conversaAtivaId,
            remetente: currentUser.username,
            destinatario: getDestinatarioDaConversa(conversaAtivaId),
            mensagem: document.getElementById('chat-input-mensagem').value.trim(),
            anexo: anexo
        };

        try {
            const res = await fetch('/api/chat/enviar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await res.json();
            if (result.status === 'ok') {
                conversas.push(result.mensagem);
                renderMensagens();
                document.getElementById('chat-input-mensagem').value = '';
                scrollToBottom();
            } else {
                showToast('Erro ao enviar anexo.', 'error');
            }
        } catch (err) {
            console.error('Erro ao enviar:', err);
            showToast('Falha ao enviar anexo.', 'error');
        }
    };
    reader.readAsDataURL(file);

    event.target.value = ''; // Limpa input
}


/**
 * Fecha o modal de pré-visualização e limpa os dados temporários.
 */
function cancelarEnvioAnexo() {
    document.getElementById('anexo-preview-modal').classList.add('hidden');
    document.getElementById('anexo-legenda-input').value = ''; // Limpa a legenda
    anexoParaEnviar = null; // Limpa o anexo temporário
}


async function confirmarEnvioAnexo() {
    if (!anexoTemporario) return;

    const formData = new FormData();
    formData.append('file', anexoTemporario);
    formData.append('conversaId', conversaAtivaId);

    const res = await fetch('/api/chat/upload', { method: 'POST', body: formData });
    const result = await res.json();
    if (result.status !== 'ok') return showToast('Erro no upload', 'error');

    const anexo = result.file;
    const legenda = document.getElementById('anexo-legenda-input').value.trim();

    // Envia mensagem com URL
    const payload = {
        conversaId: conversaAtivaId,
        remetente: currentUser.username,
        destinatario: getDestinatarioDaConversa(conversaAtivaId),
        mensagem: legenda,
        anexo: anexo
    };

    const msgRes = await fetch('/api/chat/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const msgResult = await msgRes.json();

    if (msgResult.status === 'ok') {
        conversas.push(msgResult.mensagem);
        renderMensagens();
        scrollToBottom();
    }

    cancelarEnvioAnexo();
}

function abrirModalCriarGrupo() {
    const modal = document.getElementById('criar-grupo-modal');
    const listaMembros = document.getElementById('lista-membros-grupo');
    listaMembros.innerHTML = '';
    users.forEach(user => {
        if (!user.isGroup && user.username !== currentUser.username) {
            listaMembros.innerHTML += `<label class="flex items-center p-2 rounded-md hover:bg-gray-100"><input type="checkbox" value="${user.username}" class="h-4 w-4 mr-3"><span>${user.username}</span></label>`;
        }
    });
    modal.classList.remove('hidden');
}

function fecharModalCriarGrupo() {
    document.getElementById('criar-grupo-modal').classList.add('hidden');
}

function criarGrupoChat() {
    const nomeGrupo = document.getElementById('nome-grupo-input').value.trim();
    if (!nomeGrupo) {
        showToast('O nome do grupo é obrigatório.', 'error');
        return;
    }
    const membrosSelecionados = Array.from(document.querySelectorAll('#lista-membros-grupo input:checked')).map(chk => chk.value);
    if (membrosSelecionados.length < 1) {
        showToast('Selecione pelo menos um membro para o grupo.', 'error');
        return;
    }
    membrosSelecionados.push(currentUser.username);
    const novoGrupo = {
        username: `grupo-${Date.now()}`, isGroup: true, groupName: nomeGrupo,
        members: [...new Set(membrosSelecionados)], createdBy: currentUser.username
    };
    users.push(novoGrupo);
    saveData();
    showToast(`Grupo "${nomeGrupo}" criado com sucesso!`, 'success');
    fecharModalCriarGrupo();
    renderListaConversas();
}



// script.js
