#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StatusDeckStack } from '../lib/statusdeck-stack';

const app = new cdk.App();

new StatusDeckStack(app, 'StatusDeckStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
    region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'ap-south-1',
  },
  description: 'StatusDeck: Multi-Tenant SaaS Uptime Monitoring Stack (Academic Cloud Computing FT-III)',
});
