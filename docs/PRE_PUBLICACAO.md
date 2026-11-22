# PulseScape — Checklist de estabilização antes da publicação

> **Destino no repositório:** `docs/PRE_PUBLICACAO.md`  
> **Leitura complementar:** [`AGENTS.md`](../AGENTS.md) e [`docs/decisions.md`](decisions.md)  
> **Referência da auditoria:** `master` — commit `cd2c88f9bf98dc8aa879b010d695483728e5a754` (22/11/2026).  
> **Estado:** plano de trabalho; nenhuma das tarefas abaixo foi considerada executada por este documento.

## Objetivo e limites

Preparar o PulseScape para ser acessado por um endereço HTTPS, no desktop e em telefones (prioridade inicial: **Chrome no Galaxy A54 / Android**), sem perder a proposta original: **selecionar um arquivo de áudio, reproduzi-lo e gerar visualizações localmente no navegador**.

Este documento foi elaborado por **revisão estática do repositório**. A existência de código e testes não comprova seu funcionamento no navegador; reproduzir problemas e executar testes antes de marcar os itens como concluídos. As prioridades são sugestões para a próxima etapa, não autorização para refatorações amplas.

**Não fazer nesta etapa:** configurar deploy público, tornar o repositório público, adicionar upload de áudio para servidor, criar contas de usuário, migrar para desktop, reescrever o motor gráfico ou adicionar novos presets. Publicação e mudanças de visibilidade dependem de uma decisão posterior.

**Regras para o Codex:** conferir `git status` e as instruções do `AGENTS.md` antes de alterar; trabalhar por tarefa; preservar os seis presets e as decisões existentes; não fazer commit, push nem mudar permissões sem pedido explícito; executar os comandos de validação e reportar resultados reais.

## P0 — Bloqueadores para a primeira publicação

### P0.1 — Proteger o consumo de memória ao analisar arquivos longos

- [ ] **Reproduzir e medir:** selecionar música curta, áudio longo e arquivo grande em desktop e Android, registrando tempo de carga, memória e comportamento de reprodução.
- [ ] Revisar `src/audio/AudioEngine.ts`, especialmente `analyzeTrack()`: hoje o arquivo completo é carregado em `ArrayBuffer` e decodificado com `OfflineAudioContext` para medir o ganho visual da faixa inteira. Isso **pode** elevar bastante o consumo de memória.
- [ ] Criar uma estratégia segura para **limitar apenas essa análise opcional**, por exemplo ignorar a medição em arquivos acima de limite fundamentado e manter `trackGainDb = 0`, sem impedir que a música seja reproduzida se o navegador conseguir tocá-la. Avaliar opções com medições; não supor que `decodeAudioData()` suporta decodificação parcial arbitrária de um MP3.
- [ ] Garantir que trocas rápidas de faixa invalidem resultados antigos e não apliquem ganho incorreto. O token atual evita resultados obsoletos, mas **não cancela a decodificação em andamento**; considerar esse custo ao projetar a solução.
- [ ] Criar testes para o critério de escolha da análise, fallback e trocas rápidas; validar manualmente se o áudio continua funcionando quando a medição é omitida.

**Aceitação:** áudio longo não derruba a página por causa da medição opcional; nenhuma faixa herda ganho de outra; músicas comuns preservam o comportamento atual; arquivos do usuário continuam locais.

### P0.2 — Corrigir o estado de carregamento assíncrono do preset Esfera

- [ ] **Reproduzir:** com a música pausada, selecionar **Esfera** pela primeira vez, após recarregar a página; verificar se a imagem pode ficar em branco.
- [ ] Examinar `src/visualizations/sphere.ts` e `src/components/VisualizerCanvas.tsx`: `import('three')` conclui depois de `init()`, mas não existe sinal explícito de **preset pronto** para solicitar novo desenho.
- [ ] Implementar notificação de prontidão/redesenho ou um ciclo de vida assíncrono mínimo, preservando o contrato dos demais presets. Evitar loop permanente de `requestAnimationFrame` apenas para esperar o import.
- [ ] Cobrir troca rápida de presets, desmontagem e perda/restauração do contexto durante o carregamento; callbacks antigos não devem redesenhar a visualização descartada.
- [ ] Tratar falha de download/importação/compilação do Three.js com feedback visível e fallback funcional.

**Aceitação:** Esfera aparece mesmo selecionada em pausa; não há tela permanentemente vazia, exceção não tratada, múltiplos loops nem vazamento após troca rápida.

### P0.3 — Validar reprodução e ciclo de vida sem regressões

