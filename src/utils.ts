import * as aws from 'aws-sdk'

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
