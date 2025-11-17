//
// Arquivo: static/js/main.js
// (TOTALMENTE SUBSTITUÍDO)
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
const auth = firebase.auth();

console.log("Mundivox FSM (Dashboard) Carregado e Conectado!");

// --- 2. SELETORES DE ELEMENTOS (DOM) ---

// Modais Principais
const modalTecnicos = document.getElementById('modal-tecnicos');
const modalOcorrencia = document.getElementById('modal-ocorrencia');

// Botões de Abrir Modais Principais
const btnAbrirModalTecnicos = document.getElementById('btn-abrir-modal-tecnicos');
const btnAbrirModalOcorrencia = document.getElementById('btn-abrir-modal-ocorrencia');

// Botões de Fechar Modais Principais
const btnFecharModalTecnicos = document.getElementById('btn-fechar-modal-tecnicos');
const btnFecharModalOcorrencia = document.getElementById('btn-fechar-modal-ocorrencia');

// Formulários
const formAddTecnico = document.getElementById('form-add-tecnico');
const formAddOcorrencia = document.getElementById('form-add-ocorrencia');

// Listas
const listaTecnicosAtivos = document.getElementById('lista-tecnicos-ativos');
const regionalListContainer = document.getElementById('regional-list');

// Pesquisa
const globalSearchBar = document.getElementById('global-search-bar');

// Modais de FLUXO
const modalAcoesStatus = document.getElementById('modal-acoes-status');
const modalRecomendarTecnico = document.getElementById('modal-recomendar-tecnico');
const modalRegistrarData = document.getElementById('modal-registrar-data');

// Botões e Conteúdo dos Modais de FLUXO
const btnFecharModalAcoes = document.getElementById('btn-fechar-modal-acoes');
const modalAcoesTitulo = document.getElementById('modal-acoes-titulo');
const modalAcoesStatusAtual = document.getElementById('modal-acoes-status-atual');
const btnAcaoDeslocamento = document.getElementById('btn-acao-deslocamento');
const btnAcaoTratativa = document.getElementById('btn-acao-tratativa');
const btnAcaoFinalizar = document.getElementById('btn-acao-finalizar');

const btnFecharModalRecomendar = document.getElementById('btn-fechar-modal-recomendar');
const modalRecomendarMotivo = document.getElementById('modal-recomendar-motivo');
const listaRecomendacaoTecnicos = document.getElementById('lista-recomendacao-tecnicos');
const btnConfirmarAtribuicao = document.getElementById('btn-confirmar-atribuicao');

const btnFecharModalData = document.getElementById('btn-fechar-modal-data');
const modalDataTitulo = document.getElementById('modal-data-titulo');
const modalDataLabel = document.getElementById('modal-data-label');
const formRegistrarData = document.getElementById('form-registrar-data');
const registroDataHora = document.getElementById('registro-data-hora');
const btnSalvarData = document.getElementById('btn-salvar-data');


// --- 3. VARIÁVEIS GLOBAIS DE ESTADO ---
const REGIONAIS = ["SPO", "SPI", "RJ", "CTA", "BH", "PE", "BA", "MG", "RS"];
let allTecnicosCache = []; // Cache de todos os técnicos para recomendação
let ocorrenciaSelecionada = null; // Guarda o ID e os dados da ocorrência clicada
let tecnicoSelecionadoParaAtribuir = null; // Guarda o ID do técnico no modal de recomendação
let proximoStatus = null; // Guarda o status ("Em tratativa" ou "Finalizados") para o modal de data

// --- 4. LÓGICA DOS MODAIS (Genérico) ---

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

// Event Listeners para ABRIR Modais Principais
if (btnAbrirModalTecnicos) {
    btnAbrirModalTecnicos.addEventListener('click', () => toggleModal(modalTecnicos, true));
}
if (btnAbrirModalOcorrencia) {
    btnAbrirModalOcorrencia.addEventListener('click', () => {
        // Define a data/hora atual no formulário ao abrir
        document.getElementById('ocorrencia-data').value = new Date().toISOString().slice(0, 16);
        toggleModal(modalOcorrencia, true);
    });
}

