/** Minimalny, typowany emiter zdarzeń dla klas spoza Reacta. */
export class Emitter<E extends Record<string, unknown>> {
  private map = new Map<keyof E, Set<(v: never) => void>>();

  on<K extends keyof E>(key: K, fn: (v: E[K]) => void): () => void {
    let set = this.map.get(key);
    if (!set) this.map.set(key, (set = new Set()));
    set.add(fn as (v: never) => void);
    return () => set.delete(fn as (v: never) => void);
  }

  protected emit<K extends keyof E>(key: K, value: E[K]) {
    this.map.get(key)?.forEach((fn) => (fn as (v: E[K]) => void)(value));
  }
}
