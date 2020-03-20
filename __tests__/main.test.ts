import { run, Inputs } from '../src/main';
import * as path from 'path';
import * as core from '@actions/core';
import * as fs from 'fs';
import * as aws from 'aws-sdk';

jest.mock('@actions/core');
jest.mock('fs');

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
`;

const mockStackId =
  'arn:aws:cloudformation:us-east-1:123456789012:stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896';

const mockCreateStack = jest.fn();
const mockUpdateStack = jest.fn();
const mockDescribeStacks = jest.fn();
const mockCreateChangeSet = jest.fn();
const mockDescribeChangeSet = jest.fn();
const mockDeleteChangeSet = jest.fn();
const mockExecuteChangeSet = jest.fn();
const mockCfnWaiter = jest.fn();
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
  };
});

describe('Deploy CloudFormation Stack', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const inputs: Inputs = {
      name: 'MockStack',
      template: 'template.yaml',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '0'
    };

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name];
    });

    process.env = Object.assign(process.env, { GITHUB_WORKSPACE: __dirname });

    jest.spyOn(fs, 'readFileSync').mockImplementation((pathInput, encoding) => {
      const { GITHUB_WORKSPACE = '' } = process.env;

      if (encoding != 'utf8') {
        throw new Error(`Wrong encoding ${encoding}`);
      }

      if (pathInput == path.join(GITHUB_WORKSPACE, 'template.yaml')) {
        return mockTemplate;
      }

      throw new Error(`Unknown path ${pathInput}`);
    });

    mockCreateStack.mockImplementation(() => {
      return {
        promise(): Promise<{}> {
          return Promise.resolve({
            StackId: mockStackId
          });
        }
      };
    });

    mockUpdateStack.mockImplementation(() => {
      return {
        promise(): Promise<{}> {
          return Promise.resolve({
            StackId: mockStackId
          });
        }
      };
    });

    mockCreateChangeSet.mockImplementation(() => {
      return {
        promise(): Promise<{}> {
          return Promise.resolve({});
        }
      };
    });

    mockDescribeChangeSet.mockImplementation(() => {
      return {
        promise(): Promise<{}> {
          return Promise.resolve({});
        }
      };
    });

    mockDeleteChangeSet.mockImplementation(() => {
      return {
        promise(): Promise<{}> {
          return Promise.resolve({});
        }
      };
    });

    mockExecuteChangeSet.mockImplementation(() => {
      return {
        promise(): Promise<{}> {
          return Promise.resolve({});
        }
      };
    });

    mockDescribeStacks.mockImplementation(() => {
      return {
        promise(): Promise<aws.CloudFormation.Types.DescribeStacksOutput> {
          return Promise.resolve({ Stacks: [] });
        }
      };
    });

    mockCfnWaiter.mockImplementation(() => {
      return {
        promise(): Promise<{}> {
          return Promise.resolve({});
        }
      };
    });
  });

  test('deploys the stack', async () => {
    await run();

    expect(core.setFailed).toHaveBeenCalledTimes(0);
    expect(mockDescribeStacks).toHaveBeenCalledTimes(1);
    expect(mockCreateStack).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateBody: mockTemplate,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ]
    });
    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'stack-id', mockStackId);
  });

  test('successfully update the stack', async () => {
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
          });
        }
      };
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledTimes(0);
    expect(mockDescribeStacks).toHaveBeenCalledTimes(1);
    expect(mockCreateChangeSet).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateBody: mockTemplate,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      ChangeSetName: 'MockStack-CS'
    });
    expect(mockDescribeChangeSet).toHaveBeenNthCalledWith(1, {
      ChangeSetName: 'MockStack-CS',
      StackName: 'MockStack'
    });
    expect(mockExecuteChangeSet).toHaveBeenNthCalledWith(1, {
      ChangeSetName: 'MockStack-CS',
      StackName: 'MockStack'
    });
    expect(mockCfnWaiter).toHaveBeenCalledTimes(2);
  });

  test('error is caught updating if create change fails', async () => {
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
          });
        }
      };
    });

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
          });
        }
      };
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledTimes(1);
    expect(mockDescribeStacks).toHaveBeenCalledTimes(1);
    expect(mockCreateChangeSet).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateBody: mockTemplate,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      ChangeSetName: 'MockStack-CS'
    });
    expect(mockDeleteChangeSet).toHaveBeenNthCalledWith(1, {
      ChangeSetName: 'MockStack-CS',
      StackName: 'MockStack'
    });
    expect(mockExecuteChangeSet).toHaveBeenCalledTimes(0);
  });

  test('no error if updating fails with empty change set', async () => {
    const inputs: Inputs = {
      name: 'MockStack',
      template: 'template.yaml',
      capabilities: 'CAPABILITY_IAM',
      'parameter-overrides': 'AdminEmail=no-reply@amazon.com',
      'no-fail-on-empty-changeset': '1'
    };

    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name];
    });

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
          });
        }
      };
    });

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
          });
        }
      };
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledTimes(0);
    expect(core.setOutput).toHaveBeenCalledTimes(1);
    expect(mockDescribeStacks).toHaveBeenCalledTimes(1);
    expect(mockCreateChangeSet).toHaveBeenNthCalledWith(1, {
      StackName: 'MockStack',
      TemplateBody: mockTemplate,
      Capabilities: ['CAPABILITY_IAM'],
      Parameters: [
        { ParameterKey: 'AdminEmail', ParameterValue: 'no-reply@amazon.com' }
      ],
      ChangeSetName: 'MockStack-CS'
    });
    expect(mockDeleteChangeSet).toHaveBeenNthCalledWith(1, {
      ChangeSetName: 'MockStack-CS',
      StackName: 'MockStack'
    });
    expect(mockExecuteChangeSet).toHaveBeenCalledTimes(0);
  });

  test('error is caught by core.setFailed', async () => {
    mockCreateStack.mockImplementation(() => {
      throw new Error();
    });

    await run();

    expect(core.setFailed).toBeCalled();
  });
});
