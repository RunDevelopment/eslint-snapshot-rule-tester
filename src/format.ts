import type { Linter } from "eslint"
import { TestCase } from "./test-case"
import YAML, { ToStringOptions } from "yaml"
import { capitalize, splitLines } from "./util"

const yamlOptions: ToStringOptions = {
    blockQuote: "literal",
}

export function format(
    testCase: TestCase,
    fixable: boolean,
    output: string | undefined,
    messages: readonly Linter.LintMessage[],
): string {
    let result = ""

    result += formatConfig(testCase)
    result += formatCode(testCase, messages)
    result += formatOutput(output, fixable)
    result += formatMessages(testCase, messages)

    return result.replace(/\r\n/g, "\n").replace(/\n{0,3}$/, "")
}
const ignoreKeys = new Set<keyof TestCase>(["code", "name"])
function formatConfig(testCase: TestCase): string {
    const copyKeys = (Object.keys(testCase) as (keyof TestCase)[])
        .filter((key) => !ignoreKeys.has(key))
        .sort()
    const configObject: Record<string, unknown> = {}
    let hasConfig = false
    for (const key of copyKeys) {
        const value = testCase[key]
        if (value !== undefined) {
            configObject[capitalize(key)] = value
            hasConfig = true
        }
    }

    if (!hasConfig) {
        return ""
    }
    try {
        return `${YAML.stringify(configObject, yamlOptions)}\n`
    } catch {
        // this can happen, so we just ignore the keys causing the error
        for (const key of Object.keys(configObject)) {
            const value = configObject[key]
            try {
                YAML.stringify(value, yamlOptions)
            } catch {
                configObject[key] = "unable to serialize"
            }
        }

        return `${YAML.stringify(configObject, yamlOptions)}\n`
    }
}

