import type { u8, u16 } from '../types/common';
import { RAM_SIZE, RAM_MASK, PPU_REG_MASK } from '../types/bus';

export class Bus {
  ram: Uint8Array;
  private ppuRead: (addr: u16) => u8;
  private ppuWrite: (addr: u8, val: u8) => void;
  private mapperCpuRead: (addr: u16) => u8;
  private mapperCpuWrite: (addr: u16, val: u8) => void;
  private apuRead: (addr: u16) => u8;
  private apuWrite: (addr: u16, val: u8) => void;
  private controllerRead: () => u8;

  constructor(
    ppuRead: (addr: u16) => u8,
    ppuWrite: (addr: u8, val: u8) => void,
    mapperCpuRead: (addr: u16) => u8,
    mapperCpuWrite: (addr: u16, val: u8) => void,
    apuRead: (addr: u16) => u8,
    apuWrite: (addr: u16, val: u8) => void,
    controllerRead: () => u8
  ) {
    this.ram = new Uint8Array(RAM_SIZE);
    this.ppuRead = ppuRead;
    this.ppuWrite = ppuWrite;
    this.mapperCpuRead = mapperCpuRead;
    this.mapperCpuWrite = mapperCpuWrite;
    this.apuRead = apuRead;
    this.apuWrite = apuWrite;
    this.controllerRead = controllerRead;
  }

  read(addr: u16): u8 {
    addr &= 0xFFFF;

    if (addr < 0x2000) {
      return this.ram[addr & RAM_MASK];
    } else if (addr < 0x4000) {
      return this.ppuRead(addr & PPU_REG_MASK);
    } else if (addr < 0x4020) {
      if (addr === 0x4016) {
        return this.controllerRead();
      }
      return this.apuRead(addr);
    } else {
      return this.mapperCpuRead(addr);
    }
  }

  write(addr: u16, value: u8): void {
    addr &= 0xFFFF;

    if (addr < 0x2000) {
      this.ram[addr & RAM_MASK] = value;
    } else if (addr < 0x4000) {
      this.ppuWrite(addr & PPU_REG_MASK, value);
    } else if (addr < 0x4020) {
      this.apuWrite(addr, value);
    } else {
      this.mapperCpuWrite(addr, value);
    }
  }

  reset(): void {
    this.ram.fill(0);
  }
}