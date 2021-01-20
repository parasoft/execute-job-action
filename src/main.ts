/// <reference path="../typings/parasoft-em-api.d.ts" />

import * as core from '@actions/core';
import http from 'http';
import https from 'https';
import FormData from 'form-data';
import q from 'q';
import url from 'url';
import fs from 'fs';

interface Authorization {
    username: string,
    password: string
}

type DataHandler = (data: string )  => string;
type Handler<T> = (res: http.IncomingMessage, def: q.Deferred<T>, responseStr: string)  => void;

class WebService {
    private baseURL: url.Url;
    private protocol: typeof https | typeof http;
    private protocolLabel: string;
    private authorization: Authorization;

    constructor(endpoint: string, context: string, authorization?: Authorization) {
        this.baseURL = url.parse(endpoint);
        if (this.baseURL.path === '/') {
            this.baseURL.path += context;
        } else if (this.baseURL.path === `/${context}/`) {
            this.baseURL.path = `/${context}`;
        }
        this.authorization = authorization;
        this.protocol = this.baseURL.protocol === 'https:' ? https : http;
        this.protocolLabel = this.baseURL.protocol || 'http:';
    }

    performGET<T>(path: string, handler?: Handler<T>, dataHandler?: DataHandler): q.Promise<T> {
        let def = q.defer<T>();
        let options: http.RequestOptions = {
            host: this.baseURL.hostname,
            path: this.baseURL.path + path,
            auth: undefined,
            headers: {
                'Accept': 'application/json'
            }
        };
        if (this.baseURL.port) {
            options.port = parseInt(this.baseURL.port);
        }
        if (this.protocolLabel === 'https:') {
            options['rejectUnauthorized'] = false;
            options['agent'] = false;
        }
        if (this.authorization && this.authorization['username']) {
            options.auth = this.authorization['username'] + ':' + this.authorization['password'];
        }
        core.debug(`GET ${this.protocolLabel}//${options.host}${options.port ? `:${options.port}` : ""}${options.path}`);
        let responseString = "";
        this.protocol.get(options, (res) => {
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                if (dataHandler) {
                    responseString += dataHandler(chunk);
                } else {
                    responseString += chunk;
                }
            });
            res.on('end', () => {
                if (res.statusCode === 302) {
                    let redirectPath: string = res.headers.location;
                    if (redirectPath.startsWith(this.baseURL.path)) {
                        redirectPath = redirectPath.substring(3);
                    }
                    core.debug('    redirect to "' + redirectPath + '"');
                    this.performGET<T>(redirectPath, handler, dataHandler).then(response => def.resolve(response));
                } else if (handler) {
                    handler(res, def, responseString);
                } else {
                    core.debug(`   response ${res.statusCode}: ${responseString}`);
                    let responseObject = JSON.parse(responseString);
                    def.resolve(responseObject);
                }
            });
        }).on('error', (e) => {
            def.reject(e);
        });
        return def.promise;
    }

    getBaseURL(): string {
        return this.protocolLabel + '//' + this.baseURL.hostname +
            (this.baseURL.port ? ':' + this.baseURL.port : "") + this.baseURL.path;
    }

    performPUT<T>(path: string, data: object): q.Promise<T> {
        return this.performRequest(path, data, 'PUT');
    }

    performPOST<T>(path: string, data: object): q.Promise<T> {
        return this.performRequest(path, data, 'POST');
    }

    private performRequest<T>(path: string, data: object, method: 'POST' | 'PUT'): q.Promise<T> {
        let def = q.defer<T>();
        let options: http.RequestOptions = {
            host: this.baseURL.hostname,
            path: this.baseURL.path + path,
            method: method,
            auth: undefined,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        };
        if (this.baseURL.port) {
            options.port = parseInt(this.baseURL.port);
        }
        if (this.protocolLabel === 'https:') {
            options['rejectUnauthorized'] = false;
            options['agent'] = false;
        }
        if (this.authorization && this.authorization['username']) {
            options.auth = this.authorization['username'] + ':' + this.authorization['password'];
        }
        core.debug(`${method} ${this.protocolLabel}//${options.host}${options.port ? `:${options.port}`: ""}${options.path}`);
        let responseString = "";
        let req = this.protocol.request(options, (res) => {
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                responseString += chunk;
            });
            res.on('end', () => {
                core.debug(`    response ${res.statusCode}: ${responseString}`);
                let responseObject = JSON.parse(responseString);
                def.resolve(responseObject);
            });
        }).on('error', (e) => {
            def.reject(e);
        });
        req.write(JSON.stringify(data));
        req.end();
        return def.promise;
    }
}

