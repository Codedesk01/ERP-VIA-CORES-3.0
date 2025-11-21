# Arquivo: run.py (VERSÃO CORRIGIDA E FINAL)

# 1. Importa o Eventlet e aplica o "monkey patching".
#    Isto continua sendo a primeira e mais importante coisa a se fazer.
import eventlet
eventlet.monkey_patch()

# 2. Importa o SERVIDOR WSGI do próprio Eventlet.
from eventlet import wsgi

# 3. Importa a sua aplicação Flask e o objeto SocketIO.
from app import app, socketio

# 4. Inicia o servidor de produção do Eventlet.
if __name__ == '__main__':
    print("🚀 Iniciando o servidor em modo de produção com o servidor WSGI do Eventlet...")
    print("   O servidor estará disponível em http://localhost:5000" )
    
    # Cria um "listener" de rede na porta 5000 para todos os endereços IP.
    listener = eventlet.listen(('0.0.0.0', 5000))
    
    # Inicia o servidor WSGI do Eventlet, passando o listener e a aplicação.
    # O 'app' do Flask já está "envolvido" pelo SocketIO, então o wsgi.server
    # saberá como lidar tanto com requisições HTTP normais quanto com WebSockets.
    wsgi.server(listener, app)
    

