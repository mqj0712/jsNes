import type { u8, u16 } from './common.ts';

export const PPU_REG_COUNT = 8;

export const enum PpuCtrlFlags {
  VBP = 1 << 7,  // VBlank period length (0=5 lines, 1=6 lines)
  VBA = 1 << 6,  // PPU master/slave selection
  HBP = 1 << 5,  // Sprite size (0=8x8, 1=8x16)
  BGE = 1 << 4,  // Background enable
  SGE = 1 << 3,  // Sprites enable
  LSB = 1 << 2,  // Background table address (0=$2000, 1=$2400)
  VSL = 1 << 1,  // Sprite table address (0=$2000, 1=$2400)
  IMG = 1 << 0,  // PPU master (unused in NES)
}

export const enum PpuMaskFlags {
  EMP = 1 << 7,  // Emphasize blue
  RED = 1 << 6,  // Emphasize red
  GRN = 1 << 5,  // Emphasize green
  SGE = 1 << 4,  // Sprite left column (8 pixels)
  BGE = 1 << 3,  // Background left column
  COL = 1 << 2,  // Color mode (0=color, 1=grayscale)
  SGR = 1 << 1,  // Sprites enable
  BGR = 1 << 0,  // Background enable
}

export const enum PpuStatusFlags {
  VBN = 1 << 7,  // VBlank (read only)
  S0H = 1 << 6,  // Sprite 0 hit
  SCR = 1 << 5,  // Sprite overflow
  COL = 1 << 4,  // Collision flag
}

export interface PpuState {
  cycle: u16;       // 0-340
  scanline: u16;    // 0-261
  frameComplete: boolean;
  oddFrame: boolean;
}

export interface PpuRegisters {
  ppuctrl: u8;    // $2000
  ppumask: u8;    // $2001
  ppustatus: u8;  // $2002
  oamaddr: u8;    // $2003
  ppuscroll_x: u8; // $2005 (first write)
  ppuscroll_y: u8; // $2005 (second write)
  ppuaddr: u16;   // $2006 (16-bit, two writes)
  ppudata: u8;    // $2007
}

export interface Sprite {
  y: u8;         // Y position
  tile: u8;      // Tile index
  attrs: u8;     // Attributes (palette, flip)
  x: u8;         // X position
}

export const SPRITE_COUNT = 64;
export const SPRITE_BYTES = 4;
export const OAM_SIZE = SPRITE_COUNT * SPRITE_BYTES; // 256 bytes

export const CYCLES_PER_SCANLINE = 341;
export const SCANLINES_PER_FRAME = 262;
export const VISIBLE_SCANLINES = 240;
export const VBLANK_SCANLINE = 241;
export const VBLANK_END_SCANLINE = 261;