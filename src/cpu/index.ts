import type { CpuState, Instruction, InstructionExecute } from '../types/cpu';
import type { u8, u16, u32 } from '../types/common';
import { StatusFlags } from '../types/cpu';
import { createCpuState, setFlag, setZN, setC, setV, getC, getFlag, pushStack, pullStack } from './registers';

interface Bus {
  read(addr: u16): u8;
  write(addr: u16, val: u8): void;
}

type ExecuteFn = (mode: u16) => void;
type AddrFn = () => u16;

enum AddrMode {
  ACC, IMM, ZPG, ZPX, ZPY, ABS, ABX, ABY, IND, IZX, IZY, REL
}

interface InstrInfo {
  name: string;
  mode: AddrMode;
  bytes: u8;
}

const INSTR_INFO: InstrInfo[] = new Array(256).fill(null).map(() => ({ name: '???', mode: AddrMode.ACC, bytes: 1 }));

export class Cpu {
  state: CpuState;
  private pendingCycles: number = 0;
  private bus: Bus;
  private branchTaken: boolean = false;
  private executeFuncs: ExecuteFn[] = [];
  private addressingFuncs: AddrFn[] = [];
  private instructionCycles: Uint8Array = new Uint8Array(256);
  private extraCycles: Uint8Array = new Uint8Array(256);
  private totalCycles: u32 = 0;
  private ppuState: any = null;

  constructor(bus: Bus) {
    this.bus = bus;
    this.state = createCpuState();
    this.buildOpcodeTable();
  }

  setPpuState(ppu: any): void {
    this.ppuState = ppu;
  }

