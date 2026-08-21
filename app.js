/**
 * @file Script para controle de acesso e permanência em sala com gerenciamento de sessões.
 * @author Manus AI / Gemini / ChatGPT
 * @version 1.0.6
 */

// Classe para gerenciar os elementos do DOM
class DOMManager {
  constructor() {
    this.elements = {
      barInput: document.getElementById("matricula"),
      barTableBody: document.getElementById("real-time-table-body"),
      situacaoDisplay: document.getElementById("situacao-display"),
      permanenciaDisplay: document.getElementById("permanencia-display"),
      nomeDisplay: document.getElementById("nome-display"),
      entradaDisplay: document.getElementById("entrada-display"),
      buttonStart: document.getElementById("start-data-button"),
      buttonSave: document.getElementById("savelistButton"),
      espacoDisplay: document.getElementById("espaco-display"),
      lineInput: document.getElementById("remove-line"),
      buttonSaveSummary: document.getElementById("save-summary-button"),
      sessionControlButton: document.getElementById("session-control-button"), // Botão único de sessão
      sessionInfoDisplay: document.getElementById("session-info-display"), // Display para informações da sessão
      minTimeDisplay: document.getElementById("min-time-display"), // Display do tempo mínimo
      clockDisplay: document.getElementById("clock-display"), // Display do relógio HH:MM
    };

    for (const key in this.elements) {
      if (this.elements[key] === null) {
        console.warn(`Elemento DOM com ID '${key}' não encontrado. Algumas funcionalidades podem estar desabilitadas.`);
      }
    }
  }

  get(key) {
    return this.elements[key];
  }

  focusBarInput() {
    if (this.elements.barInput) {
      this.elements.barInput.focus();
    }
  }

  updateDisplay(elementKey, value, color = null, fontSize = null, textAlign = null) {
    const element = this.get(elementKey);
    if (element) {
      element.innerHTML = value;
      if (color) element.style.color = color;
      if (fontSize) element.style.fontSize = fontSize;
      if (textAlign) element.style.textAlign = textAlign;
    }
  }

  clearTable() {
    if (this.elements.barTableBody) {
      this.elements.barTableBody.innerHTML = "";
    }
  }

  clearDisplays() {
    this.updateDisplay("permanenciaDisplay", "Tempo de Permanência:");
    this.updateDisplay("entradaDisplay", "Entrada:");
    this.updateDisplay("nomeDisplay", "Nome:");
    this.updateDisplay("situacaoDisplay", "");
    this.updateDisplay("espacoDisplay", "0");
  }
}

// Classe para gerenciar os dados dos alunos e eventos, incluindo sessões
class StudentDataManager {
  constructor() {
    this.storageKeys = {
      legacy: "studentData",
      meta: "studentData_meta",
      studentNames: "studentData_studentNames",
      sessionPrefix: "studentData_session_",
    };
    this.studentNames = new Map(); // Map<matricula, nomeCompleto>
    this.pendingAction = null; // Ação pendente para o próximo aluno
    this.specialCodes = new Map([
      ['900112', { action: 'cancelEntry', description: 'Entrada cancelada' }],    //entrada cancelada
      ['900260', { action: 'extendTime', description: 'Tempo estendido (+1 min)' }],//tempo estendido 45 min
      ['900150', { action: 'notStudied', description: 'Não estudou' }],
      ['900250', { action: 'newMinTime', description: 'Tempo mínimo ajustado' }],
      ['900300', { action: 'undoLast', description: 'Ação desfeita' }]
    ]);
    this.currentSession = { // Dados da sessão atual
      id: null,
      startTime: null,
      eventLog: [], // [{ id, matricula, nome, timestamp, tipo: 'entrada'/'saida', observacao }]
      activeStudents: new Map(), // Map<matricula, { entrada: timestamp, nome: string, horaEntrada: string, timestamp: number }>
      currentOccupancy: 0,
      nextEventId: 1,
    };
    this.archivedSessions = []; // [{ id, startTime, endTime, eventLog, summary }]
    this.minStayTime = 45; // Tempo mínimo de permanência em minutos
    this.logRetentionPeriod = 2 * 30 * 24 * 60 * 60 * 1000; // 2 meses em ms

    this._loadFromLocalStorage(); // Carrega dados ao inicializar
    this._cleanupOldSessions(); // Limpa sessões antigas

    // Se não houver sessão atual carregada, inicia uma nova
    if (!this.currentSession.id) {
      this.startNewSession(false); // Não arquiva nada na primeira inicialização
    }
  }

