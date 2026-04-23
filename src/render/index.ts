import type { Renderer, RenderMode } from '../types/nes';
import { FRAMEBUFFER_WIDTH, FRAMEBUFFER_HEIGHT } from '../types/nes';

export class CanvasRenderer implements Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (this.ctx) {
      this.imageData = this.ctx.createImageData(FRAMEBUFFER_WIDTH, FRAMEBUFFER_HEIGHT);
    }
  }

  render(buffer: Uint32Array): void {
    if (!this.ctx || !this.imageData || !this.canvas) return;

    const data = this.imageData.data;
    for (let i = 0; i < buffer.length; i++) {
      const pixel = buffer[i];
      data[i * 4] = (pixel >> 16) & 0xFF;
      data[i * 4 + 1] = (pixel >> 8) & 0xFF;
      data[i * 4 + 2] = pixel & 0xFF;
      data[i * 4 + 3] = 0xFF;
    }
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  setMode(_mode: RenderMode): void {
  }
}

export class WebGlRenderer implements Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    this.gl = gl;

    const vsSource = `
      attribute vec2 position;
      varying vec2 texCoord;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
        texCoord = (position + 1.0) * 0.5;
        texCoord.y = 1.0 - texCoord.y;
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform sampler2D texture;
      varying vec2 texCoord;
      void main() {
        gl_FragColor = texture2D(texture, texCoord);
      }
    `;

    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

    if (!vs || !fs) return;

    this.program = gl.createProgram();
    if (!this.program) return;

    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.useProgram(this.program);

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type);
    if (!shader) return null;
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    return shader;
  }

  render(buffer: Uint32Array): void {
    if (!this.gl || !this.texture) return;

    const pixels = new Uint8Array(buffer.length * 4);
    for (let i = 0; i < buffer.length; i++) {
      const pixel = buffer[i];
      pixels[i * 4] = (pixel >> 16) & 0xFF;
      pixels[i * 4 + 1] = (pixel >> 8) & 0xFF;
      pixels[i * 4 + 2] = pixel & 0xFF;
      pixels[i * 4 + 3] = 0xFF;
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      FRAMEBUFFER_WIDTH,
      FRAMEBUFFER_HEIGHT,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      pixels
    );

    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  setMode(_mode: RenderMode): void {
  }
}

export function createRenderer(mode: RenderMode): Renderer {
  if (mode === 'webgl') {
    return new WebGlRenderer();
  }
  return new CanvasRenderer();
}