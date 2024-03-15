import { Rule } from "eslint"
import { SnapshotRuleTester } from "../../src/rule-tester"

const rule: Rule.RuleModule = {
    meta: {
        fixable: "code",
        hasSuggestions: true,
        type: "suggestion",
        messages: {
            string: "Found a string. Use `{{expr}}` instead.",
            template: "Found a template string. Use `{{expr}}` instead.",
            somethingElse: "Use something else instead.",
        },
    },
    schema: [],
    create(context) {
        return {
            Literal(node) {
                if (typeof node.value === "string") {
                    context.report({
                        node,
                        messageId: "string",
                        data: { expr: "foo" },
                        fix(fixer) {
                            return fixer.replaceText(node, "foo")
                        },
                    })
                }
            },
            TemplateLiteral(node) {
                context.report({
                    node,
                    messageId: "template",
                    data: { expr: "bar" },
                    suggest: [
                        {
                            messageId: "somethingElse",
                            fix(fixer) {
                                return fixer.replaceText(node, "somethingElse")
                            },
                        },
                    ],
                })
            },
        }
    },
}

const tester = new SnapshotRuleTester({
    languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
    },
})

tester.run("strings", rule, {
    valid: [
        String.raw`1 + 2`,
        String.raw`
class Foo {
    constructor() {
        this.bar = 12
    }
}
`.trim(),
    ],
    invalid: [
        String.raw`1 + "foo"`,
        String.raw`
class Foo {
    foo = "foo"
    constructor() {
        this.bar = "bar"
    }
}
`.trim(),
        String.raw`["foo", "bar"].join("\n")`,
        '`foo ${a ? "bar" : "baz"} ${`_${""}_`}`',
        '`\nfoo ${a ? "bar" : "baz"}\n${`_${""}_`}\n` + "1"+"2"',
        "`foo${1 + 2}`",
    ],
})
