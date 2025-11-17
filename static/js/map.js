//
// Arquivo: static/js/map.js
// (TOTALMENTE SUBSTITUÍDO)
//

// --- 1. CONFIGURAÇÃO DO FIREBASE ---
// A variável 'firebaseConfig' já foi carregada pelo 'firebase-config.js'
// O 'firebase-app.js' e 'firebase-firestore.js' (v8) já foram carregados pelo map.html

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
console.log("Mundivox FSM (Mapa) Carregado e Conectado!");

// --- 2. VARIÁVEIS GLOBAIS ---
let googleMap; // Instância do mapa
let sortableList; // Instância da lista arrastável
let currentTecnico = null; // O técnico selecionado (objeto completo)
let currentRegional = null; // A regional selecionada (string)
let allTecnicos = []; // Cache de técnicos
let allOcorrencias = []; // Cache de ocorrências
let markers = []; // Cache de marcadores do mapa
let directionsService;
let directionsRenderer;

// Listener para parar de ouvir o Firestore quando a página fechar
let unsubscribeOcorrencias = null;

// --- 3. SELETORES DOM ---
const selectRegional = document.getElementById('select-regional');
const selectTecnico = document.getElementById('select-tecnico');
const btnReajustar = document.getElementById('btn-reajustar');
const listaOcorrenciasMap = document.getElementById('lista-ocorrencias-mapa');

// --- 4. INICIALIZAÇÃO DO MAPA (Chamado pela API do Google) ---
// Esta função é chamada globalmente pelo script do Google Maps
function initMap() {
    try {
        googleMap = new google.maps.Map(document.getElementById('map'), {
            center: { lat: -23.550520, lng: -46.633308 }, // Centro de SP
            zoom: 8
        });
        
        directionsService = new google.maps.DirectionsService();
        directionsRenderer = new google.maps.DirectionsRenderer();
        directionsRenderer.setMap(googleMap);
        
        console.log("Mapa do Google inicializado.");
        
        // Inicia a lógica da página
        initPageLogic();

    } catch (e) {
        console.error("Erro ao inicializar o Google Maps: ", e);
        document.getElementById('map').innerHTML = "Erro ao carregar o mapa. Verifique sua chave de API.";
    }
}

// --- 5. LÓGICA DA PÁGINA ---
function initPageLogic() {
    
    // Carrega todos os técnicos (para o seletor)
    loadAllTecnicos();
    
    // Listener para mudança de Regional
    selectRegional.addEventListener('change', (e) => {
        currentRegional = e.target.value;
        filterTecnicosPorRegional(currentRegional);
        // Quando a regional muda, limpa a rota
        clearRoute();
    });
    
    // Listener para mudança de Técnico
    selectTecnico.addEventListener('change', (e) => {
        const tecnicoId = e.target.value;
        currentTecnico = allTecnicos.find(t => t.id === tecnicoId);
        
        // Se um técnico for selecionado, carrega suas ocorrências
        if (currentTecnico) {
            loadOcorrenciasPorRegional(currentRegional);
        } else {
            clearRoute();
        }
    });
    
    // Listener do botão "Reajustar"
    btnReajustar.addEventListener('click', () => {
        if (confirm('Isso irá remover todos os ajustes manuais da rota deste técnico e recalcular a ordem ideal. Deseja continuar?')) {
            resetOrdemManual();
        }
    });
    
    // Inicializa a lista arrastável
    sortableList = new Sortable(listaOcorrenciasMap, {
        animation: 150,
        ghostClass: 'placeholder-drag',
        onEnd: (evt) => {
            // Chamado quando o usuário solta um item
            updateOrdemManual(evt.target.children);
        }
    });
}

// Carrega todos os técnicos para o cache
async function loadAllTecnicos() {
    try {
        const snapshot = await db.collection('tecnicos').get();
        allTecnicos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Técnicos carregados:", allTecnicos.length);
    } catch (error) {
        console.error("Erro ao carregar técnicos: ", error);
    }
}

