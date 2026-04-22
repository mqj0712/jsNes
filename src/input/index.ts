import type { ControllerState } from '../types/nes';
import type { u8 } from '../types/common';

export class Controller {
  state: ControllerState = {
    a: false,
    b: false,
    select: false,
    start: false,
    up: false,
    down: false,
    left: false,
    right: false,
  };

  strobe: boolean = false;
  private shiftRegister: u8 = 0;

  setButton(button: keyof ControllerState, pressed: boolean): void {
    this.state[button] = pressed;
  }

  read(): u8 {
    if (this.strobe) {
      return this.state.a ? 0x01 : 0x00;
    }

    const bit = this.shiftRegister & 0x01;
    this.shiftRegister >>= 1;
    return bit;
  }

  write(value: u8): void {
    this.strobe = (value & 0x01) !== 0;
    if (this.strobe) {
      this.shiftRegister = 0;
      this.shiftRegister |= this.state.a ? 0x01 : 0;
      this.shiftRegister |= this.state.b ? 0x02 : 0;
      this.shiftRegister |= this.state.select ? 0x04 : 0;
      this.shiftRegister |= this.state.start ? 0x08 : 0;
      this.shiftRegister |= this.state.up ? 0x10 : 0;
      this.shiftRegister |= this.state.down ? 0x20 : 0;
      this.shiftRegister |= this.state.left ? 0x40 : 0;
      this.shiftRegister |= this.state.right ? 0x80 : 0;
    }
  }

  reset(): void {
    this.state = {
      a: false,
      b: false,
      select: false,
      start: false,
      up: false,
      down: false,
      left: false,
      right: false,
    };
    this.strobe = false;
    this.shiftRegister = 0;
  }
}

export function createController(): Controller {
  return new Controller();
}