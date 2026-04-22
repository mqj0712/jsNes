# NES 模拟器设计文档

> 目标：构建一个**单线程、高性能、接近工业级**的 NES 模拟器
> 核心策略：**Opcode Table + 锁步时序 + TypedArray + 零分配**

---

# 1. 项目配置

| 项目 | 配置 |
|------|------|
| 语言 | TypeScript |
| 构建 | Vite + tsc (类型检查) |
| 模块化 | ESNext modules |
| 严格模式 | strict: true |

---

# 2. 项目结构

```
src/
├── types/           # 共享类型定义 (CPU/PPU/Bus/Cartridge/NES)
├── cpu/             # 6502 CPU (寄存器/指令/地址模式/中断)
├── ppu/             # PPU (寄存器/pipeline/sprites/vram)
├── bus/             # 地址解码, 读写路由
├── cartridge/       # Cartridge + Mapper 接口 + Mapper0
├── render/          # Canvas/WebGL 渲染器 + 调色板
├── input/           # Controller 输入
└── emulator/        # 顶层 Emulator 类 + 主循环
```

---

# 3. 设计原则

- 单线程（避免非确定性）
- CPU / PPU 锁步执行（1:3 cycle）
- 表驱动（Opcode Table）
- 使用 TypedArray（高性能）
- 避免 GC（关键路径无对象分配）
- Mapper 可扩展抽象设计

---

# 4. 总线设计

## 4.1 职责

- 地址解码
- 路由 CPU 读写请求
- 连接所有硬件模块

## 4.2 内存映射

```
0x0000–0x1FFF RAM（镜像）
0x2000–0x3FFF PPU 寄存器（镜像）
0x4000–0x401F APU / IO
0x4020–0xFFFF Cartridge（ROM + Mapper）
```

## 4.3 CPU 读写快路径

```typescript
function cpuRead(addr: u16): u8 {
  addr &= 0xFFFF;
  if (addr < 0x2000) {
    return ram[addr & 0x07FF];
  } else if (addr < 0x4000) {
    return ppuRead(addr & 7);
  } else if (addr >= 0x8000) {
    return mapper.cpuRead(addr);
  } else {
    return 0;
  }
}
```

---

# 5. CPU 设计（6502）

## 5.1 寄存器

```typescript
let A = 0;           // 累加器
let X = 0;           // X 索引寄存器
let Y = 0;           // Y 索引寄存器
let PC = 0;          // 程序计数器
let SP = 0xFD;       // 堆栈指针 (0x0100-0x01FF)
let STATUS = 0x00;   // 状态寄存器
let cycles = 0;      // 剩余 cycle 数
```

## 5.2 状态寄存器 (STATUS)

| 位 | 标志 | 说明 |
|----|------|------|
| 7 | N | 负数标志 |
| 6 | V | 溢出标志 |
| 5 | U | 未使用 (始终为1) |
| 4 | B | Break 指令标志 |
| 3 | D | 十进制模式标志 |
| 2 | I | 中断禁止标志 |
| 1 | Z | 零标志 |
| 0 | C | 进位标志 |

## 5.3 完整指令集

- 56 条基础指令 × 多种地址模式 = 256 条 opcode
- 地址模式：IMM, ZPG, ZPX, ZPY, ABS, ABX, ABY, IND, IZX, IZY, REL
- 包含分支/控制流指令：BEQ, BNE, BPL, BMI, BVC, BVS, BCS, BCC, JMP, JSR, RTS, RTI
- 堆栈指令：PHA, PLA, PHP, PLP
- 跨页惩罚：跨页 branch +1 cycle，跨页 ABS,X/ABS,Y +1 cycle

## 5.4 Opcode Table 结构

```typescript
const opTable = new Array<Instruction>(256);

opTable[0xA9] = {
  name: "LDA",
  addrMode: IMM,
  execute: LDA,
  cycles: 2
};
```

## 5.5 执行流程

```typescript
function cpuClock() {
  if (cycles === 0) {
    const opcode = cpuRead(PC++);
    const inst = opTable[opcode];
    const addr = inst.addrMode();
    inst.execute(addr);
    cycles = inst.cycles;
  }
  cycles--;
}
```

