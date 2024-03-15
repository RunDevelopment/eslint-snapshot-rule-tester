export const ARG_UPDATE: boolean = process.argv.includes("--update") || process.argv.includes("-u")

export const IS_CI: boolean = process.env.CI === "true"
