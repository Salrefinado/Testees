// --- 1. CONFIGURAÇÃO DO FIREBASE ---
// !! COLE AQUI A SUA *NOVA E SEGURA* 'firebaseConfig' (a mesma do main.js) !!
const firebaseConfig = {
    apiKey: "SUA_NOVA_API_KEY_SEGURA",
    authDomain: "mundivox-fsm.firebaseapp.com",
    projectId: "mundivox-fsm",
    storageBucket: "mundivox-fsm.appspot.com",
    messagingSenderId: "550574445476",
    appId: "SUA_NOVA_APP_ID"
};

// Inicializa o Firebase (Sintaxe v8)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 2. VARIÁVEIS GLOBAIS ---
let googleMap;
let sortableList;
let currentTecnico = null;
let currentRegional = null;
let allTecnicos = [];
let allOcorrencias = [];
let markers = [];
let directionsService;
let directionsRenderer;
let unsubscribeOcorrencias; // Para parar de ouvir a regional antiga

// --- 3. SELETORES DOM ---
const selectRegional = document.getElementById('select-regional');
const selectTecnico = document.getElementById('select-tecnico');
const btnReajustar = document.getElementById('btn-reajustar');
const listaOcorrenciasMap = document.getElementById('lista-ocorrencias-mapa');

// --- 4. INICIALIZAÇÃO DO MAPA (Chamado pela API do Google) ---
function initMap() {
    googleMap = new google.maps.Map(document.getElementById('map'), {
        center: { lat: -14.235, lng: -51.925 }, // Centro do Brasil
        zoom: 4
    });
    
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(googleMap);
    
    console.log("Mapa do Google inicializado.");
    
    initPageLogic();
}