- [ ] Testar **Selecionar áudio**, arrastar e soltar, play/pause, volume, busca, fim da faixa e reprodução novamente.
- [ ] Testar seleção cancelada, mesmo arquivo escolhido duas vezes, arquivo vazio, arquivo não-áudio, formato não suportado e arquivo corrompido.
- [ ] Testar troca de faixas durante `loading`, `playing`, `paused` e enquanto `analyzeTrack()` ainda processa a música anterior.
- [ ] Verificar liberação de `URL.createObjectURL`, nós de áudio, listeners, `AudioContext`, recursos de GPU e `requestAnimationFrame` ao trocar de arquivo/preset e ao desmontar. **Já existe código de cleanup**; a tarefa é confirmar sua eficácia e corrigir regressões, não reconstruí-lo.
- [ ] Exercitar a falha parcial de inicialização de Web Audio: não deixar um `AudioContext` criado ou uma fonte parcialmente conectada sem limpeza; preservar o áudio ou oferecer mensagem correta de falha.
- [ ] Testar reabertura da aba, troca para segundo plano e retorno, e recarga da página.

**Aceitação:** não há reproduções duplicadas, áudio mudo inesperado, estados incorretos, erro não tratado ou crescimento contínuo de recursos nas sequências acima.

### P0.4 — Passar em teste funcional no telefone

- [ ] Testar o **build de produção** no **Chrome para Android**, em tela vertical e horizontal; começar com 360–430 px de largura e conferir uma tela estreita de ~320 px.
- [ ] Verificar botão **Selecionar áudio** com o seletor do Android, permissões de arquivos e formatos disponíveis no aparelho.
- [ ] Conferir controles de toque (play, seek, volume e troca de preset), tamanho das áreas clicáveis, textos e rodapé sem sobreposição ou rolagem horizontal indevida.
- [ ] Testar os seis presets, especialmente **Montanhas** e **Esfera** (WebGL2). Se o navegador/GPU não suportar um efeito, oferecer fallback claro.
- [ ] Confirmar início da reprodução por gesto do usuário, retomada após pausa e comportamento ao bloquear/desbloquear a tela; registrar limitações do navegador em vez de prometer reprodução em segundo plano.
- [ ] Verificar áudio com fones e alto-falante, e trocar repetidamente de preset durante a música.

**Aceitação:** a jornada completa — abrir URL, escolher música, tocar, alternar presets e pausar — funciona no celular sem travar ou inutilizar os controles. Restrições específicas de navegador ficam documentadas.

## P1 — Qualidade e confiabilidade recomendadas antes do lançamento

### P1.1 — Melhorar mensagens de falha gráfica e recuperação WebGL

- [ ] Verificar `webglcontextlost` / `webglcontextrestored` em `VisualizerCanvas.tsx`, incluindo retorno ao preset já ativo.
- [ ] Não depender apenas de `console.warn()`/`console.error()` quando um preset 3D não puder ser mostrado. Avisar o usuário e usar o fallback 2D existente.
- [ ] Garantir que o fallback não deixe o seletor indicando visualização 3D quando apenas o Anel estiver sendo exibido, sem explicação.
- [ ] Criar teste manual reproduzível para perda/restauração de contexto e falha de carregamento do Three.js.

**Aceitação:** erro gráfico não interrompe a reprodução; a aplicação mostra um efeito viável e explica o problema.

### P1.2 — Controlar custo de renderização em telas móveis

- [ ] Medir FPS, tempo de quadro, uso de CPU/GPU e aquecimento percebido nos seis presets, no desktop e Android, com músicas distintas.
- [ ] Conferir o impacto do limite de `devicePixelRatio` atual (`2`) em telas de alta densidade; avaliar perfil de qualidade móvel e/ou opção de **FPS automático / 60 / 30**, conforme dados de desempenho.
- [ ] Suspender/retomar corretamente a renderização quando a aba ficar invisível, for pausada ou a música terminar; confirmar que o código não acumula quadros ou capturas atrasadas.
- [ ] Manter e testar `prefers-reduced-motion` nos presets.

**Aceitação:** a aplicação permanece responsiva durante reprodução prolongada; quaisquer limites de qualidade são documentados e não prejudicam a sincronização visual.

### P1.3 — Implementar tela cheia de forma progressiva

- [ ] Criar ação visível de entrar/sair da tela cheia para navegadores com **Fullscreen API** compatível.
- [ ] Lidar com `fullscreenchange`, rejeição da API e indisponibilidade no navegador, sem deixar controle travado.
- [ ] Ajustar palco, dimensões dos canvases e controles; testar `Esc`, orientação vertical/horizontal e botões de navegação.
- [ ] No celular, **não assumir** suporte uniforme a tela cheia; manter modo normal completamente utilizável.

**Aceitação:** fullscreen funciona onde suportado; a ausência da API não impede o uso do app.

### P1.4 — Criar uma camada mínima de testes de integração

