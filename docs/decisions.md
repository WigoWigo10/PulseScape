# Decisões técnicas

Registro das decisões que afetam arquitetura e ferramentas. Cada item tem contexto, decisão e consequência.

## D1 — Pipeline de áudio único (2026-11-21)

**Contexto.** Um `HTMLAudioElement` aceita apenas um `MediaElementAudioSourceNode` durante toda a sua vida; criar outro lança `InvalidStateError`. Em React, isso aparece com StrictMode (montagem dupla em dev) ou ao recriar nós na troca de faixa.

**Decisão.** `src/audio/AudioEngine.ts` encapsula um `<audio>`, uma fonte, um `AnalyserNode`, um `GainNode` e um `AudioContext`. Trocar de faixa altera apenas `audio.src` (com `URL.revokeObjectURL` da URL anterior). O `AudioContext` é criado no primeiro `play()` — dentro do gesto do usuário — e retomado a cada reprodução.

Grafo: `<audio> → source → analyser → gain → destination`.

**Consequências.**
- O volume fica **depois** do analisador: a visualização não perde intensidade com volume baixo.
- `useAudioEngine` cria uma instância por montagem e chama `dispose()` no cleanup; em StrictMode cada instância tem seu próprio `<audio>`, então nunca há duas fontes no mesmo elemento.
- `dispose()` remove listeners (`AbortController`), libera a URL de objeto, desconecta nós e fecha o contexto.
- O estado sai como snapshot imutável via `useSyncExternalStore`, atualizado por eventos de mídia (`timeupdate` ≈ 4 Hz), nunca a 60 FPS.

## D2 — Contrato de dados analisados (2026-11-21, implementado em `src/audio/analysis.ts`)

```ts
interface AudioFrame {
  frequency: Uint8Array   // getByteFrequencyData, tamanho fftSize/2
  timeDomain: Uint8Array  // getByteTimeDomainData, tamanho fftSize
  sampleRate: number
  fftSize: number
  deltaMs: number         // tempo desde o frame anterior
}
```

Arrays pré-alocados e reutilizados; presets recebem o frame e não acessam o `AudioContext`.

## D3 — Validação de arquivos (2026-11-21)

**Decisão.** `validateAudioFile` apenas rejeita o que claramente não é áudio (MIME não `audio/*` e extensão desconhecida, ou arquivo vazio). A palavra final é do evento `error` do `<audio>`.

**Motivo.** `canPlayType` e o MIME do sistema dão falsos negativos (ex.: FLAC/M4A com `type` vazio no Windows). Arquivo rejeitado gera aviso e **não** interrompe a faixa atual; falha de decodificação coloca o player em estado de erro.

Observado no Chromium: arquivo corrompido com extensão `.mp3` é reportado como `MEDIA_ERR_SRC_NOT_SUPPORTED`, por isso a mensagem desse código cobre “formato não suportado ou arquivo corrompido”.

## D4 — Ferramentas (2026-11-21)

- npm; React 19 + TypeScript (strict + `noUncheckedIndexedAccess`) + Vite.
- **oxlint**, que é o linter do template oficial atual do Vite (substitui ESLint).
- **Vitest** para lógica pura (`src/tests/`). Web Audio não existe em jsdom; integração é validada no navegador. Playwright como suíte automatizada fica para uma etapa futura.

## D5 — Navegadores-alvo do MVP (2026-11-21)

Chrome, Edge e Firefox atuais. Safari/iOS não são garantidos (limitações de autoplay e Fullscreen API).

## D7 — Loop de renderização e espectro (2026-11-21)

**Loop.** `VisualizerCanvas` é dono do único `requestAnimationFrame`. Roda enquanto o status é `playing`; ao pausar/encerrar continua até o preset reportar `isIdle()` (barras assentadas) e então para — zero frames com o áudio parado. Retoma no próximo play. `deltaMs` é limitado a 100 ms; DPR limitado a 2; `ResizeObserver` redimensiona e redesenha sem avançar a animação.

**Contrato de preset** (`src/visualizations/types.ts`): `resize(w, h)`, `render(ctx, frame | null, deltaMs)`, `isIdle()`, `dispose()`.

