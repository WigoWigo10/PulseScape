import { bassFlux, createBeatDetector } from './beatDetector'
import { createProgram, uniform } from './gl/glUtils'
import { createMat4, lookAt, multiply, perspective } from './gl/mat4'
import { buildGridVertices, buildLineIndices, buildSurfaceIndices, fillMirroredRow } from './mountainsData'
import type { PresetOptions } from './spectrum'
import { averageLevel, createBandTracker, ENVELOPE_MOTION, ENVELOPE_REDUCED_MOTION } from './spectrumBands'
import type { VisualizationGL } from './types'

/** Fatias de histórico (profundidade) e intervalo entre capturas. */
const ROWS = 72
const CAPTURE_MS = 50
const CAPTURE_MS_REDUCED = 90
/** Linhas longitudinais do wireframe a cada N colunas. */
const LINE_COL_STEP = 2
/** Mundo: largura e profundidade do terreno, altura máxima das montanhas. */
const WORLD_WIDTH = 7
const WORLD_DEPTH = 8
const HEIGHT_AMP = 0.9
const BASS_FROM = 3
const BASS_TO = 15
const FLUX_FROM = 2
const FLUX_TO = 16
/** Em silêncio o terreno congela (em vez de achatar) após este tempo — como no Túnel. */
const FREEZE_AFTER_SILENCE_MS = 1500

const TERRAIN_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec2 aCell;
uniform sampler2D uHeights;
uniform int uHead;
uniform float uFrac;
uniform vec2 uGrid;
uniform mat4 uViewProj;
uniform float uWidth;
uniform float uDepth;
uniform float uAmp;
out float vHeight;
out float vDepth;
void main() {
  int rows = int(uGrid.y);
  int row = int(aCell.y);
  // Linha 0 = fatia mais recente (escrita em uHead); as anteriores vêm antes no anel.
  int texRow = (uHead - row + rows * 4) % rows;
  float h = texelFetch(uHeights, ivec2(int(aCell.x), texRow), 0).r;
  float depth = (aCell.y + uFrac) / (uGrid.y - 1.0);
  float x = (aCell.x / (uGrid.x - 1.0) - 0.5) * uWidth;
  vHeight = h;
  vDepth = depth;
  gl_Position = uViewProj * vec4(x, h * uAmp, -depth * uDepth, 1.0);
}`

const TERRAIN_FS = `#version 300 es
precision highp float;
in float vHeight;
in float vDepth;
uniform int uMode;
uniform float uPulse;
out vec4 outColor;
// Degradê por altura em 5 paradas: vale índigo → ciano → violeta → magenta → pico
// âmbar (o tom quente do sol). Versão anterior (ciano → roxo → rosa) deixava quase
// tudo roxo, porque as alturas raramente passam de ~0,7.
const vec3 INDIGO = vec3(0.20, 0.14, 0.55);
const vec3 CYAN = vec3(0.133, 0.827, 0.933);
const vec3 VIOLET = vec3(0.545, 0.36, 1.0);
const vec3 MAGENTA = vec3(1.0, 0.33, 0.70);
const vec3 AMBER = vec3(1.0, 0.76, 0.42);
const vec3 SUN_PINK = vec3(1.0, 0.42, 0.62);
vec3 ramp(float t) {
  if (t < 0.22) return mix(INDIGO, CYAN, t / 0.22);
  if (t < 0.5) return mix(CYAN, VIOLET, (t - 0.22) / 0.28);
  if (t < 0.78) return mix(VIOLET, MAGENTA, (t - 0.5) / 0.28);
  return mix(MAGENTA, AMBER, (t - 0.78) / 0.22);
}
void main() {
  // Névoa: o fundo se dissolve no palco.
  float fog = 1.0 - smoothstep(0.35, 1.0, vDepth);
  // Altura redistribuída para usar a escala inteira de cores.
  float h = smoothstep(0.02, 0.72, vHeight);
  // Perspectiva atmosférica: ao fundo as cores puxam para o rosa do sol.
  float haze = smoothstep(0.45, 1.0, vDepth) * 0.55;
  if (uMode == 0) {
    // Superfície escura com leve brilho da própria cor: esconde as linhas de trás.
    vec3 color = vec3(0.027, 0.031, 0.051) + mix(ramp(h), SUN_PINK, haze) * (0.05 + 0.12 * h);
    float alpha = 0.94 * fog;
    outColor = vec4(color * alpha, alpha);
  } else {
    // Linhas: cor pela altura, horizonte rosado, mais brilho na batida.
    vec3 color = mix(ramp(h), SUN_PINK, haze) * (0.95 + 0.6 * uPulse);
    float alpha = fog * (0.45 + 0.55 * h);
    outColor = vec4(color * alpha, alpha);
  }
}`

const SUN_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

const SUN_FS = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uBass;
uniform float uScroll;
out vec4 outColor;
void main() {
  // Coordenadas normalizadas pela altura (círculo sem distorção).
  vec2 p = gl_FragCoord.xy / uResolution.y;
  vec2 center = vec2(0.5 * uResolution.x / uResolution.y, 0.6);
  float r = 0.17 * (1.0 + 0.1 * uBass);
  float d = length(p - center);
  float t = clamp((p.y - (center.y - r)) / (2.0 * r), 0.0, 1.0);
  vec3 color = mix(vec3(1.0, 0.361, 0.659), vec3(1.0, 0.78, 0.45), t);
  float disk = 1.0 - smoothstep(r - 0.002, r + 0.002, d);
  // Faixas horizontais na metade de baixo, mais largas perto do horizonte.
  float stripe = 1.0;
  if (p.y < center.y) {
    float below = (center.y - p.y) / r;
    float s = fract((center.y - p.y) * 30.0 - uScroll);
    stripe = step(mix(0.08, 0.55, below), s);
  }
  float body = disk * stripe;
  float glow = exp(-max(d - r, 0.0) * 8.0) * (0.18 + 0.4 * uBass) * (1.0 - disk);
  vec3 premultiplied = color * body * 0.95 + vec3(1.0, 0.36, 0.66) * glow;
  outColor = vec4(premultiplied, max(body * 0.95, glow * 0.8));
}`