  _saveToLocalStorage() {
    try {
      localStorage.setItem(this.storageKeys.studentNames, JSON.stringify(Array.from(this.studentNames.entries())));

      if (this.currentSession.id) {
        this._saveSessionToLocalStorage(this.currentSession);
      }

      this.archivedSessions.forEach(session => this._saveSessionToLocalStorage(session));

      const meta = {
        currentSessionId: this.currentSession.id,
        archivedSessionIds: this.archivedSessions.map(session => session.id),
      };

      localStorage.setItem(this.storageKeys.meta, JSON.stringify(meta));
    } catch (e) {
      console.error("Erro ao salvar dados no localStorage:", e);
    }
  }

  _loadFromLocalStorage() {
    try {
      const metaRaw = localStorage.getItem(this.storageKeys.meta);

      if (!metaRaw) {
        this._migrateLegacyLocalStorage();
        return;
      }

      const meta = JSON.parse(metaRaw);
      const studentNamesRaw = localStorage.getItem(this.storageKeys.studentNames);

      this.studentNames = new Map(studentNamesRaw ? JSON.parse(studentNamesRaw) : []);
      this.archivedSessions = (meta.archivedSessionIds || [])
        .map(sessionId => this._loadSessionFromLocalStorage(sessionId))
        .filter(Boolean);

      if (meta.currentSessionId) {
        const currentSession = this._loadSessionFromLocalStorage(meta.currentSessionId);
        if (currentSession) {
          this.currentSession = currentSession;
        } else {
          console.log("Nenhuma sessão atual válida encontrada no localStorage.");
        }
      } else {
        console.log("Nenhum dado encontrado no localStorage.");
      }

      console.log("Dados carregados do localStorage.");
    } catch (e) {
      console.error("Erro ao carregar dados do localStorage:", e);
      this._clearManagedLocalStorage();
    }
  }

  _saveSessionToLocalStorage(session) {
    if (!session || !session.id) return;

    localStorage.setItem(
      this._getSessionStorageKey(session.id),
      JSON.stringify(this._serializeSession(session))
    );
  }

  _loadSessionFromLocalStorage(sessionId) {
    if (!sessionId) return null;

    const rawSession = localStorage.getItem(this._getSessionStorageKey(sessionId));
    if (!rawSession) return null;

    return this._deserializeSession(JSON.parse(rawSession));
  }

  _serializeSession(session) {
    return {
      ...session,
      activeStudents: Array.from((session.activeStudents || new Map()).entries()),
    };
  }

  _deserializeSession(sessionData) {
    const deserializedSession = {
      ...sessionData,
      eventLog: sessionData.eventLog || [],
      activeStudents: new Map(sessionData.activeStudents || []),
      currentOccupancy: sessionData.currentOccupancy || 0,
      nextEventId: sessionData.nextEventId || 1,
    };

    if (deserializedSession.eventLog.length > 0) {
      const maxId = Math.max(...deserializedSession.eventLog.map(event => event.id || 0));
      deserializedSession.nextEventId = Math.max(deserializedSession.nextEventId, maxId + 1);
    }

    return deserializedSession;
  }

  _getSessionStorageKey(sessionId) {
    return `${this.storageKeys.sessionPrefix}${sessionId}`;
  }

  _removeSessionFromLocalStorage(sessionId) {
    if (!sessionId) return;
    localStorage.removeItem(this._getSessionStorageKey(sessionId));
  }

  _migrateLegacyLocalStorage() {
    const legacyRaw = localStorage.getItem(this.storageKeys.legacy);
    if (!legacyRaw) {
      console.log("Nenhum dado encontrado no localStorage.");
      return;
    }

    const legacyData = JSON.parse(legacyRaw);
    this.studentNames = new Map(legacyData.studentNames || []);
    this.archivedSessions = (legacyData.archivedSessions || []).map(session => this._deserializeSession(session));

    if (legacyData.currentSession && legacyData.currentSession.id) {
      this.currentSession = this._deserializeSession(legacyData.currentSession);
    }

    this._saveToLocalStorage();
    localStorage.removeItem(this.storageKeys.legacy);
    console.log("Dados legados migrados para o novo formato por sessão.");
  }

  _clearManagedLocalStorage() {
    const metaRaw = localStorage.getItem(this.storageKeys.meta);

    if (metaRaw) {
      try {
        const meta = JSON.parse(metaRaw);
        (meta.archivedSessionIds || []).forEach(sessionId => this._removeSessionFromLocalStorage(sessionId));
        this._removeSessionFromLocalStorage(meta.currentSessionId);
      } catch (error) {
        console.error("Erro ao limpar sessões do localStorage:", error);
      }
    }

    localStorage.removeItem(this.storageKeys.meta);
    localStorage.removeItem(this.storageKeys.studentNames);
    localStorage.removeItem(this.storageKeys.legacy);
  }

