/// <reference path="../typings/parasoft-em-api.d.ts" />

import * as core from '@actions/core';
import * as service from './service';
import * as report from './report'

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

export async function run() {
    const ctpEndpoint = core.getInput('ctpUrl', { required: true });
    const ctpUsername = core.getInput('ctpUsername', { required: true });
    const ctpPassword = core.getInput('ctpPassword', { required: true });
    const ctpService = new service.WebService(ctpEndpoint, 'em', { username: ctpUsername, password: ctpPassword });
    let dtpService = null;
    const publish = core.getInput('publishReport') === 'true';
    const dtpEndpoint = core.getInput('dtpUrl', { required: false });
    const dtpProject = core.getInput('dtpProject');
    const dtpBuildId = core.getInput('buildId');
    let dtpSessionTag = core.getInput('sessionTag');
    const appendEnvironment = core.getInput('appendEnvironment') === 'true';
    let metaData: report.ReportMetaData = {
        dtpProject: dtpProject,
        dtpBuildId: dtpBuildId,
        dtpSessionTag: dtpSessionTag,
        appendEnvironment : appendEnvironment
    }
    if (dtpEndpoint && publish) {
        dtpService = new service.WebService(dtpEndpoint, 'grs', { username: core.getInput('dtpUsername'), password: core.getInput('dtpPassword') });
    }
    let reportController = new report.ReportController(ctpService, dtpService, metaData);
    const abortOnTimout = core.getInput('abortOnTimeout') === 'true';
    const timeout = core.getInput('timeoutInMinutes');
    const jobName = core.getInput('ctpJob', { required: true });
    let job: EMJob;
    ctpService.performGET<EMJob>('/api/v2/jobs', (res, def, responseStr) => {
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
        core.info(`Executing "${response.name}" on ${ctpService.getBaseURL()}`);
        job = response;
        return ctpService.performPOST<EMJobHistory>(`/api/v2/jobs/${job.id}/histories?async=true`, {});
    }).then((res: EMJobHistory) => {
        let historyId = res.id;
        let status = res.status;
        let startTime = new Date().getTime();
        let checkStatus = async function (): Promise<void> {
            ctpService.performGET<EMJobHistory>(`/api/v2/jobs/${job.id}/histories/${historyId}`).then((res: EMJobHistory) => {
                status = res.status;
                if (abortOnTimout) {
                    let timespent = (new Date().getTime() - startTime) / 60000,
                        timeoutNum = parseInt(timeout);
                    if (timespent > timeoutNum) {
                        ctpService.performPUT(`/api/v2/jobs/${job.id}/histories/${historyId}`, { status: 'CANCELED' });
                        core.error(`Test execution job timed out after ${timeoutNum} minute"${timeoutNum > 1 ? 's' : ""}.`);
                        core.setFailed('Job "' + jobName + '" timed out.');
                        return;
                    }
                }
                if (status === 'RUNNING' || status === 'WAITING') {
                    setTimeout(checkStatus, 1000);
                } else if (status === 'CANCELED') {
                    core.warning('Test execution was canceled.');
                } else {
                    if (status === 'PASSED') {
                        core.info('All tests passed.');
                    } else {
                        core.setFailed('Some tests failed.');
                    }
                    let environmentNames = extractEnvironmentNames(job);
                    res.reportIds.forEach((reportId, index) => {
                        let downloadPromise = reportController.downloadReport(reportId, index, environmentNames.length > 0 ? environmentNames.shift() : null).catch((err) => {
                                core.error("Failed to download report from CTP");
			    });
                        if (dtpService) {
                            downloadPromise.then(() => {
		                reportController.uploadFile(reportId).then(response => {
                                    core.debug(`   report.xml file upload successful: ${response}`);
                                    if (index === 0) {
                                        core.info('   View results in DTP: ' + dtpService.getBaseURL() + '/dtp/explorers/test?buildId=' + dtpBuildId);
				    }
                                }).catch((error) => {
                                    core.error(`Error while uploading report.xml file: ${error}`);
                                    core.error("Failed to publish report to DTP");
                                });
                            });
                        }
		    });
                }
            });
        };
        if (status === 'RUNNING' || status === 'WAITING') {
            setTimeout(checkStatus, 1000);
        }
    }).catch((e) => {
        core.error(e);
        core.setFailed(e);
    })
}

run();
