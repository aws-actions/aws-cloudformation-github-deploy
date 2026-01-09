import { ThrottlingException } from '@aws-sdk/client-marketplace-catalog'
import {
  configureProxy,
  parseTags,
  isUrl,
  parseParameters,
  formatError,
  withRetry
} from '../src/utils'
import * as path from 'path'
import * as yaml from 'js-yaml'

const oldEnv = process.env

describe('Determine a valid url', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns true on a valid url', async () => {
    const truthy = isUrl(
      'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW'
    )
    expect(truthy).toBeTruthy()
  })

  test('returns false on path', async () => {
    const falsy = isUrl('./template.json')
    expect(falsy).toBeFalsy()
  })
})

describe('Parse Tags', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns undefined on non valid JSON', async () => {
    const json = parseTags('')
    expect(json).toBeUndefined()
  })

  test('returns valid Array on valid JSON', async () => {
    const json = parseTags(JSON.stringify([{ Key: 'Test', Value: 'Value' }]))
    expect(json).toEqual([{ Key: 'Test', Value: 'Value' }])
  })

  test('returns valid Array from YAML key-value object format', async () => {
    const yaml = `
Key1: Value1
Key2: Value2
`
    const result = parseTags(yaml)
    expect(result).toEqual([
      { Key: 'Key1', Value: 'Value1' },
      { Key: 'Key2', Value: 'Value2' }
    ])
  })

  test('returns valid Array from YAML array format', async () => {
    const yaml = `
- Key: keyname1
  Value: value1
- Key: keyname2
  Value: value2
`
    const result = parseTags(yaml)
    expect(result).toEqual([
      { Key: 'keyname1', Value: 'value1' },
      { Key: 'keyname2', Value: 'value2' }
    ])
  })

  test('returns undefined for invalid YAML', async () => {
    const invalidYaml = `
    Key1: 'Value1
    Key2: Value2
    `
    const result = parseTags(invalidYaml)
    expect(result).toBeUndefined()
  })
})