  _cleanupOldSessions() {
    const now = new Date().getTime();
    const removedSessionIds = [];

    this.archivedSessions = this.archivedSessions.filter(session => {
      const sessionEndTime = session.endTime ? new Date(session.endTime).getTime() : new Date(session.startTime).getTime();
      const shouldKeep = (now - sessionEndTime) < this.logRetentionPeriod;
      if (!shouldKeep) {
        removedSessionIds.push(session.id);
      }
      return shouldKeep;
    });

    removedSessionIds.forEach(sessionId => this._removeSessionFromLocalStorage(sessionId));
    this._saveToLocalStorage();
    console.log("Sessões antigas limpas.");
  }

  startNewSession(archivePrevious = true) {
    if (archivePrevious && this.currentSession.id !== null) {
      this.endCurrentSession();
    }

    const now = new Date();
    this.currentSession = {
      id: `session_${now.getTime()}`,
      startTime: now.toISOString(),
      eventLog: [],
      activeStudents: new Map(),
      currentOccupancy: 0,
      nextEventId: 1,
    };
    this._saveToLocalStorage();
    console.log(`Nova sessão iniciada: ${this.currentSession.id}`);
  }

  endCurrentSession() {
    if (this.currentSession.id === null) return;

    const now = new Date();
    const sessionToArchive = {
      id: this.currentSession.id,
      startTime: this.currentSession.startTime,
      endTime: now.toISOString(),
      eventLog: [...this.currentSession.eventLog],
      summary: this._generateSessionSummary(this.currentSession.eventLog, this.currentSession.activeStudents, now.toISOString()),
    };
    this.archivedSessions.push(sessionToArchive);
    this.currentSession = {
      id: null,
      startTime: null,
      eventLog: [],
      activeStudents: new Map(),
      currentOccupancy: 0,
      nextEventId: 1,
    };

    this._cleanupOldSessions();
    this._saveToLocalStorage();
    console.log(`Sessão ${sessionToArchive.id} salva no localStorage e arquivada.`);
    console.log(`Sessão ${sessionToArchive.id} finalizada e arquivada.`);
  }

  _generateSessionSummary(eventLog, activeStudents, sessionEndTimeStr) {
    const summaryMap = new Map();

    eventLog.forEach(event => {
      if (!summaryMap.has(event.matricula)) {
        summaryMap.set(event.matricula, {
          nome: event.nome,
          primeiraEntrada: event.timestamp,
          ultimaSaida: event.timestamp,
          totalPermanencia: 0,
          entradas: [],
          saidas: []
        });
      }
      const studentSummary = summaryMap.get(event.matricula);

      if (event.timestamp < studentSummary.primeiraEntrada) {
        studentSummary.primeiraEntrada = event.timestamp;
      }
      if (event.timestamp > studentSummary.ultimaSaida) {
        studentSummary.ultimaSaida = event.timestamp;
      }

      if (event.tipo === "entrada") {
        studentSummary.entradas.push(event);
      } else if (event.tipo === "saida") {
        studentSummary.saidas.push(event);
      }
    });

    summaryMap.forEach(studentSummary => {
      let totalDuration = 0;
      let lastEntryTime = null;

      const allEvents = [...studentSummary.entradas, ...studentSummary.saidas].sort((a, b) => a.timestamp - b.timestamp);

      allEvents.forEach(event => {
        if (event.tipo === "entrada") {
          lastEntryTime = event.timestamp;
        } else if (event.tipo === "saida" && lastEntryTime !== null) {
          totalDuration += (event.timestamp - lastEntryTime);
          lastEntryTime = null;
        }
      });

      const lastEntryEventForStudent = studentSummary.entradas[studentSummary.entradas.length - 1];
      if (lastEntryEventForStudent && activeStudents.has(lastEntryEventForStudent.matricula)) {
        const activeEntry = activeStudents.get(lastEntryEventForStudent.matricula);
        const sessionEndTime = new Date(sessionEndTimeStr || new Date()).getTime();
        totalDuration += (sessionEndTime - activeEntry.timestamp);
      }
      studentSummary.totalPermanencia = totalDuration / (1000 * 60);
    });

    return Array.from(summaryMap.values()).map(s => ({
      matricula: s.entradas[0]?.matricula,
      nome: s.nome,
      primeiraEntrada: new Date(s.primeiraEntrada).toLocaleTimeString(),
      ultimaSaida: new Date(s.ultimaSaida).toLocaleTimeString(),
      permanenciaTotal: parseFloat(s.totalPermanencia.toFixed(2))
    }));
  }

