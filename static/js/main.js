// --- 1. CONFIGURAÇÃO DO FIREBASE ---
// !! COLE AQUI A SUA *NOVA E SEGURA* 'firebaseConfig' !!
const firebaseConfig = {
    apiKey: "SUA_NOVA_API_KEY_SEGURA",
    authDomain: "mundivox-fsm.firebaseapp.com",
    projectId: "mundivox-fsm",
    storageBucket: "mundivox-fsm.appspot.com", 
    messagingSenderId: "550574445476",
    appId: "SUA_NOVA_APP_ID"
};

// Inicializa o Firebase (Sintaxe v8)
try {
    firebase.initializeApp(firebaseConfig);
} catch(e) {
    console.error("Erro ao inicializar o Firebase. Verifique sua 'firebaseConfig'.", e);
    alert("ERRO DE CONFIGURAÇÃO: O Firebase não pôde ser iniciado. Verifique o console.");
}


// Inicializa os serviços que usaremos (Sintaxe v8)
const db = firebase.firestore();
const auth = firebase.auth();

console.log("Mundivox FSM Carregado e Conectado ao Firebase!");

// --- 2. SELETORES DE ELEMENTOS (DOM) ---
const modalTecnicos = document.getElementById('modal-tecnicos');
const modalOcorrencia = document.getElementById('modal-ocorrencia');
const btnAbrirModalTecnicos = document.getElementById('btn-abrir-modal-tecnicos');
const btnAbrirModalOcorrencia = document.getElementById('btn-abrir-modal-ocorrencia');
const btnFecharModalTecnicos = document.getElementById('btn-fechar-modal-tecnicos');
const btnFecharModalOcorrencia = document.getElementById('btn-fechar-modal-ocorrencia');

const formAddTecnico = document.getElementById('form-add-tecnico');
const formAddOcorrencia = document.getElementById('form-add-ocorrencia');

const listaTecnicosAtivos = document.getElementById('lista-tecnicos-ativos');
const regionalListContainer = document.getElementById('regional-list');

const globalSearchBar = document.getElementById('global-search-bar');

const REGIONAIS = ["PR", "RJ", "SP", "BH", "PE", "BA", "MG", "RS"];

// --- 3. LÓGICA DOS MODAIS ---

function toggleModal(modal, show) {
    if (!modal) {
        console.error("Tentativa de abrir um modal que não existe.");
        return; 
    }
    if (show) {
        modal.classList.add('active');
    } else {
        modal.classList.remove('active');
    }
}

// Event Listeners para ABRIR Modais
if (btnAbrirModalTecnicos) {
    btnAbrirModalTecnicos.addEventListener('click', () => toggleModal(modalTecnicos, true));
}
if (btnAbrirModalOcorrencia) {
    btnAbrirModalOcorrencia.addEventListener('click', () => toggleModal(modalOcorrencia, true));
}

// Botão 'X' do Modal de TÉCNICOS
if (btnFecharModalTecnicos) {
    btnFecharModalTecnicos.addEventListener('click', () => {
        formAddTecnico.reset();
        toggleModal(modalTecnicos, false);
    });
}

// Botão 'X' do Modal de OCORRÊNCIA
if (btnFecharModalOcorrencia) {
    btnFecharModalOcorrencia.addEventListener('click', () => {
        const empresa = document.getElementById('ocorrencia-empresa').value;
        const endereco = document.getElementById('ocorrencia-endereco').value;
        const motivo = document.getElementById('ocorrencia-motivo').value;

        if (empresa || endereco || motivo) {
            if (confirm("Tem certeza que deseja fechar? Os dados não salvos serão perdidos.")) {
                formAddOcorrencia.reset();
                toggleModal(modalOcorrencia, false);
            }
        } else {
            toggleModal(modalOcorrencia, false);
        }
    });
}

// Fechar modal ao clicar no overlay (fundo escuro)
if (modalTecnicos) {
    modalTecnicos.addEventListener('click', (e) => {
        if (e.target === modalTecnicos) {
            formAddTecnico.reset();
            toggleModal(modalTecnicos, false);
        }
    });
}
// (O listener de clique no fundo do modal de ocorrência foi removido, como solicitado)


// --- 4. LÓGICA DE TÉCNICOS (Firebase) ---

if (formAddTecnico) {
    formAddTecnico.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nome = document.getElementById('tecnico-nome').value;
        const regional = document.getElementById('tecnico-regional').value;
        const telefone = document.getElementById('tecnico-telefone').value;
        const detalhesInput = document.getElementById('tecnico-detalhes').value;
        
        const detalhes = detalhesInput.split(',').map(detalhe => detalhe.trim()).filter(Boolean);
        
        try {
            await db.collection('tecnicos').add({
                nome, regional, telefone, detalhes,
                disponivel: true, 
                isAdmin: false 
            });
            
            formAddTecnico.reset();
            alert('Técnico adicionado com sucesso!');
            
        } catch (error) {
            console.error("Erro ao adicionar técnico: ", error);
            // ATUALIZAÇÃO: Adicionando alerta de erro
            alert("ERRO AO SALVAR TÉCNICO:\n" + error.message);
        }
    });
}

