# AWS CloudFormation "Deploy CloudFormation Stack" Action for GitHub Actions

![Package](https://github.com/aws-actions/aws-cloudformation-github-deploy/workflows/Package/badge.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Deploys AWS CloudFormation Stacks.

## Usage

```yaml
- name: Deploy to AWS CloudFormation
  uses: aws-actions/aws-cloudformation-github-deploy@v1
  with:
    name: MyStack
    template: myStack.yaml
    parameter-overrides: "MyParam1=myValue,MyParam2=${{ secrets.MY_SECRET_VALUE }}"
```

The action can be passed a CloudFormation Stack `name` and a `template` file. The `template` file can be a local file existing in the working directory, or a URL to template that exists in an [Amazon S3](https://aws.amazon.com/s3/) bucket. It will create the Stack if it does not exist, or create a [Change Set](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html) to update the Stack. An update fails by default when the Change Set is empty. Setting `no-fail-on-empty-changeset: "1"` will override this behavior and not throw an error.

## Real-time Event Streaming

This action provides **real-time CloudFormation event streaming** during deployments, giving you immediate visibility into your stack operations without needing to check the AWS Console. Events are displayed with color-coded status indicators and clear error messages directly in your GitHub Actions logs.

### Event Streaming Features

- **Real-time Monitoring**: See CloudFormation stack events as they happen during deployment
- **Color-coded Status**: Green for success, yellow for warnings, red for errors, blue for informational
- **Error Highlighting**: Failed operations show detailed error messages in bold red formatting
- **Structured Display**: Events include timestamps, resource types, resource names, and status information
- **Performance Optimized**: Uses exponential backoff polling with AWS API rate limiting respect
- **Fault Tolerant**: Event streaming errors don't affect your deployment - they're logged as warnings

### Event Streaming Configuration

Event streaming is **enabled by default**. To disable it:

```yaml
- name: Deploy to AWS CloudFormation
  uses: aws-actions/aws-cloudformation-github-deploy@v1
  with:
    name: MyStack
    template: myStack.yaml
    enable-event-streaming: "0"  # Disable event streaming
```

### Example Event Output

When event streaming is enabled, you'll see output like this in your GitHub Actions logs:

```text
Starting event monitoring for stack: MyStack
2023-12-07T10:30:45.123Z AWS::CloudFormation::Stack/MyStack CREATE_IN_PROGRESS
2023-12-07T10:30:47.456Z AWS::S3::Bucket/MyBucket CREATE_IN_PROGRESS
2023-12-07T10:30:52.789Z AWS::S3::Bucket/MyBucket CREATE_COMPLETE
2023-12-07T10:31:15.234Z AWS::Lambda::Function/MyFunction CREATE_FAILED ERROR: The role defined for the function cannot be assumed by Lambda.

============================================================
Deployment Summary for MyStack
============================================================
Final Status: CREATE_FAILED
Total Events: 4
Errors: 1 error(s)
Duration: 45s
============================================================
```

### Inputs

A few inputs are highlighted below. See [action.yml](action.yml) for the full documentation for this action's inputs and outputs.

#### enable-event-streaming (OPTIONAL)

Controls real-time CloudFormation event streaming during deployment. Defaults to `"1"` (enabled).

- `"1"` (default): Enable real-time event streaming with color-coded output
- `"0"`: Disable event streaming for minimal log output

```yaml
- uses: aws-actions/aws-cloudformation-github-deploy@v1
  with:
    name: MyStack
    template: myStack.yaml
    enable-event-streaming: "1"  # Show real-time events (default)
```

#### parameter-overrides (OPTIONAL)

To override parameter values in the template you can provide a string, a file that is either local or an URL, or a native YAML object.

Override multiple parameters separated by commas: `"MyParam1=myValue1,MyParam2=myValue2"`

Override a comma delimited list: `"MyParam1=myValue1,MyParam1=myValue2"` or `MyParam1="myValue1,myValue2"`

Override parameters using a almost native YAML object :

```yaml
parameter-overrides: |
  MyParam1: myValue1
  MyParam2: myValue2
  MyListParam:
    - item1
    - item2
```

**!Note** GitHub Actions requre all parameters to be a string, but we can pass a YAML object via string.

Override parameters using a local JSON file: `"file:///${{ github.workspace }}/parameters.json"` with a file named `parameters.json` at the root of the repository:

```json
[
  {
    "ParameterKey": "MyParam1",
    "ParameterValue": "myValue1"
  }
]
```

> You can learn more about [AWS CloudFormation](https://aws.amazon.com/cloudformation/)

## Setting Tags

You can add tags to your CloudFormation stack by using the `tags` parameter. Tags can be specified in three formats:

Using YAML array format:

```yaml
- uses: aws-actions/aws-cloudformation-github-deploy@v1
  with:
    name: MyStack
    template: myStack.yaml
    tags: |
      - Key: Environment
        Value: Production
      - Key: Team
        Value: DevOps
```

**!Note** GitHub Actions requre all parameters to be a string, but we can pass a YAML object via string.

Using YAML object format:

```yaml
- uses: aws-actions/aws-cloudformation-github-deploy@v1
  with:
    name: MyStack
    template: myStack.yaml
    tags: |
      Environment: Production
      Team: DevOps
```

**!Note** GitHub Actions requre all parameters to be a string, but we can pass a YAML object via string.

Using JSON formating:

```yaml
- uses: aws-actions/aws-cloudformation-github-deploy@v1
  with:
    name: MyStack
    template: myStack.yaml
    tags: |
      [
        {
          "Key": "Environment",
          "Value": "Production"
        },
        {
          "Key": "Team",
          "Value": "DevOps"
        }
      ]
```

**!Note** GitHub Actions requre all parameters to be a string, but we can pass a JSON object via string.

Tags specified during stack creation or update will be applied to the stack and all its resources that support tagging. These tags can be useful for cost allocation, access control, and resource organization.

## Credentials and Region

This action relies on the [default behavior of the AWS SDK for Javascript](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html) to determine AWS credentials and region.
Use [the `aws-actions/configure-aws-credentials` action](https://github.com/aws-actions/configure-aws-credentials) to configure the GitHub Actions environment with environment variables containing AWS credentials and your desired region.

We recommend following [Amazon IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) for the AWS credentials used in GitHub Actions workflows, including:

- Do not store credentials in your repository's code. You may use [GitHub Actions secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets) to store credentials and redact credentials from GitHub Actions workflow logs.
- [Create an individual IAM user](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#create-iam-users) with an access key for use in GitHub Actions workflows, preferably one per repository. Do not use the AWS account root user access key.
- [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege) to the credentials used in GitHub Actions workflows. Grant only the permissions required to perform the actions in your GitHub Actions workflows. See the Permissions section below for the permissions required by this action.
- [Rotate the credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#rotate-credentials) used in GitHub Actions workflows regularly.
- [Monitor the activity](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#keep-a-log) of the credentials used in GitHub Actions workflows.

## Permissions

This action requires the following minimum set of permissions:

> We recommend to read [AWS CloudFormation Security Best Practices](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/best-practices.html)

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cloudformation:CreateStack",
                "cloudformation:DescribeStacks",
                "cloudformation:CreateChangeSet",
                "cloudformation:DescribeChangeSet",
                "cloudformation:DeleteChangeSet",
                "cloudformation:ExecuteChangeSet",
                "cloudformation:DescribeStackEvents"
            ],
            "Resource": "*"
        }
    ]
}
```

**Note**: The `cloudformation:DescribeStackEvents` permission is used by the real-time event streaming feature. If you disable event streaming with `enable-event-streaming: "0"`, this permission is not required.

> The policy above prevents the stack to be deleted by a policy for production

## Example

You want to run your microservices with [Amazon Elastic Kubernetes Services](https://aws.amazon.com/eks/) and leverage the best-practices to run the cluster? Using this GitHub Action you can customize and deploy the [modular and scalable Amazon EKS architecture](https://aws.amazon.com/quickstart/architecture/amazon-eks/) provided in an AWS Quick Start to your AWS Account. The following workflow enables you to create and update a Kubernetes cluster using a manual workflow trigger.

You only have to create an [Amazon EC2 key pair](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-key-pairs.html) to run this workflow.

```yaml
name: Deploy Cluster

on:
  workflow_dispatch:
    inputs:
      region:
        description: 'AWS Region'
        required: true
        default: 'eu-west-1'
      keypair:
        description: 'SSH Key Pair'
        required: true

jobs:
  cluster:
    name: Deploy stack to AWS
    runs-on: ubuntu-latest
    outputs:
      env-name: ${{ steps.env-name.outputs.environment }}
    steps:
    - name: Checkout
      uses: actions/checkout@v2

    - name: Configure AWS credentials
      id: creds
      uses: aws-actions/configure-aws-credentials@v1
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ github.event.inputs.region}}

    - name: Configure environment name
      id: env-name
      env:
        REPO: ${{ github.repository }}
      run: |
        ENVIRONMENT=`echo $REPO | tr "/" "-"`
        echo "Environment name: $ENVIRONMENT"
        echo "environment=$ENVIRONMENT" >> $GITHUB_OUTPUT

    - name: Deploy Amazon EKS Cluster
      id: eks-cluster
      uses: aws-actions/aws-cloudformation-github-deploy@master
      with:
        name: ${{ steps.env-name.outputs.environment }}-cluster
        template: https://s3.amazonaws.com/aws-quickstart/quickstart-amazon-eks/templates/amazon-eks-master.template.yaml
        no-fail-on-empty-changeset: "1"
        enable-event-streaming: "1"  # Enable real-time event monitoring
        parameter-overrides: |
          AvailabilityZones:
            - ${{ github.event.inputs.region }}a
            - ${{ github.event.inputs.region }}c
          KeyPairName: ${{ github.event.inputs.keypair }}
          NumberOfAZs: 2
          ProvisionBastionHost: Disabled
          EKSPublicAccessEndpoint: Enabled
          EKSPrivateAccessEndpoint: Enabled
          RemoteAccessCIDR: 0.0.0.0/0
        tags: |
          Environmnet: Develop
          Owner: DevOps

```

### Proxy Configuration

If you run in self-hosted environments and in secured environment where you need use a specific proxy you can set it in the action manually.

Additionally this action will always consider already configured proxy in the environment.

Manually configured proxy:

```yaml
uses: aws-actions/aws-cloudformation-github-deploy@v1
with:
  name: eks-primary
  template: https://s3.amazonaws.com/aws-quickstart/quickstart-amazon-eks/templates/amazon-eks-master.template.yaml
  no-fail-on-empty-changeset: "1"
  http-proxy: "http://companydomain.com:3128"
```

Proxy configured in the environment variable:

```bash
# Your environment configuration
HTTP_PROXY="http://companydomain.com:3128"
```

The action will read the underlying proxy configuration from the environment and you don't need to configure it in the action.

## License

[MIT](/LICENSE)