- [ ] Preservar os testes unitários Vitest existentes (79 declarações `it()` identificadas na revisão; execução ainda não verificada nesta auditoria).
- [ ] Avaliar Playwright ou outro teste real de navegador **com justificativa para a nova dependência**; começar com smoke tests em Chromium.
- [ ] Cobrir: entrada inicial; seleção e troca de arquivos; controles; mudança de preset durante reprodução; erro de arquivo; Esfera carregada sob demanda; fallback gráfico.
- [ ] Para áudio automatizado, usar **fixture sintética pequena e licenciada para o projeto**, ou gerar sinal de teste; não incluir músicas comerciais ou arquivos privados no Git.
- [ ] Separar claramente o que é teste automático do que exige teste manual em dispositivo físico.

**Aceitação:** regressões dos caminhos críticos são detectadas; a documentação ensina como executar os testes.

### P1.5 — Preparar validação automática do repositório, sem deploy

- [ ] Adicionar workflow de CI para `push`/`pull_request` que execute, nesta ordem: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- [ ] Definir versão de Node compatível com Vite 8, por exemplo **Node 24 LTS**. Atualizar README: o requisito não é simplesmente “Node 20+”; a documentação do Vite 8 indica **20.19+ ou 22.12+**.
- [ ] Fazer falhas de testes/lint/build encerrarem a execução com status de erro; não adicionar publicação automática nesta fase.
- [ ] Verificar que `dist/`, músicas de teste privadas e arquivos sensíveis não entram no commit.

**Aceitação:** o CI executa com sucesso no commit proposto e não publica a aplicação nem altera a visibilidade do repositório.

## P2 — Preparação de release (somente após P0 e testes P1)

### P2.1 — Conferir hospedagem e caminho público **sem publicar ainda**

- [ ] Decidir o destino: GitHub Pages a partir do repositório privado (se o plano permitir), repositório público separado contendo somente build ou outra hospedagem estática. **Não presumir que GitHub Free publica Pages diretamente de repositório privado.**
- [ ] Para GitHub Pages em `https://wigowigo10.github.io/PulseScape/`, verificar `base: '/PulseScape/'` no Vite, **somente quando esse endereço for o escolhido**. Para hospedagem na raiz, usar base adequada à raiz.
- [ ] Executar `npm run build` e `npm run preview` no caminho de produção; verificar favicon, CSS, JS e **chunk dinâmico da Esfera** sem erros 404.
- [ ] Não publicar a pasta `src/` ou arquivos de áudio; o deploy estático deve conter apenas o resultado necessário de `dist/`.
- [ ] Confirmar que o site será acessível publicamente mesmo quando o repositório-fonte continuar privado, salvo mecanismos específicos de restrição de acesso.

**Aceitação:** há uma estratégia de deploy aprovada e um build validado em ambiente equivalente, mas nenhum site foi publicado por esta etapa.

### P2.2 — Documentação, privacidade e acessibilidade

- [ ] Atualizar `README.md` com estado real, browsers testados, versão Node correta, limitações móveis e comandos.
- [ ] Revisar `AGENTS.md`: diferenciar requisitos ainda pendentes de itens já implementados e validados, mantendo histórico em `docs/decisions.md`.
- [ ] Verificar ausência de requisições de upload de áudio ou telemetria do conteúdo; seleção deve continuar processada localmente. O download do bundle Web/Three.js não é upload do arquivo musical.
- [ ] Verificar teclado, foco visível, rótulos acessíveis, contraste, avisos de erro e `prefers-reduced-motion`.
- [ ] Registrar resultados de testes no celular e no desktop, inclusive falhas conhecidas.

**Aceitação:** quem abre o site entende o que ele faz, quais arquivos aceita, seus limites e que as músicas não são enviadas a um servidor.

## Matriz mínima de verificação manual

| Ambiente | Jornada | Presets / verificações |
|---|---|---|
| Chrome/Edge no Windows | escolher → tocar → buscar → trocar arquivo → pausar | seis presets; console; memória; fullscreen quando disponível |
| Firefox no Windows | mesmo fluxo principal | Canvas 2D, WebGL2, áudio, erros, troca de presets |
| Chrome no Galaxy A54 (Android) | URL HTTPS → arquivo local → tocar → trocar preset | toque, retrato/paisagem, performance e WebGL2 |
| Android com economia de bateria / aba inativa | pausar, alternar aplicativo, voltar | retomada coerente; sem renderização duplicada |
| Arquivo grande/áudio longo | selecionar, aguardar, reproduzir, trocar | pico de memória; medição opcional; nenhuma queda da página |
| Ambiente sem WebGL2 ou import dinâmico falhando | reproduzir e tentar Esfera/Montanhas | fallback 2D e mensagem legível |

## Portões de aprovação (go/no-go)

