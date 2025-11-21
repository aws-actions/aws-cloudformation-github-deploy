// Mock @actions/core to avoid fs constants issue
jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  debug: jest.fn(),
  info: jest.fn()
}));
