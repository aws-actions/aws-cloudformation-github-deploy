## AWS CloudFormation "Deploy CloudFormation Stack" Action for GitHub Actions

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

### Inputs

A few inputs are highlighted below. See [action.yml](action.yml) for the full documentation for this action's inputs and outputs.

#### parameter-overrides (OPTIONAL)

To override parameter values in the template you can provide a string or a file that is either local or an URL.

Override multiple parameters separated by commas: `"MyParam1=myValue1,MyParam2=myValue2"`

Override a comma delimited list: `"MyParam1=myValue1,MyParam1=myValue2"` or `MyParam1="myValue1,myValue2"`

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

```
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
                "cloudformation:ExecuteChangeSet"
            ],
            "Resource": "*"
        }
    ]
}
```

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
        parameter-overrides: >-
          AvailabilityZones=${{ github.event.inputs.region }}a,
          AvailabilityZones=${{ github.event.inputs.region }}c,
          KeyPairName=${{ github.event.inputs.keypair }},
          NumberOfAZs=2,
          ProvisionBastionHost=Disabled,
          EKSPublicAccessEndpoint=Enabled,
          EKSPrivateAccessEndpoint=Enabled,
          RemoteAccessCIDR=0.0.0.0/0

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
