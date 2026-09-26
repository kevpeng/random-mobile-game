import { effect, signal } from '@preact/signals';
import { load, save } from './storage';

export interface SharedSettings {
  haptics: boolean;
  sound: boolean;
}

const KEY = 'puzzles:settings:v1';

export const shared = signal<SharedSettings>(load(KEY, { haptics: true, sound: false }));
effect(() => save(KEY, shared.value));