// --- 5. LÓGICA DA PÁGINA ---
function initPageLogic() {
    
    loadAllTecnicos();
    
    selectRegional.addEventListener('change', (e) => {
        currentRegional = e.target.value;
        filterTecnicosPorRegional(currentRegional);
        clearRoute();
        // Carrega ocorrências assim que a regional é selecionada
        if (currentRegional) {
            loadOcorrenciasPorRegional(currentRegional);
        }
    });
    
    selectTecnico.addEventListener('change', (e) => {
        const tecnicoId = e.target.value;
        currentTecnico = allTecnicos.find(t => t.id === tecnicoId);
        
        if (currentTecnico) {
            processarRota();
        } else {
            clearRoute();
        }
    });
    
    btnReajustar.addEventListener('click', () => {
        if (confirm('Isso irá remover todos os ajustes manuais da rota deste técnico e recalcular a ordem ideal. Deseja continuar?')) {
            resetOrdemManual();
        }
    });
    
    sortableList = new Sortable(listaOcorrenciasMap, {
        animation: 150,
        ghostClass: 'placeholder-drag',
        onEnd: (evt) => {
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
    if (typeof unsubscribeOcorrencias === 'function') {
        unsubscribeOcorrencias(); // Para de ouvir a regional antiga
    }
    
    unsubscribeOcorrencias = db.collection('ocorrencias')
        .where('regional', '==', regional)
        .where('status', '==', 'Fila de espera')
        .onSnapshot(snapshot => {
            allOcorrencias = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            if (currentTecnico) {
                processarRota();
            } else {
                 // Se nenhum técnico, só mostra a lista (sem filtro de skill)
                processarRota();
            }
        });
}

// --- 6. O ALGORITMO DE PRIORIZAÇÃO ---

function processarRota() {
    if (allOcorrencias.length === 0) {
        clearRoute();
        return;
    }
    
    let ocorrenciasAptas = allOcorrencias;
    
    // 1. FILTRAR por SKILL (APENAS se um técnico estiver selecionado)
    if (currentTecnico) {
        ocorrenciasAptas = allOcorrencias.filter(oc => {
            const motivo = oc.motivo.toLowerCase();
            if (!currentTecnico.detalhes || currentTecnico.detalhes.length === 0) {
                return true; // Técnico não tem limitações
            }
            
            const isInapto = currentTecnico.detalhes.some(detalhe => {
                return motivo.includes(detalhe.toLowerCase().trim());
            });
            
            return !isInapto;
        });
    }

    // 2. ORDENAR (Sua hierarquia)
    let ocorrenciasOrdenadas = ocorrenciasAptas.sort((a, b) => {
        
        // REGRA 0: Ordem Manual
        const ordemA = a.ordemManual || 99999;
        const ordemB = b.ordemManual || 99999;
        
        if (ordemA !== 99999 || ordemB !== 99999) {
            return ordemA - ordemB;
        }
        
        // REGRA 1: Contrato
        const contratoValor = { "VIP BLACK": 3, "VIP": 2, "COMUM": 1 };
        const valA = contratoValor[a.contrato] || 0;
        const valB = contratoValor[b.contrato] || 0;
        if (valA !== valB) {
            return valB - valA; // Decrescente
        }
        
        // REGRA 2: Proximidade (AINDA NÃO IMPLEMENTADO)
        // TODO: Calcular distância
        
        // REGRA 3: Receita
        if (a.receita !== b.receita) {
            return b.receita - a.receita; // Decrescente
        }
        
        // REGRA 4: Data de Abertura
        const dataA = new Date(a.dataAbertura);
        const dataB = new Date(b.dataAbertura);
        return dataA - dataB; // Crescente (mais antiga primeiro)
    });
    
    // 3. RENDERIZAR
    renderListaOrdenada(ocorrenciasOrdenadas);
    renderRotaNoMapa(ocorrenciasOrdenadas);
}

// Renderiza a lista na sidebar
function renderListaOrdenada(ocorrencias) {
    listaOcorrenciasMap.innerHTML = '';
    
    if(ocorrencias.length === 0) {
        listaOcorrenciasMap.innerHTML = '<p>Nenhuma ocorrência compatível encontrada.</p>';
        return;
    }
    
    ocorrencias.forEach((oc, index) => {
        const item = document.createElement('li');
        item.className = 'map-ocorrencia-item';
        item.setAttribute('data-id', oc.id);
        item.setAttribute('data-contrato', oc.contrato);
        
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
        directionsRenderer.setDirections({ routes: [] });
        return;
    }
    
    // TODO: Usar a localização real do técnico como 'origin'
    
    const waypoints = [];
    const origin = ocorrencias[0].endereco;
    let destination = origin; // Padrão se houver apenas 1
    
    if (ocorrencias.length > 1) {
        destination = ocorrencias[ocorrencias.length - 1].endereco;
    }
    
    if (ocorrencias.length > 2) {
        ocorrencias.slice(1, -1).forEach(oc => {
            waypoints.push({
                location: oc.endereco,
                stopover: true
            });
        });
    }

    const request = {
        origin: origin,
        destination: destination,
        waypoints: waypoints,
        optimizeWaypoints: false, // Nós já otimizamos pela lista
        travelMode: google.maps.TravelMode.DRIVING
    };

    directionsService.route(request, (result, status) => {
        if (status == google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
        } else {
            console.warn("Erro ao calcular rota: " + status);
            // Se falhar (ex: muitos pontos ou endereço inválido), apenas desenha os pinos
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
                    label: `${index + 1}`
                });
                markers.push(marker);
            } else {
                console.warn(`Geocode falhou para ${oc.endereco}: ${status}`);
            }
        });
    });
}

function clearMarkers() {
    markers.forEach(m => m.setMap(null));
    markers = [];
}

function clearRoute() {
    listaOcorrenciasMap.innerHTML = '<p>Selecione uma regional e um técnico.</p>';
    directionsRenderer.setDirections({ routes: [] });
    clearMarkers();
}

// --- 7. LÓGICA DE REORDENAÇÃO MANUAL ---

async function updateOrdemManual(itens) {
    const batch = db.batch();
    
    Array.from(itens).forEach((item, index) => {
        const docId = item.getAttribute('data-id');
        const docRef = db.collection('ocorrencias').doc(docId);
        
        batch.update(docRef, { ordemManual: index + 1 });
    });
    
    try {
        await batch.commit();
        console.log("Ordem manual salva com sucesso.");
        // O onSnapshot vai recarregar a lista/rota
    } catch (error) {
        console.error("Erro ao salvar ordem manual: ", error);
    }
}

async function resetOrdemManual() {
    const batch = db.batch();
    
    const ids = Array.from(listaOcorrenciasMap.children).map(item => item.getAttribute('data-id'));
    
    if (ids.length === 0) return;
    
    ids.forEach(docId => {
        if (docId) { // Proteção contra itens vazios
            const docRef = db.collection('ocorrencias').doc(docId);
            batch.update(docRef, { ordemManual: null });
        }
    });
    
    try {
        await batch.commit();
        console.log("Ordem resetada.");
        // O onSnapshot vai re-ordenar tudo pelo algoritmo
    } catch (error) {
        console.error("Erro ao resetar ordem: ", error);
    }
}