  loadStudentNamesFromExcel(arrayBuffer) {
    try {
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Converte a planilha para JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (jsonData.length === 0) {
        console.warn("Arquivo Excel vazio ou sem dados.");
        return;
      }

      // Remove o cabeçalho (primeira linha)
      const dataRows = jsonData.slice(1);

      dataRows.forEach(row => {
        if (row.length >= 3) {
          const nomeCompleto = `${row[0] || ''} ${row[1] || ''}`.trim();
          const matricula = this._normalizeMatricula(row[2]);
          
          if (nomeCompleto && matricula) {
            this.studentNames.set(matricula, nomeCompleto);
          }
        }
      });
      
      console.log("Nomes de alunos carregados do arquivo Excel:", this.studentNames.size);
      this._saveToLocalStorage();
    } catch (error) {
      console.error("Erro ao processar arquivo Excel:", error);
    }
  }

  loadStudentNamesFromJson(jsonContent) {
    try {
      const parsedData = typeof jsonContent === "string" ? JSON.parse(jsonContent) : jsonContent;
      const flatData = this._flattenArray(parsedData);

      if (!Array.isArray(flatData) || flatData.length === 0) {
        console.warn("Arquivo JSON vazio ou sem dados válidos.");
        return;
      }

      let loadedCount = 0;
      flatData.forEach(student => {
        if (!student || typeof student !== "object") return;

        const nome = String(student.nome || "").trim();
        const sobrenome = String(student.sobrenome || "").trim();
        const nomeCompleto = `${nome} ${sobrenome}`.trim();
        const matricula = this._normalizeMatricula(student.nmerodeidentificao || student.numeroIdentificacao || student.matricula);

        if (nomeCompleto && matricula) {
          this.studentNames.set(matricula, nomeCompleto);
          loadedCount++;
        }
      });

      if (loadedCount === 0) {
        console.warn("Nenhum aluno válido encontrado no arquivo JSON.");
        return;
      }

      console.log("Nomes de alunos carregados do arquivo JSON:", loadedCount);
      this._saveToLocalStorage();
    } catch (error) {
      console.error("Erro ao processar arquivo JSON:", error);
    }
  }

  _flattenArray(value) {
    if (!Array.isArray(value)) return [value];
    return value.flat(Infinity);
  }

  _normalizeMatricula(value) {
    let matricula = String(value || "").trim();
    if (!matricula) return "";

    if (/^[A-Za-z]{2}/.test(matricula)) {
      matricula = matricula.substring(2);
    }

    matricula = matricula.replace(/^0+/, "") || "0";
    return matricula;
  }

  getStudentName(matricula) {
    return this.studentNames.get(matricula) || null;
  }

  handleSpecialCode(matricula) {
    const specialCode = this.specialCodes.get(matricula);
    if (!specialCode) return null;

    switch (specialCode.action) {
      case 'cancelEntry':
        this.pendingAction = { type: 'cancelEntry', description: 'Entrada cancelada' };
        return { status: 'Código', permanencia: 0, nome: 'Próxima entrada será cancelada', primeiroNome: 'Entrada:', horaEntrada: '', shouldUpdateOccupancy: false };
      
      case 'extendTime':
        this.pendingAction = { type: 'extendTime', description: 'Tempo estendido (+1 min)' };
        return { status: 'Código', permanencia: 0, nome: 'Próximo aluno terá tempo estendido', primeiroNome: 'OK_', horaEntrada: '', shouldUpdateOccupancy: false };
      
      case 'notStudied':
        this.pendingAction = { type: 'notStudied', description: 'Não estudou' };
        return { status: 'Código', permanencia: 0, nome: 'Próximo aluno: não estudou', primeiroNome: 'OK!', horaEntrada: '', shouldUpdateOccupancy: false };
      
      case 'newMinTime':
        this.pendingAction = { type: 'newMinTime', description: 'Novo tempo mínimo' };
        return { status: 'Código', permanencia: 0, nome: 'Próximo aluno: novo tempo mínimo', primeiroNome: 'NOVO TEMPO', horaEntrada: '', shouldUpdateOccupancy: false };
      
      case 'undoLast':
        return this.undoLastAction();
      
      default:
        return null;
    }
  }

