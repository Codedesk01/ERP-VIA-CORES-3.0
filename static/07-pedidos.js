// === Persistence + Reapply robusto (cole no 07-pedidos.js) ===
const SELECTED_KEY = 'selectedCards_v1';
let selectedCards = new Set();
let isRestoring = false; // NOVO: Flag para indicar que estamos restaurando

// Carrega do localStorage (seguro)
function loadSelectedCards() {
    try {
        const raw = localStorage.getItem(SELECTED_KEY);
        if (!raw) { selectedCards = new Set(); return; }
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) selectedCards = new Set(arr);
        else selectedCards = new Set();
    } catch (e) {
        console.warn('Erro ao ler selectedCards:', e);
        selectedCards = new Set();
    }
}

// Persiste no localStorage
function saveSelectedCards() {
    try {
        localStorage.setItem(SELECTED_KEY, JSON.stringify(Array.from(selectedCards)));
    } catch (e) {
        console.warn('Erro ao salvar selectedCards:', e);
    }
}

// Garante ID consistente (use a mesma forma que seu render usa)
function normalizeCardIdFromElement(el) {
    if (!el) return null;
    // checkbox costuma ter data-id ou data-pedido-id/data-skus
    const cb = el.matches('.pedido-checkbox') ? el : el.querySelector('.pedido-checkbox');
    if (!cb) return null;
    const dataId = cb.getAttribute('data-id');
    if (dataId) return dataId.trim();
    const pid = cb.dataset.pedidoId ? cb.dataset.pedidoId.trim() : '';
    const skus = cb.dataset.skus ? cb.dataset.skus.trim() : '';
    if (pid) return `${pid}::${skus}`;
    return null;
}

// Atualiza estilo visual do card (troque por sua função existente se houver)
function atualizarEstiloCardSelecionado(cardEl, isSelected) {
    if (!cardEl) return;
    // exemplo: adiciona classe .card-selecionado (ajuste conforme seu CSS)
    if (isSelected) {
        cardEl.classList.add('card-selecionado');
        // se você usa borda azul inline:
        cardEl.style.boxShadow = '0 0 0 3px rgba(58,123,255,0.45)'; // opcional
    } else {
        cardEl.classList.remove('card-selecionado');
        cardEl.style.boxShadow = '';
    }
}

// Reaplica seleção nos checkboxes visíveis e aplica estilo
function reapplyCardSelection(root = document) {
    // marca todos os checkboxes que já existem no DOM
    root.querySelectorAll('.pedido-checkbox').forEach(cb => {
        const dataId = cb.getAttribute('data-id') || ((cb.dataset.pedidoId || '') + '::' + (cb.dataset.skus || ''));
        const card = cb.closest('.pedido-card');
        if (dataId && selectedCards.has(dataId)) {
            cb.checked = true;
            if (card) atualizarEstiloCardSelecionado(card, true);
        } else {
            cb.checked = false;
            if (card) atualizarEstiloCardSelecionado(card, false);
        }
    });

    // atualiza painel de ações caso necessário
    if (typeof atualizarPainelAcoes === 'function') try { atualizarPainelAcoes(); } catch(e) {}
}

// Alterna seleção (usar quando checkbox muda)
function toggleCardSelectionById(cardId, checked) {
    if (!cardId) return;
    if (checked) selectedCards.add(cardId);
    else selectedCards.delete(cardId);
    saveSelectedCards();
}

// Inicializa listeners e MutationObserver
function initSelectionPersistence() {
    loadSelectedCards();

    // Event delegation: captura change em qualquer checkbox dinamicamente
    document.addEventListener('change', (ev) => {
        const t = ev.target;
        if (!t) return;
        if (t.classList && t.classList.contains('pedido-checkbox')) {
            const dataId = t.getAttribute('data-id') || ((t.dataset.pedidoId || '') + '::' + (t.dataset.skus || ''));
            const card = t.closest('.pedido-card');
            toggleCardSelectionById(dataId, t.checked);
            if (card) atualizarEstiloCardSelecionado(card, t.checked);
            if (typeof atualizarPainelAcoes === 'function') try { atualizarPainelAcoes(); } catch(e) {}
        }
    });

    // MutationObserver para reaplicar seleção a cards criados depois (virtualização)
    const containers = [
        document.getElementById('pedidos-ml-container'),
        document.getElementById('pedidos-shopee-container'),
        document.getElementById('pedidos-vc-container'),
        document.getElementById('pedidos-pendentes-container')
    ].filter(Boolean);

    const observerConfig = { childList: true, subtree: true };
    const observerCb = (mutationsList) => {
        for (const m of mutationsList) {
            // se novos nodes adicionados, reaplica seleção nesses nodes
            if (m.addedNodes && m.addedNodes.length) {
                m.addedNodes.forEach(node => {
                    if (!(node instanceof HTMLElement)) return;
                    // se o próprio node é um card ou contém checkboxes
                    if (node.matches && node.matches('.pedido-card')) {
                        reapplyCardSelection(node);
                    } else if (node.querySelector && node.querySelector('.pedido-checkbox')) {
                        reapplyCardSelection(node);
                    }
                });
            }
        }
    };

    containers.forEach(container => {
        const mo = new MutationObserver(observerCb);
        mo.observe(container, observerConfig);
        // guardar referência caso precise disconnect mais tarde
        container.__selectionObserver = mo;
    });

    // reaplica agora pra items já renderizados
    reapplyCardSelection();
}

// inicializa na carga do script
initSelectionPersistence();




let historicoDeIdsProcessados = new Set();

/* Normalização centralizada de SKU - REFINADA PARA SUFIXOS DUPLOS */
function normalizeSku(sku) {
    if (!sku && sku !== '') return '';
    let s = String(sku || '').trim().toUpperCase();
    if (!s) return '';

    // 1. Limpeza inicial: remove espaços e múltiplos hífens
    s = s.replace(/\s+/g, '').replace(/-+/g, '-');

    // MEDIDAS / SUFIXOS QUE DEVEM SER PRESERVADOS (whitelist)
    const validSuffixes = ['100', '999', 'VF', '155', '175', '350'];
    
    // Regex para sufixos proibidos (F, P, V, C)
    const forbiddenSuffixesRegex = /-(F|P|V|C)$/i;
    // Regex para medidas espúrias (1 a 3 dígitos)
    const spuriousMeasuresRegex = /-\d{1,3}$/i;

    // 2. Lógica de remoção iterativa para lidar com sufixos duplos (ex: PRODUTO-999-P)
    let max_iterations = 5; // Limite para evitar loop infinito
    let changed = true;

    while (changed && max_iterations > 0) {
        changed = false;
        max_iterations--;

        // A. Tenta detectar se o SKU atual é um SKU finalizado com um sufixo VÁLIDO
        const matchValid = s.match(/-(\w{2,3})$/);
        if (matchValid) {
            const suf = matchValid[1];
            if (validSuffixes.includes(suf)) {
                // Se o sufixo final é válido, paramos a remoção e retornamos.
                return s;
            }
        }
        
        // B. Tenta remover sufixos proibidos (F, P, V, C)
        let s_before = s;
        s = s.replace(forbiddenSuffixesRegex, '');
        if (s_before !== s) {
            changed = true;
            continue; // Recomeça o loop para verificar se o novo final é válido
        }

        // C. Tenta remover medidas espúrias (1 a 3 dígitos)
        s_before = s;
        s = s.replace(spuriousMeasuresRegex, '');
        if (s_before !== s) {
            changed = true;
            continue; // Recomeça o loop para verificar se o novo final é válido
        }
    }
    
    // 3. Limpeza final (caso o loop tenha terminado sem um retorno)
    s = s.replace(/-+/g, '-').replace(/^-|-$/g, ''); // Remove hífens múltiplos e hífens nas pontas

    return s;
}






// ======= Função de verificação de existência de pedido =======
// Garanta que construirHistoricoDeIds() e chavePedido() já existam antes de colar isto.
// Cole esta função acima de qualquer uso (processarPedidosMarketplace etc).

function pedidoJaExiste(id, sku) {
    // Reconstrói índice para ter certeza que está atualizado
    try {
        construirHistoricoDeIds();
    } catch (e) {
        console.warn('[pedidoJaExiste] construirHistoricoDeIds falhou:', e);
    }

    const keyComSku = chavePedido(id, sku);        // usa normalizeSku() via chavePedido()
    const keyPorId = String(id ?? '').trim() + '::';

    return historicoDeIdsProcessados.has(keyComSku) || historicoDeIdsProcessados.has(keyPorId);
}

/* UTIL: chave composta id::sku (agora usa normalização) */
function chavePedido(id, sku) {
    const _id = String(id ?? '').trim();
    const _sku = normalizeSku(sku ?? '');
    return `${_id}::${_sku}`;
}

/* Reconstrói o índice de chaves (id::sku) — nova versão que permite reprocesar pedidos com SKU ausente/ilegível */
function construirHistoricoDeIds() {
    historicoDeIdsProcessados.clear();

    function addKeyVariants(id, sku, opts = {}) {
        const _id = String(id ?? '').trim();
        if (!_id) return;

        const originalSku = String(sku ?? '').trim().toUpperCase();
        const normSku = normalizeSku(sku ?? '');

        // Se houver SKU (após normalizar) adiciona a chave composta normalmente
        if (normSku) {
            historicoDeIdsProcessados.add(`${_id}::${normSku}`);
            historicoDeIdsProcessados.add(`${_id}::${originalSku}`);
        }

        // Só adiciona fallback por ID se:
        // - houver SKU (porque então o ID representa uma combinação conhecida), ou
        // - o registro estiver marcado como finalizado/confirmado (ex: finalizado === true || confirmado === true)
        // Caso contrário (ex: SKU ausente ou registro em pedidosComErro) NÃO adicionamos id:: para permitir reprocesamento.
        const isConfirmed = !!(opts.confirmado || opts.finalizado || opts.status === 'finalizado' || opts.status === 'enviado');
        if (normSku || isConfirmed) {
            historicoDeIdsProcessados.add(`${_id}::`);
        }
    }

    // Origem: pedidos (normalmente imports pendentes) — não marcar como confirmado automaticamente
    if (Array.isArray(pedidos)) {
        pedidos.forEach(p => addKeyVariants(p.id || p.pedidoId || p.orderId, p.sku, { confirmado: !!p.confirmado }));
    }

    // Produção / Costura / Expedição: se esses arrays representam estados de fluxo, marcar confirmado conforme campo
    if (Array.isArray(producao)) {
        producao.forEach(p => addKeyVariants(p.pedidoId || p.id, p.sku, { finalizado: !!p.finalizado }));
    }
    if (Array.isArray(costura)) {
        costura.forEach(c => addKeyVariants(c.pedidoId || c.id, c.sku, { finalizado: !!c.finalizado }));
    }
    if (Array.isArray(expedicao)) {
        expedicao.forEach(e => addKeyVariants(e.pedidoId || e.id, e.sku, { finalizado: !!e.finalizado || !!e.confirmado }));
    }

    // historicoExpedicao: normalmente há confirmação aqui — marcar confirmado
    if (Array.isArray(historicoExpedicao)) {
        historicoExpedicao.forEach(h => addKeyVariants(h.pedidoId || h.id, h.sku, { finalizado: true }));
    }

    // pedidosComErro: NÃO adicionar (permitir reprocesamento). Mantemos esses fora do índice.
    // if (Array.isArray(pedidosComErro)) {
    //    pedidosComErro.forEach(e => { /* intentionally skip */ });
    // }

    // Se houver outros arrays/locais de onde você quer bloquear por id, adicione-os com opts.finalizado = true
}


/* atualizar adicionarPedido para usar SKU normalizada */
function adicionarPedido(marketplace, item) {
    const id = String(item.id ?? '').trim();
    if (!id) {
        console.warn('[ADICIONAR_PEDIDO] Tentativa de adicionar pedido sem ID:', item);
        return;
    }
    // normaliza antes de inserir
    const skuOriginal = String(item.sku ?? '').trim();
    const sku = normalizeSku(skuOriginal);

    if (pedidoJaExiste(id, sku)) {
        console.warn(`[DUPLICIDADE BLOQUEADA] Pedido ${id} (SKU: ${sku || 'EMPTY'}) já existe no sistema.`);
        return;
    }

    // garante que o objeto salvo use o SKU normalizado (para consistência)
    const itemToPush = { ...item, sku: sku };
    if (!Array.isArray(pedidos)) pedidos = [];
    pedidos.push(itemToPush);

    historicoDeIdsProcessados.add(chavePedido(id, sku));
    historicoDeIdsProcessados.add(id + '::');
}

/**
 * Processa os pedidos colados na textarea do marketplace especificado.
 * VERSÃO FINAL: Implementa a remoção visual IMEDIATA de TODOS os cards de um pedido cancelado,
 * baseando-se no ID do pedido para contornar variações de SKU.
 * @param {'ml' | 'shopee'} marketplace - O marketplace a ser processado.
 */