**Bloqueia publicação:** falha na jornada principal em desktop ou Android, travamento por arquivos grandes comuns, tela preta permanente na Esfera, vazamentos graves após trocas repetidas, erros de build/typecheck/lint/testes ou falha em carregar assets/chunks do build de produção.

**Pode ser documentado para uma primeira versão:** FPS reduzido em um preset pesado, fullscreen indisponível em um navegador específico, formatos de áudio não suportados pelo navegador, diferenças visuais secundárias entre dispositivos. Essas limitações não devem inutilizar o player.

## Ordem de execução sugerida para Codex

1. Registrar o baseline de `master` e executar a suíte existente sem editar código.
2. Corrigir **P0.1** e **P0.2** separadamente, adicionando testes onde possível.
3. Validar **P0.3** e **P0.4**; só então ajustar UI/compatibilidade se os testes mostrarem problema.
4. Executar P1.1–P1.5 em incrementos pequenos, preservando as decisões existentes.
5. Fazer ensaio de release P2 e apresentar relatório com evidências. **Parar antes de publicar.**

### Modelo de relatório por tarefa

```text
ID: P0.x
Diagnóstico: confirmado / não reproduzido / requer dispositivo
Alterações: arquivos e motivo
Verificação: comando, navegador/dispositivo e resultado
Regressões: quais testes foram adicionados ou executados
Pendências e riscos: ...
Próximo passo: ...
```

## Comandos de baseline (na raiz do repositório)

```bash
git status --short
node --version
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

`npm run preview` inicia um servidor local; abrir o endereço exibido e testar no navegador. **Não inferir aprovação dos comandos apenas por estarem listados aqui.**

## Referências de arquitetura e publicação

- Código atual: `src/audio/AudioEngine.ts`, `src/components/VisualizerCanvas.tsx`, `src/visualizations/sphere.ts`, `src/App.tsx`, `vite.config.ts`.
- Decisões implementadas e medições históricas: [`docs/decisions.md`](decisions.md). Medições anteriores não substituem testes recentes no Android.
- [Vite — Getting Started (requisitos de Node)](https://vite.dev/guide/).
- [Vite — Deploying a Static Site / GitHub Pages](https://vite.dev/guide/static-deploy).
- [GitHub — Configuring a publishing source for GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

---

## Registro de execução

### 2026-11-22 — sessão 1 (desktop, Chromium; sem dispositivo físico)

| ID | Diagnóstico | Resultado | Detalhes |
|---|---|---|---|
| Baseline | `cd2c88f` | typecheck, lint, 79/79 testes, build OK | Node 24.11.1; `npm ci` não executado (evita quebrar o `npm run dev` aberto no Windows) |
| P0.1 | confirmado | corrigido e validado | decodificação a 8 kHz, limites 80 MB/15 min, uma decodificação por vez (D17) |
| P0.2 | confirmado | corrigido e validado | `VisualizationHost` com redesenho e fallback com aviso (D18) |
| P0.3 | confirmado (2 defeitos) | corrigido e validado | falha parcial do Web Audio: contexto órfão a cada play e áudio mudo (D17). Jornada instrumentada (seletor real + arrastar): cancelar, mesmo arquivo 2×, play, volume, busca até o fim, tocar de novo, pausa, vazio, não-áudio, corrompido e recuperação, troca em loading/playing, 18 trocas de preset, recarga — todos OK; 7 URLs criadas/6 revogadas (1 viva = faixa atual), **1 `AudioContext`** na sessão, **≤ 1 callback de rAF por quadro**, 0 erros no console. **Não verificado:** segundo plano (o Chromium automatizado manteve a aba “visible”) — testar no celular |
| P0.4 | parcial (emulado) | layout corrigido | seletor vazando, alvos de toque pequenos (D19); **requer teste no Galaxy A54** |
| P1.1 | parcial | aviso visível no fallback 3D | seletor ainda mostra o modo 3D escolhido enquanto exibe o Anel; perda/restauração de contexto não exercitada |

| P1.5 | — | workflow criado | `.github/workflows/pages.yml`: verificação em push/PR com Node 24; README com Node 20.19+/22.12+ (D20). Execução no GitHub ainda não observada (depende de push) |
| P2.1 | — | preparado, **não publicado** | `base: '/PulseScape/'`; deploy só com repositório público; `build` + `preview` sem 404, chunk da Esfera sob demanda, console limpo (D20) |

Após a sessão: typecheck, lint, **88/88 testes** (+9 de `trackAnalysis`) e build OK.

**Conclusão:** estabilizar primeiro o áudio, o carregamento assíncrono dos presets e a experiência Android; automatizar verificações; só depois decidir e habilitar a hospedagem. O objetivo não é acrescentar funcionalidades, e sim tornar o que já existe confiável para acesso público.
