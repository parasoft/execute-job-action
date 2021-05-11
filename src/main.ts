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
    var dtpAuthorization: service.Authorization = null;
    if (dtpEndpoint) {
        dtpAuthorization = { username: core.getInput('dtpUsername'), password: core.getInput('dtpPassword') };
    }
    const dtpProject = core.getInput('dtpProject');
    const dtpBuildId = core.getInput('buildId');
    let dtpSessionTag = core.getInput('sessionTag');
    const appendEnvironment = core.getInput('appendEnvironment') === 'true';
    if (dtpEndpoint && publish) {
        let metaData: report.ReportMetaData = {
            dtpProject: dtpProject,
            dtpBuildId: dtpBuildId,
            dtpSessionTag: dtpSessionTag,
            appendEnvironment : appendEnvironment
        }
        dtpService = new report.ReportPublisher(dtpEndpoint, 'grs', ctpService, metaData, dtpAuthorization);
    }
    const abortOnTimout = core.getInput('abortOnTimeout') === 'true';
    const timeout = core.getInput('timeoutInMinutes');
    const jobName = core.getInput('ctpJob', { required: true });
    let job: EMJob;
    ctpService.performGET<EMJob>('/api/v2/jobs', (res, def, responseStr) => {
        core.info(`    response ${res.statusCode}: ${responseStr}`);
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
        core.info(`Found job ${response.name} with id ${response.id}`);
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
                        core.setFailed('Job ' + jobName + ' timed out.');
                        return;
                    }
                }
                if (status === 'RUNNING' || status === 'WAITING') {
                    setTimeout(checkStatus, 1000);
                } else if (status === 'PASSED') {
                    core.info('Job ' + jobName + ' passed.');
                    if (dtpService) {
                        let environmentNames = extractEnvironmentNames(job);
                        res.reportIds.forEach((reportId, index) => {
                            dtpService.publishReport(reportId, index, environmentNames.length > 0 ? environmentNames.shift() : null).catch((err) => {
                                core.error("Failed to publish report to DTP");
                            }).then(() => {
                                if (index === 0) {
                                    console.log('   View results in DTP: ' + dtpService.getBaseURL() + '/dtp/explorers/test?buildId=' + dtpBuildId);
                                }
                            });
                        });
                        core.info(`   View results in DTP: ${this.getBaseURL()}/dtp/explorers/test?buildId=${this.metaData.dtpBuildId}`);
                    } else {
			    res.reportIds.forEach((reportId, index) => {
                                core.info(`    View report:  ${this.ctpService.getBaseURL()}/testreport/${reportId}/report.html`);
			    });
		    }
                } else if (status === 'CANCELED') {
                    core.warning('Job ' + jobName + ' canceled.');
                } else {
                    core.error('Job ' + jobName + ' failed.');
                    if (dtpService) {
                        res.reportIds.forEach((reportId, index) => {
                            core.info(`    report location: /testreport/${reportId}/report.xml`);
                            let environmentNames = extractEnvironmentNames(job);
                            dtpService.publishReport(reportId, index, environmentNames.length > 0 ? environmentNames.shift() : null).catch((err) => {
                                core.error("Failed to publish report to DTP");
                            }).then(() => {
                                if (index === 0) {
                                    console.log('   View results in DTP: ' + dtpService.getBaseURL() + '/dtp/explorers/test?buildId=' + dtpBuildId);
                                }
                            });
                        });
                    } else {
			    res.reportIds.forEach((reportId, index) => {
                                core.info(`    View report:  ${this.ctpService.getBaseURL()}/testreport/${reportId}/report.html`);
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
    })
}

run();
