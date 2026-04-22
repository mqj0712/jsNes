import type { u8, u16 } from './common.ts';

export const INES_MAGIC = [0x4E, 0x45, 0x53, 0x1A]; // "NES" + 0x1A

export interface INesHeader {
  magic: u8[];           // 0-3: "NES" + 0x1A
  prgSize: u8;           // 4: PRG ROM size (16KB units)
  chrSize: u8;           // 5: CHR ROM size (8KB units)
  mapperLow: u8;         // 6: Mapper number low 4 bits + flags
  mapperHigh: u8;        // 7: Mapper number high 4 bits + flags
  flags6: u8;            // 8: Flags 6
  flags7: u8;            // 9: Flags 7
  flags8: u8;            // 10: Flags 8 (unused in iNES)
  flags9: u8;            // 11: Flags 9 (unused in iNES)
  flags10: u8;           // 12: Flags 10 (unused in iNES)
  padding: u8[];         // 13-15: Padding (usually 0)
}

export const enum CartridgeFlags6 {
  MIRROR_VERT = 1 << 0,    // 0=horizontal, 1=vertical mirroring
  BATTERY_RAM = 1 << 1,    // Battery backed PRG RAM
  TRAINER = 1 << 2,        // 512-byte trainer present
  FOUR_SCREEN = 1 << 3,    // Four-screen mirroring
}

export interface CartridgeInfo {
  prgSize: u16;            // PRG ROM size in bytes
  chrSize: u16;            // CHR ROM size in bytes
  mapperNumber: u8;
  mapperName: string;
  mirroring: u8;
  hasBatteryRam: boolean;
  hasTrainer: boolean;
}

export interface Mapper {
  reset(): void;
  cpuRead(addr: u16): u8;
  cpuWrite(addr: u16, val: u8): void;
  ppuRead(addr: u16): u8;
  ppuWrite(addr: u16, val: u8): void;
}