interface GlResources {
  terrain: WebGLProgram
  sun: WebGLProgram
  terrainVao: WebGLVertexArrayObject
  sunVao: WebGLVertexArrayObject
  buffers: WebGLBuffer[]
  surfaceIndexBuffer: WebGLBuffer
  lineIndexBuffer: WebGLBuffer
  surfaceCount: number
  lineCount: number
  heights: WebGLTexture
  u: {
    heights: WebGLUniformLocation
    head: WebGLUniformLocation
    frac: WebGLUniformLocation
    grid: WebGLUniformLocation
    viewProj: WebGLUniformLocation
    width: WebGLUniformLocation
    depth: WebGLUniformLocation
    amp: WebGLUniformLocation
    mode: WebGLUniformLocation
    pulse: WebGLUniformLocation
    sunResolution: WebGLUniformLocation
    sunBass: WebGLUniformLocation
    sunScroll: WebGLUniformLocation
  }
}

/**
 * Montanhas 3D (WebGL2, sem biblioteca): o histórico do espectro vira um terreno.
 * A cada 50 ms uma fatia (espelhada, graves no centro) entra na frente e o terreno
 * flui para o fundo. O histórico mora numa textura R8 (uma linha enviada por
 * captura) lida pelo vertex shader. Wireframe com oclusão, névoa, sol listrado que
 * pulsa com os graves e linhas que brilham na batida. Ver docs/decisions.md, D15.
 */
