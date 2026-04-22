import type { CpuState, Instruction, InstructionExecute } from '../types/cpu';
import type { u8, u16 } from '../types/common';
import { StatusFlags } from '../types/cpu';
import { createCpuState, setFlag, setZN, setC, setV, getC, getFlag, pushStack, pullStack } from './registers';

interface Bus {
  read(addr: u16): u8;
  write(addr: u16, val: u8): void;
}

type ExecuteFn = (mode: u16) => void;
type AddrFn = () => u16;

export class Cpu {
  state: CpuState;
  private pendingCycles: number = 0;
  private bus: Bus;
  private executeFuncs: ExecuteFn[] = [];
  private addressingFuncs: AddrFn[] = [];
  private instructionCycles: Uint8Array = new Uint8Array(256);
  private extraCycles: Uint8Array = new Uint8Array(256);

  constructor(bus: Bus) {
    this.bus = bus;
    this.state = createCpuState();
    this.buildOpcodeTable();
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
    const PLP: ExecuteFn = () => { state.STATUS = pullStack(state, bus) | StatusFlags.U; };
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
      state.STATUS = pullStack(state, bus) | StatusFlags.U;
      const lo = pullStack(state, bus);
      const hi = pullStack(state, bus);
      state.PC = (hi << 8) | lo;
    };

