import { audioExtension } from './episode-cache';

jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { cache: '' } }));

it('keeps the real audio extension for the player', () => {
  expect(audioExtension('https://cdn.example.com/ep1.m4a?token=abc')).toBe('m4a');
  expect(audioExtension('https://cdn.example.com/a/ep.MP3')).toBe('mp3');
  expect(audioExtension('https://cdn.example.com/stream?id=7')).toBe('mp3');
});
