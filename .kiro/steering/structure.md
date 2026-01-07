# Project Structure

## Root Directory Layout

```text
├── src/                    # TypeScript source code
├── lib/                    # Compiled JavaScript output
├── dist/                   # Bundled distribution files
├── __tests__/              # Test files
├── build/                  # Build artifacts
├── coverage/               # Test coverage reports
├── node_modules/           # Dependencies
└── action.yml              # GitHub Action definition
```

## Source Code Organization (`src/`)

- **`main.ts`**: Entry point and input parsing
- **`deploy.ts`**: Core CloudFormation deployment logic
- **`utils.ts`**: Utility functions for parsing and formatting

## Key Configuration Files

- **`action.yml`**: GitHub Action metadata and input/output definitions
- **`package.json`**: Dependencies and npm scripts
- **`tsconfig.json`**: TypeScript compilation settings
- **`jest.config.js`**: Test configuration with 100% coverage requirement
- **`.eslintrc.js`**: Linting rules and TypeScript integration
- **`.lintstagedrc.js`**: Pre-commit hook configuration

## Test Structure (`__tests__/`)

- **`main.test.ts`**: Tests for main entry point
- **`deploy.test.ts`**: Tests for deployment logic
- **`utils.test.ts`**: Tests for utility functions
- **`params*.test.json`**: Test parameter files

## Build Outputs

- **`lib/`**: TypeScript compilation output (ES6/CommonJS)
- **`dist/`**: Bundled files for GitHub Actions distribution
- **`coverage/`**: HTML and JSON coverage reports

## Code Organization Patterns

### File Responsibilities

- **Main**: Input validation, GitHub Actions integration, orchestration
- **Deploy**: CloudFormation API interactions, stack operations, event monitoring
- **Utils**: Parsing functions, error formatting, retry logic, proxy configuration

### Type Definitions

- Custom types defined inline with usage
- AWS SDK types imported and extended as needed
- Strict TypeScript configuration with no implicit any

### Error Handling

- Centralized error formatting in utils
- Try-catch blocks in main entry points
- Structured error output (JSON/YAML formats)
