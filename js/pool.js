export class ObjectPool {
  constructor(createFn, initialSize = 50) {
    this.createFn = createFn;
    this.pool = [];
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createFn());
    }
  }

  get() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    return this.createFn();
  }

  release(obj) {
    this.pool.push(obj);
  }
}