async function processarPedidosMarketplace(marketplace) {
    if (!hasPermission('pedidos', 'importar')) {
        showToast('Você não tem permissão para importar pedidos.', 'error');
        return;
    }
    const inputId = `${marketplace}-input`;
    const inputText = document.getElementById(inputId).value;
    if (!inputText.trim()) {
        showToast('A área de texto está vazia.', 'info');
        return;
    }

    const marketplaceNome = marketplace === 'ml' ? 'Mercado Livre' : 'Shopee';
    const resultado = marketplace === 'ml' ? parsePedidosTexto(inputText) : parseShopeeTexto(inputText);

    if (resultado.pedidosValidos.length === 0 && resultado.pedidosCancelados.length === 0 && resultado.pedidosComErro.length === 0) {
        showToast('Nenhum pedido válido, cancelado ou com erro encontrado no texto.', 'info');
        return;
    }

    let novosPedidosAdicionados = 0;
    let pedidosDuplicados = 0;
    let itensRemovidosPorCancelamento = 0;
    let avisosDeJaCancelado = 0;

    // --- LÓGICA DE CANCELAMENTO IMEDIATO POR ID ---
    const idsCancelados = [...new Set(resultado.pedidosCancelados.map(p => p.id))];

    for (const pedidoId of idsCancelados) {
        const cardsDoPedido = document.querySelectorAll(`[data-pedido-id="${pedidoId}"]`);
        
        if (cardsDoPedido.length > 0) {
            cardsDoPedido.forEach(cardElement => {
                cardElement.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
                cardElement.style.transform = 'scale(0.95)';
                cardElement.style.opacity = '0';
                setTimeout(() => cardElement.remove(), 300);
            });
            showToast(`PEDIDO CANCELADO: Todos os itens do pedido ${pedidoId} foram removidos do fluxo.`, 'error', 8000);
            itensRemovidosPorCancelamento += cardsDoPedido.length;
        }

        pedidos = pedidos.filter(p => p.id !== pedidoId);
        producao = producao.filter(p => p.pedidoId !== pedidoId);
        costura = costura.filter(c => c.pedidoId !== pedidoId);
        expedicao = expedicao.filter(e => e.pedidoId !== pedidoId);

        fetch('/api/pedidos/cancelar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pedidoId: pedidoId, usuario: currentUser.username })
        }).catch(err => console.error("Falha ao sincronizar cancelamento com o servidor:", err));

        const jaRegistradoComoCancelado = pedidosComErro.some(e => e.id === pedidoId && e.motivo.includes('cancelada'));
        if (!jaRegistradoComoCancelado) {
            pedidosComErro.push({
                id: pedidoId,
                motivo: `Venda cancelada. Todos os itens foram removidos.`,
                marketplace: marketplaceNome,
                timestamp: new Date().toISOString()
            });
        }
    }

    // --- LÓGICA PARA PEDIDOS VÁLIDOS ---
    resultado.pedidosValidos.forEach(pedidoData => {
        const jaCancelado = idsCancelados.includes(pedidoData.id);
        if (jaCancelado) {
            avisosDeJaCancelado++;
            return;
        }
        if (pedidoJaExiste(pedidoData.id)) {
            console.log(`⛔ Ignorado (Índice): Pedido ${marketplaceNome} ${pedidoData.id} já existe no sistema.`);
            pedidosDuplicados++;
            return; // Pula para o próximo
        }

        adicionarPedido(marketplace, pedidoData);
        novosPedidosAdicionados++;

        // 🧹 NOVO TRECHO: remove erros antigos do mesmo ID (SKU ilegível)
        pedidosComErro = pedidosComErro.filter(
            e => !(e.id === pedidoData.id && e.motivo.includes('SKU não informado'))
        );
    });
    
    // --- LÓGICA PARA OUTROS ERROS ---
    resultado.pedidosComErro.forEach(erro => {
        erro.marketplace = marketplaceNome;
        if (!pedidosComErro.some(e => e.id === erro.id && e.motivo === erro.motivo)) {
            pedidosComErro.push(erro);
        }
    });

    // --- FEEDBACK FINAL E ATUALIZAÇÃO DA TELA ---
    if (avisosDeJaCancelado > 0) {
        showToast(`${avisosDeJaCancelado} item(ns) pertencentes a pedidos já cancelados foram ignorados.`, 'warning');
    }
    if (novosPedidosAdicionados > 0) {
        showToast(`${novosPedidosAdicionados} item(ns) de pedido importado(s) com sucesso!`, 'success');
    }
    if (pedidosDuplicados > 0) {
        showToast(`${pedidosDuplicados} item(ns) já existiam e foram ignorados.`, 'info');
    }

    await saveData();
    loadPedidos(); 
    document.getElementById(inputId).value = '';
}





// =================================================================================
// MÓDULO DE PEDIDOS (FUNÇÃO PRINCIPAL ATUALIZADA)
// =================================================================================
async function addPedido() {
    if (!hasPermission('pedidos', 'cadastrar')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const cliente = document.getElementById('pedido-cliente').value;
    const itens = document.getElementById('pedido-itens').value;
    if (!cliente || !itens) {
        showToast('Preencha o cliente e os itens do pedido.', 'error');
        return;
    }
    const novoPedido = {
        id: `PED-${Date.now()}`,
        cliente,
        itens: itens.split(','),
        data: new Date()
    };
    pedidos.push(novoPedido);
    await saveData();
    logAction(`Novo pedido cadastrado: ${novoPedido.id} para ${cliente}`);
    showToast('Pedido cadastrado com sucesso!', 'success');
    loadPedidos();
    document.getElementById('pedido-cliente').value = '';
    document.getElementById('pedido-itens').value = '';
}
async function deletePedido(index) {
    if (!hasPermission('pedidos', 'excluir')) {
        showToast('Permissão negada.', 'error');
        return;
    }
    const pedidoId = pedidos[index].id;
    if (confirm(`Tem certeza que deseja excluir o pedido ${pedidoId}?`)) {
        pedidos.splice(index, 1);
        await saveData();
        logAction(`Pedido ${pedidoId} excluído.`);
        showToast('Pedido excluído.', 'success');
        loadPedidos();
    }
}

// =================================================================================
// MÓDULO DE PEDIDOS - CÓDIGO CORRIGIDO E COMPLETO
// =================================================================================
// Em 07-pedidos.js





/**
 * Processa o texto de pedidos colado do Mercado Livre.
 * VERSÃO AJUSTADA: Extrai os SKUs de pedidos cancelados para a remoção imediata do card.
 * @param {string} text - O texto bruto copiado da página de pedidos.
 * @returns {object} Um objeto contendo listas de pedidos válidos, cancelados e com erro.
 */
function parsePedidosTexto(text) {
    const pedidosValidos = [];
    const pedidosCancelados = [];
    const erros = [];
    const blocosPedidos = text.split('row-checkbox').filter(b => b.trim() !== '');
    const getFormattedDate = (date) => date.toLocaleDateString('pt-BR');
    const hoje = new Date();
    const amanha = new Date();
    amanha.setDate(hoje.getDate() + 1);
    const meses = {
        'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
    };

    blocosPedidos.forEach(bloco => {
        const idMatch = bloco.match(/#\d+/);
        const id = idMatch ? idMatch[0] : null;

        if (!id) {
            if (bloco.length > 50) {
                erros.push({ id: 'Desconhecido', motivo: 'Bloco de pedido sem ID de venda.' });
            }
            return;
        }

        const blocoLower = bloco.toLowerCase();
        const isCanceled = blocoLower.includes('venda cancelada') || blocoLower.includes('a pessoa que comprou cancelou');
        const blocosProdutos = bloco.split('product').filter(p => p.trim() !== '');

        // >>>>> INÍCIO DO AJUSTE <<<<<
        if (isCanceled) {
            // Se for cancelado, vamos tentar extrair o SKU para a remoção.
            blocosProdutos.forEach(blocoProduto => {
                const skuMatch = blocoProduto.match(/SKU:\s*([A-Z0-9-]+)/i);
                if (skuMatch) {
                    const skuOriginal = skuMatch[1].trim();
                    // Adiciona à lista de cancelados para que a remoção imediata funcione.
                    pedidosCancelados.push({ id: id, sku: skuOriginal });
                }
            });
            // Se não encontrou SKU no bloco do produto, adiciona um placeholder
            if (blocosProdutos.length === 0 || !bloco.includes('SKU:')) {
                 pedidosCancelados.push({ id: id, sku: 'SKU_NAO_IDENTIFICADO' });
            }
            return; // Interrompe o processamento deste bloco, pois já é cancelado.
        }
        // >>>>> FIM DO AJUSTE <<<<<

        // Se não for cancelado, continua a lógica normal...
        if (blocosProdutos.length === 0 || !bloco.includes('SKU:')) {
            erros.push({
                id: id,
                motivo: 'SKU não informado ou ilegível. Reprocesse abrindo o modal do pedido no Mercado Livre!'
            });
            return;
        }

        let tipoEntrega = 'Coleta';
        if (blocoLower.includes('dar o pacote ao seu motorista')) {
            tipoEntrega = 'Motoboy';
        }
       
        const marketplace = 'Mercado Livre';
        let dataColeta;
        const dataMatch = blocoLower.match(/(?:em|até)\s+(\d{1,2})\s+de\s+([a-z]{3})/);
        if (dataMatch) {
            const dia = parseInt(dataMatch[1]);
            const mesStr = dataMatch[2];
            const mes = meses[mesStr];
            if (mes !== undefined) {
                const ano = hoje.getFullYear();
                dataColeta = getFormattedDate(new Date(ano, mes, dia));
            }
        }
        if (!dataColeta) {
            const frasesAmanha = ['coleta que passará amanhã', 'entregar o pacote amanhã', 'dar o pacote ao seu motorista amanhã', 'dia seguinte'];
            if (frasesAmanha.some(frase => blocoLower.includes(frase))) {
                dataColeta = getFormattedDate(amanha);
            }
        }
        if (!dataColeta) {
            const frasesHoje = ['coleta que passará hoje', 'entregar o pacote hoje'];
            if (frasesHoje.some(frase => blocoLower.includes(frase))) {
                dataColeta = getFormattedDate(hoje);
            }
        }
       
        if (!dataColeta) {
            dataColeta = getFormattedDate(hoje);
        }

        blocosProdutos.forEach(blocoProduto => {
            if (!blocoProduto.includes('SKU:')) return;

            const skuMatch = blocoProduto.match(/SKU:\s*([A-Z0-9-]+)/i);
            const unidadeMatch = blocoProduto.match(/(\d+)\s+unidade/i);

            if (skuMatch && unidadeMatch) {
                const skuOriginal = skuMatch[1].trim();
                let skuLimpo = skuOriginal;

                if (!/PV.*(-100|-999|-VF)$/i.test(skuOriginal)) {
                    skuLimpo = skuOriginal.replace(/-(F|P|V|C)$/i, '');
                }

                const pedidoData = {
                    id: id,
                    marketplace,
                    dataColeta,
                    tipoEntrega,
                    sku: skuLimpo,
                    quantidade: parseInt(unidadeMatch[1]),
                    status: 'Pendente',
                    dataImportacao: new Date().toISOString()
                };
                
                pedidosValidos.push(pedidoData);

            } else {
                 erros.push({ id: id, motivo: `SKU não informado ou ilegível em um dos itens. Reprocesse abrindo o modal do pedido no Mercado Livre!` });
            }
        });
    });

    return { pedidosValidos, pedidosCancelados, pedidosComErro: erros };
}

/**
 * Define a lógica de agrupamento por SKU, com regras estritas e na ordem correta para ser automática.
 * @param {string} sku - O SKU do produto.
 * @returns {string} O nome do grupo ao qual o SKU pertence.
 */
function getGrupoSku(sku) {
    if (!sku) return "OUTROS";
    const code = sku.toUpperCase().trim();
    // --- PV ESPECIAL: termina em -100, -999, -VF ou contém marcadores específicos ---
    if (/^PV.*(?:-100|-999|-VF)(?:\b|$)/i.test(code)) {
        return "PV-ESPECIAL";
    }
    // --- PV Normal: começa com PV mas não é especial ---
    if (/^PV/i.test(code)) {
        return "PV";
    }
    // --- Outros prefixos conhecidos ---
    const prefixos = ["CL", "FF", "KC", "KD", "PC", "PH", "PR", "RV", "TP", "VC"];
    for (let prefix of prefixos) {
        if (code.startsWith(prefix)) {
            return prefix;
        }
    }
    return "OUTROS";
}
/**
 * Remove um item específico de todas as filas de fluxo de trabalho (produção, costura, etc.).
 * Esta função é chamada quando um pedido é cancelado após já ter sido processado.
 * @param {string} pedidoId - O ID do pedido a ser removido (ex: "#2000012927197986").
 * @param {string} sku - O SKU do item a ser removido.
 */
function removerItemDosFluxos(pedidoId, sku) {
    let itemRemovido = false;
    // 1. Procura e remove da fila de PRODUÇÃO
    const producaoIndex = producao.findIndex(p => p.pedidoId === pedidoId && p.sku === sku);
    if (producaoIndex !== -1) {
        producao.splice(producaoIndex, 1);
        itemRemovido = true;
    }
    // 2. Procura e remove da fila de COSTURA (caso já já tenha avançado)
    const costuraIndex = costura.findIndex(c => c.pedidoId === pedidoId && c.sku === sku);
    if (costuraIndex !== -1) {
        costura.splice(costuraIndex, 1);
        itemRemovido = true;
    }
    // 3. Procura e remove da fila de EXPEDIÇÃO (caso já tenha avançado)
    const expedicaoIndex = expedicao.findIndex(e => e.pedidoId === pedidoId && e.sku === sku);
    if (expedicaoIndex !== -1) {
        expedicao.splice(expedicaoIndex, 1);
        itemRemovido = true;
    }
    if (itemRemovido) {
        logAction(`Item ${sku} (Pedido: ${pedidoId}) foi removido das filas de trabalho devido a cancelamento.`);
    }
}




/**
 * Processa o texto de pedidos colado da Shopee.
 * Prioriza a extração do SKU de variação (o último SKU dentro dos colchetes),
 * mas trata corretamente o caso em que os SKUs dentro do colchete são iguais.
 * @param {string} text - O texto bruto copiado da página de pedidos.
 * @returns {object} Um objeto contendo listas de pedidos válidos, cancelados e com erro.
 */
function parseShopeeTexto(text) {
    const pedidosValidos = [];
    const pedidosCancelados = [];
    const pedidosComErro = [];
    
    // Divide o texto em blocos de pedido, usando o ID do pedido como delimitador
    const regexBloco = /(ID do Pedido\s+([A-Z0-9]{14}))/g;
    const blocos = text.split(regexBloco).filter(b => b.trim() !== '');
    
    for (let i = 0; i < blocos.length; i++) {
        if (blocos[i].startsWith('ID do Pedido')) {
            const idCompleto = blocos[i]; // 'ID do Pedido 250815SXYTVWQT'
            const id = blocos[i+1];       // '250815SXYTVWQT'
            const bloco = blocos[i+2];    // texto do pedido

            if (!bloco) { i += 2; continue; }

            const blocoLower = bloco.toLowerCase();
            const isCanceled = blocoLower.includes('cancelado') || blocoLower.includes('cancelada');

            // --- BUSCAR O ÚLTIMO CONTEÚDO ENTRE COLCHETES ---
            // Encontrar todas as ocorrências de [ ... ]
            const allBrackets = [...bloco.matchAll(/\[\s*([A-Z0-9-]+(?:\s+[A-Z0-9-]+)*)\s*\]/gi)];
            if (allBrackets.length === 0) {
                pedidosComErro.push({ id: id, motivo: 'SKU não encontrado ou ilegível (formato [SKU] não detectado).' });
                i += 2;
                continue;
            }

            // Pega o último grupo entre colchetes (última variação listada)
            const lastBracketContent = allBrackets[allBrackets.length - 1][1].trim();

            // Divide preservando a ordem original, sem remover duplicatas ainda
            let skusArray = lastBracketContent.split(/\s+/).filter(s => s.trim() !== '');

            // Normaliza (trim, uppercase) — caso queira manter exatamente como vem, remova .toUpperCase()
            skusArray = skusArray.map(s => s.trim().toUpperCase());

            // Lógica final:
            // - Se todos os SKUs no colchete são iguais -> é 1 item (bug da Shopee)
            // - Caso contrário -> pega o último SKU da lista (preserva sufixos -175, -999, etc)
            let skuParaProcessar;
            const todosIguais = skusArray.every(s => s === skusArray[0]);
            if (todosIguais) {
                skuParaProcessar = skusArray[0];
            } else {
                skuParaProcessar = skusArray[skusArray.length - 1];
            }

            // 2. Extração da Quantidade (pega a última ocorrência de "xN" no bloco)
            const quantidadeMatches = [...bloco.matchAll(/x\s*(\d+)/gi)];
            const quantidade = quantidadeMatches.length ? parseInt(quantidadeMatches[quantidadeMatches.length - 1][1], 10) : 1;

            // 3. Tipo de Entrega
            let tipoEntrega = 'Shopee Xpress';
            if (blocoLower.includes('correios')) tipoEntrega = 'Correios';

            // 4. Data de coleta (se houver)
            let dataColeta = null;
            const dataMatch = bloco.match(/envie o pedido antes de\s+(\d{2}\/\d{2}\/\d{4})/i);
            if (dataMatch) dataColeta = dataMatch[1];

            // 5. Processamento final
            if (isCanceled) {
                pedidosCancelados.push({ id: id, sku: skuParaProcessar });
            } else {
                const pedidoData = {
                    id: id,
                    marketplace: 'Shopee',
                    dataColeta: dataColeta,
                    tipoEntrega: tipoEntrega,
                    sku: skuParaProcessar,
                    quantidade: quantidade,
                    status: 'Pendente',
                    dataImportacao: new Date().toISOString()
                };
                pedidosValidos.push(pedidoData);
            }

            i += 2; // pular id e bloco
        }
    }

    return { pedidosValidos, pedidosCancelados, pedidosComErro };
}






// =================================================================================
// MÓDULO DE PEDIDOS - CÓDIGO CORRIGIDO E COMPLETO
// =================================================================================
// ARQUIVO: 07-pedidos.js
// SUBSTITUA A FUNÇÃO 'loadPedidos' PELA VERSÃO ABAIXO

/**
 * Carrega e organiza os pedidos pendentes, agora calculando e exibindo
 * tanto o total de pedidos quanto o total de itens.
 */
function loadPedidos() {
    if (!hasPermission('pedidos', 'visualizar')) return;

    document.getElementById('pedidos-data-atualizacao').innerHTML = `Última atualização: <strong>${new Date().toLocaleString('pt-BR')}</strong>`;

    // Referências aos containers e contadores
    const mlContainer = document.getElementById('pedidos-ml-container');
    const shopeeContainer = document.getElementById('pedidos-shopee-container');
    const vcContainer = document.getElementById('pedidos-vc-container');
    const contadorML = document.getElementById('contador-ml');
    const contadorShopee = document.getElementById('contador-shopee');
    const contadorVC = document.getElementById('contador-vc');
    const contadorTotalPedidos = document.getElementById('contador-pedidos-pendentes');
    const contadorTotalItens = document.getElementById('contador-itens-pendentes'); // Referência ao novo contador

    // Limpeza dos containers
    mlContainer.innerHTML = '';
    shopeeContainer.innerHTML = '';
    if (vcContainer) vcContainer.innerHTML = '';

    // Filtro de pedidos pendentes
    const pedidosPendentes = pedidos.filter(p => p.status === 'Pendente' || p.status === 'Aguardando Autorização');

    // Lógica de filtragem por marketplace e origem
    const pedidosVC = pedidosPendentes.filter(p => p.origem === 'Manual');
    const pedidosML = pedidosPendentes.filter(p => p.marketplace === 'Mercado Livre' && p.origem !== 'Manual');
    const pedidosShopee = pedidosPendentes.filter(p => p.marketplace === 'Shopee' && p.origem !== 'Manual');

    // Calcula o número total de ITENS somando as quantidades
    const totalItensPendentes = pedidosPendentes.reduce((total, item) => total + item.quantidade, 0);
    
    // Atualiza os contadores no cabeçalho
    contadorTotalPedidos.innerText = new Set(pedidosPendentes.map(p => p.id)).size;
    if (contadorTotalItens) {
        contadorTotalItens.innerText = totalItensPendentes;
    }

    // Atualização dos contadores das abas
    contadorML.innerText = new Set(pedidosML.map(p => p.id)).size;
    contadorShopee.innerText = new Set(pedidosShopee.map(p => p.id)).size;
    if (contadorVC) contadorVC.innerText = new Set(pedidosVC.map(p => p.id)).size;

    // Renderização dos grupos
    renderizarGruposComVirtualizacao(pedidosML, mlContainer, 'ml');
    renderizarGruposComVirtualizacao(pedidosShopee, shopeeContainer, 'shopee');
    if (vcContainer) renderizarGruposComVirtualizacao(pedidosVC, vcContainer, 'vc');

    // Lógica para manter a aba ativa
    const abaAtiva = document.querySelector('.tab-btn:not(.border-transparent)');
    if (abaAtiva) {
        showTab(abaAtiva.id.replace('tab-', ''));
    }

    // Chamadas finais
    atualizarPainelAcoes();
    applyPermissionsToUI();
    construirHistoricoDeIds(); 

}





// ADICIONE ESTA NOVA FUNÇÃO AO SEU ARQUIVO 07-pedidos.js

/**
 * Renderiza os grupos de pedidos de forma otimizada com virtualização (scroll infinito).
 * Apenas os itens visíveis são renderizados inicialmente, e mais itens são carregados
 * conforme o usuário rola a página.
 *
 * @param {Array} listaPedidos - A lista de pedidos para uma aba específica.
 * @param {HTMLElement} container - O container principal da aba (ex: pedidos-ml-container).
 * @param {string} tabPrefix - Um prefixo único para a aba (ex: 'ml', 'shopee').
 */
function renderizarGruposComVirtualizacao(listaPedidos, container, tabPrefix) {
    if (!container) return;

    if (listaPedidos.length === 0) {
        container.innerHTML = `<p class="text-gray-500 col-span-full text-center py-4">Nenhum pedido pendente aqui.</p>`;
        return;
    }

    // 1. Agrupa todos os pedidos por grupo de SKU
    const pedidosAgrupados = listaPedidos.reduce((acc, pedido) => {
        const grupo = getGrupoSku(pedido.sku);
        if (!acc[grupo]) acc[grupo] = [];
        acc[grupo].push(pedido);
        return acc;
    }, {});

    const ordemGrupos = ['CL', 'FF', 'KC', 'KD', 'PC', 'PH', 'PR', 'PV', 'PV-ESPECIAL', 'RV', 'TP', 'VC', 'PA', 'OUTROS'];
    container.innerHTML = ''; // Limpa o container da aba

    // 2. Itera sobre os grupos na ordem definida
    ordemGrupos.forEach(nomeGrupo => {
        if (pedidosAgrupados[nomeGrupo]) {
            const itensDoGrupo = pedidosAgrupados[nomeGrupo].sort((a, b) => a.sku.localeCompare(b.sku));
            
            // Cria os containers para o grupo
            const grupoContainer = document.createElement('div');
            grupoContainer.className = 'col-span-full mb-6';
            grupoContainer.innerHTML = `<h4 class="text-xl font-semibold text-gray-700 border-b pb-2 mb-4">Grupo: ${nomeGrupo}</h4>`;

            const gridContainer = document.createElement('div');
            gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6';
            gridContainer.id = `grid-${tabPrefix}-${nomeGrupo}`; // ID único para o grid

            grupoContainer.appendChild(gridContainer);
            container.appendChild(grupoContainer);

            // 3. Lógica de Renderização Virtualizada
            let itensRenderizados = 0;
            const ITENS_POR_LOTE = 20; // Quantidade de cards para carregar por vez

            function carregarMaisItens() {
                const proximoLote = itensDoGrupo.slice(itensRenderizados, itensRenderizados + ITENS_POR_LOTE);
                if (proximoLote.length > 0) {
                    // A função renderizarCardsDePedido agora só renderiza um pequeno lote
                    const htmlLote = renderizarCardsDePedido(proximoLote);
                    gridContainer.innerHTML += htmlLote;
                    itensRenderizados += proximoLote.length;
                    ativarLazyLoading(gridContainer.id); // Ativa o lazy loading para os novos cards
                }
            }

            // Carrega o primeiro lote de itens imediatamente
            carregarMaisItens();

            // 4. Adiciona um "observador" para carregar mais itens quando o final da lista estiver visível
            const observer = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && itensRenderizados < itensDoGrupo.length) {
                    carregarMaisItens();
                }
            }, { root: null, rootMargin: '400px' }); // Carrega quando estiver a 400px de distância

            // Cria um elemento "gatilho" no final do grid para o observador
            const trigger = document.createElement('div');
            trigger.id = `trigger-${tabPrefix}-${nomeGrupo}`;
            grupoContainer.appendChild(trigger);
            observer.observe(trigger);
        }
    });
}




