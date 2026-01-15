import {
  CloudFormationClient,
  DescribeStacksCommand,
  DescribeChangeSetCommand,
  DescribeEventsCommand,
  CreateChangeSetCommand,
  StackStatus,
  ChangeSetStatus
} from '@aws-sdk/client-cloudformation'
import { mockClient } from 'aws-sdk-client-mock'
import { waitUntilStackOperationComplete, updateStack } from '../src/deploy'
import * as core from '@actions/core'

jest.mock('@actions/core')

const mockCfnClient = mockClient(CloudFormationClient)
const cfn = new CloudFormationClient({ region: 'us-east-1' })

describe('Deploy error scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCfnClient.reset()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('waitUntilStackOperationComplete', () => {
    it('throws error on CREATE_FAILED status', async () => {
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackName: 'TestStack',
            StackStatus: StackStatus.CREATE_FAILED,
            CreationTime: new Date()
          }
        ]
      })

      await expect(
        waitUntilStackOperationComplete(
          { client: cfn, maxWaitTime: 60, minDelay: 1 },
          { StackName: 'TestStack' }
        )
      ).rejects.toThrow('Stack operation failed with status: CREATE_FAILED')
    })

    it('throws error on UPDATE_ROLLBACK_COMPLETE status', async () => {
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackName: 'TestStack',
            StackStatus: StackStatus.UPDATE_ROLLBACK_COMPLETE,
            CreationTime: new Date()
          }
        ]
      })

      await expect(
        waitUntilStackOperationComplete(
          { client: cfn, maxWaitTime: 60, minDelay: 1 },
          { StackName: 'TestStack' }
        )
      ).rejects.toThrow(
        'Stack operation failed with status: UPDATE_ROLLBACK_COMPLETE'
      )
    })

    it('throws error on ROLLBACK_FAILED status', async () => {
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackName: 'TestStack',
            StackStatus: StackStatus.ROLLBACK_FAILED,
            CreationTime: new Date()
          }
        ]
      })

      await expect(
        waitUntilStackOperationComplete(
          { client: cfn, maxWaitTime: 60, minDelay: 1 },
          { StackName: 'TestStack' }
        )
      ).rejects.toThrow('Stack operation failed with status: ROLLBACK_FAILED')
    })

    it('throws error on UPDATE_FAILED status', async () => {
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackName: 'TestStack',
            StackStatus: StackStatus.UPDATE_FAILED,
            CreationTime: new Date()
          }
        ]
      })

      await expect(
        waitUntilStackOperationComplete(
          { client: cfn, maxWaitTime: 60, minDelay: 1 },
          { StackName: 'TestStack' }
        )
      ).rejects.toThrow('Stack operation failed with status: UPDATE_FAILED')
    })

    it('throws error on DELETE_FAILED status', async () => {
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackName: 'TestStack',
            StackStatus: StackStatus.DELETE_FAILED,
            CreationTime: new Date()
          }
        ]
      })

      await expect(
        waitUntilStackOperationComplete(
          { client: cfn, maxWaitTime: 60, minDelay: 1 },
          { StackName: 'TestStack' }
        )
      ).rejects.toThrow('Stack operation failed with status: DELETE_FAILED')
    })

    it('throws error on ROLLBACK_COMPLETE status', async () => {
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackName: 'TestStack',
            StackStatus: StackStatus.ROLLBACK_COMPLETE,
            CreationTime: new Date()
          }
        ]
      })

      await expect(
        waitUntilStackOperationComplete(
          { client: cfn, maxWaitTime: 60, minDelay: 1 },
          { StackName: 'TestStack' }
        )
      ).rejects.toThrow('Stack operation failed with status: ROLLBACK_COMPLETE')
    })

    it('throws error on UPDATE_ROLLBACK_FAILED status', async () => {
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackName: 'TestStack',
            StackStatus: StackStatus.UPDATE_ROLLBACK_FAILED,
            CreationTime: new Date()
          }
        ]
      })

      await expect(
        waitUntilStackOperationComplete(
          { client: cfn, maxWaitTime: 60, minDelay: 1 },
          { StackName: 'TestStack' }
        )
      ).rejects.toThrow(
        'Stack operation failed with status: UPDATE_ROLLBACK_FAILED'
      )
    })

    it('throws error on IMPORT_ROLLBACK_COMPLETE status', async () => {
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackName: 'TestStack',
            StackStatus: StackStatus.IMPORT_ROLLBACK_COMPLETE,
            CreationTime: new Date()
          }
        ]
      })

      await expect(
        waitUntilStackOperationComplete(
          { client: cfn, maxWaitTime: 60, minDelay: 1 },
          { StackName: 'TestStack' }
        )
      ).rejects.toThrow(
        'Stack operation failed with status: IMPORT_ROLLBACK_COMPLETE'
      )
    })

    it('throws error on IMPORT_ROLLBACK_FAILED status', async () => {
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackName: 'TestStack',
            StackStatus: StackStatus.IMPORT_ROLLBACK_FAILED,
            CreationTime: new Date()
          }
        ]
      })

      await expect(
        waitUntilStackOperationComplete(
          { client: cfn, maxWaitTime: 60, minDelay: 1 },
          { StackName: 'TestStack' }
        )
      ).rejects.toThrow(
        'Stack operation failed with status: IMPORT_ROLLBACK_FAILED'
      )
    })

    it('throws stack does not exist error', async () => {
      mockCfnClient
        .on(DescribeStacksCommand)
        .rejects(new Error('Stack with id TestStack does not exist'))

      await expect(
        waitUntilStackOperationComplete(
          { client: cfn, maxWaitTime: 60, minDelay: 1 },
          { StackName: 'TestStack' }
        )
      ).rejects.toThrow('Stack TestStack does not exist')
    })

    it('waits for in-progress stack and succeeds', async () => {
      let callCount = 0
      mockCfnClient.on(DescribeStacksCommand).callsFake(() => {
        callCount++
        if (callCount === 1) {
          return {
            Stacks: [
              {
                StackName: 'TestStack',
                StackStatus: StackStatus.CREATE_IN_PROGRESS,
                CreationTime: new Date()
              }
            ]
          }
        }
        return {
          Stacks: [
            {
              StackName: 'TestStack',
              StackStatus: StackStatus.CREATE_COMPLETE,
              CreationTime: new Date()
            }
          ]
        }
      })

      const promise = waitUntilStackOperationComplete(
        { client: cfn, maxWaitTime: 60, minDelay: 1 },
        { StackName: 'TestStack' }
      )

      // Advance timers to trigger the wait
      await jest.advanceTimersByTimeAsync(1500)

      await expect(promise).resolves.toBeUndefined()
      expect(callCount).toBe(2)
    })

    it('throws error when stack not found in response', async () => {
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: []
      })

      await expect(
        waitUntilStackOperationComplete(
          { client: cfn, maxWaitTime: 60, minDelay: 1 },
          { StackName: 'TestStack' }
        )
      ).rejects.toThrow('Stack TestStack not found')
    })
  })

  describe('updateStack with validation errors', () => {
    it('includes validation error details when change set fails', async () => {
      const mockStack = {
        StackId: 'test-stack-id',
        StackName: 'TestStack',
        StackStatus: StackStatus.CREATE_COMPLETE,
        CreationTime: new Date()
      }

      mockCfnClient
        .on(CreateChangeSetCommand)
        .resolves({ Id: 'test-cs-id' })
        .on(DescribeStacksCommand)
        .resolves({ Stacks: [mockStack] })
        .on(DescribeChangeSetCommand)
        .resolves({
          ChangeSetId: 'test-cs-id',
          Status: ChangeSetStatus.FAILED,
          ExecutionStatus: 'UNAVAILABLE',
          StatusReason: 'Validation failed'
        })
        .on(DescribeEventsCommand)
        .resolves({
          OperationEvents: [
            {
              EventType: 'VALIDATION_ERROR',
              ValidationPath: '/Resources/MyResource',
              ValidationStatusReason: 'Invalid property value'
            }
          ]
        })

      await expect(
        updateStack(
          cfn,
          mockStack,
          {
            StackName: 'TestStack',
            ChangeSetName: 'test-cs',
            ChangeSetType: 'UPDATE'
          },
          true,
          false,
          false
        )
      ).rejects.toThrow('Validation errors')
    })

    it('handles error when fetching validation events fails', async () => {
      const mockStack = {
        StackId: 'test-stack-id',
        StackName: 'TestStack',
        StackStatus: StackStatus.CREATE_COMPLETE,
        CreationTime: new Date()
      }

      mockCfnClient
        .on(CreateChangeSetCommand)
        .resolves({ Id: 'test-cs-id' })
        .on(DescribeStacksCommand)
        .resolves({ Stacks: [mockStack] })
        .on(DescribeChangeSetCommand)
        .resolves({
          ChangeSetId: 'test-cs-id',
          Status: ChangeSetStatus.FAILED,
          ExecutionStatus: 'UNAVAILABLE',
          StatusReason: 'Validation failed'
        })
        .on(DescribeEventsCommand)
        .rejects(new Error('Access denied'))

      await expect(
        updateStack(
          cfn,
          mockStack,
          {
            StackName: 'TestStack',
            ChangeSetName: 'test-cs',
            ChangeSetType: 'UPDATE'
          },
          true,
          false,
          false
        )
      ).rejects.toThrow('Failed to create Change Set')

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get validation event details')
      )
    })
  })
})
