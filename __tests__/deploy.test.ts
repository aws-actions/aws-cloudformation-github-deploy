/* eslint-disable @typescript-eslint/no-explicit-any */
import { mockClient } from 'aws-sdk-client-mock'
import {
  CloudFormationClient,
  DescribeStacksCommand,
  CreateStackCommand,
  DescribeChangeSetCommand,
  DeleteChangeSetCommand,
  CloudFormationServiceException,
  waitUntilStackCreateComplete,
  CreateChangeSetCommand,
  ExecuteChangeSetCommand,
  waitUntilChangeSetCreateComplete,
  waitUntilStackUpdateComplete
} from '@aws-sdk/client-cloudformation'
import * as core from '@actions/core'
import { deployStack, cleanupChangeSet, getStackOutputs } from '../src/deploy'
import { CreateStackInputWithName, CreateChangeSetInput } from '../src/main'
import { EventMonitorImpl } from '../src/event-streaming'

// Mock the waiters
jest.mock('@aws-sdk/client-cloudformation', () => ({
  ...jest.requireActual('@aws-sdk/client-cloudformation'),
  waitUntilStackCreateComplete: jest
    .fn()
    .mockResolvedValue({ state: 'SUCCESS' }),
  waitUntilChangeSetCreateComplete: jest
    .fn()
    .mockResolvedValue({ state: 'SUCCESS' }),
  waitUntilStackUpdateComplete: jest
    .fn()
    .mockResolvedValue({ state: 'SUCCESS' })
}))

// Mock the event streaming module
jest.mock('../src/event-streaming', () => ({
  EventMonitorImpl: jest.fn().mockImplementation(() => ({
    startMonitoring: jest.fn().mockResolvedValue(undefined),
    stopMonitoring: jest.fn(),
    isMonitoring: jest.fn().mockReturnValue(false)
  }))
}))

const mockCfnClient = mockClient(CloudFormationClient)

