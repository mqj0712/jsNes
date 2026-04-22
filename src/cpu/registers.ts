import type { u8, u16 } from '../types/common';
import { StatusFlags, type CpuState } from '../types/cpu';

export function createCpuState(): CpuState {
  return {
    A: 0,
    X: 0,
    Y: 0,
    PC: 0,
    SP: 0xFD,
    STATUS: StatusFlags.U | StatusFlags.I, // Unused and Interrupt disable set at reset
  };
}

export function setFlag(status: u8, flag: StatusFlags, value: boolean): u8 {
  if (value) {
    return status | flag;
  }
  return status & ~flag;
}

export function getFlag(status: u8, flag: StatusFlags): boolean {
  return (status & flag) !== 0;
}

export function setZN(status: u8, value: u8): u8 {
  status = setFlag(status, StatusFlags.Z, value === 0);
  status = setFlag(status, StatusFlags.N, (value & 0x80) !== 0);
  return status;
}

export function setC(status: u8, value: boolean): u8 {
  return setFlag(status, StatusFlags.C, value);
}

export function setV(status: u8, value: boolean): u8 {
  return setFlag(status, StatusFlags.V, value);
}

export function getC(status: u8): boolean {
  return getFlag(status, StatusFlags.C);
}

export function getZ(status: u8): boolean {
  return getFlag(status, StatusFlags.Z);
}

export function getN(status: u8): boolean {
  return getFlag(status, StatusFlags.N);
}

export function getV(status: u8): boolean {
  return getFlag(status, StatusFlags.V);
}

export function pushStack(state: CpuState, bus: { write: (addr: u16, val: u8) => void }, value: u8): void {
  bus.write(0x0100 | state.SP, value);
  state.SP = (state.SP - 1) & 0xFF;
}

export function pullStack(state: CpuState, bus: { read: (addr: u16) => u8 }): u8 {
  state.SP = (state.SP + 1) & 0xFF;
  return bus.read(0x0100 | state.SP);
}

export function read16(state: CpuState, bus: { read: (addr: u16) => u8 }): u16 {
  const lo = bus.read(state.PC++);
  const hi = bus.read(state.PC++);
  return (hi << 8) | lo;
}

export function read16Bug(state: CpuState, bus: { read: (addr: u16) => u8 }): u16 {
  const lo = bus.read(state.PC++);
  const hi = bus.read(((state.PC) & 0xFF00) | lo); // Page boundary bug
  return (hi << 8) | lo;
}