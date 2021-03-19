import * as aws from 'aws-sdk'
import YAML from 'yaml'
import * as fs from 'fs'
import { Parameter } from 'aws-sdk/clients/cloudformation'
import * as core from '@actions/core'

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
  let tags_obj
  if (isValidJSONString(s)) {
    tags_obj = parseJSON(s)
  } else if (isValidYAMLString(s)) {
    tags_obj = parseYAML(s)
  } else {
    return tags_obj
  }
  if (isArray(tags_obj)) {
    if (!isAWSified(tags_obj)) {
      tags_obj = awsifyTags(tags_obj)
    }
  } else if (tags_obj != undefined) {
    tags_obj = awsifyTags(tags_obj)
  }
  return tags_obj
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
    if (err.code !== 'ERR_INVALID_URL') {
      throw err
    }
  }

  const parameters = new Map<string, string>()

  parameterOverrides
    .split(/,(?=(?:(?:[^"']*["|']){2})*[^"']*$)/g)
    .forEach(parameter => {
      const [key, value] = parameter.trim().split('=')
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

export function parseJSON(s: string) {
  let json
  try {
    json = JSON.parse(s)
  } catch (_) {}
  return json
}

export function parseYAML(s: string) {
  let yaml
  try {
    yaml = YAML.parse(s)
  } catch (_) {}
  if (yaml == null) {
    yaml = undefined
  }
  return yaml
}

export function isValidJSONString(str: string) {
  try {
    JSON.parse(str)
  } catch (e) {
    return false
  }
  return true
}

export function isValidYAMLString(str: string) {
  try {
    YAML.parse(str)
  } catch (e) {
    return false
  }
  return true
}

export function awsifyTags(tag_obj: any) {
  const aws_tags = []
  for (const key in tag_obj) {
    if (tag_obj.hasOwnProperty(key)) {
      aws_tags.push({ Key: key, Value: tag_obj[key] })
    }
  }
  return aws_tags
}

export function isArray(tag_obj: any) {
  try {
    tag_obj.forEach(function (entry: any) {
      return false
    })
    return true
  } catch (e) {
    return false
  }
}
export function isAWSified(tag_obj: any) {
  const aws_tags = []
  let value = true
  tag_obj.forEach(function (entry: any) {
    if (entry['Key'] && entry['Value']) {
      value = true
    } else {
      value = false
      return value
    }
  })
  return value
}

export function instanceOfA(
  object: aws.CloudFormation.Tags
): object is aws.CloudFormation.Tags {
  return true
}
