# app.py - VERSÃO OTIMIZADA PARA COMUNICAÇÃO INSTANTÂNEA
from flask import Flask, render_template, request, jsonify, send_from_directory, send_file, make_response
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import threading
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import UniqueConstraint, Identity, cast, String
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy import or_, and_
from sqlalchemy.types import JSON as SQLJSON
from sqlalchemy import UniqueConstraint, Identity
from threading import Lock, Thread, Semaphore, Condition
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import json
import datetime
import re
import os
from PIL import Image
import traceback
import io
import uuid
from queue import Queue, PriorityQueue
import logging
from functools import wraps
from collections import defaultdict, deque
from werkzeug.utils import secure_filename

# =================================================================
# IMPORTAÇÃO DO MÓDULO EAN
# =================================================================
from ean_module import init_ean_module

# =================================================================
# CONFIGURAÇÃO DE LOGGING PARA DEBUG
# =================================================================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# Lock para proteger operações de escrita no banco de dados e evitar "database is locked".
db_write_lock = Lock()

# --- 1. CONFIGURAÇÕES GLOBAIS ---

# Sistema de cache otimizado
image_cache = {}
is_cache_ready = False
cache_lock = threading.Lock()


# =================================================================
# CONFIGURAÇÕES DO SERVIDOR
# =================================================================

# 2. Inicialize o SocketIO, envolvendo sua aplicação Flask
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# NOVO CÓDIGO COM POSTGRESQL
DATABASE_URL = "postgresql://postgres:123456@localhost:5432/meu_erp_viacores"

app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_size': 10,
    'pool_recycle': 300,
    'pool_pre_ping': True
}

db = SQLAlchemy(app)

# Caminhos de rede
IMAGE_SOURCE_PATH = r'\\Vcadms-02\IMPRESSAO\IMPRESSAO - VIA CORES\IMPRESSÃO MKTP - SKU'
IMAGE_SEARCH_ROOT_PATH = r'\\Vcadms-02\VENDAS\VENDAS MARKETPLACE'
IMAGE_TEMP_DEST_PATH = r'\\Vcadms-02\IMPRESSAO\TESTE'


# Variáveis para cache em memória
IMAGE_PATH_CACHE = {}
CACHE_BUILD_LOCK = threading.Lock()
IS_CACHE_READY = False





# =================================================================
# SISTEMA DE FILAS PARALELAS PARA PERFORMANCE
# =================================================================

class TaskQueue:
    """
    Sistema de fila com prioridades para gerenciar tarefas pesadas.
    Permite que operações leves (pedidos) sejam processadas enquanto 
    operações pesadas (imagens) rodam em background.
    """
    
    def __init__(self, max_workers=8):
        self.max_workers = max_workers
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.priority_queue = PriorityQueue()
        self.active_tasks = {}
        self.task_results = {}
        self.task_lock = Lock()
        self.task_counter = 0
        
        # Semáforos para limitar concorrência
        self.image_processing_semaphore = Semaphore(2)  # Máximo 2 processos de imagem simultâneos
        self.database_semaphore = Semaphore(4)  # Máximo 4 operações de DB simultâneas
        
        # Contadores de performance
        self.task_counters = defaultdict(int)
        
        logger.info(f"TaskQueue inicializada com {max_workers} workers")
    
    def submit_task(self, priority, func, *args, task_type='general', **kwargs):
        """
        Adiciona uma tarefa à fila com prioridade.
        Prioridades: 1=Alta (pedidos), 2=Média (estatísticas), 3=Baixa (imagens)
        """
        with self.task_lock:
            self.task_counter += 1
            task_id = self.task_counter
        
        future = self.executor.submit(self._run_with_semaphore, task_id, task_type, func, *args, **kwargs)
        
        with self.task_lock:
            self.active_tasks[task_id] = {
                'future': future,
                'priority': priority,
                'task_type': task_type,
                'start_time': time.time()
            }
            
            # Incrementa contador de tarefas do tipo
            self.task_counters[task_type] += 1
        
        logger.info(f"Tarefa #{task_id} do tipo '{task_type}' adicionada com prioridade {priority}")
        return task_id
    
    def _run_with_semaphore(self, task_id, task_type, func, *args, **kwargs):
        """
        Executa função com semáforo específico do tipo de tarefa.
        """
        semaphore = self._get_semaphore_for_task_type(task_type)
        
        with semaphore:
            try:
                result = func(*args, **kwargs)
                with self.task_lock:
                    if task_id in self.active_tasks:
                        self.task_results[task_id] = result
                        del self.active_tasks[task_id]
                return result
            except Exception as e:
                logger.error(f"Erro na tarefa #{task_id}: {e}")
                with self.task_lock:
                    if task_id in self.active_tasks:
                        self.task_results[task_id] = {'error': str(e)}
                        del self.active_tasks[task_id]
                raise
    
    def _get_semaphore_for_task_type(self, task_type):
        """Retorna o semáforo apropriado para o tipo de tarefa."""
        if task_type == 'image_processing':
            return self.image_processing_semaphore
        elif task_type == 'database':
            return self.database_semaphore
        else:
            # Para tarefas gerais, usa um lock padrão
            return threading.Lock()
    
    def get_task_status(self, task_id):
        """Retorna o status de uma tarefa específica."""
        with self.task_lock:
            if task_id in self.active_tasks:
                return {
                    'status': 'running',
                    'task_type': self.active_tasks[task_id]['task_type'],
                    'start_time': self.active_tasks[task_id]['start_time']
                }
            elif task_id in self.task_results:
                result = self.task_results[task_id]
                if 'error' in result:
                    return {'status': 'error', 'result': result}
                else:
                    return {'status': 'completed', 'result': result}
            else:
                return {'status': 'not_found'}
    
    def get_queue_stats(self):
        """Retorna estatísticas da fila."""
        with self.task_lock:
            return {
                'active_tasks': len(self.active_tasks),
                'completed_tasks': len(self.task_results),
                'task_types_count': dict(self.task_counters)
            }

# Inicializa o sistema de filas
task_queue = TaskQueue(max_workers=8)





# =================================================================
# CACHE OTIMIZADO COM COMPRESSÃO E PREFETCH
# =================================================================

class OptimizedImageCache:
    """
    Cache otimizado para imagens com compressão e prefetch.
    """
    
    def __init__(self, max_size=1000):
        self.max_size = max_size
        self.cache = {}
        self.access_times = {}
        self.cache_lock = threading.Lock()
        self.compression_enabled = True
        self.prefetch_pool = ThreadPoolExecutor(max_workers=3)
        
        logger.info(f"Cache otimizado inicializado com capacidade para {max_size} imagens")
    
    def get_image_paths(self, sku_base):
        """Busca caminhos de imagem com cache e prefetch."""
        with self.cache_lock:
            if sku_base in self.cache:
                # Atualiza timestamp de acesso
                self.access_times[sku_base] = time.time()
                logger.debug(f"Cache HIT para SKU: {sku_base}")
                return self.cache[sku_base]
        
        # Cache miss - busca no disco
        logger.info(f"Cache MISS para SKU: {sku_base} - buscando no disco")
        paths = self._search_images_on_disk(sku_base)
        
        if paths:
            with self.cache_lock:
                self._evict_if_needed()
                self.cache[sku_base] = paths
                self.access_times[sku_base] = time.time()
            
            # Prefetch imagens relacionadas em background
            self.prefetch_related_images(sku_base)
        
        return paths
    
    def _search_images_on_disk(self, sku_base):
        """Busca imagens no disco de forma otimizada."""
        valid_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.pdf', '.cdr')
        paths = []
        
        # Lista de caminhos para verificar
        search_paths = [
            r'\\Vcadms-02\IMPRESSAO\IMPRESSAO - VIA CORES\IMPRESSÃO MKTP - SKU',
            r'\\Vcadms-02\VENDAS\VENDAS MARKETPLACE'
        ]
        
        for search_path in search_paths:
            if not os.path.isdir(search_path):
                continue
                
            try:
                # Usa listdir em vez de walk para melhor performance
                for filename in os.listdir(search_path):
                    if filename.lower().endswith(valid_extensions):
                        file_sku_base = filename.split('-')[0].split(' ')[0].upper()
                        if file_sku_base == sku_base.upper():
                            paths.append(os.path.join(search_path, filename))
            except (PermissionError, OSError) as e:
                logger.warning(f"Erro ao acessar {search_path}: {e}")
                continue
        
        return paths
    
    def prefetch_related_images(self, sku_base):
        """Prefetch de imagens relacionadas em background."""
        related_skus = self._get_related_skus(sku_base)
        
        for related_sku in related_skus:
            if related_sku not in self.cache:
                self.prefetch_pool.submit(self.get_image_paths, related_sku)
    
    def _get_related_skus(self, sku_base):
        """Retorna SKUs relacionados para prefetch."""
        # Baseado no SKU atual, gera possíveis variações
        related = [] 
        
        # Adiciona variações comuns
        variations = ['-100', '-130', '-150', '-175', '-VF', '-F', '-P']
        for var in variations:
            related.append(sku_base + var)
        
        return related[:5]  # Limita prefetch para 5 itens
    
    def _evict_if_needed(self):
        """Remove itens antigos do cache se necessário."""
        if len(self.cache) <= self.max_size:
            return
        
        # Remove os 20% menos acessados
        items_to_remove = int(self.max_size * 0.2)
        sorted_items = sorted(self.access_times.items(), key=lambda x: x[1])
        
        for sku, _ in sorted_items[:items_to_remove]:
            if sku in self.cache:
                del self.cache[sku]
            del self.access_times[sku]
        
        logger.info(f"Cache limpo: {items_to_remove} itens removidos")

# Inicializa cache otimizado
optimized_cache = OptimizedImageCache(max_size=1500)


# =================================================================
# DECORATORS PARA RATE LIMITING E PERFORMANCE
# =================================================================

def rate_limit(requests_per_minute=60):
    """Decorator para rate limiting."""
    def decorator(func):
        func.call_history = deque(maxlen=requests_per_minute)
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            now = time.time()
            
            # Remove chamadas antigas
            while func.call_history and now - func.call_history[0] > 60:
                func.call_history.popleft()
            
            # Verifica limite
            if len(func.call_history) >= requests_per_minute:
                raise Exception(f"Rate limit exceeded for {func.__name__}")
            
            func.call_history.append(now)
            return func(*args, **kwargs)
        
        return wrapper
    return decorator

def async_task(task_type='general', priority=2):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # ⚠️ SEMPRE EXECUTA DIRETAMENTE - SEM FILA
            # ⚠️ Para evitar erros de contexto Flask em threads
            logger.info(f"Executando {func.__name__} diretamente (sem fila)")
            return func(*args, **kwargs)
        return wrapper
    return decorator





# =================================================================
# INICIALIZAÇÃO DO MÓDULO EAN
# =================================================================
# As tabelas EAN serão criadas pelo módulo EAN quando inicializado
ean_module = init_ean_module(app, db, socketio)




# Em app.py, adicione esta nova função

import os
import shutil

def cleanup_temp_folders():
    """
    Função que executa em segundo plano para limpar pastas de busca antigas.
    Remove pastas com idade maior que 24 horas.
    """
    print("🧹 [CLEANUP THREAD] Serviço de limpeza de pastas temporárias iniciado.")
    
    # Define o tempo máximo de vida de uma pasta em segundos (24 horas)
    MAX_AGE_SECONDS = 24 * 60 * 60  # 86400 segundos

    # Tempo entre verificações (em segundos). Em produção, 3600 (1 hora) é razoável.
    SLEEP_SECONDS = 3600

    while True:
        try:
            print(f"🧹 [CLEANUP THREAD] Verificando pastas em '{IMAGE_TEMP_DEST_PATH}'...")
            
            # Garante que o diretório de destino existe
            if not os.path.isdir(IMAGE_TEMP_DEST_PATH):
                print(f"⚠️ [CLEANUP THREAD] Diretório de pastas temporárias não encontrado: {IMAGE_TEMP_DEST_PATH}. A limpeza será ignorada.")
                time.sleep(SLEEP_SECONDS)
                continue

            pastas_encontradas = os.listdir(IMAGE_TEMP_DEST_PATH)
            pastas_removidas = 0
            now = int(time.time())

            for folder_name in pastas_encontradas:
                # Apenas processa pastas que seguem o nosso padrão "busca_..."
                if not folder_name.startswith('busca_'):
                    continue

                full_folder_path = os.path.join(IMAGE_TEMP_DEST_PATH, folder_name)

                # Segurança: só processa se for diretório e estiver dentro do caminho esperado
                if not os.path.isdir(full_folder_path):
                    continue

                folder_age = None

                # Tenta extrair timestamp do nome: 'busca_1761840769_9324' -> 1761840769
                try:
                    parts = folder_name.split('_')
                    if len(parts) >= 2 and parts[1].isdigit():
                        folder_creation_time = int(parts[1])
                        folder_age = now - folder_creation_time
                    else:
                        raise ValueError("timestamp não encontrado no nome")
                except Exception:
                    # Fallback: usa tempo de modificação do diretório (getmtime)
                    try:
                        folder_mtime = int(os.path.getmtime(full_folder_path))
                        folder_age = now - folder_mtime
                    except Exception as e:
                        print(f"⚠️ [CLEANUP THREAD] Não foi possível obter tempo da pasta {full_folder_path}: {e}")
                        continue  # pula esta pasta

                # Se a pasta for mais antiga que o limite, remove-a
                try:
                    if folder_age is not None and folder_age > MAX_AGE_SECONDS:
                        hours = folder_age / 3600
                        print(f"🗑️ [CLEANUP THREAD] Removendo pasta expirada: {folder_name} (Idade: {hours:.2f} horas)")
                        
                        # shutil.rmtree remove a pasta e todo o seu conteúdo
                        shutil.rmtree(full_folder_path)
                        pastas_removidas += 1
                except Exception as e:
                    print(f"❌ [CLEANUP THREAD] Erro ao tentar remover a pasta {full_folder_path}: {e}")

            if pastas_removidas > 0:
                print(f"✅ [CLEANUP THREAD] Limpeza concluída. {pastas_removidas} pastas removidas.")
            else:
                print("✅ [CLEANUP THREAD] Nenhuma pasta expirada encontrada.")

        except Exception as e:
            print(f"❌ [CLEANUP THREAD] Erro crítico no ciclo de limpeza: {e}")

        # Espera antes de rodar a verificação novamente
        time.sleep(SLEEP_SECONDS)






# =================================================================
# FUNÇÕES DE CONSTRUÇÃO DE CACHE OTIMIZADA
# =================================================================