describe('Parse Parameters', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...oldEnv }
  })

  afterAll(() => {
    process.env = oldEnv
  })

  test('returns parameters empty string', async () => {
    const json = parseParameters('')
    expect(json).toEqual([])
  })

  test('returns parameters empty YAML', async () => {
    const json = parseParameters('0')
    expect(json).toEqual([])
  })

  type CFParameterValue = string | string[] | boolean
  type CFParameterObject = Record<string, CFParameterValue>

  test('handles empty parameter overrides object', () => {
    const parameterOverrides: CFParameterObject = {}
    const result = parseParameters(parameterOverrides)
    expect(result).toEqual([])
  })

  test('handles undefined values in parameter overrides object', () => {
    const parameterOverrides: CFParameterObject = {
      ValidParam: 'value',
      EmptyParam: '',
      ListParam: ['value1', 'value2']
    }

    const result = parseParameters(parameterOverrides)

    expect(result).toEqual([
      {
        ParameterKey: 'ValidParam',
        ParameterValue: 'value'
      },
      {
        ParameterKey: 'EmptyParam',
        ParameterValue: ''
      },
      {
        ParameterKey: 'ListParam',
        ParameterValue: 'value1,value2'
      }
    ])
  })

  test('returns parameters list from string', async () => {
    const json = parseParameters('MyParam1=myValue1,MyParam2=myValue2')
    expect(json).toEqual([
      {
        ParameterKey: 'MyParam1',
        ParameterValue: 'myValue1'
      },
      {
        ParameterKey: 'MyParam2',
        ParameterValue: 'myValue2'
      }
    ])
  })

  test('returns parameters list from string', async () => {
    const json = parseParameters(
      'MyParam1=myValue1,MyParam2=myValue2,MyParam2=myValue3'
    )
    expect(json).toEqual([
      {
        ParameterKey: 'MyParam1',
        ParameterValue: 'myValue1'
      },
      {
        ParameterKey: 'MyParam2',
        ParameterValue: 'myValue2,myValue3'
      }
    ])
  })

  test('returns parameters list with an extra equal', async () => {
    const json = parseParameters(
      'MyParam1=myValue1,MyParam2=myValue2=myValue3,MyParam2=myValue4 '
    )
    expect(json).toEqual([
      {
        ParameterKey: 'MyParam1',
        ParameterValue: 'myValue1'
      },
      {
        ParameterKey: 'MyParam2',
        ParameterValue: 'myValue2=myValue3,myValue4'
      }
    ])
  })

  test('returns parameters list from multiple lists with single quotes', async () => {
    const json = parseParameters(
      "MyParam1=myValue1,MyParam2='myValue2,myValue3',MyParam2=myValue4"
    )
    expect(json).toEqual([
      {
        ParameterKey: 'MyParam1',
        ParameterValue: 'myValue1'
      },
      {
        ParameterKey: 'MyParam2',
        ParameterValue: 'myValue2,myValue3,myValue4'
      }
    ])
  })

  test('returns parameters list from multiple lists with double quotes', async () => {
    const json = parseParameters(
      'MyParam1=myValue1,MyParam2="myValue2,myValue3",MyParam2=myValue4'
    )
    expect(json).toEqual([
      {
        ParameterKey: 'MyParam1',
        ParameterValue: 'myValue1'
      },
      {
        ParameterKey: 'MyParam2',
        ParameterValue: 'myValue2,myValue3,myValue4'
      }
    ])
  })

  test('returns parameters list from file', async () => {
    const filename = 'file://' + path.join(__dirname, 'params.test.json')
    const json = parseParameters(filename)
    expect(json).toEqual([
      {
        ParameterKey: 'MyParam1',
        ParameterValue: 'myValue1'
      },
      {
        ParameterKey: 'MyParam2',
        ParameterValue: 'myValue2'
      }
    ])
  })

  test('returns parameters list from YAML array format', async () => {
    const yaml = `
- ParameterKey: MyParam1
  ParameterValue: myValue1
- ParameterKey: MyParam2
  ParameterValue: myValue2
`
    const json = parseParameters(yaml)
    expect(json).toEqual([
      {
        ParameterKey: 'MyParam1',
        ParameterValue: 'myValue1'
      },
      {
        ParameterKey: 'MyParam2',
        ParameterValue: 'myValue2'
      }
    ])
  })

  test('handles YAML with nested values', async () => {
    const yaml = `
MyParam1: myValue1
MyParam2:
  - item1
  - item2
MyParam3:
  key: value
MyParam4: {"key":"value"}
`
    const json = parseParameters(yaml)
    expect(json).toEqual([
      {
        ParameterKey: 'MyParam1',
        ParameterValue: 'myValue1'
      },
      {
        ParameterKey: 'MyParam2',
        ParameterValue: 'item1,item2'
      },
      {
        ParameterKey: 'MyParam3',
        ParameterValue: '{"key":"value"}'
      },
      {
        ParameterKey: 'MyParam4',
        ParameterValue: '{"key":"value"}'
      }
    ])
  })

  test('handles YAML with boolean and number values', async () => {
    const yaml = `
BoolParam: true
NumberParam: 123
StringParam: 'hello'
NullParam: null
`
    const json = parseParameters(yaml)
    expect(json).toEqual([
      {
        ParameterKey: 'BoolParam',
        ParameterValue: 'true'
      },
      {
        ParameterKey: 'NumberParam',
        ParameterValue: '123'
      },
      {
        ParameterKey: 'StringParam',
        ParameterValue: 'hello'
      },
      {
        ParameterKey: 'NullParam',
        ParameterValue: ''
      }
    ])
  })

  test('throws error if file is not found', async () => {
    const filename = 'file://' + path.join(__dirname, 'params.tezt.json')
    expect(() => parseParameters(filename)).toThrow()
  })

  test('throws error if json in file cannot be parsed', async () => {
    const filename =
      'file://' + path.join(__dirname, 'params-invalid.test.json')
    expect(() => parseParameters(filename)).toThrow()
  })
})

