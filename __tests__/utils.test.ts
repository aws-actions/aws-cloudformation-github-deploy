import { configureProxy, parseTags, isUrl, parseParameters } from '../src/utils'
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