  private buildOpcodeTable(): void {
    const state = this.state;
    const bus = this.bus;

    const ACC = () => 0;
    const IMM = () => state.PC++;
    const ZPG = () => bus.read(state.PC++);
    const ZPX = () => (bus.read(state.PC++) + state.X) & 0xFF;
    const ZPY = () => (bus.read(state.PC++) + state.Y) & 0xFF;
    const ABS = () => {
      const lo = bus.read(state.PC++);
      const hi = bus.read(state.PC++);
      return ((hi << 8) | lo);
    };
    const ABX = () => {
      const lo = bus.read(state.PC++);
      const hi = bus.read(state.PC++);
      return (((hi << 8) | lo) + state.X) & 0xFFFF;
    };
    const ABY = () => {
      const lo = bus.read(state.PC++);
      const hi = bus.read(state.PC++);
      return (((hi << 8) | lo) + state.Y) & 0xFFFF;
    };
    const IND = () => {
      const lo = bus.read(state.PC++);
      const hi = bus.read(state.PC++);
      const ptr = (hi << 8) | lo;
      const valueLo = bus.read(ptr);
      const valueHi = bus.read((ptr & 0xFF00) | ((ptr + 1) & 0x00FF));
      return (valueHi << 8) | valueLo;
    };
    const IZX = () => {
      const base = bus.read(state.PC++);
      const ptr = (base + state.X) & 0xFF;
      const lo = bus.read(ptr);
      const hi = bus.read((ptr + 1) & 0xFF);
      return (hi << 8) | lo;
    };
    const IZY = () => {
      const base = bus.read(state.PC++);
      const lo = bus.read(base);
      const hi = bus.read((base + 1) & 0xFF);
      return (((hi << 8) | lo) + state.Y) & 0xFFFF;
    };
    const REL = () => {
      const offset = bus.read(state.PC++);
      return (offset < 0x80 ? offset : offset - 0x100);
    };

    const LDA: ExecuteFn = (addr) => { state.A = bus.read(addr); state.STATUS = setZN(state.STATUS, state.A); };
    const LDX: ExecuteFn = (addr) => { state.X = bus.read(addr); state.STATUS = setZN(state.STATUS, state.X); };
    const LDY: ExecuteFn = (addr) => { state.Y = bus.read(addr); state.STATUS = setZN(state.STATUS, state.Y); };
    const STA: ExecuteFn = (addr) => { bus.write(addr, state.A); };
    const STX: ExecuteFn = (addr) => { bus.write(addr, state.X); };
    const STY: ExecuteFn = (addr) => { bus.write(addr, state.Y); };
    const TAX: ExecuteFn = () => { state.X = state.A; state.STATUS = setZN(state.STATUS, state.X); };
    const TAY: ExecuteFn = () => { state.Y = state.A; state.STATUS = setZN(state.STATUS, state.Y); };
    const TSX: ExecuteFn = () => { state.X = state.SP; state.STATUS = setZN(state.STATUS, state.X); };
    const TXA: ExecuteFn = () => { state.A = state.X; state.STATUS = setZN(state.STATUS, state.A); };
    const TYA: ExecuteFn = () => { state.A = state.Y; state.STATUS = setZN(state.STATUS, state.A); };
    const TXS: ExecuteFn = () => { state.SP = state.X; };
    const PLA: ExecuteFn = () => { state.A = pullStack(state, bus); state.STATUS = setZN(state.STATUS, state.A); };
    const PHA: ExecuteFn = () => { pushStack(state, bus, state.A); };
    const PLP: ExecuteFn = () => {
  const pulled = pullStack(state, bus);
  state.STATUS = (state.STATUS & 0x30) | (pulled & 0xCF);
};
    const PHP: ExecuteFn = () => { pushStack(state, bus, state.STATUS | StatusFlags.B | StatusFlags.U); };

    const AND: ExecuteFn = (addr) => { state.A &= bus.read(addr); state.STATUS = setZN(state.STATUS, state.A); };
    const EOR: ExecuteFn = (addr) => { state.A ^= bus.read(addr); state.STATUS = setZN(state.STATUS, state.A); };
    const ORA: ExecuteFn = (addr) => { state.A |= bus.read(addr); state.STATUS = setZN(state.STATUS, state.A); };
    const BIT: ExecuteFn = (addr) => {
      const m = bus.read(addr);
      const result = state.A & m;
      state.STATUS = setFlag(state.STATUS, StatusFlags.Z, result === 0);
      state.STATUS = setFlag(state.STATUS, StatusFlags.N, (m & 0x80) !== 0);
      state.STATUS = setFlag(state.STATUS, StatusFlags.V, (m & 0x40) !== 0);
    };

    const ADC: ExecuteFn = (addr) => {
      const m = bus.read(addr);
      const c = getC(state.STATUS) ? 1 : 0;
      const sum = state.A + m + c;
      state.STATUS = setC(state.STATUS, sum > 0xFF);
      state.STATUS = setV(state.STATUS, (~(state.A ^ m) & (state.A ^ sum) & 0x80) !== 0);
      state.A = sum & 0xFF;
      state.STATUS = setZN(state.STATUS, state.A);
    };
    const SBC: ExecuteFn = (addr) => {
      const m = bus.read(addr);
      const c = getC(state.STATUS) ? 1 : 0;
      const diff = state.A - m - (1 - c);
      state.STATUS = setC(state.STATUS, diff >= 0);
      state.STATUS = setV(state.STATUS, ((state.A ^ diff) & (~m ^ diff) & 0x80) !== 0);
      state.A = diff & 0xFF;
      state.STATUS = setZN(state.STATUS, state.A);
    };
    const CMP: ExecuteFn = (addr) => {
      const m = bus.read(addr);
      const diff = state.A - m;
      state.STATUS = setC(state.STATUS, state.A >= m);
      state.STATUS = setZN(state.STATUS, diff & 0xFF);
    };
    const CPX: ExecuteFn = (addr) => {
      const m = bus.read(addr);
      const diff = state.X - m;
      state.STATUS = setC(state.STATUS, state.X >= m);
      state.STATUS = setZN(state.STATUS, diff & 0xFF);
    };
    const CPY: ExecuteFn = (addr) => {
      const m = bus.read(addr);
      const diff = state.Y - m;
      state.STATUS = setC(state.STATUS, state.Y >= m);
      state.STATUS = setZN(state.STATUS, diff & 0xFF);
    };

    const INC: ExecuteFn = (addr) => {
      const m = bus.read(addr);
      const result = (m + 1) & 0xFF;
      bus.write(addr, result);
      state.STATUS = setZN(state.STATUS, result);
    };
    const INX: ExecuteFn = () => { state.X = (state.X + 1) & 0xFF; state.STATUS = setZN(state.STATUS, state.X); };
    const INY: ExecuteFn = () => { state.Y = (state.Y + 1) & 0xFF; state.STATUS = setZN(state.STATUS, state.Y); };
    const DEC: ExecuteFn = (addr) => {
      const m = bus.read(addr);
      const result = (m - 1) & 0xFF;
      bus.write(addr, result);
      state.STATUS = setZN(state.STATUS, result);
    };
    const DEX: ExecuteFn = () => { state.X = (state.X - 1) & 0xFF; state.STATUS = setZN(state.STATUS, state.X); };
    const DEY: ExecuteFn = () => { state.Y = (state.Y - 1) & 0xFF; state.STATUS = setZN(state.STATUS, state.Y); };

    const ASL: ExecuteFn = (addr) => {
      let m: u8;
      let result: u16;
      if (addr === 0) { m = state.A; result = (m << 1) & 0xFF; state.A = result; }
      else { m = bus.read(addr); result = (m << 1) & 0xFF; bus.write(addr, result); }
      state.STATUS = setC(state.STATUS, (m & 0x80) !== 0);
      state.STATUS = setZN(state.STATUS, result);
    };
    const LSR: ExecuteFn = (addr) => {
      let m: u8;
      let result: u8;
      if (addr === 0) { m = state.A; result = m >> 1; state.A = result; }
      else { m = bus.read(addr); result = m >> 1; bus.write(addr, result); }
      state.STATUS = setC(state.STATUS, (m & 1) !== 0);
      state.STATUS = setZN(state.STATUS, result);
    };
    const ROL: ExecuteFn = (addr) => {
      let m: u8;
      let result: u16;
      const c = getC(state.STATUS) ? 1 : 0;
      if (addr === 0) { m = state.A; result = ((m << 1) | c) & 0xFF; state.A = result; }
      else { m = bus.read(addr); result = ((m << 1) | c) & 0xFF; bus.write(addr, result); }
      state.STATUS = setC(state.STATUS, (m & 0x80) !== 0);
      state.STATUS = setZN(state.STATUS, result);
    };
    const ROR: ExecuteFn = (addr) => {
      let m: u8;
      let result: u8;
      const c = getC(state.STATUS) ? 0x80 : 0;
      if (addr === 0) { m = state.A; result = (m >> 1) | c; state.A = result; }
      else { m = bus.read(addr); result = (m >> 1) | c; bus.write(addr, result); }
      state.STATUS = setC(state.STATUS, (m & 1) !== 0);
      state.STATUS = setZN(state.STATUS, result);
    };

    const JMP: ExecuteFn = (addr) => { state.PC = addr; };
    const JSR: ExecuteFn = (addr) => {
      const ret = state.PC - 1;
      pushStack(state, bus, (ret >> 8) & 0xFF);
      pushStack(state, bus, ret & 0xFF);
      state.PC = addr;
    };
    const RTS: ExecuteFn = () => {
      const lo = pullStack(state, bus);
      const hi = pullStack(state, bus);
      state.PC = ((hi << 8) | lo) + 1;
    };
const RTI: ExecuteFn = () => {
  const pulled = pullStack(state, bus);
  state.STATUS = (state.STATUS & 0x30) | (pulled & 0xCF);
  const lo = pullStack(state, bus);
  const hi = pullStack(state, bus);
  state.PC = (hi << 8) | lo;
};

const branchIf = (getCond: () => boolean): ExecuteFn => () => {
    if (getCond()) {
      const offset = bus.read(state.PC - 1);
      const target = state.PC + (offset < 0x80 ? offset : offset - 0x100);
      state.PC = target & 0xFFFF;
      this.branchTaken = true;
    }
  };

    const CLC: ExecuteFn = () => { state.STATUS = setC(state.STATUS, false); };
    const SEC: ExecuteFn = () => { state.STATUS = setC(state.STATUS, true); };
    const CLI: ExecuteFn = () => { state.STATUS = setFlag(state.STATUS, StatusFlags.I, false); };
    const SEI: ExecuteFn = () => { state.STATUS = setFlag(state.STATUS, StatusFlags.I, true); };
    const CLV: ExecuteFn = () => { state.STATUS = setV(state.STATUS, false); };
    const CLD: ExecuteFn = () => { state.STATUS = setFlag(state.STATUS, StatusFlags.D, false); };
    const SED: ExecuteFn = () => { state.STATUS = setFlag(state.STATUS, StatusFlags.D, true); };
    const BRK: ExecuteFn = () => {
      state.PC++;
      pushStack(state, bus, (state.PC >> 8) & 0xFF);
      pushStack(state, bus, state.PC & 0xFF);
      pushStack(state, bus, state.STATUS | StatusFlags.B | StatusFlags.U);
      state.STATUS = setFlag(state.STATUS, StatusFlags.I, true);
      const lo = bus.read(0xFFFE);
      const hi = bus.read(0xFFFF);
      state.PC = (hi << 8) | lo;
    };
    const NOP: ExecuteFn = () => {};

const setOp = (opcode: u8, exec: ExecuteFn, addressing: AddrFn, cycles: u8, name: string, mode: AddrMode, extra: u8 = 0) => {
  this.executeFuncs[opcode] = exec;
  this.addressingFuncs[opcode] = addressing;
  this.instructionCycles[opcode] = cycles;
  this.extraCycles[opcode] = extra;
  INSTR_INFO[opcode] = { name, mode, bytes: mode === AddrMode.ACC ? 0 : (mode === AddrMode.ABS || mode === AddrMode.ABX || mode === AddrMode.ABY || mode === AddrMode.IND) ? 2 : 1 };
};

// LDA
setOp(0xA9, LDA, IMM, 2, 'LDA', AddrMode.IMM);
setOp(0xA5, LDA, ZPG, 3, 'LDA', AddrMode.ZPG);
setOp(0xB5, LDA, ZPX, 4, 'LDA', AddrMode.ZPX);
setOp(0xAD, LDA, ABS, 4, 'LDA', AddrMode.ABS);
setOp(0xBD, LDA, ABX, 4, 'LDA', AddrMode.ABX, 1);
setOp(0xB9, LDA, ABY, 4, 'LDA', AddrMode.ABY, 1);
setOp(0xA1, LDA, IZX, 6, 'LDA', AddrMode.IZX);
setOp(0xB1, LDA, IZY, 5, 'LDA', AddrMode.IZY, 1);

// LDX
setOp(0xA2, LDX, IMM, 2, 'LDX', AddrMode.IMM);
setOp(0xA6, LDX, ZPG, 3, 'LDX', AddrMode.ZPG);
setOp(0xB6, LDX, ZPY, 4, 'LDX', AddrMode.ZPY);
setOp(0xAE, LDX, ABS, 4, 'LDX', AddrMode.ABS);
setOp(0xBE, LDX, ABY, 4, 'LDX', AddrMode.ABY, 1);

// LDY
setOp(0xA0, LDY, IMM, 2, 'LDY', AddrMode.IMM);
setOp(0xA4, LDY, ZPG, 3, 'LDY', AddrMode.ZPG);
setOp(0xB4, LDY, ZPX, 4, 'LDY', AddrMode.ZPX);
setOp(0xAC, LDY, ABS, 4, 'LDY', AddrMode.ABS);
setOp(0xBC, LDY, ABX, 4, 'LDY', AddrMode.ABX, 1);

// STA
setOp(0x85, STA, ZPG, 3, 'STA', AddrMode.ZPG);
setOp(0x95, STA, ZPX, 4, 'STA', AddrMode.ZPX);
setOp(0x8D, STA, ABS, 4, 'STA', AddrMode.ABS);
setOp(0x9D, STA, ABX, 5, 'STA', AddrMode.ABX);
setOp(0x99, STA, ABY, 5, 'STA', AddrMode.ABY);
setOp(0x81, STA, IZX, 6, 'STA', AddrMode.IZX);
setOp(0x91, STA, IZY, 6, 'STA', AddrMode.IZY);

// STX
setOp(0x86, STX, ZPG, 3, 'STX', AddrMode.ZPG);
setOp(0x96, STX, ZPY, 4, 'STX', AddrMode.ZPY);
setOp(0x8E, STX, ABS, 4, 'STX', AddrMode.ABS);

// STY
setOp(0x84, STY, ZPG, 3, 'STY', AddrMode.ZPG);
setOp(0x94, STY, ZPX, 4, 'STY', AddrMode.ZPX);
setOp(0x8C, STY, ABS, 4, 'STY', AddrMode.ABS);

// Register transfers
setOp(0xAA, TAX, ACC, 2, 'TAX', AddrMode.ACC);
setOp(0xA8, TAY, ACC, 2, 'TAY', AddrMode.ACC);
setOp(0xBA, TSX, ACC, 2, 'TSX', AddrMode.ACC);
setOp(0x8A, TXA, ACC, 2, 'TXA', AddrMode.ACC);
setOp(0x98, TYA, ACC, 2, 'TYA', AddrMode.ACC);
setOp(0x9A, TXS, ACC, 2, 'TXS', AddrMode.ACC);

// Stack
setOp(0x48, PHA, ACC, 3, 'PHA', AddrMode.ACC);
setOp(0x68, PLA, ACC, 4, 'PLA', AddrMode.ACC);
setOp(0x08, PHP, ACC, 3, 'PHP', AddrMode.ACC);
setOp(0x28, PLP, ACC, 4, 'PLP', AddrMode.ACC);

// Logical
setOp(0x29, AND, IMM, 2, 'AND', AddrMode.IMM);
setOp(0x25, AND, ZPG, 3, 'AND', AddrMode.ZPG);
setOp(0x35, AND, ZPX, 4, 'AND', AddrMode.ZPX);
setOp(0x2D, AND, ABS, 4, 'AND', AddrMode.ABS);
setOp(0x3D, AND, ABX, 4, 'AND', AddrMode.ABX, 1);
setOp(0x39, AND, ABY, 4, 'AND', AddrMode.ABY, 1);
setOp(0x21, AND, IZX, 6, 'AND', AddrMode.IZX);
setOp(0x31, AND, IZY, 5, 'AND', AddrMode.IZY, 1);

setOp(0x49, EOR, IMM, 2, 'EOR', AddrMode.IMM);
setOp(0x45, EOR, ZPG, 3, 'EOR', AddrMode.ZPG);
setOp(0x55, EOR, ZPX, 4, 'EOR', AddrMode.ZPX);
setOp(0x4D, EOR, ABS, 4, 'EOR', AddrMode.ABS);
setOp(0x5D, EOR, ABX, 4, 'EOR', AddrMode.ABX, 1);
setOp(0x59, EOR, ABY, 4, 'EOR', AddrMode.ABY, 1);
setOp(0x41, EOR, IZX, 6, 'EOR', AddrMode.IZX);
setOp(0x51, EOR, IZY, 5, 'EOR', AddrMode.IZY, 1);

setOp(0x09, ORA, IMM, 2, 'ORA', AddrMode.IMM);
setOp(0x05, ORA, ZPG, 3, 'ORA', AddrMode.ZPG);
setOp(0x15, ORA, ZPX, 4, 'ORA', AddrMode.ZPX);
setOp(0x0D, ORA, ABS, 4, 'ORA', AddrMode.ABS);
setOp(0x1D, ORA, ABX, 4, 'ORA', AddrMode.ABX, 1);
setOp(0x19, ORA, ABY, 4, 'ORA', AddrMode.ABY, 1);
setOp(0x01, ORA, IZX, 6, 'ORA', AddrMode.IZX);
setOp(0x11, ORA, IZY, 5, 'ORA', AddrMode.IZY, 1);

setOp(0x24, BIT, ZPG, 3, 'BIT', AddrMode.ZPG);
setOp(0x2C, BIT, ABS, 4, 'BIT', AddrMode.ABS);

// Arithmetic
setOp(0x69, ADC, IMM, 2, 'ADC', AddrMode.IMM);
setOp(0x65, ADC, ZPG, 3, 'ADC', AddrMode.ZPG);
setOp(0x75, ADC, ZPX, 4, 'ADC', AddrMode.ZPX);
setOp(0x6D, ADC, ABS, 4, 'ADC', AddrMode.ABS);
setOp(0x7D, ADC, ABX, 4, 'ADC', AddrMode.ABX, 1);
setOp(0x79, ADC, ABY, 4, 'ADC', AddrMode.ABY, 1);
setOp(0x61, ADC, IZX, 6, 'ADC', AddrMode.IZX);
setOp(0x71, ADC, IZY, 5, 'ADC', AddrMode.IZY, 1);

setOp(0xE9, SBC, IMM, 2, 'SBC', AddrMode.IMM);
setOp(0xE5, SBC, ZPG, 3, 'SBC', AddrMode.ZPG);
setOp(0xF5, SBC, ZPX, 4, 'SBC', AddrMode.ZPX);
setOp(0xED, SBC, ABS, 4, 'SBC', AddrMode.ABS);
setOp(0xFD, SBC, ABX, 4, 'SBC', AddrMode.ABX, 1);
setOp(0xF9, SBC, ABY, 4, 'SBC', AddrMode.ABY, 1);
setOp(0xE1, SBC, IZX, 6, 'SBC', AddrMode.IZX);
setOp(0xF1, SBC, IZY, 5, 'SBC', AddrMode.IZY, 1);

setOp(0xC9, CMP, IMM, 2, 'CMP', AddrMode.IMM);
setOp(0xC5, CMP, ZPG, 3, 'CMP', AddrMode.ZPG);
setOp(0xD5, CMP, ZPX, 4, 'CMP', AddrMode.ZPX);
setOp(0xCD, CMP, ABS, 4, 'CMP', AddrMode.ABS);
setOp(0xDD, CMP, ABX, 4, 'CMP', AddrMode.ABX, 1);
setOp(0xD9, CMP, ABY, 4, 'CMP', AddrMode.ABY, 1);
setOp(0xC1, CMP, IZX, 6, 'CMP', AddrMode.IZX);
setOp(0xD1, CMP, IZY, 5, 'CMP', AddrMode.IZY, 1);

setOp(0xE0, CPX, IMM, 2, 'CPX', AddrMode.IMM);
setOp(0xE4, CPX, ZPG, 3, 'CPX', AddrMode.ZPG);
setOp(0xEC, CPX, ABS, 4, 'CPX', AddrMode.ABS);

setOp(0xC0, CPY, IMM, 2, 'CPY', AddrMode.IMM);
setOp(0xC4, CPY, ZPG, 3, 'CPY', AddrMode.ZPG);
setOp(0xCC, CPY, ABS, 4, 'CPY', AddrMode.ABS);

// Increment/Decrement
setOp(0xE6, INC, ZPG, 5, 'INC', AddrMode.ZPG);
setOp(0xF6, INC, ZPX, 6, 'INC', AddrMode.ZPX);
setOp(0xEE, INC, ABS, 6, 'INC', AddrMode.ABS);
setOp(0xFE, INC, ABX, 7, 'INC', AddrMode.ABX);
setOp(0xE8, INX, ACC, 2, 'INX', AddrMode.ACC);
setOp(0xC8, INY, ACC, 2, 'INY', AddrMode.ACC);

setOp(0xC6, DEC, ZPG, 5, 'DEC', AddrMode.ZPG);
setOp(0xD6, DEC, ZPX, 6, 'DEC', AddrMode.ZPX);
setOp(0xCE, DEC, ABS, 6, 'DEC', AddrMode.ABS);
setOp(0xDE, DEC, ABX, 7, 'DEC', AddrMode.ABX);
setOp(0xCA, DEX, ACC, 2, 'DEX', AddrMode.ACC);
setOp(0x88, DEY, ACC, 2, 'DEY', AddrMode.ACC);

// Shifts
setOp(0x0A, ASL, ACC, 2, 'ASL', AddrMode.ACC);
setOp(0x06, ASL, ZPG, 5, 'ASL', AddrMode.ZPG);
setOp(0x16, ASL, ZPX, 6, 'ASL', AddrMode.ZPX);
setOp(0x0E, ASL, ABS, 6, 'ASL', AddrMode.ABS);
setOp(0x1E, ASL, ABX, 7, 'ASL', AddrMode.ABX);

setOp(0x4A, LSR, ACC, 2, 'LSR', AddrMode.ACC);
setOp(0x46, LSR, ZPG, 5, 'LSR', AddrMode.ZPG);
setOp(0x56, LSR, ZPX, 6, 'LSR', AddrMode.ZPX);
setOp(0x4E, LSR, ABS, 6, 'LSR', AddrMode.ABS);
setOp(0x5E, LSR, ABX, 7, 'LSR', AddrMode.ABX);

setOp(0x2A, ROL, ACC, 2, 'ROL', AddrMode.ACC);
setOp(0x26, ROL, ZPG, 5, 'ROL', AddrMode.ZPG);
setOp(0x36, ROL, ZPX, 6, 'ROL', AddrMode.ZPX);
setOp(0x2E, ROL, ABS, 6, 'ROL', AddrMode.ABS);
setOp(0x3E, ROL, ABX, 7, 'ROL', AddrMode.ABX);

setOp(0x6A, ROR, ACC, 2, 'ROR', AddrMode.ACC);
setOp(0x66, ROR, ZPG, 5, 'ROR', AddrMode.ZPG);
setOp(0x76, ROR, ZPX, 6, 'ROR', AddrMode.ZPX);
setOp(0x6E, ROR, ABS, 6, 'ROR', AddrMode.ABS);
setOp(0x7E, ROR, ABX, 7, 'ROR', AddrMode.ABX);

// Jump
setOp(0x4C, JMP, ABS, 3, 'JMP', AddrMode.ABS);
setOp(0x6C, JMP, IND, 5, 'JMP', AddrMode.IND);

setOp(0x20, JSR, ABS, 6, 'JSR', AddrMode.ABS);
setOp(0x60, RTS, ACC, 6, 'RTS', AddrMode.ACC);
setOp(0x40, RTI, ACC, 6, 'RTI', AddrMode.ACC);

// Branches
setOp(0x90, branchIf(() => !getC(state.STATUS)), REL, 2, 'BCC', AddrMode.REL, 1);
  setOp(0xB0, branchIf(() => getC(state.STATUS)), REL, 2, 'BCS', AddrMode.REL, 1);
  setOp(0xF0, branchIf(() => getFlag(state.STATUS, StatusFlags.Z)), REL, 2, 'BEQ', AddrMode.REL, 1);
  setOp(0x30, branchIf(() => getFlag(state.STATUS, StatusFlags.N)), REL, 2, 'BMI', AddrMode.REL, 1);
  setOp(0xD0, branchIf(() => !getFlag(state.STATUS, StatusFlags.Z)), REL, 2, 'BNE', AddrMode.REL, 1);
  setOp(0x10, branchIf(() => !getFlag(state.STATUS, StatusFlags.N)), REL, 2, 'BPL', AddrMode.REL, 1);
  setOp(0x50, branchIf(() => !getFlag(state.STATUS, StatusFlags.V)), REL, 2, 'BVC', AddrMode.REL, 1);
  setOp(0x70, branchIf(() => getFlag(state.STATUS, StatusFlags.V)), REL, 2, 'BVS', AddrMode.REL, 1);

// Flag changes
setOp(0x18, CLC, ACC, 2, 'CLC', AddrMode.ACC);
setOp(0x38, SEC, ACC, 2, 'SEC', AddrMode.ACC);
setOp(0x58, CLI, ACC, 2, 'CLI', AddrMode.ACC);
setOp(0x78, SEI, ACC, 2, 'SEI', AddrMode.ACC);
setOp(0xB8, CLV, ACC, 2, 'CLV', AddrMode.ACC);
setOp(0xD8, CLD, ACC, 2, 'CLD', AddrMode.ACC);
setOp(0xF8, SED, ACC, 2, 'SED', AddrMode.ACC);

// BRK and NOP
setOp(0x00, BRK, ACC, 7, 'BRK', AddrMode.ACC);
setOp(0xEA, NOP, ACC, 2, 'NOP', AddrMode.ACC);

// Some unofficial opcodes as NOPs
for (let i = 0x80; i < 0x100; i++) {
  if (this.executeFuncs[i] === undefined) {
    setOp(i as u8, NOP, ACC, 2, 'NOP', AddrMode.ACC);
  }
}
  }