// Funções para FECHAR Modais Principais
if (btnFecharModalTecnicos) {
    btnFecharModalTecnicos.addEventListener('click', () => {
        formAddTecnico.reset();
        toggleModal(modalTecnicos, false);
    });
}
if (btnFecharModalOcorrencia) {
    btnFecharModalOcorrencia.addEventListener('click', () => {
        // Confirmação de fechamento
        const dataPreenchida = document.getElementById('ocorrencia-empresa').value || document.getElementById('ocorrencia-endereco').value;
        if (dataPreenchida) {
            if (confirm("Tem certeza que deseja fechar? Os dados não salvos serão perdidos.")) {
                formAddOcorrencia.reset();
                toggleModal(modalOcorrencia, false);
            }
        } else {
            toggleModal(modalOcorrencia, false);
        }
    });
}

// Funções para FECHAR Modais de FLUXO
if (btnFecharModalAcoes) {
    btnFecharModalAcoes.addEventListener('click', () => toggleModal(modalAcoesStatus, false));
}
if (btnFecharModalRecomendar) {
    btnFecharModalRecomendar.addEventListener('click', () => toggleModal(modalRecomendarTecnico, false));
}
if (btnFecharModalData) {
    btnFecharModalData.addEventListener('click', () => toggleModal(modalRegistrarData, false));
}


// --- 5. LÓGICA DE TÉCNICOS (Firebase) ---

// Carregar e Exibir Técnicos (em tempo real)
function loadTecnicos() {
    db.collection('tecnicos').orderBy('nome').onSnapshot(snapshot => {
        if (!listaTecnicosAtivos) return;
        listaTecnicosAtivos.innerHTML = ''; 
        
        allTecnicosCache = []; // Limpa o cache

        if (snapshot.empty) {
            listaTecnicosAtivos.innerHTML = '<p>Nenhum técnico cadastrado.</p>';
            return;
        }
        
        snapshot.forEach(doc => {
            const tecnico = doc.data();
            const tecnicoId = doc.id;
            
            allTecnicosCache.push({ id: tecnicoId, ...tecnico }); // Adiciona ao cache
            
            const item = document.createElement('div');
            item.className = 'tecnico-item';
            item.setAttribute('data-id', tecnicoId);
            
            // Constrói string de capacidades
            const capacidades = tecnico.capacidades?.join(', ') || 'Nenhuma';
            const telefones = tecnico.telefones?.join(' / ') || 'N/A';

            item.innerHTML = `
                <div class="tecnico-item-info">
                    <strong>${tecnico.nome} (${tecnico.regional})</strong>
                    <small>Tel: ${telefones}</small>
                    <small>Habilidades: ${capacidades}</small>
                </div>
                <div class="tecnico-item-actions">
                    <label>
                        <input type="checkbox" class="check-disponivel" ${tecnico.disponivel ? 'checked' : ''}> Disponível
                    </label>
                    <button class="btn-delete-tecnico danger">&times; Deletar</button>
                </div>
            `;
            
            // Listener para checkbox de disponibilidade
            item.querySelector('.check-disponivel').addEventListener('change', (e) => {
                updateDisponibilidade(tecnicoId, e.target.checked);
            });
            
            // Listener para botão de deletar
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
        alert("Erro ao atualizar status do técnico.");
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
            alert("Erro ao deletar técnico: " + error.message);
        }
    }
}

// Adicionar Novo Técnico (Formulário ATUALIZADO)
if (formAddTecnico) {
    formAddTecnico.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nome = document.getElementById('tecnico-nome').value;
        const regional = document.getElementById('tecnico-regional').value;
        const telefones = [
            document.getElementById('tecnico-telefone1').value,
            document.getElementById('tecnico-telefone2').value
        ].filter(Boolean); // Filtra strings vazias
        const cpf = document.getElementById('tecnico-cpf').value;
        const rg = document.getElementById('tecnico-rg').value;
        const horario = document.getElementById('tecnico-horario').value;
        const limitacoesInput = document.getElementById('tecnico-limitacoes').value;
        
        // Pega capacidades
        const capacidadesChecks = document.querySelectorAll('.tecnico-capacidade:checked');
        const capacidades = Array.from(capacidadesChecks).map(check => check.value);
        
        // Pega limitações
        const limitacoes = limitacoesInput.split(',').map(detalhe => detalhe.trim()).filter(Boolean);
        
        try {
            await db.collection('tecnicos').add({
                nome, regional, telefones, cpf, rg, horario,
                capacidades, // O que ele FAZ
                limitacoes,  // O que ele NÃO FAZ ou notas
                disponivel: true, 
                isAdmin: false 
            });
            
            formAddTecnico.reset();
            alert('Técnico adicionado com sucesso!');
            // O modal não fecha sozinho, permitindo adicionar vários
            
        } catch (error) {
            console.error("Erro ao adicionar técnico: ", error);
            alert("ERRO AO SALVAR TÉCNICO:\n" + error.message);
        }
    });
}


