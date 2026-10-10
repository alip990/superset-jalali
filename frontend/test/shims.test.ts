import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {vi.unstubAllGlobals(); vi.resetModules();});

it.each([false, true])('uses the host modules (default wrapper: %s)', async wrapped => {
  const react = {createElement: () => null}, dom = {createPortal: () => null}, core = {getExtensionsRegistry: () => ({})};
  const shape = (value: unknown) => wrapped ? {default:value} : value;
  vi.stubGlobal('window', {'__superset__/react':shape(react), '__superset__/react-dom':shape(dom), '__superset__/@superset-ui/core':shape(core)});
  const shim = await import('../src/shims');
  expect(shim.React).toBe(react);
  expect(shim.ReactDOM).toBe(dom);
  expect(shim.core).toBe(core);
});

it('explains a missing host module', async () => {
  vi.stubGlobal('window', {});
  await expect(import('../src/shims')).rejects.toThrow('superset-jalali: host module react missing');
});
