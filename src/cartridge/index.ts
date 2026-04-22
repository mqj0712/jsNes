import type { Mapper, CartridgeInfo } from '../types/cartridge';
import { INES_MAGIC, CartridgeFlags6 } from '../types/cartridge';
import type { u8, u16 } from '../types/common';
import { Mapper0 } from './mappers/mapper0';

export class Cartridge {
  prg!: Uint8Array;
  chr!: Uint8Array;
  prgRam: Uint8Array;
  mapper!: Mapper;
  info!: CartridgeInfo;

  constructor(romData: Uint8Array) {
    this.prgRam = new Uint8Array(0x2000);
    this.parseINes(romData);
  }

  private parseINes(romData: Uint8Array): void {
    const header = romData.slice(0, 16);

    for (let i = 0; i < 4; i++) {
      if (header[i] !== INES_MAGIC[i]) {
        throw new Error('Invalid iNES ROM file');
      }
    }

    const prgSize = header[4] * 0x4000;
    const chrSize = header[5] * 0x2000;
    const mapperLow = header[6] >> 4;
    const mapperHigh = header[7] & 0xF0;
    const mapperNumber = mapperLow | mapperHigh;
    const mirroring = header[6] & CartridgeFlags6.MIRROR_VERT ? 1 : 0;
    const hasBatteryRam = (header[6] & CartridgeFlags6.BATTERY_RAM) !== 0;
    const hasTrainer = (header[6] & CartridgeFlags6.TRAINER) !== 0;

    this.info = {
      prgSize,
      chrSize,
      mapperNumber,
      mapperName: `Mapper${mapperNumber}`,
      mirroring,
      hasBatteryRam,
      hasTrainer,
    };

    let offset = 16;
    if (hasTrainer) {
      offset += 512;
    }

    this.prg = romData.slice(offset, offset + prgSize);
    offset += prgSize;

    if (chrSize > 0) {
      this.chr = romData.slice(offset, offset + chrSize);
    } else {
      this.chr = new Uint8Array(0x2000);
    }

    const hasChrRam = chrSize === 0;
    this.mapper = this.createMapper(mapperNumber, this.prg, prgSize, chrSize, hasChrRam);
  }

  private createMapper(mapperNumber: u8, prg: Uint8Array, prgSize: u16, chrSize: u16, hasChrRam: boolean): Mapper {
    switch (mapperNumber) {
      case 0:
        return new Mapper0(prg, prgSize, chrSize, hasChrRam);
      default:
        throw new Error(`Unsupported mapper: ${mapperNumber}`);
    }
  }

  reset(): void {
    this.mapper.reset();
  }
}