const ctpEndpoint = core.getInput('ctpUrl', { required: true });
const ctpUsername = core.getInput('ctpUsername', { required: true });
const ctpPassword = core.getInput('ctpPassword', { required: true });
const ctpService = new WebService(ctpEndpoint, 'em', { username: ctpUsername, password: ctpPassword });
let dtpService = null;
const publish = core.getInput('publishReport') === 'true';
const dtpEndpoint = core.getInput('dtpUrl', { required: false });
var dtpAuthorization: Authorization = null;
if (dtpEndpoint) {
    dtpAuthorization = { username: core.getInput('dtpUsername'), password: core.getInput('dtpPassword') };
}
const dtpProject = core.getInput('dtpProject');
const dtpBuildId = core.getInput('buildId');
let dtpSessionTag = core.getInput('sessionTag');
const appendEnvironmentSet = core.getInput('appendEnvironmentSet') === 'true';
if (dtpEndpoint && publish) {
    dtpService = new WebService(dtpEndpoint, 'grs', dtpAuthorization);
}
const abortOnTimout = core.getInput('abortOnTimeout') === 'true';
const timeout = core.getInput('timeoutInMinutes');

function uploadFile<T>(): q.Promise<T>{
    let def = q.defer<T>();
    dtpService.performGET('/api/v1.6/services').then((response: any) => {
        let dataCollectorURL = url.parse(response.services.dataCollectorV2);
        let form = new FormData();
        let protocol: 'https:' | 'http:' = dataCollectorURL.protocol === 'https:' ? 'https:' : 'http:';
        form.append('file', fs.createReadStream('report.xml'));
        let options: FormData.SubmitOptions = {
            host: dataCollectorURL.hostname,
            port: parseInt(dataCollectorURL.port),
            path: dataCollectorURL.path,
            method: 'POST',
            protocol: protocol,
            headers: form.getHeaders()
        };
        if (protocol === 'https:') {
            options['rejectUnauthorized'] = false;
            options['agent'] = false;
            if (dtpAuthorization && dtpAuthorization['username']) {
                options.auth = dtpAuthorization['username'] + ':' + dtpAuthorization['password'];
            }
        }
        core.debug(`POST ${options.protocol}//${options.host}${options.port ? `:${options.port}` : ""}${options.path}`);
        form.submit(options, (err, res) => {
            if (err) {
                return def.reject(new Error(err.message));
            }
            if (res.statusCode < 200 || res.statusCode > 299) {
                return def.reject(new Error(`HTTP status code ${res.statusCode}`));
            }
            let body = [];
            res.on('data', (chunk) => body.push(chunk));
            res.on('end', () => {
                let resString: any = Buffer.concat(body).toString();
                def.resolve(resString);
            });
        });
    }).catch((error) => {
        def.reject(error);
    });
    return def.promise;
}

function replaceAttributeValue(source: string, attribute: string, newValue: string): string {
    let regEx = new RegExp(attribute + '\=\"[^"]*\"');
    return source.replace(regEx, attribute + '="' + newValue + '"');
}

function injectMetaData(source: string, index: number, environmentName?: string): string {
    if (environmentName) {
        if (dtpSessionTag == null) {
            dtpSessionTag = "";
        }
        if (dtpSessionTag.length != 0) {
            dtpSessionTag += '-';
        }
        dtpSessionTag += environmentName;
    } else if ((dtpSessionTag != null) && dtpSessionTag.length !== 0 && (index > 0)) {
        dtpSessionTag += `-${index + 1}`; // unique session tag in DTP for each report
    }
    source = replaceAttributeValue(source, 'project', dtpProject);
    source = replaceAttributeValue(source, 'buildId', dtpBuildId);
    source = replaceAttributeValue(source, 'tag', dtpSessionTag);
    return replaceAttributeValue(source, 'execEnv', environmentName);
}

function extractEnvironmentNames(job: EMJob): string[] {
    let separate = job.fork,
        lastTestId = null,
        environmentNames = [];
    job.testScenarioInstances.forEach((instance => {
        let testScenarioId = instance.testScenarioId,
            variableset = instance.variableSet;
        if (separate || (lastTestId == null || lastTestId === testScenarioId)) {
            environmentNames.push(variableset);
        }
        lastTestId = testScenarioId;
    }));
    return environmentNames;
}

