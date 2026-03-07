<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Filosofia do Projeto Naia OS

Guia legível para humanos do ficheiro `.agents/context/philosophy.yaml`.

## Propósito

Este documento explica a filosofia central do projeto Naia OS — **"por que construímos isto"**.  
Separado da arquitetura (o quê) e dos workflows (como), este é o motivo pelo qual o projeto existe.

---

## Princípios Centrais

### 1. Soberania da IA

**"Os utilizadores escolhem a sua IA — sem dependência de fornecedor"**

- Suporte a múltiplos fornecedores de LLM (Vertex AI, Anthropic, xAI, modelos locais)  
- Os utilizadores controlam a sua configuração de IA e podem trocar livremente  
- Nenhuma dependência de um único fornecedor na arquitetura central

### 2. Privacidade em Primeiro Lugar

**"Execução local por defeito — a cloud é opt-in"**

- Arquitetura focada no desktop (Tauri, não Electron cloud)  
- Dados do utilizador permanecem no dispositivo, salvo partilha explícita  
- Suporte a LLM local (Ollama) como cidadão de primeira classe

### 3. Transparência

**"Open source — verifica lendo o código"**

- Toda a lógica central é open source (Apache 2.0)  
- Contexto da IA é aberto e forkable (CC-BY-SA 4.0)  
- Sem telemetria oculta ou recolha de dados

### 4. Composição sobre Invenção

**"Compõe a partir de componentes comprovados — não reinventes a roda"**

- Usar projetos upstream como blocos de construção (OpenClaw, Tauri, etc.)  
- Contribuir de volta para upstream sempre que possível  
- Submódulos de referência (ref-*) para aprendizagem e rastreio

### 5. Sempre Ativo

**"Companheiro IA como daemon — sempre presente, sempre pronto"**

- Arquitetura de agente em background (daemon Node.js)  
- Gestão de processos do gateway (spawn, restart, health check)  
- Estado persistente do personagem IA entre sessões

### 6. Centrismo no Avatar

**"IA como personagem viva — não apenas uma ferramenta"**

- Naia: personagem IA com nome, personalidade e voz  
- Avatar 3D com TTS e expressão emocional  
- Documento Soul (SOUL.md) define a identidade do personagem

### 7. Era do Vibe Coding

**"Ficheiros de contexto de IA são a nova infraestrutura de contribuição"**

- Diretórios `.agents/` codificam a filosofia do projeto, não apenas configuração  
- Qualidade do contexto determina qualidade da colaboração com a IA  
- Arquitetura de diretórios dupla: otimizado para IA + legível por humanos  
- Licença CC-BY-SA preserva a cadeia de contribuições

---

## Ficheiros Relacionados

- **SoT**: `.agents/context/philosophy.yaml`  
- **Espelho coreano**: `.users/context/philosophy.md`