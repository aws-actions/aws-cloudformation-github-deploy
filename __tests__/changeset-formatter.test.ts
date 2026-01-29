import {
  displayChangeSet,
  generateChangeSetMarkdown
} from '../src/changeset-formatter'

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
          ResourceChange: {
            Action: 'Add',
            LogicalResourceId: 'MyBucket',
            ResourceType: 'AWS::S3::Bucket',
            Replacement: 'False',
            Scope: ['Properties']
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
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'MyFunction',
            ResourceType: 'AWS::Lambda::Function',
            Replacement: 'True',
            Scope: ['Properties']
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
          ResourceChange: {
            Action: 'Remove',
            LogicalResourceId: 'OldTable',
            ResourceType: 'AWS::DynamoDB::Table',
            Scope: []
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
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'MyFunction',
            ResourceType: 'AWS::Lambda::Function',
            Replacement: 'False',
            Scope: ['Properties'],
            Details: [
              {
                Target: {
                  Attribute: 'Properties',
                  Name: 'Runtime',
                  RequiresRecreation: 'Never',
                  BeforeValue: 'nodejs18.x',
                  AfterValue: 'nodejs20.x'
                },
                Evaluation: 'Static',
                ChangeSource: 'DirectModification'
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
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'MyFunction',
            ResourceType: 'AWS::Lambda::Function',
            Replacement: 'False',
            Scope: ['Properties'],
            Details: [
              {
                Target: {
                  Attribute: 'Properties',
                  Name: 'Code.ZipFile',
                  RequiresRecreation: 'Never',
                  BeforeValue:
                    'exports.handler = async function(event) {\n  return { statusCode: 200 };\n};',
                  AfterValue:
                    'exports.handler = async function(event) {\n  return { statusCode: 201 };\n};'
                },
                Evaluation: 'Static',
                ChangeSource: 'DirectModification'
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
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'MyInstance',
            ResourceType: 'AWS::EC2::Instance',
            Replacement: 'True',
            Scope: ['Properties'],
            Details: [
              {
                Target: {
                  Attribute: 'Properties',
                  Name: 'InstanceType',
                  RequiresRecreation: 'Always'
                },
                Evaluation: 'Static',
                ChangeSource: 'DirectModification'
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
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'MyFunction',
            ResourceType: 'AWS::Lambda::Function',
            Replacement: 'False',
            Scope: ['Properties'],
            Details: [
              {
                Target: {
                  Attribute: 'Properties',
                  Name: 'Environment.Variables.TABLE_NAME'
                },
                Evaluation: 'Dynamic',
                ChangeSource: 'ResourceReference',
                CausingEntity: 'MyTable'
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
          ResourceChange: {
            Action: 'Add',
            LogicalResourceId: 'Resource1',
            ResourceType: 'AWS::S3::Bucket'
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
          ResourceChange: {
            Action: 'Add',
            LogicalResourceId: 'NewBucket',
            ResourceType: 'AWS::S3::Bucket'
          }
        },
        {
          type: 'Resource',
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'ExistingFunction',
            ResourceType: 'AWS::Lambda::Function'
          }
        },
        {
          type: 'Resource',
          ResourceChange: {
            Action: 'Remove',
            LogicalResourceId: 'OldTable',
            ResourceType: 'AWS::DynamoDB::Table'
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
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'MyResource',
            ResourceType: 'AWS::EC2::Instance',
            Replacement: 'Conditional',
            Scope: ['Properties']
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
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'MyResource',
            ResourceType: 'AWS::S3::Bucket',
            Replacement: 'False',
            Scope: ['Tags', 'Properties']
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

  test('generates markdown for PR comments', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          Type: 'Resource',
          ResourceChange: {
            Action: 'Add',
            LogicalResourceId: 'MyBucket',
            ResourceType: 'AWS::S3::Bucket',
            Scope: [],
            Details: []
          }
        },
        {
          Type: 'Resource',
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'MyTable',
            PhysicalResourceId: 'my-table-123',
            ResourceType: 'AWS::DynamoDB::Table',
            Replacement: 'True',
            Scope: ['Properties'],
            Details: [
              {
                Target: {
                  Attribute: 'Properties',
                  Name: 'BillingMode',
                  RequiresRecreation: 'Always',
                  BeforeValue: 'PROVISIONED',
                  AfterValue: 'PAY_PER_REQUEST'
                }
              }
            ]
          }
        }
      ],
      totalChanges: 2,
      truncated: false
    })

    const markdown = generateChangeSetMarkdown(changesSummary)

    expect(markdown).toContain('## 📋 CloudFormation Change Set')
    expect(markdown).toContain('**Summary:** 1 to add, 1 to replace')
    expect(markdown).toContain('<details>')
    expect(markdown).toContain('</details>')
    expect(markdown).toContain(
      '<summary>🟢 <strong>MyBucket</strong> <code>AWS::S3::Bucket</code></summary>'
    )
    expect(markdown).toContain(
      '<summary>🟡 <strong>MyTable</strong> <code>AWS::DynamoDB::Table</code></summary>'
    )
    expect(markdown).toContain('**Physical ID:** `my-table-123`')
    expect(markdown).toContain('⚠️ **This resource will be replaced**')
    expect(markdown).toContain(
      '**BillingMode:** `PROVISIONED` → `PAY_PER_REQUEST`'
    )
    expect(markdown).toContain('⚠️ Requires recreation: Always')
  })

  test('diffs Tags arrays correctly', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          Type: 'Resource',
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'MyParameter',
            ResourceType: 'AWS::SSM::Parameter',
            Replacement: 'False',
            Scope: ['Properties'],
            Details: [
              {
                Target: {
                  Attribute: 'Properties',
                  Name: 'Tags',
                  RequiresRecreation: 'Never',
                  BeforeValue: JSON.stringify([
                    { Key: 'Version', Value: 'v1' },
                    { Key: 'Team', Value: 'DevOps' },
                    { Key: 'Environment', Value: 'test' }
                  ]),
                  AfterValue: JSON.stringify([
                    { Key: 'Version', Value: 'v2' },
                    { Key: 'UpdateType', Value: 'InPlace' },
                    { Key: 'Environment', Value: 'production' }
                  ])
                }
              }
            ]
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    const markdown = generateChangeSetMarkdown(changesSummary)

    expect(markdown).toContain('**Tags:**')
    expect(markdown).toContain('**Tags.Environment:** `test` → `production`')
    expect(markdown).toContain('**Tags.Team:** `DevOps` → (removed)')
    expect(markdown).toContain('**Tags.UpdateType:** (added) → `InPlace`')
    expect(markdown).toContain('**Tags.Version:** `v1` → `v2`')
  })

  test('diffs nested objects correctly', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          Type: 'Resource',
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'MyResource',
            ResourceType: 'AWS::Custom::Resource',
            Replacement: 'False',
            Scope: ['Properties'],
            Details: [
              {
                Target: {
                  Attribute: 'Properties',
                  Name: 'Config',
                  RequiresRecreation: 'Never',
                  BeforeValue: JSON.stringify({
                    Setting: 'old',
                    Nested: { Value: 'a' }
                  }),
                  AfterValue: JSON.stringify({
                    Setting: 'new',
                    Nested: { Value: 'b' }
                  })
                }
              }
            ]
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    const markdown = generateChangeSetMarkdown(changesSummary)

    expect(markdown).toContain('**Config.Setting:** `old` → `new`')
    expect(markdown).toContain('**Config.Nested.Value:** `a` → `b`')
  })

  test('handles generic arrays as JSON strings', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          Type: 'Resource',
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'MyResource',
            ResourceType: 'AWS::Custom::Resource',
            Replacement: 'False',
            Scope: ['Properties'],
            Details: [
              {
                Target: {
                  Attribute: 'Properties',
                  Name: 'Items',
                  RequiresRecreation: 'Never',
                  BeforeValue: JSON.stringify(['a', 'b']),
                  AfterValue: JSON.stringify(['a', 'c'])
                }
              }
            ]
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    const markdown = generateChangeSetMarkdown(changesSummary)

    expect(markdown).toContain('**Items:**')
    expect(markdown).toContain('["a","b"]')
    expect(markdown).toContain('["a","c"]')
  })

  test('handles array additions and removals', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          Type: 'Resource',
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'MyResource',
            ResourceType: 'AWS::Custom::Resource',
            Replacement: 'False',
            Scope: ['Properties'],
            Details: [
              {
                Target: {
                  Attribute: 'Properties',
                  Name: 'NewList',
                  RequiresRecreation: 'Never',
                  AfterValue: JSON.stringify(['x', 'y'])
                }
              },
              {
                Target: {
                  Attribute: 'Properties',
                  Name: 'OldList',
                  RequiresRecreation: 'Never',
                  BeforeValue: JSON.stringify(['a', 'b'])
                }
              }
            ]
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    const markdown = generateChangeSetMarkdown(changesSummary)

    expect(markdown).toContain('**NewList:** (added) → `["x","y"]`')
    expect(markdown).toContain('**OldList:** `["a","b"]` → (removed)')
  })

  test('handles primitive value additions and removals', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          Type: 'Resource',
          ResourceChange: {
            Action: 'Modify',
            LogicalResourceId: 'MyResource',
            ResourceType: 'AWS::Custom::Resource',
            Replacement: 'False',
            Scope: ['Properties'],
            Details: [
              {
                Target: {
                  Attribute: 'Properties',
                  Name: 'NewProp',
                  RequiresRecreation: 'Never',
                  AfterValue: 'new-value'
                }
              },
              {
                Target: {
                  Attribute: 'Properties',
                  Name: 'OldProp',
                  RequiresRecreation: 'Never',
                  BeforeValue: 'old-value'
                }
              }
            ]
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    const markdown = generateChangeSetMarkdown(changesSummary)

    expect(markdown).toContain('**NewProp:** (added) → `new-value`')
    expect(markdown).toContain('**OldProp:** `old-value` → (removed)')
  })

  test('displays AfterContext for Add actions in console output', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          Type: 'Resource',
          ResourceChange: {
            Action: 'Add',
            LogicalResourceId: 'NewBucket',
            ResourceType: 'AWS::S3::Bucket',
            AfterContext:
              '{"BucketName":"my-bucket","Versioning":{"Status":"Enabled"}}'
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    displayChangeSet(changesSummary, 1, true)

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Properties:')
    )
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('BucketName')
    )
  })

  test('displays BeforeContext for Remove actions in console output', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          Type: 'Resource',
          ResourceChange: {
            Action: 'Remove',
            LogicalResourceId: 'OldBucket',
            ResourceType: 'AWS::S3::Bucket',
            BeforeContext: '{"BucketName":"old-bucket"}'
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    displayChangeSet(changesSummary, 1, true)

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Properties:')
    )
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('BucketName')
    )
  })

  test('handles invalid JSON in AfterContext gracefully', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          Type: 'Resource',
          ResourceChange: {
            Action: 'Add',
            LogicalResourceId: 'NewResource',
            ResourceType: 'AWS::Custom::Resource',
            AfterContext: 'invalid-json{'
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    displayChangeSet(changesSummary, 1, true)

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('invalid-json{')
    )
  })

  test('handles invalid JSON in BeforeContext gracefully', () => {
    const changesSummary = JSON.stringify({
      changes: [
        {
          Type: 'Resource',
          ResourceChange: {
            Action: 'Remove',
            LogicalResourceId: 'OldResource',
            ResourceType: 'AWS::Custom::Resource',
            BeforeContext: 'invalid-json{'
          }
        }
      ],
      totalChanges: 1,
      truncated: false
    })

    displayChangeSet(changesSummary, 1, true)

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('invalid-json{')
    )
  })
})
