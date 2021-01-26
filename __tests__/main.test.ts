import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'

// shows how the runner will run a javascript action with env / stdout protocol
test('test runs', () => {
  process.env['INPUT_CTPURL'] = 'http://104.42.225.105/em'
  process.env['INPUT_CTPUSERNAME'] = 'admin'
  process.env['INPUT_CTPPASSWORD'] = 'admin'
  process.env['INPUT_CTPJOB'] = 'Status Job'
  process.env['INPUT_PUBLISHREPORT'] = 'true'
  process.env['INPUT_DTPURL'] = 'http://54.149.98.67:8080'
  process.env['INPUT_DTPUSERNAME'] = 'demo'
  process.env['INPUT_DTPPASSWORD'] = 'demo-user'
  process.env['INPUT_DTPPROJECT'] = 'Parabank_Master'
  process.env['INPUT_BUILDID'] = 'Parabank2021-01-21'
  process.env['INPUT_SESSIONTAG'] = 'Parabank-Github-Action'
  process.env['INPUT_APPENDENVIRONMENT'] = 'true'
  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  console.log(cp.execFileSync(np, [ip], options).toString())
})
