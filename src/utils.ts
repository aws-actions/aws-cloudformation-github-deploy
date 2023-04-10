import * as aws from 'aws-sdk'
import * as fs from 'fs'
import { Parameter } from 'aws-sdk/clients/cloudformation'
import { HttpsProxyAgent } from 'https-proxy-agent'

export function isUrl(s: string): boolean {
  let url

  try {
    url = new URL(s)
  } catch (_) {
    return false
  }

  return url.protocol === 'https:'
}

export function parseTags(s: string): aws.CloudFormation.Tags | undefined {
  let json

  try {
    json = JSON.parse(s)
  } catch (_) {}

  return json
}

export function parseARNs(s: string): string[] | undefined {
  return s?.length > 0 ? s.split(',') : undefined
}

export function parseString(s: string): string | undefined {
  return s?.length > 0 ? s : undefined
}

export function parseNumber(s: string): number | undefined {
  return parseInt(s) || undefined
}

export function parseParameters(parameterOverrides: string): Parameter[] {
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

  const parameters = new Map<string, string>()
  parameterOverrides
    .split(/,(?=(?:(?:[^"']*["|']){2})*[^"']*$)/g)
    .forEach(parameter => {
      const values = parameter.trim().split('=')
      const key = values[0]
      // Corrects values that have an = in the value
      const value = values.slice(1).join('=')
      let param = parameters.get(key)
      param = !param ? value : [param, value].join(',')
      // Remove starting and ending quotes
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

export function configureProxy(proxyServer: string | undefined) {
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
      const proxy = new HttpsProxyAgent(proxyToSet)

      aws.config.update({
        httpOptions: { agent: proxy }
      })
    }
  }
}
