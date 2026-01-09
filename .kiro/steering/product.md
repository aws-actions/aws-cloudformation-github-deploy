# Product Overview

This is the **AWS CloudFormation GitHub Deploy Action** - a GitHub Action that deploys AWS CloudFormation stacks from GitHub workflows.

## Core Functionality

- **Stack Deployment**: Creates new CloudFormation stacks or updates existing ones using change sets
- **Template Support**: Accepts both local template files and S3 URLs
- **Parameter Management**: Supports multiple parameter override formats (comma-delimited, YAML, JSON files)
- **Change Set Management**: Creates and executes change sets with configurable behavior for empty change sets
- **Stack Monitoring**: Real-time event monitoring during stack operations
- **Output Handling**: Captures and exposes stack outputs as action outputs

## Key Features

- Proxy support for corporate environments
- Comprehensive error handling and retry logic
- Multiple tag formats (YAML array, YAML object, JSON)
- Termination protection and rollback configuration
- IAM role assumption for stack operations
- SNS notification integration

## Target Users

DevOps engineers and developers using GitHub Actions to deploy AWS infrastructure via CloudFormation templates.
