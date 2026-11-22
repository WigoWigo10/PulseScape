/**
 * Matrizes 4×4 mínimas para WebGL (column-major, como o GLSL espera).
 * Só o necessário para câmera: perspectiva, lookAt e multiplicação. Lógica pura.
 */

export type Vec3 = readonly [number, number, number]

export function createMat4(): Float32Array {
  const m = new Float32Array(16)
  m[0] = m[5] = m[10] = m[15] = 1
  return m
}

/** Projeção perspectiva (NDC z em [-1, 1], convenção OpenGL/WebGL). */
export function perspective(out: Float32Array, fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2)
  const nf = 1 / (near - far)
  out.fill(0)
  out[0] = f / aspect
  out[5] = f
  out[10] = (far + near) * nf
  out[11] = -1
  out[14] = 2 * far * near * nf
  return out
}

/** Matriz de visão: câmera em `eye` olhando para `target`. */
export function lookAt(out: Float32Array, eye: Vec3, target: Vec3, up: Vec3): Float32Array {
  let zx = eye[0] - target[0]
  let zy = eye[1] - target[1]
  let zz = eye[2] - target[2]
  let len = Math.hypot(zx, zy, zz) || 1
  zx /= len
  zy /= len
  zz /= len

  let xx = up[1] * zz - up[2] * zy
  let xy = up[2] * zx - up[0] * zz
  let xz = up[0] * zy - up[1] * zx
  len = Math.hypot(xx, xy, xz) || 1
  xx /= len
  xy /= len
  xz /= len

  const yx = zy * xz - zz * xy
  const yy = zz * xx - zx * xz
  const yz = zx * xy - zy * xx

  out[0] = xx
  out[1] = yx
  out[2] = zx
  out[3] = 0
  out[4] = xy
  out[5] = yy
  out[6] = zy
  out[7] = 0
  out[8] = xz
  out[9] = yz
  out[10] = zz
  out[11] = 0
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2])
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2])
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2])
  out[15] = 1
  return out
}

/** out = a × b (aplica b primeiro, depois a). `out` pode ser `a` ou `b`. */
export function multiply(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
  const r = new Float32Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0)
      r[col * 4 + row] = sum
    }
  }
  out.set(r)
  return out
}

/** Transforma um ponto (w = 1) e devolve [x, y, z, w] em clip space. */
export function transformPoint(m: Float32Array, p: Vec3): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (let row = 0; row < 4; row++) {
    out[row] = (m[row] ?? 0) * p[0] + (m[4 + row] ?? 0) * p[1] + (m[8 + row] ?? 0) * p[2] + (m[12 + row] ?? 0)
  }
  return out
}
