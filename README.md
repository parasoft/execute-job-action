<p align="center">
  <a href="https://github.com/parasoft/execute-job-action"><img alt="typescript-action status" src="https://github.com/actions/typescript-action/workflows/build-test/badge.svg"></a>
</p>

# Execute a Parasoft CTP Job

This action executes a test scenario job located at the specified Parasoft Continuous Testing Platform endpoint.

## Usage

Add the following entry to your Github workflow YAML file with the required inputs:

```yaml
uses: parasoft/execute-job-action@v1
with:
  ctpUrl: 'http://ctp.mycompany.org:8080/em/'
  ctpUsername: 'username'
  ctpPassword: ${{ secrets.password }}
  ctpJob: 'Example Job'
  abortOnTimeout: false
  timeoutInMinutes: 5
  publishReport: false
  dtpUrl: 'http://dtp.mycompany.org:8080/grs/'
  dtpUsername: 'username'
  dtpPassword: ${{ secrets.password }}
  dtpProject: 'My Project'
  buildId: ${{ github.run_number }}
  sessionTag: ${{ github.workflow }}
  appendEnvironment: false
```
### Required Inputs
The following inputs are required:
| Input | Description |
| --- | --- |
| `ctpURL` | Specifies the Continuous Testing Platform endpoint to use for executing the job. |
| `ctpUsername` | Specifies a user name for accessing the Continuous Testing Platform endpoint. |
| `ctpPassword` | Specifies a Github encrypted secret for accessing the Continuous Testing Platform endpoint. Refer to the [Encrypted Secrets Documentation](https://docs.github.com/en/actions/reference/encrypted-secrets) for details on how to create an encrypted secret. |
| `ctpJob` | Specifies the name of job to run. |

### Optional Inputs
The following inputs are optional:
| Input | Description |
| --- | --- |
| `abortOnTimeout` | Aborts a job when the execution time exceeds the specified timeout (see `timeoutInMinutes`). Set to `true` to enable. Default is `false`. |
| `timeoutInMinutes` | Specifies the maximum execution time in minutes allowed before the job is aborted. Include this option if `abortOnTimeout` is set to `true`. |
| `publishReport` | Enables test execution results to be published to Parasoft DTP. Set to `true` eanble. Default is `false`. |
| `dtpUrl` | Specfies the URL of the Parasoft DTP server where test execution reports will be published if `publishReport` is set to `true`. |
| `dtpUsername` | Specifies the user name for accessing Parasoft DTP server when publishing reports. Include this option if the target server requires authorization. |
| `dtpPassword` | Specifies the password for accessing Parasoft DTP server when publishing reports. Include this option if the target server requires authorization. |
| `dtpProject` | Specifies the name of the DTP project to associate with the test execution results. Include this option if `publishReport` is set to `true`. |
| `buildId` | Specifies the build identifier used to filter test results in DTP. Include this option if `publishReport` is set to `true`. |
| `sessionTag` | Specifies an identifier for the specific test execution session. Include this option if `publishReport` is set to `true`. |
| `appendEnvironment` | Adds a test variable test environment name to the session tag when publishing to DTP. This enables you to aggregate test data according to execution environment, which can be displayed in DTP widgets and reports. Set to `true` to enable. Default is `false`. |

## Build and Test this Action Locally

1. Install the dependencies:

```bash
$ npm install
```

2. Build the typescript and package it for distribution:

```bash
$ npm run build && npm run package
```

3. Run the tests: 

```bash
$ npm test

 PASS  ./index.test.js

...
```
