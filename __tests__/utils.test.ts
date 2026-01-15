import {
  configureProxy,
  parseTags,
  isUrl,
  parseParameters,
  parseARNs,
  parseString,
  parseNumber,
  parseBoolean
} from '../src/utils'
import * as path from 'path'

jest.mock('@actions/core')

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
})

describe('Parse Parameters', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...oldEnv }
  })

  afterAll(() => {
    process.env = oldEnv
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
      'MyParam1=myValue1,MyParam2=myValue2=myValue3,MyParam2=myValue4'
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

describe('Parse utility functions', () => {
  test('parseARNs returns undefined on empty string', () => {
    expect(parseARNs('')).toBeUndefined()
  })

  test('parseARNs returns undefined on undefined', () => {
    expect(parseARNs(undefined)).toBeUndefined()
  })

  test('parseARNs splits comma-separated values', () => {
    expect(parseARNs('arn1,arn2,arn3')).toEqual(['arn1', 'arn2', 'arn3'])
  })

  test('parseString returns undefined on empty string', () => {
    expect(parseString('')).toBeUndefined()
  })

  test('parseString returns undefined on undefined', () => {
    expect(parseString(undefined)).toBeUndefined()
  })

  test('parseString returns value on non-empty string', () => {
    expect(parseString('test')).toBe('test')
  })

  test('parseNumber returns undefined on empty string', () => {
    expect(parseNumber('')).toBeUndefined()
  })

  test('parseNumber returns undefined on undefined', () => {
    expect(parseNumber(undefined)).toBeUndefined()
  })

  test('parseNumber parses valid number', () => {
    expect(parseNumber('42')).toBe(42)
  })

  test('parseNumber handles zero correctly', () => {
    expect(parseNumber('0')).toBe(0)
  })

  test('parseNumber returns undefined for invalid input', () => {
    expect(parseNumber('abc')).toBeUndefined()
  })

  test('parseBoolean returns false on empty string', () => {
    expect(parseBoolean('')).toBe(false)
  })

  test('parseBoolean returns false on undefined', () => {
    expect(parseBoolean(undefined)).toBe(false)
  })

  test('parseBoolean returns true on "1"', () => {
    expect(parseBoolean('1')).toBe(true)
  })

  test('parseBoolean returns false on "0"', () => {
    expect(parseBoolean('0')).toBe(false)
  })
})