// --- 6. LÓGICA DE OCORRÊNCIAS (Firebase) ---

// Adicionar Nova Ocorrência (Formulário ATUALIZADO)
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
        
        if (!dataAbertura) {
            alert("Por favor, preencha a data de abertura.");
            return;
        }

        try {
            await db.collection('ocorrencias').add({
                empresa, endereco, regional, contrato, receita,
                dataAbertura, // Salva como datetime-local (YYYY-MM-DDTHH:MM)
                motivo,
                status: 'Fila de espera',
                
                // Campos do novo fluxo
                tecnicoAtribuido: null, // Nome do técnico
                tecnicoAtribuidoId: null, // ID do técnico
                dataInicio: null, // Data de "Em tratativa"
                dataFim: null,    // Data de "Finalizados"
                ordemManual: null // Para o mapa
            });
            
            formAddOcorrencia.reset();
            toggleModal(modalOcorrencia, false);
            alert('Ocorrência adicionada com sucesso!');
            
        } catch (error) {
            console.error("Erro ao adicionar ocorrência: ", error);
            alert("ERRO AO SALVAR OCORRÊNCIA:\n\n" + error.message);
        }
    });
}

// Carregar e Exibir Ocorrências (em tempo real)
function loadOcorrencias() {
    // Escuta apenas ocorrências que NÃO estão finalizadas
    db.collection('ocorrencias')
      .where('status', '!=', 'Finalizados')
      .orderBy('status', 'asc') // Fila de espera primeiro
      .orderBy('dataAbertura', 'asc') // Mais antigas primeiro
      .onSnapshot(snapshot => {
        
        let ocorrenciasPorRegional = {};
        REGIONAIS.forEach(r => { ocorrenciasPorRegional[r] = []; });
        
        if (snapshot.empty) {
            regionalListContainer.innerHTML = '<p>Nenhuma ocorrência ativa encontrada.</p>';
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
        
        // Pula regionais vazias
        if (numOcorrencias === 0) continue;

        const group = document.createElement('div');
        group.className = 'regional-group';
        
        group.innerHTML = `
            <button class="regional-header">
                <h3>Regional ${regional} (${numOcorrencias} ativas)</h3>
                <span class="acordeao-icone">&#9660;</span>
            </button>
            <div class="regional-body">
            </div>
        `;
        
        const regionalBody = group.querySelector('.regional-body');
        
        // Ordena (já vem do Firebase, mas podemos re-ordenar se necessário)
        // ocorrencias.sort((a, b) => new Date(a.dataAbertura) - new Date(b.dataAbertura));
        
        ocorrencias.forEach(oc => {
            regionalBody.appendChild(createOcorrenciaCard(oc));
        });
        
        regionalListContainer.appendChild(group);
    }
    
    addAcordeaoListeners();
}

// Cria um elemento de Cartão de Ocorrência (ATUALIZADO)
function createOcorrenciaCard(oc) {
    const card = document.createElement('div');
    card.className = 'ocorrencia-card';
    card.setAttribute('data-id', oc.id);
    card.setAttribute('data-contrato', oc.contrato);
    card.setAttribute('data-status', oc.status);
    
    // Texto para a barra de pesquisa
    const searchText = `${oc.empresa} ${oc.endereco} ${oc.motivo} ${oc.dataAbertura} ${oc.contrato} ${oc.status} ${oc.tecnicoAtribuido || ''}`.toLowerCase();
    card.setAttribute('data-search', searchText);
    
    // Cor da tag de status
    let statusColor = 'var(--cor-secundaria)'; // Fila de espera
    if (oc.status === 'Em deslocamento') statusColor = 'var(--cor-primaria)';
    if (oc.status === 'Em tratativa') statusColor = 'var(--cor-aviso)';
    
    const dataAbertura = formatarData(oc.dataAbertura);

    card.innerHTML = `
        <div class="card-header">
            <strong>${oc.empresa} (${oc.contrato})</strong>
            <span class="status-tag" style="background-color: ${statusColor};">${oc.status}</span>
        </div>
        <div class="card-body">
            <p><strong>Motivo:</strong> ${oc.motivo}</p>
            <p><strong>Endereço:</strong> ${oc.endereco}</p>
            <p><strong>Aberta em:</strong> ${dataAbertura}</p>
            ${oc.tecnicoAtribuido ? `<p><strong>Técnico:</strong> ${oc.tecnicoAtribuido}</p>` : ''}
        </div>
    `;

    // ADICIONA O LISTENER DE CLIQUE PARA O FLUXO DE STATUS
    card.addEventListener('click', () => {
        // Salva os dados da ocorrência clicada
        ocorrenciaSelecionada = { id: oc.id, ...oc }; 
        abrirModalAcoes();
    });

    return card;
}

// Lógica do Acordeão (Abrir/Fechar - Estilo "Solo")
function addAcordeaoListeners() {
    const headers = document.querySelectorAll('.regional-header');
    
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const body = header.nextElementSibling;
            const isActive = body.classList.contains('active');
            
            // Fecha todos os outros
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


// --- 7. LÓGICA DE FLUXO DE STATUS (NOVO) ---

// 7.1. Abrir Modal de Ações
function abrirModalAcoes() {
    if (!ocorrenciaSelecionada) return;

    // Atualiza o título e status
    modalAcoesTitulo.innerText = `Ocorrência: ${ocorrenciaSelecionada.empresa}`;
    modalAcoesStatusAtual.innerText = ocorrenciaSelecionada.status;

    // Habilita/desabilita botões baseado no status atual
    const status = ocorrenciaSelecionada.status;

    // Só pode atribuir técnico se estiver na fila
    btnAcaoDeslocamento.disabled = (status !== 'Fila de espera');
    
    // Só pode iniciar tratativa se estiver em deslocamento
    btnAcaoTratativa.disabled = (status !== 'Em deslocamento');
    
    // Só pode finalizar se estiver em tratativa
    btnAcaoFinalizar.disabled = (status !== 'Em tratativa');

    toggleModal(modalAcoesStatus, true);
}

// 7.2. Ação: "Em deslocamento" (Abrir modal de recomendação)
btnAcaoDeslocamento.addEventListener('click', () => {
    toggleModal(modalAcoesStatus, false); // Fecha modal de ações
    abrirModalRecomendacao();
});

// 7.3. Ação: "Em tratativa" (Abrir modal de data)
btnAcaoTratativa.addEventListener('click', () => {
    proximoStatus = 'Em tratativa'; // Define o que salvar
    toggleModal(modalAcoesStatus, false); // Fecha modal de ações
    
    modalDataTitulo.innerText = 'Registrar Início da Tratativa';
    modalDataLabel.innerText = 'Selecione a data e hora de INÍCIO:';
    btnSalvarData.className = 'action-button warning'; // Botão amarelo
    btnSalvarData.innerText = 'Salvar Início';
    
    registroDataHora.value = new Date().toISOString().slice(0, 16); // Sugere data atual
    toggleModal(modalRegistrarData, true);
});

// 7.4. Ação: "Finalizados" (Abrir modal de data)
btnAcaoFinalizar.addEventListener('click', () => {
    proximoStatus = 'Finalizados'; // Define o que salvar
    toggleModal(modalAcoesStatus, false); // Fecha modal de ações
    
    modalDataTitulo.innerText = 'Registrar Finalização';
    modalDataLabel.innerText = 'Selecione a data e hora de TÉRMINO:';
    btnSalvarData.className = 'action-button success'; // Botão verde
    btnSalvarData.innerText = 'Salvar e Finalizar';

    registroDataHora.value = new Date().toISOString().slice(0, 16); // Sugere data atual
    toggleModal(modalRegistrarData, true);
});


// 7.5. Lógica do Modal de Recomendação de Técnicos
function abrirModalRecomendacao() {
    const regional = ocorrenciaSelecionada.regional;
    const motivo = ocorrenciaSelecionada.motivo;

    modalRecomendarMotivo.innerText = motivo;
    listaRecomendacaoTecnicos.innerHTML = '<p>Carregando técnicos...</p>';
    btnConfirmarAtribuicao.disabled = true; // Desabilita até selecionar
    tecnicoSelecionadoParaAtribuir = null;

    // Filtra técnicos do cache
    const tecnicosDaRegional = allTecnicosCache.filter(t => t.regional === regional && t.disponivel);

    if (tecnicosDaRegional.length === 0) {
        listaRecomendacaoTecnicos.innerHTML = '<p>Nenhum técnico disponível nesta regional.</p>';
        return;
    }

    let recomendacoes = [];

    // Lógica de recomendação
    tecnicosDaRegional.forEach(tec => {
        let apto = tec.capacidades && tec.capacidades.includes(motivo);
        let restricoes = [];

        if (!apto) {
            restricoes.push("Não tem habilidade para este motivo.");
        }
        
        // Adiciona outras limitações (ex: "não faz OTDR")
        if (tec.limitacoes && tec.limitacoes.length > 0) {
            restricoes.push(...tec.limitacoes);
        }

        recomendacoes.push({
            id: tec.id,
            nome: tec.nome,
            apto: apto,
            restricoes: restricoes
        });
    });

    // Ordena: Aptos primeiro
    recomendacoes.sort((a, b) => {
        if (a.apto && !b.apto) return -1;
        if (!a.apto && b.apto) return 1;
        return 0;
    });

    // Renderiza a lista de recomendação
    listaRecomendacaoTecnicos.innerHTML = '';
    recomendacoes.forEach((tec, index) => {
        const item = document.createElement('label');
        item.className = 'tecnico-recomendado-item';
        
        // Destaca a primeira melhor opção
        if (index === 0 && tec.apto) {
            item.classList.add('best-match');
        }

        let restricoesHTML = '';
        if (tec.restricoes.length > 0) {
            restricoesHTML = `<small class="restricao">&#9888; Restrições: ${tec.restricoes.join(', ')}</small>`;
        } else {
            restricoesHTML = `<small style="color: green;">&#10004; 100% Compatível</small>`;
        }

        item.innerHTML = `
            <input type="radio" name="tecnico-recomendado" value="${tec.id}">
            <strong>${tec.nome}</strong>
            ${restricoesHTML}
        `;
        
        // Listener para salvar o técnico selecionado
        item.querySelector('input').addEventListener('change', (e) => {
            tecnicoSelecionadoParaAtribuir = {
                id: e.target.value,
                nome: tec.nome
            };
            btnConfirmarAtribuicao.disabled = false;
        });

        listaRecomendacaoTecnicos.appendChild(item);
    });

    toggleModal(modalRecomendarTecnico, true);
}

// 7.6. Confirmar Atribuição (Salvar Técnico)
btnConfirmarAtribuicao.addEventListener('click', async () => {
    if (!tecnicoSelecionadoParaAtribuir || !ocorrenciaSelecionada) {
        alert("Erro: Nenhum técnico ou ocorrência selecionada.");
        return;
    }

    btnConfirmarAtribuicao.disabled = true;
    btnConfirmarAtribuicao.innerText = 'Salvando...';

    try {
        const docRef = db.collection('ocorrencias').doc(ocorrenciaSelecionada.id);
        
        await docRef.update({
            status: 'Em deslocamento',
            tecnicoAtribuido: tecnicoSelecionadoParaAtribuir.nome,
            tecnicoAtribuidoId: tecnicoSelecionadoParaAtribuir.id
        });
        
        alert(`Técnico ${tecnicoSelecionadoParaAtribuir.nome} atribuído com sucesso!`);
        toggleModal(modalRecomendarTecnico, false);
        
    } catch (error) {
        console.error("Erro ao atribuir técnico: ", error);
        alert("Erro ao salvar: " + error.message);
    } finally {
        btnConfirmarAtribuicao.disabled = false;
        btnConfirmarAtribuicao.innerText = 'Confirmar Atribuição';
    }
});


// 7.7. Salvar Registro de Data/Hora (Início ou Fim)
formRegistrarData.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const dataHora = registroDataHora.value;
    if (!dataHora) {
        alert("Por favor, selecione a data e hora.");
        return;
    }

    btnSalvarData.disabled = true;
    btnSalvarData.innerText = 'Salvando...';

    let dadosAtualizar = {
        status: proximoStatus // "Em tratativa" ou "Finalizados"
    };

    if (proximoStatus === 'Em tratativa') {
        dadosAtualizar.dataInicio = dataHora;
    } else if (proximoStatus === 'Finalizados') {
        dadosAtualizar.dataFim = dataHora;
    }

    try {
        const docRef = db.collection('ocorrencias').doc(ocorrenciaSelecionada.id);
        await docRef.update(dadosAtualizar);
        
        alert(`Ocorrência atualizada para "${proximoStatus}" com sucesso!`);
        toggleModal(modalRegistrarData, false);
        
    } catch (error) {
        console.error("Erro ao salvar data: ", error);
        alert("Erro ao salvar: " + error.message);
    } finally {
        btnSalvarData.disabled = false;
        // O texto é resetado na próxima vez que o modal é aberto
    }
});


// --- 8. LÓGICA DE PESQUISA GLOBAL ---
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
        
        // Atualiza contagem e visibilidade das regionais
        const todasAsRegionais = document.querySelectorAll('.regional-group');
        todasAsRegionais.forEach(regional => {
            const header = regional.querySelector('.regional-header');
            const body = regional.querySelector('.regional-body');
            const cardsVisiveis = body.querySelectorAll('.ocorrencia-card:not(.hidden)').length;
            const totalCards = body.querySelectorAll('.ocorrencia-card').length;
            
            const regionalNome = header.querySelector('h3').innerText.split(' ')[1];

            if (searchTerm === '') {
                regional.classList.remove('hidden');
                header.querySelector('h3').innerText = `Regional ${regionalNome} (${totalCards} ativas)`;
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

// --- 9. FUNÇÕES UTILITÁRIAS ---

/**
 * Utilitário para formatar data e hora (datetime-local)
 * Entrada: "2025-11-16T21:56"
 * Saída: "16/11/2025 21:56"
 */
function formatarData(dataISO) {
    if (!dataISO) return 'N/A';
    
    try {
        if (dataISO.includes('T')) {
            const [data, hora] = dataISO.split('T');
            const [ano, mes, dia] = data.split('-');
            return `${dia}/${mes}/${ano} ${hora}`;
        }
        const [ano, mes, dia] = dataISO.split('-');
        return `${dia}/${mes}/${ano}`;

    } catch (e) {
        console.warn(`Data em formato inesperado: ${dataISO}`);
        return dataISO;
    }
}


// --- 10. INICIALIZAÇÃO ---
function init() {
    if (regionalListContainer) {
        loadTecnicos(); // Carrega o cache de técnicos
        loadOcorrencias(); // Carrega as ocorrências ativas
    }
}

document.addEventListener('DOMContentLoaded', init);