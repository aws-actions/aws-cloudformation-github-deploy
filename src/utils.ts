import * as fs from 'fs'
import { Parameter } from '@aws-sdk/client-cloudformation'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { Tag } from '@aws-sdk/client-cloudformation'
import * as yaml from 'js-yaml'
import * as core from '@actions/core'

export function isUrl(s: string): boolean {
  let url

  try {
    url = new URL(s)
  } catch {
    return false
  }

  return url.protocol === 'https:'
}

export function parseTags(s?: string): Tag[] | undefined {
  if (!s || s.trim().length === 0) return undefined

  try {
    const parsed = yaml.load(s)

    if (!parsed) {
      return undefined
    }

    if (Array.isArray(parsed)) {
      // Handle array format [{Key: 'key', Value: 'value'}, ...]
      return parsed
        .filter(item => item.Key && item.Value !== undefined)
        .map(item => ({
          Key: String(item.Key),
          Value: String(item.Value)
        }))
    } else if (typeof parsed === 'object') {
      // Handle object format {key1: 'value1', key2: 'value2'}
      return Object.entries(parsed).map(([Key, Value]) => ({
        Key,
        Value: String(Value ?? '')
      }))
    }
  } catch {
    return undefined
  }
}

export function parseARNs(s?: string): string[] | undefined {
  return s?.length ? s.split(',') : undefined
}

export function parseString(s?: string): string | undefined {
  return s?.length ? s : undefined
}

export function parseNumber(s?: string): number | undefined {
  if (!s) return undefined
  const num = parseInt(s, 10)
  return isNaN(num) ? undefined : num
}

export function parseBoolean(s?: string): boolean {
  return s ? !!+s : false
}

type CFParameterValue = string | string[] | boolean
type CFParameterObject = Record<string, CFParameterValue>

function formatParameterValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (Array.isArray(value)) {
    return value.join(',')
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

export function parseParameters(
  parameterOverrides?: string | CFParameterObject
): Parameter[] | undefined {
  if (!parameterOverrides) return undefined

  // Case 1: Handle native YAML/JSON objects
  if (typeof parameterOverrides !== 'string') {
    return Object.keys(parameterOverrides).map(key => {
      const value = parameterOverrides[key]
      return {
        ParameterKey: key,
        ParameterValue:
          typeof value === 'string' ? value : formatParameterValue(value)
      }
    })
  }

  // Case 2: Empty string
  if (parameterOverrides.trim().length === 0) return undefined

  // Case 3: Try parsing as YAML
  try {
    const parsed = yaml.load(parameterOverrides)
    if (!parsed) {
      return undefined
    }

    if (Array.isArray(parsed)) {
      // Handle array format
      return parsed.map(param => ({
        ParameterKey: param.ParameterKey,
        ParameterValue: formatParameterValue(param.ParameterValue)
      }))
    } else if (typeof parsed === 'object') {
      // Handle object format
      return Object.entries(parsed).map(([key, value]) => ({
        ParameterKey: key,
        ParameterValue: formatParameterValue(value)
      }))
    }
  } catch {
    // YAML parsing failed, continue to other cases
  }

  // Case 4: Try URL to JSON file
  try {
    const path = new URL(parameterOverrides)
    const rawParameters = fs.readFileSync(path, 'utf-8')

    return JSON.parse(rawParameters)
  } catch (err) {
    // @ts-expect-error: Object is of type 'unknown'
    if (err.code !== 'ERR_INVALID_URL') {
      throw err
    }
  }

  // Case 5: String format "key=value,key2=value2"
  const parameters = new Map<string, string>()
  parameterOverrides
    .trim()
    .split(/,(?=(?:(?:[^"']*["|']){2})*[^"']*$)/g)
    .forEach(parameter => {
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

  return [...parameters.keys()].map(key => {
    return {
      ParameterKey: key,
      ParameterValue: parameters.get(key)
    }
  })
}

export function parseDeploymentMode(s: string): 'REVERT_DRIFT' | undefined {
  const parsed = parseString(s)

  if (!parsed) {
    return undefined
  }

  if (parsed === 'REVERT_DRIFT') {
    return parsed
  }

  throw new Error(
    `Invalid deployment-mode: ${parsed}. Only 'REVERT_DRIFT' is supported.`
  )
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 5,
  initialDelayMs = 1000
): Promise<T> {
  let retryCount = 0
  let delay = initialDelayMs

  while (true) {
    try {
      return await operation()
    } catch (error: unknown) {
      // Check for throttling by error name or message
      const isThrottling =
        error instanceof Error &&
        (error.name === 'ThrottlingException' ||
          error.name === 'TooManyRequestsException' ||
          error.message.includes('Rate exceeded'))

      if (isThrottling) {
        if (retryCount >= maxRetries) {
          throw new Error(
            `Maximum retry attempts (${maxRetries}) reached. Last error: ${
              (error as Error).message
            }`
          )
        }

        retryCount++
        core.info(
          `Rate limit exceeded. Attempt ${retryCount}/${maxRetries}. Waiting ${
            delay / 1000
          } seconds before retry...`
        )
        await new Promise(resolve => setTimeout(resolve, delay))
        delay = Math.min(delay * 2, 30000) // Exponential backoff, max 30s
      } else {
        throw error
      }
    }
  }
}

export function configureProxy(
  proxyServer: string | undefined
): HttpsProxyAgent<string> | undefined {
  const proxyFromEnv = process.env.HTTP_PROXY || process.env.http_proxy

  if (proxyFromEnv || proxyServer) {
    let proxyToSet = null

    if (proxyServer) {
      console.log(`Setting proxy from actions input: ${proxyServer}`)
      proxyToSet = proxyServer
    } else {
      console.log(`Setting proxy from environment: ${proxyFromEnv}`)
      proxyToSet = proxyFromEnv
    }

    if (proxyToSet) {
      return new HttpsProxyAgent(proxyToSet)
    }
  }
}
