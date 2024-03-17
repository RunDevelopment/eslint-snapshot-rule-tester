import { fail, strictEqual } from "assert"
import { ARG_UPDATE, IS_CI } from "./config"
import { ReadonlySnapshotData, SnapshotData } from "./data"
import { readSnapshotFileCached, writeSnapshotFile } from "./file"

export interface SnapshotTester {
    assertEqual(actual: string): void
}

const toUpdate = new Map<string, SnapshotData>()

function updateSnapshot(file: string, titleParts: readonly string[], value: string): void {
    let map = toUpdate.get(file)
    if (map === undefined) {
        map = new SnapshotData()
        toUpdate.set(file, map)
    }

    if (map.has(titleParts)) {
        throw new Error("There can be only one snapshot value per test case.")
    }
    map.set(titleParts, value)
}

export function assertEqualSnapshot(
    snapshotFile: string,
    titleParts: readonly string[],
    actual: string,
): void {
    if (ARG_UPDATE) {
        // update existing or add new
        updateSnapshot(snapshotFile, titleParts, actual)
        return
    }

    const expected = readSnapshotFileCached(snapshotFile).get(titleParts)

    if (expected === undefined) {
        // add new
        if (IS_CI) {
            // but not in CI
            fail("No snapshot found. Run tests with `--update` to create a new snapshot.")
        }
        updateSnapshot(snapshotFile, titleParts, actual)
        return
    }

    updateSnapshot(snapshotFile, titleParts, expected)
    strictEqual(actual, expected)
}

export function writeSnapshotChanges(): void {
    const unused: { file: string; count: number }[] = []

    for (const [file, data] of toUpdate) {
        let toWrite: ReadonlySnapshotData = data
        if (!ARG_UPDATE) {
            // add back the existing snapshots
            const existing = readSnapshotFileCached(file)
            toWrite = data.mergeWithExisting(existing)
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
