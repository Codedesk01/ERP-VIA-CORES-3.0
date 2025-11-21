// ================================================================================
// 02 GESTAO USUARIOS
// ================================================================================


// --- 17-gestão-de-usuários-versão-com-admin-de-setor.js ---

// =================================================================================
// GESTÃO DE USUÁRIOS (VERSÃO COM ADMIN DE SETOR)
// =================================================================================

function loadUserManagement() {
    if (!hasPermission('userManagement', 'visualizar')) return;
    
    loadUsersTable();
    populateUserPermissionSelector();
    loadPermissionModules();
    
    // Pega o container onde o botão deve ser inserido
    const permissionsDiv = document.querySelector('div[data-permission="userManagement:editar"]');
    
    // Remove o botão antigo, se existir, para evitar duplicação
    const oldBtn = document.getElementById('btn-atribuir-grupos');
    if (oldBtn) {
        oldBtn.remove();
    }

    // Verifica se o usuário tem a permissão específica para atribuir grupos
    if (permissionsDiv && hasPermission('costura', 'atribuirGrupos')) {
        const selectUser = permissionsDiv.querySelector('#perm-user');
        // Insere o botão antes do seletor de usuário
        selectUser.insertAdjacentHTML('beforebegin', `
            <button id="btn-atribuir-grupos" onclick="abrirModalAtribuirGrupos()" class="mb-6 bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-700">
                <i class="fas fa-tasks mr-2"></i>Atribuir Grupos de Costura
            </button>
        `);
    }
    
    applyPermissionsToUI();
}






/**
 * Cria um novo usuário, agora com validações para o papel 'admin-setor' e inicialização correta.
 */
async function createUser() {
    if (!hasPermission('userManagement', 'criar')) {
        showToast('Você não tem permissão para criar usuários.', 'error');
        return;
    }
    const username = document.getElementById('new-user').value.trim();
    const password = document.getElementById('new-pass').value.trim();
    const role = document.getElementById('new-role').value;

    if (!username || !password || password.length < 6) {
        showToast('Usuário e senha (mínimo 6 caracteres) são obrigatórios.', 'error');
        return;
    }
    if (users.find(u => u.username === username)) {
        showToast('Este nome de usuário já existe.', 'error');
        return;
    }

    // Adiciona o novo usuário ao array com todas as propriedades necessárias inicializadas
    users.push({
        username,
        password,
        role,
        setor: null, // O setor será definido pelo Admin de Setor posteriormente.
        permissions: JSON.parse(JSON.stringify(defaultPermissions)),
        gruposCostura: [] // <-- ESTA É A CORREÇÃO PRINCIPAL!
    });

    await saveData();
    loadUserManagement(); // Recarrega a seção para refletir as mudanças
logAction({
    acao: 'Novo usuário criado',
    modulo: 'Usuários',
    funcao: 'createUser',
    detalhes: { novo_usuario: username, role: role }
});
    showToast(`Usuário ${username} criado com sucesso!`, 'success');
    
    // Limpa os campos do formulário
    document.getElementById('new-user').value = '';
    document.getElementById('new-pass').value = '';
}