describe('Deploy Module', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCfnClient.reset()

    // Mock core functions
    jest.spyOn(core, 'debug').mockImplementation()
    jest.spyOn(core, 'warning').mockImplementation()
    jest.spyOn(core, 'error').mockImplementation()

    // Reset waiter mocks
    ;(waitUntilStackCreateComplete as jest.Mock).mockResolvedValue({
      state: 'SUCCESS'
    })
    ;(waitUntilChangeSetCreateComplete as jest.Mock).mockResolvedValue({
      state: 'SUCCESS'
    })
    ;(waitUntilStackUpdateComplete as jest.Mock).mockResolvedValue({
      state: 'SUCCESS'
    })
  })

  describe('getStack edge cases', () => {
    test('should handle unexpected CloudFormation behavior when stack not found', async () => {
      // This covers lines 188-194: when CloudFormation doesn't throw exception but returns no stacks
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [] // Empty array instead of undefined
      })

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      await expect(
        deployStack(
          mockCfnClient as any,
          params,
          'test-changeset',
          false,
          false,
          false
        )
      ).rejects.toThrow(
        'Stack TestStack not found, but CloudFormation did not throw an exception. This is an unexpected situation, has the SDK changed unexpectedly?'
      )
    })

    test('should handle CloudFormation returning undefined Stacks array', async () => {
      // Another edge case for lines 188-194
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: undefined
      })

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      await expect(
        deployStack(
          mockCfnClient as any,
          params,
          'test-changeset',
          false,
          false,
          false
        )
      ).rejects.toThrow(
        'Stack TestStack not found, but CloudFormation did not throw an exception'
      )
    })

    test('should handle non-CloudFormationServiceException errors', async () => {
      // Test the else branch in getStack catch block
      const genericError = new Error('Generic network error')
      mockCfnClient.on(DescribeStacksCommand).rejects(genericError)

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      await expect(
        deployStack(
          mockCfnClient as any,
          params,
          'test-changeset',
          false,
          false,
          false
        )
      ).rejects.toThrow('Generic network error')
    })

    test('should handle CloudFormationServiceException with non-400 status code', async () => {
      // Test the branch where it's a CloudFormationServiceException but not 400/ValidationError
      mockCfnClient.on(DescribeStacksCommand).rejects(
        new CloudFormationServiceException({
          name: 'AccessDenied',
          message: 'Access denied',
          $fault: 'client',
          $metadata: { httpStatusCode: 403 }
        })
      )

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      await expect(
        deployStack(
          mockCfnClient as any,
          params,
          'test-changeset',
          false,
          false,
          false
        )
      ).rejects.toThrow('Access denied')
    })

    test('should handle CloudFormationServiceException with non-ValidationError name', async () => {
      // Test the branch where it's a 400 error but not ValidationError
      mockCfnClient.on(DescribeStacksCommand).rejects(
        new CloudFormationServiceException({
          name: 'InvalidParameterValue',
          message: 'Invalid parameter',
          $fault: 'client',
          $metadata: { httpStatusCode: 400 }
        })
      )

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      await expect(
        deployStack(
          mockCfnClient as any,
          params,
          'test-changeset',
          false,
          false,
          false
        )
      ).rejects.toThrow('Invalid parameter')
    })
  })

  describe('Event monitoring initialization failures', () => {
    test('should handle event monitor initialization failure and continue deployment', async () => {
      // This covers lines 206-212: event monitor initialization fails
      ;(EventMonitorImpl as jest.Mock).mockImplementation(() => {
        throw new Error('EventMonitor constructor failed')
      })

      // Mock successful stack creation
      mockCfnClient.on(DescribeStacksCommand).rejects(
        new CloudFormationServiceException({
          name: 'ValidationError',
          message: 'Stack does not exist',
          $fault: 'client',
          $metadata: { httpStatusCode: 400 }
        })
      )
      mockCfnClient
        .on(CreateStackCommand)
        .resolves({ StackId: 'test-stack-id' })

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      const result = await deployStack(
        mockCfnClient as any,
        params,
        'test-changeset',
        false,
        false,
        false,
        undefined,
        true // enableEventStreaming = true
      )

      expect(result).toBe('test-stack-id')
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to initialize event streaming, deployment continues without streaming'
        )
      )
    })

    test('should handle event monitor startMonitoring failure and continue deployment', async () => {
      // Test when EventMonitor constructor succeeds but startMonitoring fails
      const mockEventMonitor = {
        startMonitoring: jest
          .fn()
          .mockRejectedValue(new Error('Start monitoring failed')),
        stopMonitoring: jest.fn(),
        isMonitoring: jest.fn().mockReturnValue(false)
      }

      ;(EventMonitorImpl as jest.Mock).mockImplementation(
        () => mockEventMonitor
      )

      // Mock successful stack creation
      mockCfnClient.on(DescribeStacksCommand).rejects(
        new CloudFormationServiceException({
          name: 'ValidationError',
          message: 'Stack does not exist',
          $fault: 'client',
          $metadata: { httpStatusCode: 400 }
        })
      )
      mockCfnClient
        .on(CreateStackCommand)
        .resolves({ StackId: 'test-stack-id' })

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      const result = await deployStack(
        mockCfnClient as any,
        params,
        'test-changeset',
        false,
        false,
        false,
        undefined,
        true // enableEventStreaming = true
      )

      expect(result).toBe('test-stack-id')
      expect(mockEventMonitor.startMonitoring).toHaveBeenCalled()
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          'Event streaming failed but deployment continues'
        )
      )
    })
  })

  describe('Event monitoring cleanup failures', () => {
    test('should handle event monitor stopMonitoring failure in finally block', async () => {
      // This covers lines 311-312: error stopping event monitoring
      const mockEventMonitor = {
        startMonitoring: jest.fn().mockResolvedValue(undefined),
        stopMonitoring: jest.fn().mockImplementation(() => {
          throw new Error('Failed to stop monitoring')
        }),
        isMonitoring: jest.fn().mockReturnValue(true)
      }

      ;(EventMonitorImpl as jest.Mock).mockImplementation(
        () => mockEventMonitor
      )

      // Mock successful stack creation
      mockCfnClient.on(DescribeStacksCommand).rejects(
        new CloudFormationServiceException({
          name: 'ValidationError',
          message: 'Stack does not exist',
          $fault: 'client',
          $metadata: { httpStatusCode: 400 }
        })
      )
      mockCfnClient
        .on(CreateStackCommand)
        .resolves({ StackId: 'test-stack-id' })

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      const result = await deployStack(
        mockCfnClient as any,
        params,
        'test-changeset',
        false,
        false,
        false,
        undefined,
        true // enableEventStreaming = true
      )

      expect(result).toBe('test-stack-id')
      expect(mockEventMonitor.stopMonitoring).toHaveBeenCalled()
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          'Error stopping event streaming (deployment result unaffected)'
        )
      )
    })

    test('should handle event monitor stopMonitoring failure when deployment also fails', async () => {
      // Test cleanup failure when deployment fails
      const mockEventMonitor = {
        startMonitoring: jest.fn().mockResolvedValue(undefined),
        stopMonitoring: jest.fn().mockImplementation(() => {
          throw new Error('Failed to stop monitoring')
        }),
        isMonitoring: jest.fn().mockReturnValue(true)
      }

      ;(EventMonitorImpl as jest.Mock).mockImplementation(
        () => mockEventMonitor
      )

      // Mock deployment failure
      const deploymentError = new Error('Stack creation failed')
      mockCfnClient.on(DescribeStacksCommand).rejects(
        new CloudFormationServiceException({
          name: 'ValidationError',
          message: 'Stack does not exist',
          $fault: 'client',
          $metadata: { httpStatusCode: 400 }
        })
      )
      mockCfnClient.on(CreateStackCommand).rejects(deploymentError)

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      await expect(
        deployStack(
          mockCfnClient as any,
          params,
          'test-changeset',
          false,
          false,
          false,
          undefined,
          true // enableEventStreaming = true
        )
      ).rejects.toThrow('Stack creation failed')

      expect(mockEventMonitor.stopMonitoring).toHaveBeenCalled()
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          'Error stopping event streaming (deployment result unaffected)'
        )
      )
      expect(core.error).toHaveBeenCalledWith(
        'Deployment failed: Stack creation failed'
      )
    })

    test('should handle non-Error deployment failure', async () => {
      // Test the deploymentError instanceof Error branch - when it's not an Error
      const mockEventMonitor = {
        startMonitoring: jest.fn().mockResolvedValue(undefined),
        stopMonitoring: jest.fn(),
        isMonitoring: jest.fn().mockReturnValue(false)
      }

      ;(EventMonitorImpl as jest.Mock).mockImplementation(
        () => mockEventMonitor
      )

      // Mock deployment failure with non-Error object
      const deploymentError = 'String error message'
      mockCfnClient.on(DescribeStacksCommand).rejects(
        new CloudFormationServiceException({
          name: 'ValidationError',
          message: 'Stack does not exist',
          $fault: 'client',
          $metadata: { httpStatusCode: 400 }
        })
      )
      mockCfnClient.on(CreateStackCommand).rejects(deploymentError)

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      await expect(
        deployStack(
          mockCfnClient as any,
          params,
          'test-changeset',
          false,
          false,
          false,
          undefined,
          true // enableEventStreaming = true
        )
      ).rejects.toThrow('String error message')

      expect(core.error).toHaveBeenCalledWith(
        'Deployment failed: String error message'
      )
    })

    test('should handle deployment without event streaming', async () => {
      // Test the enableEventStreaming = false branch
      mockCfnClient.on(DescribeStacksCommand).rejects(
        new CloudFormationServiceException({
          name: 'ValidationError',
          message: 'Stack does not exist',
          $fault: 'client',
          $metadata: { httpStatusCode: 400 }
        })
      )
      mockCfnClient
        .on(CreateStackCommand)
        .resolves({ StackId: 'test-stack-id' })

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      const result = await deployStack(
        mockCfnClient as any,
        params,
        'test-changeset',
        false,
        false,
        false,
        undefined,
        false // enableEventStreaming = false
      )

      expect(result).toBe('test-stack-id')
      expect(EventMonitorImpl).not.toHaveBeenCalled()
    })

    test('should handle deployment with existing stack (update path)', async () => {
      // Test the else branch in deployStack when stack exists
      const mockEventMonitor = {
        startMonitoring: jest.fn().mockResolvedValue(undefined),
        stopMonitoring: jest.fn(),
        isMonitoring: jest.fn().mockReturnValue(false)
      }

      ;(EventMonitorImpl as jest.Mock).mockImplementation(
        () => mockEventMonitor
      )

      // Mock existing stack
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackId: 'existing-stack-id',
            StackName: 'TestStack',
            StackStatus: 'CREATE_COMPLETE',
            CreationTime: new Date()
          }
        ]
      })

      // Mock successful update
      mockCfnClient.on(CreateChangeSetCommand).resolves({})
      ;(waitUntilChangeSetCreateComplete as jest.Mock).mockResolvedValue({
        state: 'SUCCESS'
      })
      mockCfnClient.on(ExecuteChangeSetCommand).resolves({})
      ;(waitUntilStackUpdateComplete as jest.Mock).mockResolvedValue({
        state: 'SUCCESS'
      })

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      const result = await deployStack(
        mockCfnClient as any,
        params,
        'test-changeset',
        false,
        false,
        false,
        'Test change set description',
        true
      )

      expect(result).toBe('existing-stack-id')
      expect(mockCfnClient.commandCalls(CreateChangeSetCommand)).toHaveLength(1)
      expect(mockCfnClient.commandCalls(ExecuteChangeSetCommand)).toHaveLength(
        1
      )
    })

    test('should handle non-Error object in event streaming error handling', async () => {
      // Test the err instanceof Error branch in event streaming error handling
      const mockEventMonitor = {
        startMonitoring: jest.fn().mockRejectedValue('String error'), // Non-Error object
        stopMonitoring: jest.fn(),
        isMonitoring: jest.fn().mockReturnValue(false)
      }

      ;(EventMonitorImpl as jest.Mock).mockImplementation(
        () => mockEventMonitor
      )

      // Mock successful stack creation
      mockCfnClient.on(DescribeStacksCommand).rejects(
        new CloudFormationServiceException({
          name: 'ValidationError',
          message: 'Stack does not exist',
          $fault: 'client',
          $metadata: { httpStatusCode: 400 }
        })
      )
      mockCfnClient
        .on(CreateStackCommand)
        .resolves({ StackId: 'test-stack-id' })

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      const result = await deployStack(
        mockCfnClient as any,
        params,
        'test-changeset',
        false,
        false,
        false,
        undefined,
        true // enableEventStreaming = true
      )

      expect(result).toBe('test-stack-id')
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          'Event streaming failed but deployment continues: String error'
        )
      )
    })

    test('should handle non-Error object in event monitor initialization', async () => {
      // Test the err instanceof Error branch in event monitor initialization
      ;(EventMonitorImpl as jest.Mock).mockImplementation(() => {
        throw 'String initialization error' // Non-Error object
      })

      // Mock successful stack creation
      mockCfnClient.on(DescribeStacksCommand).rejects(
        new CloudFormationServiceException({
          name: 'ValidationError',
          message: 'Stack does not exist',
          $fault: 'client',
          $metadata: { httpStatusCode: 400 }
        })
      )
      mockCfnClient
        .on(CreateStackCommand)
        .resolves({ StackId: 'test-stack-id' })

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      const result = await deployStack(
        mockCfnClient as any,
        params,
        'test-changeset',
        false,
        false,
        false,
        undefined,
        true // enableEventStreaming = true
      )

      expect(result).toBe('test-stack-id')
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to initialize event streaming, deployment continues without streaming: String initialization error'
        )
      )
    })

    test('should handle non-Error object in event monitor cleanup', async () => {
      // Test the err instanceof Error branch in event monitor cleanup
      const mockEventMonitor = {
        startMonitoring: jest.fn().mockResolvedValue(undefined),
        stopMonitoring: jest.fn().mockImplementation(() => {
          throw 'String cleanup error' // Non-Error object
        }),
        isMonitoring: jest.fn().mockReturnValue(false)
      }

      ;(EventMonitorImpl as jest.Mock).mockImplementation(
        () => mockEventMonitor
      )

      // Mock successful stack creation
      mockCfnClient.on(DescribeStacksCommand).rejects(
        new CloudFormationServiceException({
          name: 'ValidationError',
          message: 'Stack does not exist',
          $fault: 'client',
          $metadata: { httpStatusCode: 400 }
        })
      )
      mockCfnClient
        .on(CreateStackCommand)
        .resolves({ StackId: 'test-stack-id' })

      const params: CreateStackInputWithName = {
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      const result = await deployStack(
        mockCfnClient as any,
        params,
        'test-changeset',
        false,
        false,
        false,
        undefined,
        true // enableEventStreaming = true
      )

      expect(result).toBe('test-stack-id')
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          'Error stopping event streaming (deployment result unaffected): String cleanup error'
        )
      )
    })
  })

  describe('cleanupChangeSet', () => {
    test('should handle failed change set with noDeleteFailedChangeSet=true', async () => {
      const stack = { StackId: 'test-stack-id' }
      const params: CreateChangeSetInput = {
        ChangeSetName: 'test-changeset',
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      mockCfnClient.on(DescribeChangeSetCommand).resolves({
        Status: 'FAILED',
        StatusReason: 'No updates are to be performed'
      })

      const result = await cleanupChangeSet(
        mockCfnClient as any,
        stack as any,
        params,
        true, // noEmptyChangeSet
        true // noDeleteFailedChangeSet - this should prevent deletion
      )

      expect(result).toBe('test-stack-id')
      expect(mockCfnClient.commandCalls(DeleteChangeSetCommand)).toHaveLength(0)
    })

    test('should throw error for failed change set with unknown error message', async () => {
      const stack = { StackId: 'test-stack-id' }
      const params: CreateChangeSetInput = {
        ChangeSetName: 'test-changeset',
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      mockCfnClient.on(DescribeChangeSetCommand).resolves({
        Status: 'FAILED',
        StatusReason: 'Unknown error occurred'
      })

      await expect(
        cleanupChangeSet(
          mockCfnClient as any,
          stack as any,
          params,
          true, // noEmptyChangeSet
          false // noDeleteFailedChangeSet
        )
      ).rejects.toThrow('Failed to create Change Set: Unknown error occurred')

      expect(mockCfnClient.commandCalls(DeleteChangeSetCommand)).toHaveLength(1)
    })

    test('should handle successful change set status', async () => {
      const stack = { StackId: 'test-stack-id' }
      const params: CreateChangeSetInput = {
        ChangeSetName: 'test-changeset',
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      mockCfnClient.on(DescribeChangeSetCommand).resolves({
        Status: 'CREATE_COMPLETE',
        StatusReason: 'Change set created successfully'
      })

      const result = await cleanupChangeSet(
        mockCfnClient as any,
        stack as any,
        params,
        true, // noEmptyChangeSet
        false // noDeleteFailedChangeSet
      )

      expect(result).toBeUndefined()
      expect(mockCfnClient.commandCalls(DeleteChangeSetCommand)).toHaveLength(0)
    })

    test('should handle failed change set with noEmptyChangeSet=false', async () => {
      const stack = { StackId: 'test-stack-id' }
      const params: CreateChangeSetInput = {
        ChangeSetName: 'test-changeset',
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      mockCfnClient.on(DescribeChangeSetCommand).resolves({
        Status: 'FAILED',
        StatusReason: 'No updates are to be performed'
      })

      await expect(
        cleanupChangeSet(
          mockCfnClient as any,
          stack as any,
          params,
          false, // noEmptyChangeSet = false
          false // noDeleteFailedChangeSet
        )
      ).rejects.toThrow(
        'Failed to create Change Set: No updates are to be performed'
      )

      expect(mockCfnClient.commandCalls(DeleteChangeSetCommand)).toHaveLength(1)
    })

    test('should handle failed change set with StatusReason containing second known error message', async () => {
      const stack = { StackId: 'test-stack-id' }
      const params: CreateChangeSetInput = {
        ChangeSetName: 'test-changeset',
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      mockCfnClient.on(DescribeChangeSetCommand).resolves({
        Status: 'FAILED',
        StatusReason: "The submitted information didn't contain changes"
      })

      const result = await cleanupChangeSet(
        mockCfnClient as any,
        stack as any,
        params,
        true, // noEmptyChangeSet
        false // noDeleteFailedChangeSet
      )

      expect(result).toBe('test-stack-id')
      expect(mockCfnClient.commandCalls(DeleteChangeSetCommand)).toHaveLength(1)
    })

    test('should handle failed change set with undefined StatusReason', async () => {
      const stack = { StackId: 'test-stack-id' }
      const params: CreateChangeSetInput = {
        ChangeSetName: 'test-changeset',
        StackName: 'TestStack',
        TemplateBody: '{"Resources": {}}'
      }

      mockCfnClient.on(DescribeChangeSetCommand).resolves({
        Status: 'FAILED'
        // StatusReason is undefined
      })

      await expect(
        cleanupChangeSet(
          mockCfnClient as any,
          stack as any,
          params,
          true, // noEmptyChangeSet
          false // noDeleteFailedChangeSet
        )
      ).rejects.toThrow('Failed to create Change Set: undefined')

      expect(mockCfnClient.commandCalls(DeleteChangeSetCommand)).toHaveLength(1)
    })
  })

  describe('getStackOutputs', () => {
    test('should handle stack with no outputs', async () => {
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackId: 'test-stack-id',
            StackName: 'TestStack',
            StackStatus: 'CREATE_COMPLETE',
            CreationTime: new Date()
            // No Outputs property
          }
        ]
      })

      const outputs = await getStackOutputs(
        mockCfnClient as any,
        'test-stack-id'
      )
      expect(outputs.size).toBe(0)
    })

    test('should handle stack with empty outputs array', async () => {
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackId: 'test-stack-id',
            StackName: 'TestStack',
            StackStatus: 'CREATE_COMPLETE',
            CreationTime: new Date(),
            Outputs: []
          }
        ]
      })

      const outputs = await getStackOutputs(
        mockCfnClient as any,
        'test-stack-id'
      )
      expect(outputs.size).toBe(0)
    })

    test('should handle outputs with missing keys or values', async () => {
      mockCfnClient.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackId: 'test-stack-id',
            StackName: 'TestStack',
            StackStatus: 'CREATE_COMPLETE',
            CreationTime: new Date(),
            Outputs: [
              { OutputKey: 'ValidOutput', OutputValue: 'ValidValue' },
              { OutputKey: 'MissingValue' }, // Missing OutputValue
              { OutputValue: 'MissingKey' }, // Missing OutputKey
              { OutputKey: '', OutputValue: 'EmptyKey' }, // Empty key
              { OutputKey: 'EmptyValue', OutputValue: '' } // Empty value
            ]
          }
        ]
      })

      const outputs = await getStackOutputs(
        mockCfnClient as any,
        'test-stack-id'
      )
      expect(outputs.size).toBe(1)
      expect(outputs.get('ValidOutput')).toBe('ValidValue')
    })
  })
})
