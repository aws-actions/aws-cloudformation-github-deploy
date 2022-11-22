import { run, Inputs } from '../src/main'
import * as path from 'path'
import * as core from '@actions/core'
import * as fs from 'fs'
import * as aws from 'aws-sdk'

jest.mock('@actions/core')
jest.mock('fs', () => ({
  promises: {
    access: jest.fn()
  },
  readFileSync: jest.fn()
}))

const mockTemplate = `
AWSTemplateFormatVersion: "2010-09-09"
Metadata:
    LICENSE: MIT
Parameters:
    AdminEmail:
    Type: String
Resources:
    CFSNSSubscription:
    Type: AWS::SNS::Subscription
    Properties:
        Endpoint: !Ref AdminEmail
        Protocol: email
        TopicArn: !Ref CFSNSTopic
    CFSNSTopic:
    Type: AWS::SNS::Topic
Outputs:
    CFSNSTopicArn:
    Value: !Ref CFSNSTopic
`

const mockStackId =
  'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'

const mockCreateStack = jest.fn()
const mockUpdateStack = jest.fn()
const mockDescribeStacks = jest.fn()
const mockCreateChangeSet = jest.fn()
const mockDescribeChangeSet = jest.fn()
const mockDeleteChangeSet = jest.fn()
const mockExecuteChangeSet = jest.fn()
const mockCfnWaiter = jest.fn()
jest.mock('aws-sdk', () => {
  return {
    CloudFormation: jest.fn(() => ({
      createStack: mockCreateStack,
      updateStack: mockUpdateStack,
      describeStacks: mockDescribeStacks,
      createChangeSet: mockCreateChangeSet,
      describeChangeSet: mockDescribeChangeSet,
      deleteChangeSet: mockDeleteChangeSet,
      executeChangeSet: mockExecuteChangeSet,
      waitFor: mockCfnWaiter
    }))
  }
})

