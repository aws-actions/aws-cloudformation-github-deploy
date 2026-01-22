/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  EventColor,
  STATUS_COLORS,
  TERMINAL_STACK_STATES,
  ERROR_STATUS_PATTERNS,
  SUCCESS_STATUS_PATTERNS,
  StackEvent,
  EventMonitorConfig,
  FormattedEvent,
  ExtractedError,
  EventDisplayConfig,
  ResourceStatus,
  TerminalStackState,
  EventPollerImpl,
  ErrorExtractorImpl,
  ColorFormatterImpl
} from '../src/event-streaming'
import { CloudFormationClient } from '@aws-sdk/client-cloudformation'

jest.mock('@actions/core')

describe('Event Streaming Types and Interfaces', () => {
  describe('EventColor enum', () => {
    it('should have correct ANSI color codes', () => {
      expect(EventColor.SUCCESS).toBe('\x1b[32m')
      expect(EventColor.WARNING).toBe('\x1b[33m')
      expect(EventColor.ERROR).toBe('\x1b[31m')
      expect(EventColor.INFO).toBe('\x1b[34m')
      expect(EventColor.RESET).toBe('\x1b[0m')
    })
  })

  describe('STATUS_COLORS mapping', () => {
    it('should map success statuses to green', () => {
      expect(STATUS_COLORS.CREATE_COMPLETE).toBe(EventColor.SUCCESS)
      expect(STATUS_COLORS.UPDATE_COMPLETE).toBe(EventColor.SUCCESS)
      expect(STATUS_COLORS.DELETE_COMPLETE).toBe(EventColor.SUCCESS)
      expect(STATUS_COLORS.CREATE_IN_PROGRESS).toBe(EventColor.SUCCESS)
      expect(STATUS_COLORS.UPDATE_IN_PROGRESS).toBe(EventColor.SUCCESS)
    })

    it('should map warning statuses to yellow', () => {
      expect(STATUS_COLORS.UPDATE_ROLLBACK_IN_PROGRESS).toBe(EventColor.WARNING)
      expect(STATUS_COLORS.UPDATE_ROLLBACK_COMPLETE).toBe(EventColor.WARNING)
      expect(STATUS_COLORS.CREATE_ROLLBACK_IN_PROGRESS).toBe(EventColor.WARNING)
    })

    it('should map error statuses to red', () => {
      expect(STATUS_COLORS.CREATE_FAILED).toBe(EventColor.ERROR)
      expect(STATUS_COLORS.UPDATE_FAILED).toBe(EventColor.ERROR)
      expect(STATUS_COLORS.DELETE_FAILED).toBe(EventColor.ERROR)
      expect(STATUS_COLORS.UPDATE_ROLLBACK_FAILED).toBe(EventColor.ERROR)
      expect(STATUS_COLORS.CREATE_ROLLBACK_FAILED).toBe(EventColor.ERROR)
    })
  })

  describe('TERMINAL_STACK_STATES', () => {
    it('should include all terminal states', () => {
      const expectedStates = [
        'CREATE_COMPLETE',
        'UPDATE_COMPLETE',
        'DELETE_COMPLETE',
        'CREATE_FAILED',
        'UPDATE_FAILED',
        'DELETE_FAILED',
        'UPDATE_ROLLBACK_COMPLETE',
        'UPDATE_ROLLBACK_FAILED',
        'CREATE_ROLLBACK_COMPLETE',
        'CREATE_ROLLBACK_FAILED'
      ]

      expect(TERMINAL_STACK_STATES).toEqual(expectedStates)
    })
  })

  describe('Type definitions', () => {
    it('should allow valid StackEvent objects', () => {
      const event: StackEvent = {
        Timestamp: new Date(),
        LogicalResourceId: 'MyResource',
        ResourceType: 'AWS::S3::Bucket',
        ResourceStatus: 'CREATE_COMPLETE',
        ResourceStatusReason: 'Resource creation completed',
        PhysicalResourceId: 'my-bucket-12345'
      }

      expect(event.LogicalResourceId).toBe('MyResource')
      expect(event.ResourceType).toBe('AWS::S3::Bucket')
      expect(event.ResourceStatus).toBe('CREATE_COMPLETE')
    })

    it('should allow valid EventMonitorConfig objects', () => {
      const config: EventMonitorConfig = {
        stackName: 'test-stack',
        client: new CloudFormationClient({}),
        enableColors: true,
        pollIntervalMs: 2000,
        maxPollIntervalMs: 30000
      }

      expect(config.stackName).toBe('test-stack')
      expect(config.enableColors).toBe(true)
      expect(config.pollIntervalMs).toBe(2000)
      expect(config.maxPollIntervalMs).toBe(30000)
    })

    it('should allow valid FormattedEvent objects', () => {
      const formattedEvent: FormattedEvent = {
        timestamp: '2023-01-01T12:00:00Z',
        resourceInfo: 'AWS::S3::Bucket MyBucket',
        status: 'CREATE_COMPLETE',
        message: 'Resource created successfully',
        isError: false
      }

      expect(formattedEvent.timestamp).toBe('2023-01-01T12:00:00Z')
      expect(formattedEvent.isError).toBe(false)
    })

    it('should allow valid ExtractedError objects', () => {
      const error: ExtractedError = {
        message: 'Resource creation failed',
        resourceId: 'MyResource',
        resourceType: 'AWS::S3::Bucket',
        timestamp: new Date()
      }

      expect(error.message).toBe('Resource creation failed')
      expect(error.resourceId).toBe('MyResource')
      expect(error.resourceType).toBe('AWS::S3::Bucket')
    })

    it('should allow valid EventDisplayConfig objects', () => {
      const config: EventDisplayConfig = {
        showTimestamp: true,
        showResourceType: true,
        showPhysicalId: false,
        maxResourceNameLength: 50,
        indentLevel: 2
      }

      expect(config.showTimestamp).toBe(true)
      expect(config.maxResourceNameLength).toBe(50)
      expect(config.indentLevel).toBe(2)
    })
  })

  describe('Type constraints', () => {
    it('should enforce ResourceStatus type constraints', () => {
      const validStatus: ResourceStatus = 'CREATE_COMPLETE'
      expect(validStatus).toBe('CREATE_COMPLETE')

      // This would cause a TypeScript error if uncommented:
      // const invalidStatus: ResourceStatus = 'INVALID_STATUS'
    })

    it('should enforce TerminalStackState type constraints', () => {
      const validTerminalState: TerminalStackState = 'CREATE_COMPLETE'
      expect(validTerminalState).toBe('CREATE_COMPLETE')

      // This would cause a TypeScript error if uncommented:
      // const invalidTerminalState: TerminalStackState = 'IN_PROGRESS'
    })
  })

  describe('Pattern constants', () => {
    it('should define error status patterns', () => {
      expect(ERROR_STATUS_PATTERNS).toEqual(['FAILED', 'ROLLBACK'])
    })

    it('should define success status patterns', () => {
      expect(SUCCESS_STATUS_PATTERNS).toEqual(['COMPLETE', 'IN_PROGRESS'])
    })
  })
})

