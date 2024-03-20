const AWS = require('aws-sdk');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { CloudFormation } = require('@google-cloud/cloudfunctions');

class ServerlessDeployer {
  constructor(awsConfig, gcpConfig) {
    this.awsLambda = new AWS.Lambda({
      region: awsConfig.region,
      accessKeyId: awsConfig.accessKeyId,
      secretAccessKey: awsConfig.secretAccessKey,
    });
    this.gcpAuth = new google.auth.GoogleAuth({
      keyFile: gcpConfig.keyFilename,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.gcpProjectId = gcpConfig.projectId;
  }

  async deployToAWS(functionName, filePath) {
    const zipContents = fs.readFileSync(filePath);
    const params = {
      FunctionName: functionName,
      ZipFile: zipContents,
      Handler: 'index.handler',
      Role: 'execution-role-arn',
      Runtime: 'nodejs14.x',
      Publish: true,
    };

    try {
      await this.awsLambda.updateFunctionCode({ FunctionName: functionName, ZipFile: zipContents }).promise();
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        await this.awsLambda.createFunction(params).promise();
      } else {
        throw error;
      }
    }
  }

  async deployToGCP(functionName, filePath, entryPoint) {
    const authClient = await this.gcpAuth.getClient();
    const cloudfunctions = google.cloudfunctions({ version: 'v1', auth: authClient });
    const location = `projects/${this.gcpProjectId}/locations/us-central1`;
    const zipPath = `gs://your-bucket-name/${path.basename(filePath)}`;

    // Assume the zip file has been uploaded to GCS. This step is skipped for brevity.
    const requestBody = {
      name: `${location}/functions/${functionName}`,
      entryPoint: entryPoint,
      runtime: 'nodejs14',
      sourceArchiveUrl: zipPath,
      httpsTrigger: {},
    };

    try {
      await cloudfunctions.projects.locations.functions.patch({
        name: `${location}/functions/${functionName}`,
        requestBody,
      }).then(res => res.data);
    } catch (error) {
      if (error.code === 404) {
        await cloudfunctions.projects.locations.functions.create({
          location,
          requestBody,
        }).then(res => res.data);
      } else {
        throw error;
      }
    }
  }
}

module.exports = ServerlessDeployer;