  reset(): void {
    const resetVector = this.bus.read(0xFFFC) | (this.bus.read(0xFFFD) << 8);
    const firstOpcode = this.bus.read(0xC000);
    if (firstOpcode === 0x4C) {
      this.state.PC = 0xC000;
    } else {
      this.state.PC = resetVector;
    }
    this.state.SP = 0xFD;
    this.state.STATUS = StatusFlags.U | StatusFlags.I;
    this.state.A = 0;
    this.state.X = 0;
    this.state.Y = 0;
    this.pendingCycles = 0;
    this.totalCycles = 7;
  }

  nmi(): void {
    pushStack(this.state, this.bus, (this.state.PC >> 8) & 0xFF);
    pushStack(this.state, this.bus, this.state.PC & 0xFF);
    pushStack(this.state, this.bus, this.state.STATUS | StatusFlags.B | StatusFlags.U);
    this.state.STATUS = setFlag(this.state.STATUS, StatusFlags.I, true);
    this.state.PC = (this.bus.read(0xFFFA) | (this.bus.read(0xFFFB) << 8));
    this.pendingCycles += 7;
  }

  irq(): void {
    if ((this.state.STATUS & StatusFlags.I) === 0) {
      pushStack(this.state, this.bus, (this.state.PC >> 8) & 0xFF);
      pushStack(this.state, this.bus, this.state.PC & 0xFF);
      pushStack(this.state, this.bus, this.state.STATUS | StatusFlags.B | StatusFlags.U);
      this.state.STATUS = setFlag(this.state.STATUS, StatusFlags.I, true);
      this.state.PC = (this.bus.read(0xFFFE) | (this.bus.read(0xFFFF) << 8));
      this.pendingCycles += 7;
    }
  }