// 07-pedidos.js

// Variável global para guardar os DADOS do item que precisa de autorização
let itemPendenteAutorizacao = null;

/**
 * Abre o modal para o admin decidir o que fazer com um item bloqueado.
 * @param {string} pedidoId - O ID do pedido do item bloqueado.
 * @param {string} sku - O SKU do item bloqueado.
 */
function abrirModalAutorizacao(pedidoId, sku) {
    if (!hasPermission('pedidos', 'editar')) {
        showToast('Você não tem permissão para gerenciar este item.', 'error');
        return;
    }
    
    // Armazena as informações como um objeto simples
    itemPendenteAutorizacao = { id: pedidoId, sku: sku };

    const modal = document.getElementById('autorizacao-duplicidade-modal');
    document.getElementById('auth-sku-label').innerText = sku;
    document.getElementById('auth-pedido-label').innerText = pedidoId;
    document.getElementById('auth-novo-sku-input').value = '';
    modal.classList.remove('hidden');
    document.getElementById('autorizacao-duplicidade-modal-content').classList.remove('scale-95', 'opacity-0');
    document.getElementById('auth-novo-sku-input').focus();
}

function fecharModalAutorizacao() {
    const modal = document.getElementById('autorizacao-duplicidade-modal');
    modal.classList.add('hidden');
    itemPendenteAutorizacao = null; // Limpa a variável global
}

// =================================================================================
// >> INÍCIO DA CORREÇÃO PRINCIPAL <<
// =================================================================================

/**
 * Ação do admin: autoriza a segunda unidade e a envia DIRETAMENTE para o modal de decisão.
 * VERSÃO 5.0: Fluxo contínuo e sem erros.
 */
async function autorizarEProcessarSegundaUnidade() {
    if (!itemPendenteAutorizacao) return;

    const pedidoIndex = pedidos.findIndex(p => 
        p.id === itemPendenteAutorizacao.id && 
        p.sku === itemPendenteAutorizacao.sku && 
        p.status === 'Aguardando Autorização'
    );
    
    if (pedidoIndex !== -1) {
        const itemAutorizado = pedidos[pedidoIndex];
        
        // 1. Tenta mover o item, passando a flag de autorização
        const foiMovido = await moverItemParaFluxo(
            itemAutorizado.id, 
            itemAutorizado.sku, 
            true, // forcarProducao
            true  // isAuthorizedUnit
        );

        if (foiMovido) {
            logAction(`Admin autorizou a 2ª unidade do SKU ${itemAutorizado.sku} para o pedido ${itemAutorizado.id}.`);
            showToast('Item desbloqueado e enviado para o fluxo de produção!', 'success');
            fecharModalAutorizacao();
            loadPedidos();
        } else {
            // Se não foi movido, o erro já foi reportado dentro de moverItemParaFluxo
            showToast('Falha ao processar item autorizado. Verifique o console.', 'error');
        }

    } else {
        console.error("Falha ao encontrar o item para AUTORIZAR. Dados procurados:", itemPendenteAutorizacao);
        showToast('Erro crítico: Item pendente de autorização não foi encontrado para ser desbloqueado.', 'error');
    }
}

/**
 * Ação do admin: troca o SKU do item pendente e o envia DIRETAMENTE para o modal de decisão.
 * VERSÃO 5.0: Fluxo contínuo e sem erros.
 */
/**
 * Ação do admin: troca o SKU do item pendente e o envia DIRETAMENTE para o fluxo de produção/expedição.
 * Ajustado para suportar a autorização da 2ª unidade.
 */