// Carregar e Exibir Técnicos (em tempo real)
function loadTecnicos() {
    db.collection('tecnicos').orderBy('nome').onSnapshot(snapshot => {
        if (!listaTecnicosAtivos) return;
        listaTecnicosAtivos.innerHTML = ''; 
        
        if (snapshot.empty) {
            listaTecnicosAtivos.innerHTML = '<p>Nenhum técnico cadastrado.</p>';
            return;
        }
        
        snapshot.forEach(doc => {
            const tecnico = doc.data();
            const tecnicoId = doc.id;
            
            const item = document.createElement('div');
            // ... (código do item do técnico) ...
            item.className = 'tecnico-item';
            item.setAttribute('data-id', tecnicoId);
            
            item.innerHTML = `
                <span>${tecnico.nome} (${tecnico.regional})</span>
                <div>
                    <label>
                        <input type="checkbox" class="check-disponivel" ${tecnico.disponivel ? 'checked' : ''}> Disponível
                    </label>
                    <button class="btn-delete-tecnico">Deletar</button>
                </div>
            `;
            
            item.querySelector('.check-disponivel').addEventListener('change', (e) => {
                updateDisponibilidade(tecnicoId, e.target.checked);
            });
            
            item.querySelector('.btn-delete-tecnico').addEventListener('click', () => {
                deleteTecnico(tecnicoId, tecnico.nome);
            });
            
            listaTecnicosAtivos.appendChild(item);
        });
    });
}

// Atualizar Disponibilidade
async function updateDisponibilidade(id, disponivel) {
    try {
        await db.collection('tecnicos').doc(id).update({ disponivel });
    } catch (error) {
        console.error("Erro ao atualizar disponibilidade: ", error);
    }
}

// Deletar Técnico
async function deleteTecnico(id, nome) {
    if (confirm(`Tem certeza que deseja deletar ${nome}?`)) {
        try {
            await db.collection('tecnicos').doc(id).delete();
            alert('Técnico deletado.');
        } catch (error) {
            console.error("Erro ao deletar técnico: ", error);
        }
    }
}

// --- 5. LÓGICA DE OCORRÊNCIAS (Firebase) ---

if (formAddOcorrencia) {
    formAddOcorrencia.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const empresa = document.getElementById('ocorrencia-empresa').value;
        const endereco = document.getElementById('ocorrencia-endereco').value;
        const regional = document.getElementById('ocorrencia-regional').value; 
        const contrato = document.getElementById('ocorrencia-contrato').value;
        const receita = parseFloat(document.getElementById('ocorrencia-receita').value) || 0;
        const dataAbertura = document.getElementById('ocorrencia-data').value;
        const motivo = document.getElementById('ocorrencia-motivo').value;
        
        try {
            await db.collection('ocorrencias').add({
                empresa, endereco, regional, contrato, receita,
                dataAbertura: dataAbertura ? dataAbertura : new Date().toISOString().split('T')[0],
                motivo,
                status: 'Fila de espera',
                tecnicoAtribuido: null,
                tecnicoAtribuidoId: null,
                ordemManual: null
            });
            
            // Comportamento de SUCESSO
            formAddOcorrencia.reset();
            toggleModal(modalOcorrencia, false);
            alert('Ocorrência adicionada com sucesso!');
            
        } catch (error) {
            console.error("Erro ao adicionar ocorrência: ", error);
            // ================== ATUALIZAÇÃO 2: ALERTA DE ERRO ==================
            // Agora, se falhar, você será notificado.
            alert("ERRO AO SALVAR OCORRÊNCIA:\n\n" + error.message);
            // ================== FIM DA ATUALIZAÇÃO ==================
        }
    });
}

// Carregar e Exibir Ocorrências (em tempo real)
function loadOcorrencias() {
    db.collection('ocorrencias').orderBy('dataAbertura', 'desc').onSnapshot(snapshot => {
        
        let ocorrenciasPorRegional = {};
        REGIONAIS.forEach(r => { ocorrenciasPorRegional[r] = []; });
        
        snapshot.forEach(doc => {
            const ocorrencia = doc.data();
            const id = doc.id;
            const regional = ocorrencia.regional;
            
            if (regional && ocorrenciasPorRegional[regional]) {
                ocorrenciasPorRegional[regional].push({ id, ...ocorrencia });
            }
        });
        
        renderAcordeao(ocorrenciasPorRegional);
    });
}

