import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { basename, dirname, join } from "path"
import { includesInvalidSurrogatePair, splitLines } from "../util"
import { ReadonlySnapshotData, SnapshotData } from "./data"

export function getSnapshotFilePath(testFile: string): string {
    return join(dirname(testFile), "__snapshots__", basename(testFile) + ".snap")
}

interface KeyLine {
    parts: string[]
    includesCode: boolean
}
function stringifyKeyLine(key: KeyLine): string {
    return key.parts
        .map((k, i) => {
            const jsonify =
                k.length === 0 ||
                k.includes(">>") ||
                // eslint-disable-next-line no-control-regex
                /^["\s]|\s$|[\x00-\x1f]/.test(k) ||
                includesInvalidSurrogatePair(k)

            k = jsonify ? JSON.stringify(k) : k

            const isCode = i === key.parts.length - 1 && key.includesCode
            const delimiter = i == 0 ? "" : isCode ? " >>> " : " >> "

            return delimiter + k
        })
        .join("")
}
function parseKeyLine(line: string): KeyLine {
    const consumePart = (): string => {
        const jsonMatch = /^"(?:[^"\\]|\\.)*"/.exec(line)
        let part: string
        if (jsonMatch) {
            part = JSON.parse(jsonMatch[0])
            line = line.slice(jsonMatch[0].length)
        } else {
            if (/^\s/.test(line)) {
                throw new SyntaxError("Invalid key line: should not start with whitespace")
            }

            const delimiter = line.indexOf(" >>")
            if (delimiter === -1) {
                part = line
                line = ""
            } else {
                part = line.slice(0, delimiter)
                line = line.slice(delimiter)
            }
        }
        return part
    }

    const parts: string[] = []
    let includesCode = false

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
        parts.push(consumePart())

        if (line === "") {
            break
        } else if (line.startsWith(" >> ")) {
            line = line.slice(4)
        } else if (line.startsWith(" >>> ")) {
            line = line.slice(5)
            includesCode = true
        }
    }

    if (parts.length === 0) {
        throw new SyntaxError("Invalid key line: key should have at least one part")
    }

    return { parts, includesCode }
}
function parseCodeSection(content: string): string | undefined {
    // Example:
    // Code:
    //  1 | class Foo {
    //  2 |     foo = "foo"
    //    |           ^~~~~ [1]
    //  3 |     constructor() {
    //  4 |         this.bar = "bar"
    //    |                    ^~~~~ [2]
    //  5 |     }
    //  6 | }
    const sectionMatch = /^Code:\n((?: *(?:\d+ )?\|[^\n]*\n)+)/m.exec(content)
    if (sectionMatch === null) {
        return undefined
    }

    return splitLines(sectionMatch[1])
        .filter((l) => /^ *\d/.test(l))
        .map((l) => l.replace(/^ *\d+ \| ?/, ""))
        .join("\n")
}

const V1_PREFIX = "# eslint-snapshot-rule-tester format: v1\n"
function stringify(data: ReadonlySnapshotData): string {
    let content = V1_PREFIX

    for (const [keyParts, value] of data) {
        content += "\n\n"

        // key
        const parsedCode = parseCodeSection(value)
        let includesCode = true
        if (parsedCode === keyParts.at(-1)) {
            keyParts.pop()
            includesCode = false
        }
        content += "Test: " + stringifyKeyLine({ parts: keyParts, includesCode }) + "\n"

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
function parse(content: string, snapshotFile: string): SnapshotData {
    // normalize line endings
    content = content.replace(/\r\n/g, "\n")

    if (!content.startsWith(V1_PREFIX)) {
        throw new SyntaxError(`Snapshot file ${snapshotFile} is not in the expected format`)
    }
    content = content.slice(V1_PREFIX.length)

    const parsed = new SnapshotData()
    content = content.replace(/^\n+/, "")
    while (content !== "") {
        const lineEnd = content.indexOf("\n")
        if (lineEnd === -1) {
            throw new SyntaxError(
                `Unexpected EOF when reading key: ${content}\nFile: ${snapshotFile}`,
            )
        }

        // key
        let keyLine = content.slice(0, lineEnd)
        if (!keyLine.startsWith("Test: ")) {
            throw new SyntaxError(`Expected key line, got: ${keyLine}\nFile: ${snapshotFile}`)
        }
        keyLine = keyLine.slice(6)
        const key = parseKeyLine(keyLine)
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
        content = content.slice(formattedValue.length)

        if (!key.includesCode) {
            const code = parseCodeSection(value)
            if (code === undefined) {
                throw new SyntaxError(
                    `Expected code section for key without code: ${key}\nFile: ${snapshotFile}`,
                )
            }
            key.parts.push(code)
        }
        parsed.set(key.parts, value)

        // skip newlines
        content = content.replace(/^\n+/, "")
    }

    return parsed
}

export function writeSnapshotFile(snapshotFile: string, data: ReadonlySnapshotData): void {
    const content = stringify(data)
    const snapshotDir = dirname(snapshotFile)
    mkdirSync(snapshotDir, { recursive: true })
    writeFileSync(snapshotFile, content, "utf-8")
}

export function readSnapshotFile(snapshotFile: string): SnapshotData {
    if (!existsSync(snapshotFile)) {
        return new SnapshotData()
    }

    const content = readFileSync(snapshotFile, "utf-8")
    return parse(content, snapshotFile)
}

const fileCache = new Map<string, ReadonlySnapshotData>()

export function readSnapshotFileCached(snapshotFile: string): ReadonlySnapshotData {
    let data = fileCache.get(snapshotFile)
    if (data === undefined) {
        data = readSnapshotFile(snapshotFile)
        fileCache.set(snapshotFile, data)
    }
    return data
}
