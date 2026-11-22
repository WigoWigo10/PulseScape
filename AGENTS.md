# AGENTS.md — Visualizador Musical Web

## Contexto e objetivo

Desenvolver, com auxílio do Codex no VS Code, um aplicativo **Web-first** de visualizações musicais inspirado nas visualizações do Windows Media Player e do Winamp/MilkDrop. O software deverá criar animações sincronizadas com o som, como espectro de frequências, osciloscópio, partículas e, futuramente, túneis e efeitos abstratos com shaders.

**A IA ajuda a escrever, revisar, testar e evoluir o código; ela não é uma dependência do aplicativo em execução.** O processamento de áudio e os gráficos devem funcionar localmente, sem serviços externos de IA.

**Decisão de interface já fornecida pelo responsável:** a aplicação terá **um botão visível para selecionar um arquivo de áudio do computador**. O arquivo selecionado será a fonte principal do primeiro MVP. O usuário poderá ouvi-lo e visualizar os efeitos reativos.

**Decisão arquitetural de trabalho:** construir a primeira versão para o navegador. A possibilidade de uma versão desktop é futura, não um requisito inicial. Este projeto é independente do SerialHub e não deve modificar seu repositório.

## Regras para o agente de programação

1. Antes de alterar arquivos, inspecione o estado do repositório, scripts, dependências e alterações existentes; respeite decisões já presentes no código.
2. Faça alterações pequenas e verificáveis. Não apague nem reformate trabalho preexistente sem autorização.
3. Ao receber uma tarefa, descreva brevemente a abordagem quando ela afetar arquitetura ou bibliotecas; depois implemente e valide o menor incremento funcional.
4. Não instale bibliotecas, ferramentas globais, serviços, drivers ou pacotes nativos sem justificativa técnica e aprovação quando houver risco/impacto relevante.
5. Não faça commit, push, merge, publicação, deploy, criação de contas nem mudanças de compartilhamento sem solicitação expressa.
6. Ao terminar cada etapa, informe: arquivos alterados, resultado funcional, comandos executados, testes aprovados e limitações ainda não verificadas. Nunca invente resultado de testes.
7. Prefira TypeScript estrito, APIs nativas e uma arquitetura simples. Evite abstrações prematuras.
8. Mantenha documentação e decisões técnicas duráveis no **repositório**, especialmente README e `docs/`. Não salve cópias de código ou planos do repositório em sistemas externos automaticamente.

## Stack preferencial para começar

- **React + TypeScript + Vite** para interface e desenvolvimento Web.
- **Web Audio API** (`AudioContext`, `MediaElementAudioSourceNode`, `AnalyserNode`) para reprodução/análise do arquivo selecionado.
- **Canvas 2D** para os dois presets iniciais; considerar WebGL/GLSL e Three.js mais tarde, quando houver necessidade justificada.
- **CSS** para layout responsivo, controles e tema escuro.
- Testes unitários para lógica separável e testes de integração/interface quando houver infraestrutura adequada no projeto.

Estas escolhas são direções propostas, não autorização para substituir uma stack já existente sem avaliar o repositório.

## Fluxo principal de usuário — requisito obrigatório

A página inicial deverá ter um botão de destaque com rótulo como **“Selecionar áudio”**. Ao clicar:

1. Abrir o seletor nativo de arquivos usando `<input type="file" accept="audio/*">` (pode ser visualmente oculto e acionado pelo botão acessível).
2. Receber um único arquivo inicialmente; opcionalmente validar a extensão/MIME, mas **não confiar apenas em `accept`**. Tratar falhas de leitura/decodificação de modo amigável.
3. Exibir nome do arquivo, controles de reproduzir/pausar, barra de progresso, tempo e volume, conforme a etapa de implementação.
4. Reproduzir e analisar o arquivo localmente com `HTMLAudioElement` e Web Audio API. Preferir `URL.createObjectURL(file)` e `MediaElementAudioSourceNode` para um fluxo simples e confiável; liberar a URL antiga com `URL.revokeObjectURL` ao substituir/descartar o arquivo.
5. Iniciar/retomar o `AudioContext` após interação do usuário, respeitando políticas de autoplay.
6. Atualizar as visualizações em tempo real durante a reprodução. Pausa, fim da faixa e troca de arquivo devem produzir estados previsíveis e não deixar loops ou nós de áudio órfãos.
7. Se o usuário cancelar a seleção, preservar o estado atual; se escolher um novo arquivo, efetuar a troca com limpeza apropriada.

### Importante: selecionar um arquivo não precisa enviá-lo a um servidor

Na primeira versão, “enviar áudio” significa **o usuário fornecer o arquivo ao aplicativo pelo seletor**. O arquivo **não deve ser transferido pela rede**: ele é tratado localmente no navegador. Não implementar endpoint de upload, banco de músicas, armazenamento remoto ou telemetria do conteúdo. Se o responsável pedir explicitamente transferência para servidor no futuro, tratar isso como um novo requisito, com consentimento, finalidade, segurança e privacidade próprios.

Aceitar formatos **compatíveis com o navegador do usuário**; não prometer que todos os arquivos MP3, WAV, FLAC, AAC etc. funcionarão em todas as plataformas. Exibir mensagem clara ao encontrar formatos não suportados.

## MVP — critérios mínimos de aceitação

- [x] Interface carregada com botão “Selecionar áudio” e estado inicial compreensível.
- [x] Arquivo local escolhido via seletor, sem upload para servidores.
- [x] Reprodução e pausa operacionais após escolha do arquivo.
- [x] Um **espectro de frequências** reativo implementado em Canvas 2D.
- [x] Um **osciloscópio** (forma de onda) reativo implementado em Canvas 2D.
- [x] Alternância entre os dois presets sem reinicializar o áudio indevidamente.
- [x] Estados de sem arquivo, reproduzindo, pausado, encerrado e erro legíveis.
- [ ] Redimensionamento e tela cheia funcionando adequadamente.
- [ ] Cleanup de `requestAnimationFrame`, listeners, URLs de objeto e nós/recursos de áudio.
- [ ] Verificações de lint/typecheck/build e testes disponíveis executados e reportados.