export function createMountains({ bandCount = 64, reducedMotion = false }: PresetOptions = {}): VisualizationGL {
  const cols = bandCount * 2
  const tracker = createBandTracker(bandCount, reducedMotion ? ENVELOPE_REDUCED_MOTION : ENVELOPE_MOTION)
  const { levels } = tracker.envelope
  const beats = createBeatDetector()
  const previousLevels = new Float32Array(bandCount)
  const row = new Uint8Array(cols)
  const rowPeaks = new Float32Array(ROWS)
  const captureMs = reducedMotion ? CAPTURE_MS_REDUCED : CAPTURE_MS

  const projection = createMat4()
  const view = createMat4()
  const viewProj = createMat4()

  let res: GlResources | null = null
  let head = 0
  let sinceCapture = 0
  let silentMs = 0
  let clock = 0
  let pixelWidth = 1
  let pixelHeight = 1

  const historySilent = () => {
    for (let i = 0; i < ROWS; i++) if ((rowPeaks[i] ?? 0) > 0.004) return false
    return true
  }

  return {
    id: 'mountains',
    kind: 'webgl2',
    label: 'Montanhas',

    init(gl) {
      const terrain = createProgram(gl, TERRAIN_VS, TERRAIN_FS)
      const sun = createProgram(gl, SUN_VS, SUN_FS)

      // Grade estática: (col, row) por vértice; alturas vêm da textura.
      const terrainVao = gl.createVertexArray()
      const sunVao = gl.createVertexArray()
      const gridBuffer = gl.createBuffer()
      const quadBuffer = gl.createBuffer()
      const surfaceIndexBuffer = gl.createBuffer()
      const lineIndexBuffer = gl.createBuffer()
      const heights = gl.createTexture()
      if (!terrainVao || !sunVao || !gridBuffer || !quadBuffer || !surfaceIndexBuffer || !lineIndexBuffer || !heights) {
        throw new Error('Não foi possível alocar recursos WebGL.')
      }

      const surface = buildSurfaceIndices(cols, ROWS)
      const lines = buildLineIndices(cols, ROWS, LINE_COL_STEP)

      gl.bindVertexArray(terrainVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, buildGridVertices(cols, ROWS), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, surfaceIndexBuffer)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, surface, gl.STATIC_DRAW)
      gl.bindVertexArray(null)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndexBuffer)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lines, gl.STATIC_DRAW)

      gl.bindVertexArray(sunVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      gl.bindVertexArray(null)

      // Histórico de alturas: textura R8 cols × ROWS, uma linha por captura.
      gl.bindTexture(gl.TEXTURE_2D, heights)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, cols, ROWS, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(cols * ROWS))
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      rowPeaks.fill(0)
      head = 0

      res = {
        terrain,
        sun,
        terrainVao,
        sunVao,
        buffers: [gridBuffer, quadBuffer],
        surfaceIndexBuffer,
        lineIndexBuffer,
        surfaceCount: surface.length,
        lineCount: lines.length,
        heights,
        u: {
          heights: uniform(gl, terrain, 'uHeights'),
          head: uniform(gl, terrain, 'uHead'),
          frac: uniform(gl, terrain, 'uFrac'),
          grid: uniform(gl, terrain, 'uGrid'),
          viewProj: uniform(gl, terrain, 'uViewProj'),
          width: uniform(gl, terrain, 'uWidth'),
          depth: uniform(gl, terrain, 'uDepth'),
          amp: uniform(gl, terrain, 'uAmp'),
          mode: uniform(gl, terrain, 'uMode'),
          pulse: uniform(gl, terrain, 'uPulse'),
          sunResolution: uniform(gl, sun, 'uResolution'),
          sunBass: uniform(gl, sun, 'uBass'),
          sunScroll: uniform(gl, sun, 'uScroll'),
        },
      }
    },

    resize(_width, _height, pw, ph) {
      pixelWidth = Math.max(1, pw)
      pixelHeight = Math.max(1, ph)
    },

    render(gl, frame, deltaMs) {
      if (!res) return
      tracker.update(frame, deltaMs)
      if (deltaMs > 0) silentMs = tracker.isIdle() ? silentMs + deltaMs : 0
      const frozen = silentMs >= FREEZE_AFTER_SILENCE_MS
      const flux = deltaMs > 0 ? bassFlux(levels, previousLevels, FLUX_FROM, FLUX_TO) : 0
      beats.update(flux, deltaMs)
      const bass = averageLevel(levels, BASS_FROM, BASS_TO)

      // Nova fatia na frente a cada captura; entre capturas o terreno flui (uFrac).
      if (deltaMs > 0 && !frozen) {
        clock += deltaMs
        sinceCapture += deltaMs
        if (sinceCapture >= captureMs) {
          sinceCapture = sinceCapture >= captureMs * 2 ? 0 : sinceCapture - captureMs
          head = (head + 1) % ROWS
          rowPeaks[head] = fillMirroredRow(levels, bandCount, row)
          gl.bindTexture(gl.TEXTURE_2D, res.heights)
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, head, cols, 1, gl.RED, gl.UNSIGNED_BYTE, row)
        }
      }

      gl.viewport(0, 0, pixelWidth, pixelHeight)
      gl.clearColor(0, 0, 0, 0)
      gl.clearDepth(1)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA) // cores pré-multiplicadas

      // Sol no horizonte (atrás de tudo).
      gl.disable(gl.DEPTH_TEST)
      gl.useProgram(res.sun)
      gl.uniform2f(res.u.sunResolution, pixelWidth, pixelHeight)
      gl.uniform1f(res.u.sunBass, bass)
      gl.uniform1f(res.u.sunScroll, reducedMotion ? 0 : clock * 0.0004)
      gl.bindVertexArray(res.sunVao)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      // Câmera com leve balanço (desligado em reduzir movimento).
      const sway = reducedMotion ? 0 : Math.sin(clock * 0.00025) * 0.35
      perspective(projection, (50 * Math.PI) / 180, pixelWidth / pixelHeight, 0.1, 30)
      lookAt(view, [sway, 1.25, 1.3], [sway * 0.4, 0.15, -4], [0, 1, 0])
      multiply(viewProj, projection, view)

      gl.enable(gl.DEPTH_TEST)
      gl.depthFunc(gl.LEQUAL)
      gl.useProgram(res.terrain)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, res.heights)
      gl.uniform1i(res.u.heights, 0)
      gl.uniform1i(res.u.head, head)
      gl.uniform1f(res.u.frac, frozen ? 0 : sinceCapture / captureMs)
      gl.uniform2f(res.u.grid, cols, ROWS)
      gl.uniformMatrix4fv(res.u.viewProj, false, viewProj)
      gl.uniform1f(res.u.width, WORLD_WIDTH)
      gl.uniform1f(res.u.depth, WORLD_DEPTH)
      gl.uniform1f(res.u.amp, HEIGHT_AMP)
      gl.uniform1f(res.u.pulse, (reducedMotion ? 0.3 : 1) * beats.impulse)
      gl.bindVertexArray(res.terrainVao)

      // Superfície (empurrada para trás) e, por cima, o wireframe.
      gl.enable(gl.POLYGON_OFFSET_FILL)
      gl.polygonOffset(1, 1)
      gl.uniform1i(res.u.mode, 0)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, res.surfaceIndexBuffer)
      gl.drawElements(gl.TRIANGLES, res.surfaceCount, gl.UNSIGNED_SHORT, 0)
      gl.disable(gl.POLYGON_OFFSET_FILL)

      gl.uniform1i(res.u.mode, 1)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, res.lineIndexBuffer)
      gl.drawElements(gl.LINES, res.lineCount, gl.UNSIGNED_SHORT, 0)

      // Restaura o índice da superfície no VAO para o próximo quadro.
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, res.surfaceIndexBuffer)
      gl.bindVertexArray(null)
    },

    isIdle: () =>
      tracker.isIdle() && beats.impulse < 0.01 && (historySilent() || silentMs >= FREEZE_AFTER_SILENCE_MS),

    dispose(gl) {
      if (gl && res && !gl.isContextLost()) {
        gl.deleteProgram(res.terrain)
        gl.deleteProgram(res.sun)
        gl.deleteVertexArray(res.terrainVao)
        gl.deleteVertexArray(res.sunVao)
        for (const buffer of res.buffers) gl.deleteBuffer(buffer)
        gl.deleteBuffer(res.surfaceIndexBuffer)
        gl.deleteBuffer(res.lineIndexBuffer)
        gl.deleteTexture(res.heights)
      }
      res = null
    },
  }
}