// Filtra o <select> de técnicos pela regional
function filterTecnicosPorRegional(regional) {
    selectTecnico.innerHTML = '<option value="" disabled selected>Selecione um Técnico</option>';
    
    const tecnicosDaRegional = allTecnicos.filter(t => t.regional === regional && t.disponivel);
    
    tecnicosDaRegional.forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = t.nome;
        selectTecnico.appendChild(option);
    });
}

// Carrega as ocorrências da regional (e inicia o listener)
function loadOcorrenciasPorRegional(regional) {
    // Remove o listener antigo, se houver
    if (typeof unsubscribeOcorrencias === 'function') {
        unsubscribeOcorrencias();
    }
    
    // Ouve em tempo real as ocorrências da regional e que estão 'Fila de espera'
    unsubscribeOcorrencias = db.collection('ocorrencias')
        .where('regional', '==', regional)
        .where('status', '==', 'Fila de espera')
        .onSnapshot(snapshot => {
            allOcorrencias = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Se um técnico estiver selecionado, processa a rota
            if (currentTecnico) {
                processarRota();
            }
        }, (error) => {
            console.error(`Erro ao ouvir ocorrências da regional ${regional}: `, error);
        });
}

// --- 6. O ALGORITMO DE PRIORIZAÇÃO ---

function processarRota() {
    if (!currentTecnico || allOcorrencias.length === 0) {
        clearRoute();
        return;
    }
    
    // 1. FILTRAR por SKILL (Ocorrências que o técnico PODE fazer)
    // ATUALIZADO: Usa o campo 'capacidades' que cadastramos no seed_firebase.py
    let ocorrenciasAptas = allOcorrencias.filter(oc => {
        if (!currentTecnico.capacidades || currentTecnico.capacidades.length === 0) {
            return false; // Se o técnico não tem capacidades cadastradas, não pode fazer nada
        }
        // Verifica se o motivo da ocorrência está na lista de capacidades do técnico
        return currentTecnico.capacidades.includes(oc.motivo);
    });
    
    // 2. ORDENAR (Sua hierarquia)
    let ocorrenciasOrdenadas = ocorrenciasAptas.sort((a, b) => {
        
        // REGRA 0: Ordem Manual (A mais importante)
        const ordemA = a.ordemManual || 9999;
        const ordemB = b.ordemManual || 9999;
        
        if (ordemA !== 9999 || ordemB !== 9999) {
            return ordemA - ordemB;
        }
        
        // REGRA 1: Contrato (VIP BLACK > VIP > COMUM)
        // Corrigido para os valores exatos
        const contratoValor = { "VIP BLACK": 3, "VIP": 2, "COMUM": 1 };
        const valA = contratoValor[a.contrato] || 0;
        const valB = contratoValor[b.contrato] || 0;
        if (valA !== valB) {
            return valB - valA; // Decrescente (3 vem antes de 1)
        }
        
        // REGRA 2: Proximidade (AINDA NÃO IMPLEMENTADO)
        // TODO: Calcular distância do técnico para 'a' e 'b'
        // Por enquanto, pulamos para a próxima regra
        
        // REGRA 3: Receita (Maior > Menor)
        const receitaA = a.receita || 0;
        const receitaB = b.receita || 0;
        if (receitaA !== receitaB) {
            return receitaB - receitaA; // Decrescente
        }
        
        // REGRA 4: Data de Abertura (Mais Antiga > Mais Nova)
        const dataA = new Date(a.dataAbertura);
        const dataB = new Date(b.dataAbertura);
        return dataA - dataB; // Crescente (data mais antiga primeiro)
    });
    
    // 3. RENDERIZAR
    renderListaOrdenada(ocorrenciasOrdenadas);
    renderRotaNoMapa(ocorrenciasOrdenadas);
}

// Renderiza a lista na sidebar
function renderListaOrdenada(ocorrencias) {
    listaOcorrenciasMap.innerHTML = ''; // Limpa
    
    if (ocorrencias.length === 0) {
        listaOcorrenciasMap.innerHTML = '<li>Nenhuma ocorrência compatível com este técnico.</li>';
        return;
    }

    ocorrencias.forEach((oc, index) => {
        const item = document.createElement('li');
        item.className = 'map-ocorrencia-item';
        item.setAttribute('data-id', oc.id);
        item.setAttribute('data-contrato', oc.contrato); // VIP BLACK, VIP, COMUM
        
        item.innerHTML = `
            <strong>${index + 1}. ${oc.empresa} (${oc.contrato})</strong>
            <small>Motivo: ${oc.motivo}</small>
        `;
        
        listaOcorrenciasMap.appendChild(item);
    });
}

