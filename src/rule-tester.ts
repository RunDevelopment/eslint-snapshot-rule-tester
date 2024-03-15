/**
 * This is a modified version of the ESLint's `RuleTester` class.
 *
 * @license MIT
 * Copyright OpenJS Foundation and other contributors, <www.openjsf.org>
 */

import { Linter, Rule, RuleTester } from "eslint"
import assert from "assert"
import { cloneDeeplyExcludesParent, freezeDeeply, getRuleOptionsSchema, sanitize } from "./util"
import { TestCase, TestCases, ruleTesterParameters, toTestCase } from "./test-case"
import deepEqual from "fast-deep-equal"
import { format } from "./format"
import { defaultConfig } from "./config"
import createAjv from "./ajv"
import { SnapshotTester } from "./snapshot/tester"
import { MochaSnapshotTester } from "./snapshot/mocha"
import stringify from "json-stable-stringify-without-jsonify"

const ajv = createAjv({ strictDefaults: true })

const testEnv = {
    get describe(): (name: string, fn: () => void) => void {
        return RuleTester["describe" as never]
    },
    get it(): (name: string, fn: () => void) => void {
        return RuleTester["it" as never]
    },
    get itOnly(): (name: string, fn: () => void) => void {
        return RuleTester["itOnly" as never]
    },
}

/**
 * Check if this test case is a duplicate of one we have seen before.
 * @param item test case object
 * @param seenTestCases set of serialized test cases we have seen so far (managed by this function)
 */
function checkDuplicateTestCase(item: TestCase, seenTestCases: Set<string>): void {
    let serialized
    try {
        // serialize and hope for the best
        serialized = stringify(item)
    } catch (error) {
        return
    }

    if (seenTestCases.has(serialized)) {
        assert.fail("detected duplicate test case")
    }
    seenTestCases.add(serialized)
}

interface ErrorReport {
    test: TestCase
    messages: Linter.LintMessage[]
    output: string | undefined
    filename: string | undefined
    configs: unknown
    beforeAST: unknown
    afterAST: unknown
}

const metaSchemaDescription = `
\t- If the rule has options, set \`meta.schema\` to an array or non-empty object to enable options validation.
\t- If the rule doesn't have options, omit \`meta.schema\` to enforce that no options can be passed to the rule.
\t- You can also set \`meta.schema\` to \`false\` to opt-out of options validation (not recommended).

\thttps://eslint.org/docs/latest/extend/custom-rules#options-schemas
`

export class SnapshotRuleTester {
    /**
     * The configuration to use for this tester. Combination of the tester
     * configuration and the default configuration.
     */
    private testerConfig: Linter.FlatConfig[]
    private linter: Linter

    constructor(testerConfig: Linter.FlatConfig = {}) {
        this.testerConfig = [testerConfig, { rules: { "rule-tester/validate-ast": "error" } }]
        this.linter = new Linter({ configType: "flat" })
    }

