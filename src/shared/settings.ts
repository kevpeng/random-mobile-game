import { effect, signal } from '@preact/signals';
import { load, save } from './storage';

export interface SharedSettings {
  haptics: boolean;
  sound: boolean;
}

const KEY = 'puzzles:settings:v1';

export const shared = signal<SharedSettings>(load(KEY, { haptics: true, sound: false }));
effect(() => save(KEY, shared.value));

export type Route = 'home' | 'queens' | 'sort';
const ROUTE_KEY = 'puzzles:route:v1';
export const route = signal<Route>(load(ROUTE_KEY, { route: 'home' as Route }).route);
effect(() => save(ROUTE_KEY, { route: route.value }));
