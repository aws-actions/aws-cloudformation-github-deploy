# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [Unreleased]

## [2.1.0] - 2026-04-01

### Features

- **ROLLBACK_COMPLETE Recovery**: Automatically delete and recreate stacks stuck in `ROLLBACK_COMPLETE` state (#107, #191)

### Chore

- **Node.js 24**: Upgraded action runtime from Node.js 20 to Node.js 24 (#184, #192)
- Updated CI workflow to use Node.js 24 and latest action versions

### Dependencies

- Bump undici from 6.23.0 to 6.24.0 (#185)
- Bump fast-xml-parser and @aws-sdk/client-cloudformation (#183)
- Bump minimatch (#181)
- Bump flatted from 3.3.3 to 3.4.2 (#186)
- Bump picomatch (#188)
- Bump handlebars from 4.7.8 to 4.7.9 (#189)

## [2.0.0] - 2026-02-02

### Features

- **Enhanced Change Set Support**: Added three-mode operation for better change set management
  - Create & Execute (default behavior)
  - Create Only (`no-execute-changeset: true`) with detailed change set information outputs
  - Execute Only (`execute-change-set-id`) for executing pre-created change sets
- **Rich Change Set Information**: New outputs when creating change sets without execution
  - `change-set-id` - The change set ID
  - `change-set-name` - The change set name
  - `has-changes` - Boolean indicating if changes exist
  - `changes-count` - Number of changes in the change set
  - `changes-summary` - JSON summary of all changes with detailed information
- **Drift-Aware Change Sets**: Added `deployment-mode: "REVERT_DRIFT"` support for creating change sets that revert resource drift
- **Enhanced Change Set Visibility**: Using `IncludePropertyValues: true` to show actual before/after property values
- **Missing Parameter**: Added `include-nested-stacks-change-set` parameter to action.yml (was implemented but not documented)

### Dependencies

- Updated AWS SDK v3 to latest version (3.935.0)
- Updated TypeScript to 5.9.3 with compatible ESLint plugins
- Updated all development dependencies to latest versions
- Fixed security vulnerabilities in dependencies

## Features

#12, #13 Supporting more input parameters
#17 Use stack name to filter for current stack
#23 Output to GitHub actions

## Bug Fixes