interface DecodedLoc {
    start: number
    startContinued: boolean
    end: number
    endContinued: boolean
    messageIndex: number
}
function groupByLine(
    codeLines: readonly string[],
    messages: readonly Linter.LintMessage[],
): Map<number, DecodedLoc[]> {
    interface MessageLocation {
        line: number
        column: number
        endLine: number
        endColumn: number
        messageIndex: number
    }

    const locations = messages
        .map((message, i): MessageLocation => {
            return {
                line: message.line,
                column: message.column,
                endLine: message.endLine ?? message.line,
                endColumn: message.endColumn ?? message.column + 1,
                messageIndex: i,
            }
        })
        .sort((a, b) => {
            return (
                a.line - b.line ||
                a.column - b.column ||
                b.endLine - a.endLine ||
                b.endColumn - a.endColumn
            )
        })

    function decodeLoc(loc: MessageLocation, line: number, length: number): DecodedLoc {
        let start, startContinued, end, endContinued
        if (loc.line < line) {
            start = 0
            startContinued = true
        } else {
            // loc.line === line
            start = loc.column - 1
            startContinued = false
        }
        if (loc.endLine > line) {
            end = length
            endContinued = true
        } else {
            // loc.endLine === line
            end = loc.endColumn - 1
            endContinued = false
        }
        return { start, startContinued, end, endContinued, messageIndex: loc.messageIndex }
    }

    const byLines = new Map<number, DecodedLoc[]>()
    for (const loc of locations) {
        for (let line = loc.line; line <= loc.endLine; line++) {
            const list = byLines.get(line) ?? []
            const lineLength = codeLines.at(line - 1)?.length ?? 0
            list.push(decodeLoc(loc, line, lineLength))
            byLines.set(line, list)
        }
    }

    return byLines
}
function standardFormatLocations(locations: readonly DecodedLoc[], offset: number): string[] {
    const locLines: string[] = []

    for (const loc of locations) {
        const { start, startContinued, end, endContinued, messageIndex } = loc

        const content =
            (startContinued ? "~" : "^") +
            "~".repeat(Math.max(0, end - start - 1)) +
            (endContinued ? `\\ [${messageIndex + 1}] ` : ` [${messageIndex + 1}] `)

        const locLineIndex = offset + start

        // try to fit it into any previous lines
        let added = false
        for (let i = 0; i < locLines.length; i++) {
            const line = locLines[i]
            if (line.length <= locLineIndex) {
                locLines[i] = line.padEnd(locLineIndex) + content
                added = true
                break
            }
        }

        if (!added) {
            locLines.push("".padEnd(locLineIndex) + content)
        }
    }

    return locLines
}
function compactFormatLocations(
    locations: readonly DecodedLoc[],
    offset: number,
): string[] | undefined {
    let squiggleLine = ""
    let messageLine = ""

    for (const [loc, index] of locations.map((loc, i) => [loc, i] as const)) {
        const nextLoc = locations.at(index + 1)

        const { start, startContinued, end, endContinued, messageIndex } = loc
        if (startContinued || endContinued) {
            return undefined
        }

        const squiggle = "^" + "~".repeat(Math.max(0, end - start - 1))
        const num = `[${messageIndex + 1}]`
        // unindent if it means that we can fit the next location
        const unindentNum = nextLoc && nextLoc.start === start + num.length

        if (squiggleLine.length <= start) {
            squiggleLine = squiggleLine.padEnd(start) + squiggle + " "
        } else {
            return undefined
        }
        if (unindentNum && messageLine.length <= start - 1) {
            messageLine = messageLine.padEnd(start - 1) + num + " "
        } else if (messageLine.length <= start) {
            messageLine = messageLine.padEnd(start) + num + " "
        } else {
            return undefined
        }
    }

    return ["".padEnd(offset) + squiggleLine, "".padEnd(offset) + messageLine]
}
function formatCode(testCase: TestCase, messages: readonly Linter.LintMessage[]): string {
    const codeLines = splitLines(testCase.code)
    const byLines = groupByLine(codeLines, messages)
    const outputLines: string[] = []

    codeLines.forEach((codeLine, lineIndex) => {
        const prefix = "  "
        const offset = prefix.length
        outputLines.push(prefix + codeLine)

        const locations = byLines.get(lineIndex + 1) ?? []
        let locLines = standardFormatLocations(locations, offset)

        if (locLines.length >= 2) {
            // attempt a more compact format
            const compact = compactFormatLocations(locations, offset)
            if (compact) {
                locLines = compact
            }
        }

        outputLines.push(...locLines.map((l) => l.trimEnd()))
    })

    return "Code:\n" + outputLines.join("\n") + "\n\n"
}

function formatOutput(output: string | undefined, fixable: boolean): string {
    if (output === undefined) {
        return fixable ? "Output: unchanged\n\n" : ""
    }

    const linesFormatted = splitLines(output).map((l) => "  " + l)
    return `Output:\n${linesFormatted.join("\n")}\n\n`
}

function formatMessages({ code }: TestCase, messages: readonly Linter.LintMessage[]): string {
    if (messages.length === 0) {
        return "No errors\n"
    }

    return (
        messages
            .map(({ message, suggestions }) => {
                return {
                    message,
                    suggestions: suggestions?.map(({ desc, fix }) => {
                        const output =
                            code.slice(0, fix.range[0]) + fix.text + code.slice(fix.range[1])
                        return { desc, output: output + "\n" }
                    }),
                }
            })
            .map((obj, i) => {
                let content = obj.message
                if (obj.suggestions) {
                    content +=
                        "\n" +
                        YAML.stringify({ suggestions: obj.suggestions }, yamlOptions).replace(
                            /\n$/,
                            "",
                        )
                }
                const prefix = `[${i + 1}] `
                const space = " ".repeat(prefix.length)
                return (
                    prefix +
                    splitLines(content)
                        .map((l, j) => (j === 0 ? l : space + l))
                        .join("\n")
                )
            })
            .join("\n") + "\n"
    )
}
