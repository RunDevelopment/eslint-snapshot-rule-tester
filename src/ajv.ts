/**
 * @fileoverview The instance of Ajv validator.
 * @author Evgeny Poberezkin
 * @license MIT
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

import Ajv from "ajv"
import metaSchema from "ajv/lib/refs/json-schema-draft-04.json"

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

export default (additionalOptions: Partial<Ajv.Options> = {}): Ajv.Ajv => {
    const ajv = new Ajv({
        meta: false,
        useDefaults: true,
        validateSchema: false,
        missingRefs: "ignore",
        verbose: true,
        schemaId: "auto",
        ...additionalOptions,
    })

    ajv.addMetaSchema(metaSchema)
    // eslint-disable-next-line no-underscore-dangle -- Ajv's API
    ajv._opts["defaultMeta" as never] = metaSchema.id as never

    return ajv
}
