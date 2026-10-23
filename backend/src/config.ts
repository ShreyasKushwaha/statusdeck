import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  awsRegion: string;
  dynamoEndpoint?: string;
  tables: {
    tenants: string;
    monitors: string;
    results: string;
    incidents: string;
  };
  cognito: {
    userPoolId: string;
    clientId: string;
    region: string;
  };
  sns: {
    alertsTopicArn?: string;
  };
  isDevMode: boolean;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  awsRegion: process.env.AWS_REGION || 'ap-south-1',
  dynamoEndpoint: process.env.DYNAMODB_ENDPOINT || undefined,
  tables: {
    tenants: process.env.DYNAMODB_TABLE_TENANTS || 'StatusDeck-Tenants-dev',
    monitors: process.env.DYNAMODB_TABLE_MONITORS || 'StatusDeck-Monitors-dev',
    results: process.env.DYNAMODB_TABLE_RESULTS || 'StatusDeck-CheckResults-dev',
    incidents: process.env.DYNAMODB_TABLE_INCIDENTS || 'StatusDeck-Incidents-dev',
  },
  cognito: {
    userPoolId: process.env.COGNITO_USER_POOL_ID || 'ap-south-1_dummyPoolId',
    clientId: process.env.COGNITO_CLIENT_ID || 'dummyClientId12345',
    region: process.env.COGNITO_REGION || process.env.AWS_REGION || 'ap-south-1',
  },
  sns: {
    alertsTopicArn: process.env.SNS_ALERTS_TOPIC_ARN,
  },
  isDevMode: process.env.NODE_ENV !== 'production' || process.env.AUTH_DEV_MODE === 'true',
};