describe('EventPoller Implementation', () => {
  let mockClient: any
  let eventPoller: EventPollerImpl

  beforeEach(() => {
    mockClient = {
      send: jest.fn()
    }

    eventPoller = new EventPollerImpl(mockClient, 'test-stack', 1000, 5000)
  })

  describe('Constructor and basic functionality', () => {
    it('should initialize with correct default values', () => {
      expect(eventPoller.getCurrentInterval()).toBe(1000)
    })

    it('should use default intervals when not specified', () => {
      const defaultPoller = new EventPollerImpl(mockClient, 'test-stack')
      expect(defaultPoller.getCurrentInterval()).toBe(2000)
    })
  })

  describe('Interval management', () => {
    it('should reset interval to initial value', () => {
      // Simulate increasing interval
      eventPoller['increaseInterval']()
      expect(eventPoller.getCurrentInterval()).toBeGreaterThan(1000)

      // Reset should bring it back to initial
      eventPoller.resetInterval()
      expect(eventPoller.getCurrentInterval()).toBe(1000)
    })

    it('should increase interval with exponential backoff', () => {
      const initialInterval = eventPoller.getCurrentInterval()
      eventPoller['increaseInterval']()

      const newInterval = eventPoller.getCurrentInterval()
      expect(newInterval).toBe(initialInterval * 1.5)
    })

    it('should not exceed maximum interval', () => {
      // Increase interval multiple times to hit the max
      for (let i = 0; i < 10; i++) {
        eventPoller['increaseInterval']()
      }

      expect(eventPoller.getCurrentInterval()).toBe(5000) // maxIntervalMs
    })
  })

  describe('Event filtering and tracking', () => {
    it('should filter new events correctly', () => {
      // Set deployment start time to before the test events
      eventPoller.setDeploymentStartTime(new Date('2022-12-31T23:59:59Z'))

      const allEvents: StackEvent[] = [
        {
          Timestamp: new Date('2023-01-01T10:00:00Z'),
          LogicalResourceId: 'Resource1',
          ResourceStatus: 'CREATE_IN_PROGRESS'
        },
        {
          Timestamp: new Date('2023-01-01T10:01:00Z'),
          LogicalResourceId: 'Resource2',
          ResourceStatus: 'CREATE_COMPLETE'
        }
      ]

      const newEvents = eventPoller['filterNewEvents'](allEvents)
      expect(newEvents).toHaveLength(2)
      expect(newEvents[0].LogicalResourceId).toBe('Resource1')
      expect(newEvents[1].LogicalResourceId).toBe('Resource2')
    })

    it('should not return duplicate events', () => {
      // Set deployment start time to before the test event
      eventPoller.setDeploymentStartTime(new Date('2022-12-31T23:59:59Z'))

      const event: StackEvent = {
        Timestamp: new Date('2023-01-01T10:00:00Z'),
        LogicalResourceId: 'Resource1',
        ResourceStatus: 'CREATE_IN_PROGRESS'
      }

      // First call should return the event
      let newEvents = eventPoller['filterNewEvents']([event])
      expect(newEvents).toHaveLength(1)

      // Update tracking
      eventPoller['updateEventTracking'](newEvents)

      // Second call with same event should return empty
      newEvents = eventPoller['filterNewEvents']([event])
      expect(newEvents).toHaveLength(0)
    })

    it('should sort events by timestamp', () => {
      // Set deployment start time to before the test events
      eventPoller.setDeploymentStartTime(new Date('2022-12-31T23:59:59Z'))

      const allEvents: StackEvent[] = [
        {
          Timestamp: new Date('2023-01-01T10:02:00Z'),
          LogicalResourceId: 'Resource2',
          ResourceStatus: 'CREATE_COMPLETE'
        },
        {
          Timestamp: new Date('2023-01-01T10:00:00Z'),
          LogicalResourceId: 'Resource1',
          ResourceStatus: 'CREATE_IN_PROGRESS'
        }
      ]

      const newEvents = eventPoller['filterNewEvents'](allEvents)
      expect(newEvents[0].LogicalResourceId).toBe('Resource1') // Earlier timestamp
      expect(newEvents[1].LogicalResourceId).toBe('Resource2') // Later timestamp
    })

    it('should filter out events from before deployment start time', () => {
      // Set deployment start time to after some events
      eventPoller.setDeploymentStartTime(new Date('2023-01-01T10:00:30Z'))

      const allEvents: StackEvent[] = [
        {
          Timestamp: new Date('2023-01-01T09:59:00Z'), // More than 30 seconds before deployment start
          LogicalResourceId: 'OldResource',
          ResourceStatus: 'CREATE_COMPLETE'
        },
        {
          Timestamp: new Date('2023-01-01T10:01:00Z'), // After deployment start
          LogicalResourceId: 'NewResource',
          ResourceStatus: 'CREATE_IN_PROGRESS'
        }
      ]

      const newEvents = eventPoller['filterNewEvents'](allEvents)
      expect(newEvents).toHaveLength(1)
      expect(newEvents[0].LogicalResourceId).toBe('NewResource')
    })

    it('should get and set deployment start time', () => {
      const testTime = new Date('2023-01-01T12:00:00Z')
      eventPoller.setDeploymentStartTime(testTime)

      const retrievedTime = eventPoller.getDeploymentStartTime()
      expect(retrievedTime).toEqual(testTime)
    })
  })

  describe('API integration', () => {
    it('should call CloudFormation API with correct parameters', async () => {
      // Set deployment start time to before the test event
      eventPoller.setDeploymentStartTime(new Date('2022-12-31T23:59:59Z'))

      const mockResponse = {
        OperationEvents: [
          {
            Timestamp: new Date('2023-01-01T10:00:00Z'),
            LogicalResourceId: 'TestResource',
            ResourceStatus: 'CREATE_IN_PROGRESS'
          }
        ]
      }

      mockClient.send.mockResolvedValue(mockResponse)

      const events = await eventPoller.pollEvents()

      expect(mockClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { StackName: 'test-stack', ChangeSetName: undefined }
        })
      )
      expect(events).toHaveLength(1)
      expect(events[0].LogicalResourceId).toBe('TestResource')
    })

    it('should handle empty response', async () => {
      mockClient.send.mockResolvedValue({ OperationEvents: [] })

      const events = await eventPoller.pollEvents()
      expect(events).toHaveLength(0)
    })

    it('should handle throttling exceptions', async () => {
      const throttlingError = new Error('Rate exceeded')
      throttlingError.name = 'ThrottlingException'

      mockClient.send.mockRejectedValue(throttlingError)

      const initialInterval = eventPoller.getCurrentInterval()

      await expect(eventPoller.pollEvents()).rejects.toThrow(throttlingError)

      // Should double the interval on throttling
      expect(eventPoller.getCurrentInterval()).toBe(initialInterval * 2)
    })

    it('should re-throw non-throttling errors', async () => {
      const genericError = new Error('Generic API error')
      mockClient.send.mockRejectedValue(genericError)

      await expect(eventPoller.pollEvents()).rejects.toThrow(genericError)
    })
  })

  describe('Event tracking behavior', () => {
    it('should reset interval when new events are found', async () => {
      // Set deployment start time to before the test event
      eventPoller.setDeploymentStartTime(new Date('2022-12-31T23:59:59Z'))

      const mockResponse = {
        OperationEvents: [
          {
            Timestamp: new Date('2023-01-01T10:00:00Z'),
            LogicalResourceId: 'TestResource',
            ResourceStatus: 'CREATE_IN_PROGRESS'
          }
        ]
      }

      mockClient.send.mockResolvedValue(mockResponse)

      // Increase interval first
      eventPoller['increaseInterval']()
      expect(eventPoller.getCurrentInterval()).toBeGreaterThan(1000)

      // Poll events should reset interval
      await eventPoller.pollEvents()
      expect(eventPoller.getCurrentInterval()).toBe(1000)
    })

    it('should increase interval when no new events are found', async () => {
      mockClient.send.mockResolvedValue({ OperationEvents: [] })

      const initialInterval = eventPoller.getCurrentInterval()
      await eventPoller.pollEvents()

      expect(eventPoller.getCurrentInterval()).toBe(initialInterval * 1.5)
    })
  })
})