  undoLastAction() {
    if (this.currentSession.eventLog.length === 0) {
      return { status: 'Erro', permanencia: 0, nome: 'Nenhuma ação para desfazer', primeiroNome: 'ERRO', horaEntrada: '', shouldUpdateOccupancy: false };
    }

    const lastEvent = this.currentSession.eventLog.pop();
    
    // Recalcula o estado dos estudantes ativos
    this.currentSession.currentOccupancy = 0;
    this.currentSession.activeStudents.clear();
    
    this.currentSession.eventLog.forEach(event => {
      if (event.tipo === 'entrada') {
        this.currentSession.activeStudents.set(event.matricula, {
          entrada: event.timestamp,
          nome: event.nome,
          horaEntrada: event.hora,
          timestamp: event.timestamp
        });
      } else if (event.tipo === 'saida') {
        this.currentSession.activeStudents.delete(event.matricula);
      }
    });
    
    this.currentSession.currentOccupancy = this.currentSession.activeStudents.size;
    this._saveToLocalStorage();
    
    return { status: 'Desfeito', permanencia: 0, nome: `Ação desfeita: ${lastEvent.nome}`, primeiroNome: 'DESFEITO', horaEntrada: '', shouldUpdateOccupancy: true };
  }
  registerEvent(matricula) {
    // Verifica se é um código especial
    if (this.specialCodes.has(matricula)) {
      return this.handleSpecialCode(matricula);
    }

    const now = new Date();
    const timestamp = now.getTime();
    const hora = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    const nomeCompleto = this.getStudentName(matricula);
    const primeiroNome = nomeCompleto ? nomeCompleto.split(" ")[0] : "Sem nome";

    let status;
    let permanencia = 0;
    let horaEntradaEvento = hora;
    let shouldUpdateOccupancy = true;
    let observacao = '';
    
    // Verifica se há ação pendente
    if (this.pendingAction) {
      observacao = this.pendingAction.description;
      
      // Para cancelEntry, registra normalmente mas marca como cancelada na observação
      if (this.pendingAction.type === 'cancelEntry') {
        observacao = 'Entrada cancelada';
        shouldUpdateOccupancy = false; // Não conta para ocupação
      }
      
      this.pendingAction = null; // Limpa a ação após usar
    }

    if (this.currentSession.activeStudents.has(matricula)) {
      status = "Saída";
      const entryEvent = this.currentSession.activeStudents.get(matricula);
      permanencia = (timestamp - entryEvent.timestamp) / (1000 * 60);
      horaEntradaEvento = entryEvent.horaEntrada;

      if (permanencia >= this.minStayTime) {
        this.currentSession.currentOccupancy--;
        this.currentSession.activeStudents.delete(matricula);
      } else {
        shouldUpdateOccupancy = false;
      }

      // Aplica regras especiais para permanência
      if (observacao === 'Tempo estendido (+1 min)') {
        permanencia = Math.max(permanencia, this.minStayTime + 1);
      } else if (observacao === 'Novo tempo mínimo') {
        // Para 'novo tempo mínimo', considera sempre válido
        if (permanencia < this.minStayTime) {
          shouldUpdateOccupancy = true;
          this.currentSession.currentOccupancy--;
          this.currentSession.activeStudents.delete(matricula);
        }
      }
      
      this.currentSession.eventLog.push({
        id: this.currentSession.nextEventId++,
        matricula,
        nome: nomeCompleto,
        timestamp,
        hora,
        tipo: "saida",
        permanencia: parseFloat(permanencia.toFixed(2)),
        entradaOriginal: entryEvent.horaEntrada,
        observacao
      });

    } else {
      status = "Entrada";
      this.currentSession.currentOccupancy++;
      this.currentSession.activeStudents.set(matricula, { entrada: timestamp, nome: nomeCompleto, horaEntrada: hora, timestamp: timestamp });

      this.currentSession.eventLog.push({
        id: this.currentSession.nextEventId++,
        matricula,
        nome: nomeCompleto,
        timestamp,
        hora,
        tipo: "entrada",
        permanencia: 0,
        observacao
      });
    }
    this._saveToLocalStorage();
    return { status, permanencia, nome: nomeCompleto, primeiroNome, horaEntrada: horaEntradaEvento, shouldUpdateOccupancy };
  }

  removeEventByMatricula(matriculaToRemove) {
    const initialEventLogLength = this.currentSession.eventLog.length;
    const initialActiveStudentsSize = this.currentSession.activeStudents.size;

    this.currentSession.eventLog = this.currentSession.eventLog.filter(event => event.matricula !== matriculaToRemove);

    this.currentSession.currentOccupancy = 0;
    this.currentSession.activeStudents.clear();
    const tempActiveStudents = new Map();

    this.currentSession.eventLog.forEach(event => {
      if (event.tipo === "entrada") {
        tempActiveStudents.set(event.matricula, event);
      } else if (event.tipo === "saida") {
        if (tempActiveStudents.has(event.matricula)) {
          tempActiveStudents.delete(event.matricula);
        }
      }
    });
    this.currentSession.currentOccupancy = tempActiveStudents.size;
    this.currentSession.activeStudents = tempActiveStudents;

    this._saveToLocalStorage();

    if (this.currentSession.eventLog.length < initialEventLogLength || this.currentSession.activeStudents.size < initialActiveStudentsSize) {
      console.log(`Todos os eventos para a matrícula ${matriculaToRemove} foram removidos e o estado foi recalculado.`);
      return true;
    } else {
      console.error(`Matrícula ${matriculaToRemove} não encontrada no log de eventos da sessão atual.`);
      return false;
    }
  }

