import { Cpu } from '../cpu';
import { Ppu } from '../ppu';
import { Bus } from '../bus';
import { Cartridge } from '../cartridge';
import type { Renderer } from '../types/nes';
import { createRenderer } from '../render';
import { createController, type Controller } from '../input';
import type { RenderMode } from '../types/nes';

export class Emulator {
  private cpu: Cpu;
  private ppu: Ppu;
  private bus: Bus;
  private cartridge: Cartridge | null = null;
  private renderer: Renderer;
  private controller: Controller;
  private running: boolean = false;
  private frameCallback: (() => void) | null = null;

  constructor() {
    this.controller = createController();

    this.ppu = new Ppu(
      { readPpu: (addr) => this.ppuRead(addr) },
      { writePpu: (addr, val) => this.ppuWrite(addr, val) }
    );

    this.bus = new Bus(
      (addr) => this.ppuRead(addr),
      (addr, val) => this.ppuWrite(addr, val),
      (addr) => this.mapperRead(addr),
      (addr, val) => this.mapperWrite(addr, val),
      () => 0,
      () => {},
      () => this.controller.read()
    );

    this.cpu = new Cpu({
      read: (addr) => this.bus.read(addr),
      write: (addr, val) => this.bus.write(addr, val),
    });

    this.renderer = createRenderer('canvas');
  }

  private ppuRead(addr: number): number {
    if (this.cartridge) {
      addr &= 0x3FFF;
      if (addr < 0x3F00) {
        return this.ppu.vram[addr & 0x07FF];
      } else {
        return this.ppu.palette[addr & 0x1F];
      }
    }
    return 0;
  }

  private ppuWrite(addr: number, val: number): void {
    if (this.cartridge) {
      addr &= 0x3FFF;
      if (addr < 0x3F00) {
        this.ppu.vram[addr & 0x07FF] = val;
      } else {
        this.ppu.palette[addr & 0x1F] = val;
      }
    }
  }

  private mapperRead(addr: number): number {
    if (this.cartridge) {
      return this.cartridge.mapper.cpuRead(addr);
    }
    return 0;
  }

  private mapperWrite(addr: number, val: number): void {
    if (this.cartridge) {
      this.cartridge.mapper.cpuWrite(addr, val);
    }
  }

  loadRom(data: Uint8Array): void {
    try {
      this.cartridge = new Cartridge(data);
      this.cpu.reset();
      this.ppu.reset();
      console.log('ROM loaded successfully');
      console.log('Mapper:', this.cartridge.info.mapperNumber);
      console.log('PRG size:', this.cartridge.info.prgSize);
      console.log('CHR size:', this.cartridge.info.chrSize);
    } catch (e) {
      console.error('Failed to load ROM:', e);
    }
  }

  setRendererMode(mode: RenderMode): void {
    this.renderer = createRenderer(mode);
  }

  initRenderer(canvas: HTMLCanvasElement): void {
    this.renderer.init(canvas);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.frame();
  }

  stop(): void {
    this.running = false;
  }

  private frame(): void {
    if (!this.running) return;

    this.runFrame();

    if (this.frameCallback) {
      this.frameCallback();
    }

    requestAnimationFrame(() => this.frame());
  }

  private runFrame(): void {
    while (!this.ppu.frameComplete) {
      for (let i = 0; i < 3; i++) {
        this.ppu.clock();
      }
      this.cpu.clock();
    }
    this.ppu.frameComplete = false;
    this.renderer.render(this.ppu.framebuffer);
  }

  onFrame(callback: () => void): void {
    this.frameCallback = callback;
  }

  reset(): void {
    if (this.cartridge) {
      this.cpu.reset();
      this.ppu.reset();
    }
  }

  setControllerButton(button: string, pressed: boolean): void {
    (this.controller as any).setButton(button, pressed);
  }
}