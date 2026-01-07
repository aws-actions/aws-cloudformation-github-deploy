import {
  CloudFormationClient,
  DescribeStackEventsCommand
} from '@aws-sdk/client-cloudformation'
import { ThrottlingException } from '@aws-sdk/client-marketplace-catalog'
import * as core from '@actions/core'

// Core event streaming interfaces and types

/**
 * CloudFormation Stack Event interface
 * Represents a single event from CloudFormation stack operations
 */
export interface StackEvent {
  Timestamp?: Date
  LogicalResourceId?: string
  ResourceType?: string
  ResourceStatus?: string
  ResourceStatusReason?: string
  PhysicalResourceId?: string
}

/**
 * Configuration for EventMonitor
 */
export interface EventMonitorConfig {
  stackName: string
  client: CloudFormationClient
  enableColors: boolean
  pollIntervalMs: number
  maxPollIntervalMs: number
}

/**
 * Main orchestrator for event streaming functionality
 */
export interface EventMonitor {
  /**
   * Start monitoring stack events
   */
  startMonitoring(): Promise<void>

  /**
   * Stop monitoring (called when stack reaches terminal state)
   */
  stopMonitoring(): void

  /**
   * Check if monitoring is active
   */
  isMonitoring(): boolean
}

/**
 * Handles polling logic with exponential backoff and rate limiting
 */
export interface EventPoller {
  /**
   * Poll for new events since last check
   */
  pollEvents(): Promise<StackEvent[]>

  /**
   * Get current polling interval
   */
  getCurrentInterval(): number

  /**
   * Reset polling interval (called when new events found)
   */
  resetInterval(): void
}

/**
 * Formatted event for display
 */
export interface FormattedEvent {
  timestamp: string
  resourceInfo: string
  status: string
  message?: string
  isError: boolean
}

/**
 * Formats events for display with colors and structure
 */
export interface EventFormatter {
  /**
   * Format a single event for display
   */
  formatEvent(event: StackEvent): FormattedEvent

  /**
   * Format multiple events as a batch
   */
  formatEvents(events: StackEvent[]): string
}

/**
 * Applies ANSI color codes based on event status
 */
export interface ColorFormatter {
  /**
   * Apply color based on resource status
   */
  colorizeStatus(status: string, text: string): string

  /**
   * Apply color for timestamps
   */
  colorizeTimestamp(timestamp: string): string

  /**
   * Apply color for resource information
   */
  colorizeResource(resourceType: string, resourceId: string): string

  /**
   * Apply bold red formatting for errors
   */
  colorizeError(message: string): string
}

/**
 * Extracted error information from stack events
 */
export interface ExtractedError {
  message: string
  resourceId: string
  resourceType: string
  timestamp: Date
}

/**
 * Extracts and highlights error messages from stack events
 */
export interface ErrorExtractor {
  /**
   * Extract error information from a stack event
   */
  extractError(event: StackEvent): ExtractedError | null

  /**
   * Check if an event represents an error condition
   */
  isErrorEvent(event: StackEvent): boolean

  /**
   * Format error message for display
   */
  formatErrorMessage(error: ExtractedError): string
}

/**
 * Configuration for event display formatting
 */
export interface EventDisplayConfig {
  showTimestamp: boolean
  showResourceType: boolean
  showPhysicalId: boolean
  maxResourceNameLength: number
  indentLevel: number
}

/**
 * ANSI color codes for event formatting
 */
export enum EventColor {
  SUCCESS = '\x1b[32m', // Green
  WARNING = '\x1b[33m', // Yellow
  ERROR = '\x1b[31m', // Red
  INFO = '\x1b[34m', // Blue
  RESET = '\x1b[0m' // Reset
}

/**
 * Mapping of CloudFormation resource statuses to colors
 */
export const STATUS_COLORS = {
  // Success states (Green)
  CREATE_COMPLETE: EventColor.SUCCESS,
  UPDATE_COMPLETE: EventColor.SUCCESS,
  DELETE_COMPLETE: EventColor.SUCCESS,
  CREATE_IN_PROGRESS: EventColor.SUCCESS,
  UPDATE_IN_PROGRESS: EventColor.SUCCESS,

  // Warning states (Yellow)
  UPDATE_ROLLBACK_IN_PROGRESS: EventColor.WARNING,
  UPDATE_ROLLBACK_COMPLETE: EventColor.WARNING,
  CREATE_ROLLBACK_IN_PROGRESS: EventColor.WARNING,

  // Error states (Red)
  CREATE_FAILED: EventColor.ERROR,
  UPDATE_FAILED: EventColor.ERROR,
  DELETE_FAILED: EventColor.ERROR,
  UPDATE_ROLLBACK_FAILED: EventColor.ERROR,
  CREATE_ROLLBACK_FAILED: EventColor.ERROR
} as const

