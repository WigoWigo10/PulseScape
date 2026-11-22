import type * as Three from 'three'
import { bassFlux, createBeatDetector } from './beatDetector'
import type { PresetOptions } from './spectrum'
import { averageLevel, createBandTracker, ENVELOPE_MOTION, ENVELOPE_REDUCED_MOTION } from './spectrumBands'
import type { VisualizationGL } from './types'

const BASS_FROM = 3
const BASS_TO = 15
const FLUX_FROM = 2
const FLUX_TO = 16
/** Subdivisão do icosaedro: suavidade da deformação × custo de vértices. */
const DETAIL = 48
/** Quanto o espectro empurra a superfície para fora (raio base = 1). */
const DISPLACEMENT = 0.34
/** Distância da câmera: a esfera ocupa ~60% da altura do palco. */
const CAMERA_DISTANCE = 4.8
/** Giro (rad/ms): base e reforço proporcional ao impulso da batida. */
const SPIN_BASE = 0.00012
const SPIN_BEAT = 0.0009
const SPIN_REDUCED = 0.00006

/** Mesma paleta das Montanhas: índigo → ciano → violeta → magenta → âmbar. */
const SPHERE_VS = /* glsl */ `
uniform sampler2D uBands;
uniform float uTime;
uniform float uAmp;
varying float vLevel;
varying vec3 vNormalView;
varying vec3 vViewDir;

// Ondulação suave e barata (sem textura de ruído) para não parecer anéis perfeitos.
float wobble(vec3 p, float t) {
  return sin(p.x * 3.1 + t) * sin(p.y * 2.7 - t * 0.8) * sin(p.z * 3.7 + t * 0.6);
}

void main() {
  vec3 dir = normalize(position);
  // Padrão marmorizado: a banda de cada ponto mistura a latitude (graves perto do
  // equador, agudos nos polos) com um campo ondulado que gira devagar — bolhas que
  // reagem às frequências, em vez de faixas horizontais certinhas.
  float latitude = acos(clamp(dir.y, -1.0, 1.0)) / 3.14159265;
  float fromEquator = abs(latitude - 0.5) * 2.0;
  float field = 0.5 + 0.5 * wobble(dir * 1.3, uTime * 0.5);
  float band = clamp(fromEquator * 0.6 + field * 0.4, 0.0, 1.0);
  float level = texture2D(uBands, vec2(band, 0.5)).r;
  float displaced = 1.0 + uAmp * smoothstep(0.05, 0.9, level) * (0.7 + 0.3 * wobble(dir * 2.1, uTime * 1.3));
  vLevel = level;
  vec4 viewPosition = modelViewMatrix * vec4(dir * displaced, 1.0);
  vNormalView = normalize(normalMatrix * dir);
  vViewDir = normalize(-viewPosition.xyz);
  gl_Position = projectionMatrix * viewPosition;
}`

const SPHERE_FS = /* glsl */ `
uniform float uPulse;
uniform float uWire;
varying float vLevel;
varying vec3 vNormalView;
varying vec3 vViewDir;

const vec3 INDIGO = vec3(0.20, 0.14, 0.55);
const vec3 CYAN = vec3(0.133, 0.827, 0.933);
const vec3 VIOLET = vec3(0.545, 0.36, 1.0);
const vec3 MAGENTA = vec3(1.0, 0.33, 0.70);
const vec3 AMBER = vec3(1.0, 0.76, 0.42);

vec3 ramp(float t) {
  if (t < 0.22) return mix(INDIGO, CYAN, t / 0.22);
  if (t < 0.5) return mix(CYAN, VIOLET, (t - 0.22) / 0.28);
  if (t < 0.78) return mix(VIOLET, MAGENTA, (t - 0.5) / 0.28);
  return mix(MAGENTA, AMBER, (t - 0.78) / 0.22);
}

void main() {
  float h = smoothstep(0.02, 0.72, vLevel);
  // Brilho de borda (fresnel): contorno luminoso, centro mais escuro.
  float rim = pow(1.0 - max(dot(normalize(vNormalView), normalize(vViewDir)), 0.0), 2.2);
  vec3 base = ramp(h);
  vec3 color;
  float alpha;
  if (uWire > 0.5) {
    // Wireframe discreto: textura técnica sem “chuviscar” a superfície.
    color = mix(base, vec3(1.0), 0.15) * (0.5 + 0.6 * uPulse);
    alpha = 0.08 + 0.22 * h;
  } else {
    // Corpo escuro; picos e borda luminosos dão volume.
    color = base * (0.1 + 0.5 * h * h + 0.85 * rim) * (0.9 + 0.6 * uPulse) + vec3(1.0, 0.42, 0.62) * rim * 0.3;
    alpha = 1.0;
  }
  gl_FragColor = vec4(color * alpha, alpha);
}`

