# jsNes AGENTS.md

## 项目
- NES 模拟器 (TypeScript + Vite + tsc)
- 架构：单线程、Opcode Table、3 PPU:1 CPU cycle、TypedArray、零分配

## 项目结构
```
src/
├── types/        # 共享类型
├── cpu/          # 6502 CPU (56指令/256 opcode)
├── ppu/          # PPU (逐cycle pipeline)
├── bus/          # 地址解码/读写路由
├── cartridge/    # Cartridge + Mapper 接口
├── render/       # Canvas/WebGL 渲染器
├── input/        # Controller 输入
└── emulator/     # Emulator 类 + 主循环
```

## 设计文档
- 设计文档在 `design_doc/design.md` (中文)

## 关键设计
- Framebuffer: `Uint32Array(256×240)`，**BGRA 格式**
- 颜色输出: `ctx.putImageData()` 每帧一次
- Mapper 抽象: `interface Mapper` 支持扩展
- 主循环: `ppu.clock×3 + cpu.clock×1` 由 `requestAnimationFrame` 驱动
- 内存初始化: RAM/VRAM 全 0，OAM 全 $FF

## CPU
- 256 条 opcode (56 基础指令 × 多种地址模式)
- STATUS 标志位: N/V/U/B/D/I/Z/C
- 中断: NMI (0xFFFA), IRQ (0xFFFE), RESET (0xFFFC)
- 跨页惩罚: 跨页 branch +1, 跨页 ABS,X/Y +1

## PPU
- 341 cycles/scanline, 262 scanlines/frame
- 寄存器: $2000-$2007, $4014 (OAM DMA)
- 逐 cycle pipeline: NT → AT → BG low → BG high
- VBlank: scanline 241 设置, scanline 261 清除

## 测试
- 使用外部 nestest.nes 验证 CPU

## 编码规范
- 使用 `u8`/`u16`/`u32` 类型别名或直接用 `number`
- TypedArray 替代 `number[]`
- 热路径避免对象分配