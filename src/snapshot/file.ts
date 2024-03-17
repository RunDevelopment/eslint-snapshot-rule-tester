import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { basename, dirname, join } from "path"
import { includesInvalidSurrogatePair, splitLines } from "../util"

export function getSnapshotFilePath(testFile: string): string {
    return join(dirname(testFile), "__snapshots__", basename(testFile) + ".snap")
}

const V1_PREFIX = "# eslint-snapshot-rule-tester format: v1\n"
function stringify(data: ReadonlyMap<string, string>): string {
    let content = V1_PREFIX

    for (const [key, value] of data) {
        content += "\n\n"

        // key
        if (
            // eslint-disable-next-line no-control-regex
            /^["\s]|[\x00-\x1f]/.test(key) ||
            key.length === 0 ||
            includesInvalidSurrogatePair(key)
        ) {
            content += JSON.stringify(key)
        } else {
            content += key
        }
        content += "\n"

        // value
        const lines = splitLines(value)
        lines.forEach((line, i) => {
            if (line === "" && i < lines.length - 1) {
                content += "\n"
            } else {
                if (line.startsWith('"') || includesInvalidSurrogatePair(line)) {
                    line = JSON.stringify(line)
                }
                content += line + "\n"
            }
        })
        content += "---\n"
    }

    return content
}
function parse(content: string, snapshotFile: string): Map<string, string> {
    // normalize line endings
    content = content.replace(/\r\n/g, "\n")

    if (!content.startsWith(V1_PREFIX)) {
        throw new SyntaxError(`Snapshot file ${snapshotFile} is not in the expected format`)
    }
    content = content.slice(V1_PREFIX.length)

    const parsed = new Map<string, string>()
    content = content.replace(/^\n+/, "")
    while (content !== "") {
        const lineEnd = content.indexOf("\n")
        if (lineEnd === -1) {
            throw new SyntaxError(
                `Unexpected EOF when reading key: ${content}\nFile: ${snapshotFile}`,
            )
        }

        // key
        let key = content.slice(0, lineEnd)
        if (key.startsWith('"')) {
            key = JSON.parse(key)
        }
        content = content.slice(lineEnd + 1)

        // value
        const valueMatch = /^(?:[\s\S]*?\n)??---(?=\n|$)/.exec(content)
        if (valueMatch === null) {
            throw new SyntaxError(`Unable to parse value for key: ${key}\nFile: ${snapshotFile}`)
        }
        const formattedValue = valueMatch[0]
        let value = formattedValue.slice(0, -4)
        if (/^"/m.test(value)) {
            value = splitLines(value)
                .map((l) => {
                    if (l.startsWith('"')) {
                        return JSON.parse(l)
                    }
                    return l
                })
                .join("\n")
        }
        parsed.set(key, value)
        content = content.slice(formattedValue.length)

        // skip newlines
        content = content.replace(/^\n+/, "")
    }

    return parsed
}

export function writeSnapshotFile(snapshotFile: string, data: ReadonlyMap<string, string>): void {
    const content = stringify(data)
    const snapshotDir = dirname(snapshotFile)
    mkdirSync(snapshotDir, { recursive: true })
    writeFileSync(snapshotFile, content, "utf-8")
}

export function readSnapshotFile(snapshotFile: string): Map<string, string> {
    if (!existsSync(snapshotFile)) {
        return new Map()
    }

    const content = readFileSync(snapshotFile, "utf-8")
    return parse(content, snapshotFile)
}

const fileCache = new Map<string, ReadonlyMap<string, string>>()

export function readSnapshotFileCached(snapshotFile: string): ReadonlyMap<string, string> {
    let data = fileCache.get(snapshotFile)
    if (data === undefined) {
        data = readSnapshotFile(snapshotFile)
        fileCache.set(snapshotFile, data)
    }
    return data
}
