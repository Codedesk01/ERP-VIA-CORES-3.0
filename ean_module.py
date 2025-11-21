# -*- coding: utf-8 -*-
"""
Módulo EAN - Sistema de Gerenciamento de Códigos de Barras EAN
Versão completa com todas as funcionalidades EAN extraídas do app.py
"""
from sqlalchemy.orm.attributes import flag_modified
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import UniqueConstraint, Identity, cast, String, or_, and_
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.types import JSON as SQLJSON
from datetime import datetime
import logging
import traceback
from threading import Lock
import json

# Configurar logging
logger = logging.getLogger(__name__)

# Variáveis globais que serão configuradas na inicialização
_db = None
_EANItem = None
_ErroImportacaoEAN = None
_ListaEAN = None

def create_ean_models(db):
    """
    Cria as classes de modelo EAN usando a instância db fornecida
    
    Args:
        db: Instância do SQLAlchemy
        
    Returns:
        tuple: (EANItem, ErroImportacaoEAN, ListaEAN)
    """
    
    class EANItem(db.Model):
        """
        Modelo de dados para itens EAN no sistema
        """
        __tablename__ = 'ean_items'
        id = db.Column(db.Integer, primary_key=True, autoincrement=True)
        sku = db.Column(db.String(50), nullable=False, index=True)
        ean = db.Column(db.String(20), nullable=False)
        peso = db.Column(db.Float, nullable=True)
        ncm = db.Column(db.String(10), nullable=True)
        lojas = db.Column(SQLJSON, default=dict)
        
        __table_args__ = (UniqueConstraint('sku', 'ean'),)

    class ErroImportacaoEAN(db.Model):
        """
        Modelo para registrar erros de importação EAN
        """
        __tablename__ = 'erros_importacao_ean'
        id = db.Column(db.Integer, primary_key=True, autoincrement=True)
        linha = db.Column(db.Integer, nullable=False)
        motivo = db.Column(db.Text, nullable=False)
        timestamp = db.Column(db.String(100), nullable=False, index=True)

    class ListaEAN(db.Model):
        """
        Modelo alternativo para lista de EANs
        """
        __tablename__ = 'lista_eans'
        id = db.Column(db.Integer, primary_key=True, autoincrement=True)
        sku = db.Column(db.String(100), nullable=False, unique=True, index=True)
        ean = db.Column(db.String(100), nullable=False, unique=True, index=True)
        peso = db.Column(db.Float)
        ncm = db.Column(db.String(50))
    
    return EANItem, ErroImportacaoEAN, ListaEAN