describe('ErrorExtractor Implementation', () => {
  let colorFormatter: ColorFormatterImpl
  let errorExtractor: ErrorExtractorImpl

  beforeEach(() => {
    colorFormatter = new ColorFormatterImpl(true)
    errorExtractor = new ErrorExtractorImpl(colorFormatter)
  })

  describe('Error detection', () => {
    it('should identify error events correctly', () => {
      const errorEvent: StackEvent = {
        Timestamp: new Date(),
        LogicalResourceId: 'MyResource',
        ResourceType: 'AWS::S3::Bucket',
        ResourceStatus: 'CREATE_FAILED',
        ResourceStatusReason: 'Access denied'
      }

      expect(errorExtractor.isErrorEvent(errorEvent)).toBe(true)
    })

    it('should identify rollback events as errors', () => {
      const rollbackEvent: StackEvent = {
        Timestamp: new Date(),
        LogicalResourceId: 'MyResource',
        ResourceType: 'AWS::S3::Bucket',
        ResourceStatus: 'UPDATE_ROLLBACK_IN_PROGRESS',
        ResourceStatusReason: 'Rolling back due to failure'
      }

      expect(errorExtractor.isErrorEvent(rollbackEvent)).toBe(true)
    })

    it('should not identify success events as errors', () => {
      const successEvent: StackEvent = {
        Timestamp: new Date(),
        LogicalResourceId: 'MyResource',
        ResourceType: 'AWS::S3::Bucket',
        ResourceStatus: 'CREATE_COMPLETE',
        ResourceStatusReason: 'Resource created successfully'
      }

      expect(errorExtractor.isErrorEvent(successEvent)).toBe(false)
    })

    it('should handle events without status', () => {
      const eventWithoutStatus: StackEvent = {
        Timestamp: new Date(),
        LogicalResourceId: 'MyResource',
        ResourceType: 'AWS::S3::Bucket'
      }

      expect(errorExtractor.isErrorEvent(eventWithoutStatus)).toBe(false)
    })
  })

  describe('Error extraction', () => {
    it('should extract error information from error events', () => {
      const errorEvent: StackEvent = {
        Timestamp: new Date('2023-01-01T12:00:00Z'),
        LogicalResourceId: 'MyResource',
        ResourceType: 'AWS::S3::Bucket',
        ResourceStatus: 'CREATE_FAILED',
        ResourceStatusReason: 'Access denied to S3 service'
      }

      const extractedError = errorExtractor.extractError(errorEvent)

      expect(extractedError).not.toBeNull()
      expect(extractedError!.message).toBe('Access denied to S3 service')
      expect(extractedError!.resourceId).toBe('MyResource')
      expect(extractedError!.resourceType).toBe('AWS::S3::Bucket')
      expect(extractedError!.timestamp).toEqual(
        new Date('2023-01-01T12:00:00Z')
      )
    })

    it('should return null for non-error events', () => {
      const successEvent: StackEvent = {
        Timestamp: new Date(),
        LogicalResourceId: 'MyResource',
        ResourceType: 'AWS::S3::Bucket',
        ResourceStatus: 'CREATE_COMPLETE'
      }

      const extractedError = errorExtractor.extractError(successEvent)
      expect(extractedError).toBeNull()
    })

    it('should handle missing fields with defaults', () => {
      const incompleteErrorEvent: StackEvent = {
        ResourceStatus: 'CREATE_FAILED'
      }

      const extractedError = errorExtractor.extractError(incompleteErrorEvent)

      expect(extractedError).not.toBeNull()
      expect(extractedError!.message).toBe('Unknown error occurred')
      expect(extractedError!.resourceId).toBe('Unknown resource')
      expect(extractedError!.resourceType).toBe('Unknown type')
      expect(extractedError!.timestamp).toBeInstanceOf(Date)
    })
  })

  describe('Error message formatting', () => {
    it('should format error messages with colors and structure', () => {
      const error: ExtractedError = {
        message: 'Access denied to S3 service',
        resourceId: 'MyBucket',
        resourceType: 'AWS::S3::Bucket',
        timestamp: new Date('2023-01-01T12:00:00Z')
      }

      const formattedMessage = errorExtractor.formatErrorMessage(error)

      expect(formattedMessage).toContain('2023-01-01T12:00:00.000Z')
      expect(formattedMessage).toContain('AWS::S3::Bucket/MyBucket')
      expect(formattedMessage).toContain('ERROR:')
      expect(formattedMessage).toContain('Access denied to S3 service')
      // Should contain ANSI color codes
      expect(formattedMessage).toContain('\x1b[')
    })

    it('should format multiple errors with clear separation', () => {
      const errors: ExtractedError[] = [
        {
          message: 'First error',
          resourceId: 'Resource1',
          resourceType: 'AWS::S3::Bucket',
          timestamp: new Date('2023-01-01T12:00:00Z')
        },
        {
          message: 'Second error',
          resourceId: 'Resource2',
          resourceType: 'AWS::Lambda::Function',
          timestamp: new Date('2023-01-01T12:01:00Z')
        }
      ]

      const formattedMessage = errorExtractor.formatMultipleErrors(errors)

      expect(formattedMessage).toContain('[1]')
      expect(formattedMessage).toContain('[2]')
      expect(formattedMessage).toContain('First error')
      expect(formattedMessage).toContain('Second error')
      expect(formattedMessage).toContain('\n')
    })

    it('should handle single error in multiple errors format', () => {
      const errors: ExtractedError[] = [
        {
          message: 'Single error',
          resourceId: 'Resource1',
          resourceType: 'AWS::S3::Bucket',
          timestamp: new Date('2023-01-01T12:00:00Z')
        }
      ]

      const formattedMessage = errorExtractor.formatMultipleErrors(errors)

      expect(formattedMessage).toContain('Single error')
      expect(formattedMessage).not.toContain('[1]')
    })

    it('should handle empty error array', () => {
      const formattedMessage = errorExtractor.formatMultipleErrors([])
      expect(formattedMessage).toBe('')
    })
  })

  describe('Batch error extraction', () => {
    it('should extract all errors from a batch of events', () => {
      const events: StackEvent[] = [
        {
          Timestamp: new Date(),
          LogicalResourceId: 'Resource1',
          ResourceType: 'AWS::S3::Bucket',
          ResourceStatus: 'CREATE_COMPLETE'
        },
        {
          Timestamp: new Date(),
          LogicalResourceId: 'Resource2',
          ResourceType: 'AWS::Lambda::Function',
          ResourceStatus: 'CREATE_FAILED',
          ResourceStatusReason: 'Function creation failed'
        },
        {
          Timestamp: new Date(),
          LogicalResourceId: 'Resource3',
          ResourceType: 'AWS::DynamoDB::Table',
          ResourceStatus: 'UPDATE_ROLLBACK_FAILED',
          ResourceStatusReason: 'Rollback failed'
        }
      ]

      const errors = errorExtractor.extractAllErrors(events)

      expect(errors).toHaveLength(2)
      expect(errors[0].resourceId).toBe('Resource2')
      expect(errors[0].message).toBe('Function creation failed')
      expect(errors[1].resourceId).toBe('Resource3')
      expect(errors[1].message).toBe('Rollback failed')
    })

    it('should return empty array when no errors found', () => {
      const events: StackEvent[] = [
        {
          Timestamp: new Date(),
          LogicalResourceId: 'Resource1',
          ResourceType: 'AWS::S3::Bucket',
          ResourceStatus: 'CREATE_COMPLETE'
        },
        {
          Timestamp: new Date(),
          LogicalResourceId: 'Resource2',
          ResourceType: 'AWS::Lambda::Function',
          ResourceStatus: 'UPDATE_COMPLETE'
        }
      ]

      const errors = errorExtractor.extractAllErrors(events)
      expect(errors).toHaveLength(0)
    })
  })
})
