import { z } from 'zod'
import * as fs from 'fs'

// Helper transformers
const emptyToUndefined = (val?: string) =>
  val && val.trim().length > 0 ? val : undefined
const parseBoolean = (val?: string) => (val ? !!+val : false)
const parseNumber = (val?: string) =>
  val ? parseInt(val) || undefined : undefined
const parseARNs = (val?: string) => (val?.length ? val.split(',') : undefined)
const parseTags = (val?: string) => {
  if (!val || val.trim().length === 0) return undefined
  try {
    return JSON.parse(val)
  } catch {
    return undefined
  }
}
const parseParameters = (val?: string) => {
  if (!val || val.trim().length === 0) return undefined

  try {
    const path = new URL(val)
    const rawParameters = fs.readFileSync(path, 'utf-8')
    return JSON.parse(rawParameters)
  } catch (err) {
    // @ts-expect-error: Object is of type 'unknown'
    if (err.code !== 'ERR_INVALID_URL') {
      throw err
    }
  }

  const parameters = new Map<string, string>()
  val.split(/,(?=(?:(?:[^"']*["|']){2})*[^"']*$)/g).forEach(parameter => {
    const values = parameter.trim().split('=')
    const key = values[0]
    const value = values.slice(1).join('=')
    let param = parameters.get(key)
    param = !param ? value : [param, value].join(',')
    if (
      (param.startsWith("'") && param.endsWith("'")) ||
      (param.startsWith('"') && param.endsWith('"'))
    ) {
      param = param.substring(1, param.length - 1)
    }
    parameters.set(key, param)
  })

  return [...parameters.keys()].map(key => ({
    ParameterKey: key,
    ParameterValue: parameters.get(key)
  }))
}

const baseSchema = z.object({
  mode: z
    .enum(['create-and-execute', 'create-only', 'execute-only'])
    .default('create-and-execute'),
  name: z.string().min(1, 'Stack name is required'),
  'http-proxy': z.string().optional().transform(emptyToUndefined)
})

const createSchema = baseSchema.extend({
  mode: z.enum(['create-and-execute', 'create-only']),
  template: z.string().min(1, 'Template is required for create modes'),
  capabilities: z
    .string()
    .optional()
    .transform(val =>
      val ? val.split(',').map(cap => cap.trim()) : ['CAPABILITY_IAM']
    ),
  'parameter-overrides': z.string().optional().transform(parseParameters),
  'fail-on-empty-changeset': z.string().optional().transform(parseBoolean),
  'no-execute-changeset': z.string().optional().transform(parseBoolean),
  'no-delete-failed-changeset': z.string().optional().transform(parseBoolean),
  'disable-rollback': z.string().optional().transform(parseBoolean),
  'timeout-in-minutes': z.string().optional().transform(parseNumber),
  'notification-arns': z.string().optional().transform(parseARNs),
  'role-arn': z.string().optional().transform(emptyToUndefined),
  tags: z.string().optional().transform(parseTags),
  'termination-protection': z.string().optional().transform(parseBoolean),
  'change-set-name': z.string().optional().transform(emptyToUndefined),
  'include-nested-stacks-change-set': z
    .string()
    .optional()
    .transform(parseBoolean),
  'deployment-mode': z
    .string()
    .optional()
    .transform(val => {
      if (!val) return undefined
      if (val === 'REVERT_DRIFT') return val
      throw new Error(
        `Invalid deployment-mode: ${val}. Only 'REVERT_DRIFT' is supported.`
      )
    }),
  'execute-change-set-id': z
    .string()
    .optional()
    .transform(val => val || undefined)
})

const executeSchema = baseSchema.extend({
  mode: z.literal('execute-only'),
  'execute-change-set-id': z
    .string()
    .min(1, 'Change set ID is required for execute-only mode'),
  template: z.string().optional().transform(emptyToUndefined),
  'parameter-overrides': z.string().optional().transform(emptyToUndefined),
  'deployment-mode': z.string().optional().transform(emptyToUndefined),
  capabilities: z.string().optional().transform(emptyToUndefined),
  'fail-on-empty-changeset': z.string().optional().transform(emptyToUndefined),
  'no-execute-changeset': z.string().optional().transform(emptyToUndefined),
  'no-delete-failed-changeset': z
    .string()
    .optional()
    .transform(emptyToUndefined),
  'disable-rollback': z.string().optional().transform(emptyToUndefined),
  'timeout-in-minutes': z.string().optional().transform(emptyToUndefined),
  'notification-arns': z.string().optional().transform(emptyToUndefined),
  'role-arn': z.string().optional().transform(emptyToUndefined),
  tags: z.string().optional().transform(emptyToUndefined),
  'termination-protection': z.string().optional().transform(emptyToUndefined),
  'change-set-name': z.string().optional().transform(emptyToUndefined),
  'include-nested-stacks-change-set': z
    .string()
    .optional()
    .transform(emptyToUndefined)
})

export function validateAndParseInputs(
  inputs: Record<string, string | undefined>
) {
  const mode = inputs.mode || 'create-and-execute'

  if (mode === 'execute-only') {
    return executeSchema.parse(inputs)
  } else {
    return createSchema.parse(inputs)
  }
}