async function trocarSkuEProcessarAutorizado() {
    const novoSku = document.getElementById('auth-novo-sku-input').value.trim().toUpperCase();
    if (!itemPendenteAutorizacao || !novoSku) {
        showToast('Por favor, insira um novo SKU válido.', 'error');
        return;
    }
    
    // A busca agora deve incluir o status 'Aguardando Autorização'
    const pedidoIndex = pedidos.findIndex(p => 
        p.id === itemPendenteAutorizacao.id && 
        p.sku === itemPendenteAutorizacao.sku && 
        (p.status === 'Aguardando Autorização' || p.status === 'Aguardando Autorização')
    );

    if (pedidoIndex !== -1) {
        const itemOriginal = pedidos[pedidoIndex];
        const skuAntigo = itemOriginal.sku;
        
        // 1. Atualiza o SKU no array local
        itemOriginal.sku = novoSku;
        itemOriginal.status = 'Pendente'; // Desbloqueia o item
        
        // 2. Tenta mover o item, passando a flag de autorização (e o novo SKU)
        // O item será movido para Produção por padrão, pois é o fluxo de autorização.
        const foiMovido = await moverItemParaFluxo(
            itemOriginal.id, 
            itemOriginal.sku, // Usa o novo SKU
            true, // forcarProducao
            true  // isAuthorizedUnit - Essencial para a 2ª unidade
        );

        if (foiMovido) {
            logAction(`Admin trocou o SKU de ${skuAntigo} para ${novoSku} no pedido ${itemOriginal.id} e autorizou.`);
            showToast('SKU trocado e item enviado para o fluxo de produção!', 'success');
            fecharModalAutorizacao();
            loadPedidos();
        } else {
            // Se falhou, reverte o status localmente para 'Aguardando Autorização' para manter o bloqueio
            itemOriginal.sku = skuAntigo; // Reverte o SKU
            itemOriginal.status = 'Aguardando Autorização';
            await saveData();
            showToast('Falha ao processar item autorizado com novo SKU. Verifique o console.', 'error');
        }

    } else {
        console.error("Falha ao encontrar o item para TROCAR SKU. Dados procurados:", itemPendenteAutorizacao);
        showToast('Erro crítico: Item pendente de autorização não foi encontrado para alterar o SKU.', 'error');
    }
}

/**
 * Abre o modal de seleção de impressora para um ÚNICO item.
 * Usado após a autorização da segunda unidade para dar continuidade ao fluxo.
 * @param {object} item - O objeto do item que foi autorizado (ex: {id: '...', sku: '...', ...}).
 */
function abrirModalImpressoraParaItemUnico(item) {
    // Define a variável global com apenas o item autorizado
    itensParaProducaoGlobal = [item];

    const modal = document.getElementById('impressora-modal');
    const modalContent = document.getElementById('impressora-modal-content');
    
    // Atualiza a contagem e a lista para mostrar apenas o item autorizado
    document.getElementById('impressora-modal-contador').innerText = '1';
    document.getElementById('impressora-modal-lista-itens').innerHTML = `
        <div class="flex justify-between items-center text-sm p-2 rounded-md bg-white border">
            <span class="font-semibold text-gray-800">${item.sku} (Qtd: ${item.quantidade})</span>
            <span class="text-green-600 font-medium flex items-center gap-2">
                <i class="fas fa-check-circle"></i>
                Autorizado para Produção
            </span>
        </div>
    `;

    // Reseta o estado do modal para uma nova seleção
    impressoraSelecionada = null;
    document.getElementById('confirmar-impressao-btn').disabled = true;
    document.querySelectorAll('.impressora-btn').forEach(btn => btn.classList.remove('border-indigo-500', 'bg-indigo-100'));
   
    // Desabilita a opção de "Tirar do Estoque", pois a decisão já é produzir
    const btnEstoque = modal.querySelector('button[onclick="tirarSelecionadosDoEstoque()"]');
    if (btnEstoque) {
        btnEstoque.disabled = true;
        btnEstoque.closest('div.bg-teal-50').classList.add('opacity-50', 'cursor-not-allowed');
    }

    // Abre o modal de decisão de fluxo
    modal.classList.remove('hidden');
    setTimeout(() => { modalContent.classList.remove('scale-95', 'opacity-0'); modalContent.classList.add('scale-100', 'opacity-100'); }, 10);
}

// =================================================================================
// >> FIM DA CORREÇÃO PRINCIPAL <<
// =================================================================================







/**
 * Remove um erro da lista de erros persistentes.
 */
async function removerErro(index) {
    if (confirm(`Tem certeza que deseja remover este aviso de erro?`)) {
        pedidosComErro.splice(index, 1);
        await saveData();
        loadPedidos();
        showToast("Aviso de erro removido.", "success");
    }
}


/**
 * Busca a URL de uma imagem para um SKU específico fazendo uma requisição ao backend.
 * @param {HTMLElement} imgElement - O elemento <img> que precisa ter seu 'src' atualizado.
 */
async function buscarImagemPeloBackend(imgElement) {
  const sku = imgElement.dataset.sku;
  if (!sku) {
    imgElement.src = '/static/images/sem-imagem.png';
    return;
  }

  try {
    // 1. Faz a requisição para a nova API de busca
    const res = await fetch(`/api/images/search?sku=${encodeURIComponent(sku)}`);
    
    if (!res.ok) {
      // Se a resposta não for 200 OK (ex: 404 Not Found), usa a imagem padrão
      imgElement.src = '/static/images/sem-imagem.png';
      return;
    }

    const data = await res.json();

    if (data.image && data.image.full_path) {
      // 2. Constrói a URL para o endpoint que serve a imagem
      // Substitui barras invertidas por normais e codifica para ser uma URL válida
      const imagePathForUrl = data.image.full_path.replace(/\\/g, '/');
      const encodedPath = encodeURIComponent(imagePathForUrl);
      
      // 3. Define o src da imagem para a URL da API que serve o arquivo
      imgElement.src = `/api/images/${encodedPath}`;
    } else {
      imgElement.src = '/static/images/sem-imagem.png';
    }
  } catch (error) {
    console.error(`Erro ao carregar imagem para o SKU ${sku}:`, error);
    imgElement.src = '/static/images/sem-imagem.png';
  }
}








// ================================================================================
// 07-pedidos.js - FUNÇÃO DE RENDERIZAÇÃO DE CARD (VERSÃO CORRIGIDA)
// ================================================================================

/**
 * Gera o HTML para os cards de pedido, tratando pedidos com múltiplos SKUs de forma individual.
 * VERSÃO CORRIGIDA: Pedidos com múltiplos SKUs agora geram cards separados para cada SKU,
 * em vez de um único card de "PACOTE MISTO".
 * @param {Array} listaPedidos - Uma lista (lote) de objetos de pedido para renderizar.
 * @returns {string} O HTML dos cards gerados.
 */
function renderizarCardsDePedido(listaPedidos) {
    const estoquePorSku = itensEstoque.reduce((acc, item) => {
        const skuBase = item.sku.replace(/-(F|V|P|C)$/i, '').trim();
        acc[skuBase] = (acc[skuBase] || 0) + item.qtd;
        return acc;
    }, {});

    // ======================= INÍCIO DA ALTERAÇÃO PRINCIPAL =======================
    // Modificamos a forma como os pacotes são agrupados.
    // Agora, cada SKU de um mesmo pedido é tratado como um "pacote" visual separado.
    const pacotesAgrupados = listaPedidos.reduce((acc, pedido) => {
        const id = pedido.id;
        const sku = pedido.sku;
        
        // Criamos uma chave única combinando o ID do pedido e o SKU.
        const chaveUnica = `${id}-${sku}`;

        if (!acc[chaveUnica]) {
            acc[chaveUnica] = {
                id: id, // Mantém o ID original do pedido
                marketplace: pedido.marketplace,
                tipoEntrega: pedido.tipoEntrega,
                dataColeta: pedido.dataColeta,
                // O campo 'itens' agora conterá apenas itens com o mesmo SKU para este card.
                itens: [] 
            };
        }
        // Adiciona o item ao seu grupo específico de SKU.
        acc[chaveUnica].itens.push({ sku: pedido.sku, quantidade: pedido.quantidade, status: pedido.status, id: pedido.id });
        return acc;
    }, {});
    // ======================== FIM DA ALTERAÇÃO PRINCIPAL =========================

    let cardsHtml = '';

    for (const chavePacote in pacotesAgrupados) {
        const pacote = pacotesAgrupados[chavePacote];
        
        // Como agrupamos por SKU, cada "pacote" agora terá apenas um SKU único.
        const skuUnico = pacote.itens[0].sku;
        const quantidadeTotalItens = pacote.itens.reduce((sum, item) => sum + item.quantidade, 0);
        const skuBaseParaLogica = skuUnico.replace(/-(F|P|V|C)$/i, '').trim();

        const temEstoqueSuficiente = (estoquePorSku[skuBaseParaLogica] || 0) >= quantidadeTotalItens;
        
        const isAguardandoAutorizacao = pacote.itens.some(item => item.status === 'Aguardando Autorização');
        const isMotoboy = pacote.tipoEntrega === 'Motoboy';

        let corBorda, statusHtml, acaoHtml;

        if (isAguardandoAutorizacao) {
            const itemBloqueado = pacote.itens.find(i => i.status === 'Aguardando Autorização');
            corBorda = 'border-yellow-500 animate-pulse';
            statusHtml = `<div class="text-center px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-800 flex items-center gap-2"><i class="fas fa-lock"></i><span>BLOQUEADO</span></div>`;
            acaoHtml = `<button onclick="abrirModalAutorizacao('${itemBloqueado.id}', '${itemBloqueado.sku}')" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-3 rounded-lg text-xs">Autorizar</button>`;
        } else {
            // A lógica de "Múltiplos SKUs" não é mais necessária aqui, pois cada card é de um SKU só.
            if (temEstoqueSuficiente) {
                corBorda = 'border-green-500';
                const estoqueDisponivel = estoquePorSku[skuBaseParaLogica] || 0;
                statusHtml = `<div class="text-center px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800 flex items-center gap-2"><i class="fas fa-check-circle"></i><span>Estoque: ${estoqueDisponivel}</span></div>`;
            } else {
                corBorda = 'border-red-500';
                statusHtml = `<div class="text-center px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800 flex items-center gap-2"><i class="fas fa-exclamation-triangle"></i><span>Estoque Insuficiente</span></div>`;
            }
            
            // O checkbox agora aponta para o SKU específico deste card.
            const checkboxId = `pedido-${pacote.id.replace(/[^a-zA-Z0-9]/g, "")}-${skuUnico.replace(/[^a-zA-Z0-9]/g, "")}`;
            acaoHtml = `<input type="checkbox" id="${checkboxId}" 
                               data-pedido-id="${pacote.id}" 
                               data-skus='${JSON.stringify([skuUnico])}' 
                               onchange="atualizarPainelAcoes()"
                               class="pedido-checkbox h-6 w-6 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer">`;
        }

        if (isMotoboy && !isAguardandoAutorizacao) corBorda = 'border-purple-500';
        
        // O tooltip agora mostra apenas a informação deste SKU.
        const listaSkusTooltip = `${quantidadeTotalItens}x ${skuUnico}`;

        // O título do card agora é sempre o SKU, nunca "PACOTE MISTO".
        const skuHtml = `<p class="font-bold text-lg text-gray-800 cursor-pointer" ondblclick="iniciarEdicaoSku(this, '${pacote.id}', '${skuUnico}')" title="Dê um duplo clique para editar o SKU">${skuUnico}</p>`;
        
        cardsHtml += `
            <div class="bg-white rounded-2xl p-5 shadow-lg border-l-4 ${corBorda} ${isMotoboy ? 'motoboy-card' : ''} flex flex-col justify-between" title="${listaSkusTooltip}" data-pedido-id="${pacote.id}">
                <div>
                    <div class="flex justify-between items-start mb-4"> 
                        <div>
                            ${skuHtml}
                            <p class="text-xs text-gray-500">${pacote.id}</p>
                        </div>
                        <div class="text-right">
                            <p class="font-semibold ${isMotoboy ? 'text-purple-700' : ''}">${pacote.tipoEntrega}</p>
                            <p class="text-xs text-gray-500">Coleta: ${pacote.dataColeta}</p>
                        </div>
                    </div>
                </div>
                <div class="flex justify-between items-center bg-gray-50 p-3 rounded-lg mt-3">
                    <div class="text-center">
                        <p class="text-sm text-gray-600">Itens</p>
                        <p class="font-bold text-xl text-indigo-600">${quantidadeTotalItens}</p>
                    </div>
                    ${statusHtml}
                    <div class="text-center">
                        ${acaoHtml}
                    </div>
                </div>
            </div>`;
    }

    return cardsHtml;
}











/**
 * Lida com o clique no checkbox de um item que requer autorização de admin.
 * @param {HTMLInputElement} checkbox - O elemento do checkbox que foi clicado.
 * @param {object} pedido - O objeto do pedido que precisa de autorização.
 */
function handleAdminCheckboxClick(checkbox, pedido) {
    checkbox.checked = false; // Impede a marcação visual imediata
   
    if (pedido) {
        // Se o status for 'Aguardando Autorização', abre o modal de autenticação
        if (pedido.status === 'Aguardando Autorização') {
            abrirModalAutorizacao(pedido.id, pedido.sku); // Reutiliza o modal de autorização de duplicidade
        } else {
            // Se for outro tipo de bloqueio, usa a lógica original (se existir)
            showToast('Item bloqueado. Aguardando autorização do administrador.', 'info');
        }
    } else {
        showToast('Erro: Dados do pedido não foram recebidos corretamente.', 'error');
    }
   
    atualizarPainelAcoes();
}
/**
 * Renderiza todos os pedidos nas seções corretas da UI: Pendentes, Cancelados e com Erro.
 */
// =================================================================================
// RENDERIZAÇÃO SEGURA DA INTERFACE
// =================================================================================
/**
 * Renderiza todos os pedidos nas seções corretas da UI: Pendentes, Cancelados e com Erro.
 * VERSÃO CORRIGIDA: Verifica se os elementos existem antes de tentar modificá-los.
 */
