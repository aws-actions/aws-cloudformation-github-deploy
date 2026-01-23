import { displayChangeSet } from '../src/changeset-formatter'

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  startGroup: jest.fn(),
  endGroup: jest.fn(),
  warning: jest.fn()
}))

import * as core from '@actions/core'

describe('Change Set Formatter', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('displays simple add change', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          type: 'Resource',
          resourceChange: {
            action: 'Add',
            logicalResourceId: 'MyBucket',
            resourceType: 'AWS::S3::Bucket',
            replacement: 'False',
            scope: ['Properties']
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    displayChangeSet(changesSummary, 1, false)

    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('1 to add'))
    expect(core.startGroup).toHaveBeenCalledWith(expect.stringContaining('[+]'))
    expect(core.startGroup).toHaveBeenCalledWith(
      expect.stringContaining('AWS::S3::Bucket')
    )
    expect(core.startGroup).toHaveBeenCalledWith(
      expect.stringContaining('MyBucket')
    )
  })

  test('displays modify change with replacement warning', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          type: 'Resource',
          resourceChange: {
            action: 'Modify',
            logicalResourceId: 'MyFunction',
            resourceType: 'AWS::Lambda::Function',
            replacement: 'True',
            scope: ['Properties']
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    displayChangeSet(changesSummary, 1, false)

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('1 to change')
    )
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Resource will be replaced')
    )
  })

  test('displays remove change', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          type: 'Resource',
          resourceChange: {
            action: 'Remove',
            logicalResourceId: 'OldTable',
            resourceType: 'AWS::DynamoDB::Table',
            scope: []
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    displayChangeSet(changesSummary, 1, false)

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('1 to remove')
    )
    expect(core.startGroup).toHaveBeenCalledWith(expect.stringContaining('[-]'))
  })

  test('displays property details with before/after values', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          type: 'Resource',
          resourceChange: {
            action: 'Modify',
            logicalResourceId: 'MyFunction',
            resourceType: 'AWS::Lambda::Function',
            replacement: 'False',
            scope: ['Properties'],
            details: [
              {
                target: {
                  attribute: 'Properties',
                  name: 'Runtime',
                  requiresRecreation: 'Never',
                  beforeValue: 'nodejs18.x',
                  afterValue: 'nodejs20.x'
                },
                evaluation: 'Static',
                changeSource: 'DirectModification'
              }
            ]
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    displayChangeSet(changesSummary, 1, false)

    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Runtime'))
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('nodejs18.x')
    )
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('nodejs20.x')
    )
  })

  test('displays multiline before/after values', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          type: 'Resource',
          resourceChange: {
            action: 'Modify',
            logicalResourceId: 'MyFunction',
            resourceType: 'AWS::Lambda::Function',
            replacement: 'False',
            scope: ['Properties'],
            details: [
              {
                target: {
                  attribute: 'Properties',
                  name: 'Code.ZipFile',
                  requiresRecreation: 'Never',
                  beforeValue:
                    'exports.handler = async function(event) {\n  return { statusCode: 200 };\n};',
                  afterValue:
                    'exports.handler = async function(event) {\n  return { statusCode: 201 };\n};'
                },
                evaluation: 'Static',
                changeSource: 'DirectModification'
              }
            ]
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    displayChangeSet(changesSummary, 1, false)

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Code.ZipFile')
    )
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('statusCode: 200')
    )
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('statusCode: 201')
    )
  })

  test('displays requires recreation warning', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          type: 'Resource',
          resourceChange: {
            action: 'Modify',
            logicalResourceId: 'MyInstance',
            resourceType: 'AWS::EC2::Instance',
            replacement: 'True',
            scope: ['Properties'],
            details: [
              {
                target: {
                  attribute: 'Properties',
                  name: 'InstanceType',
                  requiresRecreation: 'Always'
                },
                evaluation: 'Static',
                changeSource: 'DirectModification'
              }
            ]
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    displayChangeSet(changesSummary, 1, false)

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Requires replacement')
    )
  })

  test('displays change source information', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          type: 'Resource',
          resourceChange: {
            action: 'Modify',
            logicalResourceId: 'MyFunction',
            resourceType: 'AWS::Lambda::Function',
            replacement: 'False',
            scope: ['Properties'],
            details: [
              {
                target: {
                  attribute: 'Properties',
                  name: 'Environment.Variables.TABLE_NAME'
                },
                evaluation: 'Dynamic',
                changeSource: 'ResourceReference',
                causingEntity: 'MyTable'
              }
            ]
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    displayChangeSet(changesSummary, 1, false)

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('ResourceReference')
    )
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('MyTable'))
  })

  test('displays truncation warning', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          type: 'Resource',
          resourceChange: {
            action: 'Add',
            logicalResourceId: 'Resource1',
            resourceType: 'AWS::S3::Bucket'
          }
        }
      ],
      totalChanges: 100,
      truncated: true
    })

    displayChangeSet(changesSummary, 100, false)

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('truncated')
    )
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('1 of 100')
    )
  })

  test('displays multiple changes grouped by action', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          type: 'Resource',
          resourceChange: {
            action: 'Add',
            logicalResourceId: 'NewBucket',
            resourceType: 'AWS::S3::Bucket'
          }
        },
        {
          type: 'Resource',
          resourceChange: {
            action: 'Modify',
            logicalResourceId: 'ExistingFunction',
            resourceType: 'AWS::Lambda::Function'
          }
        },
        {
          type: 'Resource',
          resourceChange: {
            action: 'Remove',
            logicalResourceId: 'OldTable',
            resourceType: 'AWS::DynamoDB::Table'
          }
        }
      ],
      totalChanges: 3,
      truncated: false
    })

    displayChangeSet(changesSummary, 3, false)

    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('1 to add'))
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('1 to change')
    )
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('1 to remove')
    )
  })

  test('handles invalid JSON gracefully', () => {
    displayChangeSet('invalid json', 0, false)

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to format')
    )
    expect(core.info).toHaveBeenCalledWith('invalid json')
  })

  test('displays raw JSON in separate group', () => {
    const changesSummary = JSON.stringify({
      changes: [],
      totalChanges: 0,
      truncated: false
    })

    displayChangeSet(changesSummary, 0, false)

    expect(core.startGroup).toHaveBeenCalledWith(
      expect.stringContaining('Raw Change Set JSON')
    )
  })

  test('handles conditional replacement', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          type: 'Resource',
          resourceChange: {
            action: 'Modify',
            logicalResourceId: 'MyResource',
            resourceType: 'AWS::EC2::Instance',
            replacement: 'Conditional',
            scope: ['Properties']
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    displayChangeSet(changesSummary, 1, false)

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('May require replacement')
    )
  })

  test('handles changes without details using scope fallback', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          type: 'Resource',
          resourceChange: {
            action: 'Modify',
            logicalResourceId: 'MyResource',
            resourceType: 'AWS::S3::Bucket',
            replacement: 'False',
            scope: ['Tags', 'Properties']
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    displayChangeSet(changesSummary, 1, false)

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Modified: Tags, Properties')
    )
  })
})