// Desenha a rota no mapa
function renderRotaNoMapa(ocorrencias) {
    clearMarkers();
    
    if (ocorrencias.length === 0) {
        directionsRenderer.setDirections({ routes: [] }); // Limpa a rota
        return;
    }
    
    // O primeiro é a origem
    const origin = ocorrencias[0].endereco;
    
    // O último é o destino
    const destination = ocorrencias[ocorrencias.length - 1].endereco;
    
    // Os do meio são waypoints
    let waypoints = [];
    if (ocorrencias.length > 2) {
        waypoints = ocorrencias.slice(1, -1).map(oc => ({
            location: oc.endereco,
            stopover: true
        }));
    }

    // Cria a requisição da rota
    const request = {
        origin: origin,
        destination: destination,
        waypoints: waypoints,
        optimizeWaypoints: false, // Nós já otimizamos
        travelMode: google.maps.TravelMode.DRIVING
    };

    // Chama a API do Google Directions
    directionsService.route(request, (result, status) => {
        if (status == google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
        } else {
            console.warn("Erro ao calcular rota: " + status + ". Desenhando apenas os marcadores.");
            // Se falhar (ex: muitos pontos, endereço não encontrado), apenas desenha os pinos
            renderMarkers(ocorrencias);
        }
    });
}

// Se a rota falhar, apenas desenha os pinos (Geocoding)
function renderMarkers(ocorrencias) {
    const geocoder = new google.maps.Geocoder();
    ocorrencias.forEach((oc, index) => {
        geocoder.geocode({ 'address': oc.endereco }, (results, status) => {
            if (status == 'OK') {
                const marker = new google.maps.Marker({
                    map: googleMap,
                    position: results[0].geometry.location,
                    label: `${index + 1}` // Número da parada
                });
                markers.push(marker);
            } else {
                console.warn(`Geocode falhou para o endereço: ${oc.endereco}. Status: ${status}`);
            }
        });
    });
}

function clearMarkers() {
    markers.forEach(m => m.setMap(null));
    markers = [];
}

function clearRoute() {
    listaOcorrenciasMap.innerHTML = '';
    directionsRenderer.setDirections({ routes: [] });
    clearMarkers();
}

// --- 7. LÓGICA DE REORDENAÇÃO MANUAL ---

// Chamado quando o usuário arrasta e solta
async function updateOrdemManual(itens) {
    const batch = db.batch(); // Cria um lote de escritas no DB
    
    Array.from(itens).forEach((item, index) => {
        const docId = item.getAttribute('data-id');
        const docRef = db.collection('ocorrencias').doc(docId);
        
        batch.update(docRef, { ordemManual: index + 1 });
    });
    
    try {
        await batch.commit();
        console.log("Ordem manual salva com sucesso.");
        // O listener 'onSnapshot' vai detectar a mudança e
        // re-chamar o 'processarRota()', que vai respeitar a nova ordem.
    } catch (error) {
        console.error("Erro ao salvar ordem manual: ", error);
    }
}

// Chamado pelo botão "Reajustar"
async function resetOrdemManual() {
    const batch = db.batch();
    
    // Pega todas as ocorrências na lista atual
    const ids = Array.from(listaOcorrenciasMap.children).map(item => item.getAttribute('data-id'));
    
    ids.forEach(docId => {
        if (docId) { // Garante que não é um 'li' de "Nenhuma ocorrência"
            const docRef = db.collection('ocorrencias').doc(docId);
            batch.update(docRef, { ordemManual: null }); // Reseta
        }
    });
    
    try {
        await batch.commit();
        console.log("Ordem resetada.");
        // O listener 'onSnapshot' vai re-ordenar tudo pelo algoritmo
    } catch (error) {
        console.error("Erro ao resetar ordem: ", error);
    }
}