import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'
import * as core from '@actions/core';
import * as main from '../src/main';
import * as service from '../src/service';
import q from 'q';
import http from 'http';

const jobsResponse =  {"jobs":[{"context":{},"fork":false,"id":20,"name":"fake-job","testConfiguration":"","testScenarioInstances":[{"dataGroups":[{"active":"${NUMBER_SET}","id":"ds_-54812465_1551241335538_1013998772"}],"id":12,"priority":0,"testScenarioId":4,"variableSet":"Smoke Test","variables":[{"key":"ENDPOINT","type":"active"},{"key":"NUMBER_SET","type":"active"},{"key":"PASSWORD","type":"active"},{"key":"USERNAME","type":"active"},{"key":"WSDL","type":"active"}]}]},{"context":{},"fork":false,"id":20,"name":"Parabank Job","testConfiguration":"","testScenarioInstances":[{"dataGroups":[],"id":18,"priority":0,"testScenarioId":5,"variables":[{"key":"ACCOUNT","type":"active"},{"key":"BASEURL","type":"active"},{"key":"SWAGGER","type":"active"}]}]}]};
const jobHistoryResponse_WAITING = {"context":{},"id":12,"jobId":20,"jobName":"Parabank Job","status":"WAITING","testExecutionIds":[],"testHistories":[],"username": ""}
const jobHistoryResponse_RUNNING = {"context":{},"id":12,"jobId":20,"jobName":"Parabank Job","startTime":1610748281466,"status":"RUNNING","testExecutionIds":["801757114"],"testHistories":[],"username": ""}
const jobHistoryResponse_SUCCESS = {"completionTime":1610748286577,"context":{},"id":12,"jobId":20,"jobName":"Parabank Job","reportIds":[69],"startTime":1610748281466,"status":"PASSED","testExecutionIds":["801757114"],"testHistories":[{"instanceId":18,"name":"Parabank","reportId":69,"status":"PASSED","testScenarioId":5}],"username":""}

test('test basic execute job scenario', () => {
    jest.spyOn(core, 'getInput').mockImplementation((val) => {
        if (val === 'ctpUrl') {
            return 'https://fake-ctp-endpoint:8080/em/'
        } else if (val === 'ctpUsername' || val === 'ctpPassword') {
            return 'admin';
        } else if ('ctpJob') {
            return 'fake-job'
        }
    });
    jest.spyOn(service.WebService.prototype, 'performPOST').mockImplementation((path, data) => {
        let def = q.defer();
        let promise = new Promise((resolve, reject) => {
            def.resolve = resolve;
            def.reject = reject;
        });
        console.log('mock-performPOST invoked');
        if (path === '/api/v2/jobs/20/histories?async=true') {
            var res = new http.IncomingMessage(null);
            res.statusCode = 200;
            def.resolve(jobHistoryResponse_SUCCESS);
        }
        return promise
    });
    jest.spyOn(service.WebService.prototype, 'performGET').mockImplementation((path, handler, dataHandler) => {
        let def = q.defer();
        let promise = new Promise((resolve, reject) => {
            def.resolve = resolve;
            def.reject = reject;
        });
        console.log('mock-performGET invoked');
        if (path === '/api/v2/jobs') {
            let res = new http.IncomingMessage(null);
            res.statusCode = 200;
            handler(res, def, JSON.stringify(jobsResponse));
        }
        return promise;
    });
    main.run();
});

// // shows how the runner will run a javascript action with env / stdout protocol
// test('test runs', () => {
//   process.env['INPUT_CTPURL'] = 'http://104.42.225.105/em'
//   process.env['INPUT_CTPUSERNAME'] = 'admin'
//   process.env['INPUT_CTPPASSWORD'] = 'admin'
//   process.env['INPUT_CTPJOB'] = 'Status Job'
//   process.env['INPUT_PUBLISHREPORT'] = 'true'
//   process.env['INPUT_DTPURL'] = 'http://54.149.98.67:8080'
//   process.env['INPUT_DTPUSERNAME'] = 'demo'
//   process.env['INPUT_DTPPASSWORD'] = 'demo-user'
//   process.env['INPUT_DTPPROJECT'] = 'Parabank_Master'
//   process.env['INPUT_BUILDID'] = 'Parabank2021-01-21'
//   process.env['INPUT_SESSIONTAG'] = 'Parabank-Github-Action'
//   process.env['INPUT_APPENDENVIRONMENTSET'] = 'true'
//   const np = process.execPath
//   const ip = path.join(__dirname, '..', 'lib', 'main.js')
//   const options: cp.ExecFileSyncOptions = {
//     env: process.env
//   }
//   console.log(cp.execFileSync(np, [ip], options).toString())
// })