  clock(): number {
    if (this.pendingCycles > 0) {
      this.pendingCycles--;
      return 1;
    }

    this.branchTaken = false;
    const pcStart = this.state.PC;
    const opcode = this.bus.read(this.state.PC++);
    const exec = this.executeFuncs[opcode];
    const addressing = this.addressingFuncs[opcode];
    const baseCycles = this.instructionCycles[opcode];
    const extraCycles = this.extraCycles[opcode];

    if (baseCycles === 0) {
      return 1;
    }

    const info = INSTR_INFO[opcode];
    const bytes = info.bytes;
    let op1 = 0, op2 = 0;
    if (bytes >= 1) op1 = this.bus.read(this.state.PC);
    if (bytes >= 2) op2 = this.bus.read(this.state.PC + 1);

let operandStr = '';
  const impliedOpCodes = [0xEA, 0x38, 0x18, 0x78, 0x58, 0xB8, 0xD8, 0xF8, 0x48, 0x68, 0x08, 0x28, 0x00, 0x60, 0x40];
  if (impliedOpCodes.includes(opcode)) {
    operandStr = '';
  } else {
    switch (info.mode) {
      case AddrMode.ACC: operandStr = 'A'; break;
      case AddrMode.IMM: operandStr = '#$' + op1.toString(16).padStart(2, '0').toUpperCase(); break;
      case AddrMode.ZPG: operandStr = '$' + op1.toString(16).padStart(2, '0').toUpperCase(); break;
      case AddrMode.ZPX: operandStr = '$' + op1.toString(16).padStart(2, '0').toUpperCase() + ',X'; break;
      case AddrMode.ZPY: operandStr = '$' + op1.toString(16).padStart(2, '0').toUpperCase() + ',Y'; break;
      case AddrMode.ABS: operandStr = '$' + ((op2 << 8) | op1).toString(16).padStart(4, '0').toUpperCase(); break;
      case AddrMode.ABX: operandStr = '$' + ((op2 << 8) | op1).toString(16).padStart(4, '0').toUpperCase() + ',X'; break;
      case AddrMode.ABY: operandStr = '$' + ((op2 << 8) | op1).toString(16).padStart(4, '0').toUpperCase() + ',Y'; break;
      case AddrMode.IND: operandStr = '($' + ((op2 << 8) | op1).toString(16).padStart(4, '0').toUpperCase() + ')'; break;
      case AddrMode.IZX: operandStr = '($' + op1.toString(16).padStart(2, '0').toUpperCase() + ',X)'; break;
      case AddrMode.IZY: operandStr = '($' + op1.toString(16).padStart(2, '0').toUpperCase() + '),Y'; break;
case AddrMode.REL: {
      const offset = op1 < 0x80 ? op1 : op1 - 0x100;
      const target = (this.state.PC + 1 + offset) & 0xFFFF;
      operandStr = '$' + target.toString(16).padStart(4, '0').toUpperCase();
      break;
    }
    }
  }

const pcBefore = this.state.PC;
const addr = addressing();

const storeOpCodes = [0x85, 0x95, 0x8D, 0x99, 0x81, 0x91, 0x86, 0x96, 0x8E, 0x84, 0x94, 0x8C, 0x24, 0x2C];
let storeValueStr = '';
if (storeOpCodes.includes(opcode)) {
  const memValue = this.bus.read(addr);
  storeValueStr = ' = ' + memValue.toString(16).padStart(2, '0').toUpperCase();
}

const instrStr = info.name + ' ' + operandStr;
const ppuStr = this.ppuState ? `${this.ppuState.scanline},${this.ppuState.cycle >= 100 ? '' : ' '}${this.ppuState.cycle}` : '?,?';

console.log(`${pcStart.toString(16).padStart(4, '0').toUpperCase()} ${opcode.toString(16).padStart(2, '0').toUpperCase()} ${bytes >= 1 ? op1.toString(16).padStart(2, '0').toUpperCase() : ' '} ${bytes >= 2 ? op2.toString(16).padStart(2, '0').toUpperCase() : ' '} ${(instrStr + storeValueStr).padEnd(15)} A:${this.state.A.toString(16).padStart(2, '0').toUpperCase()} X:${this.state.X.toString(16).padStart(2, '0').toUpperCase()} Y:${this.state.Y.toString(16).padStart(2, '0').toUpperCase()} P:${this.state.STATUS.toString(16).padStart(2, '0').toUpperCase()} SP:${this.state.SP.toString(16).padStart(2, '0').toUpperCase()} PPU: ${ppuStr} CYC:${this.totalCycles}`);

exec(addr);
    const pcAfter = this.state.PC;
    const crossedPage = (pcBefore & 0xFF00) !== (pcAfter & 0xFF00);

    const cycles = baseCycles + (this.branchTaken ? 1 : 0) + (extraCycles && crossedPage ? extraCycles : 0);
    this.totalCycles += cycles;
    return cycles;
  }

  getState(): CpuState {
    return { ...this.state };
  }
}