**Espectro** (`spectrum.ts` + lógica pura em `spectrumBands.ts`):
- `AnalyserNode`: `fftSize` 4096, `smoothingTimeConstant` 0,5, faixa −90…−20 dB.
- 64 bandas logarítmicas de 30 Hz a 16 kHz (limitado a 95% de Nyquist); bandas mais estreitas que um bin são interpoladas.
- Compensação de agudos **multiplicativa** (+5%/oitava acima de 1 kHz) e curva gamma 1,6 para não saturar. Uma versão aditiva mantinha os agudos acesos em silêncio e impedia o loop de parar — coberto por teste de regressão.
- Envelope por tempo (ataque 35 ms, liberação 220 ms) e picos com hold de 380 ms, independentes da taxa de quadros.
- `prefers-reduced-motion`: movimento mais lento e sem marcadores de pico.

## D8 — Presets, anel e forma de onda (2026-11-21)

- **Registro** (`src/visualizations/registry.ts`): lista `{ id, label, create }`. Trocar de preset troca só a instância de `Visualization` dentro do `VisualizerCanvas`; loop, `FrameReader` e áudio continuam (validado: reprodução segue e o loop mantém a cadência na troca).
- **Bandas compartilhadas**: `createBandTracker` (em `spectrumBands.ts`) concentra layout, níveis e envelope, usado por Barras e Anel.
- **Anel** (`ring.ts`): 64 bandas espelhadas (graves no topo). Cor por **intensidade** — gradiente radial da base (ciano) à ponta (rosa), não por ângulo. Raio e núcleo pulsam com os graves (~40–130 Hz); brilho ambiente preenche o palco. Dentro: forma de onda circular.
- **Forma de onda** (`waveform.ts`, lógica pura): reamostra metade do `timeDomain` a partir do primeiro cruzamento ascendente de zero (gatilho de osciloscópio, evita “correr” lateralmente), suavização por `deltaMs`. Usada dentro do anel e acima das barras. `isIdle()` do preset exige bandas **e** onda assentadas.
- **Estados da interface**: tela inicial com chamada principal e arrastar-e-soltar (arquivo tratado localmente, como no seletor); botão central “Tocar”/“Tocar de novo” em pronto/encerrado; cartão de erro com “Escolher outro arquivo”; avisos em toast; faixa atual + status no rodapé.

## D9 — Ganho de visualização por faixa, não por trecho (2026-11-21)

**Requisito do responsável:** reforçar a visualização apenas quando a **música inteira** é baixa; trechos baixos de uma música normal (ex.: introdução suave) **não** devem ser compensados. Um controle automático por trecho (ataque/liberação) foi iniciado e descartado por isso.

**Decisão.** Ao carregar, `AudioEngine.analyzeTrack` lê o arquivo localmente (`file.arrayBuffer()`), decodifica com `OfflineAudioContext.decodeAudioData` (fora da thread principal, sem gesto do usuário, sem rede) e `measureLoudness` (`src/audio/loudness.ts`) calcula o **percentil 90 do RMS em janelas de 400 ms**, ignorando silêncio (< −60 dBFS). Reforço = `clamp(−14 dBFS − medida, 0, 18)` dB, arredondado a 0,5 dB, **fixo para a faixa toda**.

**Aplicação.** Desloca a faixa de dB do `AnalyserNode` (−90…−20 → −90−g…−20−g): equivale a “aumentar o volume” só para a análise; silêncio continua zero e o som não muda. A forma de onda recebe o mesmo ganho linear (`AudioFrame.waveGain`). O rodapé mostra “visual +X dB” quando há reforço. Troca de faixa zera o ganho antes de medir a nova; análises atrasadas são descartadas por token.

**Medido** (Chromium): as três faixas de teste do responsável são masterizadas alto (P90 −4,9 / −6,9 / −8,9 dBFS) → 0 dB, como esperado. Uma cópia de 30 s da faixa 3 a −15 dB recebeu +12 dB e ficou visualmente equivalente à original. Decodificação 0,7–2 s em segundo plano; medição 50–80 ms.

**Custo.** A decodificação mantém o PCM em memória temporariamente (~90 MB para 4 min estéreo a 48 kHz), liberado após a medição.

## D10 — Preset Onda (osciloscópio) e desempenho (2026-11-21)

