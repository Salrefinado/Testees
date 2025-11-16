// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCelFazhrkaTq3UjgFv4LHT3LdqgpD6h1s",
  authDomain: "mundivox-fsm-9e2da.firebaseapp.com",
  projectId: "mundivox-fsm-9e2da",
  storageBucket: "mundivox-fsm-9e2da.firebasestorage.app",
  messagingSenderId: "614588113700",
  appId: "1:614588113700:web:1d24050b3ec4f6808449b1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 2. VARIÁVEIS GLOBAIS ---
let googleMap; // Instância do mapa
let sortableList; // Instância da lista arrastável
let currentTecnico = null; // O técnico selecionado
let currentRegional = null; // A regional selecionada
let allTecnicos = []; // Cache de técnicos
let allOcorrencias = []; // Cache de ocorrências
let markers = []; // Cache de marcadores do mapa
let directionsService;
let directionsRenderer;

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
    
    // Inicia a lógica da página
    initPageLogic();
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
        });
}

// --- 6. O ALGORITMO DE PRIORIZAÇÃO ---

function processarRota() {
    if (!currentTecnico || allOcorrencias.length === 0) {
        clearRoute();
        return;
    }
    
    // 1. FILTRAR por SKILL (Ocorrências que o técnico PODE fazer)
    let ocorrenciasAptas = allOcorrencias.filter(oc => {
        const motivo = oc.motivo.toLowerCase();
        // `some` retorna true se *algum* detalhe do técnico bater com o motivo
        const isInapto = currentTecnico.detalhes.some(detalhe => {
            return motivo.includes(detalhe.toLowerCase());
        });
        
        return !isInapto; // Retorna true se ele NÃO for inapto
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
        const contratoValor = { "VIP BLACK": 3, "VIP": 2, "COMUM": 1 };
        const valA = contratoValor[a.contrato] || 0;
        const valB = contratoValor[b.contrato] || 0;
        if (valA !== valB) {
            return valB - valA; // Decrescente
        }
        
        // REGRA 2: Proximidade (AINDA NÃO IMPLEMENTADO - Requer Geocoding)
        // TODO: Calcular distância do técnico para 'a' e 'b'
        // Por enquanto, pulamos para a próxima regra
        
        // REGRA 3: Receita (Maior > Menor)
        if (a.receita !== b.receita) {
            return b.receita - a.receita; // Decrescente
        }
        
        // REGRA 4: Data de Abertura (Mais Antiga > Mais Nova)
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
    listaOcorrenciasMap.innerHTML = ''; // Limpa
    
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
    // TODO: Usar a localização real do técnico
    // Por enquanto, usaremos o endereço da 1ª ocorrência como "partida"
    // ou apenas traçar a rota entre as ocorrências
    
    clearMarkers();
    
    if (ocorrencias.length === 0) {
        directionsRenderer.setDirections({ routes: [] }); // Limpa a rota
        return;
    }
    
    const waypoints = [];
    
    // O primeiro é a origem
    const origin = ocorrencias[0].endereco;
    
    // O último é o destino
    const destination = ocorrencias[ocorrencias.length - 1].endereco;
    
    // Os do meio são waypoints
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
            console.warn("Erro ao calcular rota: " + status);
            // Se falhar (ex: muitos pontos), apenas desenha os pinos
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
    // `itens` é a nova ordem dos elementos HTML
    const batch = db.batch(); // Cria um lote de escritas no DB
    
    Array.from(itens).forEach((item, index) => {
        const docId = item.getAttribute('data-id');
        const docRef = db.collection('ocorrencias').doc(docId);
        
        // Define a `ordemManual` baseado na nova posição (começando de 1)
        batch.update(docRef, { ordemManual: index + 1 });
    });
    
    try {
        await batch.commit();
        // O listener 'onSnapshot' vai detectar a mudança e
        // re-chamar o 'processarRota()', que vai respeitar a nova ordem.
        console.log("Ordem manual salva com sucesso.");
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
        const docRef = db.collection('ocorrencias').doc(docId);
        batch.update(docRef, { ordemManual: null }); // Reseta
    });
    
    try {
        await batch.commit();
        // O listener 'onSnapshot' vai re-ordenar tudo pelo algoritmo
        console.log("Ordem resetada.");
    } catch (error) {
        console.error("Erro ao resetar ordem: ", error);
    }
}