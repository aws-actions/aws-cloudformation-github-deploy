// Mock @actions/core to suppress all output during tests
jest.mock('@actions/core', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  getInput: jest.fn(),
  getBooleanInput: jest.fn()
}))

// Suppress console output during tests to make test results clearer
const originalConsole = global.console

beforeAll(() => {
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
})

afterAll(() => {
  global.console = originalConsole
})

// Clean up any lingering timers after each test
afterEach(() => {
  // Clear all timers
  jest.clearAllTimers()

  // Use fake timers to ensure no real timers are left running
  jest.useRealTimers()
})
