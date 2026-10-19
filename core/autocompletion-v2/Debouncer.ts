export class Debouncer {
  private delay: number;
  private timerId?: ReturnType<typeof setTimeout>;
  private resolvers: (() => void)[] = [];

  constructor(delay?: number) {
    this.delay = delay ?? 250;
  }

  public cancel() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = undefined;
    }
  }

  public setDelayTime(delay: number) {
    if (delay < 0) {
      throw new Error("Delay must be greater than 0");
    }

    this.delay = delay;
  }

  public async wait() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = undefined;
    }

    return new Promise<void>((resolve) => {
      this.resolvers.push(resolve);
      this.timerId = setTimeout(() => {
        this.resolvers.forEach((r) => r());
        this.resolvers = [];
        this.timerId = undefined;
      }, this.delay);
    });
  }
}
