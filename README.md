#  Serverless SPA Plugin

A plugin for [Serverless Framework](https://serverless.com), to simplify deploying Single Page Application using S3 and CloudFront.

Based on the [official example](https://github.com/serverless/examples/tree/master/aws-node-single-page-app-via-cloudfront/serverless-single-page-app-plugin), with some important tweaks:

* Configurable app source directory
* Configurable stack output name to indicate the distribution id

## Instalation

Install the package with NPM or Yarn.

NPM:
```
npm install --save-dev @daniel-braga/serverless-spa-plugin
```

Yarn:
```
yarn add --dev @daniel-braga/serverless-spa-plugin
```


## Setup

Then register it in your serverless.yml file, as a plugin:

```
plugins:
  - @daniel-braga/serverless-spa-plugin
```

Set plugin variables:

```
custom:
  spa:
    appDir: dist
    appBucket: my.app.com
    distributionIdOutputKey: WebAppCloudFrontDistributionId
```

Finally, add appropriately-named resources (Origin Access Control, Bucket, BucketPolicy and Distribution) and Outputs:
```
service: 'my-webapp'
frameworkVersion: '3'

plugins:
  - serverless-spa-plugin

provider:
  name: 'aws'
  ...

custom:
  spa:
    appDir: dist
    appBucket: my.webapp.com
    distributionIdOutputKey: WebAppCloudFrontDistributionId

resources:
  Resources:

    WebAppCloudFrontOriginAccessControl:
      Type: AWS::CloudFront::OriginAccessControl
      Properties:
        OriginAccessControlConfig:
            Description: Origin Access Control to WebApp bucket
            Name: WebAppOAC
            OriginAccessControlOriginType: s3
            SigningBehavior: always
            SigningProtocol: sigv4

    WebAppS3Bucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: ${self:custom.spa.appBucket}
        AccessControl: PublicRead
        WebsiteConfiguration:
          IndexDocument: index.html
          ErrorDocument: index.html

    WebAppS3BucketPolicy:
      Type: AWS::S3::BucketPolicy
      Properties:
        Bucket:
          Ref: WebAppS3Bucket
        PolicyDocument:
          Statement:
            - Sid: AllowCloudFrontServicePrincipalReadOnly
              Action:
                - 's3:GetObject'
              Effect: Allow
              Resource:
                Fn::Join:
                  - ''
                  - - 'arn:aws:s3:::'
                    - Ref: WebAppS3Bucket
                    - /*
              Principal:
                Service: "cloudfront.amazonaws.com"
              Condition:
                StringEquals:
                  "aws:SourceArn":
                    - Fn::Join:
                      - ''
                      - - 'arn:aws:cloudfront::'
                        - Ref: AWS::AccountId
                        - ':distribution/'
                        - Ref: WebAppCloudFrontDistribution

    WebAppCloudFrontDistribution:
      Type: AWS::CloudFront::Distribution
      DependsOn:
        - WebAppS3Bucket
        - WebAppCloudFrontOriginAccessControl
      Properties:
        DistributionConfig:
          Aliases:
            - ${self:custom.spa.appBucket}
          ViewerCertificate:
            CloudFrontDefaultCertificate: 'true'
          Origins:
            - DomainName: ${self:custom.spa.appBucket}.s3.amazonaws.com
              Id: WebApp
              OriginAccessControlId: !Ref WebAppCloudFrontOriginAccessControl
              S3OriginConfig:
                OriginAccessIdentity: ''
          Enabled: 'true'
          DefaultRootObject: index.html
          CustomErrorResponses:
            - ErrorCode: 404
              ResponseCode: 200
              ResponsePagePath: /index.html
          DefaultCacheBehavior:
            AllowedMethods:
              - DELETE
              - GET
              - HEAD
              - OPTIONS
              - PATCH
              - POST
              - PUT
            TargetOriginId: WebApp
            ForwardedValues:
              QueryString: 'false'
              Cookies:
                Forward: none
            ViewerProtocolPolicy: redirect-to-https

  Outputs:

    WebAppCloudFrontDistributionId:
      Description: 'Cloudfront distribution ID'
      Value:
         Fn::GetAtt:
          - WebAppCloudFrontDistribution
          - Id

```

## Deploy

Warning: Whenever you making changes to CloudFront resource in serverless.yml the deployment might take a while e.g 20 minutes.

In order to deploy the Single Page Application you need to setup the infrastructure first by running

```
serverless deploy
```
The expected result should be similar to:


```
Serverless: Packaging service…
Serverless: Uploading CloudFormation file to S3…
Serverless: Uploading service .zip file to S3…
Serverless: Updating Stack…
Serverless: Checking Stack update progress…
...........................
Serverless: Stack update finished…

Service Information
service: serverless-simple-http-endpoint
stage: dev
region: us-east-1
api keys:
  None
endpoints:
  None
functions:
  None
```

After this step your S3 bucket and CloudFront distribution is setup. Now you need to upload your static file e.g. index.html and app.js to S3. You can do this by running

```
serverless syncToS3
```

The expected result should be similar to
```
Serverless: upload: dist/index.html to s3://my.webapp.com/index.html
Serverless: upload: dist/app.js to s3://my.webapp.com/app.js
Serverless: Successfully synced to the S3 bucket
```

Now you just need to figure out the deployed URL. You can use the AWS Console UI or run
```
sls domainInfo
```

The expected result should be similar to
```
Serverless: Web App Domain: dyj5gf0t6nqke.cloudfront.net
```

Visit the printed domain domain and navigate on the web site. It should automatically redirect you to HTTPS and visiting /about will not result in an error with the status code 404, but rather serves the index.html and renders the about page.

## Re-deploying
If you make changes to your Single Page Application you might need to invalidate CloudFront's cache to make sure new files are served. Meaning, run:

```
serverless syncToS3
```
To sync your files and then:

```
serverless invalidateCloudFrontCache
```