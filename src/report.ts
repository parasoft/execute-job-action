import * as service from './service';
import q from 'q';
import FormData from 'form-data';
import fs from 'fs';
import url from 'url';
import * as core from '@actions/core';

export interface ReportMetaData {
    dtpBuildId: string,
    dtpSessionTag: string,
    dtpProject: string,
    appendEnvironment : boolean
}

export class ReportController {
    private ctpService: service.WebService;
    private dtpService: service.WebService;
    private metaData: ReportMetaData;

    constructor(
        ctpService: service.WebService,
        dtpService: service.WebService,
        metaData : ReportMetaData)
    {
        this.ctpService = ctpService;
        this.dtpService = dtpService;
        this.metaData = metaData;
    }
    

    uploadFile<T>(reportId: number): q.Promise<T> {
        let def = q.defer<T>();
        this.dtpService.performGET('/api/v1.6/services').then((response: any) => {
            let dataCollectorURL = url.parse(response.services.dataCollectorV2);
            let form = new FormData();
            let protocol: 'https:' | 'http:' = dataCollectorURL.protocol === 'https:' ? 'https:' : 'http:';
            form.append('file', fs.createReadStream(`target/parasoft/soatest/${reportId}/report.xml`));
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
                if (this.dtpService.authorization && this.dtpService.authorization['username']) {
                    options.auth = this.dtpService.authorization['username'] + ':' + this.dtpService.authorization['password'];
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

    public downloadReport(reportId: number, index: number, environmentName?: string): q.Promise<void> {
        let def = q.defer<void>(),
            firstCallback = true;
        this.ctpService.performGET(`/testreport/${reportId}/report.xml`, (res, def, responseStr) => {
            def.resolve(responseStr);
        },
            (response) => {
                let fileData = response;
                if (firstCallback) {
                    fileData = this.injectMetaData(fileData, index, this.metaData.appendEnvironment ? environmentName : null);
                    firstCallback = false;
                }
                if (!fs.existsSync('target')) {
                    fs.mkdirSync('target');
                }
                if (!fs.existsSync('target/parasoft')) {
                    fs.mkdirSync('target/parasoft');
                }
                if (!fs.existsSync('target/parasoft/soatest')) {
                    fs.mkdirSync('target/parasoft/soatest');
                }
                if (!fs.existsSync(`target/parasoft/soatest/${reportId}`)) {
                    fs.mkdirSync(`target/parasoft/soatest/${reportId}`);
                }
                try {
                    fs.appendFileSync(`target/parasoft/soatest/${reportId}/report.xml`, fileData);
                } catch (error) {
                    core.error(`Error writing report.xml: ${error.message}`);
                }
                return '';
            }).then(() => {
                core.info(`   Saved XML report: target/parasoft/soatest/${reportId}/report.xml`);
                core.info(`   View report in CTP:  ${this.ctpService.getBaseURL()}/testreport/${reportId}/report.html`);
                def.resolve();
            });
        return def.promise;
    }

    injectMetaData(source: string, index: number, environmentName?: string): string {
        let dtpSessionTag = this.metaData.dtpSessionTag;
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
        source = this.replaceAttributeValue(source, 'project', this.metaData.dtpProject);
        source = this.replaceAttributeValue(source, 'buildId', this.metaData.dtpBuildId);
        source = this.replaceAttributeValue(source, 'tag', dtpSessionTag);
        return this.replaceAttributeValue(source, 'execEnv', environmentName);
    }

    replaceAttributeValue(source: string, attribute: string, newValue: string): string {
        let regEx = new RegExp(attribute + '\=\"[^"]*\"');
        return source.replace(regEx, attribute + '="' + newValue + '"');
    }
}