describe('Parse Tags', () => {
  test('parses tags from YAML array format', () => {
    const yaml = `
- Key: Environment
  Value: Production
- Key: Project
  Value: MyApp
- Key: CostCenter
  Value: '12345'
`
    const result = parseTags(yaml)
    expect(result).toEqual([
      {
        Key: 'Environment',
        Value: 'Production'
      },
      {
        Key: 'Project',
        Value: 'MyApp'
      },
      {
        Key: 'CostCenter',
        Value: '12345'
      }
    ])
  })

  test('parses tags from YAML object format', () => {
    const yaml = `
Environment: Production
Project: MyApp
CostCenter: '12345'
`
    const result = parseTags(yaml)
    expect(result).toEqual([
      {
        Key: 'Environment',
        Value: 'Production'
      },
      {
        Key: 'Project',
        Value: 'MyApp'
      },
      {
        Key: 'CostCenter',
        Value: '12345'
      }
    ])
  })

  test('handles empty YAML input', () => {
    expect(parseTags('')).toEqual(undefined)
    expect(parseTags('0')).toEqual(undefined)
  })

  test('handles YAML with different value types', () => {
    const yaml = `
Environment: Production
IsProduction: true
InstanceCount: 5
FloatValue: 3.14
`
    const result = parseTags(yaml)
    expect(result).toEqual([
      {
        Key: 'Environment',
        Value: 'Production'
      },
      {
        Key: 'IsProduction',
        Value: 'true'
      },
      {
        Key: 'InstanceCount',
        Value: '5'
      },
      {
        Key: 'FloatValue',
        Value: '3.14'
      }
    ])
  })

  test('handles malformed YAML', () => {
    const malformedYaml = `
    This is not valid YAML
    - Key: Missing Value
    `
    expect(parseTags(malformedYaml)).toEqual(undefined)
  })

  test('handles array format with missing required fields', () => {
    const yaml = `
- Key: ValidTag
  Value: ValidValue
- Value: MissingKey
- Key: MissingValue
`
    const result = parseTags(yaml)
    expect(result).toEqual([
      {
        Key: 'ValidTag',
        Value: 'ValidValue'
      }
    ])
  })

  test('handles object format with empty values', () => {
    const yaml = `
Environment:
Project: MyApp
EmptyString: ''
`
    const result = parseTags(yaml)
    expect(result).toEqual([
      {
        Key: 'Environment',
        Value: ''
      },
      {
        Key: 'Project',
        Value: 'MyApp'
      },
      {
        Key: 'EmptyString',
        Value: ''
      }
    ])
  })

  test('preserves whitespace in tag values', () => {
    const yaml = `
Description: This is a long description with spaces
Path: /path/to/something
`
    const result = parseTags(yaml)
    expect(result).toEqual([
      {
        Key: 'Description',
        Value: 'This is a long description with spaces'
      },
      {
        Key: 'Path',
        Value: '/path/to/something'
      }
    ])
  })
})

