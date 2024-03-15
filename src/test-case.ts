import type { Linter, RuleTester } from "eslint"

export function toTestCase(testCase: TestCase | string): TestCase {
    if (typeof testCase === "string") {
        return { code: testCase }
    }
    return testCase
}

export interface TestCase extends RuleTester.ValidTestCase, Partial<Linter.FlatConfig> {
    options?: unknown[]
    settings?: Record<string, unknown>
}

export interface TestCases {
    valid: (TestCase | string)[]
    invalid: (TestCase | string)[]
}

/*
 * List every parameters possible on a test case that are not related to eslint
 * configuration
 */
export const ruleTesterParameters = [
    "name",
    "code",
    "filename",
    "options",
    "only",
] satisfies (keyof TestCase)[]