  getRealTimeTableData() {
    const displayData = [];
    const tempActiveStudents = new Map(this.currentSession.activeStudents);

    this.currentSession.eventLog.forEach(event => {
      let permanenciaCalculada = event.permanencia;
      let situacaoDisplay = event.tipo === "entrada" ? "Entrada" : "Saída";

      if (event.tipo === "entrada" && tempActiveStudents.has(event.matricula) && tempActiveStudents.get(event.matricula).timestamp === event.timestamp) {
        permanenciaCalculada = (new Date().getTime() - event.timestamp) / (1000 * 60);
        situacaoDisplay = "Ativo";
      }

      displayData.push({
        id: event.id,
        Matricula: event.matricula,
        Nome: event.nome,
        Entrada: event.hora,
        Permanencia: parseFloat(permanenciaCalculada.toFixed(2)),
        Situacao: situacaoDisplay,
      });
    });

    displayData.sort((a, b) => b.id - a.id);

    return displayData;
  }

  saveEventLog(dataArray) {
    if (!dataArray || dataArray.length === 0) {
      console.warn("Nenhum dado para salvar no log de eventos da sessão atual.");
      return;
    }

    const headers = "ID,Matrícula,Nome,Timestamp,Hora,Tipo,Permanência (min),Entrada Original,Observação\n";
    const csvContent = dataArray.map(event => {
      return `${event.id},${event.matricula},"${event.nome}",${event.timestamp},${event.hora},${event.tipo},${event.permanencia || 0},${event.entradaOriginal || ""},"${event.observacao || ""}"`;
    }).join("\n");

    const fullCsvContent = headers + csvContent + `\n${new Date(this.currentSession.startTime).toLocaleDateString()}`;

    const now = new Date();
    const pad = n => n.toString().padStart(2, "0");
    const fileName = `log_eventos_sessao_${this.currentSession.id}_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.csv`;

    this._downloadFile(fullCsvContent, fileName, "text/csv");
  }

  saveSummaryLog(triggerDownload = false) {
    const summary = this._generateSessionSummary(this.currentSession.eventLog, this.currentSession.activeStudents, this.currentSession.endTime || new Date().toISOString());

    if (triggerDownload) {
      if (!summary || summary.length === 0) {
        console.warn("Nenhum dado para salvar no resumo de permanência da sessão atual.");
        return;
      }
      const headers = "Matrícula,Nome,Primeira Entrada,Última Saída,Permanência Total (min)\n";
      const csvContent = summary.map(s => {
        return `${s.matricula},"${s.nome}",${s.primeiraEntrada},${s.ultimaSaida},${s.permanenciaTotal}`;
      }).join("\n");

      const fullCsvContent = headers + csvContent + `\n${new Date(this.currentSession.startTime).toLocaleDateString()}`;

      const now = new Date();
      const pad = n => n.toString().padStart(2, "0");
      const fileName = `resumo_permanencia_sessao_${this.currentSession.id}_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.csv`;

      this._downloadFile(fullCsvContent, fileName, "text/csv");
    }
  }

  exportArchivedSessionLog(sessionId) {
    const session = this.archivedSessions.find(s => s.id === sessionId);
    if (!session) {
      console.error(`Sessão arquivada com ID ${sessionId} não encontrada.`);
      return;
    }
    this.saveEventLog(session.eventLog);
  }

  exportArchivedSessionSummary(sessionId) {
    const session = this.archivedSessions.find(s => s.id === sessionId);
    if (!session) {
      console.error(`Sessão arquivada com ID ${sessionId} não encontrada.`);
      return;
    }
    if (!session.summary || session.summary.length === 0) {
      console.warn("Nenhum dado para salvar no resumo da sessão arquivada.");
      return;
    }
    const headers = "Matrícula,Nome,Primeira Entrada,Última Saída,Permanência Total (min)\n";
    const csvContent = session.summary.map(s => {
      return `${s.matricula},"${s.nome}",${s.primeiraEntrada},${s.ultimaSaida},${s.permanenciaTotal}`;
    }).join("\n");

    const fullCsvContent = headers + csvContent + `\n${new Date(session.startTime).toLocaleDateString()}`;

    const now = new Date();
    const pad = n => n.toString().padStart(2, "0");
    const fileName = `resumo_permanencia_sessao_arquivada_${session.id}_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.csv`;

    this._downloadFile(fullCsvContent, fileName, "text/csv");
  }

  _downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  getCurrentSessionInfo() {
    if (this.currentSession.id) {
      const start = new Date(this.currentSession.startTime);
      return `Sessão Atual: ${this.currentSession.id} (Início: ${start.toLocaleDateString()} ${start.toLocaleTimeString()})`;
    }
    return "Nenhuma sessão ativa.";
  }

