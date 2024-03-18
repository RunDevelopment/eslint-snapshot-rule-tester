# ESLint snapshot rule tester

This package combines the power of ESLint's `RuleTester` and the simplicity of snapshot testing. Snapshots are stored in a diff-friendly custom format, making it easy to review changes.

## Installation

```sh
npm install --save-dev eslint-snapshot-rule-tester
```

> **Requirements**
> - ESLint v8.4.0 or above
> - Node.js v18.x or above
> - Mocha v6.0.0 or above OR Jest v28.0.0 or above

## Usage

Write tests like you usually would with ESLint's `RuleTester`, but use `SnapshotRuleTester` instead and omit `errors` and `output` for invalid test cases.

Example:

```js
// file: tests/rules/no-strings.test.js
import { SnapshotRuleTester } from "eslint-snapshot-rule-tester"
import rule from "../path/to/rules/no-strings"

const tester = new SnapshotRuleTester()

tester.run("no-strings", rule, {
    valid: [
        String.raw`1 + 2 + 3`
    ],
    invalid: [
        `const a = ["foo", "bar"]${"\n"}const b = a.join("\\n")`,
    ],
})
```

A snapshot file will be created in a `__snapshots__` directory next to the test file:

```
Test: no-strings >> invalid
Code:
  1 | const a = ["foo", "bar"]
    |            ^~~~~  ^~~~~
    |            [1]    [2]
  2 | const b = a.join("\n")
    |                  ^~~~ [3]

Output:
  1 | const a = [42, 42]
  2 | const b = a.join(42)

[1] Strings are not allowed. Use a number instead.
[2] Strings are not allowed. Use a number instead.
[3] Strings are not allowed. Use a number instead.
---
```

For the full example, see the [test file here](https://github.com/RunDevelopment/eslint-snapshot-rule-tester/blob/main/tests/mocha/no-strings.ts) and [snapshot file here](https://github.com/RunDevelopment/eslint-snapshot-rule-tester/blob/main/tests/mocha/__snapshots__/no-strings.ts.eslintsnap).

### Updating snapshots

To update snapshots, run the tests with the `--update` or `-u` flag:

```sh
mocha tests/**/*.js --update
jest -u
```
