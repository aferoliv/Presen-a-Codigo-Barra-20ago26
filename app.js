// Declaração global
let elements;
let nomeList = [];
let ocupacao = 0; // número de alunos na sala
let tempoMinimo=0.2 // Tempo mínimo de permanência na sala em minutos
matrList = [];
i = 0;
let lastValidData = {}; // Definindo lastValidData
let readCount = 0; // Definindo readCount
let realTimeData = []; // Definindo realTimeData
// Set focus back to the input field

//
document.addEventListener("DOMContentLoaded", () => {
  // DOM elements for interaction
  const elements = {
    BarInput: document.getElementById("matricula"), // Max points input for real-time chart    };
    BarTableBody: document.getElementById("real-time-table-body"), // Real-time table body
    MaxPointsDisplay: document.getElementById("max-points-display"), // Display for maxPoints
    situacaoDisplay: document.getElementById("situacao-display"), // Display for situacao
    permanenciaDisplay: document.getElementById("permanencia-display"), // Display for verificado
    nomeDisplay: document.getElementById("nome-display"), // Display for verificado
    entradaDisplay: document.getElementById("entrada-display"), // Display for verificado
    lotacaoDisplay: document.getElementById("lotacao-display"), // Display for verificado
    ButtonStart: document.getElementById("start-data-button"), // Start button
    ButtonSave: document.getElementById("savelistButton"), // Save button
    espacoDisplay: document.getElementById("espaco-display"), // Display for espaco ocupado na sala
    LineInput: document.getElementById("remove-line"), // Display for espaco ocupado na sala

  }
  elements.BarInput.focus()
  //elements.ButtonStart.focus(); // Set focus to the input field
  elements.BarInput.addEventListener("change", verMatricula);
  elements.ButtonSave.addEventListener("click", () => logList(realTimeData)); // Save button click event
  elements.ButtonStart.addEventListener("click", () => inicio()); // Start button click event
  elements.LineInput.addEventListener("change", function() {
    const linha = parseInt(elements.LineInput.value, 10);
    removeLine(realTimeData, linha);
  });
  function inicio() {
    console.log("iniciando o sistema...");
    elements.ButtonStart.disabled = true; // Disable the button after click
    openFile(); // Call the function to open the file
    //console.log("arquivo nomes: OK");
    elements.BarInput.focus();
  }
  function openFile() {
    // Cria um elemento input do tipo file
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv"; // Aceita apenas arquivos CSV

    // Adiciona um evento para lidar com a seleção do arquivo
    input.addEventListener("change", (event) => {
      const file = event.target.files[0]; // Obtém o arquivo selecionado
      if (!file) {
        console.error("Nenhum arquivo selecionado.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result; // Conteúdo do arquivo CSV
        //console.log("Conteúdo do arquivo CSV:", content);

        // Processa o conteúdo do CSV
        const rows = content.split("\n").map((row) => row.split("\t")); // Divide cada linha em colunas
        //console.log("Matriz de dados do CSV:", rows);

        // Atualiza a matriz nomeList com os dados do CSV
        nomeList = rows;
        //console.log("nomeList atualizada:", matrList);

        // Atualiza a tabela com os dados do arquivo
        //tabela(matrList);
      };

      reader.onerror = (e) => {
        console.error("Erro ao ler o arquivo:", e.target.error);
      };

      reader.readAsText(file); // Lê o arquivo como texto
    });

    // Simula um clique no input para abrir o seletor de arquivos
    input.click();
  }

  // Função para atualizar os dados em tempo real}
  function verMatricula() {
    i = i + 1; //Incrementa o contador0//
    const maxPoints = parseInt(elements.BarInput.value); //Lê a entrada do Leitor de Código de Barras
    const momento = new Date(); //Obtém a hora atual
    const mili = new Date().getTime(); //Obtém a hora atual
    const hora = `${momento.getHours()}:${momento.getMinutes()}:${momento.getSeconds()}`; //string com a hora da leitura
    const aluno = nomeAluno(maxPoints); //Chama a função para obter o nome do aluno
    console.log(aluno, hora, "linha 90"); //Imprime o nome do aluno no console

    matrList.push([i, maxPoints, hora, aluno, i, mili]); //Adiciona a entrada do Leitor de Código de Barras na lista
    const permanencia = verifica(maxPoints, i); //Verifica se o aluno já está na sala e calcula a permanência
    (matrList[i - 1][4] = parseFloat(permanencia.toFixed(2))), // Formata a permanência com 2 casas decimais --- Atualiza a permanência na lista
      (elements.BarInput.value = ""); //Limpa o campo de entrada do Leitor de Código de Barras
    elements.MaxPointsDisplay.innerHTML = `Matrícula: ${maxPoints}`;
    elements.permanenciaDisplay.innerHTML = `Permanencia: ${parseFloat(
      permanencia.toFixed(2)
    )}`;
    elements.entradaDisplay.innerHTML = `Entrada: ${momento.getHours()}:${momento.getMinutes()}:${momento.getSeconds()}`;
    //
    //   Avalia a ocupação da sala e atualiza o display
    //

    //
    //
    // ************************AVISOS **************************** 
    // Verifica se o aluno já está na sala e calcula a permanência
    //
    //
    if (situacao == "Entrada") {
      elements.situacaoDisplay.style.color = "green"; // Define a cor do texto como verde
      elements.situacaoDisplay.style.fontSize = "5rem"; // Aumenta o tamanho da fonte
      elements.situacaoDisplay.innerHTML = "Entrada";
      elements.espacoDisplay.innerHTML = `Espaço ocupado: ${ocupacao}`;


      }
    else if (situacao == "Saída") {
      if (permanencia < tempoMinimo) {
        elements.situacaoDisplay.style.color = "red"; // Define a cor do texto como vermelho
        elements.situacaoDisplay.style.fontSize = "5rem"; // Aumenta o tamanho da fonte
        elements.situacaoDisplay.innerHTML = `Permanencia: ${parseFloat(
          permanencia.toFixed(2))}`;
      } else {
        elements.situacaoDisplay.style.color = "green"; // Define a cor do texto como verde
        elements.situacaoDisplay.style.fontSize = "5rem"; // Aumenta o tamanho da fonte
        elements.situacaoDisplay.innerHTML = "OK";  // Tempo de permanência maior que 45 minutos
        ocupacao = ocupacao - 1; // Diminui o número de alunos na sala
        elements.espacoDisplay.innerHTML = `${ocupacao}.`;
      }
    }
    
    

    tabela(matrList, i);
    // Update the display elements with the new values
    // Set focus back to the input field
    elements.BarInput.focus();
    return;
  }
  function nomeAluno(maxPoints) {
    // Procura a linha na matriz nomeList onde a primeira coluna (índice 0) é igual a maxPoints
    const linha = nomeList.find((row) => row[0] == maxPoints);
    if (linha) {
      const nome = linha[1]; // Assume que o nome está na segunda coluna (índice 1)
      //console.log(`Nome encontrado para MaxPoints ${maxPoints}:`, nome);
      elements.nomeDisplay.innerHTML = `Nome: ${nome}`; // Atualiza o display com o nome
      return nome;
    } else {
      console.error(`Nenhum nome encontrado para MaxPoints ${maxPoints}`);
      elements.nomeDisplay.innerHTML = "Nome: Não encontrado";
      return null;
    }
  }
  function verifica(maxPoints, i) {
    //const entrada = matrList.findIndex((elemento) => elemento === maxPoints);
    entrada = matrList.findIndex((elemento) => elemento[1] === maxPoints);
    permanencia = 0;
    i = matrList.length - 1;
    if (entrada !=i) {
      permanencia = (matrList[i][5] - matrList[entrada][5]) / (1000 * 60);
      situacao = "Saída";
     
    } else {
      permanencia=0;
      situacao = "Entrada";
      ocupacao = ocupacao + 1; // Aumenta o número de alunos na sala
    }
    corrPermanencia=parseInt(permanencia);
    resto=permanencia-corrPermanencia;
    permanencia=corrPermanencia+resto*(60/100);
    console.log("linha 122", i, "entrada",entrada, permanencia, resto,corrPermanencia);
    return permanencia;
  }
  function tabela(matrList, i) {
    // Função para atualizar a tabela com os dados em realTimeData
    // Implementação da função updateTable aqui
    console.log("linha 137", i);
    //i = i - 1;
    i = matrList.length - 1;
    nome = nomeAluno(matrList[i][1]); //Chama a função para obter o nome do aluno
    //if (i == -1) i = 0;
    if (!matrList) return; // Exit if no valid data available
    const fields = ["Matrícula", "Permanencia", "Entrada", "Nome", "numero"];
    const data = {
      Matrícula: matrList[i][1],
      Permanencia: matrList[i][4],
      Entrada: matrList[i][2],
      Nome: matrList[i][3],
      numero: matrList[i][0],
    };
    realTimeData.push(data); // Add to real-time data array
    updateTable(elements.BarTableBody, realTimeData, fields); // Update real-time table
    return;
  }
  function updateTable(tableBody, realTimeData, fields) {
    // Função para atualizar a tabela com os dados em realTimeData
    tableBody.innerHTML = realTimeData
      .map((row) => createTableRow(row, fields))
      .join(""); // Create and insert table rows
    scrollToBottom(tableBody.parentElement.parentElement); // Scroll to the bottom of the table
    // Create table row from data
    function createTableRow(realTimeData, fields) {
      // Generate HTML for a table row
      return `<tr>${fields
        .map((field) => `<td>${realTimeData[field]}</td>`)
        .join("")}</tr>`;
    }
  }
  function removeLine(realTimeData,linha) {
    console.log("linha 217", linha, realTimeData.length);
    console.log("linha 220 - Antes", realTimeData);
    // Remove a linha especificada da lista
    if (linha >= 0 && linha < realTimeData.length) {
      realTimeData.splice(linha, 1); // Remove a linha da matriz
      console.log(`Linha ${linha} removida com sucesso.`);
      elements.LineInput.value = ""; // Limpa o campo de entrada
      // Atualiza a tabela após remoção
      const fields = ["Matrícula", "Permanencia", "Entrada", "Nome", "numero"];
      console.log("linha 227-depois", realTimeData);
      updateTable(elements.BarTableBody, realTimeData, fields);
    } else {
      console.error("Número da linha inválido.");
      elements.LineInput.value = ""; // Limpa o campo de entrada
    }
  }
  function scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
  }

  function logList(dataArray) {
    // Função para salvar os dados em dataArray no arquivo lista.txt
    // Verifica se dataArray tem dados
    if (!dataArray || dataArray.length === 0) {
      console.error("dataArray está vazio ou indefinido.");
      return;
    }
    // Gera o conteúdo do arquivo com cada linha separada por vírgula
    let novaList = dataArray
      //.map((row) => row.join(",")) // Converte cada linha da matriz em uma string separada por vírgula
      .map((row) => {
        if (Array.isArray(row)) {
          // Se row for um array, use join diretamente
          return row.join(",");
        } else if (typeof row === "object") {
          // Se row for um objeto, extraia os valores na ordem correta
          return [
            row.Matrícula,
            row.Permanencia,
            row.Entrada,
            row.Nome,
            row.i,
          ].join(",");
        } else {
          console.error("Formato inesperado em dataArray:", row);
          return "";
        }
      })
      .join("\n"); // Junta todas as linhas com uma quebra de linha

    // Adiciona o cabeçalho ao início do arquivo
    const headers = "Matrícula,Permanencia,Entrada,Nome,i";
    novaList = headers + "\n" + novaList;

    const csvContent = "data:text/csv;charset=utf-8," + novaList;
    // Generate CSV content
    const encodedUri = encodeURI(csvContent); // Encode URI
    const link = document.createElement("a"); // Create download link
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "lista.txt");
    document.body.appendChild(link);
    link.click(); // Trigger download
    console.log("139 dataArray", novaList);
    document.body.removeChild(link); // Remove link
  }
})
