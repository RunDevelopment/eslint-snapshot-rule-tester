import type { Rule } from "eslint"
import type { JSONSchema4 } from "json-schema"

/**
 * Replace control characters by `\u00xx` form.
 * @param text The text to sanitize.
 * @returns The sanitized text.
 */
export function sanitize(text: string): string {
    if (typeof text !== "string") {
        return ""
    }
    return text.replace(
        /[\u0000-\u0009\u000b-\u001a]/gu, // eslint-disable-line no-control-regex -- Escaping controls
        (c) => `\\u${c.codePointAt(0)!.toString(16).padStart(4, "0")}`,
    )
}
/**
 * Clones a given value deeply.
 * Note: This ignores `parent` property.
 * @param x A value to clone.
 * @returns A cloned value.
 */
export function cloneDeeplyExcludesParent(x: unknown): unknown {
    if (typeof x === "object" && x !== null) {
        if (Array.isArray(x)) {
            return x.map(cloneDeeplyExcludesParent)
        }

        const retv: Record<string, unknown> = {}

        for (const key in x) {
            if (key !== "parent" && Object.hasOwn(x, key)) {
                retv[key] = cloneDeeplyExcludesParent(x[key as never])
            }
        }

        return retv
    }

    return x
}

/**
 * Freezes a given value deeply.
 * @param x A value to freeze.
 * @returns
 */
export function freezeDeeply(x: unknown): void {
    if (typeof x === "object" && x !== null) {
        if (Array.isArray(x)) {
            x.forEach(freezeDeeply)
        } else {
            for (const key in x) {
                if (key !== "parent" && Object.hasOwn(x, key)) {
                    freezeDeeply(x[key as never])
                }
            }
        }
        Object.freeze(x)
    }
}

/**
 * Gets a complete options schema for a rule.
 * @param rule A new-style rule object
 * @returns JSON Schema for the rule's options.
 */
export function getRuleOptionsSchema(rule: Rule.RuleModule): JSONSchema4 | null {
    const schema = rule.schema || (rule.meta && rule.meta.schema)

    if (Array.isArray(schema)) {
        if (schema.length) {
            return {
                type: "array",
                items: schema,
                minItems: 0,
                maxItems: schema.length,
            }
        }
        return {
            type: "array",
            minItems: 0,
            maxItems: 0,
        }
    }

    // Given a full schema, leave it alone
    return schema || null
}

export function splitLines(s: string): string[] {
    return s.split(/\r?\n/)
}

export function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

export function isObject(obj: unknown): obj is NonNullable<object> {
    return typeof obj === "object" && obj !== null
}

export function includesInvalidSurrogatePair(s: string): boolean {
    const withoutValid = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
    return /[\uD800-\uDFFF]/.test(withoutValid)
}