Forma de onda em largura total com gatilho, rastro de fósforo (cópias a cada 30 ms), cor por intensidade (ciano no centro, rosa nos extremos), retícula e brilho de graves. Sem rastro em `prefers-reduced-motion`.

**Medição de desempenho** (Intel Arc via ANGLE/D3D11, DPR 2, canvas 2880×1224, tela 120 Hz): o JS de desenho gasta < 0,5 ms/quadro; o gargalo é a rasterização na GPU de traços longos e sinuosos. Primeira versão: ~40 FPS (Barras/Anel: 120). Junções chanfradas (`bevel`) no lugar de arredondadas, rastro de 7→5 cópias com metade dos pontos: **74–85 FPS**. Remover o brilho ou a mistura aditiva não trouxe ganho mensurável (mantidos).

## D11 — Preset Túnel: voo através dos anéis (2026-11-21)

**Primeira versão descartada:** anel ao vivo fixo na frente + histórico encolhendo atrás. Avaliação do responsável: “sem graça, apenas um Anel com algo a mais no meio” — nada passava pela câmera, então não havia sensação de movimento.

**Decisão.** Cada anel nasce pequeno no ponto de fuga com o espectro daquele instante e viaja até a câmera (z de 9 → 0,42, escala = 1/z), passando pelas bordas da tela. Não há anel fixo.
- `snapshotHistory.ts` captura por **distância percorrida** (odômetro = Σ deltaMs × velocidade): espaçamento constante entre anéis em qualquer velocidade.
- Velocidade = 0,55 + 2,4 × energia média suavizada (250 ms): trechos fortes viram *warp*. Reduzir movimento: velocidade fixa 0,4, sem giro nem curva.
- Ponto de fuga oscila (túnel com curvas), giro global por distância e espiral ao longo da profundidade.
- Reação imediata: brilho de todos os anéis e núcleo no fundo seguem o grave atual.

**Desempenho medido** (mesmo ambiente de D10): versão inicial com anéis a cada 45 ms ≈ 40 FPS; versão de voo com anéis a cada 70 unidades e metade das barras nos anéis pequenos ≈ **71–73 FPS** (Anel: 120). O custo restante são os anéis grandes perto da câmera.

## D12 — Impacto por batida no Túnel (2026-11-21)

**Avaliação do responsável:** túnel “muito rápido”, sem sentir visualmente o impacto que se sente no som. Causa: velocidade alta e contínua guiada pela energia média; nada reagia a **ataques**.

**Detecção de batida** (`beatDetector.ts`, lógica pura): **fluxo espectral positivo** nas bandas de grave (~35–140 Hz) — soma das subidas entre quadros. Limiar adaptativo = média + 1,5 × desvio médio (EMA 400 ms) + 0,003; dispara ao cruzar o limiar para cima; intervalo mínimo 180 ms; impulso decai em 220 ms.
- Uma primeira versão por **nível** (`nível > média × 1,3`) detectou ~0,1 batida/s nas músicas reais: masterização alta deixa o grave preso em ~0,42–0,65 e o bumbo só o eleva ~0,05–0,1.
- Calibração por simulação offline (`OfflineAudioContext` + `suspend`, mesmo analisador e mesmo código do app) em 30 s de cada faixa de teste, grade de 12 combinações. Resultado do código final: **1,57 / 1,97 / 1,50 batidas/s**, intervalos medianos 701 / 485 / 552 ms (tempos plausíveis).

**Túnel:** base lenta (0,22 + 0,35 × energia); cada batida dá **tranco** (+2,6 × impulso), **clarão** (ambiente, anéis e núcleo), **onda de choque** do fundo para fora e **marca o anel** nascido no instante (contorno claro e grosso), que viaja pelo túnel. Reduzir movimento: sem tranco nem onda; clarão atenuado.

**Ajuste (avaliação: “impacto ok, mas a vinda do túnel está agressiva”):** tranco 2,6 → 1,1 e velocidade com rampa (sobe em ~80 ms, desce em ~350 ms) em vez de salto instantâneo. Clarão, onda de choque e anel marcado continuam instantâneos — são eles que carregam o impacto.