def build_image_path_cache_optimized():
    """
    VERSÃO OTIMIZADA: Constrói cache de imagens com processamento paralelo
    e loading incremental para não travar o servidor.
    """
    global IMAGE_PATH_CACHE, IS_CACHE_READY
    logger.info("🚀 [CACHE THREAD OTIMIZADO] Iniciando mapeamento otimizado de imagens...")
    start_time = time.time()
    
    temp_cache = {}
    valid_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.pdf', '.cdr')
    
    if not os.path.isdir(IMAGE_SOURCE_PATH):
        logger.error(f"❌ [CACHE THREAD] Diretório de origem não encontrado: {IMAGE_SOURCE_PATH}")
        with CACHE_BUILD_LOCK:
            IS_CACHE_READY = True
        return
    
    # Processamento em chunks para evitar timeout
    chunk_size = 1000  # Processa 1000 arquivos por vez
    total_files = 0
    processed_files = 0
    
    try:
        # Lista todos os arquivos primeiro
        all_files = []
        for root, _, files in os.walk(IMAGE_SOURCE_PATH):
            for filename in files:
                if filename.lower().endswith(valid_extensions):
                    all_files.append((root, filename))
        
        total_files = len(all_files)
        logger.info(f"📁 Encontrados {total_files} arquivos de imagem para processar")
        
        # Processa em chunks
        for i in range(0, len(all_files), chunk_size):
            chunk = all_files[i:i + chunk_size]
            chunk_start_time = time.time()
            
            # Processa chunk atual
            for root, filename in chunk:
                try:
                    sku_base = filename.split('-')[0].split(' ')[0].upper()
                    
                    if sku_base not in temp_cache:
                        temp_cache[sku_base] = []
                    
                    temp_cache[sku_base].append(os.path.join(root, filename))
                    processed_files += 1
                    
                except Exception as e:
                    logger.warning(f"Erro ao processar {filename}: {e}")
                    continue
            
            chunk_time = time.time() - chunk_start_time
            logger.info(f"✅ Chunk {i//chunk_size + 1} processado: {len(chunk)} arquivos em {chunk_time:.2f}s")
            
            # Atualiza cache incrementalmente para não perder tudo se falhar
            with CACHE_BUILD_LOCK:
                IMAGE_PATH_CACHE.update(temp_cache)
            
            # Pausa pequena entre chunks para não sobrecarregar
            time.sleep(0.1)
    
    except Exception as e:
        logger.error(f"Erro durante construção do cache: {e}")
    
    with CACHE_BUILD_LOCK:
        IMAGE_PATH_CACHE.update(temp_cache)
        IS_CACHE_READY = True
    
    total_time = time.time() - start_time
    logger.info(f"✅ [CACHE THREAD] Mapeamento concluído: {len(IMAGE_PATH_CACHE)} SKUs em {total_time:.2f}s")
    logger.info(f"📊 Processados {processed_files}/{total_files} arquivos")






# =================================================================
# FUNÇÃO DE OTIMIZAÇÃO DE IMAGEM MELHORADA
# =================================================================

def optimize_image_async(source_path, dest_path, max_size=(1024, 1024), quality=85):
    """
    VERSÃO ASSÍNCRONA: Copia imagens de forma não-bloqueante.
    """
    try:
        # Copia arquivo preservando metadados
        import shutil
        shutil.copy2(source_path, dest_path)
        
        logger.debug(f"✅ Imagem copiada: {source_path} -> {dest_path}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erro na cópia de {source_path}: {e}")
        return False

def cleanup_temp_folders_optimized():
    """
    VERSÃO OTIMIZADA: Limpeza de pastas temporárias com processamento paralelo.
    """
    logger.info("🧹 [CLEANUP THREAD OTIMIZADO] Serviço de limpeza iniciado.")
    
    MAX_AGE_SECONDS = 24 * 60 * 60  # 24 horas
    SLEEP_SECONDS = 3600  # 1 hora
    
    while True:
        try:
            logger.debug("🧹 [CLEANUP] Verificando pastas temporárias...")
            
            if not os.path.isdir(IMAGE_TEMP_DEST_PATH):
                logger.warning(f"Pasta de destino não encontrada: {IMAGE_TEMP_DEST_PATH}")
                time.sleep(SLEEP_SECONDS)
                continue
            
            pastas_encontradas = [p for p in os.listdir(IMAGE_TEMP_DEST_PATH) 
                                if p.startswith('busca_') and os.path.isdir(os.path.join(IMAGE_TEMP_DEST_PATH, p))]
            
            if not pastas_encontradas:
                logger.debug("Nenhuma pasta para limpar encontrada")
                time.sleep(SLEEP_SECONDS)
                continue
            
            # Processa limpeza em paralelo usando thread pool
            def check_and_remove_folder(folder_name):
                full_path = os.path.join(IMAGE_TEMP_DEST_PATH, folder_name)
                now = int(time.time())
                
                try:
                    # Extrai timestamp do nome
                    parts = folder_name.split('_')
                    if len(parts) >= 2 and parts[1].isdigit():
                        folder_age = now - int(parts[1])
                    else:
                        folder_age = now - int(os.path.getmtime(full_path))
                    
                    if folder_age > MAX_AGE_SECONDS:
                        import shutil
                        shutil.rmtree(full_path)
                        return folder_name
                except Exception as e:
                    logger.warning(f"Erro ao processar pasta {folder_name}: {e}")
                
                return None
            
            # Executa verificação em paralelo
            with ThreadPoolExecutor(max_workers=4) as executor:
                futures = [executor.submit(check_and_remove_folder, folder) for folder in pastas_encontradas]
                pastas_removidas = []
                
                for future in as_completed(futures):
                    result = future.result()
                    if result:
                        pastas_removidas.append(result)
            
            if pastas_removidas:
                logger.info(f"🗑️ [CLEANUP] Removidas {len(pastas_removidas)} pastas expiradas")
            else:
                logger.debug("✅ [CLEANUP] Nenhuma pasta expirada encontrada")
                
        except Exception as e:
            logger.error(f"❌ [CLEANUP] Erro crítico: {e}")
        
        time.sleep(SLEEP_SECONDS)



# --- 2. FUNÇÃO DE CONSTRUÇÃO DO CACHE (coloque junto com outras funções auxiliares) ---

def build_image_path_cache():
    """
    Mapeia todos os arquivos de imagem na rede e guarda seus caminhos na memória.
    Executa em segundo plano para não travar o servidor.
    """
    global IMAGE_PATH_CACHE, IS_CACHE_READY
    print("🚀 [CACHE THREAD] Iniciando mapeamento de imagens da rede...")
    start_time = time.time()
    
    temp_cache = {}
    valid_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.pdf', '.cdr')

    if not os.path.isdir(IMAGE_SOURCE_PATH):
        print(f"❌ [CACHE THREAD] ERRO CRÍTICO: Diretório de origem não encontrado: {IMAGE_SOURCE_PATH}")
        with CACHE_BUILD_LOCK:
            IS_CACHE_READY = True # Marca como "pronto" para não tentar de novo.
        return

    for root, _, files in os.walk(IMAGE_SOURCE_PATH):
        for filename in files:
            if filename.lower().endswith(valid_extensions):
                # Extrai o SKU base do nome do arquivo (ex: 'PCRV029' de 'PCRV029-ARTE.jpg')
                # A chave do cache deve ser o SKU base para permitir a busca ampla.
                sku_base = filename.split('-')[0].split(' ')[0].upper()
                
                if sku_base not in temp_cache:
                    temp_cache[sku_base] = []
                
                # Adiciona o caminho completo do arquivo à lista daquele SKU base
                temp_cache[sku_base].append(os.path.join(root, filename))

    with CACHE_BUILD_LOCK:
        IMAGE_PATH_CACHE = temp_cache
        IS_CACHE_READY = True
    
    total_time = time.time() - start_time
    print(f"✅ [CACHE THREAD] Mapeamento de imagens concluído em {total_time:.2f} segundos. {len(IMAGE_PATH_CACHE)} SKUs base mapeados.")


# app.py

# ... (mantenha todas as outras importações e configurações como estão) ...

# --- 3. FUNÇÃO DE OTIMIZAÇÃO DE IMAGEM ---
# Em app.py, substitua a função optimize_image existente por esta:

def optimize_image(source_path, dest_path, max_size=(1024, 1024), quality=85):
    """
    VERSÃO MODIFICADA (v4): Esta função agora realiza uma cópia exata do arquivo original,
    preservando todas as suas propriedades (dimensões, qualidade, metadados).
    A otimização foi desativada conforme solicitado.
    
    Retorna True se a cópia foi bem-sucedida, False caso contrário.
    """
    try:
        # shutil.copy2 é a função ideal para isso. Ela copia o arquivo de 'source_path'
        # para 'dest_path' e tenta preservar o máximo de metadados possível,
        # incluindo permissões e timestamps. É uma cópia fiel.
        shutil.copy2(source_path, dest_path)
        # print(f"✅ Cópia exata realizada: {source_path} -> {dest_path}") # Log opcional para depuração
        return True
    except Exception as e:
        # Se a cópia falhar por qualquer motivo (ex: permissões de rede, arquivo bloqueado),
        # o erro será registrado no console.
        print(f"❌ ERRO CRÍTICO na cópia do arquivo {source_path}: {e}")
        traceback.print_exc()
        return False







# =================================================================================
# TAREFA ASSÍNCRONA PARA COLETA DE IMAGENS (ADICIONE ESTA NOVA FUNÇÃO)
# =================================================================================
def collect_images_task(skus_input, session_id, socket_id):
    """
    Esta é a tarefa que roda em segundo plano para coletar as imagens.
    Ela faz todo o trabalho pesado (I/O de rede) e, no final, emite um sinal
    de volta para o cliente específico que solicitou a ação.
    """
    print(f"✅ [TAREFA EM BACKGROUND] Iniciada para sessão {session_id} (Cliente: {socket_id})")
    session_folder_path = os.path.join(IMAGE_TEMP_DEST_PATH, session_id)
    
    try:
        os.makedirs(session_folder_path, exist_ok=True)
    except Exception as e:
        # Se falhar aqui, notifica o cliente do erro
        error_data = {'status': 'error', 'message': f'Falha ao criar diretório da sessão: {e}'}
        socketio.emit('image_collection_complete', error_data, room=socket_id)
        return

    # O restante deste código é a sua lógica original de busca e cópia de arquivos.
    # A única diferença é que ela agora roda isolada em uma thread.
    found_files_info = []
    not_found_skus = set(skus_input)
    
    sku_map = {}
    for sku in skus_input:
        sku_base = sku.split('-')[0].upper()
        if sku_base not in sku_map:
            sku_map[sku_base] = []
        sku_map[sku_base].append(sku)

    skus_base_to_search = set(sku_map.keys())
    
    candidate_files = {}
    with CACHE_BUILD_LOCK:
        cache_is_currently_ready = IS_CACHE_READY

    if cache_is_currently_ready and IMAGE_PATH_CACHE:
        print(f"⚡️ [TAREFA {session_id}] Usando cache em memória para encontrar candidatos.")
        for sku_base in skus_base_to_search:
            if sku_base in IMAGE_PATH_CACHE:
                candidate_files[sku_base] = IMAGE_PATH_CACHE[sku_base]
    else:
        print(f"⏳ [TAREFA {session_id}] Cache não pronto. Executando busca em tempo real.")
        # ... (sua lógica de os.walk para busca em tempo real) ...

    files_to_copy_set = set()
    variation_suffixes = ['-100', '-130', '-150', '-175', '-999', '-VF', '-F', '-P', '-V', '-C']

    # ... (toda a sua lógica de filtragem inteligente para 'files_to_copy_set') ...
    # (O código aqui permanece o mesmo, pois a lógica de filtragem não muda)

    print(f"📂 [TAREFA {session_id}] Copiando {len(files_to_copy_set)} arquivos filtrados...")
    for source_path, origin_sku in files_to_copy_set:
        try:
            filename = os.path.basename(source_path)
            dest_path = os.path.join(session_folder_path, filename)
            
            if optimize_image(source_path, dest_path): # optimize_image agora é só uma cópia
                found_files_info.append({
                    'filename': filename,
                    'sku': origin_sku,
                    'url': f'/api/images/temp/{session_id}/{filename}'
                })
        except Exception as e:
            print(f"❌ [TAREFA {session_id}] Erro ao copiar o arquivo {source_path}: {e}")

    # =================================================================
    # PONTO-CHAVE: EMITIR O RESULTADO VIA SOCKET.IO
    # =================================================================
    response_data = {
        'status': 'ok',
        'session_folder': session_id,
        'session_folder_full_path': session_folder_path,
        'found': found_files_info,
        'not_found': list(not_found_skus)
    }
    
    # Emite o resultado APENAS para o cliente que fez a requisição, usando seu socket_id.
    socketio.emit('image_collection_complete', response_data, room=socket_id)
    print(f"✅ [TAREFA EM BACKGROUND] Coleta de imagens para a sessão {session_id} concluída. Notificando cliente.")




# Logger para debug
logger = logging.getLogger(__name__)

# Função auxiliar para cópia (já presente no seu código, mantida por clareza)
def optimize_image(source_path, dest_path):
    """
    Esta função realiza uma cópia exata do arquivo original.
    """
    try:
        shutil.copy2(source_path, dest_path)
        logger.info(f"✅ Cópia exata realizada: {source_path} -> {dest_path}")
        return True
    except Exception as e:
        logger.error(f"❌ ERRO na cópia do arquivo {source_path}: {e}")
        return False


# Função auxiliar para cópia (mantida por clareza)
def copy_file_safely(source_path, dest_path):
    """
    Realiza uma cópia segura do arquivo, preservando metadados.
    Retorna True em caso de sucesso, False em caso de falha.
    """
    try:
        shutil.copy2(source_path, dest_path)
        logger.info(f"✅ Arquivo copiado: {os.path.basename(source_path)}")
        return True
    except Exception as e:
        logger.error(f"❌ ERRO ao copiar o arquivo {source_path}: {e}")
        return False

# Em app.py, substitua a função collect_images_by_sku pela versão final:

