import * as core from '@actions/core';
import http from 'http';
import https from 'https';
import url from 'url';
import q from 'q';

export interface Authorization {
    username: string,
    password: string
}

export type DataHandler = (data: string )  => string;
export type Handler<T> = (res: http.IncomingMessage, def: q.Deferred<T>, responseStr: string)  => void;

export class WebService {
    private baseURL: url.Url;
    protected protocol: typeof https | typeof http;
    protected protocolLabel: string;
    protected authorization: Authorization;

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

    performTest(path : string) : Promise<string> {
        return new Promise((resolve, reject) => {
            resolve('value');
        })
    }

    performGET<T>(path: string, handler?: Handler<T>, dataHandler?: DataHandler): Promise<T> {
        let def = q.defer<T>();
        let promise = new Promise<T>((resolve, reject) => {
            def.resolve = resolve;
            def.reject = reject;
        });
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
        return promise;
    }

    getBaseURL(): string {
        return this.protocolLabel + '//' + this.baseURL.hostname +
            (this.baseURL.port ? ':' + this.baseURL.port : "") + this.baseURL.path;
    }

    performPUT<T>(path: string, data: object): Promise<T> {
        return this.performRequest(path, data, 'PUT');
    }

    performPOST<T>(path: string, data: object): Promise<T> {
        return this.performRequest(path, data, 'POST');
    }

    performRequest<T>(path: string, data: object, method: 'POST' | 'PUT'): Promise<T> {
        let def = q.defer<T>();
        let promise = new Promise<T>((resolve, reject) => {
            def.resolve = resolve;
            def.reject = reject;
        });
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
        return promise;
    }
}