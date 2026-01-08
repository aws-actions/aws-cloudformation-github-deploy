import * as core from '@actions/core'
import {
  ErrorExtractorImpl,
  EventFormatterImpl,
  ColorFormatterImpl,
  StackEvent,
  ExtractedError
} from '../src/event-streaming'

describe('Event Streaming Simple Coverage Tests', () => {
  let mockCoreDebug: jest.SpyInstance

  beforeEach(() => {
    mockCoreDebug = jest.spyOn(core, 'debug').mockImplementation()
  })

  afterEach(() => {
    mockCoreDebug.mockRestore()
  })

  describe('ErrorExtractorImpl edge cases', () => {
    test('should handle invalid timestamp gracefully', () => {
      const colorFormatter = new ColorFormatterImpl(true)
      const errorExtractor = new ErrorExtractorImpl(colorFormatter)

      // Create error with invalid timestamp
      const invalidDate = new Date('invalid-date')
      const error: ExtractedError = {
        timestamp: invalidDate,
        resourceType: 'AWS::S3::Bucket',
        resourceId: 'TestBucket',
        message: 'Access denied'
      }

      const result = errorExtractor.formatErrorMessage(error)

      // Should handle invalid timestamp gracefully
      expect(result).toContain('TestBucket')
      expect(result).toContain('Access denied')
      expect(mockCoreDebug).toHaveBeenCalledWith(
        expect.stringContaining('Invalid timestamp in error')
      )
    })

    test('should detect truncated messages', () => {
      const colorFormatter = new ColorFormatterImpl(true)
      const errorExtractor = new ErrorExtractorImpl(colorFormatter)

      const error: ExtractedError = {
        timestamp: new Date(),
        resourceType: 'AWS::S3::Bucket',
        resourceId: 'TestBucket',
        message: 'This message is truncated...'
      }

      const result = errorExtractor.formatErrorMessage(error)
      expect(result).toContain('truncated')
    })

    test('should handle missing fields with defaults', () => {
      const colorFormatter = new ColorFormatterImpl(true)
      const errorExtractor = new ErrorExtractorImpl(colorFormatter)

      const event: StackEvent = {
        Timestamp: new Date(),
        ResourceStatus: 'CREATE_FAILED'
        // Missing other fields
      }

      const extractedError = errorExtractor.extractError(event)
      expect(extractedError).toBeDefined()
      expect(extractedError?.resourceType).toBe('Unknown type')
      expect(extractedError?.resourceId).toBe('Unknown resource')
      expect(extractedError?.message).toBe('Unknown error occurred')
    })
  })

  describe('EventFormatterImpl edge cases', () => {
    test('should handle events without timestamp', () => {
      const colorFormatter = new ColorFormatterImpl(true)
      const errorExtractor = new ErrorExtractorImpl(colorFormatter)
      const formatter = new EventFormatterImpl(colorFormatter, errorExtractor)

      const event: StackEvent = {
        // No timestamp
        ResourceStatus: 'CREATE_IN_PROGRESS',
        ResourceType: 'AWS::S3::Bucket',
        LogicalResourceId: 'TestBucket'
      }

      const result = formatter.formatEvent(event)
      expect(result.timestamp).toContain('Unknown time')
    })

    test('should handle events with physical resource ID display', () => {
      const colorFormatter = new ColorFormatterImpl(true)
      const errorExtractor = new ErrorExtractorImpl(colorFormatter)
      const formatter = new EventFormatterImpl(colorFormatter, errorExtractor, {
        maxResourceNameLength: 50,
        showPhysicalId: true
      })

      const event: StackEvent = {
        Timestamp: new Date(),
        ResourceStatus: 'CREATE_COMPLETE',
        ResourceType: 'AWS::S3::Bucket',
        LogicalResourceId: 'TestBucket',
        PhysicalResourceId: 'test-bucket-physical-id-12345'
      }

      const result = formatter.formatEvent(event)
      expect(result.resourceInfo).toContain('test-bucket-physical-id-12345')
    })

    test('should truncate long resource names', () => {
      const colorFormatter = new ColorFormatterImpl(true)
      const errorExtractor = new ErrorExtractorImpl(colorFormatter)
      const formatter = new EventFormatterImpl(colorFormatter, errorExtractor, {
        maxResourceNameLength: 10,
        showPhysicalId: false
      })

      const event: StackEvent = {
        Timestamp: new Date(),
        ResourceStatus: 'CREATE_IN_PROGRESS',
        ResourceType: 'AWS::S3::Bucket',
        LogicalResourceId: 'VeryLongResourceNameThatShouldBeTruncated'
      }

      const result = formatter.formatEvent(event)
      expect(result.resourceInfo).toContain('VeryLon...')
    })

    test('should format deployment summary correctly', () => {
      const colorFormatter = new ColorFormatterImpl(true)
      const errorExtractor = new ErrorExtractorImpl(colorFormatter)
      const formatter = new EventFormatterImpl(colorFormatter, errorExtractor)

      const summary = formatter.formatDeploymentSummary(
        'TestStack',
        'CREATE_COMPLETE',
        10,
        2,
        5000
      )

      expect(summary).toContain('TestStack')
      expect(summary).toContain('CREATE_COMPLETE')
      expect(summary).toContain('10')
      expect(summary).toContain('2')
      expect(summary).toContain('5s')
    })

    test('should format deployment summary without duration', () => {
      const colorFormatter = new ColorFormatterImpl(true)
      const errorExtractor = new ErrorExtractorImpl(colorFormatter)
      const formatter = new EventFormatterImpl(colorFormatter, errorExtractor)

      const summary = formatter.formatDeploymentSummary(
        'TestStack',
        'CREATE_COMPLETE',
        10,
        2
      )

      expect(summary).toContain('TestStack')
      expect(summary).toContain('CREATE_COMPLETE')
      expect(summary).toContain('10')
      expect(summary).toContain('2')
      expect(summary).not.toContain('Duration')
    })
  })

  describe('ColorFormatterImpl', () => {
    test('should handle colors enabled/disabled', () => {
      const colorFormatter = new ColorFormatterImpl(false)

      expect(colorFormatter.isColorsEnabled()).toBe(false)

      colorFormatter.setColorsEnabled(true)
      expect(colorFormatter.isColorsEnabled()).toBe(true)
    })
  })
})
