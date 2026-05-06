import { Emulator } from './emulator';
import { CONTROLLER_BUTTONS } from './types/nes';

const ROM_INPUT = document.getElementById('rom-input') as HTMLInputElement;
const SCREEN = document.getElementById('screen') as HTMLCanvasElement;
const STATUS = document.getElementById('status') as HTMLSpanElement;

const emulator = new Emulator();
emulator.initRenderer(SCREEN);

ROM_INPUT.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  STATUS.textContent = 'Loading...';

  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  emulator.loadRom(data);

  STATUS.textContent = file.name;
  emulator.start();
});

const keyMap: Record<string, string> = {
  'KeyZ': 'a',
  'KeyX': 'b',
  'ShiftLeft': 'select',
  'Enter': 'start',
  'ArrowUp': 'up',
  'ArrowDown': 'down',
  'ArrowLeft': 'left',
  'ArrowRight': 'right',
};

document.addEventListener('keydown', (e) => {
  const button = keyMap[e.code];
  if (button) {
    emulator.setControllerButton(button, true);
    e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => {
  const button = keyMap[e.code];
  if (button) {
    emulator.setControllerButton(button, false);
  }
});

console.log('jsNes emulator loaded. Use the file input to load a .nes ROM.');