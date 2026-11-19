export class SpatialHash<T> {
  private readonly cells = new Map<string, T[]>();

  constructor(private readonly cellSize = 64) {}

  clear(): void {
    this.cells.clear();
  }

  insert(x: number, y: number, value: T): void {
    const key = this.key(x, y);
    const cell = this.cells.get(key);
    if (cell) cell.push(value);
    else this.cells.set(key, [value]);
  }

  nearby(x: number, y: number): readonly T[] {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const result: T[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cell = this.cells.get(`${cx + dx},${cy + dy}`);
        if (cell) result.push(...cell);
      }
    }
    return result;
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }
}
