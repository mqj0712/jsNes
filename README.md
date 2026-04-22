# jsNes

A JavaScript/TypeScript NES (Nintendo Entertainment System) emulator built with Vite + tsc.

## Features

- **Architecture**: Single-threaded, opcode-table-driven, 3 PPU : 1 CPU cycle timing
- **CPU**: 6502 processor with 256 opcode table (56 base instructions)
- **PPU**: Cycle-accurate pipeline simulation (341 cycles/scanline, 262 scanlines/frame)
- **Renderer**: Canvas/WebGL with framebuffer decoupled from rendering
- **Mapper**: Extensible Mapper interface (prototype: Mapper0/NROM)
- **Input**: Standard NES controller protocol with keyboard mapping

## Project Structure

```
src/
├── types/        # Shared types (CPU/PPU/Bus/Cartridge/NES)
├── cpu/          # 6502 CPU (registers/instructions/addressing/interrupts)
├── ppu/          # PPU (registers/pipeline/sprites/vram)
├── bus/          # Address decoding, read/write routing
├── cartridge/    # Cartridge + Mapper interface + Mapper0
├── render/       # Canvas/WebGL renderer + NES palette
├── input/        # Controller input
└── emulator/     # Emulator class + main loop
```

## Development Progress

### Completed
- [x] Project scaffolding (TypeScript + Vite + tsc)
- [x] Type definitions
- [x] CPU module (256 opcodes, STATUS flags, interrupts, stack)
- [x] PPU module (registers, VRAM, OAM, cycle-accurate pipeline)
- [x] Bus module (address decoding, memory mapping)
- [x] Cartridge module (iNES header parsing, Mapper0)
- [x] Renderer module (Canvas/WebGL, NES 52-color palette)
- [x] Input module (controller protocol, keyboard mapping)
- [x] Emulator module (main loop: ppu.clock×3 + cpu.clock×1)
- [x] Main entry with file upload

### In Progress
- PPU rendering accuracy improvements
- CPU instruction edge cases
- Mapper extension (MMC1, MMC3)

### TODO
- APU/Audio
- Save states
- Debugger (breakpoints, trace)
- WebAssembly optimization

## Running

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Type checking
npm run typecheck

# Production build
npm run build
```

## Keyboard Controls

| NES Button | Keyboard |
|------------|----------|
| A | Z |
| B | X |
| Select | Shift |
| Start | Enter |
| Up | Arrow Up |
| Down | Arrow Down |
| Left | Arrow Left |
| Right | Arrow Right |

## Testing

Use external `nestest.nes` ROM to verify CPU correctness.

## License

MIT