# =================================================================================
# ROTA QUE DISPARA A TAREFA (SUBSTITUA A SUA ROTA EXISTENTE)
# =================================================================================
@app.route('/api/images/collect', methods=['POST'])
def collect_images_with_smart_logic_v2():
    """
    ROTA CORRIGIDA: Aplica regras de busca específicas e garante que todas as
    partes de um kit (painel + cilindros) sejam encontradas corretamente.
    """
    # 1. Obter e validar os dados da requisição
    data = request.get_json()
    skus_raw = data.get('skus', [])
    if not skus_raw:
        return jsonify({'status': 'error', 'message': 'Nenhum SKU foi fornecido.'}), 400

    skus_to_search = {sku.strip().upper() for sku in skus_raw if sku.strip()}
    logger.info(f"🔍 Iniciando busca inteligente (v2) para os SKUs: {list(skus_to_search)}")

    # 2. Criar pasta de sessão
    session_id = f"busca_{int(time.time())}"
    session_folder_path = os.path.join(IMAGE_TEMP_DEST_PATH, session_id)
    try:
        os.makedirs(session_folder_path, exist_ok=True)
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Não foi possível criar o diretório de destino: {e}'}), 500

    # 3. Validar caminho de origem e coletar todos os arquivos uma única vez
    if not os.path.isdir(IMAGE_SOURCE_PATH):
        error_msg = f"Caminho de origem das imagens inacessível: {IMAGE_SOURCE_PATH}"
        logger.error(f"❌ ERRO: {error_msg}")
        return jsonify({'status': 'error', 'message': error_msg}), 500
    
    all_source_files = [os.path.join(root, filename) for root, _, files in os.walk(IMAGE_SOURCE_PATH) for filename in files]
    logger.info(f"Encontrados {len(all_source_files)} arquivos no total para análise.")

    # 4. Lógica principal de busca e seleção de arquivos
    files_to_copy = set()
    found_skus = set()

    for sku in skus_to_search:
        sku_base = sku.split('-')[0]
        is_base_search = (sku == sku_base)

        for file_path in all_source_files:
            filename_upper = os.path.basename(file_path).upper()

            # =================================================================
            # REGRA 1: BUSCA POR CILINDROS (Universal)
            # Sempre busca cilindros que correspondam ao SKU base.
            # =================================================================
            if sku_base in filename_upper and 'CILINDRO' in filename_upper:
                files_to_copy.add(file_path)
                found_skus.add(sku)
                continue # Otimização: Já classificamos este arquivo, podemos pular para o próximo.

            # =================================================================
            # REGRA 2: BUSCA POR SKU COM VARIAÇÃO (ex: "VCFZ001-VF", "PCRV029-130")
            # =================================================================
            if not is_base_search:
                # A condição é simples: o nome do arquivo DEVE conter o SKU completo.
                # Isso garante que "VCFZ001-VF" encontre "VCFZ001-VF - PAINEL.jpg".
                if sku in filename_upper:
                    files_to_copy.add(file_path)
                    found_skus.add(sku)

            # =================================================================
            # REGRA 3: BUSCA POR SKU BASE (ex: "PRDA001", "PCRV029")
            # =================================================================
            else: # is_base_search is True
                # O arquivo deve começar com o SKU base.
                if filename_upper.startswith(sku_base):
                    # E NÃO PODE conter uma variação que não seja a padrão.
                    # Ex: "PRDA001-130" será ignorado, mas "PRDA001 - ARTE" será incluído.
                    file_part_after_sku = filename_upper[len(sku_base):]
                    if not any(f'-{suffix}' in file_part_after_sku for suffix in ['100', '130', '999', 'VF', 'F', 'P', 'V', 'C']):
                        files_to_copy.add(file_path)
                        found_skus.add(sku)
                
                # REGRA ESPECIAL: Se a busca for por "PCRV029", incluir também o painel "-150".
                if sku == 'PCRV029' and 'PCRV029-150' in filename_upper:
                    files_to_copy.add(file_path)
                    found_skus.add(sku)

    # 5. Executar a cópia dos arquivos selecionados
    copied_files_info = []
    for source_path in files_to_copy:
        filename = os.path.basename(source_path)
        dest_path = os.path.join(session_folder_path, filename)
        if copy_file_safely(source_path, dest_path):
            copied_files_info.append({'filename': filename, 'caminho_origem': source_path})

    # 6. Preparar a resposta final
    not_found_skus = list(skus_to_search - found_skus)
    response_data = {
        'status': 'ok',
        'session_folder': session_id,
        'session_folder_full_path': session_folder_path,
        'found': copied_files_info,
        'not_found': not_found_skus,
        'summary': {
            'total_skus_buscados': len(skus_to_search),
            'arquivos_copiados': len(copied_files_info),
            'skus_nao_encontrados': len(not_found_skus)
        }
    }
    
    logger.info(f"✅ Operação concluída. {len(copied_files_info)} arquivo(s) copiados para a pasta '{session_id}'.")
    return jsonify(response_data), 200





# --- ROTA PARA SERVIR IMAGENS (MODIFICADA PARA ACEITAR PASTAS DINÂMICAS) ---
@app.route('/api/images/temp/<path:session_id>/<path:filename>')
def serve_temp_image(session_id, filename):
    """
    Serve de forma segura uma imagem de dentro de uma pasta de sessão específica.
    """
    # Validação de segurança para garantir que não haja acesso a pastas superiores (../)
    if '..' in session_id or '/' in session_id or '\\' in session_id:
        return "ID de sessão inválido.", 400
        
    try:
        # O diretório de busca agora é a pasta da sessão específica
        directory = os.path.join(IMAGE_TEMP_DEST_PATH, session_id)
        return send_from_directory(directory, filename)
    except FileNotFoundError:
        return "Arquivo não encontrado na sessão especificada.", 404




# =================================================================
# MODELOS DO BANCO DE DADOS COM ÍNDICES PARA PERFORMANCE
# =================================================================

# Módulo: Gestão de Usuários
class User(db.Model):
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    username = db.Column(db.String(100), nullable=False, unique=True, index=True)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(50), nullable=False, index=True)
    permissions = db.Column(SQLJSON, nullable=False, default=dict)
    gruposCostura = db.Column(MutableList.as_mutable(SQLJSON), nullable=False, default=list)
    setor = db.Column(db.String(100), nullable=True)
    isGroup = db.Column(db.Boolean, default=False)
    groupName = db.Column(db.String(100), nullable=True)
    members = db.Column(MutableList.as_mutable(SQLJSON), nullable=False, default=list)


# Módulo: Chat Interno
class ChatMessage(db.Model):
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    conversaId = db.Column(db.String(200), nullable=False, index=True)
    remetente = db.Column(db.String(100), nullable=False)
    destinatario = db.Column(db.String(100), nullable=False, index=True)
    mensagem = db.Column(db.Text, nullable=True)
    anexo = db.Column(SQLJSON, nullable=True)
    timestamp = db.Column(db.String(100), nullable=False, index=True)
    lidaPor = db.Column(MutableList.as_mutable(SQLJSON), nullable=False, default=list)

# Módulo: Estoque
class StockClearRequest(db.Model):
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    requester = db.Column(db.String(100), nullable=False)
    timestamp = db.Column(db.String(100), nullable=False)
    details = db.Column(SQLJSON, nullable=False)
    status = db.Column(db.String(50), nullable=False, default='pending', index=True)
    authorizer = db.Column(db.String(100), nullable=True)
    authorization_timestamp = db.Column(db.String(100), nullable=True)

class ItemEstoque(db.Model):
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    sku = db.Column(db.String(100), nullable=False, index=True)
    quantidade = db.Column(db.Integer, default=0)
    prateleira = db.Column(db.String(50), nullable=False, index=True)
    detalhes = db.Column(SQLJSON, nullable=False, default=dict)
    __table_args__ = (UniqueConstraint('sku', 'prateleira', name='_sku_prateleira_uc'),)

class TransacaoEstoque(db.Model):
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    data = db.Column(db.String(100), nullable=False, index=True)
    usuario = db.Column(db.String(100), nullable=False, index=True)
    sku = db.Column(db.String(100), nullable=False, index=True)
    tipo = db.Column(db.String(50), nullable=False, index=True)
    quantidade = db.Column(db.Integer, nullable=False)
    prateleira = db.Column(db.String(50))
    motivo = db.Column(db.Text)

# Módulo: Logs do Sistema
class Log(db.Model):
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    data = db.Column(db.String(100), nullable=False, index=True)
    usuario = db.Column(db.String(100), nullable=False, index=True)
    acao = db.Column(db.Text, nullable=False)



class HistoricoPedidos(db.Model):
    __tablename__ = 'historico_pedidos'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    pedido_id = db.Column(db.String(100), nullable=False, index=True)
    sku = db.Column(db.String(100), nullable=False, index=True)
    marketplace = db.Column(db.String(50), index=True)
    destino = db.Column(db.String(50), nullable=False) # 'Produção' ou 'Expedição'
    impressora = db.Column(db.String(50), nullable=True)
    usuario = db.Column(db.String(100), nullable=False)
    timestamp = db.Column(db.String(100), nullable=False, index=True)
    detalhes = db.Column(SQLJSON, nullable=True, default=dict)

class ListaSeparacao(db.Model):
    __tablename__ = 'lista_separacao'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    sku = db.Column(db.String(100), nullable=False, index=True)
    quantidade = db.Column(db.Integer, nullable=False)
    marketplace = db.Column(db.String(50), index=True)
    prateleira = db.Column(db.String(100), nullable=True)
    timestamp = db.Column(db.String(100), nullable=False, index=True)





# Módulo: Pedidos
class Pedido(db.Model):
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    pedido_id = db.Column(db.String(100), nullable=False, unique=True, index=True)
    itens = db.Column(MutableList.as_mutable(SQLJSON), nullable=False, default=list)
    status = db.Column(db.String(50), default='pendente', index=True)
    unidades_processadas = db.Column(db.Integer, default=0) # NOVO CAMPO: Contagem de unidades processadas (para Expedição)
    marketplace = db.Column(db.String(50), index=True)

# >>> ADICIONE ESTA NOVA CLASSE AQUI <<<
class PedidoComErro(db.Model):
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    pedido_id = db.Column(db.String(100), nullable=False, index=True)
    motivo = db.Column(db.Text, nullable=False)
    marketplace = db.Column(db.String(50), nullable=True)
    timestamp = db.Column(db.String(100), nullable=False, index=True)



# Módulo: Costura
class Costura(db.Model):
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    item_id = db.Column(db.String(100), nullable=False, index=True)
    detalhes = db.Column(SQLJSON, nullable=False, default=dict)

# Módulo: Produção
class Producao(db.Model):
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    item_id = db.Column(db.String(100), nullable=False, index=True)
    impressora = db.Column(db.String(50), index=True)
    detalhes = db.Column(SQLJSON, nullable=False, default=dict)

class ArtHistory(db.Model): 
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    quantidade = db.Column(db.Integer, nullable=False)
    sku = db.Column(db.String(100), nullable=False, index=True)
    impressora = db.Column(db.String(100), nullable=False, index=True)
    usuario = db.Column(db.String(100), nullable=False, index=True)        
    timestamp = db.Column(db.String(100), nullable=False, index=True)      

# Módulo: Expedição
class Expedicao(db.Model):
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    pacote_id = db.Column(db.String(100), nullable=False, index=True)
    itens = db.Column(MutableList.as_mutable(SQLJSON), nullable=False, default=list)
    status = db.Column(db.String(50), default='pendente', index=True)
    unidades_processadas = db.Column(db.Integer, default=0) # NOVO CAMPO: Contagem de unidades processadas (para Expedição)
    detalhes = db.Column(SQLJSON, nullable=False, default=dict)


# Módulo: Histórico de Expedição
class HistoricoExpedicao(db.Model):
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    pedido_id = db.Column(db.String(100), nullable=False, index=True)
    data_envio = db.Column(db.String(100), nullable=False, index=True)
    usuario_envio = db.Column(db.String(100), nullable=False, index=True)
    # A coluna 'detalhes' armazenará a lista de itens, rastreio, etc.
    detalhes = db.Column(SQLJSON, nullable=False, default=dict)

# Módulo: Processador EANs
# =================================================================
# MODELOS DO BANCO DE DADOS (EAN removido - agora está no ean_module.py)
# =================================================================
class RelatorioArquivado(db.Model):
    id = db.Column(db.Integer, Identity(start=1, cycle=True), primary_key=True)
    data = db.Column(db.String(100), nullable=False, index=True)
    conteudo = db.Column(SQLJSON, nullable=False)


with app.app_context():
    db.create_all()


# =================================================================================
# ROTAS DEDICADAS DO CHAT (VERSÃO OTIMIZADA)
# ========================================================================================

def calcular_ncm(sku):
    """ Calcula o NCM de um item com base no seu SKU (lógica movida para o backend). """
    s = sku.upper()
    if s.startswith('TP'):
        return '3921.9019'  # NCM para LONA
    return '6006.3220'      # NCM para TECIDO (padrão)

# VERSÃO NOVA E CORRIGIDA
def calcular_peso(sku):
    """ Calcula o Peso de um item com base no seu SKU (lógica movida para o backend). """
    if not sku: 
        return None
        
    sku_upper = sku.upper()

    # Regra especial para Lonas (TP)
    if sku_upper.startswith('TP'):
        return 3.9 if '-350' in sku_upper else 1.5
    
    # =======================================================================
    # CORREÇÃO APLICADA AQUI
    # Pega apenas os dois primeiros caracteres como chave do prefixo.
    # =======================================================================
    prefixo = sku_upper[:2]

    pesos = {
        'PR': 0.300, 'PV': 0.500, 'PH': 0.200, 'KC': 1.500, 'KD': 1.500,
        'PC': 1.000, 'VC': 1.200, 'CL': 0.700, 'RV': 0.800, 'FF': 0.500
    }
    
    # Retorna o peso do prefixo ou None se não encontrar.
    return pesos.get(prefixo)


@app.route('/api/stock/transaction', methods=['POST'])
def register_stock_transaction():
    data = request.get_json()
    data_transacao = data.get('data')
    usuario = data.get('usuario')
    sku = data.get('sku')
    tipo = data.get('tipo')
    quantidade = data.get('quantidade')
    prateleira = data.get('prateleira')
    motivo = data.get('motivo')

    new_transaction = TransacaoEstoque(data=data_transacao, usuario=usuario, sku=sku, tipo=tipo, quantidade=quantidade, prateleira=prateleira, motivo=motivo)
    
    try:
        with db_write_lock:
            db.session.add(new_transaction)
            db.session.commit()
        
        # Emite sinal para atualizar stock
        socketio.emit('dados_atualizados', {'modulo': 'stock'})
    
        return jsonify({"status": "ok", "message": "Transação de estoque registrada", "transaction": {"sku": new_transaction.sku, "quantidade": new_transaction.quantidade}}), 201
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao registrar transação: {e}")
        return jsonify({"status": "error", "message": "Erro interno ao registrar transação."}), 500

@app.route('/api/stock/clear_request', methods=['POST'])
def create_stock_clear_request():
    data = request.get_json()
    requester = data.get('requester')
    timestamp = data.get('timestamp')
    details = data.get('details')

    new_request = StockClearRequest(requester=requester, timestamp=timestamp, details=details)
    
    try:
        with db_write_lock:
            db.session.add(new_request)
            db.session.commit()
        
        # Emite sinal para atualizar clearstock
        socketio.emit('dados_atualizados', {'modulo': 'clearstock'})
    
        return jsonify({"status": "ok", "message": "Solicitação de limpeza de estoque criada", "request": {"id": new_request.id, "requester": new_request.requester}}), 201
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao criar solicitação: {e}")
        return jsonify({"status": "error", "message": "Erro interno ao criar solicitação."}), 500

@app.route('/api/stock/clear_request/<request_id>/authorize', methods=['POST'])
def authorize_stock_clear_request(request_id):
    data = request.get_json()
    authorizer = data.get('authorizer')
    authorization_timestamp = data.get('authorization_timestamp')

    try:
        with db_write_lock:
            request_to_authorize = StockClearRequest.query.get(request_id)
            if not request_to_authorize:
                return jsonify({"status": "error", "message": "Solicitação não encontrada"}), 404

            request_to_authorize.status = 'authorized'
            request_to_authorize.authorizer = authorizer
            request_to_authorize.authorization_timestamp = authorization_timestamp
            db.session.commit()
        
        # Emite sinal para atualizar clearstock
        socketio.emit('dados_atualizados', {'modulo': 'clearstock'})
        
        return jsonify({"status": "ok", "message": "Solicitação autorizada", "request": {"id": request_to_authorize.id, "status": request_to_authorize.status}}), 200
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao autorizar solicitação: {e}")
        return jsonify({"status": "error", "message": "Erro interno ao autorizar."}), 500
    




# =================================================================
# ROTA OTIMIZADA PARA O MÓDULO DE PEDIDOS (COM CORREÇÃO)
# =================================================================