  getArchivedSessionsList() {
    return this.archivedSessions.map(session => ({
      id: session.id,
      startTime: new Date(session.startTime).toLocaleString(),
      endTime: new Date(session.endTime).toLocaleString(),
      duration: ((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / (1000 * 60 * 60)).toFixed(2) + "h",
    }));
  }
}

// Classe principal da aplicação
class App {
  constructor() {
    this.dom = new DOMManager();
    this.data = new StudentDataManager();
    this.matriculaFocusTimer = null;
    this.matriculaFocusSeconds = 0;
    this.tempoCursor = 2000;

    this._setupEventListeners();
    this._startFocusTimer();
    this._startClock();
    this.dom.focusBarInput();
    this.dom.updateDisplay("minTimeDisplay", `${this.data.minStayTime}`);
    this._updateUIForCurrentSession();
  }

  _startClock() {
    const updateClock = () => {
      const now = new Date();
      const currentTime = now.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      this.dom.updateDisplay("clockDisplay", currentTime);
    };

    updateClock();
    setInterval(updateClock, 1000);
  }

  _setupEventListeners() {
    this.dom.get("barInput").addEventListener("change", () => this.handleMatriculaChange());
    this.dom.get("buttonSave").addEventListener("click", () => this.data.saveEventLog(this.data.currentSession.eventLog));
    this.dom.get("buttonStart").addEventListener("click", () => this.startSystem());
    this.dom.get("lineInput").addEventListener("change", () => this.handleRemoveLine());
    if (this.dom.get("buttonSaveSummary")) {
      this.dom.get("buttonSaveSummary").addEventListener("click", () => this.data.saveSummaryLog(true));
    }
    if (this.dom.get("sessionControlButton")) {
      this.dom.get("sessionControlButton").addEventListener("click", () => this.handleSessionControl());
    }
  }

  _startFocusTimer() {
    this.matriculaFocusTimer = setInterval(() => {
      if (document.activeElement !== this.dom.get("barInput")) {
        this.matriculaFocusSeconds++;
        if (this.matriculaFocusSeconds >= (this.tempoCursor / 1000) * 5) {
          this.dom.focusBarInput();
          this.matriculaFocusSeconds = 0;
        }
      } else {
        this.matriculaFocusSeconds = 0;
      }
    }, this.tempoCursor);
  }

  startSystem() {
    console.log("Iniciando o sistema...");
    this.dom.get("buttonStart").disabled = true;
    this._openFile();
    this.dom.focusBarInput();
  }

  _openFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.json";

