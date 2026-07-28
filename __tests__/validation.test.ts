import { validateAndParseInputs } from '../src/validation'

const baseInputs = {
  mode: 'create-and-execute',
  name: 'TestStack',
  template: 'template.yaml',
  capabilities: 'CAPABILITY_IAM',
  'parameter-overrides': '',
  'fail-on-empty-changeset': '1',
  'no-execute-changeset': '0',
  'no-delete-failed-changeset': '0',
  'disable-rollback': '0',
  'timeout-in-minutes': '',
  'notification-arns': '',
  'role-arn': '',
  tags: '',
  'termination-protection': '',
  'http-proxy': '',
  'change-set-name': '',
  'include-nested-stacks-change-set': '0',
  'deployment-mode': '',
  's3-bucket': '',
  's3-prefix': '',
  'execute-change-set-id': '',
  'max-attempts': '',
  'retry-mode': ''
}

describe('validateAndParseInputs', () => {
  describe('max-attempts', () => {
    test('parses a valid number string', () => {
      const result = validateAndParseInputs({
        ...baseInputs,
        'max-attempts': '10'
      })
      expect(result['max-attempts']).toBe(10)
    })

    test('returns undefined for empty string', () => {
      const result = validateAndParseInputs({
        ...baseInputs,
        'max-attempts': ''
      })
      expect(result['max-attempts']).toBeUndefined()
    })

    test('returns undefined when not provided', () => {
      const result = validateAndParseInputs({
        ...baseInputs,
        'max-attempts': undefined
      })
      expect(result['max-attempts']).toBeUndefined()
    })
  })

  describe('retry-mode', () => {
    test('parses "standard" correctly', () => {
      const result = validateAndParseInputs({
        ...baseInputs,
        'retry-mode': 'standard'
      })
      expect(result['retry-mode']).toBe('standard')
    })

    test('parses "adaptive" correctly', () => {
      const result = validateAndParseInputs({
        ...baseInputs,
        'retry-mode': 'adaptive'
      })
      expect(result['retry-mode']).toBe('adaptive')
    })

    test('returns undefined for empty string', () => {
      const result = validateAndParseInputs({
        ...baseInputs,
        'retry-mode': ''
      })
      expect(result['retry-mode']).toBeUndefined()
    })

    test('throws on invalid retry-mode', () => {
      expect(() =>
        validateAndParseInputs({
          ...baseInputs,
          'retry-mode': 'exponential'
        })
      ).toThrow()
    })
  })
})
