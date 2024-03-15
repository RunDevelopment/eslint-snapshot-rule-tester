/** @type {import("eslint").Linter.Config} */
module.exports = {
	env: {
		browser: true,
		es6: true
	},
	root: true,
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/eslint-recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:prettier/recommended"
	],
	parser: "@typescript-eslint/parser",
	plugins: [
		"@typescript-eslint",
		"prettier"
	],
	parserOptions: {
		ecmaVersion: 2018,
		sourceType: "module",
		ecmaFeatures: {
			node: true,
			spread: true
		},
		project: "./tsconfig.json"
	},
	rules: {
		"curly": "error",

		"no-constant-condition": ["error", { checkLoops: false }],
		"sort-imports": ["error", { ignoreDeclarationSort: true }],
		"@typescript-eslint/no-inferrable-types": ["error", { ignoreParameters: true, ignoreProperties: true }],
		"@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
		"@typescript-eslint/no-unnecessary-condition": "warn",

		"no-empty-character-class": "off",
		"@typescript-eslint/explicit-member-accessibility": "off",
		"@typescript-eslint/no-non-null-assertion": "off",
		"@typescript-eslint/no-use-before-define": "off",
		"@typescript-eslint/indent": "off",
	},
	settings: {
		jsdoc: {
			mode: "typescript"
		}
	},
	ignorePatterns: [
		"*.js",
		"*.json",
		"index.d.ts",
		"src/js/unicode/**",
		"dist/**",
	]
}
