'use strict';

const spawnSync = require('child_process').spawnSync;

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.commands = {
      syncToS3: {
        usage: 'Deploys the `app` directory to your bucket',
        lifecycleEvents: [
          'sync',
        ],
      },
      distributionId: {
        usage: 'Fetches and prints out the deployed CloudFront distribution ID',
        lifecycleEvents: [
          'distributionId',
        ],
      },
      invalidateCloudFrontCache: {
        usage: 'Invalidates CloudFront cache',
        lifecycleEvents: [
          'invalidateCache',
        ],
      },
    };

    this.hooks = {
      'syncToS3:sync': this.syncDirectory.bind(this),
      'distributionId:distributionId': this.distributionId.bind(this),
      'invalidateCloudFrontCache:invalidateCache': this.invalidateCache.bind(
        this,
      ),
    };
  }

  runAwsCommand(args) {
    let command = 'aws';
    if (this.serverless.variables.service.provider.region) {
      command = `${command} --region ${this.serverless.variables.service.provider.region}`;
    }
    if (this.serverless.variables.service.provider.profile) {
      command = `${command} --profile ${this.serverless.variables.service.provider.profile}`;
    }
    const result = spawnSync(command, args, { shell: true });
    const stdout = result.stdout.toString();
    const sterr = result.stderr.toString();
    if (stdout) {
      this.serverless.cli.log(stdout);
    }
    if (sterr) {
      this.serverless.cli.log(sterr);
    }

    return { stdout, sterr };
  }

  // syncs the `app` directory to the provided bucket
  syncDirectory() {
    const appDir = this.serverless.variables.service.custom.spa.appDir;
    const appBucket = this.serverless.variables.service.custom.spa.appBucket;
    const args = [
      's3',
      'sync',
      `${appDir}/`,
      `s3://${appBucket}/`,
      '--delete',
    ];
    const { sterr } = this.runAwsCommand(args);
    if (!sterr) {
      this.serverless.cli.log('Successfully synced to the S3 bucket');
    } else {
      throw new Error('Failed syncing to the S3 bucket');
    }
  }

  async distributionId() {
    const provider = this.serverless.getProvider('aws');
    const stackName = provider.naming.getStackName(this.options.stage);
    const distributionIdOutputKey = this.serverless.variables.service.custom.spa.distributionIdOutputKey;

    const result = await provider.request(
      'CloudFormation',
      'describeStacks',
      { StackName: stackName },
      this.options.stage,
      this.options.region,
    );

    const outputs = result.Stacks[0].Outputs;
    const output = outputs.find(
      entry => entry.OutputKey === distributionIdOutputKey,
    );

    if (output && output.OutputValue) {
      this.serverless.cli.log(`CloudFront distribution ID: ${output.OutputValue}`);
      return output.OutputValue;
    }

    this.serverless.cli.log('CloudFront distribution ID: Not Found');
    const error = new Error('Could not extract CloudFront distribution ID');
    throw error;
  }

  async invalidateCache() {
    const provider = this.serverless.getProvider('aws');

    const distributionId = await this.distributionId();

    if (distributionId) {
      this.serverless.cli.log(
        `Invalidating CloudFront distribution with ID: ${distributionId}`,
      );
      const args = [
        'cloudfront',
        'create-invalidation',
        '--distribution-id',
        distributionId,
        '--paths',
        '/*',
      ];
      const { sterr } = this.runAwsCommand(args);
      if (!sterr) {
        this.serverless.cli.log('Successfully invalidated CloudFront cache');
      } else {
        throw new Error('Failed invalidating CloudFront cache');
      }
    } else {
      const message = `Could not find distribution with ID ${distributionId}`;
      const error = new Error(message);
      this.serverless.cli.log(message);
      throw error;
    }
  }
}

module.exports = ServerlessPlugin;
