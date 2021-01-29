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

export class ReportPublisher extends service.WebService {
    private ctpService: service.WebService;
    private metaData: ReportMetaData;

    constructor(
        endpoint: string, 
        context: string, 
        ctpService: service.WebService,
        metaData : ReportMetaData,
        authorization?: service.Authorization) 
    {
        super(endpoint, context, authorization)
        this.ctpService = ctpService;
        this.metaData = metaData;
    }
    

    uploadFile<T>(reportId: number): q.Promise<T>{
        let def = q.defer<T>();
        this.performGET('/api/v1.6/services').then((response: any) => {
            let dataCollectorURL = url.parse(response.services.dataCollectorV2);
            let form = new FormData();
            let protocol: 'https:' | 'http:' = dataCollectorURL.protocol === 'https:' ? 'https:' : 'http:';
            form.append('file', fs.createReadStream(`${reportId}/report.xml`));
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
                if (this.authorization && this.authorization['username']) {
                    options.auth = this.authorization['username'] + ':' + this.authorization['password'];
                }
            }
            core.info(`POST ${options.protocol}//${options.host}${options.port ? `:${options.port}` : ""}${options.path}`);
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

   public publishReport(reportId: number, index: number, environmentName?: string): q.Promise<void> {
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
                if (!fs.existsSync(`${reportId}`)){
                    fs.mkdirSync(`${reportId}`);
                }
                fs.appendFile(`${reportId}/report.xml`, fileData, (error) => {
                    if (error) {
                        core.error(`Error writing report.xml: ${error.message}`);
                        throw error;
                    }
                });
                return '';
            }).then(() => {
                core.info(`    View Report:  ${this.ctpService.getBaseURL()}/testreport/${reportId}/report.html`);
                this.uploadFile(reportId).then(response => {
                    core.info(`   report.xml file upload successful: ${response}`);
                    core.info(`   View Result in DTP: ${this.getBaseURL()}/dtp/explorers/test?buildId=${this.metaData.dtpBuildId}`);
                }).catch((error) => {
                    core.error(`Error while uploading report.xml file: ${error}`);
                });
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