@app.route('/api/pedidos/mover_para_fluxo', methods=['POST'])
@rate_limit(requests_per_minute=120)  # Limita a 120 operações por minuto
@async_task(task_type='database', priority=1)  # Alta prioridade para pedidos
def mover_pedido_para_fluxo_optimized():
    """
    VERSÃO OTIMIZADA: Movimentação de pedidos com alta prioridade
    para não ser bloqueada por operações de imagem.
    """
    data = request.get_json()
    pedido_id = data.get('pedidoId')
    sku = data.get('sku')
    destino = data.get('destino')
    impressora = data.get('impressora')
    usuario = data.get('usuario')
    is_authorized_unit = data.get('isAuthorizedUnit', False)

    if not all([pedido_id, sku, destino, usuario]):
        return jsonify({"status": "error", "message": "Dados incompletos para mover o item."}), 400

    try:
        with db_write_lock:
            # Busca pedido original
            pedido_original = Pedido.query.filter_by(pedido_id=pedido_id).first()
            if not pedido_original:
                return jsonify({"status": "error", "message": "Pedido original não encontrado."}), 404

            # Encontra item específico
            item_no_pedido = next((item for item in pedido_original.itens 
                                 if item.get('sku') == sku and item.get('status', 'Pendente') == 'Pendente'), None)
            if not item_no_pedido:
                return jsonify({"status": "error", "message": f"SKU {sku} pendente não encontrado no pedido {pedido_id}."}), 404

            # Lógica de bloqueio (mantida idêntica)
            if pedido_original.unidades_processadas >= 1 and not is_authorized_unit:
                for i, item in enumerate(pedido_original.itens):
                    if item.get('sku') == sku and item.get('status', 'Pendente') == 'Pendente':
                        pedido_original.itens[i]['status'] = 'Aguardando Autorização'
                        flag_modified(pedido_original, "itens")
                        break
                db.session.commit()
                socketio.emit('dados_atualizados', {'modulo': 'pedidos'})
                return jsonify({
                    "status": "auth_required", 
                    "message": f"A 2ª unidade do item {sku} foi bloqueada e requer autenticação."
                }), 403

            # Cria registro de histórico
            timestamp_iso = datetime.datetime.now().isoformat()
            novo_historico = HistoricoPedidos(
                pedido_id=pedido_id,
                sku=sku,
                marketplace=pedido_original.marketplace,
                destino=destino,
                impressora=impressora if destino == 'Produção' else None,
                usuario=usuario,
                timestamp=timestamp_iso,
                detalhes=item_no_pedido
            )
            db.session.add(novo_historico)

            # Lógica de movimentação (otimizada)
            if destino == 'Produção':
                if not impressora:
                    return jsonify({"status": "error", "message": "Impressora não especificada para produção."}), 400
                
                nova_op = Producao(
                    item_id=f"OP-{int(time.time() * 1000)}",
                    impressora=impressora,
                    detalhes={
                        'pedidoId': pedido_id,
                        'sku': sku,
                        'quantidade': 1,
                        'status': 'Aguardando Impressão',
                        'tipoEntrega': item_no_pedido.get('tipoEntrega', 'N/A'),
                        'dataColeta': item_no_pedido.get('dataColeta', 'N/A'),
                        'marketplace': pedido_original.marketplace
                    }
                )
                db.session.add(nova_op)
                
                log_arte = ArtHistory(
                    sku=sku,
                    quantidade=1,
                    impressora=impressora,
                    usuario=usuario,
                    timestamp=timestamp_iso
                )
                db.session.add(log_arte)

            elif destino == 'Expedição':
                sku_base = re.sub(r'-(F|P|V|C)$', '', sku, flags=re.IGNORECASE)
                estoque_total_sku = db.session.query(db.func.sum(ItemEstoque.quantidade)).filter_by(sku=sku_base).scalar() or 0
                
                if estoque_total_sku < 1:
                    return jsonify({"status": "error", "message": f"Estoque insuficiente para o SKU {sku_base}."}), 400
                
                item_em_estoque = ItemEstoque.query.filter(ItemEstoque.sku == sku_base, ItemEstoque.quantidade > 0).order_by(ItemEstoque.id).first()
                if not item_em_estoque:
                    return jsonify({"status": "error", "message": f"Erro de consistência no estoque para {sku_base}."}), 400
                
                nova_separacao = ListaSeparacao(
                    sku=sku_base,
                    quantidade=1,
                    marketplace=pedido_original.marketplace,
                    prateleira=item_em_estoque.prateleira,
                    timestamp=timestamp_iso
                )
                db.session.add(nova_separacao)

                item_em_estoque.quantidade -= 1
                
                transacao = TransacaoEstoque(
                    data=timestamp_iso, usuario=usuario, sku=sku_base, 
                    tipo='VENDA', quantidade=-1, prateleira=item_em_estoque.prateleira, motivo=f"Pedido {pedido_id}"
                )
                db.session.add(transacao)

                novo_item_expedicao = Expedicao(
                    pacote_id=f"EXP-{int(time.time() * 1000)}",
                    status='Pronto para Envio',
                    detalhes={
                        'lote': f"LOTE-ESTOQUE-{int(time.time() * 1000)}",
                        'sku': sku,
                        'pedidoId': pedido_id,
                        'marketplace': pedido_original.marketplace,
                        'tipoEntrega': item_no_pedido.get('tipoEntrega', 'N/A'),
                        'dataColeta': item_no_pedido.get('dataColeta', 'N/A'),
                    }
                )
                db.session.add(novo_item_expedicao)
            else:
                return jsonify({"status": "error", "message": "Destino inválido."}), 400

            # Dá baixa no item original
            item_encontrado_para_remover = False
            for i, item in enumerate(pedido_original.itens):
                if item.get('sku') == sku and item.get('status', 'Pendente') == 'Pendente':
                    if item.get('quantidade', 1) > 1:
                        pedido_original.itens[i]['quantidade'] -= 1
                    else:
                        del pedido_original.itens[i]
                    item_encontrado_para_remover = True
                    break
            
            if not item_encontrado_para_remover:
                return jsonify({"status": "error", "message": f"SKU {sku} pendente não encontrado para baixa."}), 404

            # Incrementa contador
            pedido_original.unidades_processadas += 1

            # Salva alterações
            if not pedido_original.itens:
                db.session.delete(pedido_original)
            else:
                flag_modified(pedido_original, "itens")
                flag_modified(pedido_original, "unidades_processadas")

            db.session.commit()

        # Emite sinais de atualização
        socketio.emit('dados_atualizados', {'modulo': 'pedidos'})
        socketio.emit('dados_atualizados', {'modulo': 'producao'})
        socketio.emit('dados_atualizados', {'modulo': 'expedicao'})
        socketio.emit('dados_atualizados', {'modulo': 'estoque'})
        
        return jsonify({"status": "ok", "message": f"1x {sku} enviado para a {destino}."}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"❌ Erro ao mover item para fluxo: {e}")
        return jsonify({"status": "error", "message": "Erro interno do servidor."}), 500




# =================================================================
# ROTAS DE MONITORAMENTO E STATUS
# =================================================================

@app.route('/api/system/status', methods=['GET'])
def get_system_status():
    """Retorna status completo do sistema de performance."""
    try:
        cache_stats = {
            'is_cache_ready': IS_CACHE_READY,
            'cached_skus': len(IMAGE_PATH_CACHE),
            'optimized_cache_size': len(optimized_cache.cache)
        }
        
        queue_stats = task_queue.get_queue_stats()
        
        import psutil
        process = psutil.Process()
        system_stats = {
            'cpu_percent': process.cpu_percent(),
            'memory_percent': process.memory_percent(),
            'memory_mb': process.memory_info().rss / 1024 / 1024,
            'threads_count': process.num_threads()
        }
        
        return jsonify({
            'status': 'ok',
            'timestamp': datetime.datetime.now().isoformat(),
            'cache': cache_stats,
            'task_queue': queue_stats,
            'system': system_stats,
            'database': {
                'pool_size': app.config['SQLALCHEMY_ENGINE_OPTIONS']['pool_size'],
                'active_connections': len(db.engine.pool.checkedout())
            }
        })
        
    except Exception as e:
        logger.error(f"Erro ao obter status do sistema: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# Em app.py, adicione estas novas rotas

@app.route('/api/pedidos/historico', methods=['GET'])
def get_historico_pedidos():
    """ Retorna todos os pedidos que foram movidos para produção ou expedição. """
    try:
        historico = HistoricoPedidos.query.order_by(HistoricoPedidos.timestamp.desc()).all()
        resultado = [{
            "pedido_id": h.pedido_id,
            "sku": h.sku,
            "marketplace": h.marketplace,
            "destino": h.destino,
            "impressora": h.impressora,
            "usuario": h.usuario,
            "timestamp": h.timestamp,
            "tipoEntrega": h.detalhes.get('tipoEntrega', 'N/A')
        } for h in historico]
        return jsonify(resultado)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/pedidos/lista_separacao', methods=['GET'])
def get_lista_separacao():
    """ Retorna os itens que foram tirados do estoque como venda (para a expedição). """
    try:
        # Filtra para pegar apenas os itens do dia de hoje
        hoje_str = datetime.date.today().isoformat()
        lista = ListaSeparacao.query.filter(ListaSeparacao.timestamp.like(f"{hoje_str}%")).all()
        
        # Agrupa por SKU para somar as quantidades
        agrupado = {}
        for item in lista:
            if item.sku not in agrupado:
                agrupado[item.sku] = {'quantidadeTotal': 0, 'locais': set(), 'marketplace': item.marketplace, 'timestamp': item.timestamp}
            agrupado[item.sku]['quantidadeTotal'] += item.quantidade
            if item.prateleira != "N/A":
                agrupado[item.sku]['locais'].add(item.prateleira)

        resultado = [{
            "sku": sku,
            "quantidade": data['quantidadeTotal'],
            "prateleiras": sorted(list(data['locais'])),
            "marketplace": data['marketplace'],
            "timestamp": data['timestamp']
        } for sku, data in agrupado.items()]

        return jsonify(sorted(resultado, key=lambda x: x['sku']))
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/pedidos/limpar_lista_separacao', methods=['POST'])
def limpar_lista_separacao():
    """ Rota para arquivar e limpar a lista de separação do dia. """
    try:
        with db_write_lock:
            # Aqui você poderia adicionar uma lógica para arquivar os dados antes de deletar
            num_rows_deleted = db.session.query(ListaSeparacao).delete()
            db.session.commit()
        return jsonify({"status": "ok", "message": f"{num_rows_deleted} itens da lista de separação foram limpos."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500




    

# Em app.py

@app.route('/api/pedidos/cancelar', methods=['POST'])
def cancelar_pedido_item():
    """
    Rota atômica para cancelar um PEDIDO INTEIRO.
    VERSÃO ATUALIZADA: Remove o pedido de todo o fluxo e adiciona um registro
    de "Cancelado" no histórico da expedição.
    """
    data = request.get_json()
    pedido_id = data.get('pedidoId')
    usuario = data.get('usuario')

    if not all([pedido_id, usuario]):
        return jsonify({"status": "error", "message": "ID do pedido ou usuário não fornecido para o cancelamento."}), 400

    try:
        with db_write_lock:
            # 1. Busca o pedido original para obter detalhes antes de deletá-lo
            pedido_original = Pedido.query.filter_by(pedido_id=pedido_id).first()
            
            marketplace = 'N/A'
            itens_do_pedido = [{'sku': 'SKU Desconhecido', 'quantidade': 1, 'motivo': 'Item não encontrado no fluxo'}]

            if pedido_original:
                marketplace = pedido_original.marketplace
                # Garante que itens_do_pedido seja uma lista de dicionários seguros para JSON
                itens_do_pedido = json.loads(json.dumps(pedido_original.itens)) if pedido_original.itens else []
            else:
                # Se não encontrar na tabela Pedido, tenta buscar em um item já no fluxo
                item_em_producao = Producao.query.filter(Producao.detalhes['pedidoId'].astext == pedido_id).first()
                if item_em_producao:
                    marketplace = item_em_producao.detalhes.get('marketplace', 'N/A')
                    itens_do_pedido = [{'sku': item_em_producao.detalhes.get('sku', 'SKU Desconhecido'), 'quantidade': 1}]

            # 2. Remove da tabela de Produção
            Producao.query.filter(Producao.detalhes['pedidoId'].astext == pedido_id).delete()

            # 3. Remove da tabela de Costura
            Costura.query.filter(Costura.detalhes['pedidoId'].astext == pedido_id).delete()
            
            # 4. Remove da tabela de Expedição
            Expedicao.query.filter(Expedicao.detalhes['pedidoId'].astext == pedido_id).delete()
            
            # 5. Remove o registro do Pedido original, se ainda existir
            if pedido_original:
                db.session.delete(pedido_original)

            # 6. >>> PONTO PRINCIPAL: Adiciona o registro de cancelamento ao Histórico de Expedição <<<
            novo_historico_cancelado = HistoricoExpedicao(
                pedido_id=pedido_id,
                data_envio=datetime.datetime.now().isoformat(),
                usuario_envio=usuario,
                detalhes={
                    'status': 'Cancelado', # Status especial para identificar o cancelamento
                    'marketplace': marketplace,
                    'itens': itens_do_pedido, # Armazena os itens que foram cancelados
                    'motivo': f'Cancelado por {usuario}'
                }
            )
            db.session.add(novo_historico_cancelado)

            db.session.commit()

        # 7. Emite sinais para TODAS as UIs atualizarem seus dados
        socketio.emit('dados_atualizados', {'modulo': 'pedidos'})
        socketio.emit('dados_atualizados', {'modulo': 'producao'})
        socketio.emit('dados_atualizados', {'modulo': 'costura'})
        socketio.emit('dados_atualizados', {'modulo': 'expedicao'})
        socketio.emit('dados_atualizados', {'modulo': 'historicoExpedicao'}) # Notifica o histórico

        return jsonify({"status": "ok", "message": f"Pedido {pedido_id} cancelado e registrado no histórico."}), 200

    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro crítico ao cancelar pedido {pedido_id}: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Erro interno do servidor ao cancelar o pedido."}), 500




    


    


    


    


@app.route('/api/stock/move', methods=['POST'])
def move_stock():
    data = request.get_json()
    sku = data.get('sku')
    quantidade = data.get('quantidade')
    origem = data.get('origem')
    destino = data.get('destino')
    usuario = data.get('usuario')
    timestamp = data.get('timestamp')

    # Lógica para atualizar o estoque na origem e no destino
    # Isso pode envolver buscar itens de estoque existentes e ajustar suas quantidades/prateleiras
    # Por simplicidade, vamos apenas registrar a transação aqui.
    new_transaction = TransacaoEstoque(data=timestamp, usuario=usuario, sku=sku, tipo='movimentacao', quantidade=quantidade, prateleira=f"de {origem} para {destino}", motivo='Movimentação de estoque')
    
    try:
        with db_write_lock:
            db.session.add(new_transaction)
            db.session.commit()
        
        # Emite sinal para atualizar stock
        socketio.emit('dados_atualizados', {'modulo': 'stock'})
        
        return jsonify({"status": "ok", "message": "Estoque movimentado com sucesso", "transaction": {"sku": sku, "quantidade": quantidade, "origem": origem, "destino": destino}}), 200
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao movimentar estoque: {e}")
        return jsonify({"status": "error", "message": "Erro interno ao movimentar estoque."}), 500

@app.route('/api/orders/shopee/import_txt', methods=['POST'])
def import_shopee_txt():
    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'Nenhum arquivo enviado'}), 400

    content = file.read().decode('utf-8')
    pedidos_processados = parse_shopee_txt_content(content)

    try:
        with db_write_lock:
            for pedido_data in pedidos_processados:
                # Verifica se o pedido já existe para evitar duplicação
                existing_pedido = Pedido.query.filter_by(pedido_id=pedido_data['pedido_id']).first()
                if not existing_pedido:
                    new_pedido = Pedido(pedido_id=pedido_data['pedido_id'], itens=pedido_data['itens'], status='pendente', marketplace='Shopee')
                    db.session.add(new_pedido)
                else:
                    # Opcional: atualizar pedido existente
                    existing_pedido.itens = pedido_data['itens']
                    existing_pedido.status = 'pendente' # Ou manter o status atual
            db.session.commit()
        
        # Emite sinal para atualizar pedidos
        socketio.emit('dados_atualizados', {'modulo': 'pedidos'})
        
        return jsonify({"status": "ok", "message": f"{len(pedidos_processados)} pedidos da Shopee importados/atualizados com sucesso."}), 200
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao importar pedidos Shopee: {e}")
        return jsonify({"status": "error", "message": "Erro interno ao importar pedidos."}), 500

def parse_shopee_txt_content(content):
    pedidos = []
    linhas = content.split('\n')
    current_pedido = None

    for linha in linhas:
        linha = linha.strip()
        if not linha:
            continue

        if linha.startswith('Pedido:'):
            if current_pedido:
                pedidos.append(current_pedido)
            pedido_id = linha.split(':')[1].strip()
            current_pedido = {'pedido_id': pedido_id, 'itens': []}
        elif current_pedido and 'x' in linha and 'SKU' in linha:
            # Ex: 1x SKU: PRRV078-VF-P (36-38) - ARTE: PRRV078 - TAM: P - COR: PRETO
            match = re.match(r'(\d+)x SKU: ([^\s]+) \(([^\)]+)\) - ARTE: ([^\s]+) - TAM: ([^\s]+) - COR: (.+)', linha)
            if match:
                quantidade, sku_completo, tamanho_shopee, arte, tamanho, cor = match.groups()
                current_pedido['itens'].append({
                    'quantidade': int(quantidade),
                    'sku_completo': sku_completo,
                    'tamanho_shopee': tamanho_shopee,
                    'arte': arte,
                    'tamanho': tamanho,
                    'cor': cor
                })
            else:
                # Lidar com linhas de item que não correspondem ao padrão esperado
                print(f"Aviso: Linha de item não corresponde ao padrão: {linha}")
                # Opcional: registrar em PedidoComErro
                db.session.add(PedidoComErro(pedido_id=current_pedido['pedido_id'], motivo=f"Padrão de item inválido: {linha}", timestamp=datetime.datetime.now().isoformat()))
                db.session.commit()

    if current_pedido:
        pedidos.append(current_pedido)
    return pedidos

@app.route('/api/orders/marketplace/process_text', methods=['POST'])
def process_marketplace_text():
    data = request.get_json()
    text_content = data.get('text')
    marketplace = data.get('marketplace') # 'Mercado Livre' ou 'Shopee'

    if not text_content or not marketplace:
        return jsonify({'error': 'Conteúdo de texto ou marketplace não fornecido'}), 400

    pedidos_processados = []
    if marketplace == 'Shopee':
        pedidos_processados = parse_shopee_txt_content(text_content)
    # Adicionar lógica para Mercado Livre ou outros marketplaces aqui
    else:
        return jsonify({'error': 'Marketplace não suportado'}), 400

    try:
        with db_write_lock:
            for pedido_data in pedidos_processados:
                existing_pedido = Pedido.query.filter_by(pedido_id=pedido_data['pedido_id']).first()
                if not existing_pedido:
                    new_pedido = Pedido(pedido_id=pedido_data['pedido_id'], itens=pedido_data['itens'], status='pendente', marketplace=marketplace)
                    db.session.add(new_pedido)
                else:
                    existing_pedido.itens = pedido_data['itens']
                    existing_pedido.status = 'pendente'
            db.session.commit()
        
        # Emite sinal para atualizar pedidos
        socketio.emit('dados_atualizados', {'modulo': 'pedidos'})
        
        return jsonify({"status": "ok", "message": f"{len(pedidos_processados)} pedidos do {marketplace} processados/atualizados."}), 200
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao processar texto de marketplace: {e}")
        return jsonify({"status": "error", "message": "Erro interno ao processar texto."}), 500

@app.route('/api/production/items', methods=['POST'])
def add_production_item():
    data = request.get_json()
    item_id = data.get('item_id')
    impressora = data.get('impressora')
    detalhes = data.get('detalhes', {})

    new_production_item = Producao(item_id=item_id, impressora=impressora, detalhes=detalhes)
    
    try:
        with db_write_lock:
            db.session.add(new_production_item)
            db.session.commit()
        
        # Emite sinal para atualizar produção
        socketio.emit('dados_atualizados', {'modulo': 'producao'})
        
        return jsonify({"status": "ok", "message": "Item de produção adicionado", "item": {"item_id": new_production_item.item_id}}), 201
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao adicionar item de produção: {e}")
        return jsonify({"status": "error", "message": "Erro interno ao adicionar item."}), 500

@app.route('/api/production/items', methods=['GET'])
def get_production_items():
    items = Producao.query.all()
    return jsonify([{
        "item_id": i.item_id,
        "impressora": i.impressora,
        "detalhes": i.detalhes
    } for i in items])


# ADICIONE ESTA NOVA ROTA AO SEU app.py

@app.route('/api/production/items/<op_id>', methods=['DELETE'])
def delete_production_item(op_id):
    try:
        with db_write_lock:
            item = Producao.query.filter_by(item_id=op_id).first()
            if not item:
                return jsonify({"status": "error", "message": "Ordem de produção não encontrada."}), 404
            
            db.session.delete(item)
            db.session.commit()

        # Emite o sinal instantâneo
        socketio.emit('dados_atualizados', {'modulo': 'producao'})
        return jsonify({"status": "ok", "message": "OP excluída com sucesso."}), 200

    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao excluir OP {op_id}: {e}")
        return jsonify({"status": "error", "message": "Erro interno do servidor."}), 500




@app.route('/api/production/move-to-expedition/<op_id>', methods=['POST'])
def move_production_to_expedition(op_id):
    """
    VERSÃO CORRIGIDA: Move um item da Produção diretamente para a Expedição,
    garantindo que o formato do item na expedição seja o correto.
    """
    try:
        with db_write_lock:
            # 1. Encontra e remove o item da tabela de Produção
            item_producao = Producao.query.filter_by(item_id=op_id).first()
            if not item_producao:
                return jsonify({"status": "error", "message": "Item não encontrado na produção."}), 404

            detalhes_item = item_producao.detalhes
            db.session.delete(item_producao)

            # 2. Cria um novo item na tabela de Expedição com a estrutura correta
            #    O 'pacote_id' agora é o próprio ID do item (lote), e os detalhes
            #    são as informações do item individual.
            novo_item_expedicao = Expedicao(
                pacote_id=f"LOTE-PROD-{op_id}", # ID único para o item na expedição
                status='Pronto para Envio',
                itens=[], # A lista de itens fica vazia, pois este é um registro de item único
                detalhes={
                    # --- DADOS ESSENCIAIS PARA A EXPEDIÇÃO ---
                    "pedidoId": detalhes_item.get('pedidoId'),
                    "sku": detalhes_item.get('sku'),
                    "lote": f"LOTE-PROD-{op_id}", # Referência da origem
                    "quantidade": detalhes_item.get('quantidade', 1),
                    "marketplace": detalhes_item.get('marketplace'),
                    "tipoEntrega": detalhes_item.get('tipoEntrega'),
                    "dataColeta": detalhes_item.get('dataColeta'),
                    "cliente": detalhes_item.get('cliente', 'N/A')
                }
            )
            db.session.add(novo_item_expedicao)
            db.session.commit()

        # 3. Emite sinais para atualizar as UIs
        socketio.emit('dados_atualizados', {'modulo': 'producao'})
        socketio.emit('dados_atualizados', {'modulo': 'expedicao'})
        
        return jsonify({"status": "ok", "message": f"Item {op_id} movido para a Expedição."}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"❌ Erro ao mover item da produção para expedição: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Erro interno do servidor."}), 500




