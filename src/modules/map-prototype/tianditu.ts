export const INITIAL_CENTER_4326: [number, number] = [114.635, 30.25];

export type TiandituLayer = 'img' | 'cia';

export function validBrowserKey(key: string): boolean {
  return /^[A-Za-z0-9]{32}$/.test(key);
}

export function tiandituWmtsUrls(layer: TiandituLayer, key: string): string[] {
  const query =
    `SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}` +
    `&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
    `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${encodeURIComponent(key)}`;
  return Array.from({ length: 8 }, (_, index) =>
    `https://t${index}.tianditu.gov.cn/${layer}_w/wmts?${query}`,
  );
}