describe('Format Error', () => {
  const testError = new Error('Test error message')
  testError.stack = 'Test error stack'

  test('formats error as JSON', () => {
    const result = formatError(testError, 'json')
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({
      error: {
        message: 'Test error message',
        stack: 'Test error stack'
      }
    })
  })

  test('formats error as YAML', () => {
    const result = formatError(testError, 'yaml')
    const parsed = yaml.load(result)
    expect(parsed).toEqual({
      error: {
        message: 'Test error message',
        stack: 'Test error stack'
      }
    })
  })

  test('formats waiter result object as JSON', () => {
    const waiterError = {
      state: 'FAILURE',
      reason: {
        $metadata: { httpStatusCode: 400 },
        Stacks: [
          { StackName: 'test-stack', StackStatus: 'UPDATE_ROLLBACK_COMPLETE' }
        ]
      }
    }
    const result = formatError(waiterError, 'json')
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({
      deploymentResult: {
        state: 'FAILURE',
        reason: waiterError.reason
      }
    })
  })

  test('formats waiter result object as YAML', () => {
    const waiterError = {
      state: 'FAILURE',
      reason: {
        $metadata: { httpStatusCode: 400 },
        Stacks: [
          { StackName: 'test-stack', StackStatus: 'UPDATE_ROLLBACK_COMPLETE' }
        ]
      }
    }
    const result = formatError(waiterError, 'yaml')
    const parsed = yaml.load(result)
    expect(parsed).toEqual({
      deploymentResult: {
        state: 'FAILURE',
        reason: waiterError.reason
      }
    })
  })

  test('formats string error as JSON', () => {
    const result = formatError('Simple error message', 'json')
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({
      error: {
        message: 'Simple error message'
      }
    })
  })

  test('formats string error as YAML', () => {
    const result = formatError('Simple error message', 'yaml')
    const parsed = yaml.load(result)
    expect(parsed).toEqual({
      error: {
        message: 'Simple error message'
      }
    })
  })

  test('formats JSON string error as YAML', () => {
    const jsonError = '{"state":"FAILURE","reason":{"message":"Stack failed"}}'
    const result = formatError(jsonError, 'yaml')
    const parsed = yaml.load(result)
    expect(parsed).toEqual({
      error: {
        state: 'FAILURE',
        reason: {
          message: 'Stack failed'
        }
      }
    })
  })

  test('formats Error with JSON message as YAML', () => {
    const jsonMessage =
      '{"state":"FAILURE","reason":{"Stacks":[{"StackName":"test"}]}}'
    const error = new Error(jsonMessage)
    const result = formatError(error, 'yaml')
    const parsed = yaml.load(result)
    expect(parsed).toEqual({
      error: {
        state: 'FAILURE',
        reason: {
          Stacks: [{ StackName: 'test' }]
        }
      }
    })
  })

  test('formats Error with JSON message as JSON', () => {
    const jsonMessage =
      '{"state":"FAILURE","reason":{"Stacks":[{"StackName":"test"}]}}'
    const error = new Error(jsonMessage)
    const result = formatError(error, 'json')
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({
      error: {
        state: 'FAILURE',
        reason: {
          Stacks: [{ StackName: 'test' }]
        }
      }
    })
  })

  test('formats non-Error object with JSON string as YAML', () => {
    const jsonObject = '{"deploymentFailed":true,"reason":"Stack error"}'
    const result = formatError(jsonObject, 'yaml')
    const parsed = yaml.load(result)
    expect(parsed).toEqual({
      error: {
        deploymentFailed: true,
        reason: 'Stack error'
      }
    })
  })

  test('formats non-Error object with JSON string as JSON', () => {
    const jsonObject = '{"deploymentFailed":true,"reason":"Stack error"}'
    const result = formatError(jsonObject, 'json')
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({
      error: {
        deploymentFailed: true,
        reason: 'Stack error'
      }
    })
  })

  test('formats non-Error object with non-JSON string as YAML', () => {
    const nonJsonObject = 'Simple deployment error'
    const result = formatError(nonJsonObject, 'yaml')
    const parsed = yaml.load(result)
    expect(parsed).toEqual({
      error: {
        message: 'Simple deployment error'
      }
    })
  })

  test('formats non-Error object with non-JSON string as JSON', () => {
    const nonJsonObject = 'Simple deployment error'
    const result = formatError(nonJsonObject, 'json')
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({
      error: {
        message: 'Simple deployment error'
      }
    })
  })

  test('formats number as YAML', () => {
    const numberError = 12345
    const result = formatError(numberError, 'yaml')
    const parsed = yaml.load(result)
    // Number gets converted to string "12345", which is valid JSON (a number),
    // so it gets parsed as the number 12345
    expect(parsed).toEqual({
      error: 12345
    })
  })

  test('formats number as JSON', () => {
    const numberError = 12345
    const result = formatError(numberError, 'json')
    const parsed = JSON.parse(result)
    // Number gets converted to string "12345", which is valid JSON (a number),
    // so it gets parsed as the number 12345
    expect(parsed).toEqual({
      error: 12345
    })
  })

  test('formats object with JSON-like string representation as YAML', () => {
    const objectError = { toString: () => '{"error":"custom error"}' }
    const result = formatError(objectError, 'yaml')
    const parsed = yaml.load(result)
    expect(parsed).toEqual({
      error: {
        error: 'custom error'
      }
    })
  })

  test('formats object with JSON-like string representation as JSON', () => {
    const objectError = { toString: () => '{"error":"custom error"}' }
    const result = formatError(objectError, 'json')
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({
      error: {
        error: 'custom error'
      }
    })
  })

  test('formats object with non-JSON string representation as YAML', () => {
    const objectError = { toString: () => 'invalid json string {' }
    const result = formatError(objectError, 'yaml')
    const parsed = yaml.load(result)
    expect(parsed).toEqual({
      error: {
        message: 'invalid json string {'
      }
    })
  })

  test('formats object with non-JSON string representation as JSON', () => {
    const objectError = { toString: () => 'invalid json string {' }
    const result = formatError(objectError, 'json')
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({
      error: {
        message: 'invalid json string {'
      }
    })
  })
})