    input.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) {
        console.error("Nenhum arquivo selecionado.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const isJsonFile = file.name.toLowerCase().endsWith(".json");
        if (isJsonFile) {
          this.data.loadStudentNamesFromJson(e.target.result);
        } else {
          this.data.loadStudentNamesFromExcel(e.target.result);
        }
        // Altera o texto do botão após carregar a lista
        this.dom.get("buttonStart").textContent = "Lista de Alunos Carregada";
        this.dom.get("buttonStart").classList.remove("btn-danger");
        this.dom.get("buttonStart").classList.add("btn-success");
      };

      reader.onerror = (e) => {
        console.error("Erro ao ler o arquivo:", e.target.error);
        // Restaura o botão em caso de erro
        this.dom.get("buttonStart").disabled = false;
      };

      if (file.name.toLowerCase().endsWith(".json")) {
        reader.readAsText(file, "utf-8");
      } else {
        reader.readAsArrayBuffer(file);
      }
    });

    input.click();
  }

  handleMatriculaChange() {
    const matricula = this.dom.get("barInput").value.trim();
    if (!matricula) return;

    const { status, permanencia, nome, primeiroNome, horaEntrada, shouldUpdateOccupancy } = this.data.registerEvent(matricula);

    this.dom.updateDisplay("permanenciaDisplay", `Tempo de Permanência: ${permanencia.toFixed(2)} min`);
    this.dom.updateDisplay("entradaDisplay", `Entrada: ${horaEntrada}`);
    this.dom.updateDisplay("nomeDisplay", `Nome: ${nome || "Não encontrado"}`);

    if (status === "Entrada") {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-top-line"><span class="status-prefix">Entrada:</span></span><span class="status-name-line">${primeiroNome}</span>`, "green", "10rem");
    } else if (status === "Saída") {
      if (permanencia < this.data.minStayTime) {
        this.dom.updateDisplay("situacaoDisplay", `<span class="status-top-line"><span class="status-prefix">Tempo:</span> ${permanencia.toFixed(2)} <span class="status-prefix">min</span></span><span class="status-name-line">${primeiroNome}</span>`, "red", "10rem");
      } else {
        this.dom.updateDisplay("situacaoDisplay", `<span class="status-top-line"><span class="status-prefix">OK:</span></span><span class="status-name-line">${primeiroNome}</span>`, "green", "10rem");
      }
    } else if (status === "Código") {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-name-line">${primeiroNome}</span>`, "blue", "10rem");
    } else if (status === "Cancelado") {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-name-line">${primeiroNome}</span>`, "orange", "10rem");
    } else if (status === "Desfeito") {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-name-line">${primeiroNome}</span>`, "purple", "10rem");
    }

    if (shouldUpdateOccupancy) {
      this.dom.updateDisplay("espacoDisplay", `${this.data.currentSession.currentOccupancy}`, null, "20rem", "center");
    }

    this.dom.get("barInput").value = "";
    this._updateUIForCurrentSession();
    this.dom.focusBarInput();
  }

  handleRemoveLine() {
    const matriculaToRemove = this.dom.get("lineInput").value.trim();
    if (!matriculaToRemove) return;

    if (this.data.removeEventByMatricula(matriculaToRemove)) {
      this._updateUIForCurrentSession();
    }
    this.dom.get("lineInput").value = "";
  }

  handleSessionControl() {
    if (this.data.currentSession.id) {
      // Se há uma sessão ativa, o botão finaliza
      const hasEvents = this.data.currentSession.eventLog.length > 0;
      
      if (hasEvents) {
        // Pergunta sobre salvamento apenas se há eventos
        const saveChoice = confirm(
          `FINALIZAR SESSÃO\n\n` +
          `A sessão atual possui ${this.data.currentSession.eventLog.length} evento(s) registrado(s).\n\n` +
          `Deseja SALVAR automaticamente o log antes de finalizar?\n\n` +
          `• OK = Salvar arquivo e finalizar\n` +
          `• Cancelar = Finalizar sem salvar arquivo\n\n` +
          `(Os dados ficarão no localStorage de qualquer forma)`
        );
        
        if (saveChoice) {
          this.data.saveEventLog(this.data.currentSession.eventLog);
        }
      }
      
      // Confirma a finalização final
      const finalConfirm = confirm(
        `CONFIRMAÇÃO FINAL\n\n` +
        `Finalizar a sessão atual?\n\n` +
        `• A sessão será arquivada\n` +
        `• A tela será limpa\n` +
        `• Uma nova sessão será iniciada\n\n` +
        `Confirma a finalização?`
      );
      
      if (finalConfirm) {
        // Executa a finalização
        this.data.endCurrentSession();
        this.data.startNewSession(false);
        
        // Limpa a interface
        this.dom.clearTable();
        this.dom.clearDisplays();
        
        // Atualiza a UI
        this._updateUIForCurrentSession();
        
        alert("✅ Sessão finalizada com sucesso!\n\nNova sessão iniciada.");
      }
    } else {
      // Se não há sessão ativa, o botão inicia uma nova
      this.data.startNewSession(false);
      this._updateUIForCurrentSession();
      alert("✅ Nova sessão iniciada!");
    }
  }

  _updateUIForCurrentSession() {
    this.updateRealTimeTable();
    this.dom.updateDisplay("espacoDisplay", `${this.data.currentSession.currentOccupancy}`, null, "20rem", "center");
    this.dom.updateDisplay("sessionInfoDisplay", this.data.getCurrentSessionInfo());
    this.dom.updateDisplay("minTimeDisplay", `${this.data.minStayTime}`);

    const sessionButton = this.dom.get("sessionControlButton");
    if (sessionButton) {
        if (this.data.currentSession.id) {
            sessionButton.textContent = "Finalizar Sessão";
            sessionButton.classList.remove("btn-success");
            sessionButton.classList.add("btn-warning");
        } else {
            sessionButton.textContent = "Nova Sessão";
            sessionButton.classList.remove("btn-warning");
            sessionButton.classList.add("btn-success");
        }
    }
  }

  updateRealTimeTable() {
    const tableData = this.data.getRealTimeTableData();
    const fields = ["id", "Matricula", "Nome", "Entrada", "Permanencia", "Situacao"];
    this.dom.get("barTableBody").innerHTML = tableData
      .map((row) => this._createTableRow(row, fields))
      .join("");
    this._scrollToTop(this.dom.get("barTableBody").parentElement.parentElement);
  }

  _createTableRow(rowData, fields) {
    return `<tr>${fields
      .map((field) => `<td>${rowData[field]}</td>`)
      .join("")}</tr>`;
  }

  _scrollToTop(element) {
    if (element) {
      element.scrollTop = 0;
    }
  }
}

// Inicializa a aplicação quando o DOM estiver carregado
document.addEventListener("DOMContentLoaded", () => {
  new App();
});