function renderizarPedidos() {
    const pendentesContainer = document.getElementById('pedidos-pendentes-container');
    const canceladosContainer = document.getElementById('pedidos-cancelados-container');
    const errosContainer = document.getElementById('pedidos-com-erro-container');
    const canceladosSection = document.getElementById('pedidos-cancelados-section');
    const errosSection = document.getElementById('pedidos-com-erro-section');

    if (!pendentesContainer || !canceladosContainer || !errosContainer || !canceladosSection || !errosSection) {
        console.warn("Elementos da UI de 'renderizarPedidos' não encontrados. A renderização foi pulada.");
        return;
    }

    pendentesContainer.innerHTML = '';
    canceladosContainer.innerHTML = '';
    errosContainer.innerHTML = '';

    const pedidosPendentes = pedidos.filter(p => p.status === 'Pendente');
    const pedidosCancelados = pedidos.filter(p => p.status === 'Cancelado');

    if (pedidosPendentes.length > 0) {
        pendentesContainer.innerHTML = pedidosPendentes.map(pedido => `
            <div class="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                <p class="font-bold text-gray-800">${pedido.sku}</p>
                <p class="text-sm text-gray-600">${pedido.id} - Qtd: ${pedido.quantidade}</p>
            </div>
        `).join('');
    } else {
        pendentesContainer.innerHTML = '<p class="text-gray-500 col-span-full">Nenhum pedido pendente.</p>';
    }

    if (pedidosCancelados.length > 0) {
        canceladosSection.classList.remove('hidden');
        canceladosContainer.innerHTML = pedidosCancelados.map(pedido => `
            <div class="bg-red-100 p-4 rounded-lg shadow border-l-4 border-red-500">
                <p class="font-bold text-red-800">${pedido.sku}</p>
                <p class="text-sm text-red-600">${pedido.id} - Qtd: ${pedido.quantidade}</p>
                <p class="text-xs font-semibold text-red-700 mt-2">VENDA CANCELADA. NÃO ENVIAR.</p>
            </div>
        `).join('');
    } else {
        canceladosSection.classList.add('hidden');
    }

    if (pedidosComErro.length > 0) {
        errosSection.classList.remove('hidden');
        errosContainer.innerHTML = pedidosComErro.map((erro, index) => `
            <div class="bg-orange-100 p-4 rounded-lg shadow border-l-4 border-orange-500 flex justify-between items-center">
                <div>
                    <p class="font-bold text-orange-800">ID: ${erro.id}</p>
                    <p class="text-sm text-orange-600">${erro.motivo}</p>
                </div>
                <button onclick="removerErro(${index})" class="text-orange-500 hover:text-orange-700 font-bold">X</button>
            </div>
        `).join('');
    } else {
        errosSection.classList.add('hidden');
    }
}
// =================================================================================
// ATUALIZAÇÃO DA FUNÇÃO DO PAINEL DE AÇÕES (VERSÃO DE DIAGNÓSTICO)
// =================================================================================
/**
 * Função de diagnóstico para descobrir por que a cópia automática de SKUs não está funcionando.
 * Adiciona logs no console para rastrear o fluxo de execução.
 */
function atualizarPainelAcoes() {
    console.log("--- [DIAGNÓSTICO] Função 'atualizarPainelAcoes' foi chamada. ---");

    const painel = document.getElementById('painel-acoes-massa');
    const contador = document.getElementById('contador-selecionados');
    if (!painel || !contador) {
        console.error("[DIAGNÓSTICO] ERRO: Elemento 'painel-acoes-massa' ou 'contador-selecionados' não encontrado.");
        return;
    }

    // 1. Encontra todos os checkboxes marcados.
    const selecionados = document.querySelectorAll('.pedido-checkbox:checked');
    console.log(`[DIAGNÓSTICO] Encontrados ${selecionados.length} checkboxes selecionados.`);

    if (selecionados.length > 0) {
        contador.innerText = selecionados.length;
        painel.classList.remove('hidden');
        
        const skusParaCopiar = new Set();

        // 2. Itera sobre cada checkbox para extrair os SKUs.
        selecionados.forEach((checkbox, index) => {
            console.log(`[DIAGNÓSTICO] Processando checkbox #${index + 1}`);
            
            // Verifica se o atributo 'data-skus' existe.
            if (checkbox.dataset && typeof checkbox.dataset.skus !== 'undefined') {
                const skusString = checkbox.dataset.skus;
                console.log(`  - Atributo 'data-skus' encontrado: ${skusString}`);
                
                try {
                    // Tenta converter a string JSON para um array.
                    const skusDoPacote = JSON.parse(skusString);
                    console.log(`  - SKUs parseados do JSON:`, skusDoPacote);

                    skusDoPacote.forEach(sku => {
                        if (sku) {
                            const skuBase = sku.replace(/-(F|P|V|C)$/i, "");
                            skusParaCopiar.add(skuBase);
                        }
                    });
                } catch (e) {
                    console.error(`  - ERRO CRÍTICO: Falha ao fazer o parse do JSON '${skusString}'. Erro:`, e);
                }
            } else {
                console.warn(`  - AVISO: O checkbox #${index + 1} não possui o atributo 'data-skus'.`);
            }
        });
        
        // 3. Converte o conjunto de SKUs para uma string.
        const textoParaCopiar = Array.from(skusParaCopiar).join(',');
        console.log(`[DIAGNÓSTICO] Texto final para copiar: "${textoParaCopiar}"`);
        
        // 4. Tenta copiar.
        if (textoParaCopiar) {
            console.log("[DIAGNÓSTICO] Chamando a função copyToClipboard...");
            // Usamos a função robusta que já está no seu código
            copyToClipboard(textoParaCopiar);
        } else {
            console.warn("[DIAGNÓSTICO] A cópia não foi acionada porque o texto final estava vazio.");
        }

    } else {
        painel.classList.add('hidden');
    }
    console.log("--- [DIAGNÓSTICO] Fim da execução. ---");
}








// =================================================================================
// >> INÍCIO: FUNÇÕES DE EDIÇÃO DE SKU <<
// =================================================================================

// Variável global para guardar os dados do item que está sendo editado
let edicaoSkuEmAndamento = null;

// Variável global para guardar os dados do item bloqueado que está sendo autorizado
let itemBloqueadoEmAutorizacao = null;

/**
 * Função principal chamada pelo duplo clique no SKU.
 * Inicia o processo de edição, guardando os dados do item e abrindo o modal de senha.
 * @param {HTMLElement} elementoSku - O elemento HTML (ex: <p>) que contém o SKU.
 * @param {string} pedidoId - O ID do pedido (ex: '#2000009261599029').
 * @param {string} skuAtual - O SKU atual que será editado.
 */
function iniciarEdicaoSku(elementoSku, pedidoId, skuAtual) {
    // Verifica se o usuário tem permissão para editar
    if (!hasPermission('pedidos', 'editar')) {
        showToast('Você não tem permissão para editar SKUs.', 'error');
        return;
    }

    // Guarda as informações necessárias para quando a senha for validada
    edicaoSkuEmAndamento = {
        elemento: elementoSku,
        pedidoId: pedidoId,
        skuAntigo: skuAtual
    };

    // Abre o modal de autenticação
    const modal = document.getElementById('admin-auth-modal');
    const modalContent = document.getElementById('admin-auth-modal-content');
   
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
   
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
        document.getElementById('admin-password-input').focus(); // Foca no campo de senha
    }, 10);
}

/**
 * Valida a senha do administrador e, se correta, transforma o SKU em um campo editável.
 */
function validarSenhaEProsseguirEdicao() {
    const senhaInput = document.getElementById('admin-password-input');
    const senhaDigitada = senhaInput.value;

    // Encontra um usuário que seja 'admin-master' para validar a senha
    const adminUser = users.find(u => u.role === 'admin-master' && u.password === senhaDigitada);

    if (!adminUser) {
        showToast('Senha de administrador incorreta!', 'error');
        senhaInput.value = ''; // Limpa o campo
        senhaInput.focus();
        return;
    }

    // Se a senha está correta, fecha o modal e habilita a edição
    fecharModalAuth();
    const { elemento, skuAntigo } = edicaoSkuEmAndamento;

    // Transforma o texto do SKU em um campo de input para edição
    elemento.innerHTML = `
        <div class="flex items-center gap-1">
            <input type="text" value="${skuAntigo}" class="w-full p-1 border-2 border-indigo-400 rounded focus:outline-none" id="sku-edit-input">
            <button onclick="salvarEdicaoSku()" class="text-green-600 hover:text-green-800 p-1"><i class="fas fa-check"></i></button>
            <button onclick="cancelarEdicaoSku(true)" class="text-red-600 hover:text-red-800 p-1"><i class="fas fa-times"></i></button>
        </div>
    `;
   
    const inputEdicao = document.getElementById('sku-edit-input');
    inputEdicao.focus();
    inputEdicao.select(); // Seleciona o texto para facilitar a digitação

    // Adiciona um "escutador" para salvar com 'Enter' ou cancelar com 'Escape'
    inputEdicao.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            salvarEdicaoSku();
        } else if (e.key === 'Escape') {
            cancelarEdicaoSku(true);
        }
    });
}

/**
 * Salva o novo SKU no sistema.
 */
async function salvarEdicaoSku() {
    const novoSkuInput = document.getElementById('sku-edit-input');
    if (!novoSkuInput) return; // Evita erro se o elemento não existir

    const novoSku = novoSkuInput.value.trim().toUpperCase();
    const { pedidoId, skuAntigo } = edicaoSkuEmAndamento;

    if (!novoSku || novoSku === skuAntigo) {
        cancelarEdicaoSku(true);
        return;
    }

    // Encontra o item de pedido correspondente no array 'pedidos'
    const pedidoItem = pedidos.find(p => p.id === pedidoId && p.sku === skuAntigo);
    
    if (pedidoItem) {
        pedidoItem.sku = novoSku;
        
        await saveData();
        
        logAction(`ADMIN EDIT: SKU do pedido ${pedidoId} alterado de '${skuAntigo}' para '${novoSku}'.`);
        showToast('SKU atualizado com sucesso!', 'success');
        
        loadPedidos(); // Recarrega a visualização dos pedidos para refletir a mudança
    } else {
        showToast('Erro: Não foi possível encontrar o item do pedido para atualizar.', 'error');
        cancelarEdicaoSku(true);
    }

    edicaoSkuEmAndamento = null;
}

/**
 * Cancela a operação de edição e restaura a visualização.
 * @param {boolean} restaurarVisualizacao - Se true, restaura o texto original do SKU.
 */
function cancelarEdicaoSku(restaurarVisualizacao = false) {
    if (restaurarVisualizacao && edicaoSkuEmAndamento) {
        const { elemento, skuAntigo } = edicaoSkuEmAndamento;
        elemento.innerText = skuAntigo;
    }
    fecharModalAuth();
    edicaoSkuEmAndamento = null;
}

/**
 * Função auxiliar para fechar e resetar o modal de autenticação.
 */
function fecharModalAuth() {
    const modal = document.getElementById('admin-auth-modal');
    const modalContent = document.getElementById('admin-auth-modal-content');
   
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
        document.getElementById('admin-password-input').value = '';
    }, 200);
}

// =================================================================================
// >> FIM: FUNÇÕES DE EDIÇÃO DE SKU <<
// =================================================================================


// =================================================================================
// >> INÍCIO: FUNÇÕES DE AUTORIZAÇÃO DE ITEM BLOQUEADO <<
// =================================================================================

/**
 * Abre o modal de autorização para um item bloqueado.
 * @param {string} pedidoId - O ID do pedido.
 * @param {string} sku - O SKU do item bloqueado.
 */
function abrirModalAutorizacao(pedidoId, sku) {
    // Verifica se o usuário tem permissão para editar (que engloba autorizar)
    if (!hasPermission('pedidos', 'editar')) {
        showToast('Você não tem permissão para autorizar itens bloqueados.', 'error');
        return;
    }

    // Encontra o item de pedido correspondente no array 'pedidos'
    const pedidoItem = pedidos.find(p => p.id === pedidoId && p.sku === sku && p.status === 'Aguardando Autorização');
    
    if (!pedidoItem) {
        showToast('Erro: Item bloqueado não encontrado ou status incorreto.', 'error');
        return;
    }

    // Guarda os dados do item para uso posterior
    itemBloqueadoEmAutorizacao = pedidoItem;

    // Pega os elementos do modal
    const modal = document.getElementById('autorizacao-item-modal');
    const modalContent = document.getElementById('autorizacao-item-modal-content');
    const skuLabel = document.getElementById('autorizacao-sku-label');
    const pedidoLabel = document.getElementById('autorizacao-pedido-label');
    const novoSkuInput = document.getElementById('autorizacao-novo-sku-input');

    // Preenche as informações no modal
    skuLabel.innerText = pedidoItem.sku;
    pedidoLabel.innerText = pedidoItem.id;
    novoSkuInput.value = ''; // Limpa o campo de input

    // Exibe o modal com animação
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
        novoSkuInput.focus();
    }, 10);
}

/**
 * Fecha o modal de autorização.
 */
function fecharModalAutorizacao() {
    const modal = document.getElementById('autorizacao-item-modal');
    const modalContent = document.getElementById('autorizacao-item-modal-content');
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
        itemBloqueadoEmAutorizacao = null; // Limpa a variável
    }, 200);
}

/**
 * Ação do administrador para autorizar o item bloqueado.
 * @param {boolean} alterarSku - Se true, usa o SKU do input. Se false, usa o SKU original.
 */
async function autorizarItemBloqueado(alterarSku) {
    if (!itemBloqueadoEmAutorizacao) return;

    let novoSku = itemBloqueadoEmAutorizacao.sku; // Padrão: mantém o SKU original

    if (alterarSku) {
        const novoSkuInput = document.getElementById('autorizacao-novo-sku-input');
        const skuDigitado = novoSkuInput.value.trim().toUpperCase();

        if (!skuDigitado) {
            showToast('Por favor, insira um novo SKU válido ou use a opção "Autorizar com SKU Atual".', 'error');
            return;
        }
        novoSku = skuDigitado;
    }

    const { id, sku } = itemBloqueadoEmAutorizacao;
    const skuAntigo = sku;

    // 1. Atualiza o SKU no array local, se necessário
    if (novoSku !== skuAntigo) {
        itemBloqueadoEmAutorizacao.sku = novoSku;
        logAction(`ADMIN AUTORIZAÇÃO: SKU do item bloqueado ${id} alterado de '${skuAntigo}' para '${novoSku}'.`);
    }

    // 2. Muda o status para 'Pendente' e salva.
    itemBloqueadoEmAutorizacao.status = 'Pendente';
    await saveData();
    
    showToast(`Item ${id} - ${novoSku} autorizado e liberado para produção!`, 'success');
    logAction(`ADMIN AUTORIZAÇÃO: Item bloqueado ${id} - ${novoSku} liberado para produção.`);

    // 3. Fecha o modal e recarrega a visualização
    fecharModalAutorizacao();
    loadPedidos();
}

// =================================================================================
// >> FIM: FUNÇÕES DE AUTORIZAÇÃO DE ITEM BLOQUEADO <<
// =================================================================================




