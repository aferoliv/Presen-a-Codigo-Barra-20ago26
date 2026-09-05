# -*- coding: utf-8 -*-
"""
Compilador de Faltas – v5.1 (GUI com F5/atalhos e menu)
Igual à v5, mas com:
- Botão "Executar (F5)" também no topo
- Atalhos: F5, Ctrl+E, Ctrl+Enter para executar
- Menu Arquivo → Executar / Sair
- Janela maior e redimensionável (para evitar botão fora da tela)

Autor: ChatGPT (GPT-5 Thinking)
Data: 2025-09-07
"""
import os, re, csv, glob, json, logging, shutil, tempfile, tkinter as tk
from tkinter import filedialog, messagebox
from datetime import datetime, date
from collections import defaultdict, OrderedDict

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

try:
    import pandas as pd
except Exception:
    pd = None

LOG_FILENAME = "compilador_faltas.log"


class TkLogHandler(logging.Handler):
    """Encaminha mensagens de log para um callback da interface."""
    def __init__(self, callback):
        super().__init__()
        self._callback = callback

    def emit(self, record):
        try:
            msg = self.format(record)
            self._callback(msg)
        except Exception:
            pass

# ==================== util (iguais à v5) ====================
def matricula_to_number(matricula):
    """Converte matrícula para número, removendo prefixos não numéricos"""
    if not matricula:
        return ""
    # Extrai apenas os números da matrícula
    numeros = ''.join(filter(str.isdigit, str(matricula)))
    if numeros:
        return int(numeros)
    return matricula  # Retorna original se não houver números

def normalize_matricula(matricula):
    """Retorna apenas os dígitos da matrícula, para correspondência tolerante a prefixos (ex.: 'ES')."""
    if not matricula:
        return ""
    return ''.join(filter(str.isdigit, str(matricula)))

_NOMES_INVALIDOS = {"", "null", "none", "nan", "n/a", "-"}

def nome_valido(nome) -> bool:
    """Indica se um valor de nome é utilizável (não vazio e não um placeholder tipo 'null')."""
    if nome is None:
        return False
    return str(nome).strip().lower() not in _NOMES_INVALIDOS

def melhor_nome(atual: str, novo: str) -> str:
    """Escolhe o nome mais completo entre dois candidatos da mesma matrícula, ignorando
    valores inválidos (vazio, 'null', etc.) para que a matrícula seja sempre a identidade
    principal do aluno, mesmo quando o log traz ora o nome completo, ora só o primeiro nome."""
    if not nome_valido(novo):
        return atual
    if not nome_valido(atual):
        return novo
    return novo if len(str(novo).strip()) > len(str(atual).strip()) else atual

def setup_logging(saida_dir: str):
    try:
        os.makedirs(saida_dir, exist_ok=True)
    except Exception:
        saida_dir = os.getcwd()
    log_path = os.path.join(saida_dir, LOG_FILENAME)
    logging.basicConfig(
        level=logging.DEBUG,  # Changed to DEBUG to see debug messages
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_path, encoding="utf-8"),
            logging.StreamHandler()
        ],
        force=True
    )
    logging.info("Log inicializado em: %s", log_path)

def guess_delimiter(sample: str) -> str:
    import csv as _csv
    try:
        dialect = _csv.Sniffer().sniff(sample, delimiters=',;\t|')
        return dialect.delimiter
    except Exception:
        return ';' if sample.count(';') > sample.count(',') else ','

def read_text_or_csv(path: str):
    encodings = ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252']
    import csv as _csv
    for enc in encodings:
        try:
            with open(path, 'r', encoding=enc, newline='') as f:
                sample = f.read(4096); f.seek(0)
                delim = guess_delimiter(sample)
                reader = _csv.DictReader(f, delimiter=delim)
                if reader.fieldnames:
                    reader.fieldnames = [fn.strip().replace('\ufeff', '') for fn in reader.fieldnames]
                for row in reader:
                    clean = {}
                    for k, v in row.items():
                        if k is None: continue
                        clean[k.strip().replace('\ufeff','')] = v
                    yield clean
            logging.info("Arquivo %s lido com codificação %s e delimitador '%s'", os.path.basename(path), enc, delim)
            return
        except UnicodeDecodeError:
            continue
        except Exception as e:
            logging.warning("Falha ao ler %s com %s: %s", os.path.basename(path), enc, e)
            continue
    logging.error("Não foi possível ler o arquivo: %s", path)

from openpyxl.utils import get_column_letter
from openpyxl.styles import Font, PatternFill, Alignment
def format_header(ws, row_idx: int):
    font = Font(bold=True, color="FFFFFF")
    fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    align = Alignment(horizontal="center", vertical="center")
    for col in range(1, ws.max_column + 1):
        cell = ws.cell(row=row_idx, column=col)
        cell.font = font
        cell.fill = fill
        cell.alignment = align

def autofit_columns(ws, min_w=12, max_w=50):
    for col in range(1, ws.max_column + 1):
        letter = get_column_letter(col)
        max_len = 0
        for row in range(1, ws.max_row + 1):
            v = ws.cell(row=row, column=col).value
            if v is None: continue
            max_len = max(max_len, len(str(v)))
        ws.column_dimensions[letter].width = max(min_w, min(max_len + 2, max_w))

def _wb_finalize_sheet(ws, header_row=1):
    """Finaliza a formatação da planilha - apenas congelamento de painéis"""
    try:
        # Apenas congela o painel na primeira linha de dados
        ws.freeze_panes = ws.cell(row=header_row+1, column=1)
    except Exception as e:
        logging.warning("Erro ao congelar painel: %s", e)

