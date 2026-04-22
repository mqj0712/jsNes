import type { Mapper } from '../../types/cartridge';
import type { u8, u16 } from '../../types/common';

export class Mapper0 implements Mapper {
  private prg: Uint8Array;
  private chr: Uint8Array;
  private prgSize: u16;
  private chrSize: u16;
  private hasChrRam: boolean;

  constructor(romData: Uint8Array, prgSize: u16, chrSize: u16, hasChrRam: boolean) {
    this.prg = romData;
    this.chr = new Uint8Array(0x2000);
    this.prgSize = prgSize;
    this.chrSize = chrSize;
    this.hasChrRam = hasChrRam;
  }

  reset(): void {
  }

  cpuRead(addr: u16): u8 {
    if (addr >= 0x8000 && addr <= 0xFFFF) {
      if (this.prgSize === 0x4000) {
        return this.prg[(addr - 0x8000) & 0x3FFF];
      } else {
        return this.prg[(addr - 0x8000) & 0x7FFF];
      }
    }
    return 0;
  }

  cpuWrite(addr: u16, _val: u8): void {
    if (addr >= 0x8000 && addr <= 0xFFFF) {
    }
  }

  ppuRead(addr: u16): u8 {
    if (addr < 0x2000) {
      return this.chr[addr];
    }
    return 0;
  }

  ppuWrite(addr: u16, val: u8): void {
    if (addr < 0x2000 && !this.hasChrRam) {
    } else if (addr < 0x2000) {
      this.chr[addr] = val;
    }
  }
}