// ARQUIVO: 07-pedidos.js
// SUBSTITUA A FUNÇÃO 'confirmarMovimentacao' PELA VERSÃO CORRIGIDA ABAIXO

/**
 * Inicia o fluxo de decisão, preparando os itens selecionados para o modal.
 * VERSÃO CORRIGIDA: Garante que a regra de bloqueio da "2ª unidade" seja aplicada
 * corretamente para pedidos com múltiplos SKUs, processando apenas a primeira
 * unidade de cada SKU por vez.
 */
async function confirmarMovimentacao() {
    if (!hasPermission('pedidos', 'processar')) {
        showToast('Permissão negada para processar pedidos.', 'error');
        return;
    }

    const selecionados = document.querySelectorAll('.pedido-checkbox:checked');
    if (selecionados.length === 0) {
        showToast("Nenhum pacote selecionado.", "info");
        return;
    }

    let itensParaProcessar = [];
    
    // ======================= INÍCIO DA CORREÇÃO PRINCIPAL =======================
    // 1. Coleta todos os itens PENDENTES dos pacotes selecionados
    let todosOsItensPendentes = [];
    selecionados.forEach(checkbox => {
        const pedidoId = checkbox.dataset.pedidoId;
        // O JSON.parse pode falhar se o data-skus estiver mal formatado. Adicionamos um try-catch.
        try {
            const skusDoPacote = JSON.parse(checkbox.dataset.skus);
            skusDoPacote.forEach(sku => {
                const unidadesDoItem = pedidos.filter(p => 
                    p.id === pedidoId && 
                    p.sku === sku && 
                    p.status === 'Pendente'
                );
                if (unidadesDoItem.length > 0) {
                    todosOsItensPendentes.push(...unidadesDoItem);
                }
            });
        } catch (e) {
            console.error(`Erro ao processar SKUs do pedido ${checkbox.dataset.pedidoId}:`, e);
            showToast(`Erro de formato nos dados do pedido ${checkbox.dataset.pedidoId}. Verifique o console.`, 'error');
        }
    });

    // 2. Lógica para selecionar APENAS A PRIMEIRA UNIDADE de cada SKU/Pedido
    const itensJaAdicionados = new Set(); // Controla combinações de 'pedidoId-sku' já processadas

    todosOsItensPendentes.forEach(item => {
        const chaveUnica = `${item.id}-${item.sku}`;
        // Se esta combinação de pedido e SKU ainda não foi adicionada à lista de processamento...
        if (!itensJaAdicionados.has(chaveUnica)) {
            // ...adiciona o item (que representa a primeira unidade) e marca a chave como processada.
            itensParaProcessar.push(item);
            itensJaAdicionados.add(chaveUnica);
        }
        // As unidades subsequentes (2ª, 3ª, etc.) do mesmo SKU/Pedido serão ignoradas neste loop.
    });
    // ======================== FIM DA CORREÇÃO PRINCIPAL =========================

    if (itensParaProcessar.length === 0) {
        showToast("Nenhum item pendente válido para processar.", "info");
        selecionados.forEach(checkbox => checkbox.checked = false);
        atualizarPainelAcoes();
        return;
    }

    // 3. Define a variável global com os itens que serão mostrados no modal (agora apenas as primeiras unidades)
    itensParaProducaoGlobal = itensParaProcessar;

    // 4. Abre o modal de decisão para o usuário
    abrirModalImpressora();
    
    // 5. Limpa a seleção na UI
    selecionados.forEach(checkbox => checkbox.checked = false);
    atualizarPainelAcoes();
}


/**
 * Lógica centralizada para mover UM item para o fluxo correto.
 * Esta função agora lida com a resposta de bloqueio do backend e atualiza a UI de acordo.
 * @param {string} pedidoId - O ID do pedido.
 * @param {string} sku - O SKU do item.
 * @param {boolean} forcarProducao - Se true, envia para produção, senão, para expedição.
 * @param {boolean} isAuthorizedUnit - Indica se a unidade foi autorizada pelo admin.
 * @returns {Promise<boolean>} Retorna true se o item foi movido com sucesso.
 */
async function moverItemParaFluxo(pedidoId, sku, forcarProducao = false, isAuthorizedUnit = false) {
    const destino = forcarProducao ? 'Produção' : 'Expedição';
    const impressora = forcarProducao ? impressoraSelecionada : null;

    if (forcarProducao && !impressora) {
        showToast("Por favor, selecione uma impressora para enviar à produção.", "error");
        return false;
    }

    try {
        const response = await fetch('/api/pedidos/mover_para_fluxo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pedidoId,
                sku,
                destino,
                impressora,
                usuario: currentUser.username,
                isAuthorizedUnit // Envia a flag de autorização
            })
        });

        const result = await response.json();

        // ===================================================================
        // >> PONTO-CHAVE DA CORREÇÃO NO FRONTEND <<
        // ===================================================================
        // Se o backend retornou status 403 (Forbidden) com a flag 'auth_required'...
        if (response.status === 403 && result.status === 'auth_required') {
            // ...significa que o item foi bloqueado com sucesso.
            showToast(result.message, 'warning', 7000); // Mostra o aviso para o usuário
            
            // A UI será atualizada pelo sinal do WebSocket ('dados_atualizados'),
            // então não precisamos chamar loadPedidos() aqui para evitar duplicação.
            // Apenas removemos o item do modal de decisão.
            const itemIndexModal = itensParaProducaoGlobal.findIndex(p => p.id === pedidoId && p.sku === sku);
            if (itemIndexModal > -1) {
                itensParaProducaoGlobal.splice(itemIndexModal, 1);
            }
            renderizarListaModal(); // Atualiza a lista de itens restantes no modal

            return false; // Indica que a movimentação não foi concluída (foi bloqueada)
        }

        if (!response.ok) {
            showToast(result.message || `Erro ao mover o item ${sku}.`, 'error');
            return false;
        }

        // Se a movimentação foi bem-sucedida:
        showToast(result.message, 'success');
        
        // Remove o item da lista do modal, pois foi processado com sucesso.
        // A UI principal será atualizada pelo WebSocket.
        const itemIndexModal = itensParaProducaoGlobal.findIndex(p => p.id === pedidoId && p.sku === sku);
        if (itemIndexModal > -1) {
            itensParaProducaoGlobal.splice(itemIndexModal, 1);
        }
        renderizarListaModal();
        
        return true;

    } catch (error) {
        console.error("Erro de rede ao mover item:", error);
        showToast('Erro de comunicação com o servidor.', 'error');
        return false;
    }
}


/**
 * Função chamada após o aviso (ou diretamente) para abrir o modal da impressora.
 */
function prosseguirParaImpressora() {
    // Esconde o modal de aviso, se estiver aberto
    document.getElementById('aviso-especial-modal').classList.add('hidden');
    // Copia os SKUs para a área de transferência
    const skusParaCopiar = [];
    itensParaProducaoGlobal.forEach(pedido => {
        const skuLimpo = pedido.sku.replace(/-(F|V|P|C)$/i, '');
        for (let i = 0; i < pedido.quantidade; i++) {
            skusParaCopiar.push(skuLimpo);
        }
    });
   
    navigator.clipboard.writeText(skusParaCopiar.join(',')).catch(err => console.error('Falha ao copiar SKUs: ', err));
    // Abre o modal da impressora
    abrirModalImpressora(itensParaProducaoGlobal.length);
}
/**
 * Renderiza ou atualiza a lista de itens dentro do modal de decisão.
 * Esta função será chamada sempre que um item for processado.
 */
function renderizarListaModal() {
    const listaItensEl = document.getElementById('impressora-modal-lista-itens');
    const contadorEl = document.getElementById('impressora-modal-contador');
    contadorEl.innerText = itensParaProducaoGlobal.length;
    if (itensParaProducaoGlobal.length === 0) {
        listaItensEl.innerHTML = '<p class="text-center text-green-600 font-semibold p-4">Todos os itens foram processados!</p>';
        // Fecha o modal automaticamente após um breve período
        setTimeout(fecharModalImpressora, 1500);
        return;
    }
    const estoquePorSku = itensEstoque.reduce((acc, item) => {
        const skuBase = item.sku.replace(/-(F|V|P|C)$/i, '');
        acc[skuBase] = (acc[skuBase] || 0) + item.qtd;
        return acc;
    }, {});
    listaItensEl.innerHTML = itensParaProducaoGlobal.map(pedido => {
        const skuBasePedido = pedido.sku.replace(/-(F|V|P|C)$/i, '');
        const estoqueDisponivel = estoquePorSku[skuBasePedido] || 0;
        const temEstoque = estoqueDisponivel >= pedido.quantidade;
        // Botão de Expedição só aparece se tiver estoque
        const botaoExpedicao = temEstoque ?
            `<button onclick="moverItemParaFluxo('${pedido.id}', '${pedido.sku}', false)" class="bg-teal-500 text-white px-3 py-1 rounded-md text-xs font-semibold hover:bg-teal-600">Expedição</button>` :
            '';
        return `
            <div class="flex justify-between items-center text-sm p-2 rounded-md bg-white border">
                <span class="font-semibold text-gray-800">${pedido.sku} (Qtd: ${pedido.quantidade})</span>
                <div class="flex items-center gap-2">
                    ${botaoExpedicao}
                    <button onclick="moverItemParaFluxo('${pedido.id}', '${pedido.sku}', true)" class="bg-indigo-500 text-white px-3 py-1 rounded-md text-xs font-semibold hover:bg-indigo-600">Produção</button>
                </div>
            </div>
        `;
    }).join('');
}
/**
 * Abre o modal de decisão de fluxo (impressora ou estoque), agora mostrando a lista de itens.
 */
function abrirModalImpressora() {
    const modal = document.getElementById('impressora-modal');
    const modalContent = document.getElementById('impressora-modal-content');
    const contadorEl = document.getElementById('impressora-modal-contador');
    const listaItensEl = document.getElementById('impressora-modal-lista-itens');
    // A lista de itens a processar está na variável global 'itensParaProducaoGlobal'
    contadorEl.innerText = itensParaProducaoGlobal.length;
     // Renderiza a lista de itens interativa
    renderizarListaModal();
    // Mapeia o estoque para consulta rápida
    const estoquePorSku = itensEstoque.reduce((acc, item) => {
        const skuBase = item.sku.replace(/-(F|V|P|C)$/i, '');
        acc[skuBase] = (acc[skuBase] || 0) + item.qtd;
        return acc;
    }, {});
    // Monta a lista de itens para exibir no modal
    listaItensEl.innerHTML = itensParaProducaoGlobal.map(pedido => {
        const skuBasePedido = pedido.sku.replace(/-(F|V|P|C)$/i, '');
        const estoqueDisponivel = estoquePorSku[skuBasePedido] || 0;
        const temEstoque = estoqueDisponivel >= pedido.quantidade;
        const statusClass = temEstoque ? 'text-green-600' : 'text-yellow-600';
        const statusIcon = temEstoque ? 'fa-check-circle' : 'fa-exclamation-triangle';
        const statusText = temEstoque ? `Em estoque (${estoqueDisponivel})` : 'Sem estoque';
        return `
            <div class="flex justify-between items-center text-sm p-2 rounded-md hover:bg-gray-100">
                <span class="font-semibold text-gray-800">${pedido.sku} (Qtd: ${pedido.quantidade})</span>
                <span class="${statusClass} font-medium flex items-center gap-2">
                    <i class="fas ${statusIcon}"></i>
                    ${statusText}
                </span>
            </div>
        `;
    }).join('');
    // Reseta o estado do modal
    impressoraSelecionada = null;
    document.getElementById('confirmar-impressao-btn').disabled = true;
    document.querySelectorAll('.impressora-btn').forEach(btn => btn.classList.remove('border-indigo-500', 'bg-indigo-100'));
    modal.classList.remove('hidden');
    setTimeout(() => { modalContent.classList.remove('scale-95', 'opacity-0'); modalContent.classList.add('scale-100', 'opacity-100'); }, 10);
}
function fecharModalImpressora() {
    const modal = document.getElementById('impressora-modal');
    modal.classList.add('hidden');
}

/**
 * Define a impressora selecionada e atualiza a UI do modal.
 */
function setImpressora(impressora) {
    impressoraSelecionada = impressora;
    document.querySelectorAll('.impressora-btn').forEach(btn => {
        btn.classList.remove('border-indigo-500', 'bg-indigo-100');
    });
    event.currentTarget.classList.add('border-indigo-500', 'bg-indigo-100');
    document.getElementById('confirmar-impressao-btn').disabled = false;
}
/**
 * Função para o botão "Tirar do Estoque" dentro do modal.
 * Processa apenas os itens da seleção que têm estoque disponível.
 * ESTA VERSÃO CORRIGE A VERIFICAÇÃO DE ESTOQUE COMPARANDO O SKU BASE.
 */
/**
 * Função para o botão "Tirar do Estoque" dentro do modal.
 * Processa apenas os itens da seleção que têm estoque disponível.
 * VERSÃO CORRIGIDA: Usa um loop 'for...of' para esperar cada operação assíncrona
 * e remove a chamada desnecessária a saveData().
 */
async function tirarSelecionadosDoEstoque() {
    let itensMovidos = 0;
    let itensIgnorados = 0;
    
    // Usamos um loop for...of que respeita o 'await' dentro dele.
    for (const pedido of itensParaProducaoGlobal) {
        const skuOriginal = pedido.sku;
        const skuBase = skuOriginal.replace(/-(F|P|V|C)$/i, '').trim();

        const estoqueDisponivel = itensEstoque
            .filter(item => item.sku === skuBase)
            .reduce((sum, item) => sum + item.qtd, 0);

        if (estoqueDisponivel >= pedido.quantidade) {
            // Espera a conclusão da chamada à API para cada item.
            const foiMovido = await moverItemParaFluxo(pedido.id, skuOriginal, false); 
            if (foiMovido) {
                itensMovidos++;
            }
        } else {
            itensIgnorados++;
        }
    }

    // ======================= INÍCIO DA CORREÇÃO =======================
    // REMOVEMOS a chamada `await saveData()` daqui.
    // A persistência dos dados agora é responsabilidade exclusiva do backend
    // em cada chamada individual da rota /api/pedidos/mover_para_fluxo.
    // O frontend não precisa mais se preocupar em salvar o estado geral.
    // ======================== FIM DA CORREÇÃO =========================

    // Feedback final para o usuário
    if (itensMovidos > 0) {
        let feedback = `${itensMovidos} item(ns) foram retirados do estoque e enviados para a expedição.`;
        if (itensIgnorados > 0) {
            feedback += ` ${itensIgnorados} item(ns) sem estoque foram ignorados.`;
        }
        showToast(feedback, 'success');
    } else {
        showToast('Nenhum dos itens selecionados possuía estoque suficiente.', 'info');
    }

    // Fecha o modal se todos os itens foram processados ou ignorados.
    // A atualização da lista de itens dentro do modal já é feita pela `moverItemParaFluxo`.
    if (itensParaProducaoGlobal.length === 0) {
        fecharModalImpressora();
    }
}

