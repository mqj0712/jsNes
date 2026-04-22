export type u8 = number;
export type u16 = number;
export type u32 = number;

export interface Memory {
  read(addr: u16): u8;
  write(addr: u16, value: u8): void;
}

export function u8(val: number): u8 {
  return val & 0xFF;
}

export function u16(val: number): u16 {
  return val & 0xFFFF;
}