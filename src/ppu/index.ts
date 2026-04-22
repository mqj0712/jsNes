import type { u8, u16 } from '../types/common';
import {
  CYCLES_PER_SCANLINE,
  SCANLINES_PER_FRAME,
} from '../types/ppu';
import {
  FRAMEBUFFER_WIDTH,
  FRAMEBUFFER_HEIGHT,
} from '../types/nes';

interface BusRead {
  readPpu(addr: u16): u8;
}

interface BusWrite {
  writePpu(addr: u16, val: u8): void;
}

export class Ppu {
  cycle: u16 = 0;
  scanline: u16 = 0;
  frameComplete: boolean = false;
  oddFrame: boolean = false;

  ppuctrl: u8 = 0;
  ppumask: u8 = 0;
  ppustatus: u8 = 0;
  oamaddr: u8 = 0;
  ppuscroll_x: u8 = 0;
  ppuscroll_y: u8 = 0;
  ppuaddr: u16 = 0;
  ppuaddrLatch: u8 = 0;
  ppudata: u8 = 0;

  v: u16 = 0;
  t: u16 = 0;
  x: u8 = 0;
  w: u8 = 0;
  f: u8 = 0;

  vram: Uint8Array = new Uint8Array(0x0800);
  palette: Uint8Array = new Uint8Array(0x20);
  oam: Uint8Array = new Uint8Array(256);

  framebuffer: Uint32Array = new Uint32Array(FRAMEBUFFER_WIDTH * FRAMEBUFFER_HEIGHT);

  private busRead: BusRead;
  private busWrite: BusWrite;

  constructor(busRead: BusRead, busWrite: BusWrite) {
    this.busRead = busRead;
    this.busWrite = busWrite;
  }

  writePpu(addr: u16, val: u8): void {
    this.busWrite.writePpu(addr, val);
  }

  reset(): void {
    this.cycle = 0;
    this.scanline = 0;
    this.frameComplete = false;
    this.oddFrame = false;
    this.ppuctrl = 0;
    this.ppumask = 0;
    this.ppustatus = 0;
    this.oamaddr = 0;
    this.ppuscroll_x = 0;
    this.ppuscroll_y = 0;
    this.ppuaddr = 0;
    this.ppuaddrLatch = 0;
    this.ppudata = 0;
    this.v = 0;
    this.t = 0;
    this.x = 0;
    this.w = 0;
    this.f = 0;
    this.vram.fill(0);
    this.palette.fill(0);
    this.oam.fill(0xFF);
  }

  readRegister(addr: u8): u8 {
    switch (addr & 0x7) {
      case 0x02: {
        const status = this.ppustatus;
        this.ppustatus &= 0x7F;
        this.w = 0;
        return status;
      }
      case 0x04:
        return this.oam[this.oamaddr];
      case 0x07:
        return this.ppudata;
      default:
        return 0;
    }
  }

  writeRegister(addr: u8, value: u8): void {
    switch (addr & 0x7) {
      case 0x00:
        this.ppuctrl = value;
        this.t = (this.t & 0xF3FF) | ((value & 0x03) << 10);
        break;
      case 0x01:
        this.ppumask = value;
        break;
      case 0x03:
        this.oamaddr = value;
        break;
      case 0x04:
        this.oam[this.oamaddr++] = value;
        break;
      case 0x05:
        if (this.w === 0) {
          this.ppuscroll_x = value;
          this.x = value & 0x07;
          this.t = (this.t & 0xFFE0) | (value >> 3);
          this.w = 1;
        } else {
          this.ppuscroll_y = value;
          this.t = (this.t & 0x8C1F) | ((value & 0x07) << 12) | ((value & 0xF8) << 2);
          this.w = 0;
        }
        break;
      case 0x06:
        if (this.w === 0) {
          this.ppuaddrLatch = value & 0x3F;
          this.t = (this.t & 0x00FF) | ((value & 0x3F) << 8);
          this.w = 1;
        } else {
          this.t = (this.t & 0xFF00) | value;
          this.v = this.t;
          this.w = 0;
        }
        break;
      case 0x07:
        this.ppudata = value;
        this.writePpu(this.v & 0x3FFF, value);
        this.v += (this.ppuctrl & 0x04) ? 32 : 1;
        break;
    }
  }

  clock(): void {
    const isRendering = (this.ppumask & 0x18) !== 0;
    const bgEnabled = (this.ppumask & 0x08) !== 0;
    const spriteEnabled = (this.ppumask & 0x10) !== 0;

    if (this.scanline < 240) {
      if (this.cycle > 0 && this.cycle <= 256) {
        const pixelX = this.cycle - 1;
        const pixelY = this.scanline;

        let bgColor: u8 = 0;
        if (bgEnabled) {
          const v = this.v & 0x7FFF;
          const ntByte = this.busRead.readPpu(0x2000 | (v & 0x0FFF));
          const attrByte = this.busRead.readPpu(0x23C0 | (v & 0x0C00) | ((v >> 4) & 0x38) | ((v >> 2) & 0x07));
          const paletteIdx = ((attrByte >> (((v >> 5) & 0x04) | (v & 0x02))) & 0x03) << 2;
          bgColor = paletteIdx | (ntByte & 0x03);
        }

        const color = this.palette[bgColor & 0x1F] || 0xFF555555;
        this.framebuffer[pixelY * FRAMEBUFFER_WIDTH + pixelX] = color | 0xFF000000;
      }
    }

    if (isRendering) {
      if (this.cycle >= 1 && this.cycle <= 256) {
        const coarseX = this.v & 0x1F;
        const coarseY = (this.v >> 5) & 0x1F;
        this.v = (this.v & 0xFBE0) | ((coarseX + 1) & 0x1F) | (((coarseY + ((this.cycle === 256) ? 1 : 0)) & 0x1F) << 5);
        if (this.cycle === 256) {
          this.v = (this.v & 0x841F) | ((this.v + 0x20) & 0x7BE0);
        }
      }
      if (this.cycle === 257) {
        this.v = (this.v & 0xFBE0) | (this.t & 0x041F);
      }
    }

    this.cycle++;
    if (this.cycle === CYCLES_PER_SCANLINE) {
      this.cycle = 0;
      this.scanline++;
      if (this.scanline === 241) {
        this.ppustatus |= 0x80;
        if (this.ppuctrl & 0x80) {
        }
      }
      if (this.scanline === SCANLINES_PER_FRAME) {
        this.scanline = 0;
        this.frameComplete = true;
        if ((this.ppumask & 0x18) !== 0 && this.oddFrame) {
          this.cycle = 1;
        }
        this.oddFrame = !this.oddFrame;
      }
    }
  }
}