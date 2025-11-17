//
// Arquivo: static/js/relatorio.js
// (NOVO ARQUIVO)
//

// --- 1. CONFIGURAÇÃO DO FIREBASE ---
// A variável 'firebaseConfig' já foi carregada pelo 'firebase-config.js'

try {
    firebase.initializeApp(firebaseConfig);
} catch(e) {
    if (e.code !== 'app/duplicate-app') {
        console.error("Erro ao inicializar o Firebase.", e);
        alert("ERRO DE CONFIGURAÇÃO: O Firebase não pôde ser iniciado. Verifique o console.");
    }
}

// Inicializa os serviços (Sintaxe v8)
const db = firebase.firestore();
console.log("Mundivox FSM (Relatório) Carregado e Conectado!");

// --- 2. SELETORES DE ELEMENTOS (DOM) ---
const relatorioListContainer = document.getElementById('relatorio-list');
const globalSearchBar = document.getElementById('global-search-bar');

// REGIONAIS (para manter a mesma estrutura de acordeão)
const REGIONAIS = ["SPO", "SPI", "RJ", "CTA", "BH", "PE", "BA", "MG", "RS"];

// --- 3. LÓGICA PRINCIPAL ---

/**
 * Carrega todas as ocorrências com status "Finalizados"
 */
function loadRelatorio() {
    db.collection('ocorrencias')
      .where('status', '==', 'Finalizados')
      .orderBy('dataFim', 'desc') // Ordena pelas mais recentes primeiro
      .onSnapshot(snapshot => {
        
        let ocorrenciasPorRegional = {};
        REGIONAIS.forEach(r => { ocorrenciasPorRegional[r] = []; });
        
        if (snapshot.empty) {
            relatorioListContainer.innerHTML = '<p>Nenhuma ocorrência finalizada encontrada.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const ocorrencia = doc.data();
            const id = doc.id;
            const regional = ocorrencia.regional;
            
            if (regional && ocorrenciasPorRegional[regional]) {
                ocorrenciasPorRegional[regional].push({ id, ...ocorrencia });
            }
        });
        
        renderAcordeaoRelatorio(ocorrenciasPorRegional);
    }, (error) => {
        console.error("Erro ao carregar relatório: ", error);
        relatorioListContainer.innerHTML = `<p style="color: red;">Erro ao carregar dados: ${error.message}</p>`;
    });
}

/**
 * Renderiza a lista de acordeão na página de relatório
 */
function renderAcordeaoRelatorio(ocorrenciasPorRegional) {
    if (!relatorioListContainer) return;
    relatorioListContainer.innerHTML = ''; 
    
    let hasOcorrencias = false;

    for (const regional of REGIONAIS) {
        const ocorrencias = ocorrenciasPorRegional[regional];
        const numOcorrencias = ocorrencias.length;
        
        if (numOcorrencias === 0) {
            continue; // Pula regionais sem ocorrências finalizadas
        }

        hasOcorrencias = true;
        const group = document.createElement('div');
        group.className = 'regional-group';
        
        group.innerHTML = `
            <button class="regional-header">
                <h3>Regional ${regional} (${numOcorrencias} finalizadas)</h3>
                <span class="acordeao-icone">&#9660;</span>
            </button>
            <div class="regional-body">
            </div>
        `;
        
        const regionalBody = group.querySelector('.regional-body');
        
        // Ordena por data de finalização (mais recente primeiro)
        ocorrencias.sort((a, b) => new Date(b.dataFim) - new Date(a.dataFim));
        
        ocorrencias.forEach(oc => {
            regionalBody.appendChild(createRelatorioCard(oc));
        });
        
        relatorioListContainer.appendChild(group);
    }
    
    if (!hasOcorrencias) {
        relatorioListContainer.innerHTML = '<p>Nenhuma ocorrência finalizada encontrada.</p>';
    }

    addAcordeaoListeners();
}

/**
 * Cria um elemento de Cartão de Relatório
 */
