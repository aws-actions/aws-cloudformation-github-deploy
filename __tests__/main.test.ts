import { run, Inputs } from '../src/main'
import * as path from 'path'
import * as core from '@actions/core'
import fs, { PathLike } from 'fs'
import {
  CloudFormationClient,
  CloudFormationServiceException,
  StackStatus,
  ChangeSetStatus,
  CreateChangeSetCommand,
  DescribeChangeSetCommand,
  DeleteChangeSetCommand,
  ExecuteChangeSetCommand,
  DescribeStacksCommand
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
jest.mock('../src/event-streaming', () => ({
  EventMonitorImpl: jest.fn().mockImplementation(() => ({
    startMonitoring: jest.fn().mockResolvedValue(undefined),
    stopMonitoring: jest.fn(),
    isMonitoring: jest.fn().mockReturnValue(false)
  }))
}))

const oldEnv = process.env

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

// Helper function to create complete inputs
const createInputs = (overrides: Partial<Inputs> = {}): Inputs => ({
  mode: 'create-and-execute',
  name: 'MockStack',
  template: 'template.yaml',
  capabilities: 'CAPABILITY_IAM',
  'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
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
  'execute-change-set-id': '',
  ...overrides
})

describe('Deploy CloudFormation Stack', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    process.env = { ...oldEnv }

    const inputs = createInputs()

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
            | (fs.EncodingOption & { flag?: fs.OpenMode | undefined })
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
      .on(CreateChangeSetCommand)
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
        new CloudFormationServiceException({
          name: 'ValidationError',
          message: 'Stack with id MockStack does not exist',
          $fault: 'client',
          $metadata: {
            attempts: 1,
            cfId: undefined,
            extendedRequestId: undefined,
            httpStatusCode: 400,
            requestId: '00000000-0000-0000-0000-000000000000',
            totalRetryDelay: 0
          }
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

  afterAll(() => {
    process.env = { ...oldEnv }
  })

  test('deploys the stack with template from relative path', async () => {
    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 4)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 1)
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(
      1,
      'stack-id',
      'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
    )
  })

  test('deploys the stack with template from absolute path', async () => {
    const inputs = createInputs({
      template: `${process.env.GITHUB_WORKSPACE}/template.yaml`
    })

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 4)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(core.setOutput).toHaveBeenNthCalledWith(
      1,
      'stack-id',
      'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
    )
  })

  // This seems inappropriate, but we are adding a test for the expected behavior
  // if there is no valid reason for StackId to be empty, then the code should
  // be updated to throw an error instead of defaulting to UNKNOWN
  test('update the stack by name only, and output an UNKNOWN stack ID', async () => {
    mockCfnClient
      .reset()
      .on(DescribeStacksCommand)
      .resolvesOnce({
        Stacks: [
          {
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
      .resolvesOnce({ Status: ChangeSetStatus.CREATE_COMPLETE })
      .resolvesOnce({
        Status: ChangeSetStatus.CREATE_COMPLETE,
        Changes: [],
        ChangeSetId: 'test-changeset-id',
        ChangeSetName: 'MockStack-CS'
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
      5,
      ExecuteChangeSetCommand,
      {
        ChangeSetName: 'MockStack-CS',
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      6,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'stack-id', 'MockStack')
  })

  test('deploys the stack with template via a proxy', async () => {
    const inputs = createInputs({
      'http-proxy': 'http://localhost:8080'
    })

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 4)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 1)
    expect(core.setOutput).toHaveBeenNthCalledWith(
      1,
      'stack-id',
      'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
    )
  })

  test('sets the stack outputs as action outputs', async () => {
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
            StackStatus: 'UPDATE_COMPLETE'
          }
        ]
      })
      .on(CreateChangeSetCommand)
      .resolves({
        StackId: mockStackId
      })
      .on(DescribeChangeSetCommand)
      .resolvesOnce({
        Status: ChangeSetStatus.CREATE_COMPLETE
      })
      .resolvesOnce({
        Status: ChangeSetStatus.CREATE_COMPLETE,
        Changes: []
      })
      .on(ExecuteChangeSetCommand)
      .resolves({})

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 4)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 1)
  }, 15000)

  test('deploys the stack with template url', async () => {
    const inputs = createInputs({
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW'
    })

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 4)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 1)
    expect(core.setOutput).toHaveBeenNthCalledWith(
      1,
      'stack-id',
      'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
    )
  })

  test('deploys the stack with termination protection', async () => {
    const inputs = createInputs({
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      'fail-on-empty-changeset': '0',
      'termination-protection': '1'
    })

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 4)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 1)
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(
      1,
      'stack-id',
      'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
    )
  })

  test('deploys the stack with disabling rollback', async () => {
    const inputs = createInputs({
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      'fail-on-empty-changeset': '0',
      'disable-rollback': '1'
    })

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 4)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 1)
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(
      1,
      'stack-id',
      'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
    )
  })

  test('deploys the stack with Notification ARNs', async () => {
    const inputs = createInputs({
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      'fail-on-empty-changeset': '0',
      'notification-arns':
        'arn:aws:sns:us-east-2:123456789012:MyTopic,arn:aws:sns:us-east-2:123456789012:MyTopic2'
    })

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 4)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 1)
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(
      1,
      'stack-id',
      'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
    )
  })

  test('deploys the stack with Role ARN', async () => {
    const inputs = createInputs({
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      'fail-on-empty-changeset': '0',
      'role-arn': 'arn:aws:iam::123456789012:role/my-role'
    })

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 4)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 1)
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(
      1,
      'stack-id',
      'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
    )
  })

  test('deploys the stack with tags', async () => {
    const inputs = createInputs({
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      'fail-on-empty-changeset': '0',
      tags: '[{"Key":"Test","Value":"Value"}]'
    })

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 4)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 1)
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(
      1,
      'stack-id',
      'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
    )
  })

  test('deploys the stack with timeout', async () => {
    const inputs = createInputs({
      template:
        'https://s3.amazonaws.com/templates/myTemplate.template?versionId=123ab1cdeKdOW5IH4GAcYbEngcpTJTDW',
      'fail-on-empty-changeset': '0',
      'timeout-in-minutes': '10'
    })

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 4)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 1)
    expect(core.setOutput).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenNthCalledWith(
      1,
      'stack-id',
      'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
    )
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
      .resolvesOnce({ Status: ChangeSetStatus.CREATE_COMPLETE })
      .resolvesOnce({
        Status: ChangeSetStatus.CREATE_COMPLETE,
        Changes: [],
        ChangeSetId: 'test-changeset-id',
        ChangeSetName: 'MockStack-CS'
      })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 4)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 1)
  })

  test('no execute change set on update the stack', async () => {
    const inputs = createInputs({
      'no-execute-changeset': '1'
    })

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
      .resolvesOnce({ Status: ChangeSetStatus.CREATE_COMPLETE })
      .resolvesOnce({
        Status: ChangeSetStatus.CREATE_COMPLETE,
        Changes: [],
        ChangeSetId: 'test-changeset-id',
        ChangeSetName: 'MockStack-CS'
      })

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
      5,
      DescribeStacksCommand,
      {
        StackName:
          'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 0)
  })

  test('error is caught if CloudFormation throws an unexpected Service Exception', async () => {
    const cause = new CloudFormationServiceException({
      name: 'CloudFormationServiceException',
      $fault: 'server',
      $metadata: {
        httpStatusCode: 500
      }
    })

    mockCfnClient.reset().onAnyCommand().rejects(cause)

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 0)
  })

  // Oh, wicked, bad, naughty, evil Zoot!
  test('error is caught if CloudFormation acts unexpectedly', async () => {
    mockCfnClient.on(DescribeStacksCommand).resolvesOnce({})

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 0)
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
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 0)
  })

  test('no error if updating fails with empty change set', async () => {
    const inputs = createInputs({
      'fail-on-empty-changeset': '0'
    })

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
        StatusReason: "The submitted information didn't contain changes"
      })
      .on(CreateChangeSetCommand)
      .resolves({
        Id: 'arn:aws:cloudformation:us-west-2:123456789012:changeSet/my-change-set/4eca1a01-e285-xmpl-8026-9a1967bfb4b0'
      })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 2)
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 0)
  })

  test('error if noFailOnEmptyChangeSet but updating fails with empty change set and unexpected error message', async () => {
    const inputs = createInputs({
      'fail-on-empty-changeset': '0'
    })

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
        StatusReason: 'Something very odd occurred. See me after class.'
      })
      .on(CreateChangeSetCommand)
      .resolves({
        Id: 'arn:aws:cloudformation:us-west-2:123456789012:changeSet/my-change-set/4eca1a01-e285-xmpl-8026-9a1967bfb4b0'
      })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 1)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
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
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 0)
  })

  test('error if noFailOnEmptyChangeSet but updating fails with empty change set but no reason is given', async () => {
    const inputs = createInputs({
      'fail-on-empty-changeset': '0'
    })

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
        Status: ChangeSetStatus.FAILED
      })
      .on(CreateChangeSetCommand)
      .resolves({
        Id: 'arn:aws:cloudformation:us-west-2:123456789012:changeSet/my-change-set/4eca1a01-e285-xmpl-8026-9a1967bfb4b0'
      })

    await run()

    expect(core.setFailed).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 1)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
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
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 0)
  })

  test('no deleting change set if change set is empty', async () => {
    const inputs = createInputs({
      'fail-on-empty-changeset': '0',
      'no-delete-failed-changeset': '1'
    })

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
    expect(core.setOutput).toHaveBeenCalledTimes(6)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 2)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
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
    const inputs = createInputs({
      'no-delete-failed-changeset': '1'
    })

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
    expect(mockCfnClient).toHaveReceivedCommandTimes(CreateChangeSetCommand, 1)
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
    const inputs = createInputs({
      'fail-on-empty-changeset': '0'
    })

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
            StackStatus: StackStatus.UPDATE_COMPLETE,
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
    expect(core.setOutput).toHaveBeenCalledTimes(6)
    expect(mockCfnClient).toHaveReceivedCommandTimes(DescribeStacksCommand, 2)
    expect(mockCfnClient).toHaveReceivedNthCommandWith(
      1,
      DescribeStacksCommand,
      {
        StackName: 'MockStack'
      }
    )
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
    expect(mockCfnClient).toHaveReceivedCommandTimes(ExecuteChangeSetCommand, 0)
  })

  test('error is caught by core.setFailed', async () => {
    mockCfnClient.reset().on(DescribeStacksCommand).rejects(new Error())

    await run()

    expect(core.setFailed).toHaveBeenCalled()
  })

  test('deploy using a custom change-set name', async () => {
    const inputs = createInputs({
      capabilities: 'CAPABILITY_IAM, CAPABILITY_AUTO_EXPAND',
      'change-set-name': 'Build-213123123-CS',
      'fail-on-empty-changeset': '0'
    })

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

  it('create-only mode creates change set without executing', async () => {
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      const inputs = createInputs({
        mode: 'create-only'
      })
      return inputs[name]
    })

    mockCfnClient
      .reset()
      .on(DescribeStacksCommand)
      .resolves({
        Stacks: [
          {
            StackId: mockStackId,
            StackName: 'MockStack',
            StackStatus: StackStatus.CREATE_COMPLETE,
            CreationTime: new Date(),
            Tags: [],
            Outputs: []
          }
        ]
      })
      .on(CreateChangeSetCommand)
      .resolves({ Id: 'test-changeset-id' })
      .on(DescribeChangeSetCommand)
      .resolves({
        ChangeSetId: 'test-changeset-id',
        ChangeSetName: 'test-changeset',
        Status: ChangeSetStatus.CREATE_COMPLETE,
        Changes: [{ Type: 'Resource' }]
      })

    await run()
    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandWith(CreateChangeSetCommand, {
      StackName: 'MockStack'
    })
    expect(mockCfnClient).not.toHaveReceivedCommand(ExecuteChangeSetCommand)
    expect(core.setOutput).toHaveBeenCalledWith(
      'change-set-id',
      'test-changeset-id'
    )
    expect(core.setOutput).toHaveBeenCalledWith('has-changes', 'true')
  })

  it('execute-only mode executes existing change set', async () => {
    const changeSetId =
      'arn:aws:cloudformation:us-east-1:123456789012:changeSet/test-cs/abc123'

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      const inputs = createInputs({
        mode: 'execute-only',
        'execute-change-set-id': changeSetId
      })
      return inputs[name]
    })

    mockCfnClient
      .reset()
      .on(ExecuteChangeSetCommand)
      .resolves({})
      .on(DescribeStacksCommand)
      .resolves({
        Stacks: [
          {
            StackId: mockStackId,
            StackName: 'MockStack',
            StackStatus: StackStatus.UPDATE_COMPLETE,
            CreationTime: new Date(),
            Tags: [],
            Outputs: []
          }
        ]
      })

    await run()
    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(mockCfnClient).toHaveReceivedCommandWith(ExecuteChangeSetCommand, {
      ChangeSetName: changeSetId,
      StackName: 'MockStack'
    })
    expect(mockCfnClient).not.toHaveReceivedCommand(CreateChangeSetCommand)
    expect(core.setOutput).toHaveBeenCalledWith('stack-id', mockStackId)
  })

  it('create-only mode with empty change set', async () => {
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      const inputs = createInputs({
        mode: 'create-only',
        'fail-on-empty-changeset': '0'
      })
      return inputs[name]
    })

    mockCfnClient
      .reset()
      .on(DescribeStacksCommand)
      .resolves({
        Stacks: [
          {
            StackId: mockStackId,
            StackName: 'MockStack',
            StackStatus: StackStatus.CREATE_COMPLETE,
            CreationTime: new Date(),
            Tags: [],
            Outputs: []
          }
        ]
      })
      .on(CreateChangeSetCommand)
      .resolves({ Id: 'test-changeset-id' })
      .on(DescribeChangeSetCommand)
      .resolves({
        Status: ChangeSetStatus.FAILED,
        StatusReason: "The submitted information didn't contain changes."
      })
      .on(DeleteChangeSetCommand)
      .resolves({})

    await run()
    expect(core.setFailed).toHaveBeenCalledTimes(0)
    expect(core.setOutput).toHaveBeenCalledWith('has-changes', 'false')
    expect(core.setOutput).toHaveBeenCalledWith('changes-count', '0')
  })
})