**Parada:** com a base lenta os anéis levavam ~7 s para sair após a pausa; agora o túnel congela após 1,5 s de silêncio (medido: ~1,7 s até parar). **Desempenho:** 62–64 FPS (Anel: 120), DPR 2.

## D13 — Velocidade do Túnel: aceleração nos destaques (2026-11-21)

**Requisito do responsável:** velocidade não constante, com aceleração nos pontos/batidas fortes da música. Ajustes do próprio responsável preservados: rampa de subida 150 ms, giro 0,7.

**Decisão** (`tunnelMotion.ts`, lógica pura com testes): velocidade-alvo = base 0,22 + 1,6 × **embalo** + 0,6 × **trecho forte**, perseguida com rampa (sobe 150 ms, desce 350 ms).
- **Embalo:** cada batida soma peso conforme o quanto o golpe **supera o excesso típico das ~7 batidas anteriores** (`BeatDetector.lastExcess`, sem teto), com piso relativo de 50% do típico; decai em 450 ms; máximo 1,5.
- **Trecho forte:** energia média de 2 s acima da média de 8 s, normalizada por 0,18.

**Iterações medidas** (simulação offline, 60 s de cada faixa de teste, mesmo caminho do app):
1. Força absoluta (≥ 0,45 = forte): 77–110 de 83–116 batidas eram “fortes”; velocidade mediana 5–6× a base, > 2× a base em 90–95% do tempo — constante de novo, só que alta.
2. Força relativa: só 14–24% das batidas aceleram, mas o trecho forte (0,06 / 800 ms) ficava ativo 39% do tempo e ainda segurava a velocidade alta (mediana 3,2–3,5×).
3. Trecho menos sensível (0,18 / 2 s): **mediana 2,0–2,3× a base, picos 6,7–8,9×** — picos 3–4× acima do típico, ou seja, acelerações que se destacam.

## D14 — Faíscas no Anel (2026-11-21)

**Pedido:** “Anel com partículas: o anel atual soltando faíscas a cada batida de grave”. Implementado primeiro como preset separado (“Faíscas”); a pedido do responsável passou a ser **o próprio Anel** — a opção e o preset separado foram removidos.

- **Partículas** (`particles.ts`, lógica pura): pool fixo de 700 em Float32Arrays compactados (remoção por troca com a última viva), sem alocação por quadro; com o pool cheio, substitui a de menor vida restante. Arrasto independente da taxa de quadros.
- **Disparo:** mesmo detector de batida do Túnel (fluxo de graves, D12). Quantidade = 18 + 50 × força (~38–68 por batida).
- **Origem:** sorteio ponderado por nível² entre as 128 barras (busca binária no acumulado) — as faíscas saem das pontas das barras mais fortes.
- **Física/aparência:** velocidade radial com leve desvio tangencial, arrasto 480 ms, vida 0,5–1,1 s; riscos cujo comprimento acompanha a velocidade; cor pela intensidade da barra de origem; 9 lotes de desenho (3 cores × 3 opacidades), mistura aditiva. Posições em fração do tamanho do palco (resistente a redimensionamento). Reduzir movimento: 30% das faíscas, metade da velocidade.
- **Medido:** 107–120 FPS (Anel sem faíscas: 120); após pausar, faíscas somem e o loop para em ~2 s.

## D15 — WebGL2 sem biblioteca e preset Montanhas (2026-11-21)

**Justificativa para WebGL** (o `AGENTS.md` pede necessidade justificada): medições de D10–D12 mostraram que o Canvas 2D fica limitado pela rasterização de traços longos (Onda ~80 FPS, Túnel ~62–73 FPS). Um terreno 3D com dezenas de linhas longas seria pior em 2D. WebGL2 puro (sem Three.js) basta para o terreno.

**Infraestrutura:**
- `Visualization` virou união `Visualization2D | VisualizationGL` (`kind: '2d' | 'webgl2'`). Presets GL têm `init(gl)` (shaders/buffers/texturas), `resize(w, h, pixelW, pixelH)` e `dispose(gl | null)`.
- `VisualizerCanvas` mantém **dois canvases sobrepostos** (um canvas não troca de contexto) e mostra o do preset ativo; mede o contêiner (canvas oculto mede 0). O contexto WebGL2 é criado só quando um preset GL é ativado e reutilizado depois.
- Perda de contexto: `webglcontextlost` (com `preventDefault`) pausa o desenho GL; `webglcontextrestored` chama `init` de novo. Falha de WebGL2 ou de shader: aviso no console e queda para o Anel (2D).
- `gl/mat4.ts` (perspectiva, lookAt, multiplicação — testados) e `gl/glUtils.ts` (compilação com log do driver).

