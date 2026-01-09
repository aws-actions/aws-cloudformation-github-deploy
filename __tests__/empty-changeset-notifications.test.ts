import * as core from '@actions/core'
import {
  CloudFormationClient,
  DescribeStackEventsCommand,
  DescribeChangeSetCommand,
  DeleteChangeSetCommand,
  ChangeSetStatus,
  StackStatus,
  Stack
} from '@aws-sdk/client-cloudformation'
import { mockClient } from 'aws-sdk-client-mock'
import { cleanupChangeSet } from '../src/deploy'
import { CreateChangeSetInput } from '../src/main'
import { EventMonitorImpl, EventMonitorConfig } from '../src/event-streaming'

// Mock @actions/core
jest.mock('@actions/core')
const mockedCore = core as jest.Mocked<typeof core>

// Create CloudFormation client mock
const mockCfnClient = mockClient(CloudFormationClient)

describe('Empty Changeset Notifications', () => {
  let cfnClient: CloudFormationClient

  beforeEach(() => {
    jest.clearAllMocks()
    mockCfnClient.reset()
    cfnClient = new CloudFormationClient({})
  })

  describe('cleanupChangeSet notifications', () => {
    const mockStack: Stack = {
      StackId:
        'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/123',
      StackName: 'test-stack',
      StackStatus: StackStatus.UPDATE_ROLLBACK_COMPLETE,
      CreationTime: new Date('2023-01-01T00:00:00Z')
    }

    const mockChangeSetParams: CreateChangeSetInput = {
      ChangeSetName: 'test-changeset',
      StackName: 'test-stack'
    }

    it('should display clear notification when no updates are needed', async () => {
      // Mock changeset status with "no updates" message
      mockCfnClient.on(DescribeChangeSetCommand).resolves({
        Status: ChangeSetStatus.FAILED,
        StatusReason: "The submitted information didn't contain changes"
      })

      mockCfnClient.on(DeleteChangeSetCommand).resolves({})

      const result = await cleanupChangeSet(
        cfnClient,
        mockStack,
        mockChangeSetParams,
        true, // noEmptyChangeSet
        false // noDeleteFailedChangeSet
      )

      // Verify the notification messages
      expect(mockedCore.info).toHaveBeenCalledWith(
        '✅ No updates to deploy - CloudFormation stack is already up to date'
      )
      expect(mockedCore.info).toHaveBeenCalledWith(
        'Stack "test-stack" has no changes to apply'
      )
      expect(mockedCore.info).toHaveBeenCalledWith(
        'The template and parameters match the current stack configuration'
      )

      // Verify it returns the stack ID (successful no-op)
      expect(result).toBe(mockStack.StackId)
    })

    it('should display notification for "No updates are to be performed" message', async () => {
      // Mock changeset status with alternative "no updates" message
      mockCfnClient.on(DescribeChangeSetCommand).resolves({
        Status: ChangeSetStatus.FAILED,
        StatusReason: 'No updates are to be performed'
      })

      mockCfnClient.on(DeleteChangeSetCommand).resolves({})

      const result = await cleanupChangeSet(
        cfnClient,
        mockStack,
        mockChangeSetParams,
        true, // noEmptyChangeSet
        false // noDeleteFailedChangeSet
      )

      // Verify the notification messages
      expect(mockedCore.info).toHaveBeenCalledWith(
        '✅ No updates to deploy - CloudFormation stack is already up to date'
      )
      expect(mockedCore.info).toHaveBeenCalledWith(
        'Stack "test-stack" has no changes to apply'
      )
      expect(mockedCore.info).toHaveBeenCalledWith(
        'The template and parameters match the current stack configuration'
      )

      expect(result).toBe(mockStack.StackId)
    })

    it('should handle stack with undefined name gracefully', async () => {
      const stackWithoutName: Partial<Stack> = {
        StackId:
          'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/123',
        StackStatus: StackStatus.UPDATE_ROLLBACK_COMPLETE
        // StackName is undefined
      }

      mockCfnClient.on(DescribeChangeSetCommand).resolves({
        Status: ChangeSetStatus.FAILED,
        StatusReason: "The submitted information didn't contain changes"
      })

      mockCfnClient.on(DeleteChangeSetCommand).resolves({})

      const result = await cleanupChangeSet(
        cfnClient,
        stackWithoutName as Stack,
        mockChangeSetParams,
        true, // noEmptyChangeSet
        false // noDeleteFailedChangeSet
      )

      // Verify it handles undefined stack name
      expect(mockedCore.info).toHaveBeenCalledWith(
        'Stack "Unknown" has no changes to apply'
      )

      expect(result).toBe(stackWithoutName.StackId)
    })

    it('should not display notifications when noEmptyChangeSet is false', async () => {
      mockCfnClient.on(DescribeChangeSetCommand).resolves({
        Status: ChangeSetStatus.FAILED,
        StatusReason: "The submitted information didn't contain changes"
      })

      mockCfnClient.on(DeleteChangeSetCommand).resolves({})

      try {
        await cleanupChangeSet(
          cfnClient,
          mockStack,
          mockChangeSetParams,
          false, // noEmptyChangeSet = false
          false // noDeleteFailedChangeSet
        )
      } catch (error) {
        // Expected to throw error when noEmptyChangeSet is false
      }

      // Should not display the "no updates" notifications
      expect(mockedCore.info).not.toHaveBeenCalledWith(
        '✅ No updates to deploy - CloudFormation stack is already up to date'
      )
    })

    it('should not display notifications for other failure reasons', async () => {
      mockCfnClient.on(DescribeChangeSetCommand).resolves({
        Status: ChangeSetStatus.FAILED,
        StatusReason: 'Some other error occurred'
      })

      mockCfnClient.on(DeleteChangeSetCommand).resolves({})

      try {
        await cleanupChangeSet(
          cfnClient,
          mockStack,
          mockChangeSetParams,
          true, // noEmptyChangeSet
          false // noDeleteFailedChangeSet
        )
      } catch (error) {
        // Expected to throw error for non-empty-changeset failures
      }

      // Should not display the "no updates" notifications for other errors
      expect(mockedCore.info).not.toHaveBeenCalledWith(
        '✅ No updates to deploy - CloudFormation stack is already up to date'
      )
    })
  })

  describe('EventMonitor notifications', () => {
    let eventMonitor: EventMonitorImpl
    let mockClient: CloudFormationClient

    beforeEach(() => {
      mockClient = new CloudFormationClient({})

      const eventConfig: EventMonitorConfig = {
        stackName: 'test-stack',
        client: mockClient,
        enableColors: false,
        pollIntervalMs: 100, // Fast polling for tests
        maxPollIntervalMs: 1000
      }

      eventMonitor = new EventMonitorImpl(eventConfig)
    })

    it('should display notification when no events are detected', async () => {
      // Mock empty events response - use DescribeStackEventsCommand instead
      mockCfnClient.on(DescribeStackEventsCommand).resolves({
        StackEvents: []
      })

      // Start monitoring and let it run briefly
      const monitoringPromise = eventMonitor.startMonitoring()

      // Wait a short time for polling to occur
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Stop monitoring
      eventMonitor.stopMonitoring()

      // Wait for monitoring to complete
      await monitoringPromise

      // Verify the "no events" notification was displayed
      expect(mockedCore.info).toHaveBeenCalledWith(
        '✅ No deployment events - stack is already up to date'
      )
      expect(mockedCore.info).toHaveBeenCalledWith(
        'No changes were applied to the CloudFormation stack'
      )
    })

    it('should not display no-events notification when events are present', async () => {
      // Mock response with events - use DescribeStackEventsCommand
      mockCfnClient.on(DescribeStackEventsCommand).resolves({
        StackEvents: [
          {
            Timestamp: new Date(),
            LogicalResourceId: 'TestResource',
            ResourceStatus: 'CREATE_IN_PROGRESS',
            ResourceType: 'AWS::S3::Bucket',
            StackId:
              'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/123',
            EventId: 'test-event-id',
            StackName: 'test-stack'
          }
        ]
      })

      // Start monitoring briefly
      const monitoringPromise = eventMonitor.startMonitoring()

      // Wait a short time
      await new Promise(resolve => setTimeout(resolve, 500))

      // Stop monitoring
      eventMonitor.stopMonitoring()

      // Wait for monitoring to complete
      await monitoringPromise

      // Should not display the "no events" notification when events are present
      expect(mockedCore.info).not.toHaveBeenCalledWith(
        '✅ No deployment events - stack is already up to date'
      )
    })

    it('should track event count correctly for statistics', () => {
      const stats = eventMonitor.getStats()

      expect(stats).toHaveProperty('eventCount')
      expect(stats).toHaveProperty('errorCount')
      expect(stats).toHaveProperty('isActive')
      expect(stats.eventCount).toBe(0)
      expect(stats.errorCount).toBe(0)
      expect(stats.isActive).toBe(false)
    })
  })

  describe('Integration scenarios', () => {
    it('should handle complete empty changeset flow with notifications', async () => {
      const mockStack: Stack = {
        StackId:
          'arn:aws:cloudformation:us-east-1:123456789012:stack/integration-test/123',
        StackName: 'integration-test',
        StackStatus: StackStatus.UPDATE_ROLLBACK_COMPLETE,
        CreationTime: new Date('2023-01-01T00:00:00Z')
      }

      // Mock the complete flow
      mockCfnClient
        .on(DescribeChangeSetCommand)
        .resolves({
          Status: ChangeSetStatus.FAILED,
          StatusReason: "The submitted information didn't contain changes"
        })
        .on(DeleteChangeSetCommand)
        .resolves({})

      const result = await cleanupChangeSet(
        cfnClient,
        mockStack,
        {
          ChangeSetName: 'integration-changeset',
          StackName: 'integration-test'
        },
        true, // noEmptyChangeSet
        false // noDeleteFailedChangeSet
      )

      // Verify all notification messages are present
      expect(mockedCore.info).toHaveBeenCalledWith(
        '✅ No updates to deploy - CloudFormation stack is already up to date'
      )
      expect(mockedCore.info).toHaveBeenCalledWith(
        'Stack "integration-test" has no changes to apply'
      )
      expect(mockedCore.info).toHaveBeenCalledWith(
        'The template and parameters match the current stack configuration'
      )

      // Verify successful completion
      expect(result).toBe(mockStack.StackId)
    })

    it('should handle notification message formatting edge cases', async () => {
      const stackWithSpecialChars: Stack = {
        StackId:
          'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack-with-special-chars/123',
        StackName: 'test-stack-with-"quotes"-and-symbols',
        StackStatus: StackStatus.UPDATE_ROLLBACK_COMPLETE,
        CreationTime: new Date('2023-01-01T00:00:00Z')
      }

      mockCfnClient.on(DescribeChangeSetCommand).resolves({
        Status: ChangeSetStatus.FAILED,
        StatusReason: "The submitted information didn't contain changes"
      })

      mockCfnClient.on(DeleteChangeSetCommand).resolves({})

      const result = await cleanupChangeSet(
        cfnClient,
        stackWithSpecialChars,
        {
          ChangeSetName: 'test-changeset',
          StackName: 'test-stack-with-special-chars'
        },
        true, // noEmptyChangeSet
        false // noDeleteFailedChangeSet
      )

      // Verify it handles special characters in stack names
      expect(mockedCore.info).toHaveBeenCalledWith(
        'Stack "test-stack-with-"quotes"-and-symbols" has no changes to apply'
      )

      expect(result).toBe(stackWithSpecialChars.StackId)
    })
  })
})
