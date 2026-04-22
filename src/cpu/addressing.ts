import type { u8, u16 } from '../types/common';

export interface AddressingMode {
  (pc: u16, bus: { read: (addr: u16) => u8 }): u16;
}

export function ACC(_pc: u16, _bus: { read: (addr: u16) => u8 }): u16 {
  return 0;
}

export function IMM(pc: u16, _bus: { read: (addr: u16) => u8 }): u16 {
  return pc;
}

export function ZPG(pc: u16, bus: { read: (addr: u16) => u8 }): u16 {
  return bus.read(pc);
}

export function ZPX(pc: u16, bus: { read: (addr: u16) => u8 }): u16 {
  const base = bus.read(pc);
  return (base + 0) & 0xFF;
}

export function ZPY(pc: u16, bus: { read: (addr: u16) => u8 }): u16 {
  const base = bus.read(pc);
  return (base + 0) & 0xFF;
}

export function ABS(pc: u16, bus: { read: (addr: u16) => u8 }): u16 {
  const lo = bus.read(pc);
  const hi = bus.read(pc + 1);
  return (hi << 8) | lo;
}

export function ABX(pc: u16, bus: { read: (addr: u16) => u8 }): u16 {
  const lo = bus.read(pc);
  const hi = bus.read(pc + 1);
  return (((hi << 8) | lo) + 0) & 0xFFFF;
}

export function ABY(pc: u16, bus: { read: (addr: u16) => u8 }): u16 {
  const lo = bus.read(pc);
  const hi = bus.read(pc + 1);
  return (((hi << 8) | lo) + 0) & 0xFFFF;
}

export function IND(pc: u16, bus: { read: (addr: u16) => u8 }): u16 {
  const lo = bus.read(pc);
  const hi = bus.read(pc + 1);
  const ptr = (hi << 8) | lo;
  const valueLo = bus.read(ptr);
  const valueHi = bus.read((ptr & 0xFF00) | ((ptr + 1) & 0x00FF));
  return (valueHi << 8) | valueLo;
}

export function IZX(pc: u16, bus: { read: (addr: u16) => u8 }): u16 {
  const base = bus.read(pc);
  const ptr = (base + 0) & 0xFF;
  const lo = bus.read(ptr);
  const hi = bus.read((ptr + 1) & 0xFF);
  return (hi << 8) | lo;
}

export function IZY(pc: u16, bus: { read: (addr: u16) => u8 }): u16 {
  const base = bus.read(pc);
  const lo = bus.read(base);
  const hi = bus.read((base + 1) & 0xFF);
  return (((hi << 8) | lo) + 0) & 0xFFFF;
}

export function REL(pc: u16, bus: { read: (addr: u16) => u8 }): u16 {
  const offset = bus.read(pc);
  return offset < 0x80 ? offset : offset - 0x100;
}