describe('Deploy CloudFormation Stack', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    const inputs: Inputs = {
      name: 'MockStack',
      template: 'template.yaml',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '0',
      'disable-rollback': '0',
      'timeout-in-minutes': '',
      'notification-arns': '',
      'role-arn': '',
      tags: '',
      'termination-protection': ''
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    process.env = Object.assign(process.env, { GITHUB_WORKSPACE: __dirname })

    jest.spyOn(fs, 'readFileSync').mockImplementation((pathInput, encoding) => {
      const { GITHUB_WORKSPACE = '' } = process.env

      if (encoding != 'utf8') {
        throw new Error(`Wrong encoding ${encoding}`)
      }

      if (pathInput == path.join(GITHUB_WORKSPACE, 'template.yaml')) {
        return mockTemplate
      }

      throw new Error(`Unknown path ${pathInput}`)
    })

    mockCreateStack.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.CreateChangeSetOutput> {
          return Promise.resolve({
            StackId: mockStackId
          })
        }
      }
    })

    mockUpdateStack.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.UpdateStackOutput> {
          return Promise.resolve({
            StackId: mockStackId
          })
        }
      }
    })

    mockCreateChangeSet.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.CreateChangeSetOutput> {
          return Promise.resolve({})
        }
      }
    })

    mockDescribeChangeSet.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.DescribeChangeSetOutput> {
          return Promise.resolve({})
        }
      }
    })

    mockDeleteChangeSet.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.DeleteChangeSetOutput> {
          return Promise.resolve({})
        }
      }
    })

    mockExecuteChangeSet.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.ExecuteChangeSetOutput> {
          return Promise.resolve({})
        }
      }
    })

    mockDescribeStacks
      .mockImplementationOnce(() => {
        const err: aws.AWSError = new Error(
          'The stack does not exist.'
        ) as aws.AWSError
        err.code = 'ValidationError'
        throw err
      })
      .mockImplementation(() => {
        return {
          promise(): Promise<aws.CloudFormation.Types.DescribeStacksOutput> {
            return Promise.resolve({
              Stacks: [
                {
                  StackId:
                    'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896',
                  Tags: [],
                  Outputs: [],
                  StackStatusReason: '',
                  CreationTime: new Date('2013-08-23T01:02:15.422Z'),
                  Capabilities: [],
                  StackName: 'MockStack',
                  StackStatus: 'CREATE_COMPLETE'
                }
              ]
            })
          }
        }
      })

    mockCfnWaiter.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.DescribeStacksOutput> {
          return Promise.resolve({})
        }
      }
    })
  })

  test('deploys the stack with template', async () => {
    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateBody: mockTemplate,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      DisableRollback: false,
      EnableTerminationProtection: false
    })
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'stack-id', mockStackId)
  })

  test('sets the stack outputs as action outputs', async () => {
    mockDescribeStacks.mockReset()
    mockDescribeStacks
      .mockImplementationOnce(() => {
        const err: aws.AWSError = new Error(
          'The stack does not exist.'
        ) as aws.AWSError
        err.code = 'ValidationError'
        throw err
      })
      .mockImplementation(() => {
        return {
          promise(): Promise<aws.CloudFormation.Types.DescribeStacksOutput> {
            return Promise.resolve({
              Stacks: [
                {
                  StackId:
                    'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896',
                  Tags: [],
                  Outputs: [
                    {
                      OutputKey: 'hello',
                      OutputValue: 'world'
                    },
                    {
                      OutputKey: 'foo',
                      OutputValue: 'bar'
                    }
                  ],
                  StackStatusReason: '',
                  CreationTime: new Date('2013-08-23T01:02:15.422Z'),
                  Capabilities: [],
                  StackName: 'MockStack',
                  StackStatus: 'CREATE_COMPLETE'
                }
              ]
            })
          }
        }
      })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateBody: mockTemplate,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      DisableRollback: false,
      EnableTerminationProtection: false
    })
    expect(core.setOutput).toHaveBeenCalledTimes(3)
    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'stack-id', mockStackId)
    expect(core.setOutput).toHaveBeenNthCalledWith(2, 'hello', 'world')
    expect(core.setOutput).toHaveBeenNthCalledWith(3, 'foo', 'bar')
  })

  test('deploys the stack with template url', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '1'
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateURL:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      TemplateBody: undefined,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      DisableRollback: false,
      EnableTerminationProtection: false
    })
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'stack-id', mockStackId)
  })

  test('deploys the stack with termination protection', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '1',
      'termination-protection': '1'
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateURL:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      TemplateBody: undefined,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      DisableRollback: false,
      EnableTerminationProtection: true
    })
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'stack-id', mockStackId)
  })

  test('deploys the stack with disabling rollback', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '1',
      'disable-rollback': '1'
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateURL:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      TemplateBody: undefined,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      DisableRollback: true,
      EnableTerminationProtection: false
    })
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'stack-id', mockStackId)
  })

  test('deploys the stack with Notification ARNs', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '1',
      'notification-arns':
        'arn:aws:sns:us-east-2:123456789012:MyTopic,arn:aws:sns:us-east-2:123456789012:MyTopic2'
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateURL:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      TemplateBody: undefined,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      NotificationARNs: [
        'arn:aws:sns:us-east-2:123456789012:MyTopic',
        'arn:aws:sns:us-east-2:123456789012:MyTopic2'
      ],
      DisableRollback: false,
      EnableTerminationProtection: false
    })
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'stack-id', mockStackId)
  })

  test('deploys the stack with Role ARN', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '1',
      'role-arn': 'arn:aws:iam::123456789012:role/my-role'
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateURL:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      TemplateBody: undefined,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      RoleARN: 'arn:aws:iam::123456789012:role/my-role',
      DisableRollback: false,
      EnableTerminationProtection: false
    })
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'stack-id', mockStackId)
  })

  test('deploys the stack with tags', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '1',
      tags: '[{"Key":"Test","Value":"Value"}]'
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateURL:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      TemplateBody: undefined,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      Tags: [{ Key: 'Test', Value: 'Value' }],
      DisableRollback: false,
      EnableTerminationProtection: false
    })
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'stack-id', mockStackId)
  })

  test('deploys the stack with timeout', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '1',
      'timeout-in-minutes': '10'
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateURL:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      TemplateBody: undefined,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      TimeoutInMinutes: 10,
      DisableRollback: false,
      EnableTerminationProtection: false
    })
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'stack-id', mockStackId)
  })

  test('successfully update the stack', async () => {
    mockDescribeStacks.mockReset()
    mockDescribeStacks.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.DescribeStacksOutput> {
          return Promise.resolve({
            Stacks: [
              {
                StackId:
                  'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896',
                Tags: [],
                Outputs: [],
                StackStatusReason: '',
                CreationTime: new Date('2013-08-23T01:02:15.422Z'),
                Capabilities: [],
                StackName: 'MockStack',
                StackStatus: 'CREATE_COMPLETE'
              }
            ]
          })
        }
      }
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenCalledTimes(0)
    expect(mockCreateChangeSet).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateBody: mockTemplate,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      ChangeSetName: 'MockStack-CS',
      ResourceType: undefined,
      RollbackConfiguration: undefined,
      NotificationARNs: undefined,
      RoleARN: undefined,
      Tags: undefined,
      TemplateURL: undefined,
      TimeoutInMinutes: undefined
    })
    expect(mockExecuteChangeSet).toHaveBeenNthCalledWith(1, {
      ChangeSetName: 'MockStack-CS',
      StackName: 'MockStack'
    })
    expect(mockCfnWaiter).toHaveBeenCalledTimes(2)
  })

  test('no execute change set on update the stack', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template: 'template.yaml',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-execute-changeset': '1'
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    mockDescribeStacks.mockReset()
    mockDescribeStacks.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.DescribeStacksOutput> {
          return Promise.resolve({
            Stacks: [
              {
                StackId:
                  'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896',
                Tags: [],
                Outputs: [],
                StackStatusReason: '',
                CreationTime: new Date('2013-08-23T01:02:15.422Z'),
                Capabilities: [],
                StackName: 'MockStack',
                StackStatus: 'CREATE_COMPLETE'
              }
            ]
          })
        }
      }
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenCalledTimes(0)
    expect(mockCreateChangeSet).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateBody: mockTemplate,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      ChangeSetName: 'MockStack-CS',
      ResourceType: undefined,
      RollbackConfiguration: undefined,
      NotificationARNs: undefined,
      RoleARN: undefined,
      Tags: undefined,
      TemplateURL: undefined,
      TimeoutInMinutes: undefined
    })
    expect(mockExecuteChangeSet).toHaveBeenCalledTimes(0)
    expect(mockCfnWaiter).toHaveBeenCalledTimes(1)
  })

  test('error is caught updating if create change fails', async () => {
    mockDescribeStacks.mockReset()
    mockDescribeStacks.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.DescribeStacksOutput> {
          return Promise.resolve({
            Stacks: [
              {
                StackId:
                  'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896',
                Tags: [],
                Outputs: [],
                StackStatusReason: '',
                CreationTime: new Date('2013-08-23T01:02:15.422Z'),
                Capabilities: [],
                StackName: 'MockStack',
                StackStatus: 'CREATE_COMPLETE',
                DisableRollback: false
              }
            ]
          })
        }
      }
    })

    mockDescribeChangeSet.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.DeleteChangeSetOutput> {
          return Promise.resolve({
            Changes: [],
            ChangeSetName: 'MockStack-CS',
            ChangeSetId:
              'arn:aws:cloudformation:us-west-2:123456789012:changeSet/my-change-set/4eca1a01-e285-xmpl-8026-9a1967bfb4b0',
            StackId: mockStackId,
            StackName: 'MockStack',
            Description: null,
            Parameters: null,
            CreationTime: '2019-10-02T05:20:56.651Z',
            ExecutionStatus: 'AVAILABLE',
            Status: 'FAILED',
            StatusReason: null,
            NotificationARNs: [],
            RollbackConfiguration: {},
            Capabilities: ['CAPABILITY_IAM'],
            Tags: null
          })
        }
      }
    })

    mockCfnWaiter.mockImplementation(() => {
      return {
        promise(): Promise<unknown> {
          return Promise.reject({})
        }
      }
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(1)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockCreateStack).toHaveBeenCalledTimes(0)
    expect(mockCreateChangeSet).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateBody: mockTemplate,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      ChangeSetName: 'MockStack-CS',
      ResourceTypes: undefined,
      RollbackConfiguration: undefined,
      NotificationARNs: undefined,
      RoleARN: undefined,
      Tags: undefined,
      TemplateURL: undefined,
      TimeoutInMinutes: undefined
    })
    expect(mockDeleteChangeSet).toHaveBeenNthCalledWith(1, {
      ChangeSetName: 'MockStack-CS',
      StackName: 'MockStack'
    })
    expect(mockExecuteChangeSet).toHaveBeenCalledTimes(0)
  })

  test('no error if updating fails with empty change set', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template: 'template.yaml',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '1'
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    mockDescribeStacks.mockReset()
    mockDescribeStacks.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.DescribeStacksOutput> {
          return Promise.resolve({
            Stacks: [
              {
                StackId:
                  'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896',
                Tags: [],
                Outputs: [],
                StackStatusReason: `The submitted information didn't contain changes`,
                CreationTime: new Date('2013-08-23T01:02:15.422Z'),
                Capabilities: [],
                StackName: 'MockStack',
                StackStatus: 'FAILED',
                DisableRollback: false
              }
            ]
          })
        }
      }
    })

    mockCfnWaiter.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.UpdateStackOutput> {
          return Promise.reject({})
        }
      }
    })

    mockDescribeChangeSet.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.CreateChangeSetOutput> {
          return Promise.resolve({
            Changes: [],
            ChangeSetName: 'MockStack-CS',
            ChangeSetId:
              'arn:aws:cloudformation:us-west-2:123456789012:changeSet/my-change-set/4eca1a01-e285-xmpl-8026-9a1967bfb4b0',
            StackId: mockStackId,
            StackName: 'MockStack',
            Description: null,
            Parameters: null,
            CreationTime: '2019-10-02T05:20:56.651Z',
            ExecutionStatus: 'AVAILABLE',
            Status: 'FAILED',
            StatusReason:
              "The submitted information didn't contain changes. Submit different information to create a change set.",
            NotificationARNs: [],
            RollbackConfiguration: {},
            Capabilities: ['CAPABILITY_IAM'],
            Tags: null
          })
        }
      }
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenCalledTimes(0)
    expect(mockCreateChangeSet).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateBody: mockTemplate,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      ChangeSetName: 'MockStack-CS',
      NotificationARNs: undefined,
      ResourceTypes: undefined,
      RollbackConfiguration: undefined,
      RoleARN: undefined,
      Tags: undefined,
      TemplateURL: undefined,
      TimeoutInMinutes: undefined
    })
    expect(mockDeleteChangeSet).toHaveBeenNthCalledWith(1, {
      ChangeSetName: 'MockStack-CS',
      StackName: 'MockStack'
    })
    expect(mockExecuteChangeSet).toHaveBeenCalledTimes(0)
  })

  test('no deleting change set if change set is empty', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template: 'template.yaml',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '1',
      'no-delete-failed-changeset': '1'
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    mockDescribeStacks.mockReset()
    mockDescribeStacks.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.DescribeStacksOutput> {
          return Promise.resolve({
            Stacks: [
              {
                StackId:
                  'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896',
                Tags: [],
                Outputs: [],
                StackStatusReason: `The submitted information didn't contain changes`,
                CreationTime: new Date('2013-08-23T01:02:15.422Z'),
                Capabilities: [],
                StackName: 'MockStack',
                StackStatus: 'FAILED',
                DisableRollback: false
              }
            ]
          })
        }
      }
    })

    mockCfnWaiter.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.UpdateStackOutput> {
          return Promise.reject({})
        }
      }
    })

    mockDescribeChangeSet.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.CreateChangeSetOutput> {
          return Promise.resolve({
            Changes: [],
            ChangeSetName: 'MockStack-CS',
            ChangeSetId:
              'arn:aws:cloudformation:us-west-2:123456789012:changeSet/my-change-set/4eca1a01-e285-xmpl-8026-9a1967bfb4b0',
            StackId: mockStackId,
            StackName: 'MockStack',
            Description: null,
            Parameters: null,
            CreationTime: '2019-10-02T05:20:56.651Z',
            ExecutionStatus: 'AVAILABLE',
            Status: 'FAILED',
            StatusReason:
              "The submitted information didn't contain changes. Submit different information to create a change set.",
            NotificationARNs: [],
            RollbackConfiguration: {},
            Capabilities: ['CAPABILITY_IAM'],
            Tags: null
          })
        }
      }
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenCalledTimes(0)
    expect(mockCreateChangeSet).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateBody: mockTemplate,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      ChangeSetName: 'MockStack-CS',
      NotificationARNs: undefined,
      ResourceTypes: undefined,
      RollbackConfiguration: undefined,
      RoleARN: undefined,
      Tags: undefined,
      TemplateURL: undefined,
      TimeoutInMinutes: undefined
    })
    expect(mockDeleteChangeSet).toHaveBeenCalledTimes(0)
    expect(mockExecuteChangeSet).toHaveBeenCalledTimes(0)
  })

  test('change set is not deleted if creating change set fails', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template: 'template.yaml',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-delete-failed-changeset': '1'
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    mockDescribeStacks.mockReset()
    mockDescribeStacks.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.DescribeStacksOutput> {
          return Promise.resolve({
            Stacks: [
              {
                StackId:
                  'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896',
                Tags: [],
                Outputs: [],
                StackStatusReason: '',
                CreationTime: new Date('2013-08-23T01:02:15.422Z'),
                Capabilities: [],
                StackName: 'MockStack',
                StackStatus: 'CREATE_COMPLETE',
                DisableRollback: false
              }
            ]
          })
        }
      }
    })

    mockDescribeChangeSet.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.DeleteChangeSetOutput> {
          return Promise.resolve({
            Changes: [],
            ChangeSetName: 'MockStack-CS',
            ChangeSetId:
              'arn:aws:cloudformation:us-west-2:123456789012:changeSet/my-change-set/4eca1a01-e285-xmpl-8026-9a1967bfb4b0',
            StackId: mockStackId,
            StackName: 'MockStack',
            Description: null,
            Parameters: null,
            CreationTime: '2019-10-02T05:20:56.651Z',
            ExecutionStatus: 'AVAILABLE',
            Status: 'FAILED',
            StatusReason: null,
            NotificationARNs: [],
            RollbackConfiguration: {},
            Capabilities: ['CAPABILITY_IAM'],
            Tags: null
          })
        }
      }
    })

    mockCfnWaiter.mockImplementation(() => {
      return {
        promise(): Promise<unknown> {
          return Promise.reject({})
        }
      }
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(1)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockCreateStack).toHaveBeenCalledTimes(0)
    expect(mockCreateChangeSet).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateBody: mockTemplate,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      ChangeSetName: 'MockStack-CS',
      ResourceTypes: undefined,
      RollbackConfiguration: undefined,
      NotificationARNs: undefined,
      RoleARN: undefined,
      Tags: undefined,
      TemplateURL: undefined,
      TimeoutInMinutes: undefined
    })
    expect(mockDeleteChangeSet).toHaveBeenCalledTimes(0)
    expect(mockExecuteChangeSet).toHaveBeenCalledTimes(0)
  })

  test('no error if updating fails with no updates to be performed', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template: 'template.yaml',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '1'
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    mockDescribeStacks.mockReset()
    mockDescribeStacks.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.DescribeStacksOutput> {
          return Promise.resolve({
            Stacks: [
              {
                StackId:
                  'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896',
                Tags: [],
                Outputs: [],
                StackStatusReason: '',
                CreationTime: new Date('2013-08-23T01:02:15.422Z'),
                Capabilities: [],
                StackName: 'MockStack',
                StackStatus: 'UPDATE_COMPLETE',
                DisableRollback: false
              }
            ]
          })
        }
      }
    })

    mockCfnWaiter.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.UpdateStackOutput> {
          return Promise.reject({})
        }
      }
    })

    mockDescribeChangeSet.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.CreateChangeSetOutput> {
          return Promise.resolve({
            Changes: [],
            ChangeSetName: 'MockStack-CS',
            ChangeSetId:
              'arn:aws:cloudformation:us-west-2:123456789012:changeSet/my-change-set/4eca1a01-e285-xmpl-8026-9a1967bfb4b0',
            StackId: mockStackId,
            StackName: 'MockStack',
            Description: null,
            Parameters: null,
            CreationTime: '2019-10-02T05:20:56.651Z',
            ExecutionStatus: 'AVAILABLE',
            Status: 'FAILED',
            StatusReason: 'No updates are to be performed',
            NotificationARNs: [],
            RollbackConfiguration: {},
            Capabilities: ['CAPABILITY_IAM'],
            Tags: null
          })
        }
      }
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(mockDescribeStacks).toHaveBeenCalledTimes(2)
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack'
    })
    expect(mockDescribeStacks).toHaveBeenNthCalledWith(2, {
      StackName: mockStackId
    })
    expect(mockCreateStack).toHaveBeenCalledTimes(0)
    expect(mockCreateChangeSet).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateBody: mockTemplate,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      ChangeSetName: 'MockStack-CS',
      NotificationARNs: undefined,
      ResourceTypes: undefined,
      RollbackConfiguration: undefined,
      RoleARN: undefined,
      Tags: undefined,
      TemplateURL: undefined,
      TimeoutInMinutes: undefined
    })
    expect(mockDeleteChangeSet).toHaveBeenNthCalledWith(1, {
      ChangeSetName: 'MockStack-CS',
      StackName: 'MockStack'
    })
    expect(mockExecuteChangeSet).toHaveBeenCalledTimes(0)
  })

  test('error is caught by core.setFailed', async () => {
    mockDescribeStacks.mockReset()
    mockDescribeStacks.mockImplementation(() => {
      throw new Error()
    })

    await run()

    expect(core.setFailed).toBeCalled()
  })
})