function loadUsersTable() {
    const table = document.getElementById('users-table').querySelector('tbody');
    table.innerHTML = '';

    let usuariosVisiveis = [];
    if (currentUser.role === 'admin-master') {
        usuariosVisiveis = users;
    } else if (currentUser.role === 'admin-setor') {
        usuariosVisiveis = users.filter(u => u.setor === currentUser.setor || !u.setor);
    }

    usuariosVisiveis.forEach(user => {
        const roleColors = {
            'admin-master': 'bg-red-100 text-red-800',
            'admin-setor': 'bg-blue-100 text-blue-800',
            'user': 'bg-green-100 text-green-800'
        };

        let deleteButton = '';
        const canDelete = (currentUser.role === 'admin-master' && user.username !== currentUser.username) ||
                          (currentUser.role === 'admin-setor' && user.setor === currentUser.setor && user.role !== 'admin-master' && user.username !== currentUser.username);

        if (canDelete && hasPermission('userManagement', 'excluir')) {
            deleteButton = `<button onclick="deleteUser('${user.username}')" class="text-red-600 hover:text-red-800" title="Excluir"><i class="fas fa-trash"></i></button>`;
        }

        table.innerHTML += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="p-4 font-medium text-gray-900">${user.username}</td>
                <td class="p-4">
                    <span class="px-3 py-1 rounded-full text-xs font-semibold ${roleColors[user.role] || 'bg-gray-100 text-gray-800'}">
                        ${user.role}
                    </span>
                </td>
                <td class="p-4">${deleteButton}</td>
            </tr>
        `;
    });
}


/**
 * Exclui um usuário, usando o username como identificador único e seguro.
 */
async function deleteUser(username) {
    const userToDelete = users.find(u => u.username === username);
    if (!userToDelete) return;

    // Validações de permissão para deletar, espelhando a lógica de exibição do botão
    if (!hasPermission('userManagement', 'excluir')) {
        showToast('Você não tem permissão para excluir usuários.', 'error');
        return;
    }
    if (userToDelete.username === currentUser.username) {
        showToast('Você não pode excluir seu próprio usuário.', 'error');
        return;
    }
    if (currentUser.role === 'admin-setor' && userToDelete.setor !== currentUser.setor) {
        showToast('Você só pode excluir usuários do seu próprio setor.', 'error');
        return;
    }
    if (userToDelete.role === 'admin-master') {
        showToast('Não é possível excluir um usuário Admin Master.', 'error');
        return;
    }

    if (confirm(`Tem certeza que deseja excluir o usuário ${username}?`)) {
        users = users.filter(u => u.username !== username);
        await saveData();
        loadUserManagement();
        await logAction(`Usuário excluído: ${username}`);
        showToast(`Usuário ${username} excluído.`, 'success');
    }
}

/**
 * Popula o dropdown de seleção de usuário para edição de permissões,
 * mostrando apenas os usuários que o admin logado pode gerenciar.
 */

function populateUserPermissionSelector() {
    const permUserSelect = document.getElementById('perm-user');
    permUserSelect.innerHTML = '<option value="">Selecione um usuário para editar permissões...</option>';

    let usuariosGerenciaveis = [];
    if (currentUser.role === 'admin-master') {
        usuariosGerenciaveis = users.filter(u => u.role !== 'admin-master');
    } else if (currentUser.role === 'admin-setor') {
        usuariosGerenciaveis = users.filter(u => (u.setor === currentUser.setor || !u.setor) && u.role !== 'admin-master' && u.role !== 'admin-setor');
    }

    usuariosGerenciaveis.forEach(u => {
        permUserSelect.innerHTML += `<option value="${u.username}">${u.username}</option>`;
    });
}




// ATUALIZE A FUNÇÃO loadPermissionModules()
// ATUALIZE A FUNÇÃO loadPermissionModules() para a versão GRANULAR
function loadPermissionModules() {
    const modules = [
        { key: 'estoque', label: 'Estoque', actions: ['visualizar', 'cadastrar', 'editar', 'excluir', 'movimentar', 'importar', 'gerarRelatorio'] },
        { key: 'pedidos', label: 'Pedidos', actions: ['visualizar', 'cadastrar', 'importar', 'editar', 'excluir', 'processar', 'gerarRelatorio'] },
        { key: 'bancoImagens', label: 'Banco de Imagens', actions: ['visualizar', 'adicionar', 'excluir', 'pesquisar'] },
        { key: 'producao', label: 'Produção', actions: ['visualizar', 'adicionar', 'editar', 'excluir', 'moverParaCostura', 'moverParaExpedicao', 'finalizar'] },
        { key: 'costura', label: 'Costura', actions: ['visualizar', 'adicionar', 'editar', 'excluir', 'iniciarTarefa', 'moverParaExpedicao', 'atribuirGrupos'] },
        { key: 'expedicao', label: 'Expedição', actions: ['visualizar', 'editar', 'darBaixa', 'gerarRelatorio'] },
        { key: 'chat', label: 'Chat Interno', actions: ['visualizar', 'enviar', 'criarGrupo'] },
        { key: 'processadorEANs', label: 'Processador de EANs', actions: ['visualizar', 'editar', 'processar', 'gerarRelatorio'] }
    ];

    const div = document.getElementById('modules-perm');
    div.innerHTML = '';

    modules.forEach(m => {
        // Capitaliza a primeira letra de cada ação para melhor exibição
        const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/([A-Z])/g, ' $1').trim();

        let moduleHtml = `
            <div class="p-4 bg-gray-100 rounded-lg">
                <h4 class="font-semibold text-gray-800 mb-2">${m.label}</h4>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
        `;
        m.actions.forEach(action => {
            moduleHtml += `
                <label class="flex items-center text-sm text-gray-600">
                    <input type="checkbox" data-module="${m.key}" data-action="${action}" class="w-4 h-4 mr-2 text-indigo-600 focus:ring-indigo-500">
                    ${capitalize(action)}
                </label>
            `;
        });
        moduleHtml += `</div></div>`;
        div.innerHTML += moduleHtml;
    });

    document.getElementById('perm-user').addEventListener('change', displayUserPermissions);
}


function displayUserPermissions() {
    const username = document.getElementById('perm-user').value;
    const user = users.find(u => u.username === username);
    const checkboxes = document.querySelectorAll('#modules-perm input[type="checkbox"]');

    if (user) {
        checkboxes.forEach(cb => {
            const module = cb.dataset.module;
            const action = cb.dataset.action;
            cb.checked = user.permissions[module] && user.permissions[module][action];
        });
    } else {
        checkboxes.forEach(cb => cb.checked = false);
    }
}

async function savePermissions() {
    if (!hasPermission('userManagement', 'editar')) {
        showToast('Você não tem permissão para editar permissões.', 'error');
        return;
    }
    const username = document.getElementById('perm-user').value;
    if (!username) {
        showToast('Selecione um usuário para definir as permissões.', 'error');
        return;
    }
    const user = users.find(u => u.username === username);
    if (!user) {
        showToast('Usuário não encontrado.', 'error');
        return;
    }

    document.querySelectorAll('#modules-perm input[type="checkbox"]').forEach(cb => {
        const module = cb.dataset.module;
        const action = cb.dataset.action;
        if (!user.permissions[module]) {
            user.permissions[module] = {};
        }
        user.permissions[module][action] = cb.checked;
    });

    await saveData();
    await logAction(`Permissões salvas para o usuário: ${username}`);
    showToast('Permissões salvas com sucesso!', 'success');
}

