import { fail, strictEqual } from "assert"
import { ARG_UPDATE, IS_CI } from "./config"
import { readSnapshotFileCached, writeSnapshotFile } from "./file"

export interface SnapshotTester {
    assertEqual(actual: string): void
}

const toUpdate = new Map<string, Map<string, string>>()

function updateSnapshot(file: string, title: string, value: string): void {
    let map = toUpdate.get(file)
    if (map === undefined) {
        map = new Map()
        toUpdate.set(file, map)
    }

    if (map.has(title)) {
        throw new Error("There can be only one snapshot value per test case.")
    }
    map.set(title, value)
}

export function assertEqualSnapshot(snapshotFile: string, title: string, actual: string): void {
    if (ARG_UPDATE) {
        // update existing or add new
        updateSnapshot(snapshotFile, title, actual)
        return
    }

    const expected = readSnapshotFileCached(snapshotFile).get(title)

    if (expected === undefined) {
        // add new
        if (IS_CI) {
            // but not in CI
            fail("No snapshot found. Run tests with `--update` to create a new snapshot.")
        }
        updateSnapshot(snapshotFile, title, actual)
        return
    }

    updateSnapshot(snapshotFile, title, expected)
    strictEqual(actual, expected)
}

function mergeWithExisting(
    existing: ReadonlyMap<string, string>,
    newData: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
    if (existing.size === 0) {
        return newData
    }

    const existingKeys: readonly string[] = [...existing.keys()]
    const newKeys: readonly string[] = [...newData.keys()]

    const keys = [...new Set<string>([...existingKeys, ...newKeys])]
    if (keys.length === existing.size) {
        // nothing was added
        return existing
    }

    const lastExistingInNew = newKeys.findLast((key) => existing.has(key))
    if (lastExistingInNew === undefined) {
        // the new snaps have no relation to the existing ones
        return new Map([...existing, ...newData])
    }

    const order = new Map<string, number>(existingKeys.map((key, i) => [key, i]))
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

    return new Map(keys.map((key) => [key, existing.get(key) ?? newData.get(key)!]))
}

export function writeSnapshotChanges(): void {
    const unused: { file: string; count: number }[] = []

    for (const [file, data] of toUpdate) {
        let toWrite: ReadonlyMap<string, string> = data
        if (!ARG_UPDATE) {
            // add back the existing snapshots
            const existing = readSnapshotFileCached(file)
            toWrite = mergeWithExisting(existing, data)
            if (toWrite.size === existing.size) {
                // nothing changed
                continue
            }
            const unusedCount = toWrite.size - data.size
            if (unusedCount > 0) {
                unused.push({ file, count: unusedCount })
            }
        }

        writeSnapshotFile(file, toWrite)
    }

    if (unused.length > 0) {
        const total = unused.reduce((sum, { count }) => sum + count, 0)
        console.warn("")
        console.warn("")
        console.warn(
            `Found ${total} unused snapshots in ${unused.length} file(s). Run tests with \`--update\` to remove them.`,
        )
        for (const { file, count } of unused) {
            console.warn(`  ${count} unused snapshot(s) in ${file}`)
        }
        console.warn("")
        console.warn("")
        if (IS_CI) {
            fail("Unused snapshots are not allowed in CI.")
        }
    }
}
