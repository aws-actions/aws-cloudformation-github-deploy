import { run, Inputs } from '../src/main'
import * as path from 'path'
import * as core from '@actions/core'
import fs, { PathLike } from 'fs'
import {
  CloudFormationClient,
  StackStatus,
  ChangeSetStatus,
  StackNotFoundException,
  CreateChangeSetCommand,
  DescribeChangeSetCommand,
  DeleteChangeSetCommand,
  ExecuteChangeSetCommand,
  DescribeStacksCommand,
  CreateStackCommand
} from '@aws-sdk/client-cloudformation'
import { mockClient } from 'aws-sdk-client-mock'
import { FileHandle } from 'fs/promises'
import 'aws-sdk-client-mock-jest'

jest.mock('@actions/core')
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn()
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

const mockCfnClient = mockClient(CloudFormationClient)

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

    jest
      .spyOn(fs.promises, 'readFile')
      .mockImplementation(
        (
          filePath: FileHandle | PathLike,
          options?:
            | (fs.BaseEncodingOptions & { flag?: fs.OpenMode | undefined })
            | BufferEncoding
            | null
            | undefined
        ): Promise<string> => {
          if (options == undefined || options == null) {
            throw new Error(`Provide encoding`)
          }
          if (options != 'utf8') {
            throw new Error(`Wrong encoding ${options}`)
          }

          return Promise.resolve('')
        }
      )

    mockCfnClient
      .reset()
      .on(CreateChangeSetCommand)
      .resolves({
        StackId: mockStackId
      })
      .on(CreateStackCommand)
      .resolves({
        StackId: mockStackId
      })
      .on(CreateChangeSetCommand)
      .resolves({})
      .on(DescribeChangeSetCommand)
      .resolves({
        Status: ChangeSetStatus.CREATE_COMPLETE
      })
      .on(DeleteChangeSetCommand)
      .resolves({})
      .on(ExecuteChangeSetCommand)
      .resolves({})
      .on(DescribeStacksCommand)
      .rejectsOnce(
        new StackNotFoundException({
          message: 'The stack does not exist.',
          $metadata: {}
        })
      )
      .resolves({
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
            StackStatus: StackStatus.CREATE_COMPLETE
          }
        ]
      })
  })

  test('deploys the stack with template', async () => {
    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 3)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(2, CreateStackCommand, {
      Capabilities: ['CAPABILITY_IAM'],
      DisableRollback: false,
      EnableTerminationProtection: false,
      NotificationARNs: undefined,
      Parameters: [
        {
          ParameterKey: 'AdminEmail',
          ParameterValue: 'no-reply@amazon.com'
        }
      ],
      ResourceTypes: undefined,
      RoleARN: undefined,
      RollbackConfiguration: undefined,
      StackName: 'MockStack',
      Tags: undefined,
      TemplateBody: mockTemplate,
      TemplateURL: undefined,
      TimeoutInMinutes: undefined
    })
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'stack-id', mockStackId)
  })

  test('sets the stack outputs as action outputs', async () => {
    mockCfnClient
      .reset()
      .on(DescribeStacksCommand)
      .rejectsOnce(
        new StackNotFoundException({
          message: 'The stack does not exist.',
          $metadata: {}
        })
      )
      .resolves({
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
      .on(CreateStackCommand)
      .resolves({
        StackId: mockStackId
      })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 3)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(2, CreateStackCommand, {
      Capabilities: ['CAPABILITY_IAM'],
      DisableRollback: false,
      EnableTerminationProtection: false,
      NotificationARNs: undefined,
      Parameters: [
        {
          ParameterKey: 'AdminEmail',
          ParameterValue: 'no-reply@amazon.com'
        }
      ],
      ResourceTypes: undefined,
      RoleARN: undefined,
      RollbackConfiguration: undefined,
      StackName: 'MockStack',
      Tags: undefined,
      TemplateBody: mockTemplate,
      TemplateURL: undefined,
      TimeoutInMinutes: undefined
    })
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
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
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 3)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(2, CreateStackCommand, {
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
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
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
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 3)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(2, CreateStackCommand, {
      Capabilities: ['CAPABILITY_IAM'],
      DisableRollback: false,
      EnableTerminationProtection: true,
      NotificationARNs: undefined,
      Parameters: [
        {
          ParameterKey: 'AdminEmail',
          ParameterValue: 'no-reply@amazon.com'
        }
      ],
      ResourceTypes: undefined,
      RoleARN: undefined,
      RollbackConfiguration: undefined,
      StackName: 'MockStack',
      Tags: undefined,
      TemplateBody: undefined,
      TemplateURL:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      TimeoutInMinutes: undefined
    })
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
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
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 3)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(2, CreateStackCommand, {
      Capabilities: ['CAPABILITY_IAM'],
      DisableRollback: true,
      EnableTerminationProtection: false,
      NotificationARNs: undefined,
      Parameters: [
        {
          ParameterKey: 'AdminEmail',
          ParameterValue: 'no-reply@amazon.com'
        }
      ],
      ResourceTypes: undefined,
      RoleARN: undefined,
      RollbackConfiguration: undefined,
      StackName: 'MockStack',
      Tags: undefined,
      TemplateBody: undefined,
      TemplateURL:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      TimeoutInMinutes: undefined
    })
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
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
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 3)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(2, CreateStackCommand, {
      Capabilities: ['CAPABILITY_IAM'],
      DisableRollback: false,
      EnableTerminationProtection: false,
      NotificationARNs: [
        'arn:aws:sns:us-east-2:123456789012:MyTopic',
        'arn:aws:sns:us-east-2:123456789012:MyTopic2'
      ],
      Parameters: [
        {
          ParameterKey: 'AdminEmail',
          ParameterValue: 'no-reply@amazon.com'
        }
      ],
      ResourceTypes: undefined,
      RoleARN: undefined,
      RollbackConfiguration: undefined,
      StackName: 'MockStack',
      Tags: undefined,
      TemplateBody: undefined,
      TemplateURL:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      TimeoutInMinutes: undefined
    })
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
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
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 3)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(2, CreateStackCommand, {
      Capabilities: ['CAPABILITY_IAM'],
      DisableRollback: false,
      EnableTerminationProtection: false,
      NotificationARNs: undefined,
      Parameters: [
        {
          ParameterKey: 'AdminEmail',
          ParameterValue: 'no-reply@amazon.com'
        }
      ],
      ResourceTypes: undefined,
      RoleARN: 'arn:aws:iam::123456789012:role/my-role',
      RollbackConfiguration: undefined,
      StackName: 'MockStack',
      Tags: undefined,
      TemplateBody: undefined,
      TemplateURL:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      TimeoutInMinutes: undefined
    })
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
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
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 3)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(2, CreateStackCommand, {
      Capabilities: ['CAPABILITY_IAM'],
      DisableRollback: false,
      EnableTerminationProtection: false,
      NotificationARNs: undefined,
      Parameters: [
        {
          ParameterKey: 'AdminEmail',
          ParameterValue: 'no-reply@amazon.com'
        }
      ],
      ResourceTypes: undefined,
      RoleARN: undefined,
      RollbackConfiguration: undefined,
      StackName: 'MockStack',
      Tags: [{ Key: 'Test', Value: 'Value' }],
      TemplateBody: undefined,
      TemplateURL:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      TimeoutInMinutes: undefined
    })
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
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
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 3)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(2, CreateStackCommand, {
      Capabilities: ['CAPABILITY_IAM'],
      DisableRollback: false,
      EnableTerminationProtection: false,
      NotificationARNs: undefined,
      Parameters: [
        {
          ParameterKey: 'AdminEmail',
          ParameterValue: 'no-reply@amazon.com'
        }
      ],
      ResourceTypes: undefined,
      RoleARN: undefined,
      RollbackConfiguration: undefined,
      StackName: 'MockStack',
      Tags: undefined,
      TemplateBody: undefined,
      TemplateURL:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      TimeoutInMinutes: 10
    })
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'stack-id', mockStackId)
  })

  test('successfully update the stack', async () => {
    mockCfnClient
      .reset()
      .on(DescribeStacksCommand)
      .resolvesOnce({
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
      .resolves({
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
            StackStatus: StackStatus.UPDATE_COMPLETE
          }
        ]
      })
      .on(CreateChangeSetCommand)
      .resolves({})
      .on(ExecuteChangeSetCommand)
      .resolves({})
      .on(DescribeChangeSetCommand)
      .resolves({ Status: ChangeSetStatus.CREATE_COMPLETE })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 3)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      2,
      CreateChangeSetCommand,
      {
        Capabilities: ['CAPABILITY_IAM'],
        NotificationARNs: undefined,
        Parameters: [
          {
            ParameterKey: 'AdminEmail',
            ParameterValue: 'no-reply@amazon.com'
          }
        ],
        ResourceTypes: undefined,
        RoleARN: undefined,
        RollbackConfiguration: undefined,
        StackName: 'MockStack',
        Tags: undefined,
        TemplateBody: mockTemplate,
        TemplateURL: undefined
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      4,
      ExecuteChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      5,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      6,
      DescribeStacksCommand,
      {
        StackName:
          'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
      }
    )
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

    mockCfnClient
      .reset()
      .on(DescribeStacksCommand)
      .resolves({
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
      .on(CreateChangeSetCommand)
      .resolves({})
      .on(ExecuteChangeSetCommand)
      .resolves({})
      .on(DescribeChangeSetCommand)
      .resolves({ Status: ChangeSetStatus.CREATE_COMPLETE })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 2)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      2,
      CreateChangeSetCommand,
      {
        Capabilities: ['CAPABILITY_IAM'],
        NotificationARNs: undefined,
        Parameters: [
          {
            ParameterKey: 'AdminEmail',
            ParameterValue: 'no-reply@amazon.com'
          }
        ],
        ResourceTypes: undefined,
        RoleARN: undefined,
        RollbackConfiguration: undefined,
        StackName: 'MockStack',
        Tags: undefined,
        TemplateBody: mockTemplate,
        TemplateURL: undefined
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      4,
      DescribeStacksCommand,
      {
        StackName:
          'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateStackCommand, 0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 0)
  })

  test('error is caught updating if create change fails', async () => {
    mockCfnClient
      .reset()
      .on(DescribeStacksCommand)
      .resolves({
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
      .on(DeleteChangeSetCommand)
      .resolves({})
      .on(DescribeChangeSetCommand)
      .resolves({
        Status: ChangeSetStatus.FAILED
      })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 1)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateStackCommand, 0)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      2,
      CreateChangeSetCommand,
      {
        Capabilities: ['CAPABILITY_IAM'],
        NotificationARNs: undefined,
        Parameters: [
          {
            ParameterKey: 'AdminEmail',
            ParameterValue: 'no-reply@amazon.com'
          }
        ],
        ResourceTypes: undefined,
        RoleARN: undefined,
        RollbackConfiguration: undefined,
        StackName: 'MockStack',
        Tags: undefined,
        TemplateBody: mockTemplate,
        TemplateURL: undefined
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      4,
      DescribeChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      5,
      DeleteChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 0)
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

    mockCfnClient
      .reset()
      .on(DescribeStacksCommand)
      .resolvesOnce({
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
            StackStatus: StackStatus.CREATE_FAILED,
            DisableRollback: false
          }
        ]
      })
      .resolves({
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
            StackStatus: StackStatus.UPDATE_ROLLBACK_COMPLETE,
            DisableRollback: false
          }
        ]
      })
      .on(DescribeChangeSetCommand)
      .resolves({
        Status: ChangeSetStatus.FAILED,
        StatusReason:
          "The submitted information didn't contain changes. Submit different information to create a change set."
      })
      .on(CreateChangeSetCommand)
      .resolves({
        Id: 'arn:aws:cloudformation:us-west-2:123456789012:changeSet/my-change-set/4eca1a01-e285-xmpl-8026-9a1967bfb4b0'
      })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 2)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateStackCommand, 0)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      2,
      CreateChangeSetCommand,
      {
        Capabilities: ['CAPABILITY_IAM'],
        NotificationARNs: undefined,
        Parameters: [
          {
            ParameterKey: 'AdminEmail',
            ParameterValue: 'no-reply@amazon.com'
          }
        ],
        ResourceTypes: undefined,
        RoleARN: undefined,
        RollbackConfiguration: undefined,
        StackName: 'MockStack',
        Tags: undefined,
        TemplateBody: mockTemplate,
        TemplateURL: undefined
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      4,
      DescribeChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      5,
      DeleteChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 0)
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

    mockCfnClient
      .reset()
      .on(DescribeStacksCommand)
      .resolves({
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
            StackStatus: StackStatus.UPDATE_FAILED,
            DisableRollback: false
          }
        ]
      })
      .on(DescribeChangeSetCommand)
      .resolves({
        Status: ChangeSetStatus.FAILED,
        StatusReason:
          "The submitted information didn't contain changes. Submit different information to create a change set."
      })
      .on(CreateChangeSetCommand)
      .resolves({
        Id: 'arn:aws:cloudformation:us-west-2:123456789012:changeSet/my-change-set/4eca1a01-e285-xmpl-8026-9a1967bfb4b0'
      })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 2)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateStackCommand, 0)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      2,
      CreateChangeSetCommand,
      {
        Capabilities: ['CAPABILITY_IAM'],
        NotificationARNs: undefined,
        Parameters: [
          {
            ParameterKey: 'AdminEmail',
            ParameterValue: 'no-reply@amazon.com'
          }
        ],
        ResourceTypes: undefined,
        RoleARN: undefined,
        RollbackConfiguration: undefined,
        StackName: 'MockStack',
        Tags: undefined,
        TemplateBody: mockTemplate,
        TemplateURL: undefined
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      4,
      DescribeChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DeleteChangeSetCommand, 0)
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

    mockCfnClient.reset()
    mockCfnClient
      .on(DescribeStacksCommand)
      .resolves({
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
      .on(DescribeChangeSetCommand)
      .resolves({
        Status: ChangeSetStatus.FAILED,
        StatusReason: ''
      })
      .on(CreateChangeSetCommand)
      .resolves({
        Id: 'arn:aws:cloudformation:us-west-2:123456789012:changeSet/my-change-set/4eca1a01-e285-xmpl-8026-9a1967bfb4b0'
      })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 1)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateStackCommand, 0)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      2,
      CreateChangeSetCommand,
      {
        Capabilities: ['CAPABILITY_IAM'],
        NotificationARNs: undefined,
        Parameters: [
          {
            ParameterKey: 'AdminEmail',
            ParameterValue: 'no-reply@amazon.com'
          }
        ],
        ResourceTypes: undefined,
        RoleARN: undefined,
        RollbackConfiguration: undefined,
        StackName: 'MockStack',
        Tags: undefined,
        TemplateBody: mockTemplate,
        TemplateURL: undefined
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      4,
      DescribeChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DeleteChangeSetCommand, 0)
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

    mockCfnClient
      .reset()
      .on(DescribeStacksCommand)
      .resolves({
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
      .on(DescribeChangeSetCommand)
      .resolves({
        Status: ChangeSetStatus.FAILED,
        StatusReason: 'No updates are to be performed'
      })
      .on(CreateChangeSetCommand)
      .resolves({
        Id: 'arn:aws:cloudformation:us-west-2:123456789012:changeSet/my-change-set/4eca1a01-e285-xmpl-8026-9a1967bfb4b0'
      })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 2)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateStackCommand, 0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      2,
      CreateChangeSetCommand,
      {
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
        TemplateURL: undefined
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      3,
      DescribeChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      4,
      DescribeChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      5,
      DeleteChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      6,
      DescribeStacksCommand,
      {
        StackName:
          'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 0)
  })

  test('error is caught by core.setFailed', async () => {
    mockCfnClient.reset().on(DescribeStacksCommand).rejects(new Error())

    await run()

    expect(core.setFailed).toBeCalled()
  })

  test('deploy using a custom change-set name', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template: 'template.yaml',
      capabilities: 'CAPABILITY_IAM, CAPABILITY_AUTO_EXPAND',
      'change-set-name': 'Build-213123123-CS',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '1'
    }

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    mockCfnClient
      .reset()
      .on(DescribeStacksCommand)
      .resolves({
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
      .resolves({
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
            StackStatus: StackStatus.UPDATE_COMPLETE
          }
        ]
      })
      .on(CreateChangeSetCommand)
      .resolves({})
      .on(ExecuteChangeSetCommand)
      .resolves({})
      .on(DescribeChangeSetCommand)
      .resolves({ Status: ChangeSetStatus.CREATE_COMPLETE })

    await run()
    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      2,
      CreateChangeSetCommand,
      {
        StackName: 'MockStack',
        TemplateBody: mockTemplate,
        Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_AUTO_EXPAND'],
        Parameters: [
          { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
        ],
        ChangeSetName: 'Build-213123123-CS',
        NotificationARNs: undefined,
        ResourceTypes: undefined,
        RollbackConfiguration: undefined,
        RoleARN: undefined,
        Tags: undefined,
        TemplateURL: undefined
      }
    )
  })
})
