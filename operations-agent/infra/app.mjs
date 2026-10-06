import { App } from 'aws-cdk-lib';
import { readFileSync } from 'node:fs';
import { AgentStack } from './stack.mjs';
const path=process.env.AGENT_INFRA_CONFIG || 'infra/config.json';
const c=JSON.parse(readFileSync(path,'utf8'));
if(JSON.stringify(c).includes('REPLACE'))throw new Error('Replace deployment placeholders before synthesis or deployment');
if(c.publicSubnetIds.length<2||c.publicSubnetIds.length!==c.availabilityZones.length)throw new Error('Provide public subnets in at least two matching availability zones');
new AgentStack(new App(),'EZCopyrightAgent',c);