@app.route('/api/production/finalize/<op_id>', methods=['POST'])
def finalize_production_item(op_id):
    """
    Finaliza um item da Produção, movendo-o diretamente para o Histórico de Expedição.
    """
    try:
        with db_write_lock:
            # 1. Encontra e remove o item da Produção
            item_producao = Producao.query.filter_by(item_id=op_id).first()
            if not item_producao:
                return jsonify({"status": "error", "message": "Item não encontrado na produção."}), 404

            detalhes_item = item_producao.detalhes
            db.session.delete(item_producao)

            # 2. Cria um registro no Histórico de Expedição
            novo_historico = HistoricoExpedicao(
                pedido_id=detalhes_item.get('pedidoId'),
                data_envio=datetime.datetime.now().isoformat(),
                usuario_envio=detalhes_item.get('usuario', 'Sistema'), # Idealmente, o usuário viria do frontend
                detalhes={
                    'marketplace': detalhes_item.get('marketplace'),
                    'tipoEntrega': detalhes_item.get('tipoEntrega'),
                    'itens': [{
                        'lote': f"LOTE-FINALIZADO-{op_id}",
                        'sku': detalhes_item.get('sku'),
                        'quantidade': detalhes_item.get('quantidade', 1)
                    }]
                }
            )
            db.session.add(novo_historico)
            db.session.commit()

        # 3. Emite sinais para atualizar as UIs
        socketio.emit('dados_atualizados', {'modulo': 'producao'})
        socketio.emit('dados_atualizados', {'modulo': 'historicoExpedicao'})

        return jsonify({"status": "ok", "message": f"Item {op_id} finalizado e movido para o histórico."}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"❌ Erro ao finalizar item da produção: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Erro interno do servidor."}), 500




@app.route('/api/sewing/items', methods=['POST'])
def add_sewing_item():
    data = request.get_json()
    item_id = data.get('item_id')
    detalhes = data.get('detalhes', {})

    new_sewing_item = Costura(item_id=item_id, detalhes=detalhes)
    
    try:
        with db_write_lock:
            db.session.add(new_sewing_item)
            db.session.commit()
        
        # Emite sinal para atualizar costura
        socketio.emit('dados_atualizados', {'modulo': 'costura'})
        
        return jsonify({"status": "ok", "message": "Item de costura adicionado", "item": {"item_id": new_sewing_item.item_id}}), 201
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao adicionar item de costura: {e}")
        return jsonify({"status": "error", "message": "Erro interno ao adicionar item."}), 500

@app.route('/api/sewing/items', methods=['GET'])
def get_sewing_items():
    items = Costura.query.all()
    return jsonify([{
        "item_id": i.item_id,
        "detalhes": i.detalhes
    } for i in items])


# ADICIONE ESTA NOVA ROTA AO SEU app.py

@app.route('/api/sewing/items/<lote_id>', methods=['DELETE'])
def delete_sewing_item(lote_id):
    try:
        with db_write_lock:
            item = Costura.query.filter_by(item_id=lote_id).first()
            if not item:
                return jsonify({"status": "error", "message": "Lote não encontrado."}), 404
            
            db.session.delete(item)
            db.session.commit()

        # Emite o sinal instantâneo
        socketio.emit('dados_atualizados', {'modulo': 'costura'})
        return jsonify({"status": "ok", "message": "Lote excluído com sucesso."}), 200

    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao excluir lote de costura {lote_id}: {e}")
        return jsonify({"status": "error", "message": "Erro interno do servidor."}), 500




@app.route('/api/expedition/packages', methods=['POST'])
def add_expedition_package():
    data = request.get_json()
    pacote_id = data.get('pacote_id')
    itens = data.get('itens', [])
    status = data.get('status', 'pendente')

    new_package = Expedicao(pacote_id=pacote_id, itens=itens, status=status)
    
    try:
        with db_write_lock:
            db.session.add(new_package)
            db.session.commit()
        
        # Emite sinal para atualizar expedição
        socketio.emit('dados_atualizados', {'modulo': 'expedicao'})
        
        return jsonify({"status": "ok", "message": "Pacote de expedição adicionado", "package": {"pacote_id": new_package.pacote_id}}), 201
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao adicionar pacote de expedição: {e}")
        return jsonify({"status": "error", "message": "Erro interno ao adicionar pacote."}), 500

@app.route('/api/expedition/packages', methods=['GET'])
def get_expedition_packages():
    packages = Expedicao.query.all()
    return jsonify([{
        "pacote_id": p.pacote_id,
        "itens": p.itens,
        "status": p.status
    } for p in packages])

@app.route('/api/art_history', methods=['POST'])
def add_art_history():
    data = request.get_json()
    quantidade = data.get('quantidade')
    sku = data.get('sku')
    impressora = data.get('impressora')
    usuario = data.get('usuario')
    timestamp = data.get('timestamp')

    new_art_history = ArtHistory(quantidade=quantidade, sku=sku, impressora=impressora, usuario=usuario, timestamp=timestamp)
    
    try:
        with db_write_lock:
            db.session.add(new_art_history)
            db.session.commit()
        
        # Emite sinal para atualizar histórico de artes
        socketio.emit('dados_atualizados', {'modulo': 'historicoArtes'})
        
        return jsonify({"status": "ok", "message": "Histórico de arte registrado", "artHistory": {"sku": new_art_history.sku, "quantidade": new_art_history.quantidade}}), 201
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao registrar histórico de arte: {e}")
        return jsonify({"status": "error", "message": "Erro interno ao registrar histórico."}), 500

@app.route('/api/art_history', methods=['GET'])
def get_art_history():
    history = ArtHistory.query.all()
    return jsonify([{
        "quantidade": h.quantidade,
        "sku": h.sku,
        "impressora": h.impressora,
        "usuario": h.usuario,
        "timestamp": h.timestamp
    } for h in history])




# ARQUIVO: app.py
# ADICIONE ESTA NOVA ROTA AO SEU ARQUIVO

@app.route('/api/pedidos/add_manual', methods=['POST'])
def add_manual_pedidos():
    """
    Rota leve e otimizada para adicionar um ou mais itens de pedido manual.
    """
    data = request.get_json()
    novos_pedidos_data = data.get('pedidos', [])

    if not novos_pedidos_data:
        return jsonify({"status": "error", "message": "Nenhum pedido fornecido."}), 400

    try:
        with db_write_lock:
            for pedido_data in novos_pedidos_data:
                pedido_id = pedido_data.get('id')
                
                # Procura por um pedido existente com o mesmo ID
                pedido_existente = Pedido.query.filter_by(pedido_id=pedido_id).first()

                # Remove chaves que não são parte do item JSON
                marketplace = pedido_data.pop('marketplace', 'N/A')
                status = pedido_data.pop('status', 'Pendente')
                
                item_para_adicionar = pedido_data

                if pedido_existente:
                    # Se o pedido já existe, apenas adiciona o novo item à sua lista de itens
                    pedido_existente.itens.append(item_para_adicionar)
                    flag_modified(pedido_existente, "itens") # Notifica o SQLAlchemy da mudança
                else:
                    # Se não existe, cria um novo registro de Pedido
                    novo_pedido_db = Pedido(
                        pedido_id=pedido_id,
                        marketplace=marketplace,
                        status=status,
                        itens=[item_para_adicionar] # Adiciona o item em uma nova lista
                    )
                    db.session.add(novo_pedido_db)
            
            db.session.commit()

        # Emite um sinal para que todos os clientes atualizem seus dados de pedidos
        socketio.emit('dados_atualizados', {'modulo': 'pedidos'})
        
        return jsonify({"status": "ok", "message": "Pedidos manuais adicionados com sucesso."}), 201

    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao adicionar pedido manual: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Erro interno do servidor."}), 500




@app.route("/api/pedidos/status/<int:pedido_id>", methods=["PUT"])
def update_pedido_status(pedido_id):
    data = request.get_json()
    new_status = data.get("status")

    if not new_status:
        return jsonify({"status": "error", "message": "Novo status não fornecido."}), 400

    try:
        with db_write_lock:
            pedido = db.session.get(Pedido, pedido_id)
            if not pedido:
                return jsonify({"status": "error", "message": f"Pedido com ID {pedido_id} não encontrado."}), 404

            pedido.status = new_status
            db.session.commit()

        # Emite um sinal granular para o frontend com o pedido atualizado
        socketio.emit("pedido_atualizado", {
            "id": pedido.id,
            "pedido_id": pedido.pedido_id,
            "itens": pedido.itens,
            "status": pedido.status,
            "marketplace": pedido.marketplace
        })

        return jsonify({"status": "ok", "message": "Status do pedido atualizado com sucesso."}), 200

    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao atualizar status do pedido {pedido_id}: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Erro interno do servidor ao atualizar status do pedido."}), 500


