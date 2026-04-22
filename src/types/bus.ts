import type { u8, u16 } from './common.ts';

export const RAM_SIZE = 0x0800;       // 2KB
export const RAM_MASK = 0x07FF;       // Mirror mask
export const PPU_REG_SIZE = 0x0008;   // 8 PPU registers
export const PPU_REG_MASK = 0x0007;   // Register mirror mask
export const PPU_REG_START = 0x2000;
export const APU_REG_START = 0x4000;
export const APU_REG_END = 0x401F;
export const CARTRIDGE_START = 0x4020;

export const enum BusDevices {
  RAM,
  PPU,
  APU,
  CARTRIDGE,
}