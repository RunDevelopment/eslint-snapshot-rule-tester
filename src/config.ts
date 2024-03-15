import type { Linter } from "eslint"
import { builtinRules } from "eslint/use-at-your-own-risk"

export const defaultConfig = [
    {
        plugins: {
            "@": {
                /*
                 * Because we try to delay loading rules until absolutely
                 * necessary, a proxy allows us to hook into the lazy-loading
                 * aspect of the rules map while still keeping all of the
                 * relevant configuration inside of the config array.
                 */
                rules: new Proxy(
                    {},
                    {
                        get(_target, property) {
                            if (typeof property === "string") {
                                return builtinRules.get(property)
                            }
                            return undefined
                        },
                        has(_target, property) {
                            return typeof property === "string" && builtinRules.has(property)
                        },
                    },
                ),
            },
        },
        languageOptions: {
            sourceType: "module",
            ecmaVersion: "latest",
            parser: require("espree"),
            parserOptions: {},
        },
        linterOptions: {
            reportUnusedDisableDirectives: 1,
        },
    },

    // default ignores are listed here
    {
        ignores: ["**/node_modules/", ".git/"],
    },

    // intentionally empty config to ensure these files are globbed by default
    {
        files: ["**/*.js", "**/*.mjs"],
    },
    {
        files: ["**/*.cjs"],
        languageOptions: {
            sourceType: "commonjs",
            ecmaVersion: "latest",
        },
    },
] satisfies Linter.FlatConfig[]
