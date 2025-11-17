from flask import Flask, render_template

# Inicializa a aplicação Flask
app = Flask(__name__)

# --- Rota Principal (O Dashboard com a Lista) ---
@app.route('/')
def home():
    """
    Carrega o painel principal (index.html), que contém a lista
    de regionais, pesquisa e botões de ação.
    """
    return render_template('index.html')

# --- Rota do Mapa Logístico ---
@app.route('/mapa')
def map_page():
    """
    Carrega a página de despacho (map.html), que conterá
    o mapa e a lógica de roteirização.
    """
    return render_template('map.html')

# --- Rota do Relatório de Finalizados (Nova) ---
@app.route('/relatorio')
def report_page():
    """
    Carrega a página de relatório (relatorio.html), que mostrará
    as ocorrências com status "Finalizados".
    """
    return render_template('relatorio.html')

# --- Ponto de Execução ---
if __name__ == '__main__':
    app.run(debug=True)