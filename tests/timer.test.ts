import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimer } from '../src/shared/timer';

let t = 0;
beforeEach(() => {
  t = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
});
afterEach(() => vi.restoreAllMocks());

describe('createTimer', () => {
  it('only runs while shown, and adds up running segments', () => {
    const timer = createTimer();
    timer.start(); // not shown yet: waits
    t = 1000;
    expect(timer.elapsed()).toBe(0);
    timer.setShown(true); // now it starts
    t = 3000;
    expect(timer.elapsed()).toBe(2000);
    timer.setShown(false); // leaving the screen suspends it
    t = 10_000;
    expect(timer.elapsed()).toBe(2000);
    timer.setShown(true);
    t = 11_000;
    expect(timer.elapsed()).toBe(3000);
  });

  it('pause stops it for good until started again; add and reset adjust it', () => {
    const timer = createTimer();
    timer.setShown(true);
    timer.start();
    t = 500;
    timer.pause();
    t = 5000;
    expect(timer.elapsed()).toBe(500);
    timer.setShown(false);
    timer.setShown(true); // a paused timer doesn't resume on show
    t = 6000;
    expect(timer.elapsed()).toBe(500);
    timer.add(10_000);
    expect(timer.elapsed()).toBe(10_500);
    timer.reset(42);
    expect(timer.elapsed()).toBe(42);
    expect(timer.running()).toBe(false);
  });

  it('startWhenShown resumes a restored game only once visible', () => {
    const timer = createTimer();
    timer.reset(7000);
    timer.startWhenShown();
    t = 2000;
    expect(timer.elapsed()).toBe(7000);
    timer.setShown(true);
    t = 3000;
    expect(timer.elapsed()).toBe(8000);
  });
});
