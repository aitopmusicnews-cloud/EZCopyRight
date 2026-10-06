import { Signer } from '@aws-sdk/rds-signer';
import { poolOptions } from './config.mjs';

export function databasePoolOptions(config, role='runtime', signerFactory=options=>new Signer(options)) {
  if(!config.DATABASE_IAM_AUTH) {
    return poolOptions(config,role==='reader'?config.APP_DATABASE_URL:config.DATABASE_URL);
  }
  const username=role==='reader'?config.APP_DATABASE_USER:config.DATABASE_RUNTIME_USER;
  const signer=signerFactory({region:config.AWS_REGION,hostname:config.DATABASE_HOST,port:config.DATABASE_PORT,username});
  return {
    host:config.DATABASE_HOST,
    port:config.DATABASE_PORT,
    database:config.DATABASE_NAME,
    user:username,
    password:()=>signer.getAuthToken(),
    max:5,
    connectionTimeoutMillis:10000,
    statement_timeout:15000,
    ssl:config.DATABASE_SSL==='true'?{rejectUnauthorized:true,...(config.DATABASE_CA?{ca:config.DATABASE_CA}:{})}:false,
  };
}
