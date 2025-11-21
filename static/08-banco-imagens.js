// ================================================================================
// 08 BANCO IMAGENS
// ================================================================================


// --- 26-módulo-banco-de-imagens.js ---

// =================================================================================
// MÓDULO BANCO DE IMAGENS
// =================================================================================
function loadBancoImagens() {
    if (!hasPermission('bancoImagens', 'visualizar')) return;
    const gallery = document.getElementById('image-gallery');
    if (!gallery) return;
    gallery.innerHTML = '';
    images.forEach((img, index) => {
        gallery.innerHTML += `
            <div class="relative group bg-gray-100 rounded-lg overflow-hidden shadow-md">
                <img src="${img.url}" alt="${img.nome}" class="w-full h-48 object-cover">
                <div class="p-3">
                    <p class="font-semibold truncate">${img.nome}</p>
                </div>
                <div class="absolute top-2 right-2">
                    <button onclick="deleteImage(${index})" class="bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" data-permission="bancoImagens:excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    applyPermissionsToUI();
}

async function addImage() {
    if (!hasPermission('bancoImagens', 'adicionar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const nome = document.getElementById('img-nome').value;
    const url = document.getElementById('img-url').value;
    if (!nome || !url) {
        showToast('Preencha o nome e a URL da imagem.', 'error');
        return;
    }
    const novaImagem = { id: `IMG-${Date.now()}`, nome, url };
    images.push(novaImagem);
    await saveData();
    await logAction(`Nova imagem adicionada: ${nome}`);
    showToast('Imagem adicionada com sucesso!', 'success');
    loadBancoImagens();
    document.getElementById('img-nome').value = '';
    document.getElementById('img-url').value = '';
}

async function deleteImage(index) {
    if (!hasPermission('bancoImagens', 'excluir')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const imgName = images[index].nome;
    if (confirm(`Tem certeza que deseja excluir a imagem "${imgName}"?`)) {
        images.splice(index, 1);
        await saveData();
        await logAction(`Imagem "${imgName}" excluída.`);
        showToast('Imagem excluída.', 'success');
        loadBancoImagens();
    }
}




// --- 27-módulo-banco-de-imagens-implementação-da-busca.js ---

// ================================================================================
// 08 BANCO DE IMAGENS (VERSÃO COM PASTAS DE SESSÃO DINÂMICAS)
// ================================================================================

// (A função procurarImagensServidor permanece a mesma)
async function procurarImagensServidor() {
    if (!hasPermission('bancoImagens', 'pesquisar')) {
        showToast('Você não tem permissão para pesquisar imagens.', 'error');
        return;
    }

    const inputEl = document.getElementById('image-search-input');
    const resultsSection = document.getElementById('image-results-section');
    const tempFolder = document.getElementById('image-temp-folder');
    const skusInput = inputEl.value.trim();

    if (!skusInput) {
        showToast('Por favor, digite pelo menos um SKU para pesquisar.', 'info');
        return;
    }

    resultsSection.classList.remove('hidden');
    document.getElementById('image-errors-container').innerHTML = ''; // Limpa a área de resultados
    tempFolder.innerHTML = `<div class="col-span-full text-center p-8 text-gray-500">
                                <i class="fas fa-spinner fa-spin fa-2x"></i>
                                <p class="mt-2 font-semibold">Criando pasta e copiando imagens...</p>
                            </div>`;

    const skusParaBuscar = skusInput.split(/[\s,]+/).filter(sku => sku.trim() !== '');

    try {
        const response = await fetch('/api/images/collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skus: skusParaBuscar })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Ocorreu um erro no servidor.');
        }

        renderizarResultadosBuscaImagens(data);
        logAction('Banco de Imagens', 'Busca de imagens realizada', { skus: skusParaBuscar, pasta_criada: data.session_folder });

    } catch (error) {
        console.error('Falha ao buscar imagens:', error);
        showToast(`Erro: ${error.message}`, 'error');
        tempFolder.innerHTML = `<p class="col-span-full text-center p-8 text-red-500">Falha na busca. Verifique o console.</p>`;
    }
}


/**
 * VERSÃO MODIFICADA: Renderiza os resultados da busca na interface, mas SEM exibir a galeria de imagens.
 * @param {object} resultados - O objeto de resposta da API.
 */
function renderizarResultadosBuscaImagens(resultados) {
    const errorsContainer = document.getElementById('image-errors-container');
    const tempFolder = document.getElementById('image-temp-folder');
    errorsContainer.innerHTML = '';
    tempFolder.innerHTML = ''; // Limpa a área de resultados visuais

    // 1. EXIBE O CAMINHO COMPLETO DA PASTA CRIADA (funcionalidade mantida)
    if (resultados.session_folder_full_path) {
        const safePath = resultados.session_folder_full_path.replace(/\\/g, '\\\\');
        errorsContainer.innerHTML += `
            <div class="bg-green-100 border-l-4 border-green-500 text-green-800 p-4 rounded-r-lg shadow-md flex justify-between items-center mb-4">
                <div>
                    <p class="font-bold">Pasta da Busca Criada com Sucesso!</p>
                    <p class="font-mono text-sm break-all">${resultados.session_folder_full_path}</p>
                </div>
                <button onclick="copyToClipboard('${safePath}')" class="bg-green-500 text-white px-3 py-2 rounded-lg hover:bg-green-600 flex-shrink-0 ml-4">
                    <i class="fas fa-copy mr-2"></i>Copiar
                </button>
            </div>`;
    }

    // 2. Renderiza os erros (SKUs não encontrados) (funcionalidade mantida)
    if (resultados.not_found && resultados.not_found.length > 0) {
        errorsContainer.innerHTML += `
            <div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded-r-lg shadow-md">
                <p><strong>Atenção:</strong> Nenhuma imagem foi encontrada para os SKUs: ${resultados.not_found.join(', ')}</p>
            </div>`;
    }

    // 3. Informa sobre o sucesso da cópia dos arquivos encontrados
    if (resultados.found && resultados.found.length > 0) {
        // Apenas exibe uma mensagem de sucesso, sem renderizar as imagens.
        tempFolder.innerHTML = `
            <div class="col-span-full bg-blue-100 border-l-4 border-blue-500 text-blue-800 p-4 rounded-r-lg shadow-md">
                <p><strong>Sucesso:</strong> ${resultados.found.length} arquivo(s) foram encontrados e copiados para a pasta de busca.</p>
            </div>
        `;
    } else if (!resultados.not_found || resultados.not_found.length === 0) {
        // Caso não tenha encontrado nada e também não haja erros
        tempFolder.innerHTML = `<p class="col-span-full text-center text-gray-500 p-8">Nenhuma imagem encontrada para os SKUs pesquisados.</p>`;
    }
}