## 5.6 中断处理

| 中断 | 触发条件 | 向量地址 |
|------|----------|----------|
| RESET | 上电 / 复位 | 0xFFFC |
| NMI | 不可屏蔽 | 0xFFFA |
| IRQ | 可屏蔽 (I=0 时) | 0xFFFE |

---

# 6. PPU 设计

## 6.1 状态变量

```typescript
let cycle = 0;          // 当前 cycle (0-340)
let scanline = 0;       // 当前扫描线 (0-261)
let frameComplete = false;
let oddFrame = false;   // 奇偶帧标志
```

## 6.2 时序规格

- 341 cycles per scanline
- 262 scanlines per frame
- 3 PPU cycles = 1 CPU cycle
- Scanline 0-239: 可见扫描
- Scanline 240: post-render
- Scanline 241: VBlank 开始
- Scanline 261: VBlank 结束

## 6.3 时序推进

```typescript
function ppuClock() {
  cycle++;

  if (cycle === 341) {
    cycle = 0;
    scanline++;

    if (scanline === 241) enterVBlank();
    if (scanline === 262) {
      scanline = 0;
      frameComplete = true;
      oddFrame = !oddFrame;
    }
  }
}
```

## 6.4 奇偶帧处理

```typescript
if (renderingEnabled && oddFrame && scanline === 261 && cycle === 339) {
  cycle++; // 跳过奇偶帧的最后一个 cycle
}
```

## 6.5 逐 Cycle Pipeline (方案 A)

每个可见扫描线 (0-239) 的 341 cycles 分配：

| Cycles | 操作 |
|--------|------|
| 1-2 | NT byte (Nametable) |
| 3-4 | AT byte (Attribute) |
| 5-6 | BG low byte |
| 7-8 | BG high byte |
| 9-N | 输出像素 |
| ... | 重复 tile fetch 直到 cycle 341 |

## 6.6 寄存器

| 地址 | 名称 | 功能 |
|------|------|------|
| $2000 | PPUCTRL | 控制标志 (VBP, VBA, HBP, VSL, PPUmaster) |
| $2001 | PPUMASK | 渲染开关 (BGE, SGE, EMP, COL) |
| $2002 | PPUSTATUS | 状态 (VBlank, S0, COLHIT) |
| $2003 | OAMADDR | OAM 地址 |
| $2004 | OAMDATA | OAM 数据读写 |
| $2005 | PPUSCROLL | 滚动偏移 (twice write) |
| $2006 | PPUADDR | VRAM 地址 (twice write) |
| $2007 | PPUDATA | VRAM 数据读写 |
| $4014 | OAMDMA | OAM DMA (256-cycle) |

## 6.7 VRAM 结构

- 2KB 内部 RAM ($0000-$07FF)
- Nametables ($2000-$2FFF)
- Attribute Tables ($23C0-$3FFF)
- Palette ($3F00-$3F1F)
- OAM ($0000-$00FF, 64 sprites × 4 bytes)

## 6.8 VBlank 时序

- Scanline 241, cycle 1: 设置 VBlank 标志 ($2002 bit 7)
- Scanline 261, cycle 1: 清除 VBlank 标志
- NMI 在 VBlank 开始时触发 (如果 PPUCTRL bit 7 置位)

---

# 7. 主调度器

## 7.1 时序关系

```
3 PPU cycles = 1 CPU cycle
```

## 7.2 主循环

```typescript
function emulateCycle() {
  ppu.clock();
  ppu.clock();
  ppu.clock();
  cpu.clock();
}

function runFrame() {
  while (!ppu.frameComplete) {
    emulateCycle();
  }
  ppu.frameComplete = false;
  renderer.render(ppu.framebuffer);
}
```

## 7.3 浏览器驱动

```typescript
function frameLoop() {
  runFrame();
  requestAnimationFrame(frameLoop);
}

frameLoop();
```

---

# 8. Cartridge 与 Mapper

## 8.1 Mapper 接口 (可扩展)

