export class ObjectPool<T> {
  private readonly free: T[] = [];

  constructor(
    private readonly create: () => T,
    private readonly reset: (value: T) => void,
  ) {}

  acquire(): T {
    const value = this.free.pop();
    if (value) return value;
    return this.create();
  }

  release(value: T): void {
    this.reset(value);
    this.free.push(value);
  }

  get size(): number {
    return this.free.length;
  }
}