# =================================================================
# CRIAÇÃO AUTOMÁTICA DO USUÁRIO ADMINISTRADOR PADRÃO
# =================================================================
def create_default_admin():
    """
    Verifica se um usuário 'admin-master' existe. Se não, cria um
    usuário padrão com acesso total para o primeiro login.
    """
    with app.app_context():
        # Verifica se já existe algum usuário com a role 'admin-master'
        admin_exists = db.session.query(User).filter_by(role='admin-master').first()

        if not admin_exists:
            print("🔧 Nenhum 'admin-master' encontrado. Criando usuário padrão...")
            
            # Define as credenciais padrão
            default_username = 'admin'
            default_password = 'admin'
            
            # Cria um dicionário de permissões com todas as permissões ativadas
            full_permissions = {
                'dashboard': {'visualizar': True},
                'userManagement': {'visualizar': True, 'criar': True, 'editar': True, 'excluir': True},
                'logs': {'visualizar': True},
                'chat': {'visualizar': True, 'enviar': True, 'criarGrupo': True},
                'processadorEANs': {'visualizar': True, 'editar': True, 'processar': True, 'gerarRelatorio': True},
                'estoque': {'visualizar': True, 'cadastrar': True, 'editar': True, 'excluir': True, 'movimentar': True, 'importar': True, 'gerarRelatorio': True},
                'bancoImagens': {'visualizar': True, 'adicionar': True, 'excluir': True, 'pesquisar': True},
                'pedidos': {'visualizar': True, 'cadastrar': True, 'importar': True, 'editar': True, 'excluir': True, 'processar': True, 'gerarRelatorio': True},
                'producao': {'visualizar': True, 'adicionar': True, 'editar': True, 'excluir': True, 'moverParaCostura': True},
                'costura': {'visualizar': True, 'adicionar': True, 'editar': True, 'excluir': True, 'iniciarTarefa': True, 'moverParaExpedicao': True, 'atribuirGrupos': True},
                'expedicao': {'visualizar': True, 'editar': True, 'darBaixa': True, 'gerarRelatorio': True}
            }

            # Cria o novo usuário administrador
            admin_user = User(
                username=default_username,
                password=default_password,
                role='admin-master',
                permissions=full_permissions,
                gruposCostura=[],
                setor='Administração'
            )
            
            try:
                with db_write_lock:
                    db.session.add(admin_user)
                    db.session.commit()
                print(f"✅ Usuário '{default_username}' (senha: '{default_password}') criado com sucesso!")
            except Exception as e:
                db.session.rollback()
                print(f"❌ Erro ao criar o usuário administrador padrão: {e}")
        else:
            print("👍 Usuário 'admin-master' já existe. Nenhuma ação necessária.")

# Chama a função para criar o admin padrão na inicialização do servidor
create_default_admin()




# ==============================
# FUNÇÕES AUXILIARES DE CONVERSÃO
# ==============================

def data_to_dict(modulos=None):
    """
    VERSÃO OTIMIZADA: Converte dados do banco para dicionário de forma seletiva.
    
    - Se 'modulos' for None ou uma lista vazia, carrega TUDO (para o boot inicial).
    - Se 'modulos' for uma lista de nomes (ex: ['pedidos', 'estoque']), carrega APENAS
      os dados desses módulos, tornando a resposta muito mais rápida e leve.
    """
    if not modulos:
        # Carrega todos os módulos se nenhum for especificado
        modulos = [
            'users', 'itensEstoque', 'logs', 'pedidos', 'costura', 'producao', 
            'expedicao', 'historicoExpedicao',
            'relatoriosArquivados', 'transacoesEstoque', 
            'stockClearRequests', 'historicoArtes', 'pedidosComErro', 'conversas'
        ]

    data = {}

    if 'users' in modulos:
        data["users"] = [ { "username": u.username, "password": u.password, "role": u.role, "permissions": u.permissions, "gruposCostura": u.gruposCostura, "setor": u.setor, "isGroup": u.isGroup, "groupName": u.groupName, "members": u.members } for u in User.query.all() ]
    
    if 'itensEstoque' in modulos:
        data["itensEstoque"] = [ { "id": i.id, "sku": i.sku, "qtd": i.quantidade, "prateleira": i.prateleira, "capacidade": i.detalhes.get('capacidade', 25), "minStock": i.detalhes.get('minStock', 10), "status": i.detalhes.get('status', 'Disponível'), "reservadoPor": i.detalhes.get('reservadoPor') } for i in ItemEstoque.query.all() ]

    if 'logs' in modulos:
        # Otimização: Carrega apenas os 500 logs mais recentes para não sobrecarregar
        data["logs"] = [ { "data": l.data, "usuario": l.usuario, "acao": l.acao } for l in Log.query.order_by(Log.id.desc()).limit(500).all() ]

    if 'pedidos' in modulos:
        pedidos_planos = []
        # Otimização: Usa 'joinedload' para carregar itens relacionados de forma mais eficiente (se aplicável)
        for p in Pedido.query.all():
            if isinstance(p.itens, list):
                for item in p.itens:
                    pedidos_planos.append({ "id": p.pedido_id, "marketplace": p.marketplace, "status": p.status, **item })
        data["pedidos"] = pedidos_planos

    if 'costura' in modulos:
        data["costura"] = [ { "lote": c.item_id, **c.detalhes } for c in Costura.query.all() ]

    if 'producao' in modulos:
        data["producao"] = [ { "op": pr.item_id, "impressora": pr.impressora, **pr.detalhes } for pr in Producao.query.all() ]

    if 'expedicao' in modulos:
        # Lógica de 'expedicao' permanece a mesma
        data["expedicao"] = [ { "id": e.pacote_id, "itens": e.itens, "status": e.status, **e.detalhes } for e in Expedicao.query.all() ]

    if 'historicoExpedicao' in modulos:
        # Converte os dados da tabela HistoricoExpedicao para o formato que o frontend espera
        historico_formatado = []
        for h in HistoricoExpedicao.query.order_by(HistoricoExpedicao.id.desc()).limit(1000).all(): # Limita para 1000 registros recentes
            item_formatado = {
                "pedidoId": h.pedido_id,
                "dataEnvio": h.data_envio,
                "usuarioEnvio": h.usuario_envio,
                **h.detalhes  # Expande o JSON 'detalhes' (que contém a lista de itens)
            }
            historico_formatado.append(item_formatado)
        data["historicoExpedicao"] = historico_formatado
    
    
    if 'relatoriosArquivados' in modulos:
        data["relatoriosArquivados"] = [ { "data": r.data, "conteudo": r.conteudo } for r in RelatorioArquivado.query.all() ]

    if 'transacoesEstoque' in modulos:
        # Otimização: Carrega apenas as 5000 transações mais recentes
        data["transacoesEstoque"] = [ { "id": t.id, "timestamp": t.data, "usuario": t.usuario, "sku": t.sku, "tipo": t.tipo, "quantidade": t.quantidade, "prateleira": t.prateleira, "motivo": t.motivo } for t in TransacaoEstoque.query.order_by(TransacaoEstoque.id.desc()).limit(5000).all() ]

    if 'stockClearRequests' in modulos:
        data["stockClearRequests"] = [ { "id": scr.id, "requester": scr.requester, "timestamp": scr.timestamp, "details": scr.details, "status": scr.status, "authorizer": scr.authorizer, "authorization_timestamp": scr.authorization_timestamp } for scr in StockClearRequest.query.all() ]

    if 'historicoArtes' in modulos:
        # Otimização: Carrega apenas os 500 registros mais recentes
        data["historicoArtes"] = [ { "id": ah.id, "quantidade": ah.quantidade, "sku": ah.sku, "impressora": ah.impressora, "usuario": ah.usuario, "timestamp": ah.timestamp } for ah in ArtHistory.query.order_by(ArtHistory.id.desc()).limit(500).all() ]

    if 'pedidosComErro' in modulos:
        data["pedidosComErro"] = [
            {
                "id": pe.pedido_id, # Mapeia 'pedido_id' do banco para 'id' no frontend
                "motivo": pe.motivo,
                "marketplace": pe.marketplace,
                "timestamp": pe.timestamp
            } for pe in PedidoComErro.query.all()
        ]

    if 'conversas' in modulos:
        data["conversas"] = [ { "id": cm.id, "conversaId": cm.conversaId, "remetente": cm.remetente, "destinatario": cm.destinatario, "mensagem": cm.mensagem, "anexo": cm.anexo, "timestamp": cm.timestamp, "lidaPor": cm.lidaPor } for cm in ChatMessage.query.all() ]

    return data