// Renderiza a lista de acordeão
function renderAcordeao(ocorrenciasPorRegional) {
    if (!regionalListContainer) return;
    regionalListContainer.innerHTML = ''; 
    
    for (const regional of REGIONAIS) {
        const ocorrencias = ocorrenciasPorRegional[regional];
        const numOcorrencias = ocorrencias.length;
        
        const group = document.createElement('div');
        // ... (código do grupo regional) ...
        group.className = 'regional-group';
        
        group.innerHTML = `
            <button class="regional-header">
                <h3>Regional ${regional} (${numOcorrencias})</h3>
                <span class="acordeao-icone">&#9660;</span>
            </button>
            <div class="regional-body">
            </div>
        `;
        
        const regionalBody = group.querySelector('.regional-body');
        
        if (numOcorrencias === 0) {
            regionalBody.innerHTML = '<p>Nenhuma ocorrência nesta regional.</p>';
        } else {
            ocorrencias.sort((a, b) => new Date(a.dataAbertura) - new Date(b.dataAbertura));
            ocorrencias.forEach(oc => {
                regionalBody.appendChild(createOcorrenciaCard(oc));
            });
        }
        
        regionalListContainer.appendChild(group);
    }
    
    addAcordeaoListeners();
}

// Cria um elemento de Cartão de Ocorrência
function createOcorrenciaCard(oc) {
    const card = document.createElement('div');
    // ... (código do cartão) ...
    card.className = 'ocorrencia-card';
    card.setAttribute('data-id', oc.id);
    card.setAttribute('data-contrato', oc.contrato);
    
    const searchText = `${oc.empresa} ${oc.endereco} ${oc.motivo} ${oc.dataAbertura} ${oc.contrato} ${oc.status} ${oc.tecnicoAtribuido || ''}`.toLowerCase();
    card.setAttribute('data-search', searchText);
    
    let statusColor = 'var(--cor-secundaria)';
    if (oc.status === 'Em deslocamento') statusColor = 'var(--cor-aviso)';
    if (oc.status === 'Em manutenção') statusColor = 'var(--cor-primaria)';
    if (oc.status === 'Finalizados') statusColor = 'var(--cor-sucesso)';
    
    let dataFormatada;
    try {
        const [ano, mes, dia] = oc.dataAbertura.split('-');
        dataFormatada = `${dia}/${mes}/${ano}`;
    } catch(e) {
        dataFormatada = oc.dataAbertura;
    }

    card.innerHTML = `
        <div class="card-header">
            <strong>${oc.empresa} (${oc.contrato})</strong>
            <span class="status-tag" style="background-color: ${statusColor};">${oc.status}</span>
        </div>
        <div class="card-body">
            <p><strong>Motivo:</strong> ${oc.motivo}</p>
            <p><strong>Endereço:</strong> ${oc.endereco}</p>
            <p><strong>Aberta em:</strong> ${dataFormatada}</p>
            ${oc.tecnicoAtribuido ? `<p><strong>Técnico:</strong> ${oc.tecnicoAtribuido}</p>` : ''}
        </div>
    `;
    return card;
}

// Lógica do Acordeão (Abrir/Fechar - Estilo "Solo")
function addAcordeaoListeners() {
    const headers = document.querySelectorAll('.regional-header');
    
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const body = header.nextElementSibling;
            const isActive = body.classList.contains('active');
            
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


// --- 6. LÓGICA DE PESQUISA GLOBAL ---
if (globalSearchBar) {
    globalSearchBar.addEventListener('keyup', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        
        const todosOsCards = document.querySelectorAll('.ocorrencia-card');
        
        todosOsCards.forEach(card => {
            const searchText = card.getAttribute('data-search');
            
            if (searchText.includes(searchTerm)) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
            }
        });
        
        const todasAsRegionais = document.querySelectorAll('.regional-group');
        todasAsRegionais.forEach(regional => {
            const header = regional.querySelector('.regional-header');
            const body = regional.querySelector('.regional-body');
            const cardsVisiveis = body.querySelectorAll('.ocorrencia-card:not(.hidden)').length;
            const totalCards = body.querySelectorAll('.ocorrencia-card').length;
            
            const regionalNome = header.querySelector('h3').innerText.split(' ')[1];

            if (searchTerm === '') {
                regional.classList.remove('hidden');
                header.querySelector('h3').innerText = `Regional ${regionalNome} (${totalCards})`;
                body.classList.remove('active');
                header.classList.remove('active');
            } else {
                if (cardsVisiveis > 0) {
                    regional.classList.remove('hidden');
                    header.querySelector('h3').innerText = `Regional ${regionalNome} (${cardsVisiveis} / ${totalCards} encontrados)`;
                    body.classList.add('active');
                    header.classList.add('active');
                } else {
                    regional.classList.add('hidden');
                }
            }
        });
    });
}


// --- 7. INICIALIZAÇÃO ---
function init() {
    if (document.getElementById('regional-list')) {
        loadTecnicos();
        loadOcorrencias();
    }
}

document.addEventListener('DOMContentLoaded', init);