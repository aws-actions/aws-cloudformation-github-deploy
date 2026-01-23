import {
  configureProxy,
  parseTags,
  isUrl,
  parseParameters,
  parseBoolean,
  withRetry
} from '../src/utils'
import * as path from 'path'

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
    expect(json).toBeUndefined()
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

describe('parseBoolean', () => {
  test('handles native boolean true', () => {
    expect(parseBoolean(true)).toBe(true)
  })

  test('handles native boolean false', () => {
    expect(parseBoolean(false)).toBe(false)
  })

  test('handles string "true"', () => {
    expect(parseBoolean('true')).toBe(true)
  })

  test('handles string "false"', () => {
    expect(parseBoolean('false')).toBe(false)
  })

  test('handles legacy string "1"', () => {
    expect(parseBoolean('1')).toBe(true)
  })

  test('handles legacy string "0"', () => {
    expect(parseBoolean('0')).toBe(false)
  })

  test('handles undefined', () => {
    expect(parseBoolean(undefined)).toBe(false)
  })

  test('handles empty string', () => {
    expect(parseBoolean('')).toBe(false)
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

  test('retries on CloudFormation Throttling error', async () => {
    jest.useFakeTimers()
    const error = new Error('Rate exceeded')
    error.name = 'Throttling' // CloudFormation uses 'Throttling' not 'ThrottlingException'
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

  test('retries on rate exceeded error', async () => {
    jest.useFakeTimers()
    const error = new Error('Rate exceeded')
    error.name = 'ThrottlingException'
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
    const error = new Error('Rate exceeded')
    error.name = 'ThrottlingException'
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
