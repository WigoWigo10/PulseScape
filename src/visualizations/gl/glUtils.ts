/** Utilitários WebGL2 mínimos: compilação/ligação de shaders com erros legíveis. */

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Não foi possível criar o shader.')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader) ?? ''
    gl.deleteShader(shader)
    throw new Error(`Falha ao compilar shader ${type === gl.VERTEX_SHADER ? 'de vértice' : 'de fragmento'}: ${log}`)
  }
  return shader
}

/** Compila e liga um programa. Lança erro com o log do driver em caso de falha. */
export function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (!program) throw new Error('Não foi possível criar o programa WebGL.')
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  // Shaders podem ser descartados após a ligação.
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(program) ?? ''
    gl.deleteProgram(program)
    throw new Error(`Falha ao ligar programa WebGL: ${log}`)
  }
  return program
}

/** Localização de uniform obrigatória (erro claro se o nome não existir no shader). */
export function uniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name)
  if (location === null && !gl.isContextLost()) throw new Error(`Uniform ausente no shader: ${name}`)
  return location as WebGLUniformLocation
}