```typescript
interface Mapper {
  reset(): void;
  cpuRead(addr: u16): u8;
  cpuWrite(addr: u16, val: u8): void;
  ppuRead(addr: u16): u8;
  ppuWrite(addr: u16, val: u8): void;
}
```

## 8.2 Cartridge 类

```typescript
class Cartridge {
  prg: Uint8Array;     // PRG ROM
  chr: Uint8Array;     // CHR ROM
  mapper: Mapper;
  prgRam: Uint8Array;  // PRG RAM (可选)

  constructor(rom: Uint8Array) {
    this.parseINes(rom);
    this.mapper = createMapper(this, mapperId);
  }
}
```

## 8.3 iNES Header (16 bytes)

| Offset | 大小 | 说明 |
|--------|------|------|
| 0-3 | 4 | "NES" + $1A |
| 4 | 1 | PRG ROM 大小 (16KB units) |
| 5 | 1 | CHR ROM 大小 (8KB units) |
| 6 | 1 | Mapper 低 4 位 + 标志 |
| 7 | 1 | Mapper 高 4 位 + 标志 |
| 8-15 | 8 | 保留 |

## 8.4 Mapper0 (NROM-128/256)

- PRG ROM: 16KB (banks 0-1) 或 32KB (bank 0)
- CHR ROM: 8KB (或 CHR RAM)
- 无 bankswitching
- CPU $8000-$BFFF: bank 0 / PRG low
- CPU $C000-$FFFF: bank 0 (16KB mode) / PRG high (32KB mode)

---

# 9. 渲染系统

## 9.1 Framebuffer

```typescript
const framebuffer = new Uint32Array(256 * 240); // 61440 pixels
```

- 颜色格式：**BGRA** (A=255)
- 每帧一次 `putImageData` 输出

## 9.2 Renderer 接口

```typescript
interface Renderer {
  init(canvas: HTMLCanvasElement): void;
  render(buffer: Uint32Array): void;
  setMode(mode: 'canvas' | 'webgl'): void;
}
```

## 9.3 Canvas 模式

```typescript
ctx.putImageData(imageData, 0, 0);
```

## 9.4 WebGL 模式

- 使用纹理上传 framebuffer
- 片段着色器处理颜色格式转换

## 9.5 NES 调色板

标准 52 色调色板，BGRA 格式存储。

---

# 10. 输入系统

## 10.1 控制器协议

- $4016: 控制器 1 数据
- $4017: 控制器 2 数据
- Strobe ($4016 bit 0) 锁存按钮状态
- 8-bit shift register 输出

## 10.2 按钮顺序

```
A, B, Select, Start, Up, Down, Left, Right
```

---

# 11. 初始化

## 11.1 CPU Reset

```typescript
PC = read16(0xFFFC);    // 从 reset 向量加载
SP = 0xFD;
STATUS = 0x00;
A = X = Y = 0;
cycles = 0;
```

## 11.2 内存初始化

```typescript
ram.fill(0);            // 2KB RAM 全 0
ppu.vram.fill(0);       // VRAM 全 0
ppu.oam.fill(0xFF);     // OAM 全 $FF
```

---

# 12. 测试

使用外部 nestest.nes 验证 CPU 正确性：
- 加载 nestest.nes ROM
- 对比 CPU log 输出与预期
- 验证指令执行、中断、标志位

---

# 13. 性能优化

## 13.1 内存

- 使用 TypedArray (Uint8Array, Uint16Array, Uint32Array)
- 避免 `new` / GC

## 13.2 分支优化

- 表驱动 opcode
- 减少 if/switch

## 13.3 位运算

```typescript
value &= 0xFF;  // 字节边界
```

## 13.4 热路径优化

- Bus 内联
- PPU fetch 表驱动
- CPU opcode inline

---

# 14. 精度分级

| 等级 | 描述 |
|------|------|
| Frame | 基本可运行 |
| Scanline | 正确滚动 |
| Cycle | 高精度 |

---

# 15. 后续扩展

- 完整 PPU pipeline
- MMC1 / MMC3 mapper
- APU 精确实现
- WebAssembly 优化
- 调试器 (breakpoint / trace)
- AudioWorklet 音频