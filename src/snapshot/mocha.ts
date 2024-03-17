import { SnapshotTester, assertEqualSnapshot, writeSnapshotChanges } from "./tester"
import { getSnapshotFilePath } from "./file"
import { isObject } from "../util"

function getTitleParts(test: Mocha.Runnable): string[] {
    const path = [test.title]
    for (let x = test.parent; x; x = x.parent) {
        path.push(x.title)
    }
    path.pop()
    path.reverse()
    return path
}

function getRoot(test: Mocha.Runnable): Mocha.Suite {
    let p = test.parent
    if (!p) {
        throw new Error()
    }
    while (p.parent) {
        p = p.parent
    }
    return p
}

const registered = new WeakSet<Mocha.Suite>()
function register(suite: Mocha.Suite): void {
    if (registered.has(suite)) {
        return
    }
    registered.add(suite)

    suite.afterAll(() => {
        writeSnapshotChanges()
    })
}

export class MochaSnapshotTester implements SnapshotTester {
    private readonly test: Mocha.Runnable

    constructor(test: Mocha.Runnable) {
        this.test = test
    }

    public static parseContext(context: unknown): MochaSnapshotTester | undefined {
        try {
            if (
                isObject(context) &&
                "runnable" in context &&
                typeof context.runnable === "function"
            ) {
                const test: unknown = context.runnable()
                if (
                    isObject(test) &&
                    "file" in test &&
                    typeof test.file === "string" &&
                    "title" in test &&
                    typeof test.title === "string" &&
                    "parent" in test &&
                    isObject(test.parent)
                ) {
                    return new MochaSnapshotTester(test as Mocha.Runnable)
                }
            }
        } catch {
            // fall through
        }
        return undefined
    }

    assertEqual(actual: string): void {
        register(getRoot(this.test))

        const file = getSnapshotFilePath(this.test.file!)
        const title = getTitleParts(this.test)

        assertEqualSnapshot(file, title, actual)
    }
}