// ARQUIVO: 07-pedidos.js
// SUBSTITUA A FUNÇÃO 'processarPedidosManuais' PELA VERSÃO ABAIXO

/**
 * Processa e cadastra os pedidos inseridos manualmente na aba "Pedidos Manuais (VC)".
 * VERSÃO OTIMIZADA: Usa uma API leve para adicionar pedidos e adiciona uma flag 'origem'
 * para garantir que os pedidos permaneçam na aba correta.
 */
async function processarPedidosManuais() {
    // 1. Permissão e coleta de dados (inalterado)
    if (!hasPermission('pedidos', 'cadastrar')) {
        showToast('Você não tem permissão para cadastrar pedidos manuais.', 'error');
        return;
    }
    const idOriginal = document.getElementById('vc-id').value.trim();
    const skusInput = document.getElementById('vc-skus').value.trim();
    const loja = document.getElementById('vc-loja').value.trim();
    const material = document.getElementById('vc-material').value;

    if (!idOriginal || !skusInput || !loja) {
        showToast('Por favor, preencha todos os campos: ID, SKUs e Loja.', 'error');
        return;
    }

    const skusArray = skusInput.split(',').map(item => item.trim().toUpperCase()).filter(item => item !== '');
    if (skusArray.length === 0) {
        showToast('Nenhum SKU válido foi inserido.', 'error');
        return;
    }

    let idFinal = idOriginal.startsWith('#') ? idOriginal : '#' + idOriginal;
    
    // 2. Prepara a lista de novos pedidos para enviar ao backend
    const novosPedidosParaApi = skusArray.map(sku => ({
        id: idFinal,
        marketplace: loja,
        dataColeta: new Date().toLocaleDateString('pt-BR'),
        tipoEntrega: 'Manual',
        sku: sku,
        quantidade: 1,
        status: 'Pendente',
        material: material,
        dataImportacao: new Date().toISOString(),
        origem: 'Manual' // <-- PONTO-CHAVE: Adiciona a flag de origem
    }));

    // 3. OTIMIZAÇÃO: Chama a API leve em vez de saveData()
    try {
        const response = await fetch('/api/pedidos/add_manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pedidos: novosPedidosParaApi })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Erro ao salvar pedido no servidor.');
        }

        // 4. Atualização local e feedback (muito mais rápido)
        pedidos.push(...novosPedidosParaApi); // Adiciona os pedidos à lista local
        
        showToast(`${novosPedidosParaApi.length} item(ns) do pedido manual foram cadastrados!`, 'success');
        logAction({
            acao: 'Pedido manual cadastrado',
            modulo: 'Pedidos',
            detalhes: { pedidoId: idFinal, skus: skusArray.join(', '), loja: loja }
        });

        // Limpa o formulário
        document.getElementById('vc-id').value = '';
        document.getElementById('vc-skus').value = '';
        document.getElementById('vc-loja').value = '';
        document.getElementById('vc-material').value = 'Nenhum';
        atualizarSkuManual();

        // Recarrega a UI
        loadPedidos();

    } catch (error) {
        console.error('Erro ao processar pedido manual:', error);
        showToast(`Falha ao cadastrar pedido: ${error.message}`, 'error');
    }
}






/**
 * NOVA FUNÇÃO (v2): Sugere um SKU no formulário de pedidos manuais,
 * mas permite que o usuário edite ou adicione outros SKUs.
 */
function atualizarSkuManual() {
    // 1. Pega os elementos do formulário.
    const idInput = document.getElementById('vc-id');
    const materialSelect = document.getElementById('vc-material');
    const skuInput = document.getElementById('vc-skus');
    // 2. Pega os valores atuais.
    const idValue = idInput.value.trim();
    const materialValue = materialSelect.value;
    const skuAtual = skuInput.value.trim();
    // 3. Gera o SKU sugerido (com espaço).
    let skuSugerido = '';
    if (idValue.length >= 5 && materialValue && materialValue !== 'Nenhum') {
        const idPrefixo = idValue.substring(0, 5);
        // Adiciona o espaço entre o prefixo e o material.
        skuSugerido = `${idPrefixo} ${materialValue.toUpperCase()}`;
    }
    // 4. Lógica de preenchimento inteligente:
    // Só preenche o campo se ele estiver vazio ou se o conteúdo atual for uma sugestão anterior.
    // Isso evita apagar algo que o usuário digitou manualmente.
    const sugestaoAnteriorRegex = /^\d{5}\s[A-Z]+$/; // Regex para "12345 MATERIAL"
    if (skuAtual === '' || sugestaoAnteriorRegex.test(skuAtual)) {
        skuInput.value = skuSugerido;
    }
}
/**
 * Controla a exibição das abas e filtra os erros e cancelamentos
 * para mostrar apenas os que pertencem à aba selecionada.
 * @param {'ml' | 'shopee' | 'vc'} tabName - O nome da aba para a qual o usuário deseja navegar.
 */
function showTab(tabName) {
    // ======================= LÓGICA DE EXIBIÇÃO DA NOVA ABA =========================
    // 1. Esconde o conteúdo de TODAS as abas.
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    // 2. Remove o estilo "ativo" de TODOS os botões de aba.
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('border-indigo-600', 'text-indigo-600');
        btn.classList.add('border-transparent', 'text-gray-500');
    });
    // 3. Mostra o conteúdo da aba selecionada.
    const contentToShow = document.getElementById(`pedidos-${tabName}-section`);
    if (contentToShow) {
        contentToShow.classList.remove('hidden');
    }
    // 4. Aplica o estilo "ativo" ao botão da aba clicada.
    const btnToActivate = document.getElementById(`tab-${tabName}`);
    if (btnToActivate) {
        btnToActivate.classList.add('border-indigo-600', 'text-indigo-600');
        btnToActivate.classList.remove('border-transparent', 'text-gray-500');
    }
    // ======================= FILTRAGEM DE ERROS PARA A ABA ATUAL (SEM TRAVAMENTO) =======================
   
    // Filtra e exibe erros e cancelados APENAS da aba que está sendo aberta.
    const marketplaceMap = { ml: 'Mercado Livre', shopee: 'Shopee' };
    const marketplaceAtivo = marketplaceMap[tabName];
    const errosSection = document.getElementById('pedidos-com-erro-section');
    const errosContainer = document.getElementById('pedidos-com-erro-container');
    const canceladosSection = document.getElementById('pedidos-cancelados-section');
    const canceladosContainer = document.getElementById('pedidos-cancelados-container');
    let errosDaAba = [];
    // LÓGICA DE FILTRAGEM CORRIGIDA E FINAL
    if (tabName === 'vc') {
        // Erros da aba 'VC' são aqueles cujo marketplace NÃO é 'Mercado Livre' nem 'Shopee'.
        errosDaAba = pedidosComErro.filter(erro =>
            erro.marketplace !== 'Mercado Livre' && erro.marketplace !== 'Shopee'
        );
    } else if (marketplaceAtivo) {
        // Filtra erros que pertencem EXATAMENTE ao marketplace da aba ativa.
        errosDaAba = pedidosComErro.filter(erro => erro.marketplace === marketplaceAtivo);
    }
    const canceladosDaAba = pedidos.filter(p =>
        p.status === 'Cancelado' &&
        (tabName === 'vc' ? (p.marketplace !== 'Mercado Livre' && p.marketplace !== 'Shopee') : p.marketplace === marketplaceAtivo)
    );
    // Renderiza a seção de erros SOMENTE se houver erros para a aba atual.
    // Garante que a seção de erros esteja sempre visível.
errosSection.classList.remove('hidden');

// Renderiza a seção de erros. Se não houver erros para a aba atual, exibe uma mensagem.
if (errosDaAba.length > 0) {
    errosContainer.innerHTML = errosDaAba.map((erro) => `
        <div class="bg-orange-100 p-4 rounded-lg shadow border-l-4 border-orange-500 flex justify-between items-center">
            <div>
                <p class="font-bold text-orange-800">ID: ${erro.id}</p>
                <p class="text-sm text-orange-600">${erro.motivo}</p>
            </div>
            <button onclick="removerErro(${pedidosComErro.indexOf(erro)})" class="text-orange-500 hover:text-orange-700 font-bold">X</button>
        </div>
    `).join('');
} else {
    // Em vez de esconder, mostra uma mensagem indicando que não há erros.
    errosContainer.innerHTML = '<p class="text-gray-500 col-span-full text-center py-4">Nenhum erro de importação para esta loja.</p>';
}

    // Renderiza a seção de cancelados SOMENTE se houver para a aba atual.
    // Renderiza a seção de cancelados SOMENTE se houver para a aba atual.
    if (canceladosDaAba.length > 0) {
        canceladosSection.classList.remove('hidden');
        canceladosContainer.innerHTML = canceladosDaAba.map(pedido => `
            <div class="bg-red-100 p-4 rounded-lg shadow border-l-4 border-red-500">
                <p class="font-bold text-red-800">${pedido.sku}</p>
                <p class="text-sm text-red-600">${pedido.id} - Qtd: ${pedido.quantidade}</p>
                <p class="text-xs font-semibold text-red-700 mt-2">VENDA CANCELADA. NÃO ENVIAR.</p>
            </div>
        `).join('');
    } else {
        canceladosSection.classList.add('hidden');
    }
}
/**
 * Função para o botão "Confirmar e Produzir" do modal.
 * Envia TODOS os itens selecionados para a produção.
 */
async function moverSelecionadosParaProducao() {
    if (!impressoraSelecionada) {
        showToast("Por favor, selecione uma impressora para enviar para produção.", "error");
        return;
    }
    let itensMovidos = 0;

    // Cria uma cópia da lista para iterar, pois a lista original será modificada dentro do loop.
    const listaParaIterar = [...itensParaProducaoGlobal];
   
    // Usamos um loop for...of que respeita o 'await' dentro dele.
    for (const pedido of listaParaIterar) {
        // Chama a função de fluxo, passando a flag para forçar produção
        const foiMovido = await moverItemParaFluxo(pedido.id, pedido.sku, true); // true = forçar produção
        if (foiMovido) {
            itensMovidos++;
        }
    }

    if (itensMovidos > 0) {
        showToast(`${itensMovidos} item(ns) foram enviados para o fluxo de produção.`, "success");
        fecharModalImpressora();
        // A UI já é atualizada dentro do moverItemParaFluxo, então não precisa chamar loadPedidos() aqui.
    }
}

/**
 * Verifica o estoque para os itens selecionados que precisam de produção
 * e exibe o resultado no modal da impressora.
 */
function verificarEstoqueParaProducao() {
    const selecionados = document.querySelectorAll('.pedido-checkbox:checked');
    const resultadoContainer = document.getElementById('resultado-verificacao-estoque');
    resultadoContainer.innerHTML = ''; // Limpa resultados anteriores
    const estoquePorSku = itensEstoque.reduce((acc, item) => {
        const skuBase = item.sku.replace(/-(F|V|P|C)$/i, '');
        acc[skuBase] = (acc[skuBase] || 0) + item.qtd;
        return acc;
    }, {});
    const skusParaProducao = new Set();
    selecionados.forEach(checkbox => {
        const pedido = pedidos.find(p => p.id === checkbox.dataset.pedidoId && p.sku === checkbox.dataset.sku);
        if (pedido) {
            const skuBasePedido = pedido.sku.replace(/-(F|V|P|C)$/i, '');
            const estoqueDisponivel = estoquePorSku[skuBasePedido] || 0;
            if (estoqueDisponivel < pedido.quantidade) {
                skusParaProducao.add(skuBasePedido);
            }
        }
    });
    if (skusParaProducao.size === 0) {
        resultadoContainer.innerHTML = '<p class="text-green-700 font-semibold">Todos os itens selecionados para produção já possuem estoque suficiente.</p>';
        return;
    }
    let htmlResult = '<h4 class="font-bold mb-2">Status do Estoque para Produção:</h4><ul class="space-y-1">';
    skusParaProducao.forEach(sku => {
        const estoqueAtual = estoquePorSku[sku] || 0;
        if (estoqueAtual > 0) {
            htmlResult += `<li class="text-green-600"><i class="fas fa-check-circle mr-2"></i><strong>${sku}</strong>: Possui ${estoqueAtual} em estoque.</li>`;
        } else {
            htmlResult += `<li class="text-red-600"><i class="fas fa-times-circle mr-2"></i><strong>${sku}</strong>: Sem estoque.</li>`;
        }
    });
    htmlResult += '</ul>';
    resultadoContainer.innerHTML = htmlResult;
}
// Variável global para guardar os dados do item que causou o conflito
let itemComConflito = null;
/**
 * Abre o modal de atenção para SKU duplicado.
 * @param {object} pedido - O objeto do pedido que está causando a duplicidade.
 */
function abrirModalSkuDuplicado(pedido) {
    // Guarda os dados do item com conflito para uso posterior
    itemComConflito = pedido;
    // Pega os elementos do modal
    const modal = document.getElementById('sku-duplicado-modal');
    const modalContent = document.getElementById('sku-duplicado-modal-content');
    const skuLabel = document.getElementById('sku-duplicado-label');
    const pedidoLabel = document.getElementById('pedido-duplicado-label');
    const novoSkuInput = document.getElementById('novo-sku-input');
    // Preenche as informações no modal
    skuLabel.innerText = pedido.sku;
    pedidoLabel.innerText = pedido.id;
    novoSkuInput.value = ''; // Limpa o campo de input
    // Exibe o modal com animação
    modal.classList.remove('hidden');
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
        novoSkuInput.focus();
    }, 10);
}
/**
 * Fecha o modal de atenção.
 */
