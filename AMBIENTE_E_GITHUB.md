# Ambiente de programacao e GitHub

Este workspace foi configurado para facilitar edicao de Python, HTML, CSS e JavaScript no VS Code.

## Extensoes recomendadas

Ao abrir este projeto, o VS Code deve sugerir estas extensoes:

- Python
- Pylance
- Black Formatter
- Prettier
- Live Server
- GitHub Pull Requests
- GitLens

## Programas instalados/configurados

Foram configurados no PATH do usuario:

- Git
- Python 3.12
- Node.js LTS
- npm

Se algum terminal antigo ainda nao reconhecer os comandos, feche e reabra o terminal do VS Code. Se continuar igual, use `Developer: Reload Window` no VS Code ou reinicie o VS Code.

Comandos de verificacao:

```powershell
git --version
python --version
node --version
npm --version
```

O PowerShell foi ajustado para `RemoteSigned` no escopo do usuario, permitindo que `npm` funcione no terminal integrado.

## Comandos npm

Depois de instalar as dependencias do projeto com `npm install`, use:

```powershell
npm run start
npm run format
npm run check-format
```

- `npm run start` inicia um servidor em `http://localhost:8000`.
- `npm run format` formata HTML, CSS, JavaScript, JSON e Markdown.
- `npm run check-format` apenas verifica a formatacao.

## Tarefas prontas no VS Code

Use `Terminal > Run Task...` e escolha:

- `Abrir app no navegador`
- `Servidor HTML local na porta 8000`
- `Executar app Python Tkinter`
- `Git: status`
- `GitHub: publicar alteracoes`

O servidor local usa Python e abre o projeto em `http://localhost:8000`.

## GitHub

Este repositorio local ja esta conectado ao remoto:

```text
https://github.com/aferoliv/Presenca_Codigo_Barra_V2.git
```

Depois de instalar o Git, o fluxo normal e:

```powershell
git status
git add .
git commit -m "Descreva a alteracao"
git push origin main
```

Tambem e possivel usar a tarefa `GitHub: publicar alteracoes`.

## Cuidado com dados sensiveis

O `.gitignore` foi configurado para evitar publicar planilhas, PDFs, logs e CSVs por engano. Isso ajuda com arquivos novos, mas se algum arquivo sensivel ja tiver sido versionado antes, sera necessario remover do controle do Git com:

```powershell
git rm --cached "nome-do-arquivo.csv"
git commit -m "Remove dados sensiveis do versionamento"
git push origin main
```

Antes de subir ao GitHub, revise especialmente arquivos de matricula, listas de participantes e logs de presenca.
