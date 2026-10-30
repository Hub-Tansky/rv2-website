// Checks that an upload is a Robo Violence 2 / BaboViolent 2 map (.bvm) by its content, not its name.
// Layout from the game's reader, Map::Map in game/src/Map.cpp: a little-endian uint32 version, then (by version)
// a 25-byte author name, int16 theme and weather, int16 width and height (1 to 256 each), then two bytes per cell.

export const MAX_MAP_BYTES = 256 * 1024; // a 256 x 256 map is 131 kB of cells plus spawns

const HEADERS = {
  10010: { author: false, themeWeather: false },
  10011: { author: false, themeWeather: false },
  20201: { author: false, themeWeather: true },
  20202: { author: true, themeWeather: true },
};

// { version, width, height, author } for a readable map, or { error } saying why it isn't one.
export function readMapHeader(bytes) {
  const data = new Uint8Array(bytes);
  if (data.length < 8) return { error: 'The file is too short to be a map.' };
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = view.getUint32(0, true);
  const layout = HEADERS[version];
  if (!layout) return { error: 'This is not a .bvm map the game can read (unknown map version).' };
  let at = 4;
  let author = '';
  if (layout.author) {
    if (data.length < at + 25) return { error: 'The map file is cut off.' };
    const raw = data.subarray(at, at + 24);
    const end = raw.indexOf(0);
    // Drop the game's colour codes (bytes 1 to 9) and other control characters
    author = String.fromCharCode(...(end < 0 ? raw : raw.subarray(0, end)))
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim();
    at += 25;
  }
  if (layout.themeWeather) at += 4;
  if (data.length < at + 4) return { error: 'The map file is cut off.' };
  const width = view.getInt16(at, true);
  const height = view.getInt16(at + 2, true);
  at += 4;
  if (width < 1 || width > 256 || height < 1 || height > 256) return { error: 'The map size must be 1 to 256 cells per side.' };
  if (data.length < at + width * height * 2) return { error: 'The map file is cut off.' };
  return { version, width, height, author };
}