class EANModule:
    """
    Classe principal do módulo EAN que gerencia todas as operações
    """
    
    def __init__(self, db_instance, ean_models, socketio_instance=None):
        """
        Inicializa o módulo EAN
        
        Args:
            db_instance: Instância do SQLAlchemy
            ean_models: Tupla com as classes de modelo (EANItem, ErroImportacaoEAN, ListaEAN)
            socketio_instance: Instância do SocketIO (opcional)
        """
        self.db = db_instance
        self.EANItem, self.ErroImportacaoEAN, self.ListaEAN = ean_models
        self.socketio = socketio_instance
        self.db_write_lock = Lock()
        
        # Configuração das lojas
        self.lojas_config = [
            {'id': 'loja-outros', 'nome': 'Loja 1', 'sufixo': None, 'cor': 'gray'},
            {'id': 'loja-f', 'nome': 'Loja 2 (-F)', 'sufixo': '-F', 'cor': 'blue'},
            {'id': 'loja-p', 'nome': 'Loja 3 (-P)', 'sufixo': '-P', 'cor': 'purple'},
            {'id': 'loja-v', 'nome': 'Loja 4 (-V)', 'sufixo': '-V', 'cor': 'teal'},
            {'id': 'loja-c', 'nome': 'Loja 5 (-C)', 'sufixo': '-C', 'cor': 'pink'}
        ]
        
        logger.info("Módulo EAN inicializado com sucesso")
    
    def create_tables(self, app):
        """
        Cria todas as tabelas necessárias para o módulo EAN
        
        Args:
            app: Instância do Flask para criar as tabelas
        """
        try:
            with app.app_context():
                self.db.create_all()
                logger.info("Tabelas EAN criadas com sucesso")
        except Exception as e:
            logger.error(f"Erro ao criar tabelas EAN: {e}")
            raise
    
    def get_lojas_config(self):
        """
        Retorna a configuração das lojas
        """
        return self.lojas_config
    
    def processar_eans_batch(self, batch_data):
        """
        Processa um lote de dados EAN
        
        Args:
            batch_data: Lista de dicionários com dados dos EANs
            
        Returns:
            dict: Resultado do processamento
        """
        adicionados = 0
        erros = []
        
        try:
            with self.db_write_lock:
                for item_data in batch_data:
                    try:
                        # Verifica se já existe
                        existing = self.db.session.query(self.EANItem).filter_by(
                            sku=item_data['sku']
                        ).first()
                        
                        if not existing:
                            # Cria novo item
                            novo_item = self.EANItem(
                                sku=item_data['sku'],
                                ean=item_data['ean'],
                                peso=item_data.get('peso'),
                                ncm=item_data.get('ncm'),
                                lojas=item_data.get('lojas', {})
                            )
                            self.db.session.add(novo_item)
                            adicionados += 1
                        
                    except Exception as e:
                        erro_msg = f"Erro ao processar SKU {item_data.get('sku', 'N/A')}: {str(e)}"
                        logger.error(erro_msg)
                        erros.append(erro_msg)
                
                self.db.session.commit()
                
                # Emite sinal de atualização se SocketIO estiver disponível
                if self.socketio:
                    self.socketio.emit('dados_atualizados', {'modulo': 'ean'})
        
        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Erro crítico no processamento em lote: {e}")
            raise
        
        return {
            'status': 'ok',
            'adicionados': adicionados,
            'erros': erros
        }
        


    def obter_estatisticas_com_lojas(self):
            """
                Obtém estatísticas totais e a contagem de itens por loja,
                calculadas diretamente no banco de dados para máxima performance.
            """
            try:
                total_itens = self.db.session.query(self.EANItem).count()
                total_erros = self.db.session.query(self.ErroImportacaoEAN).count()
    
                contagem_por_loja = {}
    
        # Inicializa contadores
                for loja in self.lojas_config:
                    contagem_por_loja[loja['id']] = 0

        # Constrói a condição para encontrar SKUs que NÃO terminam com nenhum sufixo conhecido
                sufixos_conhecidos = [loja['sufixo'] for loja in self.lojas_config if loja['sufixo']]
                condicao_sem_sufixo = and_(*[~self.EANItem.sku.endswith(suf) for suf in sufixos_conhecidos])
    
        # Conta itens da "Loja 1" (sem sufixo)
                contagem_por_loja['loja-outros'] = self.db.session.query(self.EANItem).filter(condicao_sem_sufixo).count()

    # Conta itens para cada loja com sufixo
                for loja in self.lojas_config:
                    if loja['sufixo']:
                        contagem_por_loja[loja['id']] = self.db.session.query(self.EANItem).filter(self.EANItem.sku.endswith(loja['sufixo'])).count()

                return {
                    'status': 'ok',
                    'total_itens': total_itens,
                    'total_erros': total_erros,
                    'contagem_por_loja': contagem_por_loja
                }

            except Exception as e:
                logger.error(f"Erro ao obter estatísticas detalhadas de EANs: {e}")
                return {'status': 'error', 'message': str(e)}


    
    def buscar_eans_paginado(self, page=1, per_page=100, loja_id=None, termo=None):
        """
        Busca EANs com paginação e filtros
        
        Args:
            page: Página atual (padrão: 1)
            per_page: Itens por página (padrão: 100)
            loja_id: ID da loja para filtrar
            termo: Termo de busca (SKU ou EAN)
            
        Returns:
            dict: Resultados da busca com paginação
        """
        try:
            query = self.db.session.query(self.EANItem)
            
            # Aplicar filtros
            if termo:
                # Verifica se o termo de busca é um número, para também buscar pelo ID
                if termo.isdigit():
                    termo_numerico = int(termo)
                    search_term_like = f"%{termo.upper()}%"
                    query = query.filter(
                        or_(
                            self.EANItem.id == termo_numerico,
                            self.EANItem.sku.ilike(search_term_like),
                            self.EANItem.ean.ilike(search_term_like)
                        )
                    )
                else:
                    # Se não for um número, busca apenas em SKU e EAN
                    search_term_like = f"%{termo.upper()}%"
                    query = query.filter(
                        or_(
                            self.EANItem.sku.ilike(search_term_like),
                            self.EANItem.ean.ilike(search_term_like)
                        )
                    )
            
            if loja_id and loja_id != 'loja-outros':
                loja_config = next((l for l in self.lojas_config if l['id'] == loja_id), None)
                if loja_config and loja_config['sufixo']:
                    query = query.filter(self.EANItem.sku.endswith(loja_config['sufixo']))
                else:
                    # Loja sem sufixo
                    all_suffixes = [l['sufixo'] for l in self.lojas_config if l['sufixo']]
                    suffix_filters = [~self.EANItem.sku.endswith(suf) for suf in all_suffixes]
                    if suffix_filters:
                        query = query.filter(*suffix_filters)
            elif loja_id == 'loja-outros':
                # Loja "outros" = itens sem sufixo
                all_suffixes = [l['sufixo'] for l in self.lojas_config if l['sufixo']]
                suffix_filters = [~self.EANItem.sku.endswith(suf) for suf in all_suffixes]
                if suffix_filters:
                    query = query.filter(*suffix_filters)
            
            # Paginação
            total = query.count()
            items = query.order_by(self.EANItem.sku.asc()).offset(
                (page - 1) * per_page
            ).limit(per_page).all()
            
            # Converter para dict
            items_data = []
            for item in items:
                item_dict = {
                    'id': item.id,
                    'sku': item.sku,
                    'ean': item.ean,
                    'peso': item.peso,
                    'ncm': item.ncm,
                    'lojas': item.lojas or {}
                }
                items_data.append(item_dict)
            
            pages = (total + per_page - 1) // per_page
            
            return {
                'status': 'ok',
                'items': items_data,
                'total': total,
                'page': page,
                'pages': pages,
                'per_page': per_page
            }
            
        except Exception as e:
            logger.error(f"Erro na busca paginada de EANs: {e}")
            return {
                'status': 'error',
                'message': str(e),
                'items': [],
                'total': 0,
                'page': page,
                'pages': 0
            }
    


    def atualizar_status_marketplace(self, item_id, loja_id, marketplace, status_info):
        """
        Atualiza o status de um marketplace específico para um item.
        VERSÃO CORRIGIDA: Envia um evento WebSocket específico para não recarregar a tela.
        """
        try:
            with self.db_write_lock:
                item = self.db.session.get(self.EANItem, item_id)
                if not item:
                    return {'status': 'error', 'message': 'Item não encontrado'}

                if item.lojas is None:
                    item.lojas = {}
                if loja_id not in item.lojas:
                    item.lojas[loja_id] = {'marketplaces': {}}
                if 'marketplaces' not in item.lojas[loja_id]:
                    item.lojas[loja_id]['marketplaces'] = {}

                item.lojas[loja_id]['marketplaces'][marketplace] = status_info
                flag_modified(item, "lojas")
                
                self.db.session.commit()

                # ======================= INÍCIO DA CORREÇÃO =======================
                # Em vez de um evento genérico, enviamos um evento específico com os dados atualizados.
                if self.socketio:
                    dados_item_atualizado = {
                        'id': item.id,
                        'sku': item.sku,
                        'ean': item.ean,
                        'peso': item.peso,
                        'ncm': item.ncm,
                        'lojas': item.lojas or {}
                    }
                    # Novo evento: 'ean_item_updated'
                    self.socketio.emit('ean_item_updated', {'item': dados_item_atualizado})
                # ======================== FIM DA CORREÇÃO =========================

                return {'status': 'ok', 'message': 'Status atualizado com sucesso'}

        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Erro ao atualizar status do marketplace: {e}")
            traceback.print_exc()
            return {'status': 'error', 'message': str(e)}




    
    def excluir_ean(self, item_id):
        """
        Exclui um item EAN
        
        Args:
            item_id: ID do item a ser excluído
            
        Returns:
            dict: Resultado da exclusão
        """
        try:
            with self.db_write_lock:
                item = self.db.session.get(self.EANItem, item_id)
                if not item:
                    return {'status': 'error', 'message': 'Item não encontrado'}
                
                self.db.session.delete(item)
                self.db.session.commit()
                
                if self.socketio:
                    self.socketio.emit('dados_atualizados', {'modulo': 'ean'})
                
                return {'status': 'ok', 'message': 'Item excluído com sucesso'}
                
        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Erro ao excluir item EAN: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def editar_ean(self, item_id, dados_atualizados):
        """
        Edita um item EAN
        
        Args:
            item_id: ID do item
            dados_atualizados: Dados atualizados do item
            
        Returns:
            dict: Resultado da edição
        """
        try:
            with self.db_write_lock:
                item = self.db.session.get(self.EANItem, item_id)
                if not item:
                    return {'status': 'error', 'message': 'Item não encontrado'}
                
                # Atualiza os campos
                if 'sku' in dados_atualizados:
                    item.sku = dados_atualizados['sku']
                if 'ean' in dados_atualizados:
                    item.ean = dados_atualizados['ean']
                if 'peso' in dados_atualizados:
                    item.peso = dados_atualizados['peso']
                if 'ncm' in dados_atualizados:
                    item.ncm = dados_atualizados['ncm']
                
                self.db.session.commit()
                
                if self.socketio:
                    self.socketio.emit('dados_atualizados', {'modulo': 'ean'})
                
                return {'status': 'ok', 'message': 'Item atualizado com sucesso'}
                
        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Erro ao editar item EAN: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def registrar_erros_importacao(self, erros):
        """
        Registra erros de importação de EANs
        
        Args:
            erros: Lista de erros para registrar
            
        Returns:
            dict: Resultado do registro
        """
        try:
            with self.db_write_lock:
                timestamp = datetime.now().isoformat()
                
                for erro_data in erros:
                    novo_erro = self.ErroImportacaoEAN(
                        linha=erro_data.get('linha', 0),
                        motivo=erro_data.get('motivo', 'Erro desconhecido'),
                        timestamp=erro_data.get('timestamp', timestamp)
                    )
                    self.db.session.add(novo_erro)
                
                self.db.session.commit()
                
                return {'status': 'ok', 'message': f'{len(erros)} erros registrados'}
                
        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Erro ao registrar erros: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def obter_erros_importacao(self):
        """
        Obtém todos os erros de importação
        
        Returns:
            list: Lista de erros
        """
        try:
            erros = self.db.session.query(self.ErroImportacaoEAN).order_by(
                self.ErroImportacaoEAN.id.desc()
            ).all()
            
            return [{
                'id': erro.id,
                'linha': erro.linha,
                'motivo': erro.motivo,
                'timestamp': erro.timestamp
            } for erro in erros]
            
        except Exception as e:
            logger.error(f"Erro ao obter erros de importação: {e}")
            return []
    
    def limpar_erros_importacao(self):
        """
        Limpa todos os erros de importação
        
        Returns:
            dict: Resultado da limpeza
        """
        try:
            with self.db_write_lock:
                num_erros = self.db.session.query(self.ErroImportacaoEAN).delete()
                self.db.session.commit()
                
                return {'status': 'ok', 'message': f'{num_erros} erros removidos'}
                
        except Exception as e:
            self.db.session.rollback()
            logger.error(f"Erro ao limpar erros: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def obter_estatisticas(self):
        """
        Obtém estatísticas do módulo EAN.
        """
        try:
            # Esta contagem é feita diretamente no banco de dados, é rápida e precisa.
            total_itens = self.db.session.query(self.EANItem).count()
            total_erros = self.db.session.query(self.ErroImportacaoEAN).count()
            
            return {
                'status': 'ok',
                'total_itens': total_itens,
                'total_erros': total_erros,
                'lojas': len(self.lojas_config)
            }
            
        except Exception as e:
            logger.error(f"Erro ao obter estatísticas: {e}")
            return {'status': 'error', 'message': str(e)}


def create_ean_routes(app, ean_module):
    """
    Cria todas as rotas Flask para o módulo EAN
    
    Args:
        app: Instância do Flask
        ean_module: Instância do EANModule
    """
    


    @app.route('/api/eans/stats_detalhadas', methods=['GET'])
    def obter_estatisticas_detalhadas():
        """Obtém estatísticas detalhadas do módulo EAN, incluindo contagem por loja."""
        try:
            stats = ean_module.obter_estatisticas_com_lojas()
            return jsonify(stats)
        except Exception as e:
            logger.error(f"Erro na rota de estatísticas detalhadas: {e}")
            return jsonify({'status': 'error', 'message': 'Erro interno do servidor'}), 500

    
    @app.route('/api/eans/process_batch', methods=['POST'])
    def processar_eans_lote():
        """Processa um lote de dados EAN"""
        try:
            data = request.get_json()
            batch = data.get('batch', [])
            
            if not batch:
                return jsonify({'status': 'error', 'message': 'Nenhum dado fornecido'}), 400
            
            resultado = ean_module.processar_eans_batch(batch)
            return jsonify(resultado)
            
        except Exception as e:
            logger.error(f"Erro na rota de processamento em lote: {e}")
            return jsonify({'status': 'error', 'message': 'Erro interno do servidor'}), 500
    
    @app.route('/api/eans/search', methods=['GET'])
    def buscar_eans():
        """Busca EANs com paginação"""
        try:
            page = int(request.args.get('page', 1))
            per_page = int(request.args.get('per_page', 100))
            loja_id = request.args.get('lojaId')
            termo = request.args.get('termo')
            
            resultado = ean_module.buscar_eans_paginado(
                page=page, 
                per_page=per_page, 
                loja_id=loja_id, 
                termo=termo
            )
            
            return jsonify(resultado)
            
        except Exception as e:
            logger.error(f"Erro na rota de busca: {e}")
            return jsonify({'status': 'error', 'message': 'Erro na busca'}), 500
    
    @app.route('/api/eans/update_marketplace_status', methods=['POST'])
    def atualizar_status_marketplace():
        """Atualiza status de marketplace para um item EAN"""
        try:
            data = request.get_json()
            item_id = data.get('itemId')
            loja_id = data.get('lojaId')
            marketplace = data.get('marketplace')
            status_info = data.get('statusInfo')
            
            if not all([item_id, loja_id, marketplace, status_info]):
                return jsonify({'status': 'error', 'message': 'Dados incompletos'}), 400
            
            resultado = ean_module.atualizar_status_marketplace(
                item_id, loja_id, marketplace, status_info
            )
            
            return jsonify(resultado)
            
        except Exception as e:
            logger.error(f"Erro na atualização de status: {e}")
            return jsonify({'status': 'error', 'message': 'Erro interno'}), 500
    
    @app.route('/api/eans/<int:item_id>', methods=['DELETE'])
    def excluir_ean(item_id):
        """Exclui um item EAN"""
        try:
            resultado = ean_module.excluir_ean(item_id)
            status_code = 200 if resultado['status'] == 'ok' else 404
            return jsonify(resultado), status_code
            
        except Exception as e:
            logger.error(f"Erro na exclusão de item: {e}")
            return jsonify({'status': 'error', 'message': 'Erro interno'}), 500
    
    @app.route('/api/eans/<int:item_id>', methods=['PUT'])
    def editar_ean(item_id):
        """Edita um item EAN"""
        try:
            data = request.get_json()
            resultado = ean_module.editar_ean(item_id, data)
            
            status_code = 200 if resultado['status'] == 'ok' else 400
            return jsonify(resultado), status_code
            
        except Exception as e:
            logger.error(f"Erro na edição de item: {e}")
            return jsonify({'status': 'error', 'message': 'Erro interno'}), 500
    
    @app.route('/api/eans/log_errors', methods=['POST'])
    def registrar_erros():
        """Registra erros de importação"""
        try:
            data = request.get_json()
            erros = data.get('errors', [])
            
            if not erros:
                return jsonify({'status': 'error', 'message': 'Nenhum erro fornecido'}), 400
            
            resultado = ean_module.registrar_erros_importacao(erros)
            return jsonify(resultado)
            
        except Exception as e:
            logger.error(f"Erro no registro de erros: {e}")
            return jsonify({'status': 'error', 'message': 'Erro interno'}), 500
    
    @app.route('/api/eans/errors', methods=['GET'])
    def obter_erros():
        """Obtém lista de erros de importação"""
        try:
            erros = ean_module.obter_erros_importacao()
            return jsonify({'status': 'ok', 'errors': erros})
            
        except Exception as e:
            logger.error(f"Erro ao obter erros: {e}")
            return jsonify({'status': 'error', 'message': 'Erro interno'}), 500
    
    @app.route('/api/eans/errors/clear', methods=['DELETE'])
    def limpar_erros():
        """Limpa todos os erros de importação"""
        try:
            resultado = ean_module.limpar_erros_importacao()
            return jsonify(resultado)
            
        except Exception as e:
            logger.error(f"Erro ao limpar erros: {e}")
            return jsonify({'status': 'error', 'message': 'Erro interno'}), 500
    
    @app.route('/api/eans/stats', methods=['GET'])
    def obter_estatisticas():
        """Obtém estatísticas do módulo EAN"""
        try:
            stats = ean_module.obter_estatisticas()
            return jsonify(stats)
            
        except Exception as e:
            logger.error(f"Erro ao obter estatísticas: {e}")
            return jsonify({'status': 'error', 'message': 'Erro interno'}), 500
    
    @app.route('/api/eans/config/lojas', methods=['GET'])
    def obter_config_lojas():
        """Obtém configuração das lojas"""
        try:
            config = ean_module.get_lojas_config()
            return jsonify({'status': 'ok', 'config': config})
            
        except Exception as e:
            logger.error(f"Erro ao obter configuração das lojas: {e}")
            return jsonify({'status': 'error', 'message': 'Erro interno'}), 500
    
    logger.info("Rotas do módulo EAN criadas com sucesso")


def init_ean_module(app, db, socketio=None):
    """
    Inicializa o módulo EAN completo
    
    Args:
        app: Instância do Flask
        db: Instância do SQLAlchemy
        socketio: Instância do SocketIO (opcional)
        
    Returns:
        EANModule: Instância do módulo EAN inicializado
    """
    try:
        # Cria as classes de modelo usando a instância db fornecida
        ean_models = create_ean_models(db)
        
        # Cria instância do módulo
        ean_module = EANModule(db, ean_models, socketio)
        
        # Cria tabelas (passa o app como parâmetro)
        ean_module.create_tables(app)
        
        # Cria rotas
        create_ean_routes(app, ean_module)
        
        logger.info("Módulo EAN inicializado com sucesso")
        return ean_module
        
    except Exception as e:
        logger.error(f"Erro ao inicializar módulo EAN: {e}")
        raise