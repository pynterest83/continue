import * as crypto from "crypto";

export class LRUCache {
  private capacity: number;
  private map: Map<string, string>;

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error("Capacity must be greater than 0");
    }
    this.capacity = capacity;
    this.map = new Map();
  }

  public get(key: string): string | undefined {
    if (!this.map.has(key)) {
      return undefined;
    }

    // Move the key to the most recently used position
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);

    return value;
  }

  public put(key: string, value: string): void {
    if (this.map.has(key)) {
      // If the key exists, delete it to refresh its position
      this.map.delete(key);
    }

    this.map.set(key, value);

    // If capacity is exceeded, evict the least recently used item
    if (this.map.size > this.capacity) {
      const leastRecentlyUsedKey = this.map.keys().next().value;
      if (leastRecentlyUsedKey !== undefined) {
        this.map.delete(leastRecentlyUsedKey);
      }
    }
  }

  public size(): number {
    return this.map.size;
  }

  public getHash(request_context: string): string {
    const hashSha256 = crypto.createHash("sha256");
    return hashSha256.update(request_context).digest("hex");
  }

  public getMap(): Map<string, string> {
    return this.map;
  }
}
