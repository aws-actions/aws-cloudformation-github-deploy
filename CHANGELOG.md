# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## Features

### 2.0.0

- **Real-time Event Streaming**: Added comprehensive CloudFormation stack event monitoring during deployments
  - Color-coded event display (green for success, yellow for warnings, red for errors)
  - Real-time event polling with exponential backoff
  - Error message extraction and highlighting
  - Structured event formatting with timestamps and resource information
  - Integration with existing deployment flow
- **Enhanced Error Handling**: Improved error extraction and display from CloudFormation events
- **Performance Optimizations**: Efficient event polling with AWS API rate limit respect
- **GitHub Actions Workflow Fixes**: Fixed permission issues in package.yml and release.yml workflows

### 1.6.1 , 1.6.2

- Change log updates

### 1.6.0

- Added support for change set description
- Added support for YAML output format
- Added Retry for Rate Limit Exception

### 1.5.0

- Added support for YAML input format

### older versions

- #12, #13 Supporting more input parameters
- #17 Use stack name to filter for current stack
- #23 Output to GitHub actions

## Bug Fixes