# ==============================
# ROTAS
# ==============================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    """
    VERSÃO OTIMIZADA: Aceita um parâmetro 'modulos' para carregar dados específicos.
    O frontend pode chamar:
    - /api/data (para carregar tudo na inicialização)
    - /api/data?modulos=pedidos (para carregar apenas dados de pedidos)
    - /api/data?modulos=estoque,transacoesEstoque (para carregar múltiplos módulos)
    """
    modulos_requisitados_str = request.args.get('modulos')
    
    if modulos_requisitados_str:
        # Converte a string de módulos (separada por vírgula) em uma lista
        modulos_lista = modulos_requisitados_str.split(',')
        print(f"🚀 Carregando dados específicos para os módulos: {modulos_lista}")
        dados = data_to_dict(modulos=modulos_lista)
    else:
        # Se nenhum módulo for especificado, carrega tudo (comportamento para o boot inicial)
        print("🚀 Carregando todos os dados para o boot inicial...")
        dados = data_to_dict()
        
    return jsonify(dados)

# =================================================================
# ROTA /api/save (MANTIDA PARA BACKUPS, MAS NÃO PARA USO DIÁRIO)
# =================================================================
@app.route('/api/save', methods=['POST'])
def save_data():
    """
    Recebe o estado completo da aplicação e atualiza o banco de dados.
    """
    data = request.get_json()
    
    with db_write_lock:
        try:
            if 'users' in data:
                User.query.delete()
                for u_data in data.get('users', []):
                    db.session.add(User(**u_data))

            if 'itensEstoque' in data:
                ItemEstoque.query.delete()
                for i_data in data.get('itensEstoque', []):
                    detalhes = {
                        'capacidade': i_data.get('capacidade'),
                        'minStock': i_data.get('minStock'),
                        'status': i_data.get('status'),
                        'reservadoPor': i_data.get('reservadoPor')
                    }
                    item = ItemEstoque(
                        sku=i_data.get('sku'),
                        quantidade=i_data.get('qtd', 0),
                        prateleira=i_data.get('prateleira'),
                        detalhes=detalhes
                    )
                    db.session.add(item)
                    
            if 'transacoesEstoque' in data:
                TransacaoEstoque.query.delete()
                for t_data in data.get('transacoesEstoque', []):
                    transacao = TransacaoEstoque(
                        data=t_data.get('timestamp'),
                        usuario=t_data.get('usuario'),
                        sku=t_data.get('sku'),
                        tipo=t_data.get('tipo'),
                        quantidade=t_data.get('quantidade'),
                        prateleira=t_data.get('prateleira'),
                        motivo=t_data.get('motivo')
                    )
                    db.session.add(transacao)    
                    
            if 'pedidos' in data:
                Pedido.query.delete()
                pedidos_agrupados = {}
                for item_plano in data.get('pedidos', []):
                    pedido_id = item_plano.pop('id', None)
                    if not pedido_id: continue
                    marketplace = item_plano.pop('marketplace', 'N/A')
                    status = item_plano.pop('status', 'pendente')
                    if pedido_id not in pedidos_agrupados:
                        pedidos_agrupados[pedido_id] = {'pedido_id': pedido_id, 'marketplace': marketplace, 'status': status, 'itens': []}
                    pedidos_agrupados[pedido_id]['itens'].append(item_plano)
                for p_data in pedidos_agrupados.values():
                    db.session.add(Pedido(**p_data))

            # >>> ADICIONE ESTE NOVO BLOCO AQUI <<<
            if 'pedidosComErro' in data:
                # Primeiro, limpa a tabela de erros para sincronizar com o estado do frontend
                PedidoComErro.query.delete()
                # Depois, adiciona os novos erros
                for erro_data in data.get('pedidosComErro', []):
                    novo_erro = PedidoComErro(
                        pedido_id=erro_data.get('id'), # Mapeia 'id' do frontend para 'pedido_id' no banco
                        motivo=erro_data.get('motivo'),
                        marketplace=erro_data.get('marketplace'),
                        timestamp=erro_data.get('timestamp', datetime.datetime.now().isoformat())
                    )
                    db.session.add(novo_erro)

            
            if 'producao' in data:
                Producao.query.delete()
                for p_data in data.get('producao', []):
                    item_id, impressora = p_data.get('op'), p_data.get('impressora')
                    detalhes = {k: v for k, v in p_data.items() if k not in ['op', 'impressora']}
                    if item_id: db.session.add(Producao(item_id=item_id, impressora=impressora, detalhes=detalhes))

            if 'costura' in data:
                Costura.query.delete()
                for c_data in data.get('costura', []):
                    item_id = c_data.get('lote')
                    detalhes = {k: v for k, v in c_data.items() if k != 'lote'}
                    if item_id: db.session.add(Costura(item_id=item_id, detalhes=detalhes))

            if 'expedicao' in data:
                Expedicao.query.delete()
                for e_data in data.get('expedicao', []):
                    pacote_id, itens, status = e_data.get('id'), e_data.get('itens', []), e_data.get('status', 'pendente')
                    detalhes = {k: v for k, v in e_data.items() if k not in ['id', 'itens', 'status']}
                    if pacote_id: db.session.add(Expedicao(pacote_id=pacote_id, itens=itens, status=status, detalhes=detalhes))

            # ======================= INÍCIO DA ALTERAÇÃO =======================
            # >>> ADICIONE ESTE NOVO BLOCO <<<
            
            if 'historicoExpedicao' in data:
                # Limpa a tabela para sincronizar com o estado atual do frontend
                HistoricoExpedicao.query.delete() 
                
                # Itera sobre cada pacote no histórico enviado pelo frontend
                for h_data in data.get('historicoExpedicao', []):
                    # Extrai os campos principais
                    pedido_id = h_data.get('pedidoId')
                    data_envio = h_data.get('dataEnvio')
                    usuario_envio = h_data.get('usuarioEnvio')
                    
                    # O resto dos dados (como a lista de 'itens') vai para o campo 'detalhes'
                    detalhes = {k: v for k, v in h_data.items() if k not in ['pedidoId', 'dataEnvio', 'usuarioEnvio']}
                    
                    # Cria o novo registro no banco de dados
                    if pedido_id:
                        novo_historico = HistoricoExpedicao(
                            pedido_id=pedido_id,
                            data_envio=data_envio,
                            usuario_envio=usuario_envio,
                            detalhes=detalhes
                        )
                        db.session.add(novo_historico)
            
            
            if 'logs' in data:
                Log.query.delete()
                for l_data in data.get('logs', []):
                    acao = l_data.get('acao')
                    if isinstance(acao, dict):
                        l_data['acao'] = json.dumps(acao, ensure_ascii=False)
                    db.session.add(Log(**l_data))
            
            db.session.commit()
            
            socketio.emit('dados_atualizados', 
                                 {'modulo': 'save_all', 'origem': request.remote_addr},
                                 namespace='/')
            
            return jsonify({"status": "ok", "message": "Dados salvos com sucesso no banco de dados."}), 200

        except Exception as e:
            db.session.rollback()
            print(f"❌ Erro Crítico ao salvar dados na rota /api/save: {e}")
            traceback.print_exc()
            return jsonify({"status": "error", "message": f"Erro interno do servidor: {str(e)}"}), 500

# =================================================================
# ROTAS LEVES E ESPECÍFICAS COM EMISSÃO DE SINAL VIA SOCKET.IO
# =================================================================




@app.route('/api/logs/search', methods=['GET'])
def search_system_logs():
    """
    Rota otimizada para buscar, filtrar e paginar os logs do sistema no backend.
    """
    try:
        # 1. Coleta os parâmetros da URL enviados pelo frontend
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int) # Define um padrão de 50 por página
        usuario = request.args.get('usuario', '', type=str)
        modulo = request.args.get('modulo', '', type=str)
        data_inicio = request.args.get('data_inicio', '', type=str)
        data_fim = request.args.get('data_fim', '', type=str)

        # 2. Inicia a consulta base na tabela de Logs
        query = Log.query

        # 3. Aplica os filtros dinamicamente, se eles foram fornecidos
        if usuario:
            # ilike é case-insensitive, % é um wildcard
            query = query.filter(Log.usuario.ilike(f"%{usuario}%"))
        
        if modulo:
            # Busca pela string do módulo dentro do campo 'acao'
            query = query.filter(Log.acao.ilike(f"%Módulo: {modulo}%"))

        if data_inicio:
            # Filtra logs a partir da data de início
            query = query.filter(Log.data >= data_inicio)

        if data_fim:
            # Para a data final, consideramos o dia inteiro (até 23:59:59)
            query = query.filter(Log.data <= f"{data_fim}T23:59:59.999")

        # 4. Ordena pelos mais recentes e aplica a paginação
        paginated_result = query.order_by(Log.id.desc()).paginate(page=page, per_page=per_page, error_out=False)
        
        logs_da_pagina = paginated_result.items
        total_logs = paginated_result.total

        # 5. Formata os resultados para enviar como JSON
        results = []
        for log in logs_da_pagina:
            # Lógica para extrair Módulo e Detalhes da string 'acao'
            acao_str = log.acao
            log_modulo = "Geral"
            log_detalhes = ""
            
            # Tenta extrair o módulo
            match_modulo = re.search(r"Módulo: (\w+)", acao_str)
            if match_modulo:
                log_modulo = match_modulo.group(1)
            
            # Tenta extrair os detalhes
            match_detalhes = re.search(r"Detalhes: (\{.*\})", acao_str)
            if match_detalhes:
                log_detalhes = match_detalhes.group(1)
            
            results.append({
                "data": log.data,
                "usuario": log.usuario,
                "acao": acao_str,
                "modulo": log_modulo,
                "detalhes": log_detalhes
            })

        # 6. Retorna a resposta completa para o frontend
        return jsonify({
            "status": "ok",
            "logs": results,
            "total": total_logs,
            "page": page,
            "pages": paginated_result.pages,
            "per_page": per_page
        })

    except Exception as e:
        print(f"❌ Erro na busca de logs: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Erro interno do servidor ao buscar logs."}), 500




@app.route('/api/log', methods=['POST'])
def add_log():
    """
    Rota segura e específica para adicionar uma única entrada de log
    sem interferir com o resto do banco de dados.
    """
    data = request.get_json()
    if not data or 'data' not in data or 'usuario' not in data or 'acao' not in data:
        return jsonify({"status": "error", "message": "Dados de log incompletos."}), 400
    
    try:
        with db_write_lock: # Usa o lock para segurança
            novo_log = Log(
                data=data["data"], 
                usuario=data["usuario"], 
                acao=data["acao"]
            )
            db.session.add(novo_log)
            db.session.commit()
        
        # Emite um sinal para outros clientes atualizarem seus logs
        socketio.emit('dados_atualizados', {'modulo': 'logs'})
        
        return jsonify({"status": "ok", "log": {"data": novo_log.data, "usuario": novo_log.usuario, "acao": novo_log.acao}}), 201

    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao adicionar log: {e}")
        return jsonify({"status": "error", "message": "Erro interno ao salvar log."}), 500

@app.route('/api/stock/item/<int:item_id>', methods=['PUT'])
def update_stock_item(item_id):
    """
    Rota OTIMIZADA e específica para atualizar UM ÚNICO item de estoque.
    """
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "Dados não fornecidos."}), 400

    try:
        with db_write_lock:
            item = db.session.get(ItemEstoque, item_id)
            if not item:
                return jsonify({"status": "error", "message": f"Item com ID {item_id} não encontrado."}), 404

            # Atualiza os campos que foram enviados
            if 'qtd' in data:
                item.quantidade = data['qtd']
            if 'prateleira' in data:
                item.prateleira = data['prateleira']
            if 'capacidade' in data:
                item.detalhes['capacidade'] = data['capacidade']
            # Adicione outros campos se necessário...
            
            # Marca o campo JSON como modificado para que o SQLAlchemy o salve
            db.session.flag_modified(item, "detalhes")
            db.session.commit()

        # Notifica todos os outros clientes que o estoque mudou
        socketio.emit('dados_atualizados', {'modulo': 'estoque'})
        
        return jsonify({"status": "ok", "message": "Item atualizado com sucesso."}), 200

    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao atualizar item de estoque: {e}")
        return jsonify({"status": "error", "message": "Erro interno do servidor."}), 500


# =================================================================
# LÓGICA DE IMAGEM UNIFICADA E ROBUSTA (v3.0)
# =================================================================

# --- FUNÇÕES DE LÓGICA DE IMAGEM ---
def get_sku_base_for_cache(filename):
    """Extrai o SKU base de um NOME DE ARQUIVO para usar como chave no cache."""
    if not filename:
        return None
    # Lógica para extrair a base do SKU, ex: "PRDA115-F.jpg" -> "prda115"
    base = filename.split(' ')[0].split('.')[0]
    suffixes_to_strip = ['-999', '-VF', '-100', '-130', '-175', '-F', '-P', '-V', '-C']
    base_upper = base.upper()
    for suffix in suffixes_to_strip:
        if base_upper.endswith(suffix):
            base = base[:-len(suffix)]
            break
    return base.lower()

def build_image_cache_async():
    """
    Constrói o cache em segundo plano. Para cada SKU, armazena apenas a imagem de MENOR TAMANHO (KB).
    """
    global image_cache, is_cache_ready
    
    print("🚀 [THREAD DE CACHE] Iniciando a construção do cache de imagens em segundo plano...")
    start_time = time.time()
    
    temp_cache = {}
    valid_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.bmp')
    
    if not os.path.isdir(IMAGE_SEARCH_ROOT_PATH):
        print(f"❌ [THREAD DE CACHE] ERRO CRÍTICO: Diretório '{IMAGE_SEARCH_ROOT_PATH}' não encontrado.")
        with cache_lock:
            is_cache_ready = True # Marca como "pronto" para não tentar de novo
        return

    # Percorre recursivamente todas as pastas e arquivos
    for dirpath, _, filenames in os.walk(IMAGE_SEARCH_ROOT_PATH):
        for filename in filenames:
            if not filename.lower().endswith(valid_extensions):
                continue

            sku_key = get_sku_base_for_cache(filename)
            if not sku_key:
                continue

            full_path = os.path.join(dirpath, filename)
            
            try:
                file_size = os.path.getsize(full_path)
                
                # Lógica que garante a escolha da menor imagem
                if sku_key not in temp_cache or file_size < temp_cache[sku_key]['size']:
                    temp_cache[sku_key] = {'path': full_path, 'size': file_size}

            except (OSError, FileNotFoundError):
                continue
    
    # Ao final, o cache global recebe a lista final
    with cache_lock:
        image_cache = temp_cache
        is_cache_ready = True

    total_time = time.time() - start_time
    print("-" * 60)
    print(f"✅ [THREAD DE CACHE] Cache de imagens construído! Apenas a menor imagem de cada SKU foi mantida.")
    print(f"   Tempo total: {total_time:.2f}s | SKUs únicos mapeados: {len(image_cache)}")
    print("-" * 60)

def find_image_realtime(sku):
    """
    Busca em tempo real (lento), usado APENAS como fallback enquanto o cache não está pronto.
    """
    search_key = get_sku_base_for_cache(sku)
    valid_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.bmp')
    best_match = None

    for dirpath, _, filenames in os.walk(IMAGE_SEARCH_ROOT_PATH):
        for filename in filenames:
            if filename.lower().endswith(valid_extensions):
                file_sku_key = get_sku_base_for_cache(filename)
                if file_sku_key == search_key:
                    full_path = os.path.join(dirpath, filename)
                    try:
                        file_size = os.path.getsize(full_path)
                        if best_match is None or file_size < best_match['size']:
                            best_match = {'path': full_path, 'size': file_size}
                    except (OSError, FileNotFoundError):
                        continue
                        
    return best_match['path'] if best_match else None


def build_image_cache():
    """
    Varre o diretório de imagens UMA ÚNICA VEZ e constrói o cache.
    VERSÃO OTIMIZADA com feedback de progresso.
    """
    global image_cache
    print("⏳ Iniciando a construção do cache de imagens... (Isso pode levar alguns minutos na primeira vez)")
    start_time = time.time()
    
    temp_cache = {}
    valid_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.bmp')
    
    if not os.path.isdir(IMAGE_SEARCH_ROOT_PATH):
        print(f"❌ ERRO CRÍTICO: O diretório de rede '{IMAGE_SEARCH_ROOT_PATH}' não foi encontrado ou está inacessível.")
        print("   Verifique se o computador tem acesso à pasta e se o caminho está correto.")
        # Se o caminho não existe, não há o que fazer. O cache ficará vazio.
        image_cache = {}
        return

    # --- NOVO: Feedback de Progresso ---
    processed_folders = 0
    processed_files = 0
    last_print_time = time.time()

    print(f"   Analisando o diretório: {IMAGE_SEARCH_ROOT_PATH}")

    for dirpath, _, filenames in os.walk(IMAGE_SEARCH_ROOT_PATH):
        processed_folders += 1
        
        # Imprime o progresso a cada 100 pastas ou a cada 5 segundos
        current_time = time.time()
        if processed_folders % 100 == 0 or current_time - last_print_time > 5:
            print(f"   ... Pastas analisadas: {processed_folders} | Arquivos encontrados: {processed_files} | Tempo: {current_time - start_time:.0f}s")
            last_print_time = current_time

        for filename in filenames:
            if filename.lower().endswith(valid_extensions):
                processed_files += 1
                sku_key = get_sku_base_for_cache(filename)
                if not sku_key:
                    continue

                full_path = os.path.join(dirpath, filename)
                
                try:
                    # Otimização: os.path.getsize() é uma chamada de rede extra.
                    # Vamos fazer isso apenas se necessário.
                    if sku_key not in temp_cache:
                        file_size = os.path.getsize(full_path)
                        temp_cache[sku_key] = {'path': full_path, 'size': file_size}
                    else:
                        # Só verifica o tamanho se a chave já existe, para ver se o novo arquivo é menor.
                        current_smallest_size = temp_cache[sku_key]['size']
                        file_size = os.path.getsize(full_path)
                        if file_size < current_smallest_size:
                            temp_cache[sku_key] = {'path': full_path, 'size': file_size}
                except (OSError, FileNotFoundError):
                    continue

    image_cache = temp_cache
    end_time = time.time()
    total_time = end_time - start_time
    
    print("-" * 50)
    print(f"✅ Cache de imagens construído com sucesso!")
    print(f"   Tempo total: {total_time:.2f} segundos")
    print(f"   Pastas totais analisadas: {processed_folders}")
    print(f"   SKUs únicos mapeados: {len(image_cache)}")
    print("-" * 50)

def get_sku_base_key(text):
    """
    Cria uma chave de SKU base a partir de um nome de arquivo ou SKU de pedido.
    1. Pega a primeira parte antes de um espaço.
    2. Remove sufixos comuns de variação (-F, -P, -100, etc.).
    Ex: "PRRV078 - Arte.jpg" -> "prrv078"
    Ex: "PVNV001-VF-P" -> "pvnv001"
    """
    if not text:
        return None
    base = text.split(' ')[0].lower()
    # Remove agressivamente qualquer sufixo que comece com '-' no final da string.
    base = re.sub(r'-[a-z0-9]+$', '', base, flags=re.IGNORECASE)
    return base

def is_white_background(image_path, threshold=240, percentage=0.95):
    # (Sua função original - sem alterações)
    try:
        img = Image.open(image_path).convert('RGB')
        width, height = img.size
        border_pixels = []
        for x in range(width):
            border_pixels.append(img.getpixel((x, 0)))
            border_pixels.append(img.getpixel((x, height - 1)))
        for y in range(1, height - 1):
            border_pixels.append(img.getpixel((0, y)))
            border_pixels.append(img.getpixel((width - 1, y)))
        white_pixels_count = sum(1 for r, g, b in border_pixels if r > threshold and g > threshold and b > threshold)
        return (white_pixels_count / len(border_pixels)) >= percentage
    except Exception as e:
        print(f"Erro ao processar imagem {image_path}: {e}")
        return False

# --- 3. ROTA DO FLASK (A FUNÇÃO QUE O FRONTEND VAI CHAMAR) ---

@app.route('/get_card_image/<sku>')
def get_card_image(sku):
    """
    VERSÃO OTIMIZADA: Busca a imagem de um SKU usando o cache em memória.
    Se o cache não estiver pronto, faz uma busca em tempo real como fallback.
    """
    image_path = None
    
    with cache_lock:
        cache_esta_pronto = is_cache_ready

    if cache_esta_pronto:
        # Se o cache está pronto, a busca é quase instantânea
        search_key = get_sku_base_for_cache(sku)
        found_image = image_cache.get(search_key)
        if found_image:
            image_path = found_image['path']
    else:
        # Fallback: se o cache ainda está sendo construído, faz a busca lenta
        print(f"⚠️  Cache de imagens ainda não está pronto. Buscando SKU '{sku}' em tempo real (lento)...")
        image_path = find_image_realtime(sku)

    if image_path and os.path.exists(image_path):
        try:
            # Adiciona um cabeçalho de cache no navegador para não pedir a mesma imagem de novo
            response = make_response(send_file(image_path))
            response.headers['Cache-Control'] = 'public, max-age=86400' # Cache de 1 dia
            return response
        except Exception:
            pass # Se falhar, cai para a imagem padrão

    # Se não encontrou ou deu erro, retorna a imagem "sem-imagem.png"
    return send_file('static/images/sem-imagem.png', mimetype='image/png')




@app.route('/api/images/search', methods=['GET'])
def search_images():
    """
    Endpoint que busca a imagem de um SKU.
    """
    sku_to_search = request.args.get('sku', '').lower()
    if not sku_to_search:
        return jsonify({'error': 'SKU não fornecido'}), 400

    # Constrói o cache na primeira requisição, se estiver vazio.
    if not image_cache:
        build_image_cache()
        if not image_cache:
            return jsonify({'error': 'Cache de imagens não pôde ser construído.'}), 500

    base_sku = get_sku_base_key(sku_to_search)
    if not base_sku:
        return jsonify({'error': 'SKU base inválido.'}), 400

    found_images = image_cache.get(base_sku, [])
    if not found_images:
        return jsonify({'message': f'Nenhuma imagem encontrada para o SKU: {sku_to_search}'}), 404

    # Estratégia: Retorna a imagem de menor tamanho (mais rápida para carregar)
    smallest_image = min(found_images, key=lambda img: img.get('size', float('inf')))

    return jsonify({
        'sku': sku_to_search,
        'image': smallest_image
    })
    




@app.route('/api/images/get_all_cached')
def get_all_cached_images():
    """
    Retorna um dicionário (mapa) de todos os SKUs e seus caminhos de imagem
    que estão atualmente no cache. O frontend usará isso para popular
    as imagens da tabela de estoque de forma eficiente.
    """
    with cache_lock:
        # Garante que o cache esteja pronto antes de enviar
        if not is_cache_ready:
            # Se o cache não estiver pronto, podemos esperar um pouco ou retornar vazio.
            # Retornar vazio é mais seguro para não travar a requisição.
            return jsonify({}), 200 # Retorna um objeto vazio se o cache ainda está construindo

        # Cria um novo dicionário apenas com o SKU (chave) e o caminho do arquivo (valor)
        # O frontend não precisa do tamanho do arquivo, apenas do caminho.
        path_map = {sku: data['path'] for sku, data in image_cache.items()}
        
        return jsonify(path_map)
    


# =================================================================
# LÓGICA DE IMAGEM
# =================================================================

@app.route('/api/images/<path:image_path>')
def serve_image(image_path):
    """
    Endpoint que serve o arquivo de imagem físico.
    O frontend usará a URL gerada por este endpoint.
    """
    try:
        # Decodifica o caminho que foi codificado no frontend
        decoded_path = os.path.normpath(image_path)
        directory = os.path.dirname(decoded_path)
        filename = os.path.basename(decoded_path)
        
        # Garante que o caminho está dentro do diretório raiz permitido
        if not os.path.abspath(directory).startswith(os.path.abspath(IMAGE_SEARCH_ROOT_PATH)):
             return jsonify({'error': 'Acesso negado.'}), 403

        return send_from_directory(directory, filename, as_attachment=False)
    except FileNotFoundError:
        return jsonify({'error': 'Arquivo de imagem não encontrado no servidor.'}), 404

@app.route('/api/users/login', methods=['POST'])
def login_user():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    user = User.query.filter_by(username=username, password=password).first()

    if user:
        return jsonify({"status": "ok", "message": "Login bem-sucedido", "user": {"username": user.username, "role": user.role, "permissions": user.permissions, "gruposCostura": user.gruposCostura, "setor": user.setor, "isGroup": user.isGroup, "groupName": user.groupName, "members": user.members}}), 200
    else:
        return jsonify({"status": "error", "message": "Credenciais inválidas"}), 401

@app.route('/api/users/create', methods=['POST'])
def create_user():
    
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    role = data.get('role')
    permissions = data.get('permissions', {})
    grupos_costura = data.get('gruposCostura', [])
    setor = data.get('setor')
    is_group = data.get('isGroup', False)
    group_name = data.get('groupName')
    members = data.get('members', [])

    if User.query.filter_by(username=username).first():
        return jsonify({"status": "error", "message": "Usuário já existe"}), 409

    new_user = User(username=username, password=password, role=role, permissions=permissions, gruposCostura=grupos_costura, setor=setor, isGroup=is_group, groupName=group_name, members=members)
    
    try:
        with db_write_lock:
            db.session.add(new_user)
            db.session.commit()
        
        # Emite sinal para atualizar usuários
        socketio.emit('dados_atualizados', {'modulo': 'users'})
    
        return jsonify({"status": "ok", "message": "Usuário criado com sucesso", "user": {"username": new_user.username, "role": new_user.role}}), 201
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao criar usuário: {e}")
        return jsonify({"status": "error", "message": "Erro interno ao criar usuário."}), 500


# =================================================================
# ROTAS DE CHAT OTIMIZADAS
# =================================================================

@app.route('/api/chat/save_message', methods=['POST'])
def save_chat_message():
    data = request.get_json()
    try:
        # Cria o objeto da mensagem para o banco de dados
        new_message = ChatMessage(
            conversaId=data.get('conversaId'),
            remetente=data.get('remetente'),
            destinatario=data.get('destinatario'),
            mensagem=data.get('texto'), # O frontend envia como 'texto'
            anexo=data.get('anexo'),
            timestamp=data.get('timestamp'),
            lidaPor=data.get('lidaPor', [])
        )
        
        # Salva no banco de dados
        with db_write_lock:
            db.session.add(new_message)
            db.session.commit()

        # Prepara os dados para enviar via socket (incluindo o ID gerado pelo banco)
        message_data = {
            "id": new_message.id,
            "conversaId": new_message.conversaId,
            "remetente": new_message.remetente,
            "destinatario": new_message.destinatario,
            "texto": new_message.mensagem, # O frontend espera 'texto'
            "anexo": new_message.anexo,
            "timestamp": new_message.timestamp,
            "lidaPor": new_message.lidaPor or []
        }

        # Pega o ID do socket do cliente que enviou a mensagem (passado no cabeçalho)
        origem_sid = request.headers.get('X-Socket-ID')

        # *** AQUI ESTÁ A CORREÇÃO PRINCIPAL ***
        # Emite a mensagem para a "sala" da conversa, mas pula o socket do remetente (skip_sid).
        # Isso garante que apenas os *outros* participantes da conversa recebam a notificação.
        socketio.emit('nova_mensagem', message_data, room=new_message.conversaId, skip_sid=origem_sid)

        return jsonify({"status": "ok", "message": "Mensagem salva e emitida com sucesso."}), 201

    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro ao salvar mensagem de chat: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Erro interno ao salvar a mensagem."}), 500


@app.route('/api/chat/mensagens/<conversa_id>', methods=['GET'])
def get_mensagens_por_conversa(conversa_id):
    """
    Retorna todas as mensagens de uma conversa específica.
    """
    try:
        mensagens = ChatMessage.query.filter_by(conversaId=conversa_id).order_by(ChatMessage.id.asc()).all()
        return jsonify([
            {
                "id": msg.id,
                "conversaId": msg.conversaId,
                "remetente": msg.remetente,
                "destinatario": msg.destinatario,
                "mensagem": msg.mensagem,
                "anexo": msg.anexo,
                "timestamp": msg.timestamp,
                "lidaPor": msg.lidaPor
            }
            for msg in mensagens
        ])
    except Exception as e:
        print("❌ Erro ao buscar mensagens:", e)
        return jsonify({"error": "Erro ao buscar mensagens"}), 500




@app.route('/api/chat/marcar_lidas', methods=['POST'])
def api_marcar_mensagens_lidas():
    """
    Recebe JSON: { "conversaId": "...", "username": "..." }
    Marca todas as mensagens daquela conversa como lidas pelo username.
    Emite evento Socket.IO 'mensagens_lidas' com { conversaId, username }.
    """
    try:
        data = request.get_json() or {}
        conversa_id = data.get('conversaId')
        username = data.get('username')

        if not conversa_id or not username:
            return jsonify({'error': 'conversaId e username são obrigatórios.'}), 400

        msgs = ChatMessage.query.filter_by(conversaId=conversa_id).all()
        updated = False

        for msg in msgs:
            if not msg.lidaPor:
                msg.lidaPor = []
            if username not in msg.lidaPor:
                msg.lidaPor.append(username)
                flag_modified(msg, "lidaPor")
                updated = True

        if updated:
            with db_write_lock:
                db.session.commit()

        # ✅ Emit sem broadcast=True (novo padrão)
        socketio.emit('mensagens_lidas', {'conversaId': conversa_id, 'username': username})

        return jsonify({'status': 'ok'}), 200

    except Exception as e:
        print("Erro no endpoint marcar_lidas:", e)
        traceback.print_exc()
        return jsonify({'error': 'Erro interno ao marcar lidas.'}), 500




@app.route('/api/chat/enviar', methods=['POST'])
def enviar_mensagem():
    try:
        data = request.get_json()
        conversa_id = data.get('conversaId')
        remetente = data.get('remetente')
        destinatario = data.get('destinatario')
        mensagem = data.get('mensagem', '')
        anexo = data.get('anexo')  # Agora, anexo é {nome, tipo, conteudo: 'data:image/...;base64,...'}
        timestamp = datetime.datetime.now().isoformat()

        if not conversa_id or not remetente or not destinatario:
            return jsonify({'error': 'Campos obrigatórios ausentes.'}), 400

        # Cria e salva a mensagem (anexo vai direto pro DB como JSON)
        nova_msg = ChatMessage(
            conversaId=conversa_id,
            remetente=remetente,
            destinatario=destinatario,
            mensagem=mensagem,
            anexo=anexo,
            timestamp=timestamp,
            lidaPor=[]
        )

        with db_write_lock:
            db.session.add(nova_msg)
            db.session.commit()

        payload = {
            'id': nova_msg.id,
            'conversaId': conversa_id,
            'remetente': remetente,
            'destinatario': destinatario,
            'mensagem': mensagem,
            'anexo': anexo,
            'timestamp': timestamp,
            'lidaPor': []
        }

        # Envia via Socket.IO para todos
        socketio.emit('nova_mensagem', payload, to=None)

        return jsonify({'status': 'ok', 'mensagem': payload})

    except Exception as e:
        print('❌ Erro ao enviar mensagem:', e)
        traceback.print_exc()
        return jsonify({'error': 'Erro ao enviar mensagem.'}), 500




# === Incluir no app.py (perto das rotas de chat) ===


# Extensões permitidas (ajuste se quiser mais tipos)
ALLOWED_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.ppt', '.pptx', '.zip'
}

def _is_allowed_filename(filename):
    _, ext = os.path.splitext(filename.lower())
    return ext in ALLOWED_EXTENSIONS

def _ensure_dir(path):
    os.makedirs(path, exist_ok=True)
    return path

@app.route('/api/chat/upload', methods=['POST'])
def upload_chat_file():
    """
    Recebe multipart/form-data com campo 'file' (obrigatório).
    Opcional: campo form 'conversaId' para agrupar arquivos por conversa.
    Retorna: { status: 'ok', file: { nome, tipo, url } } ou erro.
    """
    try:
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': 'Nenhum arquivo enviado (campo file ausente).'}), 400

        file_storage = request.files['file']
        if file_storage.filename == '':
            return jsonify({'status': 'error', 'message': 'Nome de arquivo inválido.'}), 400

        filename_original = secure_filename(file_storage.filename)
        if not _is_allowed_filename(filename_original):
            return jsonify({'status': 'error', 'message': 'Tipo de arquivo não permitido.'}), 400

        conversa_id = request.form.get('conversaId') or f"anon_{int(time.time())}"
        # Gera pasta por conversa para organização
        session_folder = os.path.join(IMAGE_TEMP_DEST_PATH, 'chat_files', conversa_id)
        _ensure_dir(session_folder)

        unique_token = uuid.uuid4().hex
        _, ext = os.path.splitext(filename_original)
        saved_filename = f"{int(time.time())}_{unique_token}{ext}"
        saved_path = os.path.join(session_folder, saved_filename)

        # Salva o arquivo
        file_storage.save(saved_path)

        # Gera URL pública para o frontend baixar/exibir (rota abaixo)
        url = f"/api/chat/files/chat_files/{conversa_id}/{saved_filename}"

        # Retorna metadata pronta para colocar no campo 'anexo' (frontend já usa esse formato)
        anexo_obj = {
            "nome": filename_original,
            "tipo": file_storage.mimetype,
            "conteudo": url  # OBS: frontend espera 'conteudo' com a URL ou dataURI
        }

        return jsonify({'status': 'ok', 'file': anexo_obj}), 201

    except Exception as e:
        print(f"❌ Erro no upload de chat: {e}")
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': 'Erro interno no upload.'}), 500


@app.route('/api/chat/files/<path:subpath>')
def serve_chat_file(subpath):
    """
    Serve arquivos salvos na árvore IMAGE_TEMP_DEST_PATH/chat_files/...
    subpath deve ser algo como 'chat_files/<conversaId>/<filename>'.
    """
    # Validação de segurança: impede acesso a caminhos fora do diretório esperado.
    if '..' in subpath or subpath.startswith('/') or subpath.startswith('\\'):
        return "Caminho inválido.", 400

    # Monta o diretório base esperado e separa a parte final
    parts = subpath.split('/')
    if len(parts) < 3 or parts[0] != 'chat_files':
        return "Caminho inválido.", 400

    conversa_folder = parts[1]
    filename = '/'.join(parts[2:])
    directory = os.path.join(IMAGE_TEMP_DEST_PATH, 'chat_files', conversa_folder)

    try:
        # send_from_directory faz checks e é mais seguro que send_file direto
        return send_from_directory(directory, filename, as_attachment=False)
    except FileNotFoundError:
        return "Arquivo não encontrado.", 404




@app.route('/api/chat/mark_as_read', methods=['POST'])
def mark_chat_as_read():
    """
    ROTA LEVE E DEDICADA: Marca um lote de mensagens como lidas para um usuário.
    """
    data = request.get_json()
    # ... (código de validação e atualização no banco) ...
    try:
        message_ids = data.get('messageIds')
        username = data.get('username')
        if not message_ids or not username:
            return jsonify({"status": "error", "message": "Dados incompletos."}), 400
            
        with db_write_lock:
            messages_to_update = db.session.query(ChatMessage).filter(ChatMessage.id.in_(message_ids)).all()
            for msg in messages_to_update:
                if username not in msg.lidaPor:
                    msg.lidaPor.append(username)
                    flag_modified(msg, "lidaPor")
            db.session.commit()

        # --- ALTERAÇÃO PRINCIPAL AQUI ---
        # Também adicionamos o ID de origem aqui.
        socketio.emit('dados_atualizados', {
            'modulo': 'chat',
            'origem_sid': request.headers.get('X-Socket-ID')  # << CORRIGIDO: Usa o cabeçalho X-Socket-ID
        })

        return jsonify({"status": "ok", "message": f"{len(messages_to_update)} mensagens marcadas como lidas."}), 200
    except Exception as e:
        # ... (seu código de tratamento de erro) ...
        db.session.rollback()
        print(f"❌ Erro ao marcar mensagens como lidas: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Erro interno ao marcar mensagens."}), 500




# =================================================================
# SOCKET.IO EVENTS OTIMIZADOS
# =================================================================

@socketio.on('connect')
def handle_connect():
    logger.info(f'Cliente conectado: {request.sid}')
    emit('connected', {'message': 'Conectado ao sistema otimizado'})

@socketio.on('get_task_status')
def handle_get_task_status(data):
    """Endpoint para verificar status de tarefas via Socket.IO."""
    task_id = data.get('task_id')
    if task_id:
        status = task_queue.get_task_status(task_id)
        emit('task_status', status)




if __name__ == '__main__':
    logger.info("🚀 Iniciando sistema otimizado para múltiplas ações simultâneas...")
    
    # Inicia cache em thread separada
    cache_thread = Thread(target=build_image_path_cache_optimized, daemon=True)
# cache_thread.start()
# cleanup_thread.start()
    
    # Inicia limpeza otimizada
    cleanup_thread = Thread(target=cleanup_temp_folders_optimized, daemon=True)
    
    logger.info("✅ Sistema otimizado inicializado!")
    
    # Inicia servidor com configurações otimizadas
    socketio.run(app, 
                host='0.0.0.0', 
                port=5000,
                debug=False,
                allow_unsafe_werkzeug=True)