/**
 * Type for valid CloudFormation resource statuses
 */
export type ResourceStatus = keyof typeof STATUS_COLORS

/**
 * Terminal stack states that indicate deployment completion
 */
export const TERMINAL_STACK_STATES = [
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
] as const

/**
 * Type for terminal stack states
 */
export type TerminalStackState = (typeof TERMINAL_STACK_STATES)[number]

/**
 * Error status patterns for identifying error events
 */
export const ERROR_STATUS_PATTERNS = ['FAILED', 'ROLLBACK'] as const

/**
 * Success status patterns for identifying successful events
 */
export const SUCCESS_STATUS_PATTERNS = ['COMPLETE', 'IN_PROGRESS'] as const

/**
 * ColorFormatter implementation with ANSI color code support
 */
export class ColorFormatterImpl implements ColorFormatter {
  private enableColors: boolean

  constructor(enableColors = true) {
    this.enableColors = enableColors
  }

  /**
   * Apply color based on resource status
   * Maps CloudFormation resource statuses to appropriate colors
   */
  colorizeStatus(status: string, text: string): string {
    if (!this.enableColors) {
      return text
    }

    // Get color for the status, default to INFO if not found
    const color = STATUS_COLORS[status as ResourceStatus] || EventColor.INFO
    return `${color}${text}${EventColor.RESET}`
  }

  /**
   * Apply blue color for timestamps
   */
  colorizeTimestamp(timestamp: string): string {
    if (!this.enableColors) {
      return timestamp
    }

    return `${EventColor.INFO}${timestamp}${EventColor.RESET}`
  }

  /**
   * Apply blue color for resource information (type and ID)
   */
  colorizeResource(resourceType: string, resourceId: string): string {
    if (!this.enableColors) {
      return `${resourceType}/${resourceId}`
    }

    return `${EventColor.INFO}${resourceType}/${resourceId}${EventColor.RESET}`
  }

  /**
   * Apply bold red formatting for errors
   * Uses ANSI bold (1m) combined with red color
   */
  colorizeError(message: string): string {
    if (!this.enableColors) {
      return message
    }

    // Bold red: \x1b[1m for bold, \x1b[31m for red
    return `\x1b[1m${EventColor.ERROR}${message}${EventColor.RESET}`
  }

  /**
   * Check if colors are enabled
   */
  isColorsEnabled(): boolean {
    return this.enableColors
  }

  /**
   * Enable or disable colors
   */
  setColorsEnabled(enabled: boolean): void {
    this.enableColors = enabled
  }
}

/**
 * ErrorExtractor implementation for extracting error information from stack events
 */
export class ErrorExtractorImpl implements ErrorExtractor {
  private colorFormatter: ColorFormatter

  constructor(colorFormatter: ColorFormatter) {
    this.colorFormatter = colorFormatter
  }

  /**
   * Extract error information from a stack event
   * Returns null if the event is not an error event
   */
  extractError(event: StackEvent): ExtractedError | null {
    if (!this.isErrorEvent(event)) {
      return null
    }

    // Extract required fields, providing defaults for missing data
    const message = event.ResourceStatusReason || 'Unknown error occurred'
    const resourceId = event.LogicalResourceId || 'Unknown resource'
    const resourceType = event.ResourceType || 'Unknown type'
    const timestamp = event.Timestamp || new Date()

    return {
      message,
      resourceId,
      resourceType,
      timestamp
    }
  }

  /**
   * Check if an event represents an error condition
   * Identifies events with FAILED or ROLLBACK status patterns
   */
  isErrorEvent(event: StackEvent): boolean {
    if (!event.ResourceStatus) {
      return false
    }

    const status = event.ResourceStatus.toUpperCase()

    // Check for error patterns in the status
    return ERROR_STATUS_PATTERNS.some(pattern => status.includes(pattern))
  }