**Montanhas** (`mountains.ts` + `mountainsData.ts` testado): grade 128 × 72 (índices de 16 bits). A cada 50 ms uma fatia do espectro, **espelhada com graves no centro**, entra na frente; o histórico mora numa textura R8 (uma linha por captura via `texSubImage2D`) lida com `texelFetch` no vertex shader; `uFrac` faz o terreno fluir entre capturas. Superfície escura com `polygonOffset` esconde as linhas de trás; wireframe colorido pela altura, névoa por profundidade, sol listrado que pulsa com graves, brilho das linhas na batida (mesmo detector de D12), câmera com leve balanço. Em silêncio o terreno congela após 1,5 s. Reduzir movimento: sem balanço nem animação das faixas, capturas a cada 90 ms.

**Degradê revisado** (pedido do responsável): a rampa ciano → roxo → rosa deixava quase tudo roxo (alturas raramente > 0,7). Agora 5 paradas por altura — índigo (vales) → ciano → violeta → magenta → âmbar (picos, mesmo tom do sol) — com altura redistribuída (`smoothstep(0,02; 0,72)`), perspectiva atmosférica puxando o fundo para o rosa do sol e linhas/faces mais luminosas.

**Medido** (Intel Arc, DPR 2, canvas 2880×1112): **120 FPS** estáveis (Anel 120, Túnel 91 na mesma sessão); troca 3D↔2D sem falhas; loop para ~3 s após pausar; console sem erros.

## D16 — Three.js e preset Esfera (2026-11-21)

**Dependência aprovada pelo responsável:** `three@0.187.0` (dependência) e `@types/three@0.187.0` (dev). `npm install` sem vulnerabilidades reportadas.

**Carregamento sob demanda:** `sphere.ts` usa `import('three')` dinâmico no `init`; o Vite gera um chunk separado. Medido no build: bundle principal 87,9 KB gzip; `three.module` **187,7 KB gzip** (742,8 KB minificado) — acima da estimativa inicial de ~150 KB. Medido no navegador: nenhuma requisição do Three.js antes de escolher a Esfera. Enquanto carrega, o canvas fica limpo.

**Contexto compartilhado:** o `WebGLRenderer` recebe o canvas e o contexto WebGL2 do `VisualizerCanvas` (os mesmos das Montanhas). `renderer.resetState()` antes e depois de cada quadro mantém consistentes o cache de estado do Three.js e o código WebGL puro — verificado visualmente: Montanhas corretas após a Esfera. Troca rápida de preset / restauração de contexto invalidam carregamentos antigos por contador de geração.

**Esfera:** icosaedro (detalhe 48) deformado no vertex shader por uma textura de 64 bandas (`DataTexture` R8). Banda de cada ponto = 60% latitude (graves perto do equador, agudos nos polos) + 40% campo ondulado que gira devagar — padrão marmorizado. A primeira versão (só latitude, deformação 0,45, câmera a 3,6) parecia “bolo em camadas”, clara demais e grande demais; ajustada para deformação 0,34, câmera 4,8, corpo escuro com cristas e borda (fresnel) luminosas, wireframe discreto. Mesma paleta das Montanhas. Pulsa com o grave, gira mais rápido nas batidas; reduzir movimento: giro lento constante, sem ondulação animada. Em pausa repousa como esfera lisa com borda violeta.

**Medido** (mesmo ambiente): **120 FPS** na Esfera, nas Montanhas e no Anel, alternando entre eles várias vezes; loop para ~1,6 s após pausar; console sem erros.

## D6 — Estrutura de pastas plana (2026-11-21)

Começar com `src/audio/`, `src/components/`, `src/hooks/`, `src/styles/`, `src/tests/` e, depois, `src/visualizations/`. Subdividir (`sources/`, `engine/`, `presets/`…) apenas quando houver mais de uma implementação por responsabilidade.