function fecharModalSkuDuplicado() {
    const modal = document.getElementById('sku-duplicado-modal');
    const modalContent = document.getElementById('sku-duplicado-modal-content');
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        itemComConflito = null; // Limpa a variável de conflito
    }, 200);
}
/**
 * Ação do administrador para trocar o SKU e reenviar para o fluxo de produção.
 */
async function trocarSkuEProcessar() {
    const novoSku = document.getElementById('novo-sku-input').value.trim().toUpperCase();
    if (!itemComConflito || !novoSku) {
        showToast('Por favor, insira um novo SKU válido.', 'error');
        return;
    }
    // Encontra o pedido original no array 'pedidos' para alterá-lo permanentemente
    const pedidoOriginal = pedidos.find(p => p.id === itemComConflito.id && p.sku === itemComConflito.sku);
    if (pedidoOriginal) {
        pedidoOriginal.sku = novoSku; // Altera o SKU
        showToast(`SKU alterado para ${novoSku}. Reenviando para o fluxo...`, 'success');
        logAction(`Admin trocou SKU de ${itemComConflito.sku} para ${novoSku} no pedido ${itemComConflito.id}`);
       
        // Salva a alteração
        await saveData();
       
        // Fecha o modal e tenta processar o item novamente, agora com o SKU correto
        fecharModalSkuDuplicado();
        confirmarMovimentacao(); // Chama a função principal de movimentação novamente
    } else {
        showToast('Erro: não foi possível encontrar o pedido original para alterar.', 'error');
    }
}
/**
 * Ação do administrador para autorizar a duplicidade e forçar o envio.
 */
function autorizarDuplicidadeEProcessar() {
    if (!itemComConflito) return;
    showToast('Duplicidade autorizada pelo administrador. Enviando item...', 'info');
    logAction(`Admin autorizou a duplicidade do SKU ${itemComConflito.sku} para o pedido ${itemComConflito.id}`);
    // Chama a função de fluxo, mas com um parâmetro extra para ignorar a verificação de duplicidade
    moverItemParaFluxo(itemComConflito.id, itemComConflito.sku, true, true); // forcarProducao=true, ignorarDuplicidade=true
    // Fecha o modal
    fecharModalSkuDuplicado();
}
// 07-pedidos.js

/**
 * Lógica centralizada para mover UM item para o fluxo correto.
 * VERSÃO 6.0: Remove a lógica de bloqueio duplicada, confiando na decisão
 * da função 'confirmarMovimentacao'. Esta função agora apenas executa a movimentação.
 *
 * @param {string} pedidoId - O ID do pedido.
 * @param {string} sku - O SKU do item.
 * @param {boolean} forcarProducao - Se true, envia para produção, senão, para expedição.
 * @param {boolean} isAuthorizedUnit - NOVO: Indica se a unidade foi autorizada pelo admin (para 2ª unidade).
 * @returns {Promise<boolean>} Retorna true se o item foi movido com sucesso.
 */
async function moverItemParaFluxo(pedidoId, sku, forcarProducao = false, isAuthorizedUnit = false) {
    const destino = forcarProducao ? 'Produção' : 'Expedição';
    const impressora = forcarProducao ? impressoraSelecionada : null;

    // Validação inicial (permanece)
    if (forcarProducao && !impressora) {
        showToast("Por favor, selecione uma impressora para enviar à produção.", "error");
        return false;
    }

    try {
        const response = await fetch('/api/pedidos/mover_para_fluxo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pedidoId,
                sku,
                destino,
                impressora,
                usuario: currentUser.username,
                isAuthorizedUnit // Envia a flag de autorização
            })
        });

        const result = await response.json();

        if (response.status === 403 && result.status === 'auth_required') {
            // NOVO: Se o backend retornar que a autenticação é necessária
            // Encontra o pedido no array local e muda o status para 'Aguardando Autorização'
            const pedidoIndex = pedidos.findIndex(p => p.id === pedidoId && p.sku === sku);
            if (pedidoIndex > -1) {
                pedidos[pedidoIndex].status = 'Aguardando Autorização';
                await saveData();
                loadPedidos();
                showToast(result.message, 'warning');
            }
            return false;
        }

        if (!response.ok) {
            showToast(result.message || `Erro ao mover o item ${sku}.`, 'error');
            return false;
        }

        showToast(result.message, 'success');
        
        // Remove o item da lista do modal, pois foi processado com sucesso
        const itemIndex = itensParaProducaoGlobal.findIndex(p => p.id === pedidoId && p.sku === sku);
        if (itemIndex > -1) {
            itensParaProducaoGlobal.splice(itemIndex, 1);
        }
        renderizarListaModal();
        
        // A UI principal será atualizada pelo WebSocket ou por uma chamada explícita a loadPedidos()
        loadPedidos();

        return true;

    } catch (error) {
        console.error("Erro de rede ao mover item:", error);
        showToast('Erro de comunicação com o servidor.', 'error');
        return false;
    }
}




// 07-pedidos.js

/**
 * Ação do admin: autoriza a segunda unidade, revertendo seu status para 'Pendente'.
 * O item agora pode ser selecionado e processado normalmente.
 * VERSÃO 3.0: Usa as propriedades do objeto para a busca, garantindo a localização.
 */




/**
 * Abre o modal da Lista de Separação.
 */
// Em 07-pedidos.js, substitua as funções existentes

/**
 * Abre o modal da Lista de Separação, buscando os dados do backend.
 */
async function abrirModalListaSeparacao() {
    if (!hasPermission('pedidos', 'gerarRelatorio')) {
        showToast('Permissão negada para gerar lista de separação.', 'error');
        return;
    }

    const modal = document.getElementById('relatorio-saida-modal');
    const modalContent = document.getElementById('relatorio-saida-content');
    const tituloEl = document.getElementById('relatorio-modal-titulo');
    const dataEl = document.getElementById('relatorio-modal-data');
    const descricaoEl = document.getElementById('relatorio-modal-descricao');
    const mlContainer = document.getElementById('relatorio-ml-container');
    const shopeeContainer = document.getElementById('relatorio-shopee-container');
    const vcContainer = document.getElementById('relatorio-vc-container'); // Assumindo que você adicionou este container no HTML

    tituloEl.innerText = 'Lista de Separação do Dia (Picking)';
    dataEl.innerText = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;
    descricaoEl.innerHTML = `<i class="fas fa-boxes mr-2 text-blue-500"></i>Itens que foram retirados do estoque para a expedição hoje.`;

    try {
        showToast('Buscando lista de separação...', 'info');
        const response = await fetch('/api/pedidos/lista_separacao');
        if (!response.ok) throw new Error('Falha ao carregar a lista do servidor.');
        
        const listaCompleta = await response.json();

        const relatorioML = listaCompleta.filter(p => p.marketplace === 'Mercado Livre');
        const relatorioShopee = listaCompleta.filter(p => p.marketplace === 'Shopee');
        const outrosMarketplaces = ['Mercado Livre', 'Shopee'];
        const relatorioVC = listaCompleta.filter(p => !outrosMarketplaces.includes(p.marketplace));

        mlContainer.innerHTML = renderizarTabelaSeparacao(relatorioML);
        shopeeContainer.innerHTML = renderizarTabelaSeparacao(relatorioShopee);
        if (vcContainer) vcContainer.innerHTML = renderizarTabelaSeparacao(relatorioVC);

        modal.classList.remove('hidden');
        setTimeout(() => { modalContent.classList.remove('scale-95', 'opacity-0'); modalContent.classList.add('scale-100', 'opacity-100'); }, 10);

    } catch (error) {
        showToast(error.message, 'error');
        console.error("Erro ao buscar lista de separação:", error);
    }
}

/**
 * Função auxiliar para renderizar a tabela de separação para um grupo de itens.
 * @param {Array} listaItens - A lista de itens para um marketplace.
 * @returns {string} O HTML da tabela.
 */
function renderizarTabelaSeparacao(listaItens) {
    if (listaItens.length === 0) {
        return '<p class="text-center text-gray-500 py-4">Nenhum item para separar neste grupo.</p>';
    }

    return `
        <div class="overflow-x-auto bg-white p-4 rounded-lg shadow-md">
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="p-3 font-semibold">SKU</th>
                        <th class="p-3 font-semibold text-center">Qtd.</th>
                        <th class="p-3 font-semibold">Localização (Prateleira)</th>
                    </tr>
                </thead>
                <tbody>
                    ${listaItens.map(info => `
                        <tr class="border-b last:border-b-0 hover:bg-indigo-50">
                            <td class="p-3 font-bold text-indigo-800">${info.sku}</td>
                            <td class="p-3 font-bold text-center text-lg">${info.quantidade}</td>
                            <td class="p-3 font-mono text-green-800">${info.prateleiras.join(', ') || '<span class="text-red-500">Não localizado</span>'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function fecharModalRelatorioSaida() {
    const modal = document.getElementById('relatorio-saida-modal');
    modal.classList.add('hidden');
}
/**
 * Abre o modal de Histórico de Pedidos, buscando os dados do backend.
 */
async function abrirModalHistorico() {
    if (!hasPermission('pedidos', 'gerarRelatorio')) {
        showToast('Permissão negada para ver o histórico de pedidos.', 'error');
        return;
    }
    const modal = document.getElementById('historico-modal');
    const modalContent = document.getElementById('historico-modal-content');
    
    try {
        showToast('Carregando histórico de pedidos...', 'info');
        const response = await fetch('/api/pedidos/historico');
        if (!response.ok) throw new Error('Falha ao carregar o histórico do servidor.');

        const historicoCompleto = await response.json();
        window.historicoPedidosGlobal = historicoCompleto; // Armazena para filtragem
        
        renderizarHistorico(); // Chama a função que agora usa os dados globais

        modal.classList.remove('hidden');
        setTimeout(() => { modalContent.classList.remove('scale-95', 'opacity-0'); modalContent.classList.add('scale-100', 'opacity-100'); }, 10);

    } catch (error) {
        showToast(error.message, 'error');
        console.error("Erro ao buscar histórico:", error);
    }
}

/**
 * Renderiza o conteúdo do modal de Histórico com base nos filtros e nos dados globais.
 */
function fecharModalHistorico() {
    const modal = document.getElementById('historico-modal');
    modal.classList.add('hidden');
}
function renderizarHistorico() {
    const body = document.getElementById('historico-table-body');
    const filtroId = document.getElementById('hist-filtro-id').value.toLowerCase();
    const filtroMarketplace = document.getElementById('hist-filtro-marketplace').value;
    const filtroUsuario = document.getElementById('hist-filtro-usuario').value.toLowerCase();

    if (!window.historicoPedidosGlobal) {
        body.innerHTML = `<tr><td colspan="8" class="text-center p-8 text-gray-500">Dados do histórico não carregados.</td></tr>`;
        return;
    }

    const filtrados = window.historicoPedidosGlobal.filter(p => {
        const idMatch = p.pedido_id.toLowerCase().includes(filtroId) || p.sku.toLowerCase().includes(filtroId);
        const marketplaceMatch = !filtroMarketplace || p.marketplace === filtroMarketplace;
        const usuarioMatch = !filtroUsuario || (p.usuario && p.usuario.toLowerCase().includes(filtroUsuario));
        return idMatch && marketplaceMatch && usuarioMatch;
    });

    if (filtrados.length === 0) {
        body.innerHTML = `<tr><td colspan="8" class="text-center p-8 text-gray-500">Nenhum pedido encontrado com os filtros aplicados.</td></tr>`;
        return;
    }

    body.innerHTML = filtrados.map(p => {
        let destinoDisplay = '';
        let destinoClass = '';
        let entregaClass = p.tipoEntrega === 'Motoboy' ? 'text-purple-700 font-semibold' : 'text-gray-600';

        if (p.destino === 'Produção') {
            destinoDisplay = `Produção (Imp. ${p.impressora || 'N/A'})`;
            destinoClass = 'text-blue-600';
        } else {
            destinoDisplay = 'Expedição';
            destinoClass = 'text-green-600';
        }

        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-2">${p.pedido_id}</td>
                <td class="p-2 font-semibold">${p.sku}</td>
                <td class="p-2">${p.marketplace}</td>
                <td class="p-2 font-bold ${destinoClass}">${destinoDisplay}</td>
                <td class="p-2 ${entregaClass}">${p.tipoEntrega || 'N/A'}</td>
                <td class="p-2">${p.usuario || 'N/A'}</td>
                <td class="p-2">${new Date(p.timestamp).toLocaleString('pt-BR')}</td>
                <td class="p-2">
                    <button onclick="reverterPedido('${p.pedido_id}', '${p.sku}')" class="text-red-500 hover:text-red-700" title="Reverter para Pendente (Ação de Admin)">
                        <i class="fas fa-undo"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function mudarPaginaHistorico(direcao) {
    historicoPaginaAtual += direcao;
    renderizarHistorico();
}
/**
 * Reverte um pedido do status 'Processado' para 'Pendente'.
 */
async function reverterPedido(pedidoId, sku) {
    const senha = prompt("Para reverter o pedido, digite a senha de administrador:");
    if (senha !== "W2025") {
        showToast("Senha incorreta!", "error");
        return;
    }
    const pedidoIndex = pedidos.findIndex(p => p.id === pedidoId && p.sku === sku && p.status === 'Processado');
    if (pedidoIndex === -1) {
        showToast("Pedido não encontrado ou já está pendente.", "error");
        return;
    }
    const pedido = pedidos[pedidoIndex];
    pedido.status = 'Pendente';
    delete pedido.destino;
    delete pedido.usuario;
    delete pedido.dataProcessamento;
    delete pedido.impressora;
    producao = producao.filter(p => !(p.pedidoId === pedidoId && p.sku === sku));
    expedicao = expedicao.filter(e => !(e.pedidoId === pedidoId && e.sku === sku));
    await saveData();
    showToast(`Pedido ${sku} revertido para pendente.`, "success");
    renderizarHistorico();
    loadPedidos();
}

