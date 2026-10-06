import { Stack,Duration,CfnOutput,RemovalPolicy } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { fileURLToPath } from 'node:url';
export class AgentStack extends Stack {
 constructor(scope,id,c){
  super(scope,id,{env:{account:c.account,region:c.region},terminationProtection:true});
  const vpc=ec2.Vpc.fromVpcAttributes(this,'ExistingVpc',{vpcId:c.vpcId,availabilityZones:c.availabilityZones,publicSubnetIds:c.publicSubnetIds});
  const taskSecurity=new ec2.SecurityGroup(this,'AgentSecurity',{vpc,description:'Only agent ALB can reach port 8080',allowAllOutbound:true});
  const databaseSecurity=ec2.SecurityGroup.fromSecurityGroupId(this,'ExistingDatabaseSecurity',c.databaseSecurityGroupId,{mutable:true});
  databaseSecurity.addIngressRule(taskSecurity,ec2.Port.tcp(5432),'EZCopyRight operations agent');
  const pool=cognito.UserPool.fromUserPoolId(this,'ExistingPool',c.cognitoPoolId);
  const origin=`https://${c.hostname}`;
  const client=pool.addClient('AgentOwnerClient',{generateSecret:false,preventUserExistenceErrors:true,enableTokenRevocation:true,idTokenValidity:Duration.minutes(30),accessTokenValidity:Duration.minutes(30),oAuth:{flows:{authorizationCodeGrant:true},scopes:[cognito.OAuthScope.OPENID,cognito.OAuthScope.EMAIL],callbackUrls:[origin+'/'],logoutUrls:[origin+'/']}});
  const cluster=new ecs.Cluster(this,'AgentCluster',{vpc});
  const task=new ecs.FargateTaskDefinition(this,'AgentTask',{cpu:256,memoryLimitMiB:512});
  const logGroup=new logs.LogGroup(this,'AgentLogs',{retention:logs.RetentionDays.ONE_MONTH,removalPolicy:RemovalPolicy.RETAIN});
  const secret=secrets.Secret.fromSecretCompleteArn(this,'AgentSecrets',c.secretArn);
  const env={NODE_ENV:'production',PORT:'8080',AWS_REGION:c.region,AGENT_ORIGIN:origin,APP_ORIGIN:c.appOrigin,API_ORIGIN:c.apiOrigin,
   COGNITO_USER_POOL_ID:c.cognitoPoolId,COGNITO_CLIENT_ID:client.userPoolClientId,COGNITO_DOMAIN:c.cognitoDomain,OWNER_SUBS:c.ownerSubs,OPENAI_MODEL:c.openaiModel,
   STRIPE_LIVE:String(c.stripeLive),STRIPE_PRICE_ID:c.stripePriceId,STRIPE_PRODUCT_ID:c.stripeProductId,
   APP_RUNNER_ARN:c.appRunnerArn,AMPLIFY_APP_ID:c.amplifyAppId,AMPLIFY_BRANCH:c.amplifyBranch,RDS_INSTANCE_ID:c.rdsInstanceId,S3_BUCKET:c.s3Bucket,ALARM_NAMES:c.alarmNames.join(','),
   ENABLE_WRITES:String(c.enableWrites),MONITOR_MINUTES:'15',MAX_RUNS_PER_DAY:'120'};
  const container=task.addContainer('Agent',{image:ecs.ContainerImage.fromAsset(fileURLToPath(new URL('..',import.meta.url)),{exclude:['node_modules','cdk.out','infra','test','.env','.env.*']}),environment:env,secrets:{AGENT_SECRETS_JSON:ecs.Secret.fromSecretsManager(secret)},logging:ecs.LogDrivers.awsLogs({streamPrefix:'agent',logGroup}),stopTimeout:Duration.seconds(30),readonlyRootFilesystem:true});
  container.addPortMappings({containerPort:8080});
  const service=new ecs.FargateService(this,'AgentService',{cluster,taskDefinition:task,desiredCount:1,enableExecuteCommand:false,assignPublicIp:true,vpcSubnets:{subnetType:ec2.SubnetType.PUBLIC},securityGroups:[taskSecurity],circuitBreaker:{rollback:true},healthCheckGracePeriod:Duration.seconds(90),minHealthyPercent:100,maxHealthyPercent:200});
  const lb=new elbv2.ApplicationLoadBalancer(this,'AgentLoadBalancer',{vpc,internetFacing:true,vpcSubnets:{subnetType:ec2.SubnetType.PUBLIC},idleTimeout:Duration.seconds(180),dropInvalidHeaderFields:true});
  lb.addRedirect({sourcePort:80,targetPort:443});
  const listener=lb.addListener('Https',{port:443,certificates:[acm.Certificate.fromCertificateArn(this,'Certificate',c.certificateArn)],sslPolicy:elbv2.SslPolicy.RECOMMENDED_TLS});
  const group=listener.addTargets('AgentTarget',{port:8080,protocol:elbv2.ApplicationProtocol.HTTP,targets:[service],healthCheck:{path:'/health/ready',healthyHttpCodes:'200'},deregistrationDelay:Duration.seconds(30)});
  const policy=(actions,resources)=>task.addToTaskRolePolicy(new iam.PolicyStatement({actions,resources}));
  policy(['apprunner:DescribeService',...(c.enableWrites?['apprunner:StartDeployment']:[])],[c.appRunnerArn]);
  const amplifyArn=`arn:aws:amplify:${c.region}:${c.account}:apps/${c.amplifyAppId}/branches/${c.amplifyBranch}/jobs/*`;
  policy(['amplify:ListJobs',...(c.enableWrites?['amplify:StartJob']:[])],[amplifyArn,`arn:aws:amplify:${c.region}:${c.account}:apps/${c.amplifyAppId}/branches/${c.amplifyBranch}`]);
  policy(['rds:DescribeDBInstances'],[`arn:aws:rds:${c.region}:${c.account}:db:${c.rdsInstanceId}`]);
  policy(['cognito-idp:DescribeUserPool',...(c.enableWrites?['cognito-idp:AdminGetUser','cognito-idp:AdminDisableUser','cognito-idp:AdminEnableUser']:[])],[pool.userPoolArn]);
  policy(['s3:GetBucketVersioning','s3:GetBucketPublicAccessBlock'],[`arn:aws:s3:::${c.s3Bucket}`]);
  if(c.alarmNames.length)policy(['cloudwatch:DescribeAlarms'],c.alarmNames.map(name=>`arn:aws:cloudwatch:${c.region}:${c.account}:alarm:${name}`));
  new cloudwatch.Alarm(this,'AgentUnhealthy',{metric:group.metrics.unhealthyHostCount(),threshold:1,evaluationPeriods:2,treatMissingData:cloudwatch.TreatMissingData.BREACHING});
  new CfnOutput(this,'AgentUrl',{value:origin});
  new CfnOutput(this,'DnsCnameTarget',{value:lb.loadBalancerDnsName});
  new CfnOutput(this,'CognitoClientId',{value:client.userPoolClientId});
  new CfnOutput(this,'AgentSecurityGroupId',{value:taskSecurity.securityGroupId});
  new CfnOutput(this,'ClusterName',{value:cluster.clusterName});
  new CfnOutput(this,'ServiceName',{value:service.serviceName});
 }
}