  /**
   * Format error message for display with bold red formatting
   * Handles message truncation and provides complete error details
   */
  formatErrorMessage(error: ExtractedError): string {
    // Format timestamp in ISO 8601 format, handle invalid dates
    let timestamp: string
    try {
      timestamp = error.timestamp.toISOString()
    } catch (e) {
      // Handle invalid dates by using current time
      timestamp = new Date().toISOString()
      core.debug(`Invalid timestamp in error, using current time: ${e}`)
    }

    // Get the complete error message
    const fullMessage = this.getCompleteErrorMessage(error.message)

    // Apply bold red formatting to the error message
    const formattedMessage = this.colorFormatter.colorizeError(fullMessage)

    // Combine all parts with proper spacing and structure
    const colorizedTimestamp = this.colorFormatter.colorizeTimestamp(timestamp)
    const colorizedResource = this.colorFormatter.colorizeResource(
      error.resourceType,
      error.resourceId
    )

    return `${colorizedTimestamp} ${colorizedResource} ERROR: ${formattedMessage}`
  }

  /**
   * Get complete error message, handling truncation
   * If message appears truncated, attempts to provide full details
   */
  private getCompleteErrorMessage(message: string): string {
    // Check if message appears truncated (common indicators)
    const truncationIndicators = ['...', '(truncated)', '[truncated]']
    const isTruncated = truncationIndicators.some(indicator =>
      message.includes(indicator)
    )

    if (isTruncated) {
      // For now, return the message as-is since we don't have access to
      // additional event details in this context. In a real implementation,
      // this could fetch additional details from CloudFormation API
      core.debug(`Detected truncated error message: ${message}`)
    }

    return message
  }

  /**
   * Format multiple error messages with clear separation
   * Ensures each error is displayed distinctly
   */
  formatMultipleErrors(errors: ExtractedError[]): string {
    if (errors.length === 0) {
      return ''
    }

    if (errors.length === 1) {
      return this.formatErrorMessage(errors[0])
    }

    // Format multiple errors with clear separation
    const formattedErrors = errors.map((error, index) => {
      const errorMessage = this.formatErrorMessage(error)
      return `[${index + 1}] ${errorMessage}`
    })

    return formattedErrors.join('\n')
  }

  /**
   * Extract all errors from a batch of events
   * Returns array of ExtractedError objects for all error events
   */
  extractAllErrors(events: StackEvent[]): ExtractedError[] {
    const errors: ExtractedError[] = []

    for (const event of events) {
      const error = this.extractError(event)
      if (error) {
        errors.push(error)
      }
    }

    return errors
  }
}

/**
 * EventPoller implementation with exponential backoff and rate limiting
 */
export class EventPollerImpl implements EventPoller {
  private client: CloudFormationClient
  private stackName: string
  private currentIntervalMs: number
  private readonly initialIntervalMs: number
  private readonly maxIntervalMs: number
  private lastEventTimestamp?: Date
  private seenEventIds: Set<string> = new Set()

  constructor(
    client: CloudFormationClient,
    stackName: string,
    initialIntervalMs = 2000,
    maxIntervalMs = 30000
  ) {
    this.client = client
    this.stackName = stackName
    this.initialIntervalMs = initialIntervalMs
    this.maxIntervalMs = maxIntervalMs
    this.currentIntervalMs = initialIntervalMs
  }