function publishReport(reportId: number, index: number, environmentName?: string): q.Promise<void> {
    let def = q.defer<void>(),
        firstCallback = true;
    ctpService.performGET(`/testreport/${reportId}/report.xml`, (res, def, responseStr) => {
        def.resolve(responseStr);
    },
        (response) => {
            let fileData = response;
            if (firstCallback) {
                fileData = injectMetaData(fileData, index, appendEnvironmentSet ? environmentName : null);
                firstCallback = false;
            }
            fs.appendFile('report.xml', fileData, (error) => {
                if (error) {
                    core.error(`Error writing report.xml: ${error.message}`);
                    throw error;
                }
            });
            return '';
        }).then(() => {
            core.debug(`    View Report:  ${ctpService.getBaseURL()}/testreport/${reportId}/report.html`);
            uploadFile().then(response => {
                core.debug(`   report.xml file upload successful: ${response}`);
                core.debug(`   View Result in DTP: ${dtpService.getBaseURL()}/dtp/explorers/test?buildId=${dtpBuildId}`);
            }).catch((error) => {
                core.error(`Error while uploading report.xml file: ${error}`);
            });
        });
    return def.promise;
}

const jobName = core.getInput('ctpJob', { required: true });
let job: EMJob;
ctpService.performGET('/api/v2/jobs', (res, def, responseStr) => {
    core.debug(`    response ${res.statusCode}: ${responseStr}`);
    let allJobs: { jobs: EMJob[]} = JSON.parse(responseStr);
    if (typeof allJobs.jobs === 'undefined') {
        def.reject('jobs' + ' does not exist in response object from /api/v2/jobs');
        return;
    }
    let match = allJobs.jobs.find(job => job.name === jobName);
    if (match) {
        def.resolve(match);
        return;
    }
    def.reject(`Could not find name ${jobName } in jobs from /api/v2/jobs`);
}).then((response: EMJob) => {
    core.debug(`Found job ${response.name} with id ${response.id}`);
    job = response;
    return ctpService.performPOST<EMJobHistory>(`/api/v2/jobs/${job.id}/histories?async=true`, {});
}).then((res: EMJobHistory) => {
    let historyId = res.id;
    let status = res.status;
    let startTime = new Date().getTime();
    let checkStatus = function (): void {
        ctpService.performGET<EMJobHistory>(`/api/v2/jobs/${job.id}/histories/${historyId}`).then((res: EMJobHistory) => {
            status = res.status;
            if (abortOnTimout) {
                let timespent = (new Date().getTime() - startTime) / 60000,
                    timeoutNum = parseInt(timeout);
                if (timespent > timeoutNum) {
                    ctpService.performPUT(`/api/v2/jobs/${job.id}/histories/${historyId}`, { status: 'CANCELED' });
                    core.error(`Test execution job timed out after ${timeoutNum} minute"${timeoutNum > 1 ? 's' : ""}.`);
                    core.setFailed('Job ' + jobName + ' timed out.');
                    return;
                }
            }
            if (status === 'RUNNING' || status === 'WAITING') {
                setTimeout(checkStatus, 1000);
            } else if (status === 'PASSED') {
                core.debug('Job ' + jobName + ' passed.');
                if (dtpService) {
                    let environmentNames = extractEnvironmentNames(job);
                    res.reportIds.forEach((reportId, index) => {
                        core.debug(`    report location: /testreport/${reportId}/report.xml`);
                        publishReport(reportId, index, environmentNames.length > 0 ? environmentNames.shift() : null).catch(() => {
                            core.error("Failed to publish report to DTP");
                        });
                    });
                }
            } else if (status === 'CANCELED') {
                core.warning('Job ' + jobName + ' canceled.');
            } else {
                core.error('Job ' + jobName + ' failed.');
                if (dtpService) {
                    res.reportIds.forEach((reportId, index) => {
                        core.debug(`    report location: /testreport/${reportId}/report.xml`);
                        let environmentNames = extractEnvironmentNames(job);
                        publishReport(reportId, index, environmentNames.length > 0 ? environmentNames.shift() : null).catch(() => {
                            core.error("Failed to publish report to DTP");
                        });
                    });
                }
                core.setFailed('Job ' + jobName + ' failed.');
            }
        });
    };
    if (status === 'RUNNING' || status === 'WAITING') {
        setTimeout(checkStatus, 1000);
    }
}).catch((e) => {
    core.error(e);
    core.setFailed(e);
});
