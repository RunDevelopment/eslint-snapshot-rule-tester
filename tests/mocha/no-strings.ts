import { Rule } from "eslint"
import { SnapshotRuleTester } from "../../src/rule-tester"

const rule: Rule.RuleModule = {
    meta: {
        fixable: "code",
        hasSuggestions: true,
        type: "suggestion",
        messages: {
            string: "Strings are not allowed. Use a number instead.",
            template: "Template strings are not allowed.",
            somethingElse: "Use something else instead.",
        },
    },
    schema: [
        {
            type: "object",
            properties: {
                somethingElse: {
                    type: "string",
                },
            },
            additionalProperties: false,
        },
    ],
    create(context) {
        const somethingElse = context.options[0]?.somethingElse ?? "somethingElse"

        return {
            Literal(node) {
                if (typeof node.value === "string") {
                    context.report({
                        node,
                        messageId: "string",
                        fix(fixer) {
                            return fixer.replaceText(node, "42")
                        },
                    })
                }
            },
            TemplateLiteral(node) {
                context.report({
                    node,
                    messageId: "template",
                    suggest: [
                        {
                            messageId: "somethingElse",
                            fix(fixer) {
                                return fixer.replaceText(node, somethingElse)
                            },
                        },
                    ],
                })
            },
        }
    },
}

// Example

const tester = new SnapshotRuleTester({
    languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
    },
})

tester.run("no-strings", rule, {
    valid: [String.raw`1 + 2 + 3`],
    invalid: [
        `const a = ["foo", "bar"]${"\n"}const b = a.join("\\n")`,
        String.raw`class Foo {
    foo = "foo"
    constructor() {
        this.bar = "bar"
    }
}`,
        String.raw`["foo", "bar"].join("\n")`,
        {
            code: '`foo ${a ? "bar" : "baz"} ${`_${""}_`}`',
            options: [{ somethingElse: "REPLACEMENT" }],
        },
    ],
})