interface Scene3D {
  renderer: Three.WebGLRenderer
  scene: Three.Scene
  camera: Three.PerspectiveCamera
  group: Three.Group
  geometry: Three.BufferGeometry
  solid: Three.ShaderMaterial
  wire: Three.ShaderMaterial
  bandsTexture: Three.DataTexture
  bandsData: Uint8Array
}

/**
 * Esfera pulsante (Three.js): o espectro deforma a superfície no vertex shader
 * (graves no equador, agudos nos polos), com cores por intensidade, brilho de
 * borda e wireframe. Pulsa com o grave e gira mais rápido nas batidas.
 *
 * O Three.js é carregado sob demanda (import dinâmico) ao ativar o preset: fica
 * num chunk separado e não pesa no carregamento inicial. Compartilha o contexto
 * WebGL2 com as Montanhas; `resetState()` antes e depois de cada quadro evita que
 * o cache de estado do Three.js e o código WebGL puro se atrapalhem.
 * Ver docs/decisions.md, D16.
 */
export function createSphere({ bandCount = 64, reducedMotion = false }: PresetOptions = {}): VisualizationGL {
  const tracker = createBandTracker(bandCount, reducedMotion ? ENVELOPE_REDUCED_MOTION : ENVELOPE_MOTION)
  const { levels } = tracker.envelope
  const beats = createBeatDetector()
  const previousLevels = new Float32Array(bandCount)

  let scene3d: Scene3D | null = null
  let disposed = false
  /** Invalida carregamentos antigos (troca rápida de preset, contexto restaurado). */
  let generation = 0
  let width = 1
  let height = 1
  let pixelWidth = 1
  let pixelHeight = 1
  let clock = 0

  const applySize = () => {
    if (!scene3d) return
    scene3d.renderer.setSize(pixelWidth, pixelHeight, false)
    scene3d.camera.aspect = width / height
    scene3d.camera.updateProjectionMatrix()
  }

  const disposeScene = () => {
    if (!scene3d) return
    scene3d.geometry.dispose()
    scene3d.solid.dispose()
    scene3d.wire.dispose()
    scene3d.bandsTexture.dispose()
    scene3d.renderer.dispose()
    scene3d = null
  }

  const build = (three: typeof Three, gl: WebGL2RenderingContext) => {
    const renderer = new three.WebGLRenderer({
      canvas: gl.canvas as HTMLCanvasElement,
      context: gl,
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
    })
    renderer.setPixelRatio(1) // o VisualizerCanvas já entrega o tamanho em pixels reais
    renderer.setClearColor(0x000000, 0)

    const scene = new three.Scene()
    const camera = new three.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, CAMERA_DISTANCE)

    const bandsData = new Uint8Array(bandCount)
    const bandsTexture = new three.DataTexture(bandsData, bandCount, 1, three.RedFormat, three.UnsignedByteType)
    bandsTexture.magFilter = three.LinearFilter
    bandsTexture.minFilter = three.LinearFilter
    bandsTexture.needsUpdate = true

    const uniforms = (wire: number) => ({
      uBands: { value: bandsTexture },
      uTime: { value: 0 },
      uAmp: { value: DISPLACEMENT },
      uPulse: { value: 0 },
      uWire: { value: wire },
    })
    const solid = new three.ShaderMaterial({ vertexShader: SPHERE_VS, fragmentShader: SPHERE_FS, uniforms: uniforms(0) })
    const wire = new three.ShaderMaterial({
      vertexShader: SPHERE_VS,
      fragmentShader: SPHERE_FS,
      uniforms: uniforms(1),
      wireframe: true,
      transparent: true,
      depthWrite: false,
      blending: three.CustomBlending,
      blendSrc: three.OneFactor,
      blendDst: three.OneMinusSrcAlphaFactor, // cores pré-multiplicadas
    })

    const geometry = new three.IcosahedronGeometry(1, DETAIL)
    const group = new three.Group()
    group.add(new three.Mesh(geometry, solid))
    const wireMesh = new three.Mesh(geometry, wire)
    wireMesh.scale.setScalar(1.004) // levemente acima da superfície: sem “z-fighting”
    group.add(wireMesh)
    group.rotation.x = 0.35
    scene.add(group)

    scene3d = { renderer, scene, camera, group, geometry, solid, wire, bandsTexture, bandsData }
    applySize()
  }

  return {
    id: 'sphere',
    kind: 'webgl2',
    label: 'Esfera',

    init(gl) {
      disposeScene() // após restauração de contexto, os recursos antigos não valem mais
      const ticket = ++generation
      void import('three')
        .then((three) => {
          if (disposed || ticket !== generation || gl.isContextLost()) return
          build(three, gl)
        })
        .catch((error: unknown) => console.error('[PulseScape] Falha ao carregar o Three.js:', error))
    },

    resize(w, h, pw, ph) {
      width = Math.max(1, w)
      height = Math.max(1, h)
      pixelWidth = Math.max(1, pw)
      pixelHeight = Math.max(1, ph)
      applySize()
    },

    render(gl, frame, deltaMs) {
      tracker.update(frame, deltaMs)
      const flux = deltaMs > 0 ? bassFlux(levels, previousLevels, FLUX_FROM, FLUX_TO) : 0
      beats.update(flux, deltaMs)
      if (!scene3d) {
        // Three.js ainda carregando: tela limpa (sem resto de outro preset).
        gl.viewport(0, 0, pixelWidth, pixelHeight)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        return
      }

      const { renderer, scene, camera, group, solid, wire, bandsTexture, bandsData } = scene3d
      const bass = averageLevel(levels, BASS_FROM, BASS_TO)
      const impulse = beats.impulse

      if (deltaMs > 0) {
        clock += deltaMs
        const spin = reducedMotion ? SPIN_REDUCED : SPIN_BASE + SPIN_BEAT * impulse
        group.rotation.y += spin * deltaMs
        for (let i = 0; i < bandCount; i++) bandsData[i] = Math.round(Math.min(1, levels[i] ?? 0) * 255)
        bandsTexture.needsUpdate = true
      }

      const scale = 1 + (reducedMotion ? 0.02 : 0.07) * bass + (reducedMotion ? 0 : 0.06) * impulse
      group.scale.setScalar(scale)
      const pulse = (reducedMotion ? 0.3 : 1) * impulse
      for (const material of [solid, wire]) {
        const u = material.uniforms
        if (u.uTime) u.uTime.value = reducedMotion ? 0 : clock * 0.0006
        if (u.uPulse) u.uPulse.value = pulse
      }

      // O contexto é compartilhado com as Montanhas (WebGL puro).
      renderer.resetState()
      renderer.render(scene, camera)
      renderer.resetState()
    },

    isIdle: () => tracker.isIdle() && beats.impulse < 0.01,

    dispose() {
      disposed = true
      generation += 1
      disposeScene()
    },
  }
}
