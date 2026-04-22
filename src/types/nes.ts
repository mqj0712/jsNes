export const FRAMEBUFFER_WIDTH = 256;
export const FRAMEBUFFER_HEIGHT = 240;
export const FRAMEBUFFER_SIZE = FRAMEBUFFER_WIDTH * FRAMEBUFFER_HEIGHT;

export const NES_PALETTE: Uint32Array = new Uint32Array([
  0x757575FF, 0x271B8F7, 0x1F0F8F1, 0x170F6D6, 0x1F0F56C, 0x370D44B, 0x470D23A, 0x570E06,
  0x451F00, 0x2F2F00, 0x1F3F00, 0x173F0F, 0x173F2F, 0x173B4F, 0x17476F, 0x0F479F,
  0x005FDF, 0x00037B, 0x000D83, 0x000DA1, 0x000FC1, 0x0F0FDF, 0x3030EF, 0x3F3FDF,
  0x4F4FBF, 0x5F5F9F, 0x7F7F7F, 0x9F9F9F, 0xBFBFBF, 0xDFEFDF, 0xEFFFBF, 0xFFFFFF,
  0xBCBCBC, 0x686868, 0x585858, 0x484848, 0x383838, 0x2C2C2C, 0x202020, 0x141414,
  0xBCBCBC, 0x0078D7, 0x005FD7, 0x003CBB, 0x00189B, 0x0F6D9B, 0x47059B, 0x57051B,
  0x671F00, 0x573F00, 0x475F00, 0x175F00, 0x007B00, 0x007B06, 0x007B0F, 0x006F2F,
  0x0077BF, 0x005FD7, 0x0F7FFF, 0x3F3FEF, 0x5F6FDF, 0x7F8FBF, 0x9FDFDF, 0xBFBFFF,
]);

export type RenderMode = 'canvas' | 'webgl';

export interface Renderer {
  init(canvas: HTMLCanvasElement): void;
  render(buffer: Uint32Array): void;
  setMode(mode: RenderMode): void;
}

export interface ControllerState {
  a: boolean;
  b: boolean;
  select: boolean;
  start: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export const CONTROLLER_BUTTONS = ['a', 'b', 'select', 'start', 'up', 'down', 'left', 'right'] as const;