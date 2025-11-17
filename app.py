import os
from flask import Flask, render_template

# Inicializa a aplicação Flask
app = Flask(__name__)

# Lê TODAS as chaves das Variáveis de Ambiente que você vai configurar no Render
# Elas serão None se não forem encontradas (para testes locais)
CONFIG = {
    "google_maps_key": os.environ.get('GOOGLE_MAPS_API_KEY'),
    "firebase_api_key": os.environ.get('FIREBASE_API_KEY'),
    "firebase_auth_domain": os.environ.get('FIREBASE_AUTH_DOMAIN'),
    "firebase_project_id": os.environ.get('FIREBASE_PROJECT_ID'),
    "firebase_storage_bucket": os.environ.get('FIREBASE_STORAGE_BUCKET'),
    "firebase_sender_id": os.environ.get('FIREBASE_SENDER_ID'),
    "firebase_app_id": os.environ.get('FIREBASE_APP_ID')
}

# --- Rota Principal (O Dashboard com a Lista) ---
@app.route('/')
def home():
    """
    Carrega o painel principal (index.html).
    """
    # Passa o dicionário de configuração para o template
    return render_template('index.html', config=CONFIG)

# --- Rota do Mapa Logístico ---
@app.route('/mapa')
def map_page():
    """
    Carrega a página de despacho (map.html).
    """
    # Passa o dicionário de configuração para o template
    return render_template('map.html', config=CONFIG)

# --- Rota do Relatório de Finalizados ---
@app.route('/relatorio')
def report_page():
    """
    Carrega a página de relatório (relatorio.html).
    """
    # Passa o dicionário de configuração para o template
    return render_template('relatorio.html', config=CONFIG)

# --- Ponto de Execução ---
if __name__ == '__main__':
    # O Render usa um servidor Gunicorn, mas isso é útil para testes locais
    app.run(debug=True)