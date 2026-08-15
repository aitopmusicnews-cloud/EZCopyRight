#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { EzCopyrightAwsStack } from '../lib/ez-copyright-aws-stack.mjs';

const app = new App();

new EzCopyrightAwsStack(app, 'EzCopyrightProduction', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-west-2',
  },
  description: 'EZ Copyright production backend on AWS',
});

app.synth();
