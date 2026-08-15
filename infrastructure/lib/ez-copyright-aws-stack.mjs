import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  aws_apigatewayv2 as apigwv2,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecs_patterns as ecsPatterns,
  aws_logs as logs,
  aws_rds as rds,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { HttpAlbIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function context(scope, name, fallback = '') {
  const value = scope.node.tryGetContext(name);
  return String(value ?? fallback).trim();
}

export class EzCopyrightAwsStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const frontendOrigin = context(this, 'frontendOrigin', 'https://main.dfhj64edk9o6n.amplifyapp.com').replace(/\/$/, '');
    const cognitoRegion = context(this, 'cognitoRegion', this.region);
    const cognitoUserPoolId = context(this, 'cognitoUserPoolId');
    const cognitoClientId = context(this, 'cognitoClientId');
    const s3BucketName = context(this, 's3BucketName');
    const stripePriceId = context(this, 'stripePriceId');
    const monthlyRegistrationLimit = context(this, 'monthlyRegistrationLimit', '5');
    const desiredCount = Number.parseInt(context(this, 'desiredCount', '0'), 10);
    const multiAz = context(this, 'multiAz', 'false') === 'true';

    if (!frontendOrigin.startsWith('https://')) throw new Error('frontendOrigin must be HTTPS.');
    if (!cognitoUserPoolId || !cognitoClientId) throw new Error('Cognito user pool and client IDs are required.');
    if (!s3BucketName) throw new Error('s3BucketName context is required and must reference the existing EZ Copyright S3 bucket.');
    if (!stripePriceId) throw new Error('stripePriceId context is required.');
    if (!Number.isInteger(desiredCount) || desiredCount < 0) throw new Error('desiredCount must be a non-negative integer.');

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'application', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'database', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17_9,
      }),
      credentials: rds.Credentials.fromGeneratedSecret('ezcopyright_app'),
      databaseName: 'ez_copyright_db',
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      storageEncrypted: true,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      backupRetention: Duration.days(7),
      multiAz,
      publiclyAccessible: false,
      deletionProtection: true,
      autoMinorVersionUpgrade: true,
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.SNAPSHOT,
    });

    const billingSecret = new secretsmanager.Secret(this, 'StripeBillingSecret', {
      description: 'EZ Copyright Stripe server credentials. Replace placeholder values before enabling Fargate tasks.',
      secretObjectValue: {
        STRIPE_SECRET_KEY: SecretValue.unsafePlainText('REPLACE_BEFORE_CUTOVER'),
        STRIPE_WEBHOOK_SECRET: SecretValue.unsafePlainText('REPLACE_BEFORE_CUTOVER'),
      },
    });

    const existingAudioBucket = s3.Bucket.fromBucketName(this, 'ExistingAudioBucket', s3BucketName);

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'ApiService', {
      vpc,
      publicLoadBalancer: false,
      openListener: false,
      assignPublicIp: false,
      desiredCount,
      cpu: 512,
      memoryLimitMiB: 1024,
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(repoRoot, { file: 'Dockerfile.api' }),
        containerPort: 10000,
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'ez-copyright-api',
          logRetention: logs.RetentionDays.ONE_MONTH,
        }),
        environment: {
          NODE_ENV: 'production',
          PORT: '10000',
          DB_HOST: database.dbInstanceEndpointAddress,
          DB_PORT: database.dbInstanceEndpointPort,
          DB_NAME: 'ez_copyright_db',
          DATABASE_SSL: 'true',
          AWS_REGION: cognitoRegion,
          COGNITO_REGION: cognitoRegion,
          COGNITO_USER_POOL_ID: cognitoUserPoolId,
          COGNITO_CLIENT_ID: cognitoClientId,
          S3_BUCKET: s3BucketName,
          CORS_ALLOWED_ORIGINS: frontendOrigin,
          APP_BASE_URL: frontendOrigin,
          STRIPE_PRICE_ID: stripePriceId,
          MONTHLY_REGISTRATION_LIMIT: monthlyRegistrationLimit,
          POLICY_VERSION: '2026-08-13',
          MAX_UPLOAD_BYTES: '536870912',
        },
        secrets: {
          DB_USER: ecs.Secret.fromSecretsManager(database.secret, 'username'),
          DB_PASSWORD: ecs.Secret.fromSecretsManager(database.secret, 'password'),
          STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(billingSecret, 'STRIPE_SECRET_KEY'),
          STRIPE_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(billingSecret, 'STRIPE_WEBHOOK_SECRET'),
        },
      },
      healthCheckGracePeriod: Duration.seconds(60),
    });

    service.targetGroup.configureHealthCheck({
      path: '/health/ready',
      healthyHttpCodes: '200',
      interval: Duration.seconds(30),
      timeout: Duration.seconds(10),
    });

    database.connections.allowDefaultPortFrom(service.service, 'PostgreSQL from EZ Copyright API');
    existingAudioBucket.grantReadWrite(service.taskDefinition.taskRole);

    const vpcLinkSecurityGroup = new ec2.SecurityGroup(this, 'VpcLinkSecurityGroup', {
      vpc,
      description: 'API Gateway VPC Link to EZ Copyright internal ALB',
      allowAllOutbound: true,
    });
    service.loadBalancer.connections.allowFrom(vpcLinkSecurityGroup, ec2.Port.tcp(80), 'API Gateway VPC Link');

    const vpcLink = new apigwv2.VpcLink(this, 'ApiVpcLink', {
      vpc,
      securityGroups: [vpcLinkSecurityGroup],
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    const httpApi = new apigwv2.HttpApi(this, 'PublicApi', {
      apiName: 'ez-copyright-production',
      defaultIntegration: new HttpAlbIntegration('DefaultAlbIntegration', service.listener, { vpcLink }),
    });

    new CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'DatabaseEndpoint', { value: database.dbInstanceEndpointAddress });
    new CfnOutput(this, 'DatabaseSecretArn', { value: database.secret.secretArn });
    new CfnOutput(this, 'StripeBillingSecretArn', { value: billingSecret.secretArn });
    new CfnOutput(this, 'ExistingAudioBucketName', { value: existingAudioBucket.bucketName });
    new CfnOutput(this, 'DesiredApiTasks', { value: String(desiredCount) });
  }
}
