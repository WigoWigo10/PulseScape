# PulseScape

Visualizador musical para o navegador, inspirado nas visualizações do Windows Media Player e do Winamp/MilkDrop.

Escolha um arquivo de áudio do seu computador e ouça-o com visualizações reativas. **O arquivo é processado apenas no navegador — nada é enviado pela rede.**

## Estado atual

- [x] Botão “Selecionar áudio” com seletor nativo de arquivos
- [x] Player local: reproduzir/pausar, progresso com busca, tempo e volume
- [x] Estados: sem arquivo, carregando, pronto, reproduzindo, pausado, encerrado e erro
- [x] Rejeição amigável de arquivos que não são áudio e de formatos não decodificáveis
- [x] Espectro de frequências (Canvas 2D, escala logarítmica, picos, reflexo)
- [x] Arquivos `.mpeg` (ex.: áudios exportados pelo WhatsApp)
- [x] Preset **Anel**: espectro radial com cor por intensidade, núcleo pulsante, forma de onda circular e faíscas a cada batida de grave
- [x] Forma de onda flutuante acima das barras; troca de preset sem reiniciar o áudio
- [x] Arrastar e soltar arquivo (processado localmente)
- [x] Preset **Túnel**: voo através de anéis do espectro, com velocidade que acompanha a música
- [x] Preset **Montanhas** (3D, WebGL2 sem biblioteca): terreno synthwave feito com o histórico do espectro
- [x] Preset **Esfera** (3D, Three.js carregado sob demanda): esfera marmorizada deformada pelo espectro
- [x] Osciloscópio — preset **Onda** (rastro de fósforo, cor por intensidade)
- [x] Reforço de visualização para músicas baixas, decidido para a faixa inteira (som não é alterado)
- [ ] Tela cheia

## Requisitos

- Node.js **20.19+ ou 22.12+** (exigência do Vite 8; desenvolvido e verificado no CI com **24**) e npm
- Em desenvolvimento o app abre em `http://localhost:5173/PulseScape/` (mesmo caminho do GitHub Pages)
- Navegador alvo: Chrome, Edge ou Firefox atuais

## Publicação (GitHub Pages)

Endereço previsto: `https://wigowigo10.github.io/PulseScape/` (`base: '/PulseScape/'` no `vite.config.ts`).

O workflow `.github/workflows/pages.yml` roda em todo push e pull request: `npm ci → typecheck → lint → test → build`. A etapa de publicação **só executa com o repositório público**, em push no `master`; enquanto ele for privado, nada é publicado. Para publicar: tornar o repositório público e, em *Settings → Pages*, escolher **GitHub Actions** como fonte. O site contém apenas o `dist/` (HTML, CSS, JS e o arquivo separado do Three.js) — nem o código-fonte nem áudios.

## Scripts

| Comando             | O que faz                                  |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Servidor de desenvolvimento (Vite)         |
| `npm run build`     | Typecheck + build de produção em `dist/`   |
| `npm run preview`   | Serve o build de produção localmente       |
| `npm run typecheck` | Verificação de tipos (`tsc -b`)            |
| `npm run lint`      | Lint com oxlint                            |
| `npm test`          | Testes unitários (Vitest)                  |

## Formatos

São aceitos os formatos que **o seu navegador** consegue decodificar (geralmente MP3, WAV, OGG/Opus, AAC/M4A; FLAC na maioria dos navegadores modernos). Não há garantia para todos os arquivos em todas as plataformas; formatos não suportados exibem uma mensagem de erro.

## Estrutura

```text
src/
  audio/            # AudioEngine (pipeline Web Audio), AudioFrame/FrameReader, validação
  visualizations/   # Contrato de preset e o espectro (lógica pura em spectrumBands.ts)
  components/       # Seletor, canvas de visualização, controles, status, ícones
  hooks/        # useAudioEngine
  styles/       # CSS global (tema escuro)
  tests/        # Testes Vitest de lógica pura
docs/
  decisions.md  # Decisões técnicas
```

Diretrizes para agentes de programação: [AGENTS.md](AGENTS.md).
