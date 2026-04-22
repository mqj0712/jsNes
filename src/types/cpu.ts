import type { u8, u16 } from './common.ts';

export const enum StatusFlags {
  C = 1 << 0,  // Carry
  Z = 1 << 1,  // Zero
  I = 1 << 2,  // Interrupt disable
  D = 1 << 3,  // Decimal mode
  B = 1 << 4,  // Break
  U = 1 << 5,  // Unused
  V = 1 << 6,  // Overflow
  N = 1 << 7,  // Negative
}

export interface CpuState {
  A: u8;
  X: u8;
  Y: u8;
  PC: u16;
  SP: u8;
  STATUS: u8;
}

export type AddressingMode = () => u16;
export type InstructionExecute = (addr: u16) => void;

export interface Instruction {
  name: string;
  addrMode: AddressingMode;
  execute: InstructionExecute;
  cycles: number;
  pageCrossed?: boolean;
}

export interface CpuInstructionSet {
  getInstruction(opcode: u8): Instruction;
  LDA: InstructionExecute;
  LDX: InstructionExecute;
  LDY: InstructionExecute;
  STA: InstructionExecute;
  STX: InstructionExecute;
  STY: InstructionExecute;
  TAX: InstructionExecute;
  TAY: InstructionExecute;
  TSX: InstructionExecute;
  TXA: InstructionExecute;
  TYA: InstructionExecute;
  TXS: InstructionExecute;
  PLA: InstructionExecute;
  PHA: InstructionExecute;
  PLP: InstructionExecute;
  PHP: InstructionExecute;
  AND: InstructionExecute;
  EOR: InstructionExecute;
  ORA: InstructionExecute;
  BIT: InstructionExecute;
  ADC: InstructionExecute;
  SBC: InstructionExecute;
  CMP: InstructionExecute;
  CPX: InstructionExecute;
  CPY: InstructionExecute;
  INC: InstructionExecute;
  INX: InstructionExecute;
  INY: InstructionExecute;
  DEC: InstructionExecute;
  DEX: InstructionExecute;
  DEY: InstructionExecute;
  ASL: InstructionExecute;
  LSR: InstructionExecute;
  ROL: InstructionExecute;
  ROR: InstructionExecute;
  JMP: InstructionExecute;
  JSR: InstructionExecute;
  RTS: InstructionExecute;
  RTI: InstructionExecute;
  BCC: InstructionExecute;
  BCS: InstructionExecute;
  BEQ: InstructionExecute;
  BMI: InstructionExecute;
  BNE: InstructionExecute;
  BPL: InstructionExecute;
  BVC: InstructionExecute;
  BVS: InstructionExecute;
  BCL: InstructionExecute;
  SEC: InstructionExecute;
  CLC: InstructionExecute;
  SEI: InstructionExecute;
  CLI: InstructionExecute;
  CLV: InstructionExecute;
  SED: InstructionExecute;
  CLD: InstructionExecute;
  BRK: InstructionExecute;
  NOP: InstructionExecute;
}

export enum InterruptType {
  RESET,
  NMI,
  IRQ,
}