Não marcar itens concluídos apenas porque o código foi escrito. Exigir execução/validação real na medida do possível.

## Decisões técnicas registradas

Aprovadas pelo responsável em 2026-11-21. Detalhes e justificativas em [`docs/decisions.md`](docs/decisions.md).

1. **Um único `<audio>` + um único `MediaElementAudioSourceNode` + um único `AudioContext` por sessão.** Trocar de faixa troca apenas o `src`. O navegador lança `InvalidStateError` ao criar uma segunda fonte para o mesmo elemento.
2. **Contrato de dados analisados:** `{ frequency: Uint8Array, timeDomain: Uint8Array, sampleRate, fftSize, deltaMs }`, com arrays pré-alocados e reutilizados a cada frame (`src/audio/analysis.ts`). Presets seguem `src/visualizations/types.ts` e o loop de `requestAnimationFrame` para quando o áudio está parado (D7).
3. **Testes:** Vitest para lógica pura; Web Audio não roda em jsdom. Validação de integração feita no navegador real; Playwright como suíte automatizada fica para depois.
4. **Ferramentas:** npm, oxlint (padrão do template Vite atual, em vez de ESLint), sem Prettier por enquanto.
5. **Navegadores-alvo do MVP:** Chrome, Edge e Firefox atuais. Safari/iOS não são garantidos.
6. **Estrutura de pastas:** começar plana (`src/audio/`, `src/visualizations/`) e subdividir quando houver mais de uma implementação por responsabilidade.
7. **Commits** sem linhas de coautoria (`Co-Authored-By`).

## Arquitetura orientadora

Isolar responsabilidades, sem obrigar uma árvore de diretórios artificial:

```text
src/
  audio/
    sources/         # Arquivo local agora; outras fontes, futuramente
    engine/          # AudioContext, nós e AnalyserNode
    features/        # RMS, bandas, espectro, amostras temporais
  visualizations/
    presets/         # Espectro e osciloscópio no MVP
    registry/        # Registro e ciclo de vida dos presets
  components/        # Seletor de arquivo, player, controles, erros
  hooks/
  styles/
  tests/
docs/
```

Especificar um contrato de **dados de áudio analisados** independente da UI e dos presets. Os presets devem receber amostras e configurações, sem abrir arquivos, pedir permissões ou criar `AudioContext` diretamente. Compartilhar uma instância controlada do pipeline de áudio. Definir inicialização, atualização, resize e descarte de cada visualização.

Não armazenar arrays mutáveis ou amostras de cada frame em estado React; use referências/objetos apropriados para renderização de alta frequência. Evitar renderizações React a 60 FPS.

## Diretrizes técnicas de áudio e gráficos

- Usar `AnalyserNode.getByteFrequencyData()` ou `getFloatFrequencyData()` para o espectro; `getByteTimeDomainData()` ou `getFloatTimeDomainData()` para a forma de onda.
- Fazer mapeamento e suavização que mantenham efeitos interessantes em músicas silenciosas e intensas, sem saturar continuamente.
- Renderizar com `requestAnimationFrame`, considerando tempo entre frames, resize e limite sensato de `devicePixelRatio`.
- Impedir múltiplos loops simultâneos, múltiplas conexões indevidas e vazamentos durante trocas de faixa e preset.
- Observar acessibilidade: botão acionável por teclado, rótulos, foco visível, mensagens de erro, contraste e opção de reduzir movimento quando pertinente.
- Medir desempenho antes de introduzir otimizações complexas ou afirmar metas de FPS.
- Preferir efeitos determinísticos e shaders à inferência de IA em tempo de execução.

## Funcionalidades futuras — não implementar sem solicitação

- Captura da aba/tela via `getDisplayMedia()`; a presença de áudio **não é garantida**, exige permissão explícita e depende do navegador/ambiente. Uma captura pode trazer vídeo; não capturar/gravar/publicar vídeo sem necessidade e consentimento.
- Entrada por microfone (`getUserMedia`) com permissão clara.
- Aplicativo Windows (por exemplo Tauri) com captura nativa via WASAPI Loopback, mantendo o mesmo motor gráfico Web.
- Presets com partículas, shaders, visualizações 3D, transições, biblioteca de efeitos e configuração persistente.
- PWA/offline, exportação de imagens/vídeos, playlists e compartilhamento.

## Roteiro sugerido

1. **Diagnóstico**: inspecionar repositório e apresentar plano mínimo; se vazio, criar a estrutura base Web.
2. **Fluxo de arquivo**: botão → seleção → player local → tratamento de erros e limpeza; demonstrar execução real.
3. **Espectro**: integrar `AnalyserNode` ao Canvas 2D e validar com arquivos de teste.
4. **Osciloscópio**: adicionar preset, alternância e ciclo de vida sem vazamentos.
5. **Polimento**: visual, controles, layout responsivo, tela cheia e verificações.
6. **Expansão**: só com aprovação, adicionar outras fontes de áudio e efeitos avançados.

## Primeira orientação ao Codex

Ao começar no VS Code, **não implemente tudo de uma vez**. Examine os arquivos disponíveis e proponha a menor alteração para obter o fluxo “Selecionar áudio → reproduzir localmente → exibir espectro reativo”. Se o repositório estiver vazio, inicie a aplicação Web com a stack proposta e faça uma etapa verificável por vez.