describe('withRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('returns result on successful operation', async () => {
    const operation = jest.fn().mockResolvedValue('success')
    const result = await withRetry(operation)
    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(1)
  })

  test('retries on rate exceeded error', async () => {
    jest.useFakeTimers()
    const error = new ThrottlingException({
      message: 'Rate exceeded',
      $metadata: { requestId: 'test-request-id', attempts: 1 }
    })
    const operation = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('success')

    const retryPromise = withRetry(operation, 5, 100)

    // Advance timer for the first retry (since it succeeds on second try)
    await jest.advanceTimersByTimeAsync(100)

    const result = await retryPromise
    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(2)

    jest.useRealTimers()
  }, 10000)

  test('fails after max retries', async () => {
    jest.useFakeTimers()
    const error = new ThrottlingException({
      message: 'Rate exceeded',
      $metadata: { requestId: 'test-request-id', attempts: 1 }
    })
    const operation = jest.fn().mockRejectedValue(error)

    // Attach the catch handler immediately
    const retryPromise = withRetry(operation, 5, 100).catch(err => {
      expect(err.message).toBe(
        'Maximum retry attempts (5) reached. Last error: Rate exceeded'
      )
    })

    // Advance timers for each retry (initial + 5 retries)
    for (let i = 0; i < 5; i++) {
      await jest.advanceTimersByTimeAsync(100 * Math.pow(2, i))
    }

    await retryPromise
    expect(operation).toHaveBeenCalledTimes(6)

    jest.useRealTimers()
  }, 10000)

  test('does not retry on non-rate-limit errors', async () => {
    const error = new Error('Other error')
    const operation = jest.fn().mockRejectedValue(error)

    await expect(withRetry(operation)).rejects.toThrow('Other error')
    expect(operation).toHaveBeenCalledTimes(1)
  })
})

describe('Configure Proxy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...oldEnv }
  })

  it('returns undefined on no proxy', () => {
    const agent = configureProxy('')
    expect(agent).toBeUndefined()
  })

  it('returns agent on proxy', () => {
    const agent = configureProxy('http://localhost:8080')
    expect(agent).toBeDefined()
  })

  it('returns agent on proxy from env', () => {
    process.env.HTTP_PROXY = 'http://localhost:8080'
    const agent = configureProxy('')
    expect(agent).toBeDefined()
  })
})