    const branchIf = (cond: boolean): ExecuteFn => () => {
      if (cond) {
        const offset = bus.read(state.PC - 1);
        const target = state.PC + (offset < 0x80 ? offset : offset - 0x100);
        state.PC = target & 0xFFFF;
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

    const setOp = (opcode: u8, exec: ExecuteFn, addressing: AddrFn, cycles: u8, extra: u8 = 0) => {
      this.executeFuncs[opcode] = exec;
      this.addressingFuncs[opcode] = addressing;
      this.instructionCycles[opcode] = cycles;
      this.extraCycles[opcode] = extra;
    };

    // LDA
    setOp(0xA9, LDA, IMM, 2);
    setOp(0xA5, LDA, ZPG, 3);
    setOp(0xB5, LDA, ZPX, 4);
    setOp(0xAD, LDA, ABS, 4);
    setOp(0xBD, LDA, ABX, 4, 1);
    setOp(0xB9, LDA, ABY, 4, 1);
    setOp(0xA1, LDA, IZX, 6);
    setOp(0xB1, LDA, IZY, 5, 1);

    // LDX
    setOp(0xA2, LDX, IMM, 2);
    setOp(0xA6, LDX, ZPG, 3);
    setOp(0xB6, LDX, ZPY, 4);
    setOp(0xAE, LDX, ABS, 4);
    setOp(0xBE, LDX, ABY, 4, 1);

    // LDY
    setOp(0xA0, LDY, IMM, 2);
    setOp(0xA4, LDY, ZPG, 3);
    setOp(0xB4, LDY, ZPX, 4);
    setOp(0xAC, LDY, ABS, 4);
    setOp(0xBC, LDY, ABX, 4, 1);

    // STA
    setOp(0x85, STA, ZPG, 3);
    setOp(0x95, STA, ZPX, 4);
    setOp(0x8D, STA, ABS, 4);
    setOp(0x9D, STA, ABX, 5);
    setOp(0x99, STA, ABY, 5);
    setOp(0x81, STA, IZX, 6);
    setOp(0x91, STA, IZY, 6);

    // STX
    setOp(0x86, STX, ZPG, 3);
    setOp(0x96, STX, ZPY, 4);
    setOp(0x8E, STX, ABS, 4);

    // STY
    setOp(0x84, STY, ZPG, 3);
    setOp(0x94, STY, ZPX, 4);
    setOp(0x8C, STY, ABS, 4);

    // Register transfers
    setOp(0xAA, TAX, ACC, 2);
    setOp(0xA8, TAY, ACC, 2);
    setOp(0xBA, TSX, ACC, 2);
    setOp(0x8A, TXA, ACC, 2);
    setOp(0x98, TYA, ACC, 2);
    setOp(0x9A, TXS, ACC, 2);

    // Stack
    setOp(0x48, PHA, ACC, 3);
    setOp(0x68, PLA, ACC, 4);
    setOp(0x08, PHP, ACC, 3);
    setOp(0x28, PLP, ACC, 4);

    // Logical
    setOp(0x29, AND, IMM, 2);
    setOp(0x25, AND, ZPG, 3);
    setOp(0x35, AND, ZPX, 4);
    setOp(0x2D, AND, ABS, 4);
    setOp(0x3D, AND, ABX, 4, 1);
    setOp(0x39, AND, ABY, 4, 1);
    setOp(0x21, AND, IZX, 6);
    setOp(0x31, AND, IZY, 5, 1);

    setOp(0x49, EOR, IMM, 2);
    setOp(0x45, EOR, ZPG, 3);
    setOp(0x55, EOR, ZPX, 4);
    setOp(0x4D, EOR, ABS, 4);
    setOp(0x5D, EOR, ABX, 4, 1);
    setOp(0x59, EOR, ABY, 4, 1);
    setOp(0x41, EOR, IZX, 6);
    setOp(0x51, EOR, IZY, 5, 1);

    setOp(0x09, ORA, IMM, 2);
    setOp(0x05, ORA, ZPG, 3);
    setOp(0x15, ORA, ZPX, 4);
    setOp(0x0D, ORA, ABS, 4);
    setOp(0x1D, ORA, ABX, 4, 1);
    setOp(0x19, ORA, ABY, 4, 1);
    setOp(0x01, ORA, IZX, 6);
    setOp(0x11, ORA, IZY, 5, 1);

    setOp(0x24, BIT, ZPG, 3);
    setOp(0x2C, BIT, ABS, 4);

    // Arithmetic
    setOp(0x69, ADC, IMM, 2);
    setOp(0x65, ADC, ZPG, 3);
    setOp(0x75, ADC, ZPX, 4);
    setOp(0x6D, ADC, ABS, 4);
    setOp(0x7D, ADC, ABX, 4, 1);
    setOp(0x79, ADC, ABY, 4, 1);
    setOp(0x61, ADC, IZX, 6);
    setOp(0x71, ADC, IZY, 5, 1);

    setOp(0xE9, SBC, IMM, 2);
    setOp(0xE5, SBC, ZPG, 3);
    setOp(0xF5, SBC, ZPX, 4);
    setOp(0xED, SBC, ABS, 4);
    setOp(0xFD, SBC, ABX, 4, 1);
    setOp(0xF9, SBC, ABY, 4, 1);
    setOp(0xE1, SBC, IZX, 6);
    setOp(0xF1, SBC, IZY, 5, 1);

    setOp(0xC9, CMP, IMM, 2);
    setOp(0xC5, CMP, ZPG, 3);
    setOp(0xD5, CMP, ZPX, 4);
    setOp(0xCD, CMP, ABS, 4);
    setOp(0xDD, CMP, ABX, 4, 1);
    setOp(0xD9, CMP, ABY, 4, 1);
    setOp(0xC1, CMP, IZX, 6);
    setOp(0xD1, CMP, IZY, 5, 1);

    setOp(0xE0, CPX, IMM, 2);
    setOp(0xE4, CPX, ZPG, 3);
    setOp(0xEC, CPX, ABS, 4);

    setOp(0xC0, CPY, IMM, 2);
    setOp(0xC4, CPY, ZPG, 3);
    setOp(0xCC, CPY, ABS, 4);

    // Increment/Decrement
    setOp(0xE6, INC, ZPG, 5);
    setOp(0xF6, INC, ZPX, 6);
    setOp(0xEE, INC, ABS, 6);
    setOp(0xFE, INC, ABX, 7);
    setOp(0xE8, INX, ACC, 2);
    setOp(0xC8, INY, ACC, 2);

    setOp(0xC6, DEC, ZPG, 5);
    setOp(0xD6, DEC, ZPX, 6);
    setOp(0xCE, DEC, ABS, 6);
    setOp(0xDE, DEC, ABX, 7);
    setOp(0xCA, DEX, ACC, 2);
    setOp(0x88, DEY, ACC, 2);

    // Shifts
    setOp(0x0A, ASL, ACC, 2);
    setOp(0x06, ASL, ZPG, 5);
    setOp(0x16, ASL, ZPX, 6);
    setOp(0x0E, ASL, ABS, 6);
    setOp(0x1E, ASL, ABX, 7);

    setOp(0x4A, LSR, ACC, 2);
    setOp(0x46, LSR, ZPG, 5);
    setOp(0x56, LSR, ZPX, 6);
    setOp(0x4E, LSR, ABS, 6);
    setOp(0x5E, LSR, ABX, 7);

    setOp(0x2A, ROL, ACC, 2);
    setOp(0x26, ROL, ZPG, 5);
    setOp(0x36, ROL, ZPX, 6);
    setOp(0x2E, ROL, ABS, 6);
    setOp(0x3E, ROL, ABX, 7);

    setOp(0x6A, ROR, ACC, 2);
    setOp(0x66, ROR, ZPG, 5);
    setOp(0x76, ROR, ZPX, 6);
    setOp(0x6E, ROR, ABS, 6);
    setOp(0x7E, ROR, ABX, 7);

    // Jump
    setOp(0x4C, JMP, ABS, 3);
    setOp(0x6C, JMP, IND, 5);

    setOp(0x20, JSR, ABS, 6);
    setOp(0x60, RTS, ACC, 6);
    setOp(0x40, RTI, ACC, 6);

    // Branches
    setOp(0x90, branchIf(!getC(state.STATUS)), REL, 2, 1);
    setOp(0xB0, branchIf(getC(state.STATUS)), REL, 2, 1);
    setOp(0xF0, branchIf(getFlag(state.STATUS, StatusFlags.Z)), REL, 2, 1);
    setOp(0x30, branchIf(getFlag(state.STATUS, StatusFlags.N)), REL, 2, 1);
    setOp(0xD0, branchIf(!getFlag(state.STATUS, StatusFlags.Z)), REL, 2, 1);
    setOp(0x10, branchIf(!getFlag(state.STATUS, StatusFlags.N)), REL, 2, 1);
    setOp(0x50, branchIf(!getFlag(state.STATUS, StatusFlags.V)), REL, 2, 1);
    setOp(0x70, branchIf(getFlag(state.STATUS, StatusFlags.V)), REL, 2, 1);

    // Flag changes
    setOp(0x18, CLC, ACC, 2);
    setOp(0x38, SEC, ACC, 2);
    setOp(0x58, CLI, ACC, 2);
    setOp(0x78, SEI, ACC, 2);
    setOp(0xB8, CLV, ACC, 2);
    setOp(0xD8, CLD, ACC, 2);
    setOp(0xF8, SED, ACC, 2);

    // BRK and NOP
    setOp(0x00, BRK, ACC, 7);
    setOp(0xEA, NOP, ACC, 2);

    // Some unofficial opcodes as NOPs
    for (let i = 0x80; i < 0x100; i++) {
      if (this.executeFuncs[i] === undefined) {
        setOp(i as u8, NOP, ACC, 2);
      }
    }
  }

  reset(): void {
    this.state.PC = (this.bus.read(0xFFFC) | (this.bus.read(0xFFFD) << 8));
    this.state.SP = 0xFD;
    this.state.STATUS = StatusFlags.U | StatusFlags.I;
    this.state.A = 0;
    this.state.X = 0;
    this.state.Y = 0;
    this.pendingCycles = 0;
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

    const opcode = this.bus.read(this.state.PC++);
    const exec = this.executeFuncs[opcode];
    const addressing = this.addressingFuncs[opcode];
    const baseCycles = this.instructionCycles[opcode];
    const extraCycles = this.extraCycles[opcode];

    const pcBefore = this.state.PC;
    const addr = addressing();
    exec(addr);
    const pcAfter = this.state.PC;
    const crossedPage = (pcBefore & 0xFF00) !== (pcAfter & 0xFF00);

    return baseCycles + (extraCycles && crossedPage ? extraCycles : 0);
  }

  getState(): CpuState {
    return { ...this.state };
  }
}