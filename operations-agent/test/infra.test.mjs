import test from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Template,Match } from 'aws-cdk-lib/assertions';
import { readFileSync } from 'node:fs';
import { AgentStack } from '../infra/stack.mjs';
test('deployment uses isolated task, owner login, IAM DB auth and no production write IAM by default',()=>{
 const config=JSON.parse(readFileSync(new URL('../infra/config.example.json',import.meta.url)));
 Object.assign(config,{vpcId:'vpc-0123456789abcdef0',databaseSecurityGroupId:'sg-0123456789abcdef0',publicSubnetIds:['subnet-0123456789abcdef0','subnet-0123456789abcdef1'],rdsResourceId:'db-ABCDEFGHIJKLMNOP'});
 const stack=new AgentStack(new App(),'TestAgent',config);const template=Template.fromStack(stack);
 template.hasResourceProperties('AWS::ECS::Service',{DesiredCount:1,EnableExecuteCommand:false,NetworkConfiguration:{AwsvpcConfiguration:{AssignPublicIp:'ENABLED',Subnets:config.publicSubnetIds,SecurityGroups:Match.anyValue()}}});
 template.hasResourceProperties('AWS::ECS::TaskDefinition',{Cpu:'256',ContainerDefinitions:Match.arrayWith([Match.objectLike({ReadonlyRootFilesystem:true,Environment:Match.arrayWith([Match.objectLike({Name:'DATABASE_IAM_AUTH',Value:'true'})]),Secrets:Match.arrayWith([Match.objectLike({Name:'AGENT_SECRETS_JSON'})])})])});
 template.hasResourceProperties('AWS::Cognito::UserPoolClient',{GenerateSecret:false,AllowedOAuthFlows:['code']});
 const json=JSON.stringify(template.toJSON());
 assert.ok(json.includes('rds-db:connect'));assert.ok(json.includes('ez_agent_runtime'));assert.ok(json.includes('ez_agent_app_reader'));
 assert.ok(!json.includes('apprunner:StartDeployment'));assert.ok(!json.includes('s3:GetObject'));assert.ok(!json.includes('s3:DeleteObject'));assert.ok(!json.includes('cognito-idp:AdminDisableUser'));
});
