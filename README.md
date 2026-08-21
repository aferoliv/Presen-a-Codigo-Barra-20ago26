# Sistema de Presença por Código de Barras

Este repositório contém a versão consolidada do Sistema de Presença por Código de Barras, unificando as melhorias e funcionalidades dos repositórios anteriores (`Presenca_Codigo_Barra` e `Presenca_Codigo_Barra_V2`). A base principal deste sistema web é a versão V2, que oferece uma interface aprimorada e recursos avançados de gestão de presença.

## Objetivo do Sistema

O sistema foi desenvolvido para facilitar o registro e controle de presença de alunos em eventos, aulas ou sessões através da leitura de códigos de barras (geralmente presentes em carteirinhas de estudante ou crachás). Ele permite o carregamento de uma lista prévia de participantes, registra o horário de entrada e saída, calcula o tempo de permanência e gera relatórios detalhados.

## Como Usar a Versão Web

O sistema é uma aplicação web estática (HTML, CSS e JavaScript) que roda diretamente no navegador, sem necessidade de instalação de servidor ou banco de dados.

1. Abra o arquivo `index.html` em qualquer navegador web moderno.
2. A interface principal será carregada, pronta para uso.
3. Conecte um leitor de código de barras USB ao computador (ele funciona como um teclado, digitando o código e pressionando "Enter").
4. Posicione o cursor no campo de leitura e comece a escanear os códigos.

## Como Carregar Lista de Alunos

Para que o sistema reconheça os nomes dos participantes a partir dos códigos de barras:

1. Na interface do sistema, localize a opção para importar a lista de alunos.
2. Selecione um arquivo CSV contendo os dados dos participantes.
3. O formato esperado do CSV deve conter as colunas de matrícula/código e nome do aluno.
4. Após o carregamento, ao escanear um código de barras, o sistema exibirá o nome correspondente na tela.

## Funcionamento: Sessão, Permanência, Log e Resumo

O sistema opera com base em sessões de registro:

- **Sessão**: Uma sessão representa um evento ou aula específica. Ao iniciar o sistema, uma nova sessão é criada.
- **Registro de Entrada/Saída**: O primeiro escaneamento de um código registra a entrada do participante. Um segundo escaneamento do mesmo código registra a saída.
- **Permanência**: O sistema calcula automaticamente o tempo total que o participante permaneceu na sessão (diferença entre o horário de saída e entrada).
- **Log de Eventos**: Todas as leituras (entradas e saídas) são registradas em um log cronológico, que pode ser exportado para auditoria.
- **Resumo**: Ao final da sessão, é possível visualizar e exportar um resumo consolidado, mostrando quem esteve presente e o tempo total de permanência de cada um.

## Estrutura do Repositório

O repositório foi organizado para separar claramente o código da aplicação, documentação, exemplos e arquivos legados:

- `/` (Raiz): Contém os arquivos principais da aplicação web (`index.html`, `app.js`, `style.css` e este `README.md`).
- `/assets`: Armazena recursos visuais da aplicação, como ícones (`icon.png`).
- `/docs`: Contém toda a documentação do projeto, incluindo apresentações, manuais em PDF/Word e imagens explicativas.
- `/samples`: Disponibiliza arquivos de exemplo, como listas de matrículas em CSV, para testar o sistema. **Atenção: Estes arquivos são apenas exemplos e não devem ser confundidos com dados reais de participantes.**
- `/legacy`: Guarda versões antigas ou alternativas do sistema, como a implementação original em Python (`presenca_tk.py`), mantida apenas para fins de histórico e referência.

---
*Nota: Este repositório foi limpo de arquivos operacionais, logs exportados e planilhas reais de participantes para garantir a segurança e privacidade dos dados.*
