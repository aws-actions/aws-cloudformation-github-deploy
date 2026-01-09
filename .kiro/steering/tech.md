# Technology Stack

## Core Technologies

- **Runtime**: Node.js 20 (GitHub Actions runtime)
- **Language**: TypeScript 4.8.4 with strict mode enabled
- **Build Target**: ES6/CommonJS modules
- **Package Manager**: npm with package-lock.json

## Key Dependencies

### Production

- `@actions/core`: GitHub Actions toolkit for inputs/outputs
- `@aws-sdk/client-cloudformation`: AWS SDK v3 for CloudFormation operations
- `@smithy/node-http-handler`: HTTP handling with proxy support
- `js-yaml`: YAML parsing for parameters and tags
- `https-proxy-agent`: Corporate proxy support

### Development

- `@vercel/ncc`: Bundling for distribution
- `jest`: Testing framework with 100% coverage requirement
- `ts-jest`: TypeScript support for Jest
- `eslint`: Code linting with TypeScript and Prettier integration
- `prettier`: Code formatting
- `husky`: Git hooks for pre-commit/pre-push validation

## Build System

### Common Commands

```bash
# Build TypeScript to JavaScript
npm run build

# Bundle for distribution
npm run pack

# Run tests with coverage (requires 100%)
npm test

# Run linting and formatting
npm run precommit

# Full pipeline (build + lint + pack + test)
npm run all
```

### Code Quality Standards

- **Coverage**: 100% test coverage required (statements, branches, functions, lines)
- **Linting**: ESLint with TypeScript and Prettier rules
- **Formatting**: Prettier with automatic formatting on commit
- **Git Hooks**: Pre-commit linting, pre-push testing

## Architecture Patterns

- **Error Handling**: Comprehensive try-catch with formatted error output (JSON/YAML)
- **Retry Logic**: Exponential backoff for AWS API throttling
- **Event Monitoring**: Real-time CloudFormation stack event streaming
- **Input Validation**: Type-safe input parsing with multiple format support
- **Proxy Support**: Environment and manual proxy configuration
