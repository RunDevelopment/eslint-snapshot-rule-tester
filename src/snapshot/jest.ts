import { getSnapshotFilePath } from "./file"
import { SnapshotTester, assertEqualSnapshot, writeSnapshotChanges } from "./tester"

let hasAfterAll = false
let runAfterAll = false

if (typeof afterAll === "function") {
    hasAfterAll = true
    afterAll(() => {
        if (runAfterAll) {
            writeSnapshotChanges()
        }
    })
}

class JestSnapshotTester implements SnapshotTester {
    constructor(
        private readonly testPath: string,
        private readonly titleParts: string[],
    ) {}

    assertEqual(actual: string): void {
        runAfterAll = true

        const file = getSnapshotFilePath(this.testPath)

        assertEqualSnapshot(file, this.titleParts, actual)
    }
}

export interface JestOptions {
    useJestSnapshots: boolean
    titleParts: string[]
}

export function createJestTester(options: JestOptions): SnapshotTester | undefined {
    if (
        hasAfterAll &&
        typeof jest !== "undefined" &&
        typeof expect === "function" &&
        "JEST_WORKER_ID" in process.env &&
        typeof expect.getState === "function"
    ) {
        if (options.useJestSnapshots) {
            // just forward to Jest
            return {
                assertEqual(actual) {
                    expect(actual).toMatchSnapshot()
                },
            }
        }

        const { testPath } = expect.getState()
        if (!testPath) {
            throw new Error("Cannot find test path")
        }
        return new JestSnapshotTester(testPath, options.titleParts)
    }
    return undefined
}
