export type SnapshotKey = string & { readonly __brand: unique symbol }

export interface ReadonlySnapshotData extends Iterable<[string[], string]> {
    readonly size: number
    copy(): SnapshotData
    toMap(): Map<SnapshotKey, string>
    get(key: readonly string[]): string | undefined
    has(key: readonly string[]): boolean
    values(): IterableIterator<string>
}

export class SnapshotData implements ReadonlySnapshotData {
    private readonly data = new Map<SnapshotKey, string>()

    public get size(): number {
        return this.data.size
    }

    public constructor() {}

    public static fromMap(map: ReadonlyMap<SnapshotKey, string>): SnapshotData {
        const data = new SnapshotData()
        for (const [key, value] of map) {
            data.data.set(key, value)
        }
        return data
    }

    public copy(): SnapshotData {
        return SnapshotData.fromMap(this.data)
    }

    public toMap(): Map<SnapshotKey, string> {
        return new Map(this.data)
    }

    private static stringifyKey(key: readonly string[]): SnapshotKey {
        return JSON.stringify(key) as SnapshotKey
    }
    private static parseKey(key: SnapshotKey): string[] {
        return JSON.parse(key)
    }

    public get(key: readonly string[]): string | undefined {
        return this.data.get(SnapshotData.stringifyKey(key))
    }

    public set(key: readonly string[], value: string): void {
        this.data.set(SnapshotData.stringifyKey(key), value)
    }

    public delete(key: readonly string[]): void {
        this.data.delete(SnapshotData.stringifyKey(key))
    }

    public clear(): void {
        this.data.clear()
    }

    public has(key: readonly string[]): boolean {
        return this.data.has(SnapshotData.stringifyKey(key))
    }

    public *values(): IterableIterator<string> {
        yield* this.data.values()
    }

    public *[Symbol.iterator](): IterableIterator<[string[], string]> {
        for (const [key, value] of this.data) {
            yield [SnapshotData.parseKey(key), value]
        }
    }

    public mergeWithExisting(existing: ReadonlySnapshotData): SnapshotData {
        const newData = this.toMap()
        const existingData = existing.toMap()

        if (existingData.size === 0) {
            return this.copy()
        }

        const existingKeys = [...existingData.keys()]
        const newKeys = [...newData.keys()]

        const keys = [...new Set([...existingKeys, ...newKeys])]
        if (keys.length === existingData.size) {
            // nothing was added
            return existing.copy()
        }

        const lastExistingInNew = newKeys.findLast((key) => existingData.has(key))
        if (lastExistingInNew === undefined) {
            // the new snaps have no relation to the existing ones
            return SnapshotData.fromMap(new Map([...existingData, ...newData]))
        }

        const order = new Map<SnapshotKey, number>(existingKeys.map((key, i) => [key, i]))
        let currentOrder = order.get(lastExistingInNew)! + 0.5
        for (const key of [...newKeys].reverse()) {
            const existing = order.get(key)
            if (existing !== undefined) {
                currentOrder = existing - 0.5
            } else {
                order.set(key, currentOrder)
            }
        }

        keys.sort((a, b) => order.get(a)! - order.get(b)!)

        return SnapshotData.fromMap(
            new Map(keys.map((key) => [key, existingData.get(key) ?? newData.get(key)!])),
        )
    }
}
