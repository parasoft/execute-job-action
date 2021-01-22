<p align="center">
  <a href="https://github.com/parasoft/execute-job-action"><img alt="typescript-action status" src="https://github.com/actions/typescript-action/workflows/build-test/badge.svg"></a>
</p>

# Execute a Parasoft CTP Job

This action allows you to execute a job located at a specified Parasoft Continous Testing Platform endpoint.

## Usage

Add the following to your github workflow yml file with the required inputs.
Password will use a github encrypted secret. Please reference [Encrypted Secrets Documentation](https://docs.github.com/en/actions/reference/encrypted-secrets) on how to create an encrypted secret.

```yaml
uses: parasoft/execute-job-action@v1
with:
  ctpUrl: 'http://exampleUrl'
  ctpUsername: 'username'
  ctpPassword: ${{ secrets.password }}
  ctpJob: 'Example Job'
```

### Additional optional inputs include:

**abortOnTimeout:** 
   Job will be aborted when execution time exceeds the specified timeout\
   Use 'true' to set this flag. Defaulted to 'false' if excluded

**timeoutInMinutes:**
   Allowed execution time mesaured in minutes before the job is aborted\
   Include this option if abortOnTimeout is set to 'true'

**publishReport:**
   Publish test execution results to Parasoft Development Testing Platform\
   Use 'true' to set this flag. Defaulted to 'false' if excluded

**dtpUrl:**
   The URL to the Parasoft Development Testing Platform where the report will be published\
   Include this option if publishReport is set to 'true'

**dtpUsername:**
   Username to the Parasoft Development Testing Plaform server\
   Include this option if the target server requires authorization

**dtpPassword:**
   Password to the Parasoft Development Testing Plaform server\
   Include this option if the target server requires authorization

**dtpProject:**
  DTP Project associated with the job execution\
  Include this option if publishReport is set to 'true'

**buildId:**
  Build identifier used to filter test results in DTP\
  Include this option if publishReport is set to 'true'

**sessionTag:**
  The username of the data repository server\
  Include this option if publishReport is set to 'true'

**appendEnvironmentSet:**
  Append environment set environment to session tag if configured\
  Use 'true' to set this flag. Default to false if excluded. Include this option if publishReport is set to 'true'

## Build and test this action locally

Install the dependencies  
```bash
$ npm install
```

Build the typescript and package it for distribution
```bash
$ npm run build && npm run package
```

Run the tests
```bash
$ npm test

 PASS  ./index.test.js

...
```