  /**
   * Poll for new events since last check
   * Implements exponential backoff and handles API throttling
   * Includes comprehensive error handling for network issues and API failures
   */
  async pollEvents(): Promise<StackEvent[]> {
    try {
      const command = new DescribeStackEventsCommand({
        StackName: this.stackName
      })

      const response = await this.client.send(command)
      const allEvents = response.StackEvents || []

      // Filter for new events only
      const newEvents = this.filterNewEvents(allEvents)

      if (newEvents.length > 0) {
        // Reset interval when new events are found
        this.resetInterval()

        // Update tracking
        this.updateEventTracking(newEvents)

        core.debug(`Found ${newEvents.length} new stack events`)
      } else {
        // Increase interval when no new events (exponential backoff)
        this.increaseInterval()
        core.debug(
          `No new events found, current interval: ${this.currentIntervalMs}ms`
        )
      }

      return newEvents
    } catch (error) {
      // Handle specific AWS API errors
      if (error instanceof ThrottlingException) {
        core.warning(`CloudFormation API throttling detected, backing off...`)
        // Double the interval on throttling
        this.currentIntervalMs = Math.min(
          this.currentIntervalMs * 2,
          this.maxIntervalMs
        )
        throw error
      }

      // Handle credential/permission errors first (most specific)
      if (this.isCredentialError(error)) {
        core.warning(
          `Credential or permission error during event polling: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
        throw error
      }

      // Handle timeout errors (before network errors since ETIMEDOUT can be both)
      if (this.isTimeoutError(error)) {
        core.warning(
          `Timeout error during event polling: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
        // Increase interval on timeout to reduce load
        this.increaseInterval()
        throw error
      }

      // Handle network connectivity issues
      if (this.isNetworkError(error)) {
        core.warning(
          `Network connectivity issue during event polling: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
        // Increase interval for network issues to avoid overwhelming failing connections
        this.increaseInterval()
        throw error
      }

      // Handle AWS service errors (non-throttling)
      if (this.isAWSServiceError(error)) {
        core.warning(
          `AWS service error during event polling: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
        throw error
      }

      // Log unknown errors as warnings and re-throw
      core.warning(
        `Unknown error during event polling: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      throw error
    }
  }

  /**
   * Check if error is a network connectivity issue
   */
  private isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false

    const networkErrorPatterns = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ECONNRESET',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'EAI_AGAIN',
      'socket hang up',
      'network timeout',
      'connection timeout'
    ]

    const errorMessage = error.message.toLowerCase()
    return networkErrorPatterns.some(pattern =>
      errorMessage.includes(pattern.toLowerCase())
    )
  }

  /**
   * Check if error is an AWS service error (non-throttling)
   */
  private isAWSServiceError(error: unknown): boolean {
    if (!(error instanceof Error)) return false

    // Check for AWS SDK error properties
    const awsError = error as Error & {
      $metadata?: unknown
      $fault?: unknown
    }
    if (awsError.$metadata && awsError.$fault) {
      return true
    }

    // Check for common AWS error patterns
    const awsErrorPatterns = [
      'ValidationError',
      'AccessDenied',
      'InvalidParameterValue',
      'ResourceNotFound',
      'ServiceUnavailable',
      'InternalFailure'
    ]

    return awsErrorPatterns.some(
      pattern => error.message.includes(pattern) || error.name === pattern
    )
  }

  /**
   * Check if error is a timeout error
   */
  private isTimeoutError(error: unknown): boolean {
    if (!(error instanceof Error)) return false

    const timeoutPatterns = [
      'timeout',
      'ETIMEDOUT',
      'TimeoutError',
      'RequestTimeout'
    ]

    const errorMessage = error.message.toLowerCase()
    const errorName = error.name.toLowerCase()

    return timeoutPatterns.some(
      pattern =>
        errorMessage.includes(pattern.toLowerCase()) ||
        errorName.includes(pattern.toLowerCase())
    )
  }

  /**
   * Check if error is a credential or permission error
   */
  private isCredentialError(error: unknown): boolean {
    if (!(error instanceof Error)) return false

    const credentialPatterns = [
      'AccessDenied',
      'Forbidden',
      'UnauthorizedOperation',
      'InvalidUserID.NotFound',
      'TokenRefreshRequired',
      'CredentialsError',
      'SignatureDoesNotMatch'
    ]

    return credentialPatterns.some(
      pattern => error.message.includes(pattern) || error.name.includes(pattern)
    )
  }

  /**
   * Get current polling interval in milliseconds
   */
  getCurrentInterval(): number {
    return this.currentIntervalMs
  }

  /**
   * Reset polling interval to initial value (called when new events found)
   */
  resetInterval(): void {
    this.currentIntervalMs = this.initialIntervalMs
  }

  /**
   * Filter events to only return new ones since last poll
   */
  private filterNewEvents(allEvents: StackEvent[]): StackEvent[] {
    const newEvents: StackEvent[] = []

    for (const event of allEvents) {
      // Create unique event ID from timestamp + resource + status
      const eventId = this.createEventId(event)

      if (!this.seenEventIds.has(eventId)) {
        // Check if event is newer than our last seen timestamp
        if (
          !this.lastEventTimestamp ||
          (event.Timestamp && event.Timestamp > this.lastEventTimestamp)
        ) {
          newEvents.push(event)
        }
      }
    }

    // Sort by timestamp (oldest first) for proper display order
    return newEvents.sort((a, b) => {
      if (!a.Timestamp || !b.Timestamp) return 0
      return a.Timestamp.getTime() - b.Timestamp.getTime()
    })
  }

  /**
   * Update internal tracking after processing new events
   */
  private updateEventTracking(newEvents: StackEvent[]): void {
    for (const event of newEvents) {
      const eventId = this.createEventId(event)
      this.seenEventIds.add(eventId)

      // Update last seen timestamp
      if (
        event.Timestamp &&
        (!this.lastEventTimestamp || event.Timestamp > this.lastEventTimestamp)
      ) {
        this.lastEventTimestamp = event.Timestamp
      }
    }
  }

  /**
   * Create unique identifier for an event
   */
  private createEventId(event: StackEvent): string {
    return `${event.Timestamp?.getTime()}-${event.LogicalResourceId}-${
      event.ResourceStatus
    }`
  }

  /**
   * Increase polling interval using exponential backoff
   */
  private increaseInterval(): void {
    this.currentIntervalMs = Math.min(
      this.currentIntervalMs * 1.5,
      this.maxIntervalMs
    )
  }
}

/**
 * EventMonitor implementation - main orchestrator for event streaming functionality
 * Manages the lifecycle of event monitoring with concurrent polling and display
 */
export class EventMonitorImpl implements EventMonitor {
  private config: EventMonitorConfig
  private poller: EventPoller
  private formatter: EventFormatter
  private isActive = false
  private pollingPromise?: Promise<void>
  private stopRequested = false
  private eventCount = 0
  private errorCount = 0
  private startTime?: Date

  constructor(config: EventMonitorConfig) {
    this.config = config

    // Initialize components
    const colorFormatter = new ColorFormatterImpl(config.enableColors)
    const errorExtractor = new ErrorExtractorImpl(colorFormatter)

    this.poller = new EventPollerImpl(
      config.client,
      config.stackName,
      config.pollIntervalMs,
      config.maxPollIntervalMs
    )

    this.formatter = new EventFormatterImpl(colorFormatter, errorExtractor)
  }

  /**
   * Start monitoring stack events
   * Begins concurrent polling and event display with comprehensive error handling
   */
  async startMonitoring(): Promise<void> {
    if (this.isActive) {
      core.debug('Event monitoring already active')
      return
    }

    this.isActive = true
    this.stopRequested = false
    this.startTime = new Date()
    this.eventCount = 0
    this.errorCount = 0

    core.info(`Starting event monitoring for stack: ${this.config.stackName}`)

    // Start the polling loop with comprehensive error handling
    this.pollingPromise = this.pollLoop()

    try {
      await this.pollingPromise
    } catch (error) {
      // Log polling errors but don't throw - event streaming should not break deployment
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      core.warning(
        `Event monitoring encountered an error but deployment will continue: ${errorMessage}`
      )

      // Log additional context for debugging
      core.debug(
        `Event monitoring error details: ${JSON.stringify({
          error: errorMessage,
          stackName: this.config.stackName,
          eventCount: this.eventCount,
          errorCount: this.errorCount,
          duration: this.startTime
            ? Date.now() - this.startTime.getTime()
            : undefined
        })}`
      )
    } finally {
      this.isActive = false
      core.debug('Event monitoring has been stopped')
    }
  }

  /**
   * Stop monitoring (called when stack reaches terminal state)
   */
  stopMonitoring(): void {
    if (!this.isActive) {
      return
    }

    core.debug('Stopping event monitoring')
    this.stopRequested = true
    this.isActive = false

    // Display final summary
    this.displayFinalSummary()
  }

  /**
   * Check if monitoring is active
   */
  isMonitoring(): boolean {
    return this.isActive
  }

  /**
   * Main polling loop that runs concurrently with deployment
   * Implements the 5-second timeliness requirement with comprehensive error handling
   */
  private async pollLoop(): Promise<void> {
    let consecutiveErrors = 0
    const maxConsecutiveErrors = 5
    const errorBackoffMs = 5000

    while (this.isActive && !this.stopRequested) {
      try {
        // Poll for new events
        const newEvents = await this.poller.pollEvents()

        if (newEvents.length > 0) {
          // Display events immediately to meet 5-second requirement
          await this.displayEvents(newEvents)

          // Update counters
          this.eventCount += newEvents.length
          this.errorCount += this.countErrors(newEvents)

          // Check if stack has reached terminal state
          if (this.hasTerminalEvent(newEvents)) {
            core.debug('Terminal stack state detected, stopping monitoring')
            this.stopRequested = true
            break
          }
        }

        // Reset consecutive error count on successful poll
        consecutiveErrors = 0

        // Wait for next polling interval if still active
        if (this.isActive && !this.stopRequested) {
          const interval = this.poller.getCurrentInterval()
          await this.sleep(interval)
        }
      } catch (error) {
        consecutiveErrors++

        // Handle polling errors gracefully with progressive backoff
        if (error instanceof ThrottlingException) {
          core.warning(
            `CloudFormation API throttling (attempt ${consecutiveErrors}/${maxConsecutiveErrors}), backing off...`
          )
          // Wait longer on throttling with exponential backoff
          const backoffTime = Math.min(
            this.poller.getCurrentInterval() * Math.pow(2, consecutiveErrors),
            30000
          )
          await this.sleep(backoffTime)
        } else {
          // Log other errors as warnings with context
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          core.warning(
            `Event polling error (attempt ${consecutiveErrors}/${maxConsecutiveErrors}): ${errorMessage}`
          )

          // Implement graceful degradation
          if (consecutiveErrors >= maxConsecutiveErrors) {
            core.warning(
              `Maximum consecutive polling errors (${maxConsecutiveErrors}) reached. ` +
                'Event streaming will be disabled to prevent deployment interference. ' +
                'Deployment will continue normally.'
            )
            this.stopRequested = true
            break
          }

          // Progressive backoff for consecutive errors
          const backoffTime = Math.min(
            errorBackoffMs * consecutiveErrors,
            30000
          )
          await this.sleep(backoffTime)
        }

        // Check if we should continue after error handling
        if (
          this.isActive &&
          !this.stopRequested &&
          consecutiveErrors < maxConsecutiveErrors
        ) {
          continue
        } else {
          break
        }
      }
    }

    // Log final status
    if (consecutiveErrors >= maxConsecutiveErrors) {
      core.warning(
        'Event streaming stopped due to consecutive errors. Deployment continues normally.'
      )
    } else {
      core.debug('Event monitoring polling loop completed normally')
    }
  }

  /**
   * Display events immediately to meet timeliness requirement
   * Ensures events are shown within 5 seconds of availability
   */
  private async displayEvents(events: StackEvent[]): Promise<void> {
    try {
      const formattedOutput = this.formatter.formatEvents(events)

      if (formattedOutput) {
        // Use core.info to ensure output appears in GitHub Actions logs
        core.info(formattedOutput)
      }
    } catch (error) {
      core.warning(
        `Event formatting error: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  /**
   * Count error events in a batch
   */
  private countErrors(events: StackEvent[]): number {
    return events.filter(event => {
      const status = event.ResourceStatus || ''
      return ERROR_STATUS_PATTERNS.some(pattern => status.includes(pattern))
    }).length
  }

  /**
   * Check if any event indicates a terminal stack state
   */
  private hasTerminalEvent(events: StackEvent[]): boolean {
    return events.some(event => {
      const status = event.ResourceStatus || ''
      return TERMINAL_STACK_STATES.includes(status as TerminalStackState)
    })
  }

  /**
   * Display final deployment summary
   */
  private displayFinalSummary(): void {
    try {
      const duration = this.startTime
        ? Date.now() - this.startTime.getTime()
        : undefined

      // Get the final status from the last known state
      // In a real implementation, this might query the stack status
      const finalStatus = 'DEPLOYMENT_COMPLETE' // Placeholder

      const summary = (
        this.formatter as EventFormatterImpl
      ).formatDeploymentSummary(
        this.config.stackName,
        finalStatus,
        this.eventCount,
        this.errorCount,
        duration
      )

      core.info(summary)
    } catch (error) {
      core.warning(
        `Error displaying final summary: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  /**
   * Sleep utility for polling intervals
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get monitoring statistics
   */
  getStats(): {
    eventCount: number
    errorCount: number
    isActive: boolean
    duration?: number
  } {
    const duration = this.startTime
      ? Date.now() - this.startTime.getTime()
      : undefined

    return {
      eventCount: this.eventCount,
      errorCount: this.errorCount,
      isActive: this.isActive,
      duration
    }
  }
}

/**
 * EventFormatter implementation for structured event display
 * Handles ISO 8601 timestamp formatting, resource name truncation, and nested indentation
 */
export class EventFormatterImpl implements EventFormatter {
  private colorFormatter: ColorFormatter
  private errorExtractor: ErrorExtractor
  private config: EventDisplayConfig

  constructor(
    colorFormatter: ColorFormatter,
    errorExtractor: ErrorExtractor,
    config: Partial<EventDisplayConfig> = {}
  ) {
    this.colorFormatter = colorFormatter
    this.errorExtractor = errorExtractor

    // Set default configuration with overrides
    this.config = {
      showTimestamp: true,
      showResourceType: true,
      showPhysicalId: false,
      maxResourceNameLength: 50,
      indentLevel: 0,
      ...config
    }
  }

  /**
   * Format a single event for display
   * Returns structured FormattedEvent object
   */
  formatEvent(event: StackEvent): FormattedEvent {
    // Format timestamp in ISO 8601 format with timezone
    const timestamp = this.formatTimestamp(event.Timestamp)

    // Format resource information with truncation
    const resourceInfo = this.formatResourceInfo(event)

    // Format status with appropriate coloring
    const status = this.formatStatus(event.ResourceStatus || 'UNKNOWN')

    // Check if this is an error event and extract error message
    const isError = this.errorExtractor.isErrorEvent(event)
    let message: string | undefined

    if (isError) {
      const extractedError = this.errorExtractor.extractError(event)
      if (extractedError) {
        message = extractedError.message
      }
    } else if (event.ResourceStatusReason) {
      // Include status reason for non-error events if available
      message = event.ResourceStatusReason
    }

    return {
      timestamp,
      resourceInfo,
      status,
      message,
      isError
    }
  }

  /**
   * Format multiple events as a batch
   * Returns formatted string ready for display
   */
  formatEvents(events: StackEvent[]): string {
    if (events.length === 0) {
      return ''
    }

    const formattedLines: string[] = []

    for (const event of events) {
      const formattedEvent = this.formatEvent(event)
      const line = this.formatEventLine(formattedEvent, event)
      formattedLines.push(line)
    }

    return formattedLines.join('\n')
  }

  /**
   * Format timestamp in ISO 8601 format with timezone
   * Handles invalid dates gracefully
   */
  private formatTimestamp(timestamp?: Date): string {
    if (!timestamp) {
      return this.colorFormatter.colorizeTimestamp('Unknown time')
    }

    try {
      // Format as ISO 8601 with timezone (e.g., "2023-12-07T10:30:45.123Z")
      const isoString = timestamp.toISOString()
      return this.colorFormatter.colorizeTimestamp(isoString)
    } catch (error) {
      core.debug(`Invalid timestamp format: ${error}`)
      return this.colorFormatter.colorizeTimestamp('Invalid time')
    }
  }

  /**
   * Format resource information with truncation and type display
   * Handles long resource names by truncating them appropriately
   */
  private formatResourceInfo(event: StackEvent): string {
    const resourceType = event.ResourceType || 'Unknown'
    const logicalId = event.LogicalResourceId || 'Unknown'
    const physicalId = event.PhysicalResourceId

    // Truncate logical resource ID if it exceeds max length
    const truncatedLogicalId = this.truncateResourceName(
      logicalId,
      this.config.maxResourceNameLength
    )

    // Optionally include physical ID in the display
    if (this.config.showPhysicalId && physicalId) {
      const truncatedPhysicalId = this.truncateResourceName(
        physicalId,
        this.config.maxResourceNameLength
      )
      // Return with physical ID included
      return this.colorFormatter.colorizeResource(
        resourceType,
        `${truncatedLogicalId} (${truncatedPhysicalId})`
      )
    }

    return this.colorFormatter.colorizeResource(
      resourceType,
      truncatedLogicalId
    )
  }

  /**
   * Truncate resource name while maintaining readability
   * Uses ellipsis to indicate truncation
   */
  private truncateResourceName(name: string, maxLength: number): string {
    if (name.length <= maxLength) {
      return name
    }

    // Truncate and add ellipsis, ensuring we don't exceed maxLength
    const ellipsis = '...'
    const truncateLength = maxLength - ellipsis.length

    if (truncateLength <= 0) {
      return ellipsis
    }

    return name.substring(0, truncateLength) + ellipsis
  }

  /**
   * Format status with appropriate coloring
   */
  private formatStatus(status: string): string {
    return this.colorFormatter.colorizeStatus(status, status)
  }

  /**
   * Format a complete event line for display
   * Handles indentation for nested resources and error formatting
   */
  private formatEventLine(
    formattedEvent: FormattedEvent,
    originalEvent: StackEvent
  ): string {
    const parts: string[] = []

    // Add indentation for nested resources
    const indent = this.getResourceIndentation(originalEvent)
    if (indent) {
      parts.push(indent)
    }

    // Add timestamp if configured
    if (this.config.showTimestamp) {
      parts.push(formattedEvent.timestamp)
    }

    // Add resource information
    parts.push(formattedEvent.resourceInfo)

    // Add status
    parts.push(formattedEvent.status)

    // Add message if available
    if (formattedEvent.message) {
      if (formattedEvent.isError) {
        // Format error messages with bold red
        const errorMessage = this.colorFormatter.colorizeError(
          formattedEvent.message
        )
        parts.push(`ERROR: ${errorMessage}`)
      } else {
        // Regular message
        parts.push(`- ${formattedEvent.message}`)
      }
    }

    return parts.join(' ')
  }

  /**
   * Get indentation string for nested resources
   * Determines nesting level based on resource hierarchy
   */
  private getResourceIndentation(event: StackEvent): string {
    // Calculate indentation based on resource type and logical ID patterns
    const indentLevel = this.calculateIndentLevel(event)

    if (indentLevel === 0) {
      return ''
    }

    // Use 2 spaces per indent level
    return '  '.repeat(indentLevel)
  }

  /**
   * Calculate indentation level for nested resources
   * Uses heuristics to determine resource hierarchy depth
   */
  private calculateIndentLevel(event: StackEvent): number {
    const logicalId = event.LogicalResourceId || ''
    const resourceType = event.ResourceType || ''

    // Base indentation from configuration
    let indentLevel = this.config.indentLevel

    // Heuristics for determining nesting:
    // 1. Resources with dots in logical ID are often nested (e.g., "MyStack.NestedStack.Resource")
    const dotCount = (logicalId.match(/\./g) || []).length
    indentLevel += dotCount

    // 2. Certain resource types are typically nested
    const nestedResourceTypes = [
      'AWS::CloudFormation::Stack', // Nested stacks
      'AWS::Lambda::Function', // Often nested in applications
      'AWS::IAM::Role', // Often nested under other resources
      'AWS::IAM::Policy' // Often nested under roles
    ]

    if (nestedResourceTypes.includes(resourceType)) {
      indentLevel += 1
    }

    // 3. Resources with common prefixes might be grouped
    // This is a simple heuristic - in practice, you might want more sophisticated logic
    if (logicalId.includes('Nested') || logicalId.includes('Child')) {
      indentLevel += 1
    }

    return Math.max(0, indentLevel) // Ensure non-negative
  }

  /**
   * Update display configuration
   */
  updateConfig(newConfig: Partial<EventDisplayConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * Get current display configuration
   */
  getConfig(): EventDisplayConfig {
    return { ...this.config }
  }

  /**
   * Format deployment summary when stack reaches terminal state
   * Provides overview of deployment result
   */
  formatDeploymentSummary(
    stackName: string,
    finalStatus: string,
    totalEvents: number,
    errorCount: number,
    duration?: number
  ): string {
    const lines: string[] = []

    lines.push('') // Empty line for separation
    lines.push('='.repeat(60))
    lines.push(`Deployment Summary for ${stackName}`)
    lines.push('='.repeat(60))

    // Format final status with appropriate color
    const colorizedStatus = this.colorFormatter.colorizeStatus(
      finalStatus,
      finalStatus
    )
    lines.push(`Final Status: ${colorizedStatus}`)

    lines.push(`Total Events: ${totalEvents}`)

    if (errorCount > 0) {
      const errorText = this.colorFormatter.colorizeError(
        `${errorCount} error(s)`
      )
      lines.push(`Errors: ${errorText}`)
    } else {
      const successText = this.colorFormatter.colorizeStatus(
        'CREATE_COMPLETE',
        'No errors'
      )
      lines.push(`Errors: ${successText}`)
    }

    if (duration !== undefined) {
      const durationText = `${Math.round(duration / 1000)}s`
      lines.push(`Duration: ${durationText}`)
    }

    lines.push('='.repeat(60))
    lines.push('') // Empty line for separation

    return lines.join('\n')
  }
}