    public run(ruleName: string, rule: Rule.RuleModule, test: TestCases): void {
        const testerConfig = this.testerConfig
        const linter = this.linter
        const ruleId = `rule-to-test/${ruleName}`
        const validTestCases = new Set<string>()
        const invalidTestCases = new Set<string>()

        const baseConfig: Linter.FlatConfig[] = [
            { files: ["**"] }, // Make sure the default config matches for all files
            {
                plugins: {
                    "rule-to-test": {
                        rules: {
                            [ruleName]: {
                                ...rule,
                                // Create a wrapper rule that freezes the `context` properties.
                                create(context) {
                                    freezeDeeply(context.options)
                                    freezeDeeply(context.settings)
                                    freezeDeeply(context.parserOptions)

                                    // freezeDeeply(context.languageOptions);

                                    return rule.create(context)
                                },
                            },
                        },
                    },
                },
                languageOptions: {
                    ...defaultConfig[0].languageOptions,
                },
            },
            ...defaultConfig.slice(1),
        ]

        /**
         * Run the rule for the given item
         * @param item Item to run the rule against
         * @throws {Error} If an invalid schema.
         * @returns Eslint run result
         * @private
         */
        function runRuleForItem(item: TestCase): ErrorReport {
            if (item.filename) {
                // TODO: figure out what basePath does
                // flatConfigArrayOptions.basePath = path.parse(item.filename).root
            }

            const configs: Linter.FlatConfig[] = [...baseConfig, ...testerConfig]

            const code = item.code
            const filename = item.filename

            /*
             * Assumes everything on the item is a config except for the
             * parameters used by this tester
             */
            const itemConfig = { ...item }

            for (const parameter of ruleTesterParameters) {
                delete itemConfig[parameter]
            }

            // wrap any parsers
            const parser = itemConfig.languageOptions?.parser
            if (parser && typeof parser !== "object") {
                throw new Error(
                    "Parser must be an object with a parse() or parseForESLint() method.",
                )
            }

            /*
             * Create the config object from the tester config and this item
             * specific configurations.
             */
            configs.push(itemConfig)

            let ruleConfig: Linter.RuleEntry = 1
            if (item.options !== undefined) {
                ruleConfig = [1, ...item.options]
            }

            configs.push({
                rules: {
                    [ruleId]: ruleConfig,
                },
            })

            let schema

            try {
                schema = getRuleOptionsSchema(rule)
            } catch (err) {
                if (err instanceof Error) {
                    err.message += metaSchemaDescription
                }
                throw err
            }

            /*
             * Check and throw an error if the schema is an empty object (`schema:{}`), because such schema
             * doesn't validate or enforce anything and is therefore considered a possible error. If the intent
             * was to skip options validation, `schema:false` should be set instead (explicit opt-out).
             *
             * For this purpose, a schema object is considered empty if it doesn't have any own enumerable string-keyed
             * properties. While `ajv.compile()` does use enumerable properties from the prototype chain as well,
             * it caches compiled schemas by serializing only own enumerable properties, so it's generally not a good idea
             * to use inherited properties in schemas because schemas that differ only in inherited properties would end up
             * having the same cache entry that would be correct for only one of them.
             *
             * At this point, `schema` can only be an object or `null`.
             */
            if (schema && Object.keys(schema).length === 0) {
                throw new Error(`\`schema: {}\` is a no-op${metaSchemaDescription}`)
            }

            /*
             * Setup AST getters.
             * The goal is to check whether or not AST was modified when
             * running the rule under test.
             */
            let beforeAST, afterAST
            configs.push({
                plugins: {
                    "rule-tester": {
                        rules: {
                            "validate-ast": {
                                create() {
                                    return {
                                        Program(node) {
                                            beforeAST = cloneDeeplyExcludesParent(node)
                                        },
                                        "Program:exit"(node) {
                                            afterAST = node
                                        },
                                    }
                                },
                            },
                        },
                    },
                },
            })

            if (schema) {
                ajv.validateSchema(schema)

                if (ajv.errors) {
                    const errors = ajv.errors
                        .map((error) => {
                            const field =
                                error.dataPath[0] === "." ? error.dataPath.slice(1) : error.dataPath

                            return `\t${field}: ${error.message}`
                        })
                        .join("\n")

                    throw new Error([`Schema for rule ${ruleName} is invalid:`, errors].join("\n"))
                }

                /*
                 * `ajv.validateSchema` checks for errors in the structure of the schema (by comparing the schema against a "meta-schema"),
                 * and it reports those errors individually. However, there are other types of schema errors that only occur when compiling
                 * the schema (e.g. using invalid defaults in a schema), and only one of these errors can be reported at a time. As a result,
                 * the schema is compiled here separately from checking for `validateSchema` errors.
                 */
                try {
                    ajv.compile(schema)
                } catch (err) {
                    throw new Error(
                        `Schema for rule ${ruleName} is invalid: ${err instanceof Error ? err.message : String(err)}`,
                    )
                }
            }

            // Verify the code.
            const messages = linter.verify(code, configs, filename)
            const fatalErrorMessage = messages.find((m) => m.fatal)
            assert(
                !fatalErrorMessage,
                `A fatal parsing error occurred: ${fatalErrorMessage && fatalErrorMessage.message}`,
            )

            // Get output
            let output = undefined
            if (messages.some((m) => m.fix)) {
                const fixReport = linter.verifyAndFix(code, configs, filename)

                if (fixReport.fixed && fixReport.output !== code) {
                    output = fixReport.output

                    const errorMessageInFix = linter
                        .verify(output, configs, filename)
                        .find((m) => m.fatal)

                    assert(
                        !errorMessageInFix,
                        [
                            "A fatal parsing error occurred in autofix.",
                            `Error: ${errorMessageInFix && errorMessageInFix.message}`,
                            "Autofix output:",
                            output,
                        ].join("\n"),
                    )
                }
            }

            return {
                test: item,
                messages,
                output,
                beforeAST,
                afterAST: cloneDeeplyExcludesParent(afterAST),
                configs,
                filename,
            }
        }

        function formatReport(report: ErrorReport): string {
            return format(report.test, !!rule.meta?.fixable, report.output, report.messages)
        }

        /**
         * Check if the AST was changed
         * @param beforeAST AST node before running
         * @param afterAST AST node after running
         * @private
         */
        function assertASTDidNotChange(report: ErrorReport): void {
            if (!deepEqual(report.beforeAST, report.afterAST)) {
                assert.fail("Rule should not modify AST.")
            }
        }

        /**
         * Check if the template is valid or not
         * all valid cases go through this
         * @param item Item to run the rule against
         * @private
         */
        function testValidTemplate(item: TestCase): void {
            checkDuplicateTestCase(item, validTestCases)

            const result = runRuleForItem(item)
            const messages = result.messages

            if (messages.length > 0) {
                assert.strictEqual(
                    messages.length,
                    0,
                    `Should have no errors but had ${messages.length}. Details:\n\n` +
                        formatReport(result),
                )
            }

            assertASTDidNotChange(result)
        }

        /**
         * Check if the template is invalid or not
         * all invalid cases go through this.
         * @param item Item to run the rule against
         * @private
         */
        function testInvalidTemplate(item: TestCase, tester: SnapshotTester): void {
            checkDuplicateTestCase(item, invalidTestCases)

            const result = runRuleForItem(item)
            const messages = result.messages

            for (const message of messages) {
                if (message.suggestions) {
                    const seenMessageIndices = new Map<string, number>()

                    for (let i = 0; i < message.suggestions.length; i += 1) {
                        const suggestionMessage = message.suggestions[i].desc
                        const previous = seenMessageIndices.get(suggestionMessage)

                        assert.ok(
                            !seenMessageIndices.has(suggestionMessage),
                            `Suggestion message '${suggestionMessage}' reported from suggestion ${i} was previously reported by suggestion ${previous}. Suggestion messages should be unique within an error.`,
                        )
                        seenMessageIndices.set(suggestionMessage, i)
                    }
                }
            }

            const snapMessage = formatReport(result)
            tester.assertEqual(snapMessage)

            assertASTDidNotChange(result)
        }

        /*
         * This creates a mocha test suite and pipes all supplied info through
         * one of the templates above.
         * The test suites for valid/invalid are created conditionally as
         * test runners (eg. vitest) fail for empty test suites.
         */
        testEnv.describe(ruleName, () => {
            if (test.valid.length > 0) {
                testEnv.describe("valid", () => {
                    test.valid.map(toTestCase).forEach((valid) => {
                        testEnv[valid.only ? "itOnly" : "it"](
                            sanitize(valid.name || valid.code),
                            function () {
                                testValidTemplate(valid)
                            },
                        )
                    })
                })
            }

            if (test.invalid.length > 0) {
                testEnv.describe("invalid", () => {
                    const knownTitles = new Set<string>()
                    test.invalid.map(toTestCase).forEach((invalid) => {
                        let title = sanitize(invalid.name || invalid.code)

                        // ensure a unique title
                        if (knownTitles.has(title)) {
                            for (let i = 2; ; ++i) {
                                const newTitle = `${title} ${i}`
                                if (!knownTitles.has(newTitle)) {
                                    title = newTitle
                                    break
                                }
                            }
                        }
                        knownTitles.add(title)

                        testEnv[invalid.only ? "itOnly" : "it"](title, function (this: unknown) {
                            testInvalidTemplate(invalid, MochaSnapshotTester.parseContext(this)!)
                        })
                    })
                })
            }
        })
    }
}
