import {spawnSync} from 'node:child_process'
import {mkdirSync,existsSync} from 'node:fs'
mkdirSync('certs',{recursive:true})
if(existsSync('certs/localhost-key.pem')||existsSync('certs/localhost.pem'))throw new Error('Certificado existente. Não será sobrescrito.')
const openssl=process.env.OPENSSL || (existsSync('C:/Program Files/Git/usr/bin/openssl.exe')?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl')
const r=spawnSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout','certs/localhost-key.pem','-out','certs/localhost.pem','-days','365','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'inherit',windowsHide:true})
if(r.error)throw r.error
if(r.status)process.exit(r.status)