function createRelatorioCard(oc) {
    const card = document.createElement('div');
    card.className = 'relatorio-card'; // Usa o novo estilo
    card.setAttribute('data-id', oc.id);
    
    // Texto para a barra de pesquisa
    const searchText = `${oc.empresa} ${oc.endereco} ${oc.motivo} ${oc.dataAbertura} ${oc.contrato} ${oc.tecnicoAtribuido || ''}`.toLowerCase();
    card.setAttribute('data-search', searchText);
    
    // Formata as datas
    const dataAbertura = formatarData(oc.dataAbertura);
    const dataInicio = formatarData(oc.dataInicio); // Vem do "Em tratativa"
    const dataFim = formatarData(oc.dataFim);       // Vem do "Finalizados"

    card.innerHTML = `
        <div class="card-header">
            <strong>${oc.empresa} (${oc.contrato})</strong>
            <span class="status-tag" style="background-color: var(--cor-sucesso);">Finalizado</span>
        </div>
        <div class="card-body">
            <p><strong>Motivo:</strong> ${oc.motivo}</p>
            <p><strong>Endereço:</strong> ${oc.endereco}</p>
            <p><strong>Técnico:</strong> ${oc.tecnicoAtribuido || 'Não informado'}</p>
        </div>
        <div class="card-footer-datas">
            <span><strong>Abertura:</strong> ${dataAbertura}</span>
            <span><strong>Início:</strong> ${dataInicio}</span>
            <span><strong>Finalização:</strong> ${dataFim}</span>
        </div>
    `;
    return card;
}

/**
 * Lógica do Acordeão (Abrir/Fechar)
 */
function addAcordeaoListeners() {
    const headers = document.querySelectorAll('.regional-header');
    
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const body = header.nextElementSibling;
            const isActive = body.classList.contains('active');
            
            // Fecha todos os outros abertos (estilo "solo")
            document.querySelectorAll('.regional-body.active').forEach(b => {
                if (b !== body) {
                    b.classList.remove('active');
                    b.previousElementSibling.classList.remove('active');
                }
            });
            
            if (!isActive) {
                body.classList.add('active');
                header.classList.add('active');
            } else {
                body.classList.remove('active');
                header.classList.remove('active');
            }
        });
    });
}

/**
 * Lógica da Pesquisa Global
 */
if (globalSearchBar) {
    globalSearchBar.addEventListener('keyup', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        
        const todosOsCards = document.querySelectorAll('.relatorio-card');
        
        todosOsCards.forEach(card => {
            const searchText = card.getAttribute('data-search');
            
            if (searchText.includes(searchTerm)) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
            }
        });
        
        // Atualiza contagem e visibilidade das regionais
        const todasAsRegionais = document.querySelectorAll('.regional-group');
        todasAsRegionais.forEach(regional => {
            const header = regional.querySelector('.regional-header');
            const body = regional.querySelector('.regional-body');
            const cardsVisiveis = body.querySelectorAll('.relatorio-card:not(.hidden)').length;
            const totalCards = body.querySelectorAll('.relatorio-card').length;
            
            const regionalNome = header.querySelector('h3').innerText.split(' ')[1];

            if (searchTerm === '') {
                regional.classList.remove('hidden');
                header.querySelector('h3').innerText = `Regional ${regionalNome} (${totalCards} finalizadas)`;
                body.classList.remove('active');
                header.classList.remove('active');
            } else {
                if (cardsVisiveis > 0) {
                    regional.classList.remove('hidden');
                    header.querySelector('h3').innerText = `Regional ${regionalNome} (${cardsVisiveis} / ${totalCards} encontrados)`;
                    body.classList.add('active'); // Abre para mostrar os resultados
                    header.classList.add('active');
                } else {
                    regional.classList.add('hidden'); // Esconde se não houver resultados
                }
            }
        });
    });
}

/**
 * Utilitário para formatar data e hora (datetime-local)
 * Entrada: "2025-11-16T21:56"
 * Saída: "16/11/2025 21:56"
 */
function formatarData(dataISO) {
    if (!dataISO) return 'N/A';
    
    try {
        // Tenta primeiro como datetime-local (com 'T')
        if (dataISO.includes('T')) {
            const [data, hora] = dataISO.split('T');
            const [ano, mes, dia] = data.split('-');
            return `${dia}/${mes}/${ano} ${hora}`;
        }
        // Tenta como data (sem 'T')
        const [ano, mes, dia] = dataISO.split('-');
        return `${dia}/${mes}/${ano}`;

    } catch (e) {
        console.warn(`Data em formato inesperado: ${dataISO}`);
        return dataISO; // Retorna o original se falhar
    }
}


// --- 4. INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', loadRelatorio);