import shutil, tempfile
def safe_save_workbook(wb, desired_path: str) -> str:
    if not desired_path.lower().endswith(".xlsx"):
        desired_path += ".xlsx"
    desired_dir = os.path.dirname(desired_path) or os.getcwd()
    try: os.makedirs(desired_dir, exist_ok=True)
    except Exception: pass
    base_name = os.path.basename(desired_path)
    with tempfile.TemporaryDirectory() as td:
        tmp_path = os.path.join(td, f"tmp_{base_name}")
        wb.save(tmp_path)
        try:
            if os.path.exists(desired_path):
                try: os.remove(desired_path)
                except Exception: pass
            shutil.move(tmp_path, desired_path)
            return desired_path
        except Exception as e:
            logging.warning("Falha/memória ao mover para %s: %s", desired_path, e)
        # fallback Desktop
        try:
            desktop = os.path.join(os.path.expanduser("~"), "Desktop")
            os.makedirs(desktop, exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            alt_path = os.path.join(desktop, base_name.replace(".xlsx", f"_{stamp}.xlsx"))
            shutil.move(tmp_path, alt_path)
            return alt_path
        except Exception:
            alt_path2 = os.path.join(os.getcwd(), base_name)
            shutil.move(tmp_path, alt_path2)
            return alt_path2

def safe_save_csv(rows, headers, desired_path: str) -> str:
    import csv as _csv
    if not desired_path.lower().endswith(".csv"):
        desired_path += ".csv"
    desired_dir = os.path.dirname(desired_path) or os.getcwd()
    try: os.makedirs(desired_dir, exist_ok=True)
    except Exception: pass
    base_name = os.path.basename(desired_path)
    with tempfile.TemporaryDirectory() as td:
        tmp_path = os.path.join(td, f"tmp_{base_name}")
        with open(tmp_path, 'w', encoding='utf-8-sig', newline='') as f:
            w = _csv.writer(f, delimiter=';')
            w.writerow(headers)
            for r in rows:
                w.writerow(r)
        try:
            if os.path.exists(desired_path):
                try: os.remove(desired_path)
                except Exception: pass
            shutil.move(tmp_path, desired_path)
            return desired_path
        except Exception as e:
            logging.warning("Falha/memória ao mover CSV para %s: %s", desired_path, e)
        try:
            desktop = os.path.join(os.path.expanduser("~"), "Desktop")
            os.makedirs(desktop, exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            alt_path = os.path.join(desktop, base_name.replace(".csv", f"_{stamp}.csv"))
            shutil.move(tmp_path, alt_path)
            return alt_path
        except Exception:
            alt_path2 = os.path.join(os.getcwd(), base_name)
            shutil.move(tmp_path, alt_path2)
            return alt_path2

# datas
def parse_user_date(text: str):
    if not text: return None
    text = text.strip()
    for fmt in ("%d/%m/%y", "%d/%m/%Y"):
        try: return datetime.strptime(text, fmt).date()
        except Exception: continue
    return None

def try_parse_date_from_filename(filename: str, regex_date: str | None):
    name = os.path.basename(filename)
    base = os.path.splitext(name)[0]
    if regex_date:
        m = re.search(regex_date, base)
        if m:
            txt = m.group(1) if m.groups() else m.group(0)
            for fmt in ("%Y-%m-%d","%d-%m-%Y","%d_%m_%Y","%Y%m%d","%d%m%Y","%d-%m-%Y_%H-%M-%S","%Y-%m-%d_%H-%M-%S"):
                try: return datetime.strptime(txt, fmt).strftime("%Y-%m-%d")
                except Exception: continue
            return txt
    for pat, fmt in [
        (r"(20\d{2}-\d{2}-\d{2})", "%Y-%m-%d"),
        (r"(20\d{2}\d{2}\d{2})", "%Y%m%d"),
        (r"(\d{2}-\d{2}-20\d{2})", "%d-%m-%Y"),
        (r"(\d{2}_\d{2}_20\d{2})", "%d_%m_%Y"),
    ]:
        m = re.search(pat, base)
        if m:
            txt = m.group(1)
            try:
                dt = datetime.strptime(txt, fmt)
                return dt.strftime("%Y-%m-%d")
            except Exception:
                pass
    return base

def dataid_to_date(data_id: str):
    if not data_id: return None
    for fmt in ("%Y-%m-%d","%d-%m-%Y","%d/%m/%Y","%Y/%m/%d","%Y%m%d","%d%m%Y"):
        try: return datetime.strptime(data_id, fmt).date()
        except Exception: continue
    m = re.search(r"(20\d{2}-\d{2}-\d{2})", data_id)
    if m:
        try: return datetime.strptime(m.group(1), "%Y-%m-%d").date()
        except Exception: return None
    return None

def parse_date_to_week(data_id: str):
    if not data_id: return ("","","")
    dt = dataid_to_date(data_id)
    if dt is None: return ("","",data_id)
    iso_year, iso_week, _ = dt.isocalendar()
    etiqueta = f"{iso_year}-W{iso_week:02d}"
    return (iso_year, iso_week, etiqueta)

def _normalizar_chave(k) -> str:
    """Normaliza um nome de coluna para comparação tolerante a acentos, espaços e maiúsculas.
    Alguns exports (ex.: JSON) já chegam com acentos/espaços removidos do próprio cabeçalho
    (ex.: 'Número de Identificação' vira 'nmerodeidentificao'); ao remover acentos e espaços
    dos dois lados da comparação, os dois formatos passam a bater."""
    if k is None:
        return ""
    s = str(k).strip().lower()
    return ''.join(ch for ch in s if ch.isascii() and ch.isalnum())

def _achatar_lista_json(obj):
    """Achata uma estrutura JSON que pode vir como lista aninhada (lista de listas) em uma
    lista plana de dicts (um dict por aluno)."""
    out = []
    if isinstance(obj, dict):
        out.append(obj)
    elif isinstance(obj, list):
        for item in obj:
            out.extend(_achatar_lista_json(item))
    return out

def load_classlist(path: str):
    if path is None or not os.path.exists(path): return OrderedDict()
    ext = os.path.splitext(path)[1].lower(); dados = []
    try:
        logging.info("Carregando lista de turma: %s", path)
        if ext in (".csv",".txt"):
            with open(path, 'r', encoding='utf-8-sig', newline='') as f:
                sample = f.read(4096); f.seek(0)
                delim = guess_delimiter(sample)
                logging.info("Detectado delimitador: '%s'", delim)
                rdr = csv.DictReader(f, delimiter=delim); dados = list(rdr)
        elif ext in (".xlsx",".xls"):
            if pd is None: raise RuntimeError("Pandas não disponível para ler Excel.")
            df = pd.read_excel(path, dtype=str); dados = df.to_dict(orient="records")
            logging.info("Arquivo Excel lido com %d linhas", len(dados))
        elif ext == ".json":
            with open(path, 'r', encoding='utf-8-sig') as f:
                bruto = json.load(f)
            dados = _achatar_lista_json(bruto)
            logging.info("Arquivo JSON lido com %d linhas", len(dados))
        else:
            raise RuntimeError("Formato de lista não suportado: %s" % ext)

        # Debug: mostrar primeiras linhas
        logging.info("Primeiras 3 linhas do arquivo:")
        for i, row in enumerate(dados[:3]):
            logging.info("  Linha %d: %s", i+1, dict(row))

        def _valor_ou_vazio(v):
            # Células vazias em planilhas Excel viram NaN (float) no pandas mesmo com dtype=str;
            # sem esse tratamento, str(NaN) gera o texto literal "nan" nos relatórios.
            if v is None:
                return ""
            if pd is not None:
                try:
                    if pd.isna(v):
                        return ""
                except (TypeError, ValueError):
                    pass
            return v

        out = OrderedDict()
        for row in dados:
            keys = {_normalizar_chave(k): _valor_ou_vazio(row[k]) for k in row.keys() if k}
            mat = None
            for k in ("matrícula","matricula","id","registro","número de identificação","numero de identificacao"):
                kn = _normalizar_chave(k)
                if kn in keys and keys[kn]:
                    mat = str(keys[kn]).strip()
                    logging.info("Matrícula encontrada: %s (coluna: %s)", mat, k)
                    break

            # Prioriza combinar Nome + Sobrenome (colunas separadas) para obter o nome completo;
            # só usa uma coluna única (nome/aluno/estudante) quando não há Nome+Sobrenome.
            nome = ""
            nome_parts = []
            if keys.get(_normalizar_chave('nome')):
                nome_parts.append(str(keys[_normalizar_chave('nome')]).strip())
            if keys.get(_normalizar_chave('sobrenome')):
                nome_parts.append(str(keys[_normalizar_chave('sobrenome')]).strip())
            if nome_parts:
                nome = ' '.join(nome_parts)
            if not nome:
                for k in ("nome","aluno","estudante"):
                    kn = _normalizar_chave(k)
                    if kn in keys and keys[kn]:
                        nome = str(keys[kn]).strip()
                        break

            turma = ""
            for k in ("turma","classe","disciplina","curso","grupos","grupo"):
                kn = _normalizar_chave(k)
                if kn in keys and keys[kn]:
                    turma = str(keys[kn]).strip()
                    logging.info("Turma encontrada: %s (coluna: %s) para %s", turma, k, mat)
                    break

            if mat:
                # A matrícula normalizada (só dígitos) é a identidade do aluno em todo o
                # sistema, para bater com a mesma normalização aplicada ao ler os logs.
                mat_norm = normalize_matricula(mat) or mat
                out[mat_norm] = {
                    'nome': nome,
                    'turma': turma
                }
        logging.info("Lista de turma carregada: %d alunos", len(out)); return out
    except Exception as e:
        logging.error("Erro ao ler lista de turma '%s': %s", path, e); return OrderedDict()

# núcleo
class CompiladorFaltasCore:
    def __init__(self, pasta_arquivos: str, limiar_min: float = 45.0,
                 regex_data: str | None = None, lista_turma_path: str | None = None,
                 turma_padrao: str = "", regex_turma: str | None = None,
                 inicio=None, fim=None):
        self.pasta_arquivos = pasta_arquivos
        self.limiar = float(limiar_min)
        self.regex_data = regex_data
        self.lista_turma = load_classlist(lista_turma_path) if lista_turma_path else OrderedDict()
        self.turma_padrao = turma_padrao
        self.regex_turma = regex_turma
        self.inicio = inicio
        self.fim = fim

        self.dados_presenca = defaultdict(list)
        self.dados_permanencia = []
        self.datas_processadas = set()
        self.semanas_processadas = set()

    def _dados_roster(self, matricula: str):
        """Retorna (nome, turma) da lista de turma para a matrícula (já normalizada, só dígitos)."""
        if not self.lista_turma:
            return "", ""
        dados = self.lista_turma.get(matricula)
        if isinstance(dados, dict):
            return dados.get('nome', ''), dados.get('turma', '')
        if dados:
            return str(dados), ""
        return "", ""

    def _dentro_intervalo(self, data_id: str) -> bool:
        if self.inicio is None and self.fim is None:
            return True
        dt = dataid_to_date(data_id)
        if dt is None:
            logging.warning("Não foi possível inferir data para filtrar: '%s' (incluído mesmo assim).", data_id)
            return True
        if self.inicio and dt < self.inicio:
            return False
        if self.fim and dt > self.fim:
            return False
        return True

    def ler_arquivos(self):
        arquivos = sorted(glob.glob(os.path.join(self.pasta_arquivos, "*.txt")) +
                          glob.glob(os.path.join(self.pasta_arquivos, "*.csv")))
        if not arquivos:
            logging.warning("Nenhum arquivo .txt/.csv encontrado em: %s", self.pasta_arquivos); return
        logging.info("Encontrados %d arquivos para processar.", len(arquivos))
        for arq in arquivos:
            self._processar_arquivo(arq)

    def _processar_arquivo(self, path: str):
        nome = os.path.basename(path)
        data_id = try_parse_date_from_filename(nome, self.regex_data)
        if not self._dentro_intervalo(data_id):
            logging.info("Ignorando por fora do intervalo: %s", nome)
            return
        turma_from_name = self._try_parse_turma_from_filename(nome)
        for row in read_text_or_csv(path):
            if row is None: continue
            self._processar_linha(row, data_id, turma_from_name)

    def _try_parse_turma_from_filename(self, filename: str) -> str:
        base = os.path.splitext(os.path.basename(filename))[0]
        if self.regex_turma:
            m = re.search(self.regex_turma, base)
            if m: return m.group(1) if m.groups() else m.group(0)
        return ""

    def _processar_linha(self, linha: dict, data_id: str, turma_from_name: str):
        try:
            logging.debug("DEBUG _processar_linha: Iniciando processamento da linha: %s", linha)
            
            matricula_bruta = None
            for key in ('Matrícula','Matricula','matrícula','matricula','ID','id','Registro','registro'):
                if key in linha and linha[key]: matricula_bruta = str(linha[key]).strip(); break
            if not matricula_bruta: return
            # A identidade do aluno é sempre a matrícula normalizada (só dígitos): assim,
            # variações de formatação entre o log e a lista de turma (prefixo 'ES', zeros à
            # esquerda, espaços) nunca separam o mesmo aluno em registros diferentes.
            matricula = normalize_matricula(matricula_bruta) or matricula_bruta
            logging.debug("DEBUG _processar_linha: Matrícula encontrada: %s (bruta: %s)", matricula, matricula_bruta)

            nome = ""
            for key in ('Nome','nome','Aluno','aluno','Estudante','estudante'):
                if key in linha and linha[key]: nome = str(linha[key]).strip(); break
            logging.debug("DEBUG _processar_linha: Nome encontrado: %s", nome)

            turma = ""
            for key in ('Turma','turma','Classe','classe','Disciplina','disciplina','Grupos','grupos','Grupo','grupo'):
                if key in linha and linha[key]: turma = str(linha[key]).strip(); break
            logging.debug("DEBUG _processar_linha: Turma encontrada diretamente na linha: %s", turma)

            # A lista de turma é a referência mais confiável para o nome (evita nomes
            # truncados/abreviados ou 'null' vindos do leitor de crachá): quando a matrícula
            # está cadastrada lá, o nome do cadastro tem prioridade sobre o nome lido do log.
            nome_roster, turma_roster = self._dados_roster(matricula)
            if nome_roster:
                nome = nome_roster
                logging.debug("DEBUG _processar_linha: Nome obtido da lista de turma: %s", nome)
            if not turma:
                turma = turma_roster
                logging.debug("DEBUG _processar_linha: Turma obtida da lista de turma: %s", turma)

            # Se ainda não tem turma, usa turma do nome do arquivo ou padrão
            if not turma:
                turma = turma_from_name or self.turma_padrao or ""
                logging.debug("DEBUG _processar_linha: Usando turma padrão/arquivo: %s", turma)
            
            # Log para debug - pode remover depois
            if not turma:
                logging.debug("Turma vazia para matrícula %s. Colunas disponíveis: %s", matricula, list(linha.keys()))

            permanencia_str = None
            for key in ('Permanencia','Permanência','permanencia','permanência','Tempo','tempo','Permanência (min)','Permanencia (min)'):
                if key in linha:
                    permanencia_str = linha[key]
                    break
            if permanencia_str is None or str(permanencia_str).strip() == "": return
            try:
                permanencia = float(str(permanencia_str).replace(',', '.'))
            except Exception:
                m = re.search(r"[\d,.]+", str(permanencia_str)); permanencia = float(m.group(0).replace(',', '.')) if m else 0.0

            entrada = ""
            for key in ('Entrada','entrada','Hora','hora','CheckIn','checkin','Início','inicio','Inicio'):
                if key in linha and linha[key]: entrada = str(linha[key]).strip(); break

            saida = ""
            for key in ('Saída','saida','Saida','CheckOut','checkout','Fim','fim','Término','termino','Termino'):
                if key in linha and linha[key]: saida = str(linha[key]).strip(); break

            ano_iso, semana_iso, etiqueta = parse_date_to_week(data_id)
            if data_id: self.datas_processadas.add(data_id)
            if etiqueta: self.semanas_processadas.add(etiqueta)

            if permanencia > 0:
                rec = {
                    'matricula': matricula,
                    'nome': nome,
                    'data': data_id,
                    'entrada': entrada,
                    'saida': saida,
                    'tempo_permanencia': permanencia,
                    'turma': turma,
                    'ano_iso': ano_iso,
                    'semana_iso': semana_iso,
                    'etiqueta_semana': etiqueta
                }
                logging.debug("DEBUG _processar_linha: Record criado: %s", rec)
                self.dados_permanencia.append(rec)
                if permanencia >= self.limiar:
                    presenca_rec = {'data': data_id,'nome': nome,'turma': turma,
                                   'tempo_permanencia': permanencia,'presente': True}
                    logging.debug("DEBUG _processar_linha: Record de presença criado: %s", presenca_rec)
                    self.dados_presenca[matricula].append(presenca_rec)
        except Exception as e:
            logging.warning("Erro ao processar linha: %s | Erro: %s", linha, e)

    def _gerar_resumo_presencas(self, wb):
        ws = wb.create_sheet("Resumo de Presenças")
        ws.append([
            "Matrícula",
            "Nome",
            "Turma",
            "Número de Presenças (semanas, ≥ {} min no período)".format(self.limiar),
            "Semanas sem presença (0 dias)"
        ])
        todas_as_semanas = set(self.semanas_processadas)
        # União de quem teve presença registrada com toda a lista de turma, para que alunos
        # 100% ausentes (nenhum registro em nenhum arquivo) também apareçam no relatório.
        todas_matriculas = sorted(set(self.dados_presenca.keys()) | set(self.lista_turma.keys()))
        for matricula in todas_matriculas:
            presencas = self.dados_presenca.get(matricula, [])
            nome = ""
            for p in presencas:
                nome = melhor_nome(nome, p.get('nome',''))
            turma = presencas[0].get('turma',"") if presencas else ""
            semanas_com_presenca = set()
            for p in presencas:
                etiqueta_semana = parse_date_to_week(p.get('data', ''))[2]
                if etiqueta_semana:
                    semanas_com_presenca.add(etiqueta_semana)
            # Limita a no máximo 1 presença por semana, mesmo que haja mais de um dia
            # de aula qualificado (≥45min no período) na mesma semana.
            num = len(semanas_com_presenca)
            semanas_sem_presenca = max(len(todas_as_semanas) - len(semanas_com_presenca), 0)

            # Se não tem nome/turma, busca na lista de referência
            if not nome or not turma:
                nome_roster, turma_roster = self._dados_roster(matricula)
                if not nome: nome = nome_roster
                if not turma: turma = turma_roster

            ws.append([matricula_to_number(matricula), nome, turma, num, semanas_sem_presenca])
        format_header(ws, 1); autofit_columns(ws); _wb_finalize_sheet(ws, header_row=1); return ws

    def _gerar_detalhamento(self, wb):
        ws = wb.create_sheet("Detalhamento de Permanência")
        ws.append(["Matrícula","Nome","Turma","Data","Ano ISO","Semana ISO","Semana (ISO-YYYY-Www)","Entrada","Saída","Tempo de Permanência (min)"])
        for reg in sorted(self.dados_permanencia, key=lambda x: (x['turma'], x['matricula'], str(x['data']))):
            ws.append([matricula_to_number(reg['matricula']), reg['nome'], reg.get('turma',''), reg['data'], reg.get('ano_iso',''), reg.get('semana_iso',''),
                       reg.get('etiqueta_semana',''), reg.get('entrada',''), reg.get('saida',''), round(reg['tempo_permanencia'],2)])
        format_header(ws, 1)
        for col in (4,5,6,7,8,10):
            for r in range(2, ws.max_row+1): ws.cell(row=r, column=col).alignment = Alignment(horizontal="center")
        autofit_columns(ws); _wb_finalize_sheet(ws, header_row=1); return ws

    def _gerar_mapa_presencas(self, wb):
        logging.debug("DEBUG _gerar_mapa_presencas: Iniciando geração do mapa de presenças")
        datas = sorted(self.datas_processadas)
        # Une quem teve presença/permanência registrada com toda a lista de turma, para que
        # alunos 100% ausentes (nenhum registro em nenhum arquivo) também apareçam no mapa.
        alunos = sorted(set(list(self.dados_presenca.keys()) +
                             [d['matricula'] for d in self.dados_permanencia] +
                             list(self.lista_turma.keys())))
        logging.debug("DEBUG _gerar_mapa_presencas: %d alunos encontrados: %s", len(alunos), alunos[:5])

        pres_set = set(); nome_por_mat = {}; turma_por_mat = {}

        # Coletar nomes e turmas dos dados processados
        for mat, entradas in self.dados_presenca.items():
            for e in entradas:
                pres_set.add((mat, e['data']))
                if e.get('turma'):
                    turma_por_mat[mat] = e['turma']
                    logging.debug("DEBUG _gerar_mapa_presencas: Turma obtida de dados_presenca para %s: %s", mat, e['turma'])
                if e.get('nome'):
                    nome_por_mat[mat] = melhor_nome(nome_por_mat.get(mat, ''), e['nome'])
        for r in self.dados_permanencia:
            if r.get('nome'):
                nome_por_mat[r['matricula']] = melhor_nome(nome_por_mat.get(r['matricula'], ''), r['nome'])
            if r.get('turma') and r['matricula'] not in turma_por_mat:
                turma_por_mat[r['matricula']] = r['turma']
                logging.debug("DEBUG _gerar_mapa_presencas: Turma obtida de dados_permanencia para %s: %s", r['matricula'], r['turma'])

        logging.debug("DEBUG _gerar_mapa_presencas: Turmas coletadas até agora: %s", turma_por_mat)

        # Completar dados faltantes (inclusive alunos sem nenhum registro) consultando a lista de turma
        for mat in alunos:
            if not nome_por_mat.get(mat) or not turma_por_mat.get(mat):
                nome_roster, turma_roster = self._dados_roster(mat)
                if not nome_por_mat.get(mat) and nome_roster:
                    nome_por_mat[mat] = nome_roster
                    logging.debug("DEBUG _gerar_mapa_presencas: Nome obtido da lista de turma para %s: %s", mat, nome_roster)
                if not turma_por_mat.get(mat) and turma_roster:
                    turma_por_mat[mat] = turma_roster
                    logging.debug("DEBUG _gerar_mapa_presencas: Turma obtida da lista de turma para %s: %s", mat, turma_roster)

        logging.debug("DEBUG _gerar_mapa_presencas: Turmas finais: %s", turma_por_mat)
        
        ws = wb.create_sheet("Mapa de Presenças")
        header = ["Matrícula","Nome","Turma"] + datas + ["Total Presenças","Total Faltas"]; ws.append(header)
        data_para_semana = {}
        for d in datas:
            data_para_semana[d] = parse_date_to_week(d)[2]
        total_semanas_processadas = len(set([s for s in data_para_semana.values() if s]))
        for mat in alunos:
            nome = nome_por_mat.get(mat, ""); turma = turma_por_mat.get(mat, "")
            logging.debug("DEBUG _gerar_mapa_presencas: Escrevendo linha para matrícula %s - Nome: %s, Turma: %s", mat, nome, turma)
            linha = [matricula_to_number(mat), nome, turma]
            semanas_com_presenca = set()
            for d in datas:
                presenca = 'P' if (mat, d) in pres_set else 'F'
                if presenca == 'P':
                    etiqueta_semana = data_para_semana.get(d, '')
                    if etiqueta_semana:
                        semanas_com_presenca.add(etiqueta_semana)
                linha.append(presenca)
            # Total Presenças/Faltas são por semana (no máx. 1 presença por semana),
            # mesmo que haja mais de um dia de aula qualificado na mesma semana.
            pres_count = len(semanas_com_presenca)
            faltas = max(total_semanas_processadas - pres_count, 0)
            linha += [pres_count, faltas]
            ws.append(linha)
        format_header(ws, 1)
        for col_idx in range(4, 4 + len(datas) + 2):
            for row_idx in range(2, ws.max_row + 1): ws.cell(row=row_idx, column=col_idx).alignment = Alignment(horizontal="center")
        autofit_columns(ws); _wb_finalize_sheet(ws, header_row=1); return ws

    def _gerar_datas(self, wb):
        ws = wb.create_sheet("Datas Processadas"); ws.append(["#","Identificador de Data/Arquivo"])
        for i, d in enumerate(sorted(self.datas_processadas), start=1): ws.append([i, d])
        format_header(ws, 1); autofit_columns(ws); _wb_finalize_sheet(ws, header_row=1); return ws

    def _gerar_pivot_semanal(self, wb):
        semanas = sorted([r['etiqueta_semana'] for r in self.dados_permanencia if r.get('etiqueta_semana')])
        semanas = sorted(list(set(semanas)))
        soma = defaultdict(lambda: defaultdict(float)); nomes = {}
        for r in self.dados_permanencia:
            sem = r.get('etiqueta_semana','');
            if not sem: continue
            # Chave por turma+matrícula (sem o nome): a matrícula é a identidade do aluno,
            # então variações de nome entre registros (nome completo x só primeiro nome,
            # ou 'null') não podem separar o mesmo aluno em linhas diferentes.
            key = (r.get('turma',''), r['matricula'])
            soma[key][sem] += float(r.get('tempo_permanencia', 0.0))
            nomes[key] = melhor_nome(nomes.get(key, ''), r.get('nome',''))
        ws = wb.create_sheet("Permanência por Semana")
        header = ["Turma","Matrícula","Nome"] + semanas + ["Total (min)"]; ws.append(header)
        for key in sorted(soma.keys(), key=lambda x: (x[0], x[1])):
            turma, mat = key; nome = nomes.get(key, ''); linha = [turma, matricula_to_number(mat), nome]; total = 0.0
            for s in semanas:
                val = round(soma[key].get(s, 0.0), 2); total += val; linha.append(val)
            linha.append(round(total,2)); ws.append(linha)
        format_header(ws, 1)
        for col_idx in range(4, 4 + len(semanas) + 1):
            for row_idx in range(2, ws.max_row + 1): ws.cell(row=row_idx, column=col_idx).alignment = Alignment(horizontal="center")
        autofit_columns(ws); _wb_finalize_sheet(ws, header_row=1); return ws

    def export_csv_concatenado(self, desired_csv_path: str | None) -> str:
        headers = ["Matrícula","Nome","Turma","Data","Semana ISO","Entrada","Saída","Tempo de Permanência (min)"]
        rows = []
        for reg in sorted(self.dados_permanencia, key=lambda x: (x['turma'], x['matricula'], str(x['data']))):
            rows.append([
                matricula_to_number(reg['matricula']),
                reg.get('nome',''),
                reg.get('turma',''),
                reg.get('data',''),
                reg.get('semana_iso',''),
                reg.get('entrada',''),
                reg.get('saida',''),
                round(reg.get('tempo_permanencia',0.0),2)
            ])
        if desired_csv_path is None:
            desired_csv_path = os.path.join(self.pasta_arquivos, "relatorios_faltas_v5.csv")
        final_csv = safe_save_csv(rows, headers, desired_csv_path)
        logging.info("CSV salvo em: %s", final_csv)
        return final_csv

    def gerar_relatorios(self, arquivo_saida_xlsx: str | None = None, arquivo_saida_csv: str | None = None):
        if arquivo_saida_xlsx is None:
            arquivo_saida_xlsx = os.path.join(self.pasta_arquivos, "relatorios_faltas_v5.xlsx")
        
        # Verificar se há dados de turma disponíveis
        turmas_encontradas = any(r.get('turma') for r in self.dados_permanencia)
        if not turmas_encontradas and not self.lista_turma:
            logging.warning("⚠️  ATENÇÃO: Nenhuma informação de turma encontrada!")
            logging.warning("   Para incluir turmas nos relatórios:")
            logging.warning("   1. Carregue um arquivo com lista de alunos no campo 'Lista de turma'")
            logging.warning("   2. Ou defina uma 'Turma padrão'")
            logging.warning("   3. Ou use 'Regex Turma' para extrair do nome dos arquivos")
        elif not turmas_encontradas and self.lista_turma:
            logging.warning("⚠️  ATENÇÃO: Lista de turma carregada, mas as matrículas não correspondem!")
            logging.warning("   Verifique se as matrículas na lista coincidem com as dos arquivos de permanência")
        
        csv_final = self.export_csv_concatenado(arquivo_saida_csv)
        logging.info("Gerando XLSX: %s", arquivo_saida_xlsx)
        wb = Workbook()
        std = wb.active
        if std is not None:
            wb.remove(std)
        self._gerar_resumo_presencas(wb)
        self._gerar_detalhamento(wb)
        self._gerar_mapa_presencas(wb)
        self._gerar_datas(wb)
        self._gerar_pivot_semanal(wb)
        xlsx_final = safe_save_workbook(wb, arquivo_saida_xlsx)
        logging.info("✅ Excel salvo em: %s", xlsx_final)
        return xlsx_final, csv_final

    def processar(self, arquivo_saida_xlsx: str | None = None, arquivo_saida_csv: str | None = None):
        logging.info("=== COMPILADOR DE FALTAS v5.1 (Core) ===")
        self.ler_arquivos()
        logging.info("Datas: %d | Semanas: %d | Registros permanência: %d",
                     len(self.datas_processadas), len(self.semanas_processadas), len(self.dados_permanencia))
        return self.gerar_relatorios(arquivo_saida_xlsx, arquivo_saida_csv)

# ==================== GUI ====================
class AppGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Compilador de Faltas – v5.1 (GUI)")
        self.geometry("860x480")
        self.minsize(760, 380)
        self.resizable(True, True)
        
        # Variável para armazenar a pasta de saída
        self._pasta_saida = None
        self._max_gui_log_lines = 4
        self._gui_log_handler = None

        # Menu
        menubar = tk.Menu(self)
        menu_arq = tk.Menu(menubar, tearoff=0)
        menu_arq.add_command(label="Executar\tF5", command=self._run, accelerator="F5")
        menu_arq.add_separator()
        menu_arq.add_command(label="Sair", command=self.destroy)
        menubar.add_cascade(label="Arquivo", menu=menu_arq)
        self.config(menu=menubar)

        # Atalhos
        self.bind("<F5>", lambda e: self._run())
        self.bind("<Control-e>", lambda e: self._run())
        self.bind("<Control-Return>", lambda e: self._run())

        # Top execute button
        frame_topbtn = tk.Frame(self); frame_topbtn.pack(fill="x", padx=16, pady=(12, 0))
        tk.Button(frame_topbtn, text="Executar (F5)", command=self._run).pack(side="left")

        # Pasta de entrada
        tk.Label(self, text="Pasta com arquivos .txt/.csv de entrada:").pack(anchor="w", padx=16, pady=(12, 4))
        frame1 = tk.Frame(self); frame1.pack(fill="x", padx=16)
        self.var_pasta = tk.StringVar()
        tk.Entry(frame1, textvariable=self.var_pasta).pack(side="left", fill="x", expand=True)
        tk.Button(frame1, text="Procurar...", command=self._browse_pasta).pack(side="left", padx=(8,0))

        # Lista de turma (opcional)
        tk.Label(self, text="Lista de turma (CSV/XLSX/JSON) – opcional:").pack(anchor="w", padx=16, pady=(12, 4))
        frame2 = tk.Frame(self); frame2.pack(fill="x", padx=16)
        self.var_lista = tk.StringVar()
        tk.Entry(frame2, textvariable=self.var_lista).pack(side="left", fill="x", expand=True)
        tk.Button(frame2, text="Procurar...", command=self._browse_lista).pack(side="left", padx=(8,0))

        # Regex data / turma (opcionais)
        frame_regex = tk.Frame(self); frame_regex.pack(fill="x", padx=16, pady=(12, 4))
        tk.Label(frame_regex, text="Regex Data (opcional):").grid(row=0, column=0, sticky="w")
        self.var_regex_data = tk.StringVar()
        tk.Entry(frame_regex, textvariable=self.var_regex_data, width=28).grid(row=0, column=1, sticky="w", padx=(8,16))
        tk.Label(frame_regex, text="Regex Turma (opcional):").grid(row=0, column=2, sticky="w")
        self.var_regex_turma = tk.StringVar()
        tk.Entry(frame_regex, textvariable=self.var_regex_turma, width=24).grid(row=0, column=3, sticky="w", padx=(8,0))

        # Limiar e turma padrão
        frame_opts = tk.Frame(self); frame_opts.pack(fill="x", padx=16, pady=(8, 4))
        tk.Label(frame_opts, text="Limiar (min):").grid(row=0, column=0, sticky="w")
        self.var_limiar = tk.StringVar(value="45")
        tk.Entry(frame_opts, textvariable=self.var_limiar, width=8).grid(row=0, column=1, sticky="w", padx=(6,16))
        tk.Label(frame_opts, text="Turma padrão (se não houver):").grid(row=0, column=2, sticky="w")
        self.var_turma = tk.StringVar(value="")
        tk.Entry(frame_opts, textvariable=self.var_turma, width=18).grid(row=0, column=3, sticky="w", padx=(6,0))

        # Intervalo de datas
        frame_dates = tk.Frame(self); frame_dates.pack(fill="x", padx=16, pady=(8, 4))
        tk.Label(frame_dates, text="Data Início (dd/mm/aa):").grid(row=0, column=0, sticky="w")
        self.var_inicio = tk.StringVar(value="")
        tk.Entry(frame_dates, textvariable=self.var_inicio, width=12).grid(row=0, column=1, sticky="w", padx=(6,16))
        tk.Label(frame_dates, text="Data Fim (dd/mm/aa):").grid(row=0, column=2, sticky="w")
        self.var_fim = tk.StringVar(value="")
        tk.Entry(frame_dates, textvariable=self.var_fim, width=12).grid(row=0, column=3, sticky="w", padx=(6,0))
        tk.Label(frame_dates, text="(deixe em branco para não filtrar)").grid(row=0, column=4, sticky="w", padx=(12,0))

        # Saída (arquivos)
        tk.Label(self, text="Salvar XLSX como:").pack(anchor="w", padx=16, pady=(12, 4))
        frame3 = tk.Frame(self); frame3.pack(fill="x", padx=16)
        self.var_saida_xlsx = tk.StringVar(value="")
        tk.Entry(frame3, textvariable=self.var_saida_xlsx).pack(side="left", fill="x", expand=True)
        tk.Button(frame3, text="Escolher...", command=self._browse_saida_xlsx).pack(side="left", padx=(8,0))

        tk.Label(self, text="Salvar CSV concatenado como:").pack(anchor="w", padx=16, pady=(12, 4))
        frame4 = tk.Frame(self); frame4.pack(fill="x", padx=16)
        self.var_saida_csv = tk.StringVar(value="")
        tk.Entry(frame4, textvariable=self.var_saida_csv).pack(side="left", fill="x", expand=True)
        tk.Button(frame4, text="Escolher...", command=self._browse_saida_csv).pack(side="left", padx=(8,0))

        # Painel curto de debug (últimas 4 linhas)
        tk.Label(self, text="Debug (últimas linhas):").pack(anchor="w", padx=16, pady=(12, 4))
        frame_log = tk.Frame(self); frame_log.pack(fill="x", padx=16)
        self.txt_debug = tk.Text(frame_log, height=4, wrap="none", state="disabled")
        self.txt_debug.pack(side="left", fill="x", expand=True)
        self._attach_gui_log_handler()

        # Botões de baixo
        frame_btn = tk.Frame(self); frame_btn.pack(fill="x", padx=16, pady=16)
        tk.Button(frame_btn, text="Executar (F5)", command=self._run).pack(side="left")
        tk.Button(frame_btn, text="Sair", command=self.destroy).pack(side="right")

    def _append_debug_log(self, msg: str):
        if not hasattr(self, "txt_debug"):
            return
        try:
            self.txt_debug.configure(state="normal")
            self.txt_debug.insert("end", msg + "\n")
            linhas = int(self.txt_debug.index("end-1c").split(".")[0])
            excesso = linhas - self._max_gui_log_lines
            if excesso > 0:
                self.txt_debug.delete("1.0", f"{excesso + 1}.0")
            self.txt_debug.see("end")
            self.txt_debug.configure(state="disabled")
            self.update_idletasks()
        except Exception:
            pass

    def _attach_gui_log_handler(self):
        root_logger = logging.getLogger()
        if self._gui_log_handler is not None and self._gui_log_handler in root_logger.handlers:
            return
        if self._gui_log_handler is None:
            self._gui_log_handler = TkLogHandler(self._append_debug_log)
            self._gui_log_handler.setLevel(logging.DEBUG)
            self._gui_log_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        root_logger.addHandler(self._gui_log_handler)

    def _browse_pasta(self):
        folder = filedialog.askdirectory(title="Selecione a pasta com os .txt/.csv")
        if folder: 
            self.var_pasta.set(folder)
            # Atualiza automaticamente os caminhos de saída para a mesma pasta
            self._update_output_paths(folder)
    
    def _update_output_paths(self, folder):
        """Atualiza os caminhos de saída para usar a pasta selecionada"""
        if folder:
            # Mostra apenas o nome do arquivo, sem o caminho
            self.var_saida_xlsx.set("relatorios_faltas_v5.xlsx")
            self.var_saida_csv.set("relatorios_faltas_v5.csv")
            # Armazena a pasta internamente para uso posterior
            self._pasta_saida = folder

    def _browse_lista(self):
        fpath = filedialog.askopenfilename(title="Selecione a lista de turma (CSV/XLSX/JSON)",
                                           filetypes=[("Planilhas e JSON", "*.csv;*.xlsx;*.xls;*.json"), ("Todos", "*.*")])
        if fpath: self.var_lista.set(fpath)

    def _browse_saida_xlsx(self):
        pasta_entrada = self.var_pasta.get().strip()
        initial_dir = pasta_entrada if pasta_entrada and os.path.exists(pasta_entrada) else None
        filename = self.var_saida_xlsx.get() or "relatorios_faltas_v5.xlsx"
        
        fpath = filedialog.asksaveasfilename(
            title="Salvar relatório XLSX como",
            defaultextension=".xlsx",
            filetypes=[("Excel", "*.xlsx")],
            initialfile=os.path.basename(filename),
            initialdir=initial_dir
        )
        if fpath: self.var_saida_xlsx.set(fpath)

    def _browse_saida_csv(self):
        pasta_entrada = self.var_pasta.get().strip()
        initial_dir = pasta_entrada if pasta_entrada and os.path.exists(pasta_entrada) else None
        filename = self.var_saida_csv.get() or "relatorios_faltas_v5.csv"
        
        fpath = filedialog.asksaveasfilename(
            title="Salvar CSV concatenado como",
            defaultextension=".csv",
            filetypes=[("CSV", "*.csv")],
            initialfile=os.path.basename(filename),
            initialdir=initial_dir
        )
        if fpath: self.var_saida_csv.set(fpath)

    def _run(self):
        pasta = self.var_pasta.get().strip()
        if not pasta or not os.path.exists(pasta):
            messagebox.showerror("Erro", "Informe uma pasta válida de entrada.")
            return
        try:
            limiar = float(self.var_limiar.get().strip() or "45")
        except Exception:
            messagebox.showerror("Erro", "Limiar inválido. Use um número (ex.: 45).")
            return

        lista = self.var_lista.get().strip() or None
        regex_data = self.var_regex_data.get().strip() or None
        regex_turma = self.var_regex_turma.get().strip() or None
        turma_padrao = self.var_turma.get().strip() or ""

        inicio_txt = getattr(self, "var_inicio").get().strip()
        fim_txt = getattr(self, "var_fim").get().strip()
        inicio = parse_user_date(inicio_txt) if inicio_txt else None
        fim = parse_user_date(fim_txt) if fim_txt else None
        if inicio_txt and inicio is None:
            messagebox.showerror("Erro", "Data Início inválida. Use dd/mm/aa ou dd/mm/aaaa.")
            return
        if fim_txt and fim is None:
            messagebox.showerror("Erro", "Data Fim inválida. Use dd/mm/aa ou dd/mm/aaaa.")
            return
        if inicio and fim and inicio > fim:
            messagebox.showerror("Erro", "Data Início não pode ser maior que Data Fim.")
            return

        saida_xlsx = self.var_saida_xlsx.get().strip()
        saida_csv = self.var_saida_csv.get().strip()
        
        # Se os campos de saída estiverem vazios, usa a pasta de entrada como padrão
        if not saida_xlsx:
            saida_xlsx = "relatorios_faltas_v5.xlsx"
        if not saida_csv:
            saida_csv = "relatorios_faltas_v5.csv"
            
        # Se os caminhos não são absolutos, usa a pasta de entrada ou a pasta armazenada
        if not os.path.isabs(saida_xlsx):
            pasta_saida = self._pasta_saida if hasattr(self, '_pasta_saida') and self._pasta_saida else pasta
            saida_xlsx = os.path.join(pasta_saida, saida_xlsx)
        if not os.path.isabs(saida_csv):
            pasta_saida = self._pasta_saida if hasattr(self, '_pasta_saida') and self._pasta_saida else pasta
            saida_csv = os.path.join(pasta_saida, saida_csv)

        setup_logging(pasta)
        self._attach_gui_log_handler()
        self._append_debug_log("[INFO] Execução iniciada...")

        comp = CompiladorFaltasCore(
            pasta_arquivos=pasta,
            limiar_min=limiar,
            regex_data=regex_data,
            lista_turma_path=lista,
            turma_padrao=turma_padrao,
            regex_turma=regex_turma,
            inicio=inicio,
            fim=fim
        )

        try:
            xlsx_path, csv_path = comp.processar(arquivo_saida_xlsx=saida_xlsx, arquivo_saida_csv=saida_csv)
            messagebox.showinfo("Concluído", f"Relatórios gerados!\nXLSX:\n{xlsx_path}\nCSV:\n{csv_path}")
        except Exception as e:
            logging.exception("Falha ao processar: %s", e)
            messagebox.showerror("Erro", f"Ocorreu um erro ao gerar o relatório:\n{e}")

def main():
    app = AppGUI()
    app.mainloop()

if __name__ == "__main__":
    main()
