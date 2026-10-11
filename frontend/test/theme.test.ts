import { expect, it } from 'vitest';
import { isDarkTheme } from '../src/theme';

it.each([
  ['rgb(255, 255, 255)', 'rgb(37, 55, 70)', false],
  ['rgb(31, 41, 51)', 'rgb(237, 242, 247)', true],
  ['rgb(0, 0, 0)', 'rgb(37, 55, 70)', true],
  ['rgb(169, 169, 169)', 'rgb(0, 0, 0)', true],
  ['rgb(170, 170, 170)', 'rgb(0, 0, 0)', false],
  ['transparent', 'rgb(37, 55, 70)', false],
  ['rgba(0, 0, 0, 0)', 'rgb(37, 55, 70)', false],
  ['rgba(0, 0, 0, 0.5)', 'rgb(37, 55, 70)', true],
  ['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)', true],
  ['rgb(255, 255, 255)', 'rgb(237, 242, 247)', true],
  ['rgb(255 255 255)', 'rgb(37 55 70)', false],
  ['', '', false],
  ['not-a-colour', 'rgba(255,255,255,0)', false],
])('detects theme from background %s and text %s', (background, text, dark) => {
  expect(isDarkTheme(background, text